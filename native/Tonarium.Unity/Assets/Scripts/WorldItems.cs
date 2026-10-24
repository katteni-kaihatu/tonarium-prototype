using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.Video;

namespace Tonarium.UnityClient
{
    public sealed partial class TonariumWorld
    {
        readonly Dictionary<string, string> canvasColors = new Dictionary<string, string>();
        readonly Dictionary<string, float> canvasSizes = new Dictionary<string, float>();
        readonly HashSet<string> nativeOpenItems = new HashSet<string>();

        void SetNativeOpenItems(JArray ids)
        {
            nativeOpenItems.Clear();
            if (ids != null) foreach (var id in ids) nativeOpenItems.Add((string)id);
            // 同じ動画をネイティブ画面でも開いた場合、音を二重に再生しない。
            foreach (var pair in itemObjects)
                if (items.TryGetValue(pair.Key, out var item) && (string)item["kind"] == "video")
                    foreach (var audio in pair.Value.GetComponentsInChildren<AudioSource>()) audio.volume = nativeOpenItems.Contains(pair.Key) ? 0 : .5f;
        }

        void ApplyItem(JObject item)
        {
            if (item == null || item["id"] == null) return;
            string id = (string)item["id"], kind = (string)item["kind"];
            if (kind == "canvas") PreserveCanvasPreview(id, item);
            items[id] = item;
            if ((kind == "image" || kind == "video" || kind == "youtube") && itemObjects.TryGetValue(id, out var mediaRoot)
                && mediaRoot.GetComponent<ItemMediaIdentity>() is ItemMediaIdentity mediaIdentity && mediaIdentity.Matches(item))
            {
                mediaRoot.transform.position = Position(item);
                mediaRoot.transform.rotation = Quaternion.Euler(0, -Float(item, "ry") * Mathf.Rad2Deg, 0);
                mediaRoot.GetComponentInChildren<ItemMediaPlayback>()?.SetClock(item["clock"] as JObject, serverOffset);
                return;
            }
            // 描画差分のたびに板を捨てると入力と表示が途切れる。
            if (kind == "canvas" && itemObjects.TryGetValue(id, out var existing) && existing.GetComponentInChildren<ItemPanelSurface>() is ItemPanelSurface surface)
            {
                existing.transform.position = Position(item);
                existing.transform.rotation = Quaternion.Euler(0, -Float(item, "ry") * Mathf.Rad2Deg, 0);
                PaintCanvas(surface, item); return;
            }
            RemoveItemObject(id);
            var root = new GameObject("Item " + id);
            root.transform.position = Position(item); root.transform.rotation = Quaternion.Euler(0, -Float(item, "ry") * Mathf.Rad2Deg, 0);
            root.AddComponent<WorldTarget>().Id = id; root.AddComponent<ItemResources>(); itemObjects[id] = root;
            switch (kind)
            {
                case "hammer": BuildHammer(root.transform, item); break;
                case "camera": BuildCameraItem(root.transform, item); break;
                case "chess": case "chessAi": BuildChess(root.transform, item); break;
                case "dice": BuildDice(root.transform, item); break;
                case "note": BuildNote(root.transform, item); break;
                case "canvas": BuildCanvasPanel(root.transform, item); break;
                case "g2048": Build2048Panel(root.transform, item); break;
                case "image": case "video": case "youtube": BuildMediaBoard(root.transform, item); break;
            }
            if (kind == "hammer" || kind == "camera")
            {
                string holder = (string)item["holder"];
                if (holder == selfId) held = id; else if (held == id) held = null;
            }
        }

        void PreserveCanvasPreview(string id, JObject next)
        {
            if (!items.TryGetValue(id, out var current) || ReferenceEquals(current, next) || !(current["strokes"] is JArray local)) return;
            // 移動や再同期の全体更新でも、まだ返っていない自分の線を巻き戻さない。
            if (canvasEchoes.ContainsKey(id + ":canvasClear")) { next["strokes"] = local.DeepClone(); return; }
            var strokes = next["strokes"] as JArray;
            if (strokes == null) { strokes = new JArray(); next["strokes"] = strokes; }
            foreach (var stroke in local.OfType<JObject>())
            {
                string strokeId = (string)stroke["id"];
                if ((string)stroke["by"] != selfId || !(canvasEchoes.ContainsKey(id + ":" + strokeId) || canvasItem == id && canvasStroke == strokeId)) continue;
                var saved = strokes.OfType<JObject>().LastOrDefault(s => (string)s["id"] == strokeId && (string)s["by"] == selfId);
                if (saved == null) strokes.Add(stroke.DeepClone());
                else if ((stroke["pts"] as JArray)?.Count > (saved["pts"] as JArray)?.Count) saved["pts"] = stroke["pts"].DeepClone();
            }
        }

