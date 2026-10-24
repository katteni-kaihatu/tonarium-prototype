using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Avalonia.Threading;
using Tonarium.Desktop.Core;
using Tonarium.Desktop.Media;

namespace Tonarium.Desktop.ThreeD;

public sealed partial class ThreeDHost : IAsyncDisposable
{
    private readonly TonariumClient client;
    private readonly SemaphoreSlim lifecycle = new(1);
    private readonly SemaphoreSlim writing = new(1);
    private readonly object lifecycleGate = new();
    private Task? startTask, stopTask, disposeTask, receiveTask;
    private CancellationTokenSource? startCancellation;
    private CancellationTokenSource? lifetime;
    private TcpListener? listener;
    private TcpClient? connection;
    private StreamWriter? writer;
    private Process? player;
    private TaskCompletionSource? ready;
    private volatile bool stopping;
    private bool disposed;
    private string? sessionId;
    private INativeMedia? media;
    private bool mediaAttached;
    private DispatcherTimer? presentationTimer;
    private string presentationSignature = "";
    private long lastSendFailure;
    public event Action? ReturnedTo2D;
    public event Action<string>? ItemRequested;
    public event Action<bool>? InputStateChanged;
    public bool UsesRelativePointer { get; private set; }
    public event Action? HomeRequested;
    public event Action? ChatRequested;
    public event Action? SidePanelsToggleRequested;
    public event Action? MediaPasteRequested;
    public event Action<string[]>? MediaFilesDropped;
    public bool IsRunning => player is { HasExited: false };
    public string? PlayerPath { get; private set; }
    public string? LastError { get; private set; }

    public ThreeDHost(TonariumClient client)
    {
        this.client = client;
        client.MessageReceived += ForwardMessage;
    }

    public void AttachMedia(INativeMedia nativeMedia)
    {
        if (mediaAttached && media is not null) media.VideoFrameJpeg -= ForwardVideoFrame;
        media = nativeMedia;
        mediaAttached = IsRunning && !stopping;
        if (mediaAttached) media.VideoFrameJpeg += ForwardVideoFrame;
    }

    public Task StartAsync(IntPtr parentWindow = default)
    {
        lock (lifecycleGate)
        {
            ObjectDisposedException.ThrowIf(disposed, this);
            if (startTask is { IsCompleted: false }) return startTask;
            startCancellation = new CancellationTokenSource();
            return startTask = StartCoreAsync(parentWindow, stopTask, startCancellation);
        }
    }

