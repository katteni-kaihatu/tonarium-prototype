using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Tonarium.UnityClient
{
    public sealed partial class TonariumWorld
    {
        static readonly string[] CanvasPalette = { "#111111", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7" };
        static readonly Dictionary<int, string> TileColors = new Dictionary<int, string> { { 0, "#3a3c42" }, { 2, "#eee4da" }, { 4, "#ede0c8" }, { 8, "#f2b179" }, { 16, "#f59563" }, { 32, "#f67c5f" }, { 64, "#f65e3b" }, { 128, "#edcf72" }, { 256, "#edcc61" }, { 512, "#edc850" }, { 1024, "#edc53f" }, { 2048, "#edc22e" } };

        ItemPanelSurface BuildBoard(Transform root, float width, float height, float y, int pixelWidth, int pixelHeight)
        {
            float stem = y - height / 2;
            Cylinder(root, "Board stem", new Vector3(0, stem / 2, 0), .04f, stem, "#4e5058");
            Box(root, "Board frame", new Vector3(0, y, -.03f), new Vector3(width + .08f, height + .08f, .04f), "#1e1f22");
            var face = ItemPlane(root, "Board surface", new Vector3(0, y, 0), width, height, "#111111", true);
            var surface = face.AddComponent<ItemPanelSurface>(); surface.PixelWidth = pixelWidth; surface.PixelHeight = pixelHeight; return surface;
        }

        GameObject ItemPlane(Transform root, string name, Vector3 at, float width, float height, string color, bool collider)
        {
            var go = new GameObject(name); go.transform.SetParent(root, false); go.transform.localPosition = ToUnity(at);
            var mesh = new Mesh { name = name + " mesh" };
            mesh.vertices = new[] { new Vector3(-width / 2, -height / 2, 0), new Vector3(-width / 2, height / 2, 0), new Vector3(width / 2, height / 2, 0), new Vector3(width / 2, -height / 2, 0) };
            mesh.uv = new[] { Vector2.zero, Vector2.up, Vector2.one, Vector2.right };
            mesh.triangles = new[] { 0, 1, 2, 0, 2, 3 }; mesh.RecalculateNormals(); mesh.RecalculateBounds();
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mat = new Material(Shader.Find(ColorValue(color).a < .999f ? "Unlit/Transparent" : "Unlit/Texture")); mat.mainTexture = Texture2D.whiteTexture;
            // Unlit/Texture は tint を持たないので、単色もテクスチャで Web の値を維持する。
            var fill = new Texture2D(1, 1); fill.SetPixel(0, 0, ColorValue(color)); fill.Apply(); mat.mainTexture = fill;
            go.AddComponent<MeshRenderer>().sharedMaterial = mat;
            var resources = root.GetComponentInParent<ItemResources>(); if (resources != null) { resources.Meshes.Add(mesh); resources.Textures.Add(fill); }
            if (collider) go.AddComponent<MeshCollider>().sharedMesh = mesh;
            return go;
        }

        void SetSurface(ItemPanelSurface surface, ItemRaster raster)
        {
            if (surface.Texture == null)
            {
                surface.Texture = raster.Texture(); surface.GetComponent<Renderer>().sharedMaterial.mainTexture = surface.Texture;
                surface.GetComponentInParent<ItemResources>()?.Textures.Add(surface.Texture);
            }
            else raster.Apply(surface.Texture);
        }

        TextMesh TextOnBoard(Transform root, string text, int pw, int ph, float width, float height, float y, float x, float top, int size, string color, bool wrap = false, bool center = false)
        {
            string[] lines = null;
            if (wrap)
            {
                font.RequestCharactersInTexture(text, size);
                var result = new StringBuilder(); float used = 0;
                foreach (char ch in text)
                {
                    if (ch == '\n') { result.Append(ch); used = 0; continue; }
                    float advance = font.GetCharacterInfo(ch, out var ci, size) ? ci.advance : size;
                    if (used + advance > pw - x * 2 && used > 0) { result.Append('\n'); used = 0; }
                    result.Append(ch); used += advance;
                }
                lines = result.ToString().Split('\n');
                float lineBox = Mathf.Max(size, font.lineHeight * size / (float)Math.Max(1, font.fontSize));
                int maxLines = Math.Max(1, Mathf.FloorToInt((ph - top * 2 - lineBox) / (size * 1.3f)) + 1);
                if (lines.Length > maxLines)
                {
                    lines = lines.Take(maxLines).ToArray();
                    font.RequestCharactersInTexture(lines[maxLines - 1] + "…", size);
                    string last = lines[maxLines - 1];
                    while (last.Length > 0 && TextAdvance(last + "…", size) > pw - x * 2) last = last.Substring(0, last.Length - 1);
                    lines[maxLines - 1] = last + "…";
                }
                text = lines[0];
            }
            var label = Label(root, text, new Vector3(-width / 2 + x / pw * width, y + height / 2 - top / ph * height, .024f), 1);
            label.fontSize = size; label.characterSize = width / pw * 10; label.lineSpacing = 1.3f; label.color = ColorValue(color);
            label.anchor = center ? TextAnchor.MiddleCenter : TextAnchor.UpperLeft; label.alignment = center ? TextAlignment.Center : TextAlignment.Left;
            label.gameObject.name = "Surface text " + text.Replace('\n', ' ');
            label.gameObject.AddComponent<ItemDepthText>().Configure(font);
            // TextMesh の行間は OS フォント固有の行高に依存するので、Web の 1.3em を実寸で置く。
            if (lines != null) for (int i = 1; i < lines.Length; i++)
            {
                var line = Label(label.transform, lines[i], new Vector3(0, -i * size * 1.3f / ph * height, 0), 1);
                line.fontSize = size; line.characterSize = width / pw * 10; line.color = ColorValue(color);
                line.anchor = TextAnchor.UpperLeft; line.alignment = TextAlignment.Left;
                line.gameObject.AddComponent<ItemDepthText>().Configure(font);
            }
            return label;
        }

        float TextAdvance(string text, int size)
        {
            float width = 0;
            foreach (char ch in text) width += font.GetCharacterInfo(ch, out var info, size) ? info.advance : size;
            return width;
        }

        GameObject ItemBadge(Transform root, string text, Vector3 position, float height, string background = "#000000bf")
        {
            var badge = new GameObject("Item badge"); badge.transform.SetParent(root, false); badge.transform.localPosition = ToUnity(position); badge.AddComponent<FaceCamera>();
            font.RequestCharactersInTexture(text, 48, FontStyle.Bold); float advance = 0;
            foreach (char ch in text) advance += font.GetCharacterInfo(ch, out var ci, 48, FontStyle.Bold) ? ci.advance : 48;
            float width = height * (advance + 40) / 68;
            var plate = ItemPlane(badge.transform, "Badge background", Vector3.zero, width, height, background, false);
            var pixels = new ItemRaster(Mathf.CeilToInt(advance) + 40, 68, "#00000000"); pixels.Rect(0, 0, pixels.Width, 68, background, 34);
            var texture = pixels.Texture(); plate.GetComponent<Renderer>().sharedMaterial.shader = Shader.Find("Unlit/Transparent"); plate.GetComponent<Renderer>().sharedMaterial.mainTexture = texture; root.GetComponentInParent<ItemResources>()?.Textures.Add(texture);
            var label = Label(badge.transform, text, new Vector3(0, 0, .004f), height * 10 / 68);
            label.fontSize = 48; label.fontStyle = FontStyle.Bold; label.anchor = TextAnchor.MiddleCenter; label.color = Color.white; return badge;
        }

        void BuildCanvasPanel(Transform root, JObject item)
        {
            const float height = 1.8f, width = height * 640 / 520;
            var surface = BuildBoard(root, width, height, 1.6f, 640, 520);
            string[] labels = { "細", "太", "消しゴム", "保存", "全部消す" };
            float[] centers = { 294, 342, 416, 503, 586 };
            for (int i = 0; i < labels.Length; i++) TextOnBoard(root, labels[i], 640, 520, width, height, 1.6f, centers[i], 30, i < 2 ? 18 : 15, "#ffffff", false, true);
            ItemBadge(root, "キャンバス", new Vector3(0, 2.68f, 0), .16f);
            PaintCanvas(surface, item);
        }

        void PaintCanvas(ItemPanelSurface surface, JObject item)
        {
            var pixels = surface.CanvasRaster ?? (surface.CanvasRaster = new ItemRaster(640, 520, "#2b2d31"));
            pixels.Rect(10, 58, 620, 450, "#ffffff");
            PaintCanvasToolbar(surface, item);
            PaintStrokes(pixels, item, 10, 58);
            if (surface.Texture == null) { SetSurface(surface, pixels); surface.CanvasDirty = false; }
            else surface.CanvasDirty = true;
        }

        void PaintCanvasToolbar(ItemPanelSurface surface, JObject item)
        {
            var pixels = surface.CanvasRaster; string id = (string)item["id"];
            if (pixels == null) return;
            pixels.Rect(0, 0, 640, 58, "#2b2d31");
            for (int i = 0; i < CanvasPalette.Length; i++)
            {
                if (CanvasPenColor(id) == CanvasPalette[i]) pixels.Disc(32 + i * 40, 29, 16, "#ffffff");
                pixels.Disc(32 + i * 40, 29, 13, CanvasPalette[i]);
            }
            pixels.Rect(272, 12, 44, 34, CanvasPenSize(id) == 3 ? "#5865f2" : "#4e5058", 6);
            pixels.Rect(320, 12, 44, 34, CanvasPenSize(id) == 10 ? "#5865f2" : "#4e5058", 6);
            pixels.Rect(370, 12, 92, 34, CanvasPenColor(id) == "erase" ? "#5865f2" : "#4e5058", 6);
            pixels.Rect(468, 12, 70, 34, "#248046", 6); pixels.Rect(544, 12, 84, 34, "#da373c", 6);
            surface.CanvasDirty = true;
        }

        void PaintCanvasDelta(ItemPanelSurface surface, JObject item, JObject stroke, int firstPoint, bool clear)
        {
            if (surface.CanvasRaster == null) { PaintCanvas(surface, item); return; }
            var pixels = surface.CanvasRaster;
            if (clear) pixels.Rect(10, 58, 620, 450, "#ffffff");
            else if (stroke != null)
            {
                pixels.Clip = new RectInt(10, 58, 620, 450);
                PaintStroke(pixels, stroke, 10, 58, firstPoint);
                // 古い線へ追記した範囲だけ、後から始まった線や消しゴムを重ね直す。
                if (item["strokes"] is JArray strokes && !ReferenceEquals(strokes.Last, stroke))
                {
                    pixels.Clip = StrokeRegion(stroke, firstPoint);
                    for (int i = strokes.IndexOf(stroke) + 1; i < strokes.Count; i++)
                        if (strokes[i] is JObject later) PaintStroke(pixels, later, 10, 58, 0);
                }
                pixels.Clip = new RectInt(0, 0, pixels.Width, pixels.Height);
            }
            surface.CanvasDirty = true;
        }

        static RectInt StrokeRegion(JObject stroke, int firstPoint)
        {
            var points = (JArray)stroke["pts"];
            float left = 630, top = 508, right = 10, bottom = 58, radius = Float(stroke, "size", 3) / 2;
            for (int i = Math.Max(0, firstPoint - 2); i + 1 < points.Count; i += 2)
            {
                float x = 10 + (float)points[i], y = 58 + (float)points[i + 1];
                left = Math.Min(left, x - radius); right = Math.Max(right, x + radius);
                top = Math.Min(top, y - radius); bottom = Math.Max(bottom, y + radius);
            }
            int minX = Math.Max(10, Mathf.FloorToInt(left)), minY = Math.Max(58, Mathf.FloorToInt(top));
            return new RectInt(minX, minY, Math.Max(0, Math.Min(630, Mathf.CeilToInt(right) + 1) - minX), Math.Max(0, Math.Min(508, Mathf.CeilToInt(bottom) + 1) - minY));
        }

        static void PaintStrokes(ItemRaster pixels, JObject item, int x, int y)
            => PaintStrokesScaled(pixels, item, x, y, 1);

        static void PaintStrokesScaled(ItemRaster pixels, JObject item, int x, int y, float scale)
        {
            pixels.Clip = new RectInt(x, y, Mathf.RoundToInt(620 * scale), Mathf.RoundToInt(450 * scale));
            if (item["strokes"] is JArray strokes) foreach (var stroke in strokes.OfType<JObject>())
            {
                PaintStroke(pixels, stroke, x, y, 0, scale);
            }
            pixels.Clip = new RectInt(0, 0, pixels.Width, pixels.Height);
        }

        static void PaintStroke(ItemRaster pixels, JObject stroke, int x, int y, int firstPoint, float scale = 1)
        {
            if (!(stroke["pts"] is JArray pts) || pts.Count < 2) return;
            string color = (string)stroke["color"] == "erase" ? "#ffffff" : (string)stroke["color"];
            float radius = Float(stroke, "size", 3) * scale / 2;
            if (firstPoint == 0) pixels.Disc(x + (float)pts[0] * scale, y + (float)pts[1] * scale, radius, color);
            for (int i = Math.Max(2, firstPoint); i + 1 < pts.Count; i += 2)
                pixels.Line(x + (float)pts[i - 2] * scale, y + (float)pts[i - 1] * scale, x + (float)pts[i] * scale, y + (float)pts[i + 1] * scale, radius, color);
        }

        void Build2048Panel(Transform root, JObject item)
        {
            const float height = 1.8f, width = height * 440 / 590;
            var surface = BuildBoard(root, width, height, 1.6f, 440, 590); var pixels = new ItemRaster(440, 590, "#2b2d31");
            pixels.Rect(324, 18, 96, 36, "#4e5058", 6); pixels.Rect(12, 72, 408, 408, "#1e1f22", 8);
            TextOnBoard(root, "2048", 440, 590, width, height, 1.6f, 20, 18, 30, "#f2f3f5");
            TextOnBoard(root, "スコア " + (string)item["score"], 440, 590, width, height, 1.6f, 110, 29, 18, "#b5bac1");
            TextOnBoard(root, "リセット", 440, 590, width, height, 1.6f, 372, 37, 18, "#ffffff", false, true);
            var grid = item["grid"] as JArray;
            for (int i = 0; i < 16; i++)
            {
                int value = grid != null && i < grid.Count ? (int)grid[i] : 0;
                int x = 20 + i % 4 * 100, y = 80 + i / 4 * 100;
                pixels.Rect(x, y, 92, 92, TileColors.TryGetValue(value, out var color) ? color : "#3c3a32", 6);
                if (value != 0) TextOnBoard(root, value.ToString(), 440, 590, width, height, 1.6f, x + 46, y + 48, value < 100 ? 40 : value < 1000 ? 34 : 28, value <= 4 ? "#776e65" : "#f9f6f2", false, true);
            }
            string[] arrows = { "←", "↑", "↓", "→" };
            for (int i = 0; i < 4; i++) { pixels.Rect(20 + i * 102, 500, 92, 72, "#5865f2", 6); TextOnBoard(root, arrows[i], 440, 590, width, height, 1.6f, 66 + i * 102, 537, 34, "#ffffff", false, true); }
            if ((bool?)item["over"] == true) ItemBadge(root, "ゲームオーバー", new Vector3(0, 1.65f, .04f), .16f);
            SetSurface(surface, pixels); ItemBadge(root, "2048 ・ 互換モード", new Vector3(0, 2.68f, 0), .16f, "#5865f2");
        }

        static GameObject ItemCylinder(Transform root, string name, Vector3 p, float top, float bottom, float height, string color, int segments)
        {
            var go = new GameObject(name); go.transform.SetParent(root, false); go.transform.localPosition = ToUnity(p);
            var verts = new List<Vector3>(); var triangles = new List<int>();
            for (int i = 0; i < segments; i++)
            {
                float a = i * Mathf.PI * 2 / segments, b = (i + 1) * Mathf.PI * 2 / segments; int n = verts.Count;
                verts.Add(new Vector3(Mathf.Cos(a) * bottom, -height / 2, Mathf.Sin(a) * bottom)); verts.Add(new Vector3(Mathf.Cos(a) * top, height / 2, Mathf.Sin(a) * top));
                verts.Add(new Vector3(Mathf.Cos(b) * top, height / 2, Mathf.Sin(b) * top)); verts.Add(new Vector3(Mathf.Cos(b) * bottom, -height / 2, Mathf.Sin(b) * bottom));
                verts.Add(Vector3.up * height / 2); verts.Add(Vector3.down * height / 2);
                triangles.AddRange(new[] { n, n + 1, n + 2, n, n + 2, n + 3, n + 1, n + 4, n + 2, n, n + 3, n + 5 });
            }
            var mesh = new Mesh { name = name + " mesh" }; mesh.SetVertices(verts); mesh.SetTriangles(triangles, 0); mesh.RecalculateNormals(); mesh.RecalculateBounds();
            go.AddComponent<MeshFilter>().sharedMesh = mesh; go.AddComponent<MeshRenderer>().sharedMaterial = Material(color); go.AddComponent<MeshCollider>().sharedMesh = mesh;
            root.GetComponentInParent<ItemResources>()?.Meshes.Add(mesh); return go;
        }
    }

    public sealed class ItemPanelSurface : MonoBehaviour
    {
        public int PixelWidth, PixelHeight;
        public Texture2D Texture;
        public ItemRaster CanvasRaster;
        public bool CanvasDirty, ImageLoadFailed;
        // 同じフレームに届いた差分は、まとめて一度だけGPUへ反映する。
        void LateUpdate()
        {
            if (!CanvasDirty || CanvasRaster == null || Texture == null) return;
            CanvasRaster.Apply(Texture); CanvasDirty = false;
        }
        public Vector2 Point(RaycastHit hit) => new Vector2(hit.textureCoord.x * PixelWidth, (1 - hit.textureCoord.y) * PixelHeight);
    }
    public sealed class ItemActionTarget : MonoBehaviour { public string Action; }
    public sealed class ItemDepthText : MonoBehaviour
    {
        Font font;
        Material material;
        public void Configure(Font value)
        {
            font = value;
            // 既定の文字シェーダーは板を透過して裏面の文字まで重なる。
            material = new Material(Resources.Load<Shader>("ItemText"));
            material.mainTexture = font.material.mainTexture;
            GetComponent<Renderer>().sharedMaterial = material;
            Font.textureRebuilt += Rebuild;
        }
        void Rebuild(Font value) { if (value == font && material != null) material.mainTexture = font.material.mainTexture; }
        void OnDestroy() { Font.textureRebuilt -= Rebuild; if (material != null) Destroy(material); }
    }
    public sealed class ItemResources : MonoBehaviour
    {
        public readonly List<Texture2D> Textures = new List<Texture2D>();
        public readonly List<Mesh> Meshes = new List<Mesh>();
        void OnDestroy()
        {
            foreach (var r in GetComponentsInChildren<Renderer>(true)) if (r.GetComponent<TextMesh>() == null && r.sharedMaterial != null) Destroy(r.sharedMaterial);
            foreach (var texture in Textures) if (texture != null) Destroy(texture);
            foreach (var mesh in Meshes) if (mesh != null) Destroy(mesh);
        }
    }

    public sealed class ItemRaster
    {
        public readonly int Width, Height;
        readonly Color32[] pixels;
        public RectInt Clip;
        public ItemRaster(int width, int height, string color)
        {
            Width = width; Height = height; Clip = new RectInt(0, 0, width, height); pixels = new Color32[width * height];
            ColorUtility.TryParseHtmlString(color, out var c); for (int i = 0; i < pixels.Length; i++) pixels[i] = c;
        }
        void Pixel(int x, int y, Color32 color) { if (x >= 0 && y >= 0 && x < Width && y < Height && Clip.Contains(new Vector2Int(x, y))) pixels[(Height - 1 - y) * Width + x] = color; }
        public void Rect(int x, int y, int w, int h, string color, int radius = 0)
        {
            ColorUtility.TryParseHtmlString(color, out var c);
            for (int yy = Math.Max(y, 0); yy < Math.Min(y + h, Height); yy++) for (int xx = Math.Max(x, 0); xx < Math.Min(x + w, Width); xx++)
            {
                float dx = Math.Max(0, Math.Max(x + radius - xx, xx - (x + w - radius - 1))), dy = Math.Max(0, Math.Max(y + radius - yy, yy - (y + h - radius - 1)));
                if (radius == 0 || dx * dx + dy * dy <= radius * radius) Pixel(xx, yy, c);
            }
        }
        public void Disc(float x, float y, float radius, string color)
        {
            ColorUtility.TryParseHtmlString(color ?? "#111111", out var c); radius = Math.Max(.5f, radius);
            int minY = Math.Max(0, Math.Max(Clip.yMin, Mathf.FloorToInt(y - radius))), maxY = Math.Min(Height - 1, Math.Min(Clip.yMax - 1, Mathf.CeilToInt(y + radius)));
            int minX = Math.Max(0, Math.Max(Clip.xMin, Mathf.FloorToInt(x - radius))), maxX = Math.Min(Width - 1, Math.Min(Clip.xMax - 1, Mathf.CeilToInt(x + radius)));
            for (int yy = minY; yy <= maxY; yy++) for (int xx = minX; xx <= maxX; xx++)
                if ((xx - x) * (xx - x) + (yy - y) * (yy - y) <= radius * radius) Pixel(xx, yy, c);
        }
        public void Line(float x, float y, float ex, float ey, float radius, string color)
        {
            if (Math.Max(x, ex) + radius < Clip.xMin || Math.Min(x, ex) - radius >= Clip.xMax || Math.Max(y, ey) + radius < Clip.yMin || Math.Min(y, ey) - radius >= Clip.yMax) return;
            int count = Math.Max(1, Mathf.CeilToInt(Vector2.Distance(new Vector2(x, y), new Vector2(ex, ey)) / Math.Max(.5f, radius / 2)));
            for (int n = 0; n <= count; n++) Disc(Mathf.Lerp(x, ex, n / (float)count), Mathf.Lerp(y, ey, n / (float)count), radius, color);
        }
        public Texture2D Texture() { var texture = new Texture2D(Width, Height, TextureFormat.RGBA32, false); texture.filterMode = FilterMode.Bilinear; texture.anisoLevel = 4; Apply(texture); return texture; }
        public void Apply(Texture2D texture) { texture.SetPixels32(pixels); texture.Apply(false, false); }
    }
}
