using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Video;

namespace Tonarium.UnityClient
{
    public sealed class ItemBehaviorProbe : MonoBehaviour
    {
        IEnumerator Start()
        {
            yield return null;
            string output = Path.Combine(Application.persistentDataPath, "item-behavior");
            var args = Environment.GetCommandLineArgs();
            for (int i = 0; i + 1 < args.Length; i++) if (args[i] == "--tonarium-output") output = args[i + 1];
            Directory.CreateDirectory(output);
            var checks = new List<string>();
            try
            {
                var flags = BindingFlags.NonPublic | BindingFlags.Instance;
                var world = GetComponent<TonariumWorld>();
                var bridge = GetComponent<DesktopBridge>();
                var writerField = typeof(DesktopBridge).GetField("writer", flags);
                var connectionField = typeof(DesktopBridge).GetField("connection", flags);
                var previousWriter = writerField.GetValue(bridge); var previousConnection = connectionField.GetValue(bridge);
                var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
                using (var connection = new TcpClient())
                using (var memory = new MemoryStream())
                using (var writer = new StreamWriter(memory, new UTF8Encoding(false)) { AutoFlush = true })
                {
                    connection.Connect((IPEndPoint)listener.LocalEndpoint);
                    using (var peer = listener.AcceptTcpClient())
                    {
                        connectionField.SetValue(bridge, connection); writerField.SetValue(bridge, writer);
                        try
                        {
                            Action<string, object[]> call = (name, values) => typeof(TonariumWorld).GetMethod(name, flags).Invoke(world, values);
                            Action<JObject> apply = value => call("ApplyItem", new object[] { value });
                            Func<JArray> sent = () => new JArray(Encoding.UTF8.GetString(memory.ToArray()).Split(new[] { '\n' }, StringSplitOptions.RemoveEmptyEntries).Select(JObject.Parse));
                            Func<string, JObject> item = kind => new JObject { ["id"] = "behavior-" + kind, ["kind"] = kind, ["x"] = 0, ["z"] = -2, ["ry"] = 0 };

                            var note = item("note"); note["text"] = "before"; note["color"] = "#fde68a"; apply(note);
                            call("BeginNoteEditing", new object[] { (string)note["id"] });
                            typeof(TonariumWorld).GetField("noteDraft", flags).SetValue(world, "編集した付箋");
                            call("EndNoteEditing", new object[0]);
                            var actions = sent().OfType<JObject>().Where(m => (string)m["t"] == "room").Select(m => m["message"]?["action"] as JObject).Where(a => a != null).ToArray();
                            if (actions.Length != 3 || (string)actions[0]["a"] != "noteLock" || (bool?)actions[0]["lock"] != true || (string)actions[1]["text"] != "編集した付箋" || (bool?)actions[2]["lock"] != false)
                                throw new InvalidOperationException("Note lock/edit/unlock emission failed.");
                            checks.Add("付箋のロック・変更・解除を順に送信");
                            var imageItem = item("image"); imageItem["url"] = "file:///nonexistent-tonarium-probe.png"; apply(imageItem);
                            call("BeginImageViewing", new object[] { (string)imageItem["id"] });
                            if ((string)typeof(TonariumWorld).GetField("selected", flags).GetValue(world) != (string)imageItem["id"] || sent().Any(m => (string)m["t"] == "openItem"))
                                throw new InvalidOperationException("Note/image unexpectedly delegated to native UI.");
                            call("EndNoteEditing", new object[0]);
                            checks.Add("付箋と画像は別窓を開かずUnity内で操作");

                            string self = (string)typeof(TonariumWorld).GetField("selfId", flags).GetValue(world);
                            var dice = item("dice");
                            dice["roll"] = new JObject { ["id"] = "private-roll", ["by"] = self, ["count"] = 2, ["sides"] = 6, ["secret"] = true, ["results"] = null, ["at"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - 2000 };
                            apply(dice);
                            call("RecordDiceChat", new object[] { new JObject { ["dice"] = new JObject { ["id"] = "private-roll", ["results"] = new JArray(6, 3) } } });
                            var diceLabels = GameObject.Find("Item " + (string)dice["id"]).GetComponentsInChildren<TextMesh>(true).Select(t => t.text).ToArray();
                            if (!diceLabels.Any(t => t.Contains("= 9") && t.Contains("あなただけ"))) throw new InvalidOperationException("Own secret dice result was not restored from chat.");
                            var otherDice = (JObject)dice.DeepClone(); otherDice["id"] = "behavior-other-dice"; otherDice["roll"]["by"] = "other"; apply(otherDice);
                            if (GameObject.Find("Item behavior-other-dice").GetComponentsInChildren<TextMesh>(true).Any(t => t.text.Contains("= 9"))) throw new InvalidOperationException("Secret dice result was shown for another participant.");
                            checks.Add("本人の秘密の出目だけチャットから復元");

                            call("OpenDiceItem", new object[] { "behavior-dice" });
                            var youtube = item("youtube"); youtube["videoId"] = "abcdefghijk";
                            youtube["clock"] = new JObject { ["playing"] = false, ["base"] = 0, ["at"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }; apply(youtube);
                            var youtubeTarget = GameObject.Find("Item " + (string)youtube["id"]).GetComponent<WorldTarget>();
                            var youtubeSurface = youtubeTarget.GetComponentInChildren<ItemPanelSurface>();
                            Physics.SyncTransforms();
                            if (!youtubeSurface.GetComponent<Collider>().Raycast(new Ray(youtubeSurface.transform.position - youtubeSurface.transform.forward * 2, youtubeSurface.transform.forward), out var youtubeHit, 3))
                                throw new InvalidOperationException("YouTube board raycast missed.");
                            call("InteractItemSurface", new object[] { youtubeTarget, youtubeHit });
                            if (!sent().Any(m => (string)m["t"] == "openItem" && (string)m["id"] == "behavior-dice") || !sent().Any(m => (string)m["t"] == "openItem" && (string)m["id"] == "behavior-youtube"))
                                throw new InvalidOperationException("Native dice/YouTube panel dispatch failed.");
                            checks.Add("サイコロ設定とYouTube再生をネイティブ画面へ渡す");

                            var video = item("video"); video["url"] = "http://127.0.0.1:1/probe.mp4"; video["w"] = 16; video["h"] = 9;
                            video["clock"] = new JObject { ["playing"] = false, ["base"] = 2, ["at"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }; apply(video);
                            var videoRoot = GameObject.Find("Item " + (string)video["id"]); var player = videoRoot.GetComponentInChildren<VideoPlayer>(); player.Stop();
                            var changed = (JObject)video.DeepClone(); changed["x"] = 2; changed["clock"]["base"] = 4; changed["clock"]["playing"] = true; apply(changed);
                            var playback = videoRoot.GetComponentInChildren<ItemMediaPlayback>();
                            if (GameObject.Find("Item " + (string)video["id"]) != videoRoot || videoRoot.GetComponentInChildren<VideoPlayer>() != player || videoRoot.transform.position.x != 2
                                || (double)typeof(ItemMediaPlayback).GetField("baseTime", flags).GetValue(playback) != 4)
                                throw new InvalidOperationException("Media update replaced player or lost clock.");
                            checks.Add("動画の移動・時計更新で同じVideoPlayerを維持");
                            var seekPending = typeof(ItemMediaPlayback).GetField("seekPending", flags);
                            seekPending.SetValue(playback, false);
                            var shortSeek = (JObject)changed.DeepClone(); shortSeek["clock"]["base"] = 4.25; shortSeek["clock"]["playing"] = false; apply(shortSeek);
                            if (!(bool)seekPending.GetValue(playback)) throw new InvalidOperationException("Short explicit seek was not scheduled.");
                            seekPending.SetValue(playback, false); apply((JObject)shortSeek.DeepClone());
                            if ((bool)seekPending.GetValue(playback)) throw new InvalidOperationException("Unchanged clock forced a seek.");
                            checks.Add("0.25秒の明示的シークを反映し、同じ時計では強制シークしない");
                            var audio = videoRoot.GetComponentInChildren<AudioSource>();
                            call("Receive", new object[] { new JObject { ["t"] = "nativeItems", ["ids"] = new JArray((string)video["id"]) } });
                            if (audio.volume != 0) throw new InvalidOperationException("Native media window did not mute duplicate Unity audio.");
                            call("Receive", new object[] { new JObject { ["t"] = "nativeItems", ["ids"] = new JArray() } });
                            if (Mathf.Abs(audio.volume - .5f) > .001f) throw new InvalidOperationException("Closing native media window did not restore Unity audio.");
                            checks.Add("ネイティブ動画画面の開閉でUnity音声をミュート・復帰");

                            var canvas = item("canvas"); canvas["strokes"] = new JArray(new JObject { ["id"] = "ink", ["by"] = "preview", ["color"] = "#ef4444", ["size"] = 10, ["pts"] = new JArray(20, 20, 600, 430) });
                            apply(canvas); call("SaveCanvas", new object[] { canvas });
                            var saved = sent().OfType<JObject>().Last(m => (string)m["message"]?["text"] == "🎨 キャンバスを保存しました");
                            var data = ((string)saved["message"]["image"]).Split(',')[1];
                            CheckJpeg(Convert.FromBase64String(data), 1240, 900); checks.Add("キャンバスを1240×900のJPEGで保存");

                            var cam = item("camera"); cam["holder"] = null; cam["pitch"] = .1; cam["live"] = true; cam["operator"] = self; apply(cam);
                            var capture = typeof(TonariumWorld).GetMethod("CaptureItemCamera", flags);
                            byte[] photo = (byte[])capture.Invoke(world, new object[] { cam, 1280, 720, 85 }); CheckJpeg(photo, 1280, 720); File.WriteAllBytes(Path.Combine(output, "camera-scene.jpg"), photo);
                            var cam2 = (JObject)cam.DeepClone(); cam2["id"] = "behavior-camera-2"; cam2["x"] = 3; cam2["ry"] = 1; apply(cam2);
                            call("UpdateCameraCapture", new object[0]);
                            var frames = sent().OfType<JObject>().Where(m => (string)m["t"] == "cameraFrame").ToArray();
                            if (frames.Length != 2 || frames.Select(m => (string)m["id"]).Distinct().Count() != 2) throw new InvalidOperationException("Both live cameras did not emit frames.");
                            foreach (var frame in frames) CheckJpeg(Convert.FromBase64String((string)frame["jpeg"]), 640, 360);
                            if (frames[0]["jpeg"].ToString() == frames[1]["jpeg"].ToString()) throw new InvalidOperationException("Different camera poses produced identical images.");
                            checks.Add("実シーンの写真1280×720と2台のライブ640×360を送信");
                            foreach (var frame in frames) { frame["jpegBytes"] = Convert.FromBase64String((string)frame["jpeg"]).Length; frame.Remove("jpeg"); }
                            File.WriteAllText(Path.Combine(output, "item-behavior.json"), new JObject { ["ok"] = true, ["checks"] = new JArray(checks), ["cameraFrames"] = new JArray(frames), ["videoDecodeTested"] = false }.ToString());
                        }
                        finally { writerField.SetValue(bridge, previousWriter); connectionField.SetValue(bridge, previousConnection); listener.Stop(); }
                    }
                }
                Debug.Log("TONARIUM_ITEM_BEHAVIOR_SUCCESS " + output); Application.Quit();
            }
            catch (Exception error)
            {
                File.WriteAllText(Path.Combine(output, "item-behavior.json"), new JObject { ["ok"] = false, ["error"] = error.ToString(), ["checks"] = new JArray(checks) }.ToString());
                Debug.LogException(error); Application.Quit(1);
            }
        }
        static void CheckJpeg(byte[] bytes, int width, int height)
        {
            var texture = new Texture2D(2, 2, TextureFormat.RGB24, false);
            try
            {
                if (!texture.LoadImage(bytes) || texture.width != width || texture.height != height) throw new InvalidOperationException("JPEG dimensions invalid.");
                if (texture.GetPixels32().Select(p => (p.r << 16) | (p.g << 8) | p.b).Distinct().Take(2).Count() < 2) throw new InvalidOperationException("Rendered image is blank.");
            }
            finally { Destroy(texture); }
        }
    }
}