    private async Task StartCoreAsync(IntPtr parentWindow, Task? precedingStop, CancellationTokenSource starting)
    {
        await Task.Yield();
        if (precedingStop is not null) await precedingStop;
        await lifecycle.WaitAsync();
        try
        {
            starting.Token.ThrowIfCancellationRequested();
            if (IsRunning) return;
            if (client.State.SessionId is null) throw new InvalidOperationException("セッションに参加してから 3D に入ってください。");
            stopping = false; LastError = null;
            sessionId = client.State.SessionId;
            PlayerPath = FindPlayer();
            if (PlayerPath is null)
            {
                await BuildPlayerAsync(starting.Token);
                PlayerPath = FindPlayer();
            }
            if (PlayerPath is null) throw new FileNotFoundException("Unity プレイヤーがありません。native/build-unity.ps1 を実行してください。");
            starting.Token.ThrowIfCancellationRequested();
            lifetime = new CancellationTokenSource();
            ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            listener = new TcpListener(IPAddress.Loopback, 0); listener.Start(1);
            int port = ((IPEndPoint)listener.LocalEndpoint).Port;
            var info = new ProcessStartInfo(PlayerPath) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(PlayerPath)! };
            Tonarium.Desktop.Linux.LinuxInputMethod.ConfigureUnity(info);
            info.ArgumentList.Add("--tonarium-port"); info.ArgumentList.Add(port.ToString());
            info.ArgumentList.Add("-screen-fullscreen"); info.ArgumentList.Add("0");
            info.ArgumentList.Add("-screen-width"); info.ArgumentList.Add("1280");
            info.ArgumentList.Add("-screen-height"); info.ArgumentList.Add("800");
            var log = Path.Combine(DesktopInstance.DataDirectory, "unity-player.log");
            Directory.CreateDirectory(Path.GetDirectoryName(log)!);
            info.ArgumentList.Add("-logFile"); info.ArgumentList.Add(log);
            if (parentWindow != IntPtr.Zero)
            {
                info.ArgumentList.Add("-parentHWND"); info.ArgumentList.Add(parentWindow.ToInt64().ToString()); info.ArgumentList.Add("delayed");
                info.ArgumentList.Add("--tonarium-embedded");
            }
            player = Process.Start(info) ?? throw new InvalidOperationException("Unity プレイヤーを起動できませんでした。");
            player.EnableRaisingEvents = true;
            player.Exited += PlayerExited;
            receiveTask = ReceiveAsync(lifetime.Token);
            await ready.Task.WaitAsync(TimeSpan.FromSeconds(40), starting.Token);
            if (parentWindow != IntPtr.Zero)
            {
                await EmbedPlayerAsync(parentWindow, starting.Token);
                await SendAsync(new { t = "pointerWindow", hwnd = PlayerWindowHandle.ToInt64() });
            }
            starting.Token.ThrowIfCancellationRequested();
            await client.SendRoomAsync(new { t = "mode", mode = "3d" }).WaitAsync(starting.Token);
            starting.Token.ThrowIfCancellationRequested();
            if (media is not null) { media.VideoFrameJpeg += ForwardVideoFrame; mediaAttached = true; }
            await Dispatcher.UIThread.InvokeAsync(() =>
            {
                presentationTimer = new DispatcherTimer { Interval=TimeSpan.FromMilliseconds(100) };
                presentationTimer.Tick += (_,_) => ForwardPresentation();
                presentationTimer.Start(); ForwardPresentation();
            });
        }
        catch (Exception ex)
        {
            LastError = ex.Message;
            try { await ClosePlayerAsync(); }
            finally { await ReturnTo2DAsync(); }
            throw;
        }
        finally
        {
            lifecycle.Release();
            lock (lifecycleGate)
            {
                if (ReferenceEquals(startCancellation, starting)) startCancellation = null;
                starting.Dispose();
            }
        }
    }

    private async Task ReceiveAsync(CancellationToken ct)
    {
        try
        {
            connection = await listener!.AcceptTcpClientAsync(ct);
            connection.NoDelay = true;
            listener.Stop();
            writer = new StreamWriter(connection.GetStream(), new UTF8Encoding(false)) { AutoFlush = true };
            using var reader = new StreamReader(connection.GetStream(), Encoding.UTF8);
            while (!ct.IsCancellationRequested)
            {
                string? line = await reader.ReadLineAsync(ct);
                if (line is null) break;
                if (line.Length > 16 * 1024 * 1024) throw new IOException("Unity message is too large.");
                if (JsonNode.Parse(line) is not JsonObject message) continue;
                switch (message["t"]?.ToString())
                {
                    case "ready":
                        await SendSnapshotAsync().WaitAsync(ct);
                        ready?.TrySetResult();
                        break;
                    case "room" when message["message"] is JsonObject room:
                        if (room["action"] is JsonObject action && action["a"]?.ToString() == "camLive" &&
                            action["on"]?.GetValue<bool>() == true && media?.Connected != true)
                        {
                            await SendAsync(new { t = "notice", text = "通話に接続していないので配信できません" });
                            break;
                        }
                        await ForwardClientCommandAsync(() => client.SendRoomAsync(room), ct);
                        break;
                    case "home" when message["message"] is JsonObject home:
                        await ForwardClientCommandAsync(() => client.SendAsync(home), ct);
                        break;
                    case "cameraFrame" when media is NativeMedia native:
                        if (message["id"]?.ToString() is { } cameraId && message["jpeg"]?.ToString() is { Length: > 0 and < 2097152 } encoded)
                            native.SubmitCameraFrame(cameraId, Convert.FromBase64String(encoded));
                        break;
                    case "return2d":
                        _ = StopAsync();
                        return;
                    case "inputState":
                        UsesRelativePointer = message["relativeInput"]?.GetValue<bool>() == true;
                        await Dispatcher.UIThread.InvokeAsync(() => InputStateChanged?.Invoke(message["locked"]?.GetValue<bool>() == true));
                        break;
                    case "openHome":
                        await Dispatcher.UIThread.InvokeAsync(() => HomeRequested?.Invoke());
                        break;
                    case "focusChat":
                        await Dispatcher.UIThread.InvokeAsync(() => ChatRequested?.Invoke());
                        break;
                    case "toggleSidePanels":
                        await Dispatcher.UIThread.InvokeAsync(() => SidePanelsToggleRequested?.Invoke());
                        break;
                    case "pasteMedia":
                        await Dispatcher.UIThread.InvokeAsync(() => MediaPasteRequested?.Invoke());
                        break;
                    case "dropMedia":
                        if (message["paths"] is JsonArray paths)
                        {
                            var files = paths.Take(MediaAttachments.MaxFiles).Select(p => p?.GetValue<string>()).OfType<string>().ToArray();
                            await Dispatcher.UIThread.InvokeAsync(() => MediaFilesDropped?.Invoke(files));
                        }
                        break;
                    case "openItem":
                        if (message["id"]?.ToString() is { } itemId)
                            await Dispatcher.UIThread.InvokeAsync(() => ItemRequested?.Invoke(itemId));
                        break;
                }
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
        catch (Exception ex)
        {
            if (!stopping) { Program.Log("3D bridge failed: " + ex); LastError = ex.Message; ready?.TrySetException(ex); }
        }
        finally { if (!stopping && !ct.IsCancellationRequested) _ = StopAsync(); }
    }

    private async Task ForwardClientCommandAsync(Func<Task> send, CancellationToken ct)
    {
        try { await send().WaitAsync(ct); }
        catch (Exception error) when (!ct.IsCancellationRequested &&
            error is IOException or System.Net.WebSockets.WebSocketException or OperationCanceledException or
                ObjectDisposedException or TimeoutException or KokoSync.ProtocolException)
        {
            // 同期の再接続中もUnityとのローカル接続は維持する。失敗した操作は自動再送しない。
            var now = Environment.TickCount64;
            if (lastSendFailure == 0 || now - lastSendFailure > 3000)
            {
                lastSendFailure = now;
                Program.Log("3D command send failed; keeping player running: " + error.GetType().Name);
                await SendAsync(new { t = "notice", text = "操作を送信できませんでした。同期状態を確認して再度操作してください。" });
            }
        }
    }

    private async Task SendSnapshotAsync()
    {
        var snapshot = await Dispatcher.UIThread.InvokeAsync(() =>
        {
            var s = client.State;
            return new JsonObject
            {
                ["t"] = "snapshot", ["selfId"] = s.SelfId, ["name"] = s.Name,
                ["serverUrl"] = s.ServerUrl, ["sessionId"] = s.SessionId, ["world"] = s.World,
                ["users"] = s.Users.DeepClone(), ["avatars"] = s.Avatars.DeepClone(),
                ["items"] = s.Items.DeepClone(), ["presence"] = s.Presence.DeepClone(),
                ["chats"] = s.Chats.DeepClone(), ["game"] = s.Game.DeepClone(),
                ["now"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + s.ServerOffset
            };
        });
        await SendAsync(snapshot);
    }

    private async void ForwardMessage(JsonObject message)
    {
        if (writer is null || stopping) return;
        try
        {
            if (message["sid"] is { } sid && sid.ToString() != client.State.SessionId) return;
            if (message["t"]?.ToString() == "sessionSnapshot") await SendSnapshotAsync();
            else await SendAsync(message.DeepClone());
        }
        catch (Exception ex) when (ex is IOException or ObjectDisposedException or OperationCanceledException) { }
    }

    private async Task SendAsync(object message)
    {
        var target = writer;
        if (target is null) return;
        string json = message is JsonNode node ? node.ToJsonString() : JsonSerializer.Serialize(message);
        await writing.WaitAsync();
        try { if (ReferenceEquals(writer, target)) await target.WriteLineAsync(json); }
        finally { writing.Release(); }
    }

    private async void ForwardPresentation()
    {
        if(!IsRunning||stopping||writer is null)return;
        var users=(JsonArray)client.State.Users.DeepClone();
        foreach(var user in users.OfType<JsonObject>())
        {
            var id=J.Text(user,"id");
            if(media is NativeMedia native)user["speaking"]=native.IsSpeaking(id);
            if(client.State.Presence[id] is JsonObject presence)
                foreach(var pair in presence)user[pair.Key]=pair.Value?.DeepClone();
        }
        var signature=users.ToJsonString();if(signature==presentationSignature)return;
        presentationSignature=signature;
        try { await SendAsync(new JsonObject { ["t"]="users",["list"]=users }); }
        catch(Exception error) when(error is IOException or ObjectDisposedException or OperationCanceledException) { }
    }

    public Task ReleaseInputAsync()=>writer is null?Task.CompletedTask:SendAsync(new {t="releaseInput"});
    public Task SetOpenItemsAsync(IEnumerable<string> ids) => writer is null ? Task.CompletedTask : SendAsync(new { t = "nativeItems", ids = ids.ToArray() });
    public async Task CloseNativeChatAsync()
    {
        if (writer is null || stopping) return;
        try { await SendAsync(new { t = "nativeChatClosed" }); }
        catch (Exception error) when (error is IOException or ObjectDisposedException or OperationCanceledException)
        { Program.Log("3D chat closed after bridge disconnect: " + error.Message); }
    }

    private async void ForwardVideoFrame(string identity, byte[] jpeg)
    {
        if (stopping || writer is null) return;
        try { await SendAsync(new { t = "videoFrame", identity, jpeg = Convert.ToBase64String(jpeg) }); }
        catch (Exception ex) when (ex is IOException or ObjectDisposedException or OperationCanceledException) { }
    }

    public async Task TeleportAsync(double x, double z, double ry)
    {
        await SendAsync(new { t = "teleport", x, z, ry });
        await client.SendRoomAsync(new { t = "avatar", s = new { x, z, ry, y = 0 } });
    }

    public Task ResizeAsync(int width, int height, double scale = 1) => SendAsync(new { t = "resize", width = Math.Clamp(width, 160, 8192), height = Math.Clamp(height, 160, 8192), scale });

    public Task StopAsync()
    {
        lock (lifecycleGate)
        {
            if (stopTask is { IsCompleted: false }) return stopTask;
            stopping = true;
            startCancellation?.Cancel();
            return stopTask = StopCoreAsync();
        }
    }

    private async Task StopCoreAsync()
    {
        await Task.Yield();
        await lifecycle.WaitAsync();
        try
        {
            bool wasRunning = player is not null || lifetime is not null;
            stopping = true;
            try { await ClosePlayerAsync(); }
            finally { if (wasRunning) await ReturnTo2DAsync(); }
        }
        finally { lifecycle.Release(); }
    }

    private async Task ReturnTo2DAsync()
    {
        var previousSession = sessionId;
        sessionId = null;
        // Local state and ownership must be restored even if room synchronization
        // has disconnected. Reconnection will advertise this local mode again.
        await Dispatcher.UIThread.InvokeAsync(() =>
        {
            client.State.Mode = "2d";
            UsesRelativePointer = false;
            InputStateChanged?.Invoke(false);
            client.State.Touch();
            ReturnedTo2D?.Invoke();
        });
        if (previousSession is not null && previousSession == client.State.SessionId)
        {
            try { await client.SendRoomAsync(new { t = "mode", mode = "2d" }).WaitAsync(TimeSpan.FromSeconds(3)); }
            catch (Exception error) { Program.Log("3D stop: could not advertise 2D mode: " + error); }
        }
    }

    private async Task ClosePlayerAsync()
    {
        stopping = true;
        await Dispatcher.UIThread.InvokeAsync(()=> { presentationTimer?.Stop();presentationTimer=null;presentationSignature=""; });
        if (mediaAttached && media is not null) { media.VideoFrameJpeg -= ForwardVideoFrame; mediaAttached = false; }
        try
        {
            // Unityから先に終了した場合も、破棄済みの接続で2Dへの復帰を止めない。
            if (writer is not null)
            {
                try { await SendAsync(new { t = "shutdown" }).WaitAsync(TimeSpan.FromSeconds(1)); }
                catch (Exception error) when (error is IOException or ObjectDisposedException or OperationCanceledException or TimeoutException) { }
            }
        }
        finally
        {
            lifetime?.Cancel(); listener?.Stop(); connection?.Dispose(); writer = null;
            try
            {
                if (receiveTask is not null) await receiveTask;
                if (player is { HasExited: false })
                {
                    try { await player.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(3)); }
                    catch (TimeoutException)
                    {
                        try { player.Kill(entireProcessTree: true); }
                        catch (InvalidOperationException) when (player.HasExited) { }
                        await player.WaitForExitAsync();
                    }
                }
            }
            finally
            {
                if (player is not null) { player.Exited -= PlayerExited; player.Dispose(); player = null; }
                PlayerWindowHandle = IntPtr.Zero;
                lifetime?.Dispose(); lifetime = null; connection = null; listener = null; receiveTask = null; ready = null;
            }
        }
    }

    private void PlayerExited(object? sender, EventArgs e)
    {
        if (sender is Process exited) Program.Log($"Unity exited: code={exited.ExitCode}, requested={stopping}");
        ready?.TrySetException(new IOException($"Unity が終了しました。{Path.Combine(DesktopInstance.DataDirectory, "unity-player.log")} を確認してください。"));
        if (!stopping) _ = StopAsync();
    }

    private static string? FindPlayer()
    {
        string? configured = Environment.GetEnvironmentVariable("TONARIUM_UNITY_PLAYER");
        if (!string.IsNullOrWhiteSpace(configured) && File.Exists(configured)) return Path.GetFullPath(configured);
        foreach (var root in Roots())
            foreach (var relative in (OperatingSystem.IsLinux()
                ? new[] { "Tonarium3D.x86_64", "Unity/Tonarium3D.x86_64", "native/build/unity-linux/Tonarium3D.x86_64", "build/unity-linux/Tonarium3D.x86_64" }
                : new[] { "Tonarium3D.exe", "Unity/Tonarium3D.exe", "unity/Tonarium3D.exe", "build/unity/Tonarium3D.exe", "native/build/unity/Tonarium3D.exe" }))
            {
                var candidate = Path.Combine(root, relative);
                if (File.Exists(candidate)) return candidate;
            }
        return null;
    }

    private static IEnumerable<string> Roots()
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (string start in new[] { AppContext.BaseDirectory, Environment.CurrentDirectory })
            for (var directory = new DirectoryInfo(start); directory is not null; directory = directory.Parent)
                if (seen.Add(directory.FullName)) yield return directory.FullName;
    }

    private static async Task BuildPlayerAsync(CancellationToken ct)
    {
        string? project = Roots().SelectMany(r => new[] { Path.Combine(r, "native", "Tonarium.Unity"), Path.Combine(r, "Tonarium.Unity") })
            .FirstOrDefault(p => File.Exists(Path.Combine(p, "ProjectSettings", "ProjectVersion.txt")));
        if (OperatingSystem.IsLinux()) throw new FileNotFoundException("Tonarium 3D のLinuxビルドがありません。native/build-unity-linux.sh を実行するか、TONARIUM_UNITY_PLAYER を指定してください。");
        if (project is null) throw new FileNotFoundException("Tonarium 3D が見つかりません。TONARIUM_UNITY_PLAYER にプレイヤーのパスを設定してください。");
        var editor = Environment.GetEnvironmentVariable("TONARIUM_UNITY_EDITOR");
        if (string.IsNullOrWhiteSpace(editor))
        {
            string editorRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Unity", "Hub", "Editor");
            string requiredVersion = File.ReadLines(Path.Combine(project, "ProjectSettings", "ProjectVersion.txt"))
                .First(line => line.StartsWith("m_EditorVersion:", StringComparison.Ordinal)).Split(':', 2)[1].Trim();
            string candidate = Path.Combine(editorRoot, requiredVersion, "Editor", "Unity.exe");
            editor = File.Exists(candidate) ? candidate : null;
        }
        if (editor is null) throw new FileNotFoundException("Unity Editor がありません。Unity Hub で プロジェクト指定版の Unity と Windows Build Support をインストールしてください。");
        string log = Path.Combine(project, "build.log");
        var info = new ProcessStartInfo(editor) { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden };
        foreach (string arg in new[] { "-batchmode", "-nographics", "-quit", "-projectPath", project, "-executeMethod", "Tonarium.UnityClient.Editor.WindowsBuild.Build", "-logFile", log }) info.ArgumentList.Add(arg);
        using var process = Process.Start(info) ?? throw new IOException("Unity のビルドを起動できませんでした。");
        try { await process.WaitForExitAsync(ct); }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            try { if (!process.HasExited) process.Kill(entireProcessTree: true); }
            catch (InvalidOperationException) when (process.HasExited) { }
            await process.WaitForExitAsync();
            throw;
        }
        if (process.ExitCode != 0) throw new IOException("Unity のビルドに失敗しました。ログ: " + log);
    }

    public ValueTask DisposeAsync()
    {
        lock (lifecycleGate)
        {
            disposed = true;
            client.MessageReceived -= ForwardMessage;
            return new ValueTask(disposeTask ??= StopAsync());
        }
    }
}