        void BuildNote(Transform root, JObject item)
        {
            Cylinder(root, "Note stem", new Vector3(0, .45f, 0), .03f, .9f, "#78716c");
            Box(root, "Note", new Vector3(0, 1.5f, 0), new Vector3(1.6f, 1.2f, .04f), (string)item["color"] ?? "#fde68a");
            string text = (string)item["text"];
            var front = TextOnBoard(root, string.IsNullOrEmpty(text) ? "（空の付箋）" : text, 512, 384, 1.6f, 1.2f, 1.5f, 28, 28, 64, string.IsNullOrEmpty(text) ? "#78716c" : "#1c1917", true);
            var back = Instantiate(front.gameObject, root); back.name = "Note text back";
            foreach (var line in back.GetComponentsInChildren<ItemDepthText>()) line.Configure(font);
            back.transform.localPosition = new Vector3(-front.transform.localPosition.x, front.transform.localPosition.y, .024f); back.transform.localRotation = Quaternion.Euler(0, 180, 0);
            string editor = (string)item["editingBy"];
            if (!string.IsNullOrEmpty(editor) && editor != selfId)
                ItemBadge(root, ((string)users.OfType<JObject>().FirstOrDefault(u => (string)u["id"] == editor)?["name"] ?? editor) + " が編集中", new Vector3(0, 2.2f, 0), .12f, "#b91c1c");
        }

        void BuildHammer(Transform root, JObject item)
        {
            bool heldItem = item["holder"]?.Type == JTokenType.String;
            var model = new GameObject("Hammer model"); model.transform.SetParent(root, false);
            if (!heldItem) { model.transform.localPosition = ToUnity(new Vector3(0, .12f, .3f)); model.transform.localRotation = Quaternion.Euler(90, 0, 0); }
            ItemCylinder(model.transform, "Yellow handle", new Vector3(0, .28f, 0), .025f, .03f, .56f, "#facc15", 10);
            var head = Cylinder(model.transform, "Red hammer head", new Vector3(0, .6f, 0), .1f, .22f, "#ef4444"); head.transform.localRotation = Quaternion.Euler(90, 0, 0);
            foreach (float z in new[] { -.13f, .13f }) { var end = Cylinder(model.transform, "Yellow hammer end", new Vector3(0, .6f, z), .11f, .05f, "#fde047"); end.transform.localRotation = Quaternion.Euler(90, 0, 0); }
            if (!heldItem) { var hit = root.gameObject.AddComponent<BoxCollider>(); hit.center = new Vector3(0, .15f, 0); hit.size = new Vector3(.5f, .3f, .9f); }
        }

        void BuildCameraItem(Transform root, JObject item)
        {
            bool heldItem = item["holder"]?.Type == JTokenType.String; float y = heldItem ? 0 : 1.5f;
            if (!heldItem) for (int i = 0; i < 3; i++)
            {
                float a = i / 3f * Mathf.PI * 2;
                var leg = Cylinder(root, "Tripod", new Vector3(Mathf.Sin(a) * .18f, .7f, Mathf.Cos(a) * .18f), .015f, 1.4f, "#3f3f46");
                leg.transform.localRotation = Quaternion.Euler(-Mathf.Cos(a) * .15f * Mathf.Rad2Deg, 0, -Mathf.Sin(a) * .15f * Mathf.Rad2Deg);
            }
            var model = new GameObject("Camera model"); model.transform.SetParent(root, false); model.transform.localPosition = Vector3.up * y; model.transform.localRotation = Quaternion.Euler(-Float(item, "pitch") * Mathf.Rad2Deg, 0, 0);
            Box(model.transform, "Camera", Vector3.zero, new Vector3(.24f, .15f, .12f), "#27272a");
            var lens = ItemCylinder(model.transform, "Lens", new Vector3(0, 0, -.09f), .045f, .05f, .07f, "#52525b", 16); lens.transform.localRotation = Quaternion.Euler(90, 0, 0);
            Sphere(model.transform, "Recording lamp", new Vector3(.08f, .05f, -.061f), Vector3.one * .024f, (bool?)item["live"] == true ? "#ef4444" : "#3f3f46");
            var hit = root.gameObject.AddComponent<BoxCollider>(); hit.center = new Vector3(0, y, 0); hit.size = new Vector3(.45f, .3f, .4f);
        }

