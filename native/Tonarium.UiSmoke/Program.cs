using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Automation;
using Avalonia.Headless;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using Avalonia.VisualTree;
using Tonarium.Desktop.Core;
using Tonarium.Desktop.Views;

internal static class Program
{
    private static readonly List<string> Checks = [];
    private static readonly List<object> Layouts = [];
    private static string output = "";

    [STAThread]
    public static int Main(string[] args)
    {
        var server = args.ElementAtOrDefault(0) ?? "http://localhost:3015";
        output = Path.GetFullPath(args.ElementAtOrDefault(1) ?? Path.Combine(AppContext.BaseDirectory, "ui-results"));
        Directory.CreateDirectory(output);
        File.Delete(Path.Combine(output, "result.json"));
        File.Delete(Path.Combine(output, "failure-state.png"));
        var builder = AppBuilder.Configure<Tonarium.Desktop.App>();
        if (args.Contains("--linux-ime") || args.Contains("--linux-form-ime") || args.Contains("--linux-3d-ime")) System.Diagnostics.Trace.Listeners.Add(new System.Diagnostics.ConsoleTraceListener());
        if (args.Contains("--linux-ime") || args.Contains("--linux-form-ime") || args.Contains("--linux-3d-ime")) builder = args.Contains("--ime-baseline")
            ? builder.UsePlatformDetect()
            : Tonarium.Desktop.Program.BuildAvaloniaApp();
        else if (args.Contains("--linux-voice") || args.Contains("--native-lifecycle") || args.Contains("--linux-platform") || args.Contains("--linux-online")) builder.UsePlatformDetect();
        else builder.UseSkia().UseHeadless(new AvaloniaHeadlessPlatformOptions { UseHeadlessDrawing = false });
        builder.SetupWithoutStarting();
        SynchronizationContext.SetSynchronizationContext(new AvaloniaSynchronizationContext());
        using var cancel = new CancellationTokenSource();
        Exception? failure = null;
        Dispatcher.UIThread.Post(async () =>
        {
            try
            {
                if (args.Contains("--linux-3d-ime")) await LinuxThreeDImeProbe.Run(output, Pass);
                else if (args.Contains("--linux-form-ime")) await LinuxFormImeProbe.Run(output, Pass);
                else if (args.Contains("--linux-ime")) await LinuxImeProbe.Run(output, Pass);
                else if (args.Contains("--linux-voice")) await LinuxVoiceProbe.Run(server, output, Pass);
                else if (args.Contains("--linux-online")) await LinuxOnlineProbe.Run(server, output, Pass);
                else if (args.Contains("--linux-platform")) await LinuxPlatformProbe.Run(output, Pass);
                else if (args.Contains("--3d-lifecycle")) await ThreeDLifecycleProbe.Run(output, Pass, args.Contains("--native-lifecycle"));
                else if (args.Contains("--audio-transmit")) await AudioTransmitProbe.Run(output, Pass);
                else if (args.Contains("--side-panels")) await SidePanelProbe.Run(output, Pass);
                else if (args.Contains("--chat-scroll")) await ChatScrollProbe.Run(output, Pass);
                else if (args.Contains("--audio-settings")) await AudioSettingsProbe.Run(output, Pass);
                else if (args.Contains("--items")) await ItemBehaviorProbe.Run(server, output, Pass);
                else if (args.Contains("--chess")) await ChessMoveProbe.Run(server, output, Pass,
                    args.Contains("--unity-chess") ? args.ElementAtOrDefault(Array.IndexOf(args, "--unity-chess") + 1) : null);
                else if (args.Contains("--canvas-sync")) await CanvasSyncProbe.Run(server, args.ElementAtOrDefault(3) ?? server, output, Pass);
                else if (args.Contains("--offline-avatar")) await AvatarProbe.VerifyOffline(server, output, Pass);
                else if (args.Contains("--chat-media")) await ChatMediaProbe.Run(server, output, Pass);
                else await Run(server, !args.Contains("--menu"));
            }
            catch (Exception error) { failure = error; Console.Error.WriteLine(error); }
            finally { cancel.Cancel(); }
        });
        Dispatcher.UIThread.MainLoop(cancel.Token);
        File.WriteAllText(Path.Combine(output, "result.json"), JsonSerializer.Serialize(new
        {
            passed = failure is null, checks = Checks, layouts = Layouts, error = failure?.ToString(),
            limitations = args.Contains("--linux-ime") || args.Contains("--linux-form-ime") || args.Contains("--linux-3d-ime")
                ? new[] { "Real X11/XWayland IME conversion; no server connection. IBus-only desktop is not exercised." }
                : args.Contains("--linux-voice")
                ? new[] { "Real Linux recorder/player and isolated local group channel; synthetic tone through a temporary null sink only." }
                : args.Contains("--linux-online")
                ? new[] { "Synthetic audio and camera frames only; no physical microphone or desktop captured.", "Dedicated temporary session only; the lounge is never joined." }
                : args.Contains("--linux-platform")
                ? new[] { "WebKit uses a local test page; external YouTube playback is a separate check.", "Audio uses a temporary null sink; no physical microphone or speaker is used." }
                : args.Contains("--native-lifecycle")
                ? new[] { "Real Windows windows and Unity processes; physical keyboard scan codes, OS logoff and unrelated GPU faults are not tested." }
                : new[] { "Headless native control input and Skia rendering; no physical IME or OS window-manager verification.", "LiveKit devices and Unity rendering are checked by separate integration checks." }
        }, new JsonSerializerOptions { WriteIndented = true }));
        return failure is null ? 0 : 1;
    }

