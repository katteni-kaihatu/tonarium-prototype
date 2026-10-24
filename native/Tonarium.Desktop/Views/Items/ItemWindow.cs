using System.Diagnostics;
using System.Text.Json.Nodes;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using Avalonia.VisualTree;
using Tonarium.Desktop.Core;

namespace Tonarium.Desktop.Views;

public sealed class ItemWindow : Window
{
    private readonly NativeContext context;
    private readonly string itemId;
    private readonly StackPanel body = Column();
    private readonly TextBlock titleLabel = Text("", 13);
    private readonly TextBlock subtitleLabel = Text("", 10, "#5E5C64");
    private readonly Grid markHost = new();
    private readonly StackPanel viewers = Row();
    private readonly Grid header;
    private readonly Button? attention;
    private readonly Button remove;
    private string WindowKey => (kind == "camera" ? "cam:" : "item:") + itemId;
    private readonly TextBlock status = Text("", 12, "#5E5C64");
    private readonly List<Action<JsonObject>> refreshers = [];
    private readonly DispatcherTimer tick;
    private string kind = "";
    private bool applying;
    private bool canvasDirty = true;
    private JsonObject? canvasItem;
    private JsonNode? canvasStrokes;
    private SharedDrawingCanvas? drawingCanvas;
    private TextBox? note;
    private string? pendingNoteText;
    private DispatcherTimer? noteTimer;
    private NativeVideoView? video;
    private NativeYoutubeView? youtube;
    private JsonObject? Item => context.Client.State.Items[itemId] as JsonObject;

    public ItemWindow(NativeContext context, string itemId)
    {
        this.context = context;
        this.itemId = itemId;
        Width = 480; Height = 600; MinWidth = 300; MinHeight = 220;
        Background = Brushes.Transparent;
        WindowDecorations = Avalonia.Controls.WindowDecorations.None;
        TransparencyLevelHint = [WindowTransparencyLevel.Transparent];
        FontFamily = Ui.BodyFont;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        var root = new DockPanel();
        var bar = new Grid { Height = 40, ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"), Background = Brush("#F3EEE4"), Margin = new Thickness(0) };
        header = bar;
        markHost.Margin = new Thickness(12, 0, 8, 0); markHost.Width = 26; markHost.Height = 26; markHost.VerticalAlignment = VerticalAlignment.Center;
        bar.Children.Add(markHost);
        var titles = new StackPanel { Spacing = 0, VerticalAlignment = VerticalAlignment.Center };
        titleLabel.FontWeight = FontWeight.Bold; titleLabel.TextWrapping = TextWrapping.NoWrap; titleLabel.TextTrimming = TextTrimming.CharacterEllipsis;
        subtitleLabel.TextWrapping = TextWrapping.NoWrap; subtitleLabel.TextTrimming = TextTrimming.CharacterEllipsis;
        titles.Children.Add(titleLabel); titles.Children.Add(subtitleLabel); Grid.SetColumn(titles, 1); bar.Children.Add(titles);
        var buttons = Row(); buttons.Spacing = 1; buttons.Margin = new Thickness(5, 0, 8, 0);
        buttons.Children.Add(viewers);
        attention = HeaderButton("sparkle", "注目を集める", () => { _ = context.Client.SendRoomAsync(new { t = "attention", key = WindowKey }); attention!.IsEnabled = false; DispatcherTimer.RunOnce(() => attention.IsEnabled = true, TimeSpan.FromSeconds(3)); });
        buttons.Children.Add(attention);
        remove = HeaderButton("trash", "アイテムをしまう", () => { _ = context.Client.SendRoomAsync(new { t = "itemRemove", id = itemId }); Close(); });
        buttons.Children.Add(remove);
        buttons.Children.Add(HeaderButton("maximize", "拡大（画面全体に表示）", () => WindowState = WindowState == Avalonia.Controls.WindowState.Maximized ? Avalonia.Controls.WindowState.Normal : Avalonia.Controls.WindowState.Maximized));
        buttons.Children.Add(HeaderButton("close", "消す", Close));
        Grid.SetColumn(buttons, 2); bar.Children.Add(buttons);
        bar.PointerPressed += (_, e) => { if (e.Source is Control c && (c is Button || c.GetVisualAncestors().OfType<Button>().Any())) return; if (e.GetCurrentPoint(this).Properties.IsLeftButtonPressed) { if (e.ClickCount == 2) WindowState = WindowState == Avalonia.Controls.WindowState.Maximized ? Avalonia.Controls.WindowState.Normal : Avalonia.Controls.WindowState.Maximized; else BeginMoveDrag(e); } };
        DockPanel.SetDock(bar, Dock.Top); root.Children.Add(bar);
        body.Spacing = 10;
        root.Children.Add(new ScrollViewer { Content = body, HorizontalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled });
        Content = new Border { Child = root, Background = Brush("#FFFDF9"), CornerRadius = new CornerRadius(14), ClipToBounds = true, BorderBrush = Brush("#DCD5C8"), BorderThickness = new Thickness(1) };
        tick = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(90) };
        tick.Tick += (_, _) => Refresh();
        PropertyChanged += (_, e) => { if (e.Property == ClientSizeProperty && note is not null) note.Height = Math.Max(140, ClientSize.Height - 84); };
        context.Client.MessageReceived += MarkCanvasDirty;
        context.Client.State.Changed += Refresh;
        Closing += (_, _) => { video?.Dispose(); youtube?.Dispose(); };
        Closed += (_, _) => { context.Client.MessageReceived -= MarkCanvasDirty; context.Client.State.Changed -= Refresh; tick.Stop(); noteTimer?.Stop(); if (note is not null) { FlushNote(); Send(new { a = "noteLock", @lock = false }); } };
        Refresh();
    }

    private void MarkCanvasDirty(JsonObject message)
    {
        var type = Str(message, "t");
        if (type == "sessionSnapshot" ||
            type == "itemAction" && Str(message, "id") == itemId ||
            type == "item" && Str(message["item"], "id") == itemId)
            canvasDirty = true;
        if (type == "itemAction" && Str(message, "id") == itemId && Str(message["action"], "a") == "canvasClear")
            drawingCanvas?.ClearPreview();
    }