        void BuildChess(Transform root, JObject item)
        {
            Box(root, "Chess table", new Vector3(0, .75f, 0), new Vector3(1.9f, .06f, 1.9f), "#5b3a1e");
            foreach (float x in new[] { -.85f, .85f }) foreach (float z in new[] { -.85f, .85f }) Box(root, "Chess table leg", new Vector3(x, .36f, z), new Vector3(.08f, .72f, .08f), "#4a2f18");
            var board = item["board"] as JArray;
            for (int i = 0; i < 64; i++)
            {
                float x = (i % 8 - 3.5f) * .2f, z = (i / 8 - 3.5f) * .2f;
                bool last = item["last"] is JArray lastMove && lastMove.Any(n => (int)n == i);
                string color = last ? ((i / 8 + i % 8) % 2 == 0 ? "#cdd26a" : "#aaa23a") : (i / 8 + i % 8) % 2 == 0 ? "#f0d9b5" : "#b58863";
                var square = Box(root, "Square " + i, new Vector3(x, .79f, z), new Vector3(.2f, .02f, .2f), color); square.AddComponent<ChessSquare>().Index = i;
                string code = board != null && i < board.Count ? (string)board[i] : null; if (string.IsNullOrEmpty(code)) continue;
                var piece = new GameObject("Chess " + code); piece.transform.SetParent(root, false); piece.transform.localPosition = ToUnity(new Vector3(x, .8f, z));
                string pc = code[0] == 'w' ? "#f5f5f4" : "#27272a"; char t = code[1]; float h = t == 'P' ? .13f : t == 'R' ? .16f : t == 'N' ? .18f : t == 'B' ? .2f : t == 'Q' ? .23f : .26f;
                ItemCylinder(piece.transform, "Base", new Vector3(0, .02f, 0), .07f, .075f, .04f, pc, 16);
                ItemCylinder(piece.transform, "Stem", new Vector3(0, .04f + (h - .06f) / 2, 0), .035f, .055f, h - .06f, pc, 12);
                if (t == 'P' || t == 'Q') Sphere(piece.transform, "Crown", new Vector3(0, h, 0), Vector3.one * (t == 'P' ? .09f : .12f), pc);
                if (t == 'R') ItemCylinder(piece.transform, "Turret", new Vector3(0, h, 0), .06f, .055f, .06f, pc, 8);
                if (t == 'B') ItemCylinder(piece.transform, "Bishop", new Vector3(0, h, 0), 0, .045f, .1f, pc, 12);
                if (t == 'N') Box(piece.transform, "Knight", new Vector3(0, h, .02f), new Vector3(.05f, .1f, .09f), pc).transform.localRotation = Quaternion.Euler(.5f * Mathf.Rad2Deg, 0, 0);
                if (t == 'K') { Box(piece.transform, "King crown", new Vector3(0, h, 0), new Vector3(.025f, .1f, .025f), pc); Box(piece.transform, "King cross", new Vector3(0, h + .015f, 0), new Vector3(.07f, .025f, .025f), pc); }
                foreach (var collider in piece.GetComponentsInChildren<Collider>()) collider.gameObject.AddComponent<ChessSquare>().Index = i;
            }
            bool black = ((string)item["chess"]?["fen"] ?? "").Split(' ').Skip(1).FirstOrDefault() == "b";
            ItemBadge(root, (string)item["kind"] == "chessAi" && black ? "AIが考えています…" : black ? "黒の手番" : "白の手番", new Vector3(0, 1.5f, 0), .17f);
            ItemBadge(root, (string)item["kind"] == "chessAi" ? "白：みんな / 黒：AI" : "手番の駒は誰でも操作できます", new Vector3(0, 1.28f, 0), .09f);
            var reset = Box(root, "New chess game", new Vector3(0, .78f, 1.12f), new Vector3(.8f, .08f, .25f), "#476b8c"); reset.AddComponent<ItemActionTarget>().Action = "chessReset";
            ItemBadge(root, "新しい対局", new Vector3(0, .92f, 1.12f), .08f);
        }

