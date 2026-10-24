using System;
using System.IO;
using System.Reflection;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Tonarium.UnityClient
{
    [DefaultExecutionOrder(32000)]
    public sealed class HudInputProbe : MonoBehaviour
    {
        string output;
        TonariumWorld world;
        bool preedit;
        float nextWrite;
        void Start()
        {
            var args = Environment.GetCommandLineArgs();
            int index = Array.IndexOf(args, "--tonarium-output");
            if (index < 0 || index + 1 == args.Length) { enabled = false; return; }
            output = args[index + 1]; Directory.CreateDirectory(output);
            world = GetComponent<TonariumWorld>();
        }
        void LateUpdate()
        {
            preedit |= !string.IsNullOrEmpty(Input.compositionString);
            if (Time.unscaledTime < nextWrite) return;
            nextWrite = Time.unscaledTime + .05f;
            var flags = BindingFlags.Instance | BindingFlags.NonPublic;
            object Field(string name) => typeof(TonariumWorld).GetField(name, flags).GetValue(world);
            string commandPath = Path.Combine(output, "hud-command.json");
            if (File.Exists(commandPath))
            {
                var item = JObject.Parse(File.ReadAllText(commandPath)); File.Delete(commandPath);
                string kind = (string)item["kind"];
                if (kind == "note" || kind == "image")
                {
                    typeof(TonariumWorld).GetMethod("ApplyItem", flags).Invoke(world, new object[] { item });
                    typeof(TonariumWorld).GetMethod(kind == "note" ? "BeginNoteEditing" : "BeginImageViewing", flags).Invoke(world, new object[] { (string)item["id"] });
                }
            }
            var selected = Field("selected") as string;
            var surface = selected == null ? null : GameObject.Find("Item " + selected)?.GetComponentInChildren<ItemPanelSurface>();
            var json = JsonConvert.SerializeObject(new {
                selected, noteDraft = Field("noteDraft"), imageZoom = Field("imageZoom"), imageLoaded = surface != null && surface.Texture != null,
                unity = Application.unityVersion, draft = Field("draft"), chatOpen = Field("chatOpen"),
                menu = Field("menu"), world = world.WorldKind, composition = Input.compositionString,
                preedit, focused = Application.isFocused, cursor = Cursor.lockState.ToString(),
                mouseX = Input.mousePosition.x, mouseY = Input.mousePosition.y, width = Screen.width, height = Screen.height
            });
            File.WriteAllText(Path.Combine(output, "hud-state.tmp"), json);
            if (File.Exists(Path.Combine(output, "hud-state.json"))) File.Replace(Path.Combine(output, "hud-state.tmp"), Path.Combine(output, "hud-state.json"), null);
            else File.Move(Path.Combine(output, "hud-state.tmp"), Path.Combine(output, "hud-state.json"));
        }
    }
}