    public void Refresh()
    {
        var item = Item;
        if (item is null)
        {
            status.Text = "このアイテムは片付けられました"; body.IsEnabled = false;
            // Web's WindowLayer removes a resolved window as soon as its item disappears.
            if (IsLoaded) Close();
            return;
        }
        var nextKind = Str(item, "kind");
        if (kind != nextKind) { kind = nextKind; Build(item); }
        applying = true;
        try
        {
            RefreshHeader(item);
            foreach (var refresh in refreshers) refresh(item);
            var animating = kind == "dice" && item["roll"] is JsonObject roll && DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + context.Client.State.ServerOffset - Num(roll, "at") < 1800
                || (kind is "video" or "youtube") && Bool(item["clock"], "playing");
            if (animating && !tick.IsEnabled) tick.Start(); else if (!animating && tick.IsEnabled) tick.Stop();
        }
        finally { applying = false; }
    }

    private void Build(JsonObject item)
    {
        refreshers.Clear(); body.Children.Clear();
        var info = ItemCatalog.Get(kind); Title = info.Name + " · tonarium";
        body.Margin = new Thickness(kind is "note" or "dice" or "video" or "youtube" or "image" or "camera" ? 0 : 8);
        switch (kind)
        {
            case "note": BuildNote(); break;
            case "canvas": BuildCanvas(); break;
            case "dice": BuildDice(); break;
            case "chess": case "chessAi": BuildChess(); break;
            case "g2048": Build2048(); break;
            case "hammer": BuildHandheld(false); break;
            case "camera": BuildHandheld(true); break;
            case "image": BuildImage(item); break;
            case "video": BuildVideo(item); break;
            case "youtube": BuildYoutube(item); break;
        }
    }

    private void RefreshHeader(JsonObject item)
    {
        var info = ItemCatalog.Get(kind);
        titleLabel.Text = kind == "note" ? Str(item, "text").Split('\n')[0] is { Length: > 0 } line ? line[..Math.Min(16, line.Length)] : "付箋（空）" : kind == "youtube" ? Str(item, "title", "YouTube") : info.Name;
        var creator = Str(item, "createdBy");
        var me = context.State.Presence[context.State.SelfId]?["pos"] ?? context.State.Avatars[context.State.SelfId];
        var d = Math.Sqrt(Math.Pow(Num(item, "x") - Num(me, "x"), 2) + Math.Pow(Num(item, "z") - Num(me, "z", 6.5), 2));
        subtitleLabel.Text = (creator == context.State.SelfId ? "あなた" : UserName(creator)) + " が出した · " + (d < .1 ? "すぐそば" : $"{d:0.0}m");
        bool dark = kind is "image" or "video" or "youtube" or "camera";
        header.Background = Brush(dark ? "#36373F" : "#F3EEE4"); titleLabel.Foreground = Brush(dark ? "#FFFFFF" : "#26262E"); subtitleLabel.Foreground = Brush(dark ? "#B9B7C2" : "#5E5C64");
        if (Content is Border frame) frame.Background = Brush(kind == "note" ? Str(item,"color","#fde68a") : dark ? "#1E1F24" : "#FFFDF9");
        remove.IsVisible = kind != "camera";
        markHost.Children.Clear();
        var mark = Text(info.Mark, info.Mark.Length > 2 ? 8 : 12, info.Ink, true); mark.HorizontalAlignment = HorizontalAlignment.Center;
        markHost.Children.Add(new Border { Background = Brush(info.Tint), CornerRadius = new CornerRadius(8), Child = mark });
        var creatorInitial = Text(UserName(creator).FirstOrDefault().ToString(), 7, "#FFFFFF", true); creatorInitial.HorizontalAlignment = HorizontalAlignment.Center;
        markHost.Children.Add(new Border { Width = 12, Height = 12, Background = PersonBrush(creator), CornerRadius = new CornerRadius(6), Child = creatorInitial, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(0,0,-3,-3) });
        viewers.Children.Clear();
        var watching = context.State.Users.OfType<JsonObject>().Where(u => Arr(context.State.Presence[Str(u,"id")], "viewing").Any(v => v?.ToString() == WindowKey)).ToArray();
        foreach (var person in watching.Take(3)) { var face = Text(Str(person,"name").FirstOrDefault().ToString(), 10, "#FFFFFF", true); face.HorizontalAlignment = HorizontalAlignment.Center; var circle = new Border { Width = 22, Height = 22, CornerRadius = new CornerRadius(11), Background = PersonBrush(Str(person,"id")), BorderBrush = header.Background, BorderThickness = new Thickness(2), Child = face, Margin = new Thickness(-5,0,0,0) }; ToolTip.SetTip(circle, Str(person,"name")); viewers.Children.Add(circle); }
        if(watching.Length > 3) viewers.Children.Add(Text("+" + (watching.Length - 3), 11, dark ? "#FFFFFF" : "#5E5C64"));
        ToolTip.SetTip(viewers, "閲覧中：" + string.Join("、", watching.Select(u => Str(u,"name"))));
        foreach(var button in header.GetVisualDescendants().OfType<Button>()) if(button.Content is WebIcon icon) icon.Foreground = Brush(dark ? "#FFFFFF" : "#26262E");
    }

    private static Button HeaderButton(string icon, string tooltip, Action click)
    {
        var button = Button("", click); button.Content = new WebIcon(icon, 14); button.Width = 30; button.Height = 30; button.MinHeight = 0; button.Padding = new Thickness(0); button.BorderThickness = new Thickness(0); button.Background = Brushes.Transparent; button.CornerRadius = new CornerRadius(8); ToolTip.SetTip(button, tooltip); return button;
    }

    private static IBrush PersonBrush(string id)
    {
        uint hash=0;foreach(var c in id)hash=unchecked(hash*31+c);
        var h=(hash%360)/60d; const double chroma=.585, m=.2575; var x=chroma*(1-Math.Abs(h%2-1));
        var rgb=h switch { <1=>(chroma,x,0d),<2=>(x,chroma,0d),<3=>(0d,chroma,x),<4=>(0d,x,chroma),<5=>(x,0d,chroma),_=>(chroma,0d,x) };
        return new SolidColorBrush(Color.FromRgb((byte)Math.Round((rgb.Item1+m)*255),(byte)Math.Round((rgb.Item2+m)*255),(byte)Math.Round((rgb.Item3+m)*255)));
    }