        void BuildMediaBoard(Transform root, JObject item)
        {
            string kind = (string)item["kind"];
            root.gameObject.AddComponent<ItemMediaIdentity>().Configure(item);
            float aspect = kind == "youtube" ? 16f / 9 : Mathf.Max(.01f, Float(item, "w", 16)) / Mathf.Max(.01f, Float(item, "h", 9));
            float width = 1.8f, height = width / aspect; if (height > 1.3f) { height = 1.3f; width = height * aspect; }
            var face = BuildBoard(root, width, height, 1.6f, 0, 0);
            if (kind == "image") StartCoroutine(LoadImage(face.gameObject, (string)item["url"]));
            if (kind == "youtube")
            {
                StartCoroutine(LoadImage(face.gameObject, "https://i.ytimg.com/vi/" + (string)item["videoId"] + "/hqdefault.jpg"));
                string title = (string)item["title"] ?? "";
                ItemBadge(root, "YouTube" + (title.Length > 0 ? "：" + title.Substring(0, Math.Min(30, title.Length)) : ""), new Vector3(0, 1.6f + height / 2 + .18f, 0), .16f);
            }
            if (kind == "video")
            {
                var video = face.gameObject.AddComponent<VideoPlayer>(); video.playOnAwake = false; video.url = MediaUrl((string)item["url"]);
                video.renderMode = VideoRenderMode.MaterialOverride; video.targetMaterialRenderer = face.GetComponent<Renderer>(); video.targetMaterialProperty = "_MainTex";
                video.isLooping = false; video.audioOutputMode = VideoAudioOutputMode.AudioSource;
                var audio = face.gameObject.AddComponent<AudioSource>(); audio.spatialBlend = 1; audio.minDistance = 2; audio.maxDistance = 15; video.SetTargetAudioSource(0, audio);
                audio.volume = nativeOpenItems.Contains((string)item["id"]) ? 0 : .5f;
                var badge = ItemBadge(root, "動画（クリックで再生）", new Vector3(0, 1.6f + height / 2 + .18f, 0), .16f);
                face.gameObject.AddComponent<ItemMediaPlayback>().Configure(video, badge.GetComponentInChildren<TextMesh>(), item["clock"] as JObject, serverOffset);
                video.Prepare();
            }
        }

        string MediaUrl(string url) => string.IsNullOrEmpty(url) ? serverUrl : Uri.TryCreate(url, UriKind.Absolute, out _) ? url : serverUrl + url;
        IEnumerator LoadImage(GameObject panel, string url)
        {
            using (var request = UnityWebRequestTexture.GetTexture(MediaUrl(url)))
            {
                yield return request.SendWebRequest();
                if (panel == null) yield break;
                var surface = panel.GetComponent<ItemPanelSurface>();
                if (request.result != UnityWebRequest.Result.Success) { if (surface != null) surface.ImageLoadFailed = true; yield break; }
                var texture = DownloadHandlerTexture.GetContent(request); if (surface != null) surface.Texture = texture; texture.anisoLevel = 4; panel.GetComponent<Renderer>().material.mainTexture = texture; panel.GetComponentInParent<ItemResources>()?.Textures.Add(texture);
            }
        }

