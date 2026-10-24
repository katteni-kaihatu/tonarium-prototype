using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using Avalonia.Controls;
using Avalonia.Threading;
using Tonarium.Desktop.Core;
using Tonarium.Desktop.ThreeD;
using Tonarium.Desktop.Views;

internal static class ThreeDLifecycleProbe
{
    private const BindingFlags Private = BindingFlags.Instance | BindingFlags.NonPublic;

    internal static async Task Run(string output, Action<string> pass, bool native)
    {
        using var preferences = DesktopInstance.Acquire(Path.Combine(output, "preferences"));
        var owner = new Window { Width = 600, Height = 400 };
        owner.Show();
        var hud = new ThreeDOverlayWindow(owner, new Panel(), () => null);
        hud.ShowForOwner();
        int requests = 0, ownerClosings = 0;
        hud.ShutdownRequested += () => requests++;
        EventHandler<WindowClosingEventArgs> cancelOwner = (_, e) => { ownerClosings++; e.Cancel = true; };
        owner.Closing += cancelOwner;
        owner.Close();
        Require(ownerClosings == 1 && requests == 0 && hud.IsVisible, "owner close recursively requested shutdown or detached HUD");
        hud.Close();
        Require(requests == 1 && ownerClosings == 1 && hud.IsVisible, "direct HUD close must only request shutdown");
        hud.CloseAndDetach();
        Require(requests == 1 && !hud.IsVisible, "programmatic HUD detach requested shutdown");
        owner.Closing -= cancelOwner; owner.Close();
        pass("Owner traversal, direct HUD close and programmatic detach have distinct responsibilities");

        foreach (bool viaHud in new[] { false, true })
        {
            var window = new MainWindow(); window.Show();
            var root = Field<Control>(window, "root");
            window.Content = null;
            var overlay = new ThreeDOverlayWindow(window, root, () => null);
            Set(window, "threeDOverlay", overlay);
            overlay.ShutdownRequested += () => _ = CallTask(window, "Shutdown");
            overlay.ShowForOwner();
            var host = Field<ThreeDHost>(window, "threeD");
            var gate = Field<SemaphoreSlim>(host, "lifecycle");
            await gate.WaitAsync();
            try
            {
                if (viaHud) overlay.Close(); else window.Close();
                var shutdown = Field<Task>(window, "shutdownTask");
                window.Close(); overlay.Close();
                Require(ReferenceEquals(shutdown, CallTask(window, "Shutdown")), "duplicate shutdown did not join the same Task");
                await Task.Delay(30);
                Require(window.IsVisible && overlay.IsVisible && !shutdown.IsCompleted, "window closed before host cleanup completed");
                gate.Release();
                await shutdown.WaitAsync(TimeSpan.FromSeconds(10));
                Require(!window.IsVisible && !overlay.IsVisible && ReferenceEquals(window.Content, root), "shutdown did not restore/detach root");
            }
            finally { if (gate.CurrentCount == 0) gate.Release(); }
            pass((viaHud ? "HUD" : "Parent") + " shutdown joins duplicate requests and waits for cleanup before closing");
        }

        await using (var client = new TonariumClient(persistSettings: false))
        await using (var host = new ThreeDHost(client))
        {
            int returned = 0;
            host.ReturnedTo2D += () => returned++;
            client.State.SessionId = "test-room"; client.State.Mode = "3d";
            Set(host, "sessionId", "test-room"); Set(host, "lifetime", new CancellationTokenSource());
            var writer = new StreamWriter(new MemoryStream()); writer.Dispose(); Set(host, "writer", writer);
            var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) }; timer.Start();
            Set(host, "presentationTimer", timer);
            await InstallClosedRoom(client);
            bool failed = false;
            try { await client.SendRoomAsync(new { t = "viewing", keys = Array.Empty<string>() }); }
            catch (Exception) { failed = true; }
            Require(failed, "fault injection must exercise a failing room send");
            var stop = host.StopAsync();
            Require(ReferenceEquals(stop, host.StopAsync()), "duplicate host stop did not join the same Task");
            await stop.WaitAsync(TimeSpan.FromSeconds(10));
            Require(returned == 1 && client.State.Mode == "2d" && !timer.IsEnabled, "disconnected stop did not restore local state exactly once");
            Require(Field<object?>(host, "lifetime") is null && Field<object?>(host, "writer") is null, "stop retained transport resources");
            await host.StopAsync();
            Require(returned == 1, "idle stop repeated the return event");
            Set(client, "room", null); Set(client, "roomReady", false);
            pass("Closed Unity writer and failed room send still clean up timers/transports and return to 2D once");