    private static Button PanelButton(string label, Action action, string background = "#4e5058", double fontSize = 15)
    {
        var button = Button(label, action); button.Height=34;button.FontSize=fontSize;button.Background=Brush(background);button.Foreground=Brushes.White;button.BorderThickness=new Thickness(0);button.CornerRadius=new CornerRadius(6);button.Padding=new Thickness(10,0);return button;
    }

    private void BuildNote()
    {
        Width = 360; Height = 278;
        note = new TextBox { AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, Height = 180, MaxLength = 300, FontSize = 15, Padding = new Thickness(2), BorderThickness = new Thickness(0), CornerRadius = new CornerRadius(0), Background = Brushes.Transparent, Foreground = Brush("#1c1917"), PlaceholderText = "付箋に書く" };
        noteTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(240) };
        noteTimer.Tick += (_, _) => { noteTimer.Stop(); FlushNote(); };
        note.TextChanged += (_, _) => { if (!applying) { pendingNoteText = note.Text ?? ""; noteTimer.Stop(); noteTimer.Start(); } };
        note.GotFocus += (_, _) => Send(new { a = "noteLock", @lock = true });
        note.LostFocus += (_, _) => { FlushNote(); Send(new { a = "noteLock", @lock = false }); };
        var colors = Row(); colors.Spacing = 6;
        foreach (var color in new[] { "#fde68a", "#fca5a5", "#86efac", "#93c5fd", "#d8b4fe" })
        {
            var b = Button("", () => Send(new { a = "noteEdit", color })); b.Width = 18; b.Height = 18; b.MinHeight = 0; b.Padding = new Thickness(0); b.CornerRadius = new CornerRadius(9); b.Background = Brush(color); b.BorderBrush = Brush("#331c1917"); colors.Children.Add(b); ToolTip.SetTip(b, "色を変える");
        }
        status.FontSize = 12; status.Foreground = Brush("#57534e"); status.TextAlignment = TextAlignment.Right;
        var foot = new Grid { ColumnDefinitions = new ColumnDefinitions("Auto,*") }; foot.Children.Add(colors); Grid.SetColumn(status, 1); foot.Children.Add(status);
        var contents = Column(note, foot); contents.Spacing = 6; contents.Margin = new Thickness(10);
        var wrap = new Border { Child = contents }; body.Children.Add(wrap);
        refreshers.Add(it =>
        {
            var authoritative = Str(it, "text");
            if (pendingNoteText == authoritative) pendingNoteText = null;
            // フォーカス移動直後の位置更新で、まだ返っていない入力を上書きしない。
            if (pendingNoteText is null && !note.IsKeyboardFocusWithin && !noteTimer.IsEnabled && note.Text != authoritative) note.Text = authoritative;
            wrap.Background = Brush(Str(it, "color", "#fde68a"));
            var editor = Str(it, "editingBy"); status.Text = editor.Length > 0 && editor != context.Client.State.SelfId ? UserName(editor) + " が編集中" : "更新: " + UserName(Str(it, "updatedBy"));
        });
    }
    private void FlushNote()
    {
        if (note is null || Item is not { } it || Str(it, "text") == (note.Text ?? "")) return;
        pendingNoteText = note.Text ?? "";
        Send(new { a = "noteEdit", text = pendingNoteText });
    }

    private void BuildCanvas()
    {
        Width = 658; Height = 576;
        var canvas = new SharedDrawingCanvas(() => Item, Send);
        drawingCanvas = canvas;
        var toolbar = Row(); toolbar.Spacing = 6;
        var swatches = new List<Button>();
        string selectedColor = "#111111"; int selectedSize = 3; bool erase = false;
        Button? thin = null, thick = null, eraser = null;
        void UpdatePen()
        {
            canvas.PenColor = erase ? "erase" : selectedColor; canvas.PenSize = erase ? 28 : selectedSize;
            foreach(var swatch in swatches)swatch.BorderThickness = new Thickness(!erase && swatch.Tag?.ToString() == selectedColor ? 3 : 0);
            if(thin is not null)thin.Background=Brush(selectedSize==3?"#5865f2":"#4e5058");
            if(thick is not null)thick.Background=Brush(selectedSize==10?"#5865f2":"#4e5058");
            if(eraser is not null)eraser.Background=Brush(erase?"#5865f2":"#4e5058");
        }
        foreach (var color in new[] { "#111111", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7" })
        {
            var c = color; var b = Button("", () => { selectedColor = c; erase = false; UpdatePen(); });
            b.Tag=c;b.Width=28;b.Height=28;b.MinHeight=0;b.Padding=new Thickness(0);b.Background=Brush(c);b.BorderBrush=Brush("#FFFFFF");b.BorderThickness=new Thickness(swatches.Count==0?3:0);b.CornerRadius=new CornerRadius(14); swatches.Add(b);toolbar.Children.Add(b);
        }
        thin=PanelButton("細", () => { selectedSize = 3; UpdatePen(); }, "#5865f2"); toolbar.Children.Add(thin);
        thick=PanelButton("太", () => { selectedSize = 10; UpdatePen(); }); toolbar.Children.Add(thick);
        eraser=PanelButton("🧽 消しゴム", () => { erase = !erase; UpdatePen(); }); toolbar.Children.Add(eraser);
        toolbar.Children.Add(PanelButton("💾 保存", () => SaveCanvas(canvas), "#248046"));
        toolbar.Children.Add(PanelButton("全部消す", () => { Send(new { a = "canvasClear" }); canvas.ClearPreview(); }, "#da373c"));
        var panel=Column(toolbar, new Viewbox { Stretch=Stretch.Uniform, Child=canvas }); panel.Spacing=12;
        body.Children.Add(new Border { Background=Brush("#2b2d31"), CornerRadius=new CornerRadius(6), Padding=new Thickness(10,12),Child=panel });
        canvasDirty = true; canvasItem = null; canvasStrokes = null;
        refreshers.Add(it =>
        {
            // 履歴全体を文字列化せず、このキャンバスの変更だけで再描画する。
            var strokes = it["strokes"];
            if (!canvasDirty && ReferenceEquals(canvasItem, it) && ReferenceEquals(canvasStrokes, strokes)) return;
            canvasDirty = false; canvasItem = it; canvasStrokes = strokes;
            canvas.InvalidateVisual();
        });
    }
    private void SaveCanvas(Control canvas)
    {
        try
        {
            // Web exports at PANEL_SCALE=2 and JPEG quality .85, without the toolbar.
            using var bitmap = new RenderTargetBitmap(new PixelSize(1240, 900), new Vector(192, 192));
            bitmap.Render(canvas);
            using var png = new MemoryStream(); bitmap.Save(png); png.Position = 0;
            using var decoded = SkiaSharp.SKBitmap.Decode(png);
            using var image = SkiaSharp.SKImage.FromBitmap(decoded);
            using var encoded = image.Encode(SkiaSharp.SKEncodedImageFormat.Jpeg, 85);
            _ = context.Client.SendRoomAsync(new { t = "chat", text = "🎨 キャンバスを保存しました", image = "data:image/jpeg;base64," + Convert.ToBase64String(encoded.ToArray()), scope = "all" });
            status.Text = "ログに保存しました";
        }
        catch (Exception error) { context.Notify("キャンバスを保存できませんでした: " + error.Message); }
    }

    private void BuildDice()
    {
        Width = 420; Height = 310;
        var tray = new WrapPanel { Orientation = Orientation.Horizontal, HorizontalAlignment=HorizontalAlignment.Center, VerticalAlignment=VerticalAlignment.Center };
        var trayShell=new Border { MinHeight=120,Padding=new Thickness(14),CornerRadius=new CornerRadius(14),Child=tray,Background=new RadialGradientBrush{Center=new RelativePoint(.5,.4,RelativeUnit.Relative),GradientOrigin=new RelativePoint(.5,.4,RelativeUnit.Relative),RadiusX=new RelativeScalar(.75,RelativeUnit.Relative),RadiusY=new RelativeScalar(.75,RelativeUnit.Relative),GradientStops=[new GradientStop(Color.Parse("#b98258"),0),new GradientStop(Color.Parse("#7a4e30"),1)]} };
        tray.Children.Add(Text("まだ振っていません",13,"#f4e6cf"));
        var result = Text("種類と個数を選んで振ってください", 13); result.TextAlignment=TextAlignment.Center; result.HorizontalAlignment=HorizontalAlignment.Center;result.MinHeight=20;
        var settingsKey = "dice." + Uri.EscapeDataString(context.State.Name);
        (int Sides, int Count, bool Secret) ReadSettings()
        {
            try
            {
                var stored = JsonNode.Parse(NativeSettings.GetString(settingsKey, "{}"));
                var s = (int)Num(stored, "sides", 6); var n = (int)Num(stored, "count", 1);
                return (new[] { 4, 6, 8, 10, 12, 20, 100 }.Contains(s) ? s : 6, Math.Clamp(n, 1, 10), Bool(stored, "secret"));
            }
            catch (System.Text.Json.JsonException) { return (6, 1, false); }
        }
        var settings = ReadSettings(); int sides = settings.Sides, count = settings.Count; bool restoringChoice = false;
        var sideButtons = new List<Button>(); var options = Row(); options.Spacing=4; options.HorizontalAlignment=HorizontalAlignment.Center;
        var secret = new CheckBox { Content = "シークレット", IsChecked = settings.Secret, FontSize=12,Foreground = Brush("#26262E"),MinHeight=28,Padding=new Thickness(0) };
        var number = Text("1", 13, "#26262E", true);number.MinWidth=24;number.TextAlignment=TextAlignment.Center;
        var roll = Button("1d6 を振る", () => Send(new { a = "diceRoll", sides, count, secret = secret.IsChecked == true }));roll.Background=Brush("#2F5FC4");roll.Foreground=Brush("#FFFFFF");roll.BorderBrush=roll.Background;roll.FontWeight=FontWeight.Bold;
        foreach (var n in new[] { 4, 6, 8, 10, 12, 20, 100 })
        {
            var b = Button("d" + n, () => { sides = n; UpdateChoice(); }); b.Height=30;b.MinHeight=0;b.FontSize=12;b.FontWeight=FontWeight.Bold;b.CornerRadius=new CornerRadius(8);b.Padding=new Thickness(10,0);sideButtons.Add(b); options.Children.Add(b);
        }
        void UpdateChoice(bool persist = true) { for (int i = 0; i < sideButtons.Count; i++) {bool on=new[] { 4, 6, 8, 10, 12, 20, 100 }[i]==sides;sideButtons[i].Background=on?Brush("#2F5FC4"):Brushes.Transparent;sideButtons[i].Foreground=on?Brushes.White:Brush("#26262E");sideButtons[i].BorderBrush=on?Brush("#2F5FC4"):Brush("#EEE8DD");} number.Text = count.ToString(); roll.Content = $"{count}d{sides} を振る"; if (persist) { NativeSettings.SetString(settingsKey, System.Text.Json.JsonSerializer.Serialize(new { sides, count, secret = secret.IsChecked == true })); context.State.Touch(); } }
        var minus=Button("−",()=>{count=Math.Max(1,count-1);UpdateChoice();});var plus=Button("＋",()=>{count=Math.Min(10,count+1);UpdateChoice();}); foreach(var b in new[]{minus,plus}){b.Width=28;b.Height=28;b.MinHeight=0;b.Padding=new Thickness(0);b.CornerRadius=new CornerRadius(8);b.BorderBrush=Brush("#EEE8DD");}
        var countRow=Row(minus,number,plus);countRow.Spacing=6;
        var controls=new Grid{ColumnDefinitions=new ColumnDefinitions("Auto,Auto,*,Auto")};controls.Children.Add(countRow);Grid.SetColumn(secret,1);secret.Margin=new Thickness(10,0,0,0);controls.Children.Add(secret);Grid.SetColumn(roll,3);controls.Children.Add(roll);
        var panel=Column(trayShell,result,options,controls);panel.Spacing=10;panel.Margin=new Thickness(14);body.Children.Add(panel);
        UpdateChoice(false);
        secret.IsCheckedChanged += (_, _) => { if (!restoringChoice) UpdateChoice(); };
        string displayKey = "";
        refreshers.Add(it =>
        {
            var currentChoice = ReadSettings();
            if (currentChoice.Sides != sides || currentChoice.Count != count || currentChoice.Secret != (secret.IsChecked == true))
            {
                restoringChoice = true;
                sides = currentChoice.Sides; count = currentChoice.Count; secret.IsChecked = currentChoice.Secret;
                UpdateChoice(false); restoringChoice = false;
            }
            if (it["roll"] is not JsonObject r) return;
            var elapsed = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + context.Client.State.ServerOffset - Num(r, "at"); var rolling = elapsed < 1800;
            var values = r["results"] as JsonArray;
            if (values is null && Str(r, "by") == context.Client.State.SelfId)
                values = context.Client.State.Chats.OfType<JsonObject>().LastOrDefault(m => Str(m["dice"], "id") == Str(r, "id"))?["dice"]?["results"] as JsonArray;
            roll.IsEnabled = !rolling;
            var key = r.ToJsonString() + ":" + (rolling ? Math.Floor(elapsed / 85) : -1) + ":" + values?.ToJsonString();
            if (key == displayKey) return; displayKey = key; tray.Children.Clear();
            var n = (int)Num(r, "count", 1); var d = (int)Num(r, "sides", 6);
            for (var i = 0; i < n; i++)
            {
                var val = rolling ? (1 + ((int)Math.Max(0, elapsed / 85) * 7919 + i * 104729) % d).ToString() : values?[i]?.ToString() ?? "？";
                tray.Children.Add(new DieTile(d,val){Margin=new Thickness(5)});
            }
            result.Text = rolling ? UserName(Str(r, "by")) + $" が {n}d{d} を振っています…" : values is not null ? $"{UserName(Str(r,"by"))}：{n}d{d} = {values.Sum(v => Num(v))}" + (Bool(r, "secret") ? "（シークレット・あなただけに見えています）" : "") : UserName(Str(r, "by")) + $" がシークレットで {n}d{d} を振りました";
        });
    }
    private void Build2048()
    {
        Width = 458; Height = 646;
        var panel = Column(); panel.Spacing = 12;
        var score = Text("スコア 0", 18, "#b5bac1", true);
        var grid = new Grid { RowDefinitions = new RowDefinitions("*,*,*,*"), ColumnDefinitions = new ColumnDefinitions("*,*,*,*"), Width = 408, Height = 408, Background = Brush("#1e1f22") };
        var cells = new Border[16]; var values = new TextBlock[16];
        for (int i = 0; i < 16; i++) { values[i] = Text("", 32, "#776E65", true); values[i].HorizontalAlignment = HorizontalAlignment.Center; values[i].VerticalAlignment = VerticalAlignment.Center; cells[i] = new Border { Child = values[i], Margin = new Thickness(4), CornerRadius = new CornerRadius(6) }; Grid.SetRow(cells[i], i / 4); Grid.SetColumn(cells[i], i % 4); grid.Children.Add(cells[i]); }
        void Slide(string dir) => Send(new { a = "slide", dir });
        panel.Children.Add(Row(Text("2048",30,"#f2f3f5",true),score, PanelButton("リセット", () => Send(new { a = "reset2048" })))); var layer=new Grid();layer.Children.Add(grid);var overLabel=Text("ゲームオーバー",36,"#FFFFFF",true);overLabel.HorizontalAlignment=HorizontalAlignment.Center;var over=new Border{Background=Brush("#AA000000"),Child=overLabel,IsVisible=false};layer.Children.Add(over);panel.Children.Add(layer);
                var arrows = Row(); arrows.Spacing = 10;
        foreach(var pair in new[]{("left","←"),("up","↑"),("down","↓"),("right","→")}) {var direction=pair.Item1;var button=PanelButton(pair.Item2,()=>Slide(direction),"#5865f2",34);button.Width=92;button.Height=72;arrows.Children.Add(button);}
        panel.Children.Add(arrows);
        body.Children.Add(new Border{Background=Brush("#2b2d31"),CornerRadius=new CornerRadius(6),Padding=new Thickness(12,16),Child=panel});
        AddHandler(InputElement.KeyDownEvent, (_, e) =>
        {
            if (e.Source is TextBox || e.Source is Control source && source.GetVisualAncestors().OfType<TextBox>().Any()) return;
            var dir = e.Key switch { Key.Left or Key.A => "left", Key.Right or Key.D => "right", Key.Up or Key.W => "up", Key.Down or Key.S => "down", _ => null };
            if (dir is null) return;
            Slide(dir); e.Handled = true;
        }, RoutingStrategies.Tunnel);
        refreshers.Add(it => { var data = Arr(it, "grid"); for (int i = 0; i < 16; i++) { int val = i < data.Count ? (int)Num(data[i]) : 0; values[i].Text = val > 0 ? val.ToString() : ""; values[i].Foreground = Brush(val > 4 ? "#FFF8EF" : "#776E65"); values[i].FontSize = val < 100 ? 40 : val < 1000 ? 34 : 28; cells[i].Background = Brush(val switch { 0 => "#3a3c42", 2 => "#EEE4DA", 4 => "#EDE0C8", 8 => "#F2B179", 16 => "#F59563", 32 => "#F67C5F", 64 => "#F65E3B", _ => "#EDC750" }); } score.Text = "スコア " + Num(it, "score"); over.IsVisible=Bool(it,"over"); status.Text = Bool(it, "over") ? "ゲームオーバー · 新しく始められます" : "矢印キー / WASD / ボタンで操作"; });
    }

    private void BuildChess()
    {
        Width = 498; Height = 744;
        var panel = Column(); panel.Spacing = 12;
        var heading = Text("白の手番", 20, "#f2f3f5", true);
        var grid = new Grid { Width = 448, Height = 448, RowDefinitions = new RowDefinitions("*,*,*,*,*,*,*,*"), ColumnDefinitions = new ColumnDefinitions("*,*,*,*,*,*,*,*") };
        var buttons = new Button[64]; var movesLabel = Text("棋譜はここに表示されます", 14, "#b5bac1");
        var promotions = Row(); promotions.IsVisible = false;
        int selected = -1, revision = -1, promotionTo = -1; bool resetConfirm = false; string lastRender = "";
        Button? reset = null;
        var legal = new List<NativeChess.Move>();
        void CancelReset() { resetConfirm = false; if (reset is not null) reset.Content = "新しい対局"; }
        void Move(int to, string? promotion = null)
        {
            var action = new JsonObject { ["a"] = "chessMove", ["from"] = selected, ["to"] = to, ["revision"] = revision };
            // 通常の手にnullの昇格を付けると、Webと同じ合法手に一致しない。
            if (promotion is not null) action["promotion"] = promotion;
            Send(action); selected = -1; promotionTo = -1; legal.Clear(); promotions.IsVisible = false; lastRender = "";
        }
        void Choose(int index)
        {
            CancelReset();
            if (Item is not { } it || it["chess"] is not JsonObject chess) return;
            var position = new NativeChess(Str(chess, "fen"));
            if (position.IsOver(Arr(chess, "positions")) || (kind == "chessAi" && position.Turn == 'b')) return;
            if (index == selected) { selected = -1; legal.Clear(); }
            else if (position.Board[index]?.StartsWith(position.Turn.ToString(), StringComparison.Ordinal) == true) { selected = index; revision = (int)Num(chess, "revision"); legal = position.LegalMoves(index); }
            else if (legal.Any(m => m.To == index)) { if (legal.Any(m => m.To == index && m.Promotion is not null)) { promotionTo = index; promotions.IsVisible = true; return; } Move(index); }
            lastRender = ""; Refresh();
        }
        for (int i = 0; i < 64; i++) { var index = i; var b = Button("", () => Choose(index)); b.Height = double.NaN; b.MinHeight = 0; b.Padding = new Thickness(0); b.Margin = new Thickness(0); b.HorizontalAlignment = HorizontalAlignment.Stretch; b.VerticalAlignment = VerticalAlignment.Stretch; b.CornerRadius = new CornerRadius(0); b.FontSize = 40; b.FontFamily = new FontFamily("Segoe UI Symbol"); Grid.SetRow(b, i / 8); Grid.SetColumn(b, i % 8); grid.Children.Add(b); buttons[i] = b; }
        foreach (var pair in new[] { ("q", "♛ クイーン"), ("r", "♜ ルーク"), ("b", "♝ ビショップ"), ("n", "♞ ナイト") }) promotions.Children.Add(PanelButton(pair.Item2, () => Move(promotionTo, pair.Item1)));
        reset = PanelButton("新しい対局", () => { if (!resetConfirm) { resetConfirm = true; reset!.Content = "本当に初期化？"; status.Text = "もう一度押すと初期化します"; return; } CancelReset(); selected = -1; Send(new { a = "chessReset" }); });
                panel.Children.Add(Row(Text(kind == "chessAi" ? "♟ チェスAI" : "♟ チェス",22,"#f2f3f5",true),reset));
        panel.Children.Add(heading);
        panel.Children.Add(Text(kind == "chessAi" ? "白：みんなで操作 / 黒：AI（自動で応手）" : "参加登録なし · 手番の色の駒を誰でも動かせます",13,"#b5bac1"));
        panel.Children.Add(grid);panel.Children.Add(promotions);status.Foreground=Brush("#dce0e5");status.FontSize=14;panel.Children.Add(status);panel.Children.Add(movesLabel);
        panel.Children.Add(Text("キャスリング・アンパッサン・昇格に対応 / 引き分けは自動判定",12,"#9ba1aa"));
        body.Children.Add(new Border { Background=Brush("#2b2d31"),CornerRadius=new CornerRadius(6),Padding=new Thickness(16,12),Child=panel });
        refreshers.Add(it =>
        {
            if (it["chess"] is not JsonObject chess) return;
            int nowRevision = (int)Num(chess, "revision");
            if (revision != nowRevision) { revision = nowRevision; selected = -1; legal.Clear(); promotions.IsVisible = false; CancelReset(); }
            var key = chess.ToJsonString() + ":" + selected; if (key == lastRender) return; lastRender = key;
            var pos = new NativeChess(Str(chess, "fen")); var check = pos.InCheck(pos.Turn); var over = pos.IsOver(Arr(chess, "positions"));
            heading.Text = over ? pos.AllLegal().Count == 0 && check ? (pos.Turn == 'w' ? "黒" : "白") + "の勝ち" : "引き分け" : kind == "chessAi" && pos.Turn == 'b' ? "AIが考えています…" : (pos.Turn == 'w' ? "白" : "黒") + "の手番" + (check ? " · チェック！" : "");
            var last = Arr(it, "last").Select(v => (int)Num(v)).ToArray();
            for (int i = 0; i < 64; i++)
            {
                var p = pos.Board[i]; var light = (i / 8 + i % 8) % 2 == 0;
                buttons[i].Background = Brush(selected == i ? "#9FBACC" : check && p == pos.Turn + "K" ? "#E39991" : last.Contains(i) ? "#CDD08B" : light ? "#F0D9B5" : "#B58863");
                buttons[i].Foreground = Brush(p?.StartsWith('w') == true ? "#FFFDF4" : "#2D2630");
                buttons[i].Content = new ChessPiece(p, i, p is null && legal.Any(m => m.To == i));
                buttons[i].BorderThickness = legal.Any(m => m.To == i) ? new Thickness(3) : new Thickness(0);
                buttons[i].BorderBrush = Brush("#75948A");
                ToolTip.SetTip(buttons[i], NativeChess.SquareName(i));
            }
            var moves = Arr(chess, "moves"); var pairs = new List<string>(); for (var n = Math.Max(0, moves.Count - 10) / 2 * 2; n < moves.Count; n += 2) pairs.Add($"{n / 2 + 1}. {moves[n]}  {(n + 1 < moves.Count ? moves[n + 1] : "")}");
            movesLabel.Text = pairs.Count > 0 ? string.Join("   ", pairs) : "棋譜はここに表示されます";
            status.Text = over ? "対局終了 · 新しい対局を始められます" : selected >= 0 ? "印のあるマスへ移動" : "駒を選択 → 移動先をクリック";
        });
    }

    private void BuildHandheld(bool camera)
    {
        var held = Text("", 18); var hold = Button("手に持つ", () => { if (Item is not { } it) return; if (Str(it, "holder") == context.Client.State.SelfId) DropHeld(it); else Send(new { a = "pick" }); });
        body.Children.Add(held); body.Children.Add(hold);
        if (camera)
        {
            body.Children.Add(context.Media.CreateVideoView(itemId));
            body.Children.Add(Text("3Dでカメラを持って撮影・ライブ配信できます。", 14));
        }
        else
        {
            body.Children.Add(Text("持った状態で相手を選ぶと、そばへ移動して叩きます。", 14));
            var people = Column(); body.Children.Add(people); string previous = "";
            refreshers.Add(itemState => { var ids = string.Join(",", context.Client.State.Users.Select(u => Str(u, "id") + ":" + Str(u, "session"))); if (previous == ids) return; previous = ids; people.Children.Clear(); foreach (var user in context.Client.State.Users.OfType<JsonObject>().Where(u => Str(u, "id") != context.Client.State.SelfId && Str(u, "session") == context.Client.State.SessionId)) { var id = Str(user, "id"); people.Children.Add(Button("槌  " + Str(user, "name"), () => HitWithHammer(id))); } });
        }
        refreshers.Add(it => { var holder = Str(it, "holder"); held.Text = holder.Length == 0 ? "床に置いてあります" : UserName(holder) + " が持っています"; hold.Content = holder == context.Client.State.SelfId ? "床に置く" : "手に持つ"; hold.IsEnabled = holder.Length == 0 || holder == context.Client.State.SelfId; status.Text = camera ? Bool(it, "live") ? "ライブ配信中" : "配信していません" : "ピコッ"; });
    }

    private async void HitWithHammer(string target)
    {
        var state = context.State;
        if (Str(Item, "holder") != state.SelfId) { context.Notify("先にハンマーを手に持ってください"); return; }
        var places = ParticipantPlaces();
        var canMove = state.Mode == "2d" && places.TryGetValue(target, out _);
        var me = places.GetValueOrDefault(state.SelfId, (X: 0d, Z: 6.5, Yaw: 0d));
        var other = places.GetValueOrDefault(target);
        try
        {
            await context.Client.SendRoomAsync(new { t = "hit", to = target });
            if (!canMove) return;
            var dx = me.X - other.X; var dz = me.Z - other.Z; var distance = Math.Sqrt(dx * dx + dz * dz);
            if (distance < .01) { dx = 0; dz = 1; } else { dx /= distance; dz /= distance; }
            await context.Client.SendRoomAsync(new { t = "place2d", target = state.SelfId,
                pos = new { x = other.X + dx * .8, z = other.Z + dz * .8, ry = Math.Atan2(dx, dz) } });
        }
        catch (Exception error) { context.Notify(error.Message); }
    }

    private void DropHeld(JsonObject item)
    {
        if (context.State.Mode != "3d") { Send(new { a = "drop", x = Num(item, "x"), z = Num(item, "z"), ry = Num(item, "ry"), pitch = Num(item, "pitch") }); return; }
        var p = ParticipantPlaces().GetValueOrDefault(context.State.SelfId, (X: 0d, Z: 6.5, Yaw: 0d));
        var gap = Str(item, "kind") == "camera" ? .7 : 1.2;
        Send(new { a = "drop", x = Math.Clamp(p.X - Math.Sin(p.Yaw) * gap, -9.5, 9.5), z = Math.Clamp(p.Z - Math.Cos(p.Yaw) * gap, -9.5, 9.5), ry = p.Yaw,
            pitch = Num(context.State.Avatars[context.State.SelfId], "pitch") });
    }

    private Dictionary<string, (double X, double Z, double Yaw)> ParticipantPlaces()
    {
        var state = context.State;
        var users = state.Users.Where(u => Str(u, "session") == state.SessionId).ToArray();
        var places = new Dictionary<string, (double X, double Z, double Yaw)>();
        foreach (var user in users.Where(u => Str(u, "mode") == "3d"))
        {
            var id = Str(user, "id");
            if (state.Avatars[id] is { } avatar) places[id] = (Num(avatar, "x"), Num(avatar, "z"), Num(avatar, "ry"));
        }
        var followers = new Dictionary<string, int>(); var queue = 0;
        foreach (var user in users.Where(u => Str(u, "mode") != "3d"))
        {
            var id = Str(user, "id"); var presence = state.Presence[id]; var follow = Str(presence, "follow");
            if (places.TryGetValue(follow, out var leader))
            {
                var i = followers.GetValueOrDefault(follow); followers[follow] = i + 1;
                var side = (i % 2 == 1 ? -1 : 1) * Math.Ceiling(i / 2d) * .45; var back = .9 + Math.Floor(i / 3d) * .35;
                places[id] = (leader.X + Math.Sin(leader.Yaw) * back + Math.Cos(leader.Yaw) * side, leader.Z + Math.Cos(leader.Yaw) * back - Math.Sin(leader.Yaw) * side, leader.Yaw);
            }
            else if (presence?["pos"] is { } p) places[id] = (Num(p, "x"), Num(p, "z"), Num(p, "ry"));
            else { var radius = .45 * Math.Sqrt(queue); var angle = queue++ * 2.39996; places[id] = (Math.Sin(angle) * radius, 6.5 + Math.Cos(angle) * radius, 0); }
        }
        return places;
    }

    private void BuildImage(JsonObject item)
    {
        Width = 560; Height = Math.Clamp(560 * Num(item,"h",400) / Math.Max(1,Num(item,"w",560)) + 40, 260, 740);
        var image = new Image { Stretch = Stretch.Uniform, MaxHeight = 650, MinHeight = 160 };
        body.Children.Add(image); var url = MediaUrl(Str(item, "url"));
        image.PointerPressed += (_,_) => OpenUrl(url);
        _ = LoadImage();
        async Task LoadImage() { try { using var http = new HttpClient(); var bytes = await http.GetByteArrayAsync(url); using var stream = new MemoryStream(bytes); var bitmap = new Bitmap(stream); await Dispatcher.UIThread.InvokeAsync(() => { image.Source = bitmap; status.Text = $"{(int)Num(item, "w")} × {(int)Num(item, "h")}"; }); } catch (Exception error) { await Dispatcher.UIThread.InvokeAsync(() => status.Text = "画像を読み込めませんでした: " + error.Message); } }
    }

    private void BuildVideo(JsonObject item)
    {
        Width = 576; Height = 440;
        video = new NativeVideoView(MediaUrl(Str(item, "url")), action => Send(action)); body.Children.Add(video);
        refreshers.Add(it => video.UpdateClock(it["clock"] as JsonObject, context.Client.State.ServerOffset));
        status.Text = "再生・一時停止・シークは全員に反映されます";
    }

    private void BuildYoutube(JsonObject item)
    {
        Width = 642; Height = 426;
        var id = Str(item, "videoId");
        youtube = new NativeYoutubeView(id, Send, message => status.Text = message);
        body.Children.Add(youtube);
        var clock = Text("", 12, "#B9B7C2");
        var open = HeaderButton("link", "YouTubeで開く", () => OpenUrl("https://www.youtube.com/watch?v=" + Uri.EscapeDataString(id)));
        open.Content = new WebIcon("link", 14, Brushes.White);
        var controls = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto"), Background=Brush("#1E1F24"),Margin=new Thickness(8,0) };controls.Children.Add(clock);Grid.SetColumn(open,1);controls.Children.Add(open);body.Children.Add(controls);
        refreshers.Add(it => { var c = it["clock"]; youtube.UpdateClock(c as JsonObject, context.Client.State.ServerOffset); var p = ClockPosition(c, context.Client.State.ServerOffset); clock.Text = TimeSpan.FromSeconds(p).ToString(@"hh\:mm\:ss"); });
    }
    private void Send(object action) => _ = context.Client.SendRoomAsync(new { t = "itemAction", id = itemId, action });
    private string MediaUrl(string url) => new Uri(new Uri(context.Client.State.ServerUrl.TrimEnd('/') + "/"), url).ToString();
    private string UserName(string id) => context.Client.State.Users.OfType<JsonObject>().FirstOrDefault(u => Str(u, "id") == id) is { } user ? Str(user, "name") : id;
    private void OpenUrl(string url) { try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch (Exception ex) { context.Notify(ex.Message); } }
    internal static string Str(JsonNode? node, string key, string fallback = "") => node?[key]?.ToString() ?? fallback;
    internal static double Num(JsonNode? node, string key, double fallback = 0) => Num(node?[key], fallback);
    internal static double Num(JsonNode? node, double fallback = 0) => double.TryParse(node?.ToString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var n) ? n : fallback;
    internal static bool Bool(JsonNode? node, string key) => bool.TryParse(node?[key]?.ToString(), out var b) && b;
    internal static JsonArray Arr(JsonNode? node, string key) => node?[key] as JsonArray ?? [];
    internal static double ClockPosition(JsonNode? c, long offset = 0) => Math.Max(0, Num(c, "base") + (Bool(c, "playing") ? Math.Max(0, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + offset - Num(c, "at")) / 1000 : 0));
    internal static IBrush Brush(string color) => new SolidColorBrush(Color.Parse(color));
    internal static TextBlock Text(string text, double size = 14, string color = "#26262E", bool bold = false) => new() { Text = text, FontSize = size, FontFamily = Ui.BodyFont, Foreground = Brush(color), FontWeight = bold ? FontWeight.SemiBold : FontWeight.Normal, TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center };
    internal static StackPanel Row(params Control[] controls) { var panel = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, VerticalAlignment = VerticalAlignment.Center }; foreach (var c in controls) panel.Children.Add(c); return panel; }
    internal static StackPanel Column(params Control[] controls) { var panel = new StackPanel { Spacing = 12 }; foreach (var c in controls) panel.Children.Add(c); return panel; }
    internal static Button Button(string label, Action click) { var b = new Button { Content = label, FontFamily = Ui.BodyFont, FontSize = 13, Height = 36, Padding = new Thickness(14, 0), CornerRadius = new CornerRadius(10), Background = Brushes.White, Foreground = Brush("#26262E"), BorderBrush = Brush("#DCD5C8"), BorderThickness = new Thickness(1) }; b.Click += (_, _) => click(); return b; }
}