    private static async Task Run(string server, bool verifyAvatar = true)
    {
        var suffix = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString()[^8..];
        var name = "UI確認 " + suffix;
        var peerName = "UI相手 " + suffix;
        var sessionName = "UIスモーク " + suffix;
        var main = new MainWindow();
        var client = Field<TonariumClient>(main, "client");
        // Keep a real login flow without modifying the developer's remembered identity.
        typeof(TonariumClient).GetField("persistSettings", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(client, false);
        client.State.SelfId = Guid.NewGuid().ToString();
        await using var peer = new TonariumClient(new ClientState(), persistSettings: false);
        try
        {
            main.Show(); await Settle();
            await Capture(main, "01-login", true);
            Type(main, Field<TextBox>(main, "serverInput"), server);
            Type(main, Field<TextBox>(main, "nameInput"), name);
            Click(main, "はじめる");
            await Until(() => client.State.Connected && Views<HomeView>(main).Any(), "login and native home");
            await Until(() => client.State.Snapshot.Count > 0, "home snapshot");
            await peer.ConnectAsync(server, peerName);
            await Until(() => client.State.Users.Any(u => J.Text(u, "name") == peerName), "peer appears in home presence");
            await Capture(main, "02-home", true);
            foreach (var page in new[] { "フレンド", "セッション", "イベント", "グループ", "ワールド", "アイテム", "ホーム" })
            {
                Click(main, b => Label(b) == page);
                await Capture(main, "03-nav-" + page, true);
            }
            Click(main, b => Label(b) == "グループ"); await Settle();
            Click(main, "グループを作る");
            await Until(() => main.OwnedWindows.Any(w => w.Title == "グループを作る"), "group form opens");
            var groupDialog = main.OwnedWindows.First(w => w.Title == "グループを作る");
            var groupName = "UIグループ " + suffix;
            Type(groupDialog, Views<TextBox>(groupDialog).Single(t => t.PlaceholderText == "グループ名"), groupName);
            Click(groupDialog, "作る");
            await Until(() => client.State.Groups.Any(g => J.Text(g, "name") == groupName), "group created from native form");
            await Capture(main, "03-group-created", true);
            Click(main, b => Label(b) == "イベント"); await Settle();
            Click(main, "イベントを作る");
            await Until(() => main.OwnedWindows.Any(w => w.Title == "イベントを作る"), "event form opens");
            var eventDialog = main.OwnedWindows.First(w => w.Title == "イベントを作る");
            var eventName = "UIイベント " + suffix;
            Type(eventDialog, Views<TextBox>(eventDialog).Single(t => t.PlaceholderText == "イベント名"), eventName);
            Click(eventDialog, "作る");
            await Until(() => client.State.Events.Any(e => J.Text(e, "title") == eventName), "event created from native form");
            await Capture(main, "03-event-created", true);
            Click(main, "月");
            await Capture(main, "03-event-calendar", true);
            Click(main, b => Label(b) == "ホーム"); await Settle();
            Click(main, "セッションを作る");
            await Until(() => main.OwnedWindows.Any(w => w.Title == "セッションを作る"), "session dialog opens");
            var dialog = main.OwnedWindows.First(w => w.Title == "セッションを作る");
            Type(dialog, Views<TextBox>(dialog).Single(t => t.PlaceholderText == "セッション名"), sessionName);
            Type(dialog, Views<TextBox>(dialog).Single(t => t.PlaceholderText == "何をする場所か（任意）"), "ネイティブUIの通常操作を確認");
            await Capture(dialog, "04-create-session", true);
            Click(dialog, "作る");
            await Until(() => client.State.Sessions.Any(s => J.Text(s, "name") == sessionName), "create session through UI");
            var sid = J.Text(client.State.Sessions.First(s => J.Text(s, "name") == sessionName), "id");
            Click(main, b => Label(b) == "セッション"); await Settle();
            await Until(() => Views<TextBlock>(main).Any(t => t.Text == sessionName), "new session visible in native session list");
            var card = Views<TextBlock>(main).First(t => t.Text == sessionName);
            var holder = card.GetVisualAncestors().OfType<Border>().First(b => Views<Button>(b).Any(x => Label(x) == "参加する"));
            Click(holder, "参加する");
            await Until(() => client.State.SessionId == sid && client.State.SyncStatus == "connected" && Views<RoomView>(main).Any(), "join session and KokoSync from UI");
            await peer.JoinAsync(sid);
            await Until(() => peer.State.SyncStatus == "connected", "second participant joins room");
            await Capture(main, "05-room", true);
            if(verifyAvatar)await AvatarProbe.Verify(main, client, peer, output, Pass);
            var chat = Views<TextBox>(main).Single(t => t.PlaceholderText?.Contains("声の届く範囲") == true);
            var chatText = "こんにちは、ネイティブから " + suffix;
            Type(main, chat, chatText);
            main.KeyPress(Key.Enter, RawInputModifiers.Shift, PhysicalKey.Enter, null);
            main.KeyRelease(Key.Enter, RawInputModifiers.Shift, PhysicalKey.Enter, null);
            main.KeyTextInput("二行目も送ります");
            if (chat.Text?.Replace("\r\n", "\n") != chatText + "\n二行目も送ります") throw new InvalidOperationException("Shift+Enter must add a newline: " + JsonSerializer.Serialize(chat.Text));
            Pass("Shift+Enter retains a multiline draft");
            chatText = chat.Text!;
            main.KeyPress(Key.Enter, RawInputModifiers.None, PhysicalKey.Enter, null);
            main.KeyRelease(Key.Enter, RawInputModifiers.None, PhysicalKey.Enter, null);
            await Until(() => peer.State.Chats.Any(c => J.Text(c, "text") == chatText) && string.IsNullOrEmpty(chat.Text), "Japanese room chat using keyboard Enter");
            await Capture(main, "06-room-chat", true);
            Click(main, "出す");
            await Until(() => main.OwnedWindows.Any(w => Views<TextBlock>(w).Any(t => t.Text == "所持アイテム")), "native inventory picker");
            var picker = main.OwnedWindows.First(w => Views<TextBlock>(w).Any(t => t.Text == "所持アイテム"));
            await Capture(picker, "07-inventory", true);
            Click(picker, b => Views<TextBlock>(b).Any(t => t.Text == "付箋"));
            await Until(() => client.State.Items.Any(p => J.Text(p.Value, "kind") == "note"), "spawn note through UI");
            picker.Close(); await Settle();
            var noteId = client.State.Items.First(p => J.Text(p.Value, "kind") == "note").Key;
            Click(main, "開く");
            await Until(() => main.OwnedWindows.OfType<ItemWindow>().Any(), "open native item window");
            var noteWindow = main.OwnedWindows.OfType<ItemWindow>().First();
            var note = Views<TextBox>(noteWindow).First(t => t.AcceptsReturn);
            Type(noteWindow, note, "共有付箋の自動保存\n二行目 " + suffix);
            await Until(() => J.Text(peer.State.Items[noteId], "text").Contains(suffix), "note autosave observed by second participant");
            await Capture(noteWindow, "08-note-autosave", true);
            await Capture(main, "08-room-item-strip", true);
            noteWindow.Close();
            await Settle();
            Click(main, peerName + " のプロフィール");
            await Until(() => main.OwnedWindows.OfType<ProfileWindow>().Any(), "other participant profile opens from native portrait");
            var otherProfile = main.OwnedWindows.OfType<ProfileWindow>().First();
            await Capture(otherProfile, "10-other-profile", true);
            Click(otherProfile, "フレンド申請");
            await Until(() => peer.State.Notifications.Any(n => J.Text(n, "from") == client.State.SelfId || J.Text(n, "name") == name || J.Text(n, "fromName") == name), "friend request from UI");
            await peer.SendAsync(new { t = "friendAccept", to = client.State.SelfId });
            await Until(() => client.State.Friends.Any(n => n?.ToString() == peerName), "friend accepted");
            otherProfile.Close();
            var sessionMenu = Views<SessionMenuView>(main).Single();
            var context=Field<NativeContext>(main,"context");
            var menuButton = Views<Button>(sessionMenu).First(b => Label(b) == "メニュー");
            var menuPoint=menuButton.TranslatePoint(new Point(22,22),main)!.Value;
            main.MouseMove(menuPoint);
            var menu = Field<HomeView>(sessionMenu,"navigation");
            await Until(() => menu.IsEffectivelyVisible && menu.Bounds.Height > 0, "hover opens shared sidebar");
            main.MouseDown(menuPoint,MouseButton.Left);main.MouseUp(menuPoint,MouseButton.Left);
            await Until(()=>context.HomeIsOpen,"physical click after hover opens home sheet");
            main.KeyPress(Key.Escape,RawInputModifiers.None,PhysicalKey.Escape,null);main.KeyRelease(Key.Escape,RawInputModifiers.None,PhysicalKey.Escape,null);
            main.MouseMove(new Point(450,300));await Settle();main.MouseMove(menuPoint);await Settle();
            foreach(var label in new[]{"ホーム","フレンド","セッション","イベント","グループ","ワールド","アイテム","セッションから離脱","プロフィールを設定"})
                if(!Views<Button>(menu).Any(b=>Label(b)==label))throw new Exception("Missing menu action: "+label);
            Pass("Hamburger includes all seven pages, groups, profile, status, modes and leave action");
            using(var frame=new RenderTargetBitmap(new PixelSize((int)menu.Bounds.Width,(int)menu.Bounds.Height),new Vector(96,96))){frame.Render(menu);frame.Save(Path.Combine(output,"09-menu-sidebar.png"));}
            Click(menu,"ステータスを変える");
            await Until(()=>main.OwnedWindows.Any(w=>w.Title=="ステータス"),"status editor opens from hamburger");
            var statusDialog=main.OwnedWindows.First(w=>w.Title=="ステータス");
            Type(statusDialog,Views<TextBox>(statusDialog).Single(t=>t.PlaceholderText=="いまの気分、ひとこと"),"メニュー動作確認");Click(statusDialog,"保存");
            await Until(()=>client.State.Users.Any(u=>J.Text(u,"name")==name&&J.Text(u,"statusText")=="メニュー動作確認"),"status saves through real server");
            sessionMenu.OpenNavigation();await Settle();
            var groupButton=Views<Button>(menu).Single(b=>AutomationProperties.GetName(b)==groupName);
            groupButton.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            await Until(()=>context.HomeIsOpen&&context.HomeRoute.StartsWith("group:"),"group opens in same-window home sheet");
            if(client.State.SessionId!=sid)throw new Exception("Opening home left the session");
            await Capture(main,"09-menu-group-sheet",true);
            main.KeyPress(Key.Escape,RawInputModifiers.None,PhysicalKey.Escape,null);main.KeyRelease(Key.Escape,RawInputModifiers.None,PhysicalKey.Escape,null);
            await Until(()=>!context.HomeIsOpen,"Escape closes sheet");
            Click(main,"メニュー");
            await Until(()=>context.HomeIsOpen&&context.HomeRoute.StartsWith("group:"),"hamburger reopens last visited page");
            foreach(var label in new[]{"ホーム","セッション","イベント","グループ","ワールド","アイテム","フレンド"})
            {
                Click(Field<HomeView>(main,"overlayView"),label);await Settle();
                if(client.State.SessionId!=sid)throw new Exception("Menu navigation left the room");
            }
            Pass("All seven hamburger routes work without leaving the session");
            var overlay = main;
            var social=Field<HomeView>(main,"overlayView");
            Click(social, b => Label(b) == "フレンド"); await Settle();
            Click(social, "すべて"); await Settle();
            var draft = Views<TextBox>(social).Single(t => t.PlaceholderText?.EndsWith("にメッセージを送信") == true);
            Type(overlay, draft, "DMも送れるよ " + suffix);
            Click(social, b => Label(b).StartsWith("送信"));
            var conv = "dm:" + string.Join('\0', new[] { name, peerName }.Order(StringComparer.Ordinal));
            await Until(() => peer.State.Conversations[conv] is JsonArray messages && messages.Any(m => J.Text(m, "text").Contains(suffix)), "direct message using native composer");
            await Settle();
            draft = Views<TextBox>(social).Single(t => t.PlaceholderText?.EndsWith("にメッセージを送信") == true);
            var keyboardDm = "Ctrl Enter送信 " + suffix;
            Type(overlay, draft, keyboardDm);
            overlay.KeyPress(Key.Enter, RawInputModifiers.Control, PhysicalKey.Enter, null);
            overlay.KeyRelease(Key.Enter, RawInputModifiers.Control, PhysicalKey.Enter, null);
            await Until(() => peer.State.Conversations[conv] is JsonArray keyboardMessages && keyboardMessages.Any(m => J.Text(m, "text") == keyboardDm), "direct message using Ctrl+Enter");
            await Capture(overlay, "09-social-dm", true);
            Click(social, "プロフィールを設定");
            await Until(() => main.OwnedWindows.OfType<ProfileWindow>().Any(), "profile opens from home");
            var profile = main.OwnedWindows.OfType<ProfileWindow>().First();
            var bio = Views<TextBox>(profile).Single(t => t.PlaceholderText == "プロフィールに表示されます");
            Type(profile, bio, "ネイティブプロフィール " + suffix);
            Click(profile, "自己紹介を保存");
            await Until(() => Views<TextBlock>(profile).Any(t => t.Text?.Contains("保存しました") == true), "profile bio saved through native UI");
            await Capture(profile, "10-self-profile", true);
            profile.Close(); Click(main,"ホームを閉じる"); await Settle();
            main.Width = 1000; main.Height = 640; await Settle();
            await Capture(main, "11-room-minimum", true);
            main.Width = 1360; main.Height = 880; main.SetRenderScaling(1.5); await Settle();
            await Capture(main, "12-room-150dpi", true);
            main.SetRenderScaling(1); await Settle();
            Click(main,"メニュー");await Settle();
            main.Width=1000;main.Height=640;await Capture(main,"12-menu-minimum",true);
            Click(main,"セッションから離脱");
            await Until(() => client.State.SessionId is null && Views<HomeView>(main).Any(), "leave room and return to native home");
            await Capture(main, "13-return-home", true);
            main.Width = 1000; main.Height = 640;
            await Capture(main, "14-home-minimum", true);
            Pass("All native UI happy-path interactions completed");
        }
        catch
        {
            await Capture(main, "failure-state", false);
            throw;
        }
        finally
        {
            foreach (var child in main.OwnedWindows.ToArray()) child.Close();
            await peer.LeaveAsync();
            main.Close();
            await Task.Delay(300);
        }
    }

    private static T Field<T>(object target, string name) => (T)target.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(target)!;
    private static IEnumerable<T> Views<T>(Visual root) where T : Visual => root.GetVisualDescendants().Prepend(root).OfType<T>();
    private static string Label(Button button)
    {
        if(AutomationProperties.GetName(button) is {Length:>0} accessible)return accessible;
        var text = (button.Content as string ?? string.Join(" ", Views<TextBlock>(button).Where(t => t.IsEffectivelyVisible).Select(t => t.Text))).Trim();
        return text.Length > 0 ? text : AutomationProperties.GetName(button) ?? ToolTip.GetTip(button)?.ToString() ?? "";
    }
    private static void Click(Visual root, string text) => Click(root, b => Label(b) == text);
    private static void Click(Visual root, Func<Button, bool> match)
    {
        var button = Views<Button>(root).FirstOrDefault(b => b.IsEffectivelyVisible && b.IsEnabled && match(b))
            ?? throw new InvalidOperationException("Button missing; available: " + string.Join(" | ", Views<Button>(root).Where(b => b.IsEffectivelyVisible).Select(Label)));
        button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
    }
    private static void Type(Window window, TextBox box, string text)
    {
        box.BringIntoView(); box.Focus(); box.SelectAll(); window.KeyTextInput(text);
        if (box.Text != text) throw new InvalidOperationException("Text input failed: " + box.PlaceholderText + " => " + box.Text);
    }
    private static async Task Until(Func<bool> condition, string check)
    {
        var until = DateTime.UtcNow.AddSeconds(35);
        while (DateTime.UtcNow < until)
        {
            if (condition()) { Pass(check); await Settle(); return; }
            await Task.Delay(70);
        }
        throw new TimeoutException(check);
    }
    private static void Pass(string check) { Checks.Add(check); Console.WriteLine("PASS " + check); }
    private static async Task Settle() { await Task.Delay(150); AvaloniaHeadlessPlatform.ForceRenderTimerTick(2); }
    private static async Task Capture(Window window, string name, bool checkBounds)
    {
        await Settle();
        var file = Path.Combine(output, name + ".png");
        using var frame = window.CaptureRenderedFrame() ?? throw new InvalidOperationException("No rendered frame: " + name);
        frame.Save(file);
        var size = window.ClientSize;
        var outOfBounds = new List<string>();
        // Scrollable content may intentionally be offscreen. Check persistent controls and dialogs,
        // while excluding descendants whose viewport clips them as part of normal scrolling.
        foreach (var control in Views<Control>(window).Where(c => c is Button or TextBox or ComboBox))
        {
            if (!control.IsEffectivelyVisible || control.Bounds.Width <= 0 || control.Bounds.Height <= 0) continue;
            if (control.GetVisualAncestors().Any(p => p is ScrollViewer)) continue;
            if (control.TranslatePoint(default, window) is not { } point) continue;
            if (point.X < -1 || point.Y < -1 || point.X + control.Bounds.Width > size.Width + 1 || point.Y + control.Bounds.Height > size.Height + 1)
                outOfBounds.Add($"{control.GetType().Name}: {(control is Button b ? Label(b) : (control as TextBox)?.PlaceholderText)} @ {point} {control.Bounds.Size}");
        }
        Layouts.Add(new { name, size = size.ToString(), image = file, outOfBounds });
        if (checkBounds && outOfBounds.Count > 0) throw new InvalidOperationException(name + " clipped controls: " + string.Join("; ", outOfBounds));
        Pass("render and persistent control bounds: " + name);
    }
}
