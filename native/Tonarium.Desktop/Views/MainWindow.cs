using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Avalonia.Threading;
using Avalonia.VisualTree;
using System.Text.Json.Nodes;
using Tonarium.Desktop.Core;
using Tonarium.Desktop.Media;
using Tonarium.Desktop.ThreeD;

namespace Tonarium.Desktop.Views;

public sealed partial class MainWindow : Window
{
    private readonly TonariumClient client = new(persistSettings: !Program.Arguments.Contains("--demo") && !Program.Arguments.Contains("--smoke"));
    private readonly NativeMedia media;
    private readonly ThreeDHost threeD;
    private readonly NativeContext context;
    private readonly Grid root = new();
    private readonly ContentControl screen = new();
    private readonly Border toast;
    private readonly TextBlock toastText = Ui.Text("", 14, "#FFFFFF");
    private readonly Dictionary<string, ItemWindow> itemWindows = [];
    private HomeView? home;
    private RoomView? room;
    private Grid? homeOverlay;
    private HomeView? overlayView;
    private readonly TextBlock sessionSummary = Ui.Text("", 13, Ui.Ink);
    private UnitySurface? unitySurface;
    private ThreeDOverlayWindow? threeDOverlay;
    private ThreeDChatWindow? threeDChat;
    private string threeDChatDraft = "";
    private string? previousSession;
    private bool signedIn, closing, refreshQueued, switching;
    private bool allowClose;
    private Task? shutdownTask, modeChangeTask;
    private readonly TextBox serverInput;
    private readonly TextBox nameInput;
    private readonly TextBlock loginError = Ui.Text("", 13, "#C2402F");
    private Button? connectButton;