internal sealed class ChessPiece(string? piece, int square = -1, bool destination = false) : Control
{
    public override void Render(DrawingContext context)
    {
        base.Render(context);
        var face = new Typeface(new FontFamily("Segoe UI Symbol"));
        if (square >= 0)
        {
            var labels = new List<(string Text, Point At)>();
            if (square % 8 == 0) labels.Add(((8-square/8).ToString(),new Point(3,0)));
            if (square / 8 == 7) labels.Add(("abcdefgh"[square%8].ToString(),new Point(Bounds.Width-9,Bounds.Height-12)));
            foreach(var label in labels)context.DrawText(new FormattedText(label.Text,System.Globalization.CultureInfo.CurrentCulture,FlowDirection.LeftToRight,face,10,ItemWindow.Brush("#3b3026")),label.At);
        }
        if(destination)context.DrawEllipse(ItemWindow.Brush("#AA304d49"),null,new Point(Bounds.Width/2,Bounds.Height/2),7,7);
        if(piece is null)return;
        var white = piece.StartsWith('w');
        // Solid chess glyphs plus a narrow outline keep both sides readable on pale squares.
        var symbol = NativeChess.Glyph("b" + piece[1]);
        var outline = new FormattedText(symbol, System.Globalization.CultureInfo.CurrentCulture, FlowDirection.LeftToRight, face, 43, white ? ItemWindow.Brush("#554B4D") : Brushes.White);
        var fill = new FormattedText(symbol, System.Globalization.CultureInfo.CurrentCulture, FlowDirection.LeftToRight, face, 43, white ? Brushes.White : ItemWindow.Brush("#342A31"));
        var point = new Point((Bounds.Width - fill.Width) / 2, (Bounds.Height - fill.Height) / 2);
        foreach (var delta in new[] { new Vector(-1, 0), new Vector(1, 0), new Vector(0, -1), new Vector(0, 1) }) context.DrawText(outline, point + delta);
        context.DrawText(fill, point);
    }
    protected override Size MeasureOverride(Size availableSize) => new(50, 50);
}