        bool InteractItemSurface(WorldTarget target, RaycastHit hit)
        {
            if (!items.TryGetValue(target.Id, out var item)) return false;
            var action = hit.collider.GetComponent<ItemActionTarget>();
            if (action != null) { Room(new { t = "itemAction", id = target.Id, action = new { a = action.Action } }); return true; }
            string kind = (string)item["kind"];
            if (kind == "youtube") { OpenNativeItem(target.Id); return true; }
            if (kind == "video")
            {
                var playback = itemObjects[target.Id].GetComponentInChildren<ItemMediaPlayback>();
                if (playback != null && playback.Failed) { OpenNativeItem(target.Id); return true; }
                bool ended = playback != null && playback.Ended;
                Room(new { t = "itemAction", id = target.Id, action = new { a = !ended && (bool?)item["clock"]?["playing"] == true ? "mediaPause" : "mediaPlay", pos = ended ? 0 : MediaTime(item) } });
                return true;
            }
            var surface = hit.collider.GetComponent<ItemPanelSurface>(); if (surface == null) return false; var p = surface.Point(hit);
            if (kind == "g2048")
            {
                if (InRect(p, 324, 18, 96, 36)) Room(new { t = "itemAction", id = target.Id, action = new { a = "reset2048" } });
                string[] dirs = { "left", "up", "down", "right" };
                for (int i = 0; i < 4; i++) if (InRect(p, 20 + i * 102, 500, 92, 72)) Room(new { t = "itemAction", id = target.Id, action = new { a = "slide", dir = dirs[i] } }); return true;
            }
            if (kind != "canvas") return false;
            for (int i = 0; i < CanvasPalette.Length; i++) if (InRect(p, 16 + i * 40, 13, 32, 32)) canvasColors[target.Id] = CanvasPalette[i];
            if (InRect(p, 272, 12, 44, 34)) canvasSizes[target.Id] = 3;
            if (InRect(p, 320, 12, 44, 34)) canvasSizes[target.Id] = 10;
            if (InRect(p, 370, 12, 92, 34)) canvasColors[target.Id] = CanvasPenColor(target.Id) == "erase" ? CanvasPalette[0] : "erase";
            if (InRect(p, 544, 12, 84, 34)) SendCanvasAction(target.Id, new JObject { ["a"]="canvasClear" });
            if (InRect(p, 468, 12, 70, 34)) SaveCanvas(item);
            PaintCanvasToolbar(surface, item); return true;
        }
        bool TryCanvasPoint(RaycastHit hit, out string id, out Vector2 point)
        {
            id = null; point = default; var surface = hit.collider.GetComponent<ItemPanelSurface>(); var target = hit.collider.GetComponentInParent<WorldTarget>();
            if (surface == null || target == null || !items.TryGetValue(target.Id, out var item) || (string)item["kind"] != "canvas") return false;
            var p = surface.Point(hit); if (!InRect(p, 10, 58, 620, 450)) return false;
            id = target.Id; point = new Vector2(Mathf.Floor(p.x - 10 + .5f), Mathf.Floor(p.y - 58 + .5f)); return true;
        }
        string CanvasPenColor(string id) => canvasColors.TryGetValue(id, out var color) ? color : "#111111";
        float CanvasPenSize(string id) => CanvasPenColor(id) == "erase" ? 28 : canvasSizes.TryGetValue(id, out var size) ? size : 3;
        static bool InRect(Vector2 p, float x, float y, float w, float h) => p.x >= x && p.x < x + w && p.y >= y && p.y < y + h;
        void SaveCanvas(JObject item)
        {
            var pixels = new ItemRaster(1240, 900, "#ffffff"); PaintStrokesScaled(pixels, item, 0, 0, 2); var tex = pixels.Texture();
            Room(new { t = "chat", text = "🎨 キャンバスを保存しました", image = "data:image/jpeg;base64," + Convert.ToBase64String(tex.EncodeToJPG(85)), scope = "all" }); Destroy(tex);
        }
        void RemoveItemObject(string id) { if (itemObjects.TryGetValue(id, out var old)) { old.SetActive(false); Destroy(old); } itemObjects.Remove(id); }
        void RemoveItem(string id) { if (id == null) return; RemoveItemObject(id); items.Remove(id); canvasColors.Remove(id); canvasSizes.Remove(id); if (selected == id) selected = null; if (held == id) held = null; }
        double MediaTime(JObject item) => Float(item["clock"] as JObject, "base") + ((bool?)item["clock"]?["playing"] == true ? Math.Max(0, Now - ((double?)item["clock"]?["at"] ?? Now)) / 1000 : 0);

        void OpenNativeItem(string id)
        {
            Unlock(); selected = null;
            if (bridge.Connected) bridge.Send(new { t = "openItem", id });
            else notice = "この操作はネイティブアプリのアイテム画面で利用できます";
        }
    }

