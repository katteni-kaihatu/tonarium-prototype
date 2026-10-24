using System.Net.WebSockets;
using System.Diagnostics;
using System.Threading.Channels;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Avalonia.Threading;

namespace Tonarium.Desktop.Core;

/// <summary>Native social WebSocket and authenticated KokoSync room connection.</summary>
public sealed class TonariumClient : IAsyncDisposable
{
    private readonly SemaphoreSlim homeSend = new(1);
    private readonly SemaphoreSlim roomSend = new(1);
    private readonly object roomGate = new();
    private readonly string settingsPath;
    private readonly bool persistSettings;
    private CancellationTokenSource? lifetime;
    private CancellationTokenSource? roomLifetime;
    private ClientWebSocket? home;
    private KokoSync.Client? room;
    private Task? homeLoop;
    private Task? roomLoop;
    private RoomInbox? roomInbox;
    private RoomDispatchDiagnostics? lastDispatchDiagnostics;
    public RoomDispatchDiagnostics? DispatchDiagnostics => roomInbox?.Diagnostics ?? lastDispatchDiagnostics;
    private JsonObject? syncConfig;
    private string? requestId;
    private long sendSequence, positionSequence;
    private readonly Queue<JsonObject> pending = new();
    private int roomGeneration;
    private volatile bool roomReady;
    private static readonly HashSet<string> RoomTypes = new(StringComparer.Ordinal)
    {
        "peerOperation", "sync", "mode", "status", "follow", "dropFollowers", "place2d", "displayMove", "chat",
        "avatar", "viewing", "poke", "sound", "liveRequest", "viewLive", "itemCreate", "attention", "broadcast",
        "world", "gameStart", "gameStep", "gameFell", "itemRemove", "itemMove", "itemAction", "hit"
    };
    private KokoSync.EventQueueDiagnostics? lastEventQueueDiagnostics;
    public KokoSync.EventQueueDiagnostics? EventQueueDiagnostics => room?.EventQueueDiagnostics ?? lastEventQueueDiagnostics;
    public double MaxPacketWaitMs { get; private set; }
    public double MaxUiQueueWaitMs { get; private set; }
    public double MaxUiApplyMs { get; private set; }
    public double MaxPacketDecodeMs { get; private set; }
    public double MaxBlobWaitMs { get; private set; }
    public ClientState State { get; }
    public event Action<JsonObject>? MessageReceived;