    public MainWindow()
    {
        Title = DesktopInstance.Number == 1 ? "Tonarium" : $"Tonarium · クライアント {DesktopInstance.Number}";
        Width = 1360; Height = 880; MinWidth = 1000; MinHeight = 640;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        media = new NativeMedia(client);
        threeD = new ThreeDHost(client);
        threeD.AttachMedia(media);
        context = new(client, media, this)
        {
            NotificationRequested = Notify,
            ItemRequested = OpenItem,
            ProfileRequested = ShowProfile,
            HomeRequested = ShowHome,
            ModeRequested = ChangeMode,
            TeleportRequested = (x, z, ry) => threeD.TeleportAsync(x, z, ry)
        };
        serverInput = Ui.Input("http://localhost:3001", Program.Argument("--server") ?? client.State.ServerUrl);
        nameInput = Ui.Input("なまえ", Program.Argument("--name") ?? client.State.Name);
        toast = new Border { Child = toastText, Background = Ui.Brush("#ED26262E"), CornerRadius = new(12), Padding = new(20, 12), Margin = new(24, 24, 24, 40), HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Bottom, MaxWidth = 760, IsVisible = false };
        root.Children.Add(screen); root.Children.Add(toast);
        ConfigureMediaInput();
        Content = root;
        screen.Content = LoginView();
        client.State.Changed += QueueRefresh;
        client.MessageReceived += MessageReceived;
        media.Changed += QueueRefresh;
        threeD.ReturnedTo2D += () => { RestoreNativeRoot(); if (!closing) { Activate(); QueueRefresh(); } };
        threeD.PlayerWindowChanged += hwnd => Dispatcher.UIThread.Post(() => unitySurface?.ResizePlayer(hwnd));
        threeD.ItemRequested += OpenItem;
        threeD.InputStateChanged += locked =>
        {
            room?.SetWorldInputLocked(locked);
            threeDOverlay?.SetInputLocked(locked);
            threeDOverlay?.RefreshRegion();
            unitySurface?.SetInputLocked(locked, threeD.UsesRelativePointer);
        };
        threeD.HomeRequested += () => ShowHome("toggle");
        threeD.ChatRequested += OpenThreeDChat;
        threeD.SidePanelsToggleRequested += ToggleSidePanels;
        threeD.MediaPasteRequested += () => RunMediaInput(() => room?.PasteMediaAsync() ?? Task.CompletedTask);
        threeD.MediaFilesDropped += paths => RunMediaInput(() => room?.DropMediaPathsAsync(paths) ?? Task.CompletedTask);
        Closing += (_, e) =>
        {
            if (allowClose) return;
            e.Cancel = true;
            _ = Shutdown();
        };
        void Escape(object? sender, KeyEventArgs e)
        {
            if (e.Key == Key.Tab && client.State.Mode == "3d" && !context.HomeIsOpen &&
                !(e.Source is Control control && (control is TextBox || control.GetVisualAncestors().OfType<TextBox>().Any())))
            {
                ToggleSidePanels(); e.Handled = true; return;
            }
            if(e.Key!=Key.Escape)return;
            if(context.HomeIsOpen){CloseHome();e.Handled=true;}
            else if(threeD.IsRunning){ReleaseWorldInput();e.Handled=true;}
        }
        root.AddHandler(KeyDownEvent, Escape, Avalonia.Interactivity.RoutingStrategies.Tunnel);
        AddHandler(KeyDownEvent, Escape, Avalonia.Interactivity.RoutingStrategies.Tunnel);
        Opened += async (_, _) =>
        {
            if (Program.Arguments.Contains("--camera-smoke"))
            {
                var resultPath = Program.Argument("--output") ?? Path.Combine(AppContext.BaseDirectory, "camera-smoke.json");
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(resultPath))!);
                try { var result = await NativeMediaSmoke.RunCameraAsync(); await File.WriteAllTextAsync(resultPath, result.ToJsonString()); }
                catch (Exception e) { Environment.ExitCode = 1; Program.Log(e.ToString()); await File.WriteAllTextAsync(resultPath, new JsonObject { ["passed"] = false, ["error"] = e.Message }.ToJsonString()); }
                await Shutdown(); return;
            }
            if (Program.Arguments.Contains("--media-smoke"))
            {
                var resultPath = Program.Argument("--output") ?? Path.Combine(AppContext.BaseDirectory, "media-smoke.json");
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(resultPath))!);
                try { var result = await NativeMediaSmoke.RunAsync(); await File.WriteAllTextAsync(resultPath, result.ToJsonString()); }
                catch (Exception e) { Program.Log(e.ToString()); await File.WriteAllTextAsync(resultPath, new JsonObject { ["passed"] = false, ["error"] = e.Message }.ToJsonString()); }
                await Shutdown(); return;
            }
            if (Program.Arguments.Contains("--demo")) { LoadDemo(); return; }
            if (Program.Arguments.Contains("--connect") || Program.Argument("--smoke") is not null)
            {
                await Connect();
                if (Program.Argument("--smoke") is { } directory) _ = RunSmoke(directory);
                else if(Program.Argument("--session") is { } session)
                {
                    await client.JoinAsync(session);
                    Refresh();
                    if(Program.Arguments.Contains("--3d"))await ChangeMode("3d");
                }
            }
        };
    }

    private Control LoginView()
    {
        var card = Ui.Column();
        try
        {
            using var asset = AssetLoader.Open(new Uri("avares://Tonarium/Assets/brand/logo.png"));
            card.Children.Add(new Image { Source = new Bitmap(asset), Width = 240, Height = 85, Stretch = Stretch.Uniform, Margin = new(0, 0, 0, 16) });
        }
        catch { card.Children.Add(Ui.Title("Tonarium")); }
        card.Children.Add(Ui.Text("同じ場所に、好きなかたちで。", 20));
        card.Children.Add(Ui.Text("名前を決めて、みんなのいる場所へ。", 13, Ui.Muted));
        card.Children.Add(Ui.Text("なまえ", 12, Ui.Muted)); card.Children.Add(nameInput);
        var server = new Expander { Header = "接続先", Content = serverInput, IsExpanded = string.IsNullOrEmpty(client.State.Name) };
        card.Children.Add(server);
        connectButton = Ui.Button("はじめる", () => _ = Connect());
        connectButton.Background = Ui.Brush("#2F5FC4"); connectButton.Foreground = Brushes.White; connectButton.HorizontalContentAlignment = HorizontalAlignment.Center;
        card.Children.Add(connectButton); card.Children.Add(loginError);
        var panel = Ui.Card(card); panel.Width = 430; panel.Padding = new Thickness(32); panel.CornerRadius = new(24);
        var stage = new Grid { Width = 680, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        foreach (var (name, align, margin) in new[] { ("tona.webp", HorizontalAlignment.Left, new Thickness(0, 85, 0, 0)), ("rimu.webp", HorizontalAlignment.Right, new Thickness(0, -90, 0, 0)) })
        {
            try
            {
                using var asset = AssetLoader.Open(new Uri("avares://Tonarium/Assets/brand/" + name));
                stage.Children.Add(new Image { Source = new Bitmap(asset), Width = 145, Height = 180, Stretch = Stretch.Uniform, HorizontalAlignment = align, Margin = margin });
            }
            catch { }
        }
        stage.Children.Add(panel);
        nameInput.KeyDown += (_, e) => { if (e.Key == Key.Enter) _ = Connect(); };
        return stage;
    }

    private async Task Connect()
    {
        if (connectButton is { IsEnabled: false }) return;
        if (string.IsNullOrWhiteSpace(nameInput.Text)) { loginError.Text = "なまえを入力してください"; nameInput.Focus(); return; }
        if (connectButton is not null) connectButton.IsEnabled = false;
        loginError.Text = "";
        try { await client.ConnectAsync(serverInput.Text ?? "", nameInput.Text); signedIn = true; Refresh(); }
        catch (Exception e) { loginError.Text = e.Message; Program.Log(e.ToString()); }
        finally { if (connectButton is not null) connectButton.IsEnabled = true; }
    }

    private void QueueRefresh()
    {
        if (refreshQueued || closing) return;
        refreshQueued = true;
        Dispatcher.UIThread.Post(async () => { await Task.Delay(80); refreshQueued = false; if (!closing) Refresh(); });
    }

    private void Refresh()
    {
        if (!signedIn) return;
        home ??= new HomeView(context);
        room ??= new RoomView(context);
        if (previousSession != client.State.SessionId)
        {
            threeDChat?.Close(); threeDChatDraft = "";
            foreach (var item in itemWindows.Values.ToArray()) item.Close();
            itemWindows.Clear();
            CloseHome();
            if (client.State.SessionId is null) home.Navigate(context.HomeRoute);
            previousSession = client.State.SessionId;
            if (!Program.Arguments.Contains("--demo")) _ = SyncMedia();
            if (threeD.IsRunning) _ = threeD.StopAsync();
        }
        screen.Content = client.State.SessionId is null ? home : room;
        if (client.State.SessionId is null) home.Refresh(); else room.Refresh();
        if (context.HomeIsOpen) { overlayView?.Refresh(); UpdateSessionSummary(); }
        foreach (var window in itemWindows.Values.ToArray()) window.Refresh();
        threeDOverlay?.RefreshRegion();
    }

    private async Task SyncMedia()
    {
        try { if (client.State.SessionId is { } sid) await media.ConnectAsync(sid); else await media.DisconnectAsync(); }
        catch (Exception e) { Notify("通話: " + e.Message); Program.Log(e.ToString()); }
    }

    private void MessageReceived(JsonObject message)
    {
        var type = J.Text(message, "t");
        if (type == "attention" && J.Text(message, "from") != client.State.SelfId) Notify("近くの人がアイテムに注目しています");
        if (type == "poke" && J.Text(message, "to") == client.State.SelfId) { Notify("つんつんされました"); NativeSounds.Play("bell"); }
        if (type == "hit" && J.Text(message, "to") == client.State.SelfId) Notify("ピコピコ！");
        if (type == "sound") NativeSounds.Play(J.Text(message, "id"));
    }

    private Task ChangeMode(string mode)
    {
        if (closing) return Task.CompletedTask;
        if (switching) return modeChangeTask ?? Task.CompletedTask;
        return modeChangeTask = ChangeModeCore(mode);
    }

    private async Task ChangeModeCore(string mode)
    {
        if (switching) return;
        if (client.State.Mode == mode && (mode == "2d" || threeD.IsRunning)) return;
        if (client.State.SessionId is null) { client.State.Mode = mode; client.State.Touch(); return; }
        switching = true;
        try
        {
            if (mode == "3d")
            {
                Notify("3D空間を準備しています…");
                var parent = IntPtr.Zero;
                if (OperatingSystem.IsWindows() && !Program.Arguments.Contains("--separate-3d"))
                {
                    room ??= new RoomView(context);
                    unitySurface = new UnitySurface();
                    unitySurface.InputCaptureLost += ReleaseWorldInput;
                    unitySurface.ClientSizeChanged += (width, height) => _ = threeD.ResizeAsync(width, height, RenderScaling);
                    Content = null;
                    room.SetExternalScene(true);
                    Content = unitySurface;
                    threeDOverlay = new ThreeDOverlayWindow(this,root,GetOverlayRegions);
                    threeDOverlay.ShutdownRequested += () => _ = Shutdown();
                    context.Owner = threeDOverlay;
                    threeDOverlay.ShowForOwner();
                    parent = await unitySurface.GetHandleAsync().WaitAsync(TimeSpan.FromSeconds(5));
                }
                if (closing) return;
                await threeD.StartAsync(parent);
                if (closing) return;
                await threeD.SetOpenItemsAsync(itemWindows.Keys);
                unitySurface?.ResizePlayer(threeD.PlayerWindowHandle);
                unitySurface?.SetCovered(threeDOverlay is null && context.HomeIsOpen);
            }
            else { await threeD.StopAsync(); if (!closing) Activate(); }
            if (!closing) Refresh();
        }
        catch (Exception e) { RestoreNativeRoot(); if (!closing) Notify(e.Message); Program.Log(e.ToString()); }
        finally { switching = false; }
    }

    private void OpenItem(string id)
    {
        if (id.StartsWith("item:")) id = id[5..];
        if (itemWindows.TryGetValue(id, out var existing)) { existing.WindowState = WindowState.Normal; existing.Activate(); return; }
        var window = new ItemWindow(context, id);
        itemWindows[id] = window;
        window.Activated += (_, _) =>
        {
            if (RoomWindowLayout.Free) return;
            foreach (var other in itemWindows.Values.Where(other => other != window).ToArray()) other.WindowState = WindowState.Minimized;
        };
        window.Closed += (_, _) => { itemWindows.Remove(id); room?.SetOpenItemCount(itemWindows.Count); _ = UpdateViewing(); };
        window.Show(this);
        room?.SetOpenItemCount(itemWindows.Count);
        _ = UpdateViewing();
    }

    private void ToggleSidePanels()
    {
        if (context.HomeIsOpen) return;
        room?.ToggleSidePanels();
        threeDOverlay?.RefreshRegion();
    }

    private Task UpdateViewing() => client.State.SessionId is null ? Task.CompletedTask : Task.WhenAll(
        client.SendRoomAsync(new { t = "viewing", keys = itemWindows.Keys.Select(id => (J.Text(client.State.Items[id], "kind") == "camera" ? "cam:" : "item:") + id).ToArray() }),
        threeD.SetOpenItemsAsync(itemWindows.Keys));

    private void ShowProfile(string id) => new ProfileWindow(context, id).Show(context.Owner);

    private IReadOnlyList<Rect>? GetOverlayRegions()
    {
        if(context.HomeIsOpen || mediaDropHint.IsVisible)return null;
        var regions=room?.OverlayRegions(root).ToList()??[];
        if(toast.IsVisible&&toast.TranslatePoint(default,root) is { } position)regions.Add(new Rect(position,toast.Bounds.Size));
        return regions;
    }

    private void RestoreNativeRoot()
    {
        threeDChat?.Close();
        context.Owner = this;
        threeDOverlay?.CloseAndDetach(); threeDOverlay = null;
        Content = null; room?.SetExternalScene(false); room?.SetThreeDSurface(null);
        unitySurface = null; Content = root;
    }

    private void OpenThreeDChat()
    {
        if (!OperatingSystem.IsLinux()) { room?.FocusChat(); threeDOverlay?.Activate(); return; }
        if (!threeD.IsRunning || client.State.SessionId is not { } session) return;
        if (threeDChat is not null) { threeDChat.Activate(); return; }
        var window = new ThreeDChatWindow(threeDChatDraft, text =>
        {
            if (client.State.SessionId != session) throw new InvalidOperationException("セッションが変わりました");
            return client.SendRoomAsync(new { t = "chat", text, scope = "all" });
        });
        threeDChat = window;
        window.Closed += (_, _) =>
        {
            threeDChatDraft = window.Draft; threeDChat = null;
            _ = threeD.CloseNativeChatAsync();
        };
        window.Show(); window.Activate();
    }

    private void ShowHome(string page)
    {
        if (page == "close" || page == "toggle" && context.HomeIsOpen) { CloseHome(); return; }
        home ??= new HomeView(context);
        var route = page == "toggle" ? context.HomeRoute : page;
        if (client.State.SessionId is null) { home.Navigate(route); return; }
        if (homeOverlay is null)
        {
            overlayView = new HomeView(context) { Focusable = true };
            homeOverlay = new Grid { IsVisible = false };
            KeyboardNavigation.SetTabNavigation(homeOverlay, KeyboardNavigationMode.Cycle);
            var backdrop = new Border { Background = Ui.Brush("#B314161C") };
            backdrop.PointerPressed += (_, _) => CloseHome();
            homeOverlay.Children.Add(backdrop);
            homeOverlay.Children.Add(new Border { Child = overlayView, CornerRadius = new CornerRadius(20), ClipToBounds = true, Margin = new Thickness(12, 72, 24, 88) });
            sessionSummary.VerticalAlignment = VerticalAlignment.Center;
            homeOverlay.Children.Add(new Border
            {
                Child = sessionSummary, Background = Ui.Brush(Ui.Paper), CornerRadius = new(16),
                Padding = new Thickness(14, 0), Height = 44, MinWidth = 220, MaxWidth = 500,
                Margin = new Thickness(76, 20, 80, 0), HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Top
            });
            Button OverlayButton(string icon, string label, Action action)
            {
                var button = Ui.Button("", action); button.Content = new WebIcon(icon, 20); button.Width = button.Height = 44;
                button.Padding = default; button.CornerRadius = new CornerRadius(14); button.Background = Ui.Brush(Ui.Paper);
                button.BorderThickness = default; button.VerticalAlignment = VerticalAlignment.Top;
                Avalonia.Automation.AutomationProperties.SetName(button, label); ToolTip.SetTip(button, label); return button;
            }
            var menu = OverlayButton("menu", "メニュー", CloseHome); menu.Margin = new Thickness(20,20,0,0); menu.HorizontalAlignment = HorizontalAlignment.Left;
            var close = OverlayButton("close", "ホームを閉じる", CloseHome); close.Margin = new Thickness(0,20,24,0); close.HorizontalAlignment = HorizontalAlignment.Right;
            homeOverlay.Children.Add(menu); homeOverlay.Children.Add(close);
            root.Children.Insert(root.Children.Count - 1, homeOverlay);
        }
        context.HomeIsOpen = true; homeOverlay.IsVisible = true;
        overlayView!.Navigate(route); overlayView.Refresh(); UpdateSessionSummary();
        overlayView.Focus();
        if(threeDOverlay is null)unitySurface?.SetCovered(true);
        ReleaseWorldInput();
        threeDOverlay?.RefreshRegion();
    }

    private void ReleaseWorldInput()
    {
        unitySurface?.SetInputLocked(false);
        threeDOverlay?.SetInputLocked(false);
        room?.SetWorldInputLocked(false);
        _ = threeD.ReleaseInputAsync();
    }

    private void UpdateSessionSummary()
    {
        var state = client.State;
        var name = J.Text(state.Sessions.FirstOrDefault(s => J.Text(s,"id") == state.SessionId), "name", "セッション");
        sessionSummary.Text = $"●  参加中：{name}  · {state.Users.Count(u => J.Text(u,"session") == state.SessionId)} 人";
    }

    private void CloseHome()
    {
        context.HomeIsOpen = false;
        if (homeOverlay is not null) homeOverlay.IsVisible = false;
        unitySurface?.SetCovered(false);
        threeDOverlay?.RefreshRegion();
    }

    public void Notify(string text)
    {
        if (!Dispatcher.UIThread.CheckAccess()) { Dispatcher.UIThread.Post(() => Notify(text)); return; }
        toastText.Text = text; toast.IsVisible = true;
        threeDOverlay?.RefreshRegion();
        _ = Task.Delay(4500).ContinueWith(_ => Dispatcher.UIThread.Post(() => { if (toastText.Text == text) toast.IsVisible = false; threeDOverlay?.RefreshRegion(); }));
    }

    private Task Shutdown()
    {
        if (shutdownTask is not null) return shutdownTask;
        closing = true;
        return shutdownTask = ShutdownCore();
    }

    private async Task ShutdownCore()
    {
        // Publish the shared task and leave Avalonia's Closing traversal before
        // detaching an owned HUD. Further close requests remain cancelled.
        await Task.Yield();
        try
        {
            foreach (var window in itemWindows.Values.ToArray())
                await Cleanup(() => { window.Close(); return Task.CompletedTask; });
            await Cleanup(() => { CloseHome(); return Task.CompletedTask; });
            await Cleanup(() => threeD.DisposeAsync().AsTask());
            if (modeChangeTask is not null) await Cleanup(() => modeChangeTask);
        }
        finally
        {
            await Cleanup(() => media.DisposeAsync().AsTask());
            await Cleanup(() => client.DisposeAsync().AsTask());
            await Cleanup(() => { RestoreNativeRoot(); return Task.CompletedTask; });
            allowClose = true;
            Close();
        }

        static async Task Cleanup(Func<Task> action)
        {
            try { await action(); }
            catch (Exception error) { Program.Log(error.ToString()); }
        }
    }

    private void LoadDemo()
    {
        client.State.Name = "あなた";
        client.State.Users = JsonNode.Parse("[{\"id\":\"demo1\",\"name\":\"あおい\",\"session\":\"lounge\",\"mode\":\"2d\",\"status\":\"online\"},{\"id\":\"demo2\",\"name\":\"りく\",\"session\":\"lounge\",\"mode\":\"3d\",\"status\":\"joinMe\"}]")!.AsArray();
        client.State.Sessions = JsonNode.Parse("[{\"id\":\"lounge\",\"name\":\"いつものラウンジ\",\"topic\":\"話したり、描いたり、同じ場所で。\",\"world\":\"cafe\",\"visibility\":\"public\"},{\"id\":\"work\",\"name\":\"もくもく部屋\",\"topic\":\"それぞれの作業を、いっしょに。\",\"world\":\"room\"}]")!.AsArray();
        client.State.Friends = new JsonArray("あおい", "りく");
        signedIn = true; Refresh();
        if (Program.Argument("--screenshot") is { } directory) _ = CaptureDemo(directory);
    }

    private async Task CaptureDemo(string directory)
    {
        await Task.Delay(1200); Directory.CreateDirectory(directory); Capture(Path.Combine(directory, "home.png"));
        client.State.SessionId = "lounge"; client.State.World = "cafe";
        client.State.Chats = JsonNode.Parse("[{\"id\":\"a\",\"from\":\"demo1\",\"fromName\":\"あおい\",\"text\":\"こんにちは！今日は何をしよう？\",\"scope\":\"all\",\"at\":1770000000000},{\"id\":\"b\",\"from\":\"demo2\",\"fromName\":\"りく\",\"text\":\"カフェでのんびりしてます ☕\",\"scope\":\"near\",\"at\":1770000000000}]")!.AsArray();
        Refresh(); await Task.Delay(700); Capture(Path.Combine(directory, "room.png"));
        await Shutdown();
    }

    private void Capture(string path)
    {
        var target = new RenderTargetBitmap(new PixelSize((int)Bounds.Width, (int)Bounds.Height), new Vector(96, 96));
        target.Render(this); target.Save(path); target.Dispose();
    }

    private async Task CaptureNative(string path)
    {
        if (!OperatingSystem.IsWindows()) { Capture(path); return; }
        await Task.Delay(350);
        var handle = TryGetPlatformHandle()?.Handle ?? IntPtr.Zero;
        if (handle == IntPtr.Zero) throw new InvalidOperationException("Native window handle is unavailable.");
        using var bitmap = new System.Drawing.Bitmap(Math.Max(1, (int)(Bounds.Width * RenderScaling)), Math.Max(1, (int)(Bounds.Height * RenderScaling)));
        using var graphics = System.Drawing.Graphics.FromImage(bitmap);
        var dc = graphics.GetHdc();
        try { if (!PrintWindow(handle, dc, 3)) throw new InvalidOperationException("Could not capture the native app window."); }
        finally { graphics.ReleaseHdc(dc); }
        if(threeDOverlay is not null)
        {
            using var overlay = new RenderTargetBitmap(new PixelSize(bitmap.Width,bitmap.Height),new Vector(96*RenderScaling,96*RenderScaling));
            overlay.Render(root);
            using var encoded=new MemoryStream();overlay.Save(encoded);encoded.Position=0;
            using var image=System.Drawing.Image.FromStream(encoded);graphics.DrawImage(image,0,0,bitmap.Width,bitmap.Height);
        }
        bitmap.Save(path, System.Drawing.Imaging.ImageFormat.Png);
    }

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    [return: System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.Bool)]
    private static extern bool PrintWindow(IntPtr window, IntPtr dc, uint flags);

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    [return: System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.Bool)]
    private static extern bool IsWindowVisible(IntPtr window);

    private async Task RunSmoke(string directory)
    {
        try
        {
            Directory.CreateDirectory(directory);
            File.Delete(Path.Combine(directory, "error.txt"));
            await Task.Delay(1800); Capture(Path.Combine(directory, "home.png"));
            var sid = Program.Argument("--session") ?? client.State.Sessions.FirstOrDefault()?["id"]?.ToString();
            if (sid is not null) { await client.JoinAsync(sid); await Task.Delay(3000); Capture(Path.Combine(directory, "room.png")); }
            if (sid is not null && Program.Arguments.Contains("--measure-idle"))
            {
                using var process = System.Diagnostics.Process.GetCurrentProcess();
                var cpu = process.TotalProcessorTime.TotalMilliseconds;
                var elapsed = System.Diagnostics.Stopwatch.StartNew();
                var seconds = int.TryParse(Program.Argument("--measure-idle"), out var duration) ? Math.Clamp(duration, 5, 60) : 5;
                await Task.Delay(TimeSpan.FromSeconds(seconds));
                process.Refresh();
                var milliseconds = process.TotalProcessorTime.TotalMilliseconds - cpu;
                await File.WriteAllTextAsync(Path.Combine(directory, "idle-performance.json"), new JsonObject
                {
                    ["elapsedSeconds"] = elapsed.Elapsed.TotalSeconds,
                    ["cpuMilliseconds"] = milliseconds,
                    ["cpuPercentOfOneCore"] = 100 * milliseconds / elapsed.Elapsed.TotalMilliseconds,
                    ["workingSetBytes"] = process.WorkingSet64,
                    ["privateMemoryBytes"] = process.PrivateMemorySize64,
                    ["participants"] = client.State.Users.Count(x => J.Text(x, "session") == sid),
                    ["mode"] = client.State.Mode,
                    ["unityRunning"] = threeD.IsRunning
                }.ToJsonString());
            }
            if (sid is not null && Program.Arguments.Contains("--smoke-3d"))
            {
                await ChangeMode("3d"); await Task.Delay(2500);
                if (!threeD.IsRunning || threeD.PlayerWindowHandle == IntPtr.Zero) throw new InvalidOperationException("Unity の埋め込み起動を確認できませんでした");
                await CaptureNative(Path.Combine(directory, "embedded.png"));
                var player = threeD.PlayerWindowHandle;
                ShowHome("items"); await Task.Delay(500);
                if (!context.HomeIsOpen || threeDOverlay is null && IsWindowVisible(player) || !threeD.IsRunning || client.State.SessionId != sid)
                    throw new InvalidOperationException("3D 表示中のホームシートを確認できませんでした");
                await CaptureNative(Path.Combine(directory, "embedded-menu.png"));
                ShowHome("close"); await Task.Delay(500);
                if (context.HomeIsOpen || !IsWindowVisible(player) || player != threeD.PlayerWindowHandle)
                    throw new InvalidOperationException("ホームシートから同じ Unity 画面への復帰を確認できませんでした");
                Width = 1100; Height = 720; await Task.Delay(500);
                await CaptureNative(Path.Combine(directory, "embedded-resized.png"));
                await File.WriteAllTextAsync(Path.Combine(directory, "embedded.json"), new JsonObject { ["running"] = threeD.IsRunning, ["embedded"] = (unitySurface?.Handle ?? IntPtr.Zero) != IntPtr.Zero, ["mode"] = client.State.Mode, ["playerWindow"] = threeD.PlayerWindowHandle.ToInt64(), ["resized"] = true, ["menuOverlayAndResume"] = true }.ToJsonString());
                await ChangeMode("2d"); await Task.Delay(300);
                if (threeD.IsRunning || client.State.Mode != "2d") throw new InvalidOperationException("2D への復帰を確認できませんでした");
                Capture(Path.Combine(directory, "returned-2d.png"));
            }
            await File.WriteAllTextAsync(Path.Combine(directory, "result.json"), new JsonObject { ["passed"] = true, ["connected"] = client.State.Connected, ["sync"] = client.State.SyncStatus, ["session"] = client.State.SessionId, ["users"] = client.State.Users.Count, ["items"] = client.State.Items.Count, ["media"] = media.Status }.ToJsonString());
        }
        catch (Exception e) { Environment.ExitCode = 1; Program.Log(e.ToString()); await File.WriteAllTextAsync(Path.Combine(directory, "error.txt"), e.ToString()); await File.WriteAllTextAsync(Path.Combine(directory, "result.json"), new JsonObject { ["passed"] = false, ["error"] = e.Message }.ToJsonString()); }
        finally { await Shutdown(); }
    }
}