    public sealed class ItemMediaIdentity : MonoBehaviour
    {
        string kind, asset;
        float width, height;
        public void Configure(JObject item) { kind = (string)item["kind"]; asset = (string)(item["url"] ?? item["videoId"]); width = (float?)item["w"] ?? 16; height = (float?)item["h"] ?? 9; }
        public bool Matches(JObject item) => kind == (string)item["kind"] && asset == (string)(item["url"] ?? item["videoId"])
            && width == ((float?)item["w"] ?? 16) && height == ((float?)item["h"] ?? 9);
    }

    public sealed class ItemMediaPlayback : MonoBehaviour
    {
        VideoPlayer player;
        TextMesh label;
        double baseTime, at, offset;
        bool playing;
        bool seekPending = true;
        bool waitingForPausedFrame, previousMute;
        double pausedTarget;
        AudioSource audio;
        float nextSync;
        public bool Failed { get; private set; }
        public bool Ended => player != null && player.isPrepared && player.length > 0 && ClockPosition() >= player.length - .2;
        public void Configure(VideoPlayer value, TextMesh caption, JObject clock, double serverOffset)
        {
            player = value; label = caption;
            player.waitForFirstFrame = true;
            audio = value.GetComponent<AudioSource>();
            player.prepareCompleted += Prepared;
            player.errorReceived += Error;
            player.frameReady += FrameReady;
            SetClock(clock, serverOffset);
        }
        public void SetClock(JObject clock, double serverOffset)
        {
            double nextBase = Math.Max(0, (double?)clock?["base"] ?? 0), nextAt = (double?)clock?["at"] ?? 0;
            bool nextPlaying = (bool?)clock?["playing"] == true;
            if (nextBase != baseTime || nextAt != at || nextPlaying != playing) seekPending = true;
            baseTime = nextBase; at = nextAt; playing = nextPlaying; offset = serverOffset; Sync();
        }
        double ClockPosition() => baseTime + (playing ? Math.Max(0, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + offset - at) / 1000 : 0);
        void Prepared(VideoPlayer value) => Sync();
        void FrameReady(VideoPlayer value, long frame)
        {
            if (!waitingForPausedFrame || playing) return;
            double tolerance = value.frameRate > 0 ? 1.5 / value.frameRate : .08;
            double frameTime = value.frameRate > 0 ? frame / value.frameRate : value.time;
            if (Math.Abs(frameTime - pausedTarget) > tolerance) return;
            value.Pause(); RestorePausedAudio();
        }
        void RestorePausedAudio()
        {
            if (waitingForPausedFrame && audio != null) audio.mute = previousMute;
            waitingForPausedFrame = false;
            if (player != null) player.sendFrameReadyEvents = false;
        }
        void Error(VideoPlayer value, string error) { Failed = true; if (label != null) label.text = "動画を開くにはクリック"; }
        void Update() { if (Time.unscaledTime >= nextSync) { nextSync = Time.unscaledTime + .3f; Sync(); } }
        void Sync()
        {
            if (player == null || Failed) return;
            if (label != null) label.text = playing && !Ended ? "▶ 動画（クリックで一時停止）" : "❚❚ 動画（クリックで再生）";
            if (!player.isPrepared) return;
            double target = ClockPosition();
            bool ended = player.length > 0 && target >= player.length;
            if (player.length > 0) target = Math.Min(target, Math.Max(0, player.length - .001));
            // 移動や時計更新ではプレイヤーを作り直さず、ずれた位置だけ合わせる。
            // 明示的なシークは短い移動も反映し、同じ時計の定期同期だけ許容差を使う。
            if (seekPending || Math.Abs(player.time - target) > .8)
            {
                if (!playing || ended)
                {
                    if (!waitingForPausedFrame && audio != null) { previousMute = audio.mute; audio.mute = true; }
                    waitingForPausedFrame = true; pausedTarget = target; player.sendFrameReadyEvents = true;
                    // 停止中のシークも一枚だけデコードしてから止める。
                    player.Play();
                }
                else RestorePausedAudio();
                player.time = target;
            }
            seekPending = false;
            if (playing && !ended) { RestorePausedAudio(); if (!player.isPlaying) player.Play(); }
            else if (player.isPlaying && !waitingForPausedFrame) player.Pause();
        }
        void OnDestroy() { RestorePausedAudio(); if (player != null) { player.prepareCompleted -= Prepared; player.errorReceived -= Error; player.frameReady -= FrameReady; } }
    }
}