    public TonariumClient(ClientState? state = null, bool persistSettings = true)
    {
        State = state ?? new ClientState();
        this.persistSettings = persistSettings;
        settingsPath = Path.Combine(DesktopInstance.DataDirectory, "desktop.json");
        try
        {
            if (persistSettings && JsonNode.Parse(File.ReadAllText(settingsPath)) is JsonObject saved)
            {
                State.Name = Text(saved, "name", State.Name);
                State.SelfId = Text(saved, "selfId", State.SelfId);
                State.ServerUrl = Text(saved, "server", State.ServerUrl);
            }
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException) { }
        if (persistSettings && DesktopInstance.Number > 1 && !File.Exists(settingsPath))
        {
            // 追加ウィンドウは接続先だけ引き継ぎ、別のユーザーID・名前で参加する。
            try
            {
                if (JsonNode.Parse(File.ReadAllText(Path.Combine(DesktopInstance.RootDirectory, "desktop.json"))) is JsonObject primary)
                    State.ServerUrl = Text(primary, "server", State.ServerUrl);
            }
            catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException) { }
        }
    }

    public async Task ConnectAsync(string url, string name)
    {
        await DisconnectAsync();
        if (!Uri.TryCreate(url.Trim().TrimEnd('/') + "/", UriKind.Absolute, out var endpoint) ||
            endpoint.Scheme is not ("http" or "https" or "ws" or "wss"))
            throw new ArgumentException("接続先を http:// または https:// から入力してください。");
        var builder = new UriBuilder(endpoint) { Scheme = endpoint.Scheme is "https" or "wss" ? "https" : "http" };
        State.ServerUrl = builder.Uri.ToString().TrimEnd('/');
        State.Name = string.IsNullOrWhiteSpace(name) ? "ゲスト" : name.Trim()[..Math.Min(24, name.Trim().Length)];
        Persist();
        lifetime = new CancellationTokenSource();
        var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        homeLoop = RunHomeAsync(lifetime.Token, ready);
        await ready.Task.WaitAsync(TimeSpan.FromSeconds(20));
    }

    private async Task RunHomeAsync(CancellationToken ct, TaskCompletionSource ready)
    {
        var retries = 0;
        while (!ct.IsCancellationRequested)
        {
            using var socket = new ClientWebSocket();
            home = socket;
            socket.Options.KeepAliveInterval = TimeSpan.FromSeconds(20);
            try
            {
                await UiAsync(() => { State.ConnectionStatus = retries == 0 ? "接続しています…" : "再接続しています…"; State.LastError = null; });
                var endpoint = new UriBuilder(State.ServerUrl) { Scheme = State.ServerUrl.StartsWith("https:", StringComparison.Ordinal) ? "wss" : "ws", Path = "/ws" };
                await socket.ConnectAsync(endpoint.Uri, ct);
                await UiAsync(() => { State.Connected = true; State.ConnectionStatus = "接続済み"; });
                await SendHomeAsync(new JsonObject { ["t"] = "hello", ["id"] = State.SelfId, ["name"] = State.Name }, ct);
                if (State.SessionId is { } sid)
                {
                    await SendHomeAsync(new JsonObject { ["t"] = "join", ["sid"] = sid }, ct);
                    await PrepareSyncAsync();
                }
                retries = 0;
                ready.TrySetResult();
                var buffer = new byte[64 * 1024];
                while (socket.State == WebSocketState.Open && !ct.IsCancellationRequested)
                {
                    using var content = new MemoryStream();
                    WebSocketReceiveResult result;
                    do
                    {
                        result = await socket.ReceiveAsync(buffer, ct);
                        if (result.MessageType == WebSocketMessageType.Close) throw new IOException("ホームとの接続が終了しました。");
                        if (content.Length + result.Count > SessionPacket.MaxBytes) throw new IOException("ホームのデータが大きすぎます。");
                        content.Write(buffer, 0, result.Count);
                    } while (!result.EndOfMessage);
                    if (JsonNode.Parse(content.ToArray()) is JsonObject message) await ReceiveHomeAsync(message);
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                await UiAsync(() => { State.LastError = Friendly(ex); State.ConnectionStatus = "再接続を待っています"; });
                if (!ready.Task.IsCompleted) ready.TrySetException(new IOException(Friendly(ex)));
            }
            finally
            {
                if (ReferenceEquals(home, socket)) home = null;
                await StopRoomAsync();
                await UiAsync(() => State.Connected = false);
            }
            try { await Task.Delay(Math.Min(5000, 500 * (1 << Math.Min(retries++, 4))), ct); }
            catch (OperationCanceledException) { break; }
        }
    }

    public Task SendAsync(object msg)
    {
        var node = AsObject(msg);
        return RoomTypes.Contains(Text(node, "t")) ? SendRoomAsync(node) : SendHomeAsync(node, lifetime?.Token ?? CancellationToken.None);
    }

    private async Task SendHomeAsync(JsonObject message, CancellationToken ct)
    {
        var socket = home;
        if (socket?.State != WebSocketState.Open) throw new IOException("サーバーに接続してから操作してください。");
        var bytes = Encoding.UTF8.GetBytes(message.ToJsonString());
        await homeSend.WaitAsync(ct);
        try { await socket.SendAsync(bytes, WebSocketMessageType.Text, true, ct); }
        finally { homeSend.Release(); }
    }

    public async Task JoinAsync(string sid)
    {
        await StopRoomAsync();
        await SendHomeAsync(new JsonObject { ["t"] = "join", ["sid"] = sid }, lifetime?.Token ?? CancellationToken.None);
        await UiAsync(() => { State.SessionId = sid; State.Mode = "2d"; ResetRoomState(); });
        await PrepareSyncAsync();
    }

    public async Task LeaveAsync()
    {
        if (State.Connected) await SendHomeAsync(new JsonObject { ["t"] = "leave" }, lifetime?.Token ?? CancellationToken.None);
        await StopRoomAsync();
        await UiAsync(() => { State.SessionId = null; State.Mode = "2d"; ResetRoomState(); });
    }

    private void ResetRoomState()
    {
        State.Items = new(); State.Avatars = new(); State.Presence = new(); State.Chats = new(); State.Game = new();
        State.Broadcast = false; State.MicOn = false; State.Sharing = false; State.WorldPending = null;
        State.World = State.SessionInfo[State.SessionId ?? ""] is JsonObject info ? Text(info, "world", "room") : "room";
    }

    private async Task PrepareSyncAsync()
    {
        if (!State.Connected || State.SessionId is null) return;
        requestId = Guid.NewGuid().ToString();
        await UiAsync(() => State.SyncStatus = "connecting");
        // Native SDK relay path: server delivers interoperable positions and canvas deltas.
        await SendHomeAsync(new JsonObject { ["t"] = "prepareSync", ["requestId"] = requestId, ["peerPositions"] = false, ["peerDelivery"] = false }, lifetime?.Token ?? CancellationToken.None);
    }

    private async Task ReceiveHomeAsync(JsonObject message)
    {
        switch (Text(message, "t"))
        {
            case "syncConfig":
                if (Text(message, "requestId") == requestId && message["config"] is JsonObject config)
                    _ = ConfigureRoomAsync((JsonObject)config.DeepClone(), Text(message, "requestId"));
                return;
            case "syncError":
                if (Text(message, "requestId") == requestId)
                {
                    await UiAsync(() => { State.SyncStatus = "unavailable"; State.LastError = Text(message, "error"); });
                    _ = RetryRoomAsync(roomGeneration);
                }
                return;
            case "syncReset":
                if (Text(message, "sid") == State.SessionId) _ = RetryRoomAsync(roomGeneration);
                return;
        }
        await UiAsync(() => ApplyMessage(message), false);
    }

    private async Task ConfigureRoomAsync(JsonObject config, string configurationRequest)
    {
        if (configurationRequest != requestId || Text(config, "sid") != State.SessionId) return;
        var generation = await StopRoomAsync(clearPending: false);
        if (generation != roomGeneration || configurationRequest != requestId) return;
        await UiAsync(() => { if (generation == roomGeneration) State.SyncStatus = "connecting"; });
        if (generation != roomGeneration || configurationRequest != requestId) return;
        var cancellation = CancellationTokenSource.CreateLinkedTokenSource(lifetime?.Token ?? CancellationToken.None);
        lock (roomGate)
        {
            if (generation != roomGeneration) { cancellation.Dispose(); return; }
            roomLifetime = cancellation;
        }
        var ct = cancellation.Token;
        try
        {
            var endpoint = new UriBuilder(State.ServerUrl)
            {
                Scheme = State.ServerUrl.StartsWith("https:", StringComparison.Ordinal) ? "wss" : "ws",
                Path = "/sync/ws", Query = "token=" + Uri.EscapeDataString(Text(config, "token"))
            };
            // SDKの受信ループもUIのSynchronizationContextを引き継がないようにする。
            var origin = State.ServerUrl;
            var connection = await Task.Run(() => KokoSync.Client.ConnectWebSocketAsync(endpoint.Uri, ct,
                headers: new Dictionary<string, string> { ["Origin"] = origin }));
            var adopted = false;
            lock (roomGate)
            {
                if (generation == roomGeneration)
                {
                    room = connection; syncConfig = config;
                    sendSequence = positionSequence = 0;
                    adopted = true;
                }
            }
            if (!adopted) { await connection.DisposeAsync(); return; }
            await connection.JoinAsync(Text(config, "room"), Text(config, "peer"), ct: ct);
            lock (roomGate)
            {
                if (generation != roomGeneration) return;
                roomLoop = Task.Run(() => RunRoomAsync(connection, config, generation, ct));
            }
            await SendRoomAsync(new JsonObject { ["t"] = "sync" }, generation);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
        catch (Exception ex)
        {
            if (generation != roomGeneration) return;
            await UiAsync(() => { State.SyncStatus = "unavailable"; State.LastError = Friendly(ex); });
            _ = RetryRoomAsync(generation);
        }
    }

    // One lifetime owns the receiver, the ordered UI consumer and all blob transfers.
    // Neither network admission nor blob credit waits for the UI dispatcher.
    private async Task RunRoomAsync(KokoSync.Client connection, JsonObject config, int generation, CancellationToken parentToken)
    {
        using var stop = CancellationTokenSource.CreateLinkedTokenSource(parentToken);
        var ct = stop.Token;
        var inbox = new RoomInbox();
        roomInbox = inbox;
        var receiver = ReadRoomAsync(connection, config, inbox, ct);
        var consumer = ApplyRoomAsync(config, generation, inbox, ct);
        Exception? failure = null;
        try
        {
            var ended = await Task.WhenAny(receiver, consumer);
            await ended;
            if (!ct.IsCancellationRequested) failure = new IOException("Room receive stream ended.");
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
        catch (Exception ex) { failure = ex; }
        finally
        {
            if (generation == roomGeneration) roomReady = false;
            stop.Cancel();
            // The running session owns disposal. Close immediately on a budget/receive failure,
            // before waiting for UI error reporting or the retry delay.
            try { await connection.DisposeAsync(); }
            catch (Exception ex) { failure ??= ex; }
            try { await Task.WhenAll(receiver, consumer); }
            catch (OperationCanceledException) { }
            catch (Exception ex) { failure ??= ex; }
            try { await inbox.DrainAsync(); }
            catch (OperationCanceledException) { }
            catch (Exception ex) { failure ??= ex; }
            lastEventQueueDiagnostics = connection.EventQueueDiagnostics;
            lastDispatchDiagnostics = inbox.Diagnostics;
        }
        if (generation != roomGeneration || parentToken.IsCancellationRequested) return;
        Program.Log($"Room synchronization interrupted: {failure?.GetType().Name}; queue={lastEventQueueDiagnostics}");
        await UiAsync(() =>
        {
            if (generation != roomGeneration || parentToken.IsCancellationRequested) return;
            State.SyncStatus = "unavailable";
            State.LastError = failure is null ? "ルーム同期が終了しました。" : Friendly(failure);
        });
        _ = RetryRoomAsync(generation);
    }

    private async Task ReadRoomAsync(KokoSync.Client connection, JsonObject config, RoomInbox inbox, CancellationToken ct)
    {
        var key = Convert.FromBase64String(Text(config, "key"));
        var token = Text(config, "token");
        var sid = Text(config, "sid");
        var positions = new Dictionary<string, long>();
        await foreach (var frame in connection.Events(ct))
        {
            if (frame.GetValueOrDefault("peer") as string != Text(config, "server"))
            {
                if (frame.GetValueOrDefault("type") as string == "blob_open")
                    await connection.CancelBlobAsync((string)frame["transfer"]!, ct);
                continue;
            }
            var type = frame.GetValueOrDefault("type") as string;
            if (type == "blob_open")
            {
                var size = KokoSync.Client.Number(frame, "size");
                // A missing reliable packet requires a new snapshot, never skipping to later deltas.
                if (size > SessionPacket.MaxBytes) throw new IOException("Room blob exceeds packet limit.");
                inbox.Add((long)size, null, () => ReceiveBlobAsync(connection, frame, key, token, ct));
            }
            else if (frame.GetValueOrDefault("value") is Dictionary<string, object?> packet &&
                (type == "message" && frame.GetValueOrDefault("topic") as string == SessionPacket.Topic ||
                 type == "latest" && (frame.GetValueOrDefault("key") as string)?.StartsWith(SessionPacket.Topic + ":", StringComparison.Ordinal) == true))
            {
                if (packet.GetValueOrDefault("grant") as string != token) continue;
                var latest = type == "latest";
                var decoded = OpenRoomPacket(packet, key, token, latest);
                string? stream = null;
                if (latest)
                {
                    var message = decoded.Message!;
                    if (Text(message, "t") != "avatar" || Text(message, "sid") != sid) continue;
                    var id = Text(message, "id");
                    if (positions.GetValueOrDefault(id) >= decoded.Sequence) continue;
                    if (!positions.ContainsKey(id) && positions.Count >= 1024) throw new IOException("Room position stream limit exceeded.");
                    positions[id] = decoded.Sequence;
                    stream = id;
                }
                inbox.Add((packet.GetValueOrDefault("body") as byte[])?.Length ?? 0, stream, () => Task.FromResult(decoded));
            }
        }
    }

    private RoomPacket OpenRoomPacket(Dictionary<string, object?> packet, byte[] key, string token, bool latest)
    {
        var started = Stopwatch.GetTimestamp();
        var result = SessionPacket.Open(key, token, latest ? "server-position" : "server", packet);
        MaxPacketDecodeMs = Math.Max(MaxPacketDecodeMs, Stopwatch.GetElapsedTime(started).TotalMilliseconds);
        return new RoomPacket(result.Sequence, result.Value, latest);
    }

    private async Task<RoomPacket> ReceiveBlobAsync(KokoSync.Client connection, Dictionary<string, object?> frame, byte[] key, string token, CancellationToken ct)
    {
        var started = Stopwatch.GetTimestamp();
        try
        {
            using var stream = new MemoryStream();
            await connection.ReceiveBlobAsync(frame, stream, ct);
            return OpenRoomPacket(KokoSync.Wire.Decode(stream.ToArray(), SessionPacket.MaxBytes), key, token, false);
        }
        // Store failure in its ordered slot. The lifecycle also observes cancelled slots on shutdown.
        catch (Exception ex) { return new RoomPacket(0, null, false, ex); }
        finally { MaxBlobWaitMs = Math.Max(MaxBlobWaitMs, Stopwatch.GetElapsedTime(started).TotalMilliseconds); }
    }

    private async Task ApplyRoomAsync(JsonObject config, int generation, RoomInbox inbox, CancellationToken ct)
    {
        long receivedSequence = 0;
        var sid = Text(config, "sid");
        while (true)
        {
            var entries = new List<RoomEntry> { await inbox.ReadAsync(ct) };
            var packets = new List<RoomPacket>();
            // Blob occupies its original position; later deltas cannot overtake it.
            for (var i = 0; i < entries.Count; i++)
            {
                var packet = await entries[i].Packet.WaitAsync(ct);
                if (packet.Error is { } error) throw error;
                if (packet.Latest || packet.Sequence > receivedSequence)
                {
                    packets.Add(packet);
                    if (!packet.Latest) receivedSequence = packet.Sequence;
                }
                if (entries.Count < 32 && inbox.TryRead(out var next)) entries.Add(next!);
            }
            var firstSnapshot = false;
            var started = Stopwatch.GetTimestamp();
            await Dispatcher.UIThread.InvokeAsync(() =>
            {
                MaxUiQueueWaitMs = Math.Max(MaxUiQueueWaitMs, Stopwatch.GetElapsedTime(started).TotalMilliseconds);
                var applying = Stopwatch.GetTimestamp();
                // The check must happen in the callback, not only before it is queued.
                if (ct.IsCancellationRequested || generation != roomGeneration || State.SessionId != sid) return;
                foreach (var packet in packets)
                {
                    if (ct.IsCancellationRequested || generation != roomGeneration) return;
                    var message = packet.Message!;
                    if (packet.Latest) ApplyMessage(message, notify: false);
                    else if (Text(message, "kind") == "snapshot" && message["snapshot"] is JsonObject snapshot && Text(snapshot, "sid") == sid)
                    {
                        ApplySessionSnapshot(snapshot, notify: false);
                        if (ct.IsCancellationRequested || generation != roomGeneration) return;
                        firstSnapshot |= !roomReady;
                        roomReady = true;
                        State.SyncStatus = "connected"; State.LastError = null;
                    }
                    else if (Text(message, "kind") == "message" && message["message"] is JsonObject nested)
                        ApplyMessage(nested, notify: false);
                }
                if (packets.Count > 0) State.Touch();
                MaxUiApplyMs = Math.Max(MaxUiApplyMs, Stopwatch.GetElapsedTime(applying).TotalMilliseconds);
            }, DispatcherPriority.Background, ct);
            MaxPacketWaitMs = Math.Max(MaxPacketWaitMs, Stopwatch.GetElapsedTime(started).TotalMilliseconds);
            foreach (var entry in entries) inbox.Release(entry);
            ct.ThrowIfCancellationRequested();
            if (generation != roomGeneration) return;
            if (firstSnapshot)
            {
                await SendRoomAsync(new JsonObject { ["t"] = "mode", ["mode"] = State.Mode }, generation);
                await SendRoomAsync(new JsonObject { ["t"] = "status", ["micOn"] = State.MicOn, ["sharing"] = State.Sharing }, generation);
                JsonObject[] buffered;
                lock (pending) { buffered = pending.ToArray(); pending.Clear(); }
                foreach (var item in buffered)
                {
                    ct.ThrowIfCancellationRequested();
                    if (generation != roomGeneration) return;
                    await SendRoomAsync(item, generation);
                }
            }
        }
    }

    private sealed record RoomPacket(long Sequence, JsonObject? Message, bool Latest, Exception? Error = null);
    private sealed record RoomEntry(long Bytes, string? Stream, Task<RoomPacket> Packet);
    public sealed record RoomDispatchDiagnostics(long Received, long Coalesced, int PeakEntries, long PeakBytes, long PositionsWhileBlobPending);

    private sealed class RoomInbox
    {
        // Budget includes in-flight UI batches and blobs, measured as encrypted wire payload bytes.
        private const int MaxEntries = 256;
        private const long MaxBytes = 64L * 1024 * 1024;
        private readonly object gate = new();
        private readonly LinkedList<RoomEntry> queued = new();
        private readonly Dictionary<string, LinkedListNode<RoomEntry>> latest = new();
        private readonly HashSet<RoomEntry> outstanding = new();
        private readonly Channel<bool> available = Channel.CreateBounded<bool>(new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.DropWrite });
        private long bytes, received, coalesced, peakBytes, positionsWhileBlobPending;
        private int peakEntries;
        public RoomDispatchDiagnostics Diagnostics { get { lock (gate) return new(received, coalesced, peakEntries, peakBytes, positionsWhileBlobPending); } }
        public void Add(long size, string? stream, Func<Task<RoomPacket>> receive)
        {
            lock (gate)
            {
                received++;
                if (stream is not null && outstanding.Any(e => !e.Packet.IsCompleted)) positionsWhileBlobPending++;
                var previous = stream is not null && latest.TryGetValue(stream, out var node) ? node : null;
                var replacedBytes = previous?.Value.Bytes ?? 0;
                if (outstanding.Count - (previous is null ? 0 : 1) >= MaxEntries || bytes - replacedBytes + size > MaxBytes)
                    throw new IOException("Room updates exceeded the processing budget; retrieving latest state.");
                if (previous is not null)
                {
                    queued.Remove(previous); outstanding.Remove(previous.Value); bytes -= replacedBytes; coalesced++;
                }
                var entry = new RoomEntry(size, stream, receive());
                outstanding.Add(entry); bytes += size;
                var added = queued.AddLast(entry);
                // Reliable data is a barrier: never coalesce an avatar across a snapshot, removal or operation.
                if (stream is null) latest.Clear(); else latest[stream] = added;
                peakEntries = Math.Max(peakEntries, outstanding.Count); peakBytes = Math.Max(peakBytes, bytes);
                available.Writer.TryWrite(true);
            }
        }
        public bool TryRead(out RoomEntry? entry)
        {
            lock (gate)
            {
                if (queued.First is not { } node) { entry = null; return false; }
                entry = node.Value; queued.RemoveFirst();
                if (entry.Stream is { } stream && latest.GetValueOrDefault(stream) == node) latest.Remove(stream);
                return true;
            }
        }
        public async Task<RoomEntry> ReadAsync(CancellationToken ct)
        {
            while (true)
            {
                ct.ThrowIfCancellationRequested();
                if (TryRead(out var entry)) return entry!;
                await available.Reader.ReadAsync(ct);
            }
        }
        public void Release(RoomEntry entry) { lock (gate) { outstanding.Remove(entry); bytes -= entry.Bytes; } }
        public async Task DrainAsync()
        {
            Task<RoomPacket>[] tasks;
            lock (gate) tasks = outstanding.Select(e => e.Packet).ToArray();
            try { await Task.WhenAll(tasks); }
            finally { lock (gate) { queued.Clear(); outstanding.Clear(); latest.Clear(); bytes = 0; } }
        }
    }

    public Task SendRoomAsync(object msg) => SendRoomAsync(msg, roomGeneration);

    private async Task SendRoomAsync(object msg, int generation)
    {
        if (generation != roomGeneration) return;
        var message = AsObject(msg);
        if (State.SessionId is null) return;
        var type = Text(message, "t");
        if (type == "mode") await UiAsync(() => { if (generation == roomGeneration) State.Mode = Text(message, "mode", "2d"); });
        if (type == "status") await UiAsync(() => { if (generation == roomGeneration) { State.MicOn = Boolean(message, "micOn"); State.Sharing = Boolean(message, "sharing"); } });
        if (generation != roomGeneration) return;
        if (!roomReady && type != "sync")
        {
            if (type is "avatar" or "viewing" or "mode" or "status") return;
            lock (pending)
            {
                if (pending.Count >= 128) throw new IOException("同期を待っています。接続後にもう一度操作してください。");
                pending.Enqueue((JsonObject)message.DeepClone());
            }
            return;
        }
        var connection = room;
        var config = syncConfig;
        if (connection is null || config is null) return;
        var ct = roomLifetime?.Token ?? CancellationToken.None;
        await roomSend.WaitAsync(ct);
        try
        {
            if (generation != roomGeneration) return;
            // サーバーは描いた本人へ差分を返さないため、Web版と同じく手元にも適用する。
            if (type == "itemAction" && message["action"] is JsonObject action &&
                Text(action, "a") is "strokeStart" or "strokeAdd" or "canvasClear")
            {
                var local = (JsonObject)message.DeepClone();
                local["sid"] = State.SessionId; local["by"] = State.SelfId;
                await UiAsync(() => { if (generation == roomGeneration) ApplyMessage(local); }, false);
            }
            var position = type == "avatar";
            // 自分の位置はサーバーから返らないので、音量・距離判定にも即座に反映する。
            if (position && message["s"] is JsonObject avatar)
                await UiAsync(() => { if (generation == roomGeneration) State.Avatars[State.SelfId] = avatar.DeepClone(); });
            ct.ThrowIfCancellationRequested();
            if (generation != roomGeneration) return;
            var sequence = position ? ++positionSequence : ++sendSequence;
            var packet = SessionPacket.Seal(Convert.FromBase64String(Text(config, "key")), Text(config, "token"), position ? "client-position" : "client", sequence, message);
            if (position) await connection.LatestAsync(SessionPacket.Topic, packet, (ulong)sequence, ct);
            else
            {
                var encoded = KokoSync.Wire.Encode(packet, SessionPacket.MaxBytes);
                if (encoded.Length > SessionPacket.BlobThreshold)
                {
                    using var stream = new MemoryStream(encoded, false);
                    await connection.SendBlobAsync(Text(config, "server"), stream, (ulong)encoded.Length, ct);
                }
                else await connection.MessageAsync(SessionPacket.Topic, packet, ct);
            }
        }
        finally { roomSend.Release(); }
    }

    private async Task RetryRoomAsync(int generation)
    {
        try
        {
            await Task.Delay(1500, lifetime?.Token ?? CancellationToken.None);
            if (generation != roomGeneration || !State.Connected || State.SessionId is null) return;
            await StopRoomAsync();
            await PrepareSyncAsync();
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { await UiAsync(() => State.LastError = Friendly(ex)); }
    }

    private async Task<int> StopRoomAsync(bool clearPending = true)
    {
        int generation;
        CancellationTokenSource? cancellation;
        KokoSync.Client? old;
        Task? loop;
        lock (roomGate)
        {
            generation = Interlocked.Increment(ref roomGeneration);
            roomReady = false;
            cancellation = roomLifetime; roomLifetime = null;
            old = room; room = null; syncConfig = null;
            loop = roomLoop; roomLoop = null;
            roomInbox = null;
            if (clearPending) requestId = null;
        }
        cancellation?.Cancel();
        if (clearPending) lock (pending) pending.Clear();
        if (loop is not null) await loop;
        else if (old is not null)
        {
            // Configuration may be cancelled before the receiving session starts.
            lastEventQueueDiagnostics = old.EventQueueDiagnostics;
            try { await old.DisposeAsync(); } catch (Exception) { }
        }
        cancellation?.Dispose();
        await UiAsync(() => { if (generation == roomGeneration) State.SyncStatus = "off"; });
        return generation;
    }

    public async Task DisconnectAsync()
    {
        var cancellation = lifetime; lifetime = null;
        cancellation?.Cancel();
        home?.Abort();
        if (homeLoop is not null) { try { await homeLoop; } catch (Exception) { } homeLoop = null; }
        await StopRoomAsync();
        cancellation?.Dispose();
        await UiAsync(() => { State.Connected = false; State.ConnectionStatus = "未接続"; State.SessionId = null; ResetRoomState(); });
    }

    public void ApplySessionSnapshot(JsonObject snapshot) => ApplySessionSnapshot(snapshot, true);

    private void ApplySessionSnapshot(JsonObject snapshot, bool notify)
    {
        State.Chats = Array(snapshot, "chats");
        State.Avatars = Object(snapshot, "avatars");
        State.Presence = Object(snapshot, "presence");
        State.Items = new JsonObject();
        foreach (var item in Array(snapshot, "items").OfType<JsonObject>()) State.Items[Text(item, "id")] = item.DeepClone();
        State.Broadcast = Boolean(snapshot, "broadcast");
        State.World = Text(snapshot, "world", "room");
        State.Game = Object(snapshot, "game");
        State.ServerOffset = Number(snapshot, "now") - DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        MessageReceived?.Invoke(new JsonObject { ["t"] = "sessionSnapshot", ["s"] = snapshot.DeepClone() });
        if (notify) State.Touch();
    }

    /// <summary>All incoming protocol messages are applied on the UI thread.</summary>
    public void ApplyMessage(JsonObject message) => ApplyMessage(message, true);

    private void ApplyMessage(JsonObject message, bool notify)
    {
        var type = Text(message, "t");
        if (message["sid"] is not null && Text(message, "sid") != State.SessionId) return;
        switch (type)
        {
            case "snapshot":
                State.Snapshot = Object(message, "s");
                State.Users = Array(State.Snapshot, "users"); State.Friends = Array(State.Snapshot, "friends");
                State.Groups = Array(State.Snapshot, "groups"); State.Events = Array(State.Snapshot, "events");
                State.Sessions = Array(Object(State.Snapshot, "guild"), "sessions"); State.SessionInfo = Object(State.Snapshot, "sessions");
                State.ServerOffset = Number(State.Snapshot, "now") - DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(); break;
            case "users": State.Users = Array(message, "list"); break;
            case "sessions": State.Sessions = Array(message, "list"); break;
            case "friends": State.Friends = Array(message, "names"); break;
            case "groups": State.Groups = Array(message, "list"); break;
            case "events": State.Events = Array(message, "list"); break;
            case "sessionInfo": State.SessionInfo = Object(message, "sessions"); break;
            case "inbox":
                State.Conversations = Object(message, "convs"); State.Reads = Object(message, "reads"); State.People = Array(message, "people");
                State.Watching = Array(message, "watching"); State.RecentStatus = Array(message, "recentStatus");
                State.LastSeen ??= message["lastSeen"] is null ? null : Number(message, "lastSeen"); break;
            case "people": State.People = Array(message, "list"); break;
            case "watching": State.Watching = Array(message, "names"); State.RecentStatus = Array(message, "recentStatus"); break;
            case "msg":
                var conv = Text(message, "conv");
                if (State.Conversations[conv] is not JsonArray list) { list = new JsonArray(); State.Conversations[conv] = list; }
                Upsert(list, Object(message, "m"), 300); break;
            case "read":
                var key = Text(message, "conv"); State.Reads[key] = Math.Max(State.Reads[key]?.GetValue<long>() ?? 0, Number(message, "at")); break;
            case "presence": State.Presence = Object(message, "all"); break;
            case "avatar": State.Avatars[Text(message, "id")] = message["s"]?.DeepClone(); break;
            case "avatarRemove": State.Avatars.Remove(Text(message, "id")); break;
            case "item":
                var item = Object(message, "item"); State.Items[Text(item, "id")] = item; break;
            case "itemRemove": State.Items.Remove(Text(message, "id")); break;
            case "itemAction": ApplyItemDelta(Text(message, "id"), Object(message, "action"), Text(message, "by")); break;
            case "chat": Upsert(State.Chats, Object(message, "m"), 500); break;
            case "broadcast": State.Broadcast = Boolean(message, "on"); break;
            case "worldPending": State.WorldPending = (JsonObject)message.DeepClone(); break;
            case "world": State.World = Text(message, "world", "room"); State.WorldPending = null; break;
            case "game": State.Game = Object(message, "game"); break;
            case "gameTile":
                if (State.Game["tiles"] is not JsonObject tiles) { tiles = new(); State.Game["tiles"] = tiles; }
                tiles[Number(message, "tile").ToString()] = message["at"]?.DeepClone(); break;
            case "friendRequest": case "invite": case "askJoin": case "online": case "poke": case "hit": case "attention": case "liveRequest":
                if (type is not ("poke" or "hit") || Text(message, "to") == State.SelfId)
                {
                    var notice = (JsonObject)message.DeepClone(); notice["targetId"] = message["id"]?.DeepClone(); notice["noticeId"] = Guid.NewGuid().ToString(); notice["unread"] = true;
                    notice["at"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(); State.Notifications.Add(notice);
                    while (State.Notifications.Count > 100) State.Notifications.RemoveAt(0);
                }
                break;
        }
        MessageReceived?.Invoke((JsonObject)message.DeepClone());
        if (notify) State.Touch();
    }

    private void ApplyItemDelta(string id, JsonObject action, string by)
    {
        if (State.Items[id] is not JsonObject item || Text(item, "kind") != "canvas") return;
        if (item["strokes"] is not JsonArray strokes) { strokes = new(); item["strokes"] = strokes; }
        switch (Text(action, "a"))
        {
            case "canvasClear": item["strokes"] = new JsonArray(); break;
            case "strokeStart":
                strokes.Add(new JsonObject { ["id"] = Text(action, "id"), ["by"] = by, ["color"] = Text(action, "color"),
                    ["size"] = Math.Clamp(CanvasNumber(action["size"]), 1, 40), ["pts"] = new JsonArray(CanvasCoordinate(action["x"], 620), CanvasCoordinate(action["y"], 450)) });
                if (strokes.Count > 3000) strokes.RemoveAt(0); break;
            case "strokeAdd":
                var stroke = strokes.OfType<JsonObject>().LastOrDefault(s => Text(s, "id") == Text(action, "id") && Text(s, "by") == by);
                if (stroke?["pts"] is not JsonArray pts || pts.Count > 8000) break;
                var incoming = Array(action, "pts");
                for (var i = 0; i + 1 < incoming.Count; i += 2)
                { pts.Add(CanvasCoordinate(incoming[i], 620)); pts.Add(CanvasCoordinate(incoming[i + 1], 450)); }
                break;
        }
        item["updatedBy"] = by;
    }

    private static double CanvasNumber(JsonNode? value) => double.TryParse(value?.ToString(), System.Globalization.NumberStyles.Float,
        System.Globalization.CultureInfo.InvariantCulture, out var number) && double.IsFinite(number) ? number : 0;
    // JS の Math.round と同じく、非負のキャンバス座標は .5 を上へ丸める。
    private static double CanvasCoordinate(JsonNode? value, int limit) => Math.Floor(Math.Clamp(CanvasNumber(value), 0, limit) + .5);

    private static void Upsert(JsonArray list, JsonObject item, int limit)
    {
        var id = Text(item, "id");
        var index = list.Select((node, i) => (node, i)).FirstOrDefault(x => x.node is JsonObject o && Text(o, "id") == id).i;
        if (list.Any(node => node is JsonObject o && Text(o, "id") == id)) list[index] = item;
        else list.Add(item);
        while (list.Count > limit) list.RemoveAt(0);
    }

    private void Persist()
    {
        if (!persistSettings) return;
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(settingsPath)!);
            var temporary = settingsPath + ".tmp";
            File.WriteAllText(temporary, new JsonObject { ["selfId"] = State.SelfId, ["name"] = State.Name, ["server"] = State.ServerUrl }.ToJsonString());
            File.Move(temporary, settingsPath, true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
    }
    private Task UiAsync(Action action, bool notify = true)
    {
        void Apply() { action(); if (notify) State.Touch(); }
        if (Dispatcher.UIThread.CheckAccess()) { Apply(); return Task.CompletedTask; }
        return Dispatcher.UIThread.InvokeAsync(Apply).GetTask();
    }
    private static JsonObject AsObject(object value) => value is JsonObject obj ? obj : JsonSerializer.SerializeToNode(value)!.AsObject();
    private static string Text(JsonObject obj, string key, string fallback = "") => obj[key]?.ToString() ?? fallback;
    private static long Number(JsonObject obj, string key) => obj[key] is JsonValue value && value.TryGetValue<long>(out var n) ? n : (long)(obj[key]?.GetValue<double>() ?? 0);
    private static bool Boolean(JsonObject obj, string key) => obj[key] is JsonValue value && value.TryGetValue<bool>(out var b) && b;
    private static JsonArray Array(JsonObject obj, string key) => obj[key]?.DeepClone() as JsonArray ?? new();
    private static JsonObject Object(JsonObject obj, string key) => obj[key]?.DeepClone() as JsonObject ?? new();
    private static string Friendly(Exception ex) => ex is WebSocketException ? "サーバーとの接続を確認してください。" : ex is KokoSync.ProtocolException ? "ルーム同期の接続を確認してください。" : ex.Message;
    public async ValueTask DisposeAsync() { await DisconnectAsync(); homeSend.Dispose(); roomSend.Dispose(); }
}