            Set(host, "lifetime", new CancellationTokenSource());
            Set(host, "sessionId", "test-room"); client.State.SessionId = null; client.State.Mode = "3d";
            await host.StopAsync();
            Require(returned == 2 && client.State.Mode == "2d", "session disconnect did not clean up active host");
            pass("Session disconnect returns local mode and releases the active host");
        }

        await using (var client = new TonariumClient(persistSettings: false))
        await using (var host = new ThreeDHost(client))
        {
            client.State.SessionId = "test-room"; client.State.Mode = "3d";
            await InstallClosedRoom(client);
            var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
            using var lifetime = new CancellationTokenSource();
            Set(host, "listener", listener); Set(host, "lifetime", lifetime); Set(host, "sessionId", "test-room");
            var receive = (Task)Call(host, "ReceiveAsync", lifetime.Token)!;
            Set(host, "receiveTask", receive);
            using var unity = new TcpClient(); await unity.ConnectAsync((IPEndPoint)listener.LocalEndpoint);
            using var writer = new StreamWriter(unity.GetStream()) { AutoFlush = true };
            using var reader = new StreamReader(unity.GetStream());
            await writer.WriteLineAsync("{\"t\":\"room\",\"message\":{\"t\":\"viewing\",\"keys\":[]}}");
            var notice = await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(5));
            Require(notice?.Contains("notice") == true, "failed send did not report a notice");
            bool inputReceived = false;
            host.InputStateChanged += locked => inputReceived = locked;
            await writer.WriteLineAsync("{\"t\":\"inputState\",\"locked\":true}");
            await Until(() => inputReceived);
            Require(!receive.IsCompleted && client.State.Mode == "3d", "room failure terminated the Unity bridge");
            await writer.WriteLineAsync("{\"t\":\"return2d\"}");
            await Until(() => client.State.Mode == "2d");
            await host.StopAsync();
            Set(client, "room", null); Set(client, "roomReady", false);
            pass("Failed room send preserves the Unity bridge, processes the next command and allows explicit return to 2D");
        }

        var previousPlayer = Environment.GetEnvironmentVariable("TONARIUM_UNITY_PLAYER");
        var invalidPlayer = Path.Combine(output, "invalid-player.exe");
        await File.WriteAllTextAsync(invalidPlayer, "not an executable");
        Environment.SetEnvironmentVariable("TONARIUM_UNITY_PLAYER", invalidPlayer);
        try
        {
            await using var client = new TonariumClient(persistSettings: false);
            await using var host = new ThreeDHost(client);
            client.State.SessionId = "test-room"; client.State.Mode = "3d";
            int returned = 0; host.ReturnedTo2D += () => returned++;
            bool failed = false;
            try { await host.StartAsync(); } catch (Exception) { failed = true; }
            Require(failed && returned == 1 && client.State.Mode == "2d" && Field<object?>(host, "listener") is null, "failed startup retained local state/resources");
            pass("Failed process startup unwinds listener, mode and return notification");
        }
        finally { Environment.SetEnvironmentVariable("TONARIUM_UNITY_PLAYER", previousPlayer); File.Delete(invalidPlayer); }

        if (!native) return;
        foreach (var scenario in new[] { "return2d", "unity-exit", "session-disconnect", "disconnected-close", "parent-close", "hud-alt-f4", "startup-close" })
            await NativeScenario(scenario, pass);
    }

    private static async Task NativeScenario(string scenario, Action<string> pass)
    {
        var window = new MainWindow(); window.Show();
        var client = Field<TonariumClient>(window, "client");
        Set(client, "persistSettings", false);
        Call(window, "LoadDemo"); client.State.SessionId = "lounge"; Call(window, "Refresh");
        var host = Field<ThreeDHost>(window, "threeD");
        int returned = 0; host.ReturnedTo2D += () => returned++;
        try
        {
            var start = CallTask(window, "ChangeMode", "3d");
            if (scenario == "startup-close")
            {
                window.Close();
                await CallTask(window, "Shutdown").WaitAsync(TimeSpan.FromSeconds(15));
                await start;
                Require(!host.IsRunning && !window.IsVisible, "startup continued after shutdown");
                pass("Native: shutdown during 3D startup cancels/joins startup"); return;
            }
            await start.WaitAsync(TimeSpan.FromSeconds(50));
            Require(host.IsRunning && host.PlayerWindowHandle != IntPtr.Zero, "Unity did not embed");
            var overlay = Field<ThreeDOverlayWindow>(window, "threeDOverlay");
            var process = Field<Process>(host, "player"); int pid = process.Id;
            if (scenario == "return2d") await CallTask(window, "ChangeMode", "2d");
            else if (scenario == "unity-exit") process.Kill();
            else if (scenario == "session-disconnect") { await client.DisconnectAsync(); Call(window, "Refresh"); }
            else if (scenario == "disconnected-close") { await InstallClosedRoom(client); window.Close(); }
            else if (scenario == "parent-close") { window.Close(); overlay.Close(); window.Close(); }
            else
            {
                overlay.Activate();
                // Alt+F4 is translated by DefWindowProc to WM_SYSCOMMAND/SC_CLOSE.
                PostMessage(overlay.TryGetPlatformHandle()!.Handle, 0x0112, new IntPtr(0xF060), IntPtr.Zero);
            }
            await Until(() => returned == 1 && !host.IsRunning);
            Require(client.State.Mode == "2d" && Field<object?>(window, "threeDOverlay") is null &&
                ReferenceEquals(window.Content, Field<object>(window, "root")), "native return retained overlay or Unity surface");
            Require(!Process.GetProcessesByName("Tonarium3D").Any(p => { using (p) return p.Id == pid; }), "Unity child process survived stop");
            await CallTask(window, "Shutdown").WaitAsync(TimeSpan.FromSeconds(10));
            Require(!window.IsVisible, "native window survived shutdown");
            pass("Native Unity: " + scenario + " cleans up once without recursion or surviving child process");
        }
        finally { await CallTask(window, "Shutdown").WaitAsync(TimeSpan.FromSeconds(15)); }
    }

    private static async Task InstallClosedRoom(TonariumClient client)
    {
        // A real WebSocket is opened then closed, retaining the failed SDK object
        // exactly as a room-disconnect race can do. No substitute send delegate.
        var reservation = new TcpListener(IPAddress.Loopback, 0); reservation.Start();
        int port = ((IPEndPoint)reservation.LocalEndpoint).Port; reservation.Stop();
        using var listener = new HttpListener(); listener.Prefixes.Add($"http://127.0.0.1:{port}/"); listener.Start();
        var connecting = KokoSync.Client.ConnectWebSocketAsync(new Uri($"ws://127.0.0.1:{port}/"));
        var context = await listener.GetContextAsync();
        using var socket = (await context.AcceptWebSocketAsync(null)).WebSocket;
        var room = await connecting;
        socket.Abort(); await room.DisposeAsync();
        Set(client, "room", room); Set(client, "roomReady", true);
        Set(client, "syncConfig", new JsonObject { ["key"] = Convert.ToBase64String(new byte[32]), ["token"] = "closed-room", ["server"] = "test" });
    }

    private static async Task Until(Func<bool> condition)
    {
        var watch = Stopwatch.StartNew();
        while (!condition()) { if (watch.Elapsed > TimeSpan.FromSeconds(15)) throw new TimeoutException("Lifecycle condition"); await Task.Delay(25); }
    }
    private static T Field<T>(object instance, string name) => (T)instance.GetType().GetField(name, Private)!.GetValue(instance)!;
    private static void Set(object instance, string name, object? value) => instance.GetType().GetField(name, Private)!.SetValue(instance, value);
    private static object? Call(object instance, string name, params object[] args) => instance.GetType().GetMethod(name, Private)!.Invoke(instance, args);
    private static Task CallTask(object instance, string name, params object[] args) => (Task)Call(instance, name, args)!;
    private static void Require(bool condition, string message) { if (!condition) throw new InvalidOperationException(message); }
    [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
}
