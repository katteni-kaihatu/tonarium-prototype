using System.Collections.Concurrent;
using System.Net.Http;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Layout;
using Avalonia.Input;
using Avalonia.Threading;
using LiveKit.Proto;
using LiveKit.Rtc;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;
using SkiaSharp;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Tonarium.Desktop.Core;
using Tonarium.Desktop.Views;
using RoomOptions = LiveKit.Rtc.RoomOptions;
using TrackPublishOptions = LiveKit.Rtc.TrackPublishOptions;

namespace Tonarium.Desktop.Media;

/// <summary>A single native media session, retained while switching between 2D and Unity.</summary>
public sealed partial class NativeMedia : INativeMedia
{
    private readonly TonariumClient client;
    private readonly SemaphoreSlim gate = new(1);
    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(20) };
    private readonly ConcurrentDictionary<string, VideoFeed> video = new();
    private readonly ConcurrentDictionary<string, TrackReader> readers = new();
    private readonly ConcurrentDictionary<string, bool> speakers = new();
    private readonly ConcurrentDictionary<string, long> videoSentAt = new();
    private Room? room;
    private NativeAudioCapture? microphone, loopback;
    private LocalAudioTrack? microphoneTrack, loopbackTrack;
    private DesktopCapture? desktop;
    private LocalVideoTrack? desktopTrack;
    private string? microphoneSid, desktopSid, loopbackSid;
    private NativeAudioOutput? output;
    private MixingSampleProvider? mixer;
    private string? session, microphoneDevice, speakerDevice;
    private volatile bool closing;
    private bool disposed;
    private bool microphoneWanted;
    private readonly bool persistPreferences;
    private Dictionary<string, (double Volume, double Pan)> spatial = new();
    private string status = "音声: 未接続";
    private long receivedAudioFrames, receivedVideoFrames;
    private long selfSpeakingUntil;
    public string Status => status;
    public bool Connected => room?.IsConnected == true;
    public long ReceivedAudioFrames => Interlocked.Read(ref receivedAudioFrames);
    public long ReceivedVideoFrames => Interlocked.Read(ref receivedVideoFrames);
    public event Action? Changed;
    /// <summary>JPEG frames for the Unity bridge, encoded only while subscribed and in 3D, at most 5 fps per feed.</summary>
    public event Action<string, byte[]>? VideoFrameJpeg;

    public NativeMedia(TonariumClient client, bool? initialMicrophoneEnabled = null, bool persistPreferences = true)
    {
        this.client = client;
        this.persistPreferences = persistPreferences;
        microphoneWanted = initialMicrophoneEnabled ?? NativeSettings.GetBool("microphoneEnabled");
        microphoneDevice = NullIfEmpty(NativeSettings.GetString("microphoneDevice"));
        speakerDevice = NullIfEmpty(NativeSettings.GetString("speakerDevice"));
        client.State.Changed += UpdateSpatial;
        UpdateSpatial();
    }

    public bool IsSpeaking(string identity) => identity == client.State.SelfId
        ? microphone is not null && Stopwatch.GetTimestamp() < Interlocked.Read(ref selfSpeakingUntil)
        : speakers.TryGetValue(identity, out var on) && on;

    public async Task ConnectAsync(string sessionId)
    {
        await gate.WaitAsync();
        try
        {
            if (disposed || session == sessionId && Connected) return;
            var wantedMicrophone = microphoneWanted;
            await DisconnectCoreAsync();
            session = sessionId;
            closing = false;
            SetStatus("音声: 接続中…");
            var state = client.State;
            var url = $"{state.ServerUrl.TrimEnd('/')}/token?id={Uri.EscapeDataString(state.SelfId)}&name={Uri.EscapeDataString(state.Name)}&session={Uri.EscapeDataString(sessionId)}";
            using var response = await http.GetAsync(url);
            var payload = JsonNode.Parse(await response.Content.ReadAsStringAsync());
            var error = payload?["error"]?.ToString();
            if (!response.IsSuccessStatusCode || !string.IsNullOrEmpty(error))
                throw new InvalidOperationException(error ?? $"音声サーバー: HTTP {(int)response.StatusCode}");
            var livekitUrl = payload?["url"]?.ToString() ?? throw new InvalidOperationException("LiveKit URL がありません");
            var token = payload?["token"]?.ToString() ?? throw new InvalidOperationException("音声トークンがありません");
            room = new Room();
            room.TrackSubscribed += OnTrackSubscribed;
            room.TrackUnsubscribed += (_, e) => StopTrack(e.Publication.Sid, e.Participant.Identity, e.Publication.Name);
            room.TrackPublished += (_, _) => Dispatcher.UIThread.Post(SyncViewSubscriptions);
            room.ActiveSpeakersChanged += (_, e) =>
            {
                speakers.Clear(); foreach (var p in e.Speakers) speakers[p.Identity] = true;
                Dispatcher.UIThread.Post(() => Changed?.Invoke());
            };
            room.Reconnecting += (_, _) => SetStatus("音声: 再接続中…");
            room.Reconnected += (_, _) => SetStatus("音声: 接続済み");
            room.Disconnected += (_, _) => { if (!closing) SetStatus("音声の接続が切れました。マイクボタンで再接続できます"); };
            await room.ConnectAsync(livekitUrl, token, new RoomOptions { AutoSubscribe = true, Dynacast = true });
            SyncViewSubscriptions();
            SetStatus("音声: 接続済み");
            if (wantedMicrophone) await StartMicrophoneAsync();
            await ReportAsync();
        }
        catch (Exception ex)
        {
            await DisconnectCoreAsync();
            SetStatus($"音声: {SafeError(ex)}");
        }
        finally { gate.Release(); }
    }

    public async Task DisconnectAsync()
    {
        await gate.WaitAsync();
        try { await DisconnectCoreAsync(); SetStatus("音声: 未接続"); }
        finally { gate.Release(); }
    }

    private async Task DisconnectCoreAsync()
    {
        closing = true;
        await StopAllCamerasCoreAsync();
        await StopDesktopAsync();
        await StopMicrophoneAsync();
        var active = readers.Values.ToArray();
        foreach (var reader in active) reader.Lifetime.Cancel();
        var pending = active.Select(x => x.Task).ToArray();
        if (pending.Length > 0) await Task.WhenAll(pending);
        foreach (var reader in active) reader.Lifetime.Dispose();
        readers.Clear();
        if (room is not null)
        {
            try { await room.DisconnectAsync(); } catch (Exception) { }
            room.Dispose(); room = null;
        }
        output?.Stop(); output?.Dispose(); output = null; mixer = null;
        foreach (var feed in video.Values) feed.Clear();
        speakers.Clear(); session = null;
        await SetMediaStateAsync(false, false);
    }

    public async Task SetMicrophoneAsync(bool enabled)
    {
        microphoneWanted = enabled;
        if (persistPreferences) NativeSettings.SetBool("microphoneEnabled", enabled);
        if (enabled && !Connected && client.State.SessionId is { } sid) await ConnectAsync(sid);
        await gate.WaitAsync();
        try
        {
            if (!Connected) return;
            if (enabled) await StartMicrophoneAsync(); else await StopMicrophoneAsync();
            await ReportAsync();
        }
        catch (Exception ex) { await StopMicrophoneAsync(); SetStatus($"マイク: {SafeError(ex)}"); await ReportAsync(); }
        finally { gate.Release(); }
    }

    private async Task StartMicrophoneAsync()
    {
        if (microphone is not null || room?.LocalParticipant is null) return;
        microphone = new NativeAudioCapture(false, microphoneDevice);
        // Local mouth animation should not wait for the server's active-speaker round trip.
        // A short hold bridges gaps between syllables without changing the published audio.
        microphone.LevelAvailable += (rms, peak) =>
        {
            if (rms >= .008f && peak >= .025f)
                Interlocked.Exchange(ref selfSpeakingUntil, Stopwatch.GetTimestamp() + (long)(Stopwatch.Frequency * .18));
        };
        microphone.Failed += ex => SetStatus($"マイク: {SafeError(ex)}");
        microphoneTrack = LocalAudioTrack.Create("microphone", microphone.Source);
        microphoneSid = (await room.LocalParticipant.PublishTrackAsync(microphoneTrack, new TrackPublishOptions
        { Source = TrackSource.SourceMicrophone, Dtx = true, Red = true, AudioEncoding = new AudioEncodingOptions { MaxBitrate = 48000 } })).Sid;
        microphone.Start();
    }

    private async Task StopMicrophoneAsync()
    {
        if (microphone is not null) { await microphone.DisposeAsync(); microphone = null; }
        Interlocked.Exchange(ref selfSpeakingUntil, 0);
        if (microphoneTrack is not null)
        {
            if (room?.IsConnected == true && microphoneSid is not null) try { await room.LocalParticipant!.UnpublishTrackAsync(microphoneSid); } catch (Exception) { }
            microphoneTrack.Dispose(); microphoneTrack = null;
            microphoneSid = null;
        }
    }

    public async Task SetScreenShareAsync(bool enabled)
    {
        if (!enabled)
        {
            await gate.WaitAsync();
            try { await StopDesktopAsync(); await ReportAsync(); }
            finally { gate.Release(); }
            return;
        }
        if (!Connected && client.State.SessionId is { } sid) await ConnectAsync(sid);
        if (!Connected || desktop is not null) return;
        var choice = await ChooseScreenAsync();
        if (choice is null) return;
        await StartScreenShareAsync(choice.Value.Source, choice.Value.Audio);
    }

    private async Task StopFailedDesktopAsync(DesktopCapture failed, Exception error)
    {
        await gate.WaitAsync();
        try
        {
            if (!ReferenceEquals(desktop, failed)) return;
            await StopDesktopAsync(); await ReportAsync();
            SetStatus($"画面共有: {SafeError(error)}");
        }
        finally { gate.Release(); }
    }

    /// <summary>Also used by automated native media smoke checks without opening a chooser.</summary>
    public async Task StartScreenShareAsync(ScreenSource source, bool systemAudio = false)
    {
        await gate.WaitAsync();
        try
        {
            if (room?.LocalParticipant is null) return;
            await StopDesktopAsync();
            desktop = new DesktopCapture(source);
            desktop.Frame += frame => PushVideo(client.State.SelfId, "screen", frame);
            var sharing = desktop;
            desktop.Failed += ex => _ = StopFailedDesktopAsync(sharing, ex);
            desktopTrack = LocalVideoTrack.Create("screen", desktop.Source);
            desktopSid = (await room.LocalParticipant.PublishTrackAsync(desktopTrack, new TrackPublishOptions
            {
                Source = TrackSource.SourceScreenshare, Simulcast = false, VideoCodec = VideoCodec.Vp8,
                VideoEncoding = new VideoEncodingOptions { MaxBitrate = 2500000, MaxFramerate = 15 }
            })).Sid;
            desktop.Start();
            if (systemAudio)
            {
                loopback = new NativeAudioCapture(true, speakerDevice);
                loopback.Failed += ex => SetStatus($"PC 音声: {SafeError(ex)}");
                loopbackTrack = LocalAudioTrack.Create("screen-audio", loopback.Source);
                loopbackSid = (await room.LocalParticipant.PublishTrackAsync(loopbackTrack, new TrackPublishOptions
                { Source = TrackSource.SourceScreenshareAudio, AudioEncoding = new AudioEncodingOptions { MaxBitrate = 128000 } })).Sid;
                loopback.Start();
            }
            await ReportAsync();
        }
        catch (Exception ex) { await StopDesktopAsync(); SetStatus($"画面共有: {SafeError(ex)}"); await ReportAsync(); }
        finally { gate.Release(); }
    }

    private async Task StopDesktopAsync()
    {
        if (desktop is not null) { await desktop.DisposeAsync(); desktop = null; }
        if (loopback is not null) { await loopback.DisposeAsync(); loopback = null; }
        foreach (var (track, sid) in new (LocalTrack? Track, string? Sid)[] { (desktopTrack, desktopSid), (loopbackTrack, loopbackSid) })
        {
            if (track is null) continue;
            if (room?.IsConnected == true && sid is not null) try { await room.LocalParticipant!.UnpublishTrackAsync(sid); } catch (Exception) { }
            track.Dispose();
        }
        desktopTrack = null; loopbackTrack = null;
        desktopSid = null; loopbackSid = null;
        VideoFrameJpeg?.Invoke(client.State.SelfId, []);
        if (video.TryGetValue(client.State.SelfId, out var feed)) feed.Clear();
        if (video.TryGetValue("screen", out feed)) feed.Clear();
    }

    private void OnTrackSubscribed(object? sender, TrackSubscribedEventArgs e)
    {
        if (closing) return;
        var reader = new TrackReader();
        // The .NET SDK leaves RemoteTrack.Sid empty; the publication carries the stable SID.
        if (!readers.TryAdd(e.Publication.Sid, reader)) { reader.Lifetime.Dispose(); return; }
        reader.Task = Task.Run(async () =>
        {
            try
            {
                if (e.Track is RemoteAudioTrack audio) await ReceiveAudioAsync(audio, e.Participant.Identity, e.Publication.Source, reader.Lifetime.Token);
                else if (e.Track is RemoteVideoTrack remoteVideo)
                {
                    using var stream = new VideoStream(remoteVideo, VideoBufferType.Bgra, 2);
                    await foreach (var frame in stream.WithCancellation(reader.Lifetime.Token))
                    {
                        Interlocked.Increment(ref receivedVideoFrames);
                        PushVideo(e.Participant.Identity, e.Publication.Name, frame.Frame);
                    }
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception ex) { if (!closing) SetStatus($"メディア: {SafeError(ex)}"); }
        });
    }

    private async Task ReceiveAudioAsync(RemoteAudioTrack track, string identity, TrackSource source, CancellationToken token)
    {
        var voice = source == TrackSource.SourceMicrophone;
        var buffer = new BufferedWaveProvider(new WaveFormat(48000, 16, 2))
        { BufferDuration = TimeSpan.FromMilliseconds(300), DiscardOnBufferOverflow = true, ReadFully = true };
        var input = buffer.ToSampleProvider();
        await Dispatcher.UIThread.InvokeAsync(() =>
        {
            if (mixer is null)
            {
                mixer = new MixingSampleProvider(WaveFormat.CreateIeeeFloatWaveFormat(48000, 2)) { ReadFully = true };
                output = new NativeAudioOutput(mixer.ToWaveProvider(), speakerDevice);
            }
            mixer.AddMixerInput(input);
        });
        double volume = voice ? 0 : 1, pan = 0;
        try
        {
            using var stream = new AudioStream(track, 48000, voice ? 1u : 2u, capacity: 6);
            await foreach (var e in stream.WithCancellation(token))
            {
                Interlocked.Increment(ref receivedAudioFrames);
                var target = voice ? (spatial.TryGetValue(identity, out var pos) ? pos : (Volume: 0d, Pan: 0d)) : (Volume: 1d, Pan: 0d);
                volume += (target.Volume - volume) * .2; pan += (target.Pan - pan) * .2;
                var pcm = e.Frame.DataArray;
                var stereo = new byte[e.Frame.SamplesPerChannel * 4];
                var leftGain = volume * Math.Min(1, 1 - pan);
                var rightGain = volume * Math.Min(1, 1 + pan);
                for (var i = 0; i < e.Frame.SamplesPerChannel; i++)
                {
                    var l = (short)(pcm[i * e.Frame.NumChannels] * leftGain);
                    var r = (short)(pcm[i * e.Frame.NumChannels + e.Frame.NumChannels - 1] * rightGain);
                    stereo[i * 4] = (byte)l; stereo[i * 4 + 1] = (byte)(l >> 8);
                    stereo[i * 4 + 2] = (byte)r; stereo[i * 4 + 3] = (byte)(r >> 8);
                }
                buffer.AddSamples(stereo, 0, stereo.Length);
            }
        }
        finally { await Dispatcher.UIThread.InvokeAsync(() => mixer?.RemoveMixerInput(input)); }
    }

    private void StopTrack(string sid, string identity, string name)
    {
        if (readers.TryRemove(sid, out var reader))
        {
            reader.Lifetime.Cancel();
            _ = reader.Task.ContinueWith(_ => reader.Lifetime.Dispose(), TaskScheduler.Default);
        }
        if (!name.StartsWith("camera:") && !name.StartsWith("view:") && video.TryGetValue(identity, out var identityFeed)) identityFeed.Clear();
        if (name.StartsWith("camera:") && video.TryGetValue(name[7..], out var cameraFeed)) cameraFeed.Clear();
        if (video.TryGetValue(name, out var feed)) feed.Clear();
        VideoFrameJpeg?.Invoke(name.StartsWith("camera:") || name.StartsWith("view:") ? name : identity, []);
    }

    private void PushVideo(string identity, string name, VideoFrame frame)
    {
        if (!name.StartsWith("camera:") && !name.StartsWith("view:") && video.TryGetValue(identity, out var identityFeed)) identityFeed.Push(frame);
        if (video.TryGetValue(name, out var feed)) feed.Push(frame);
        if (name.StartsWith("camera:") && video.TryGetValue(name[7..], out feed)) feed.Push(frame);
        if (name is "screen" or "screen_share" || name.Contains("screen", StringComparison.OrdinalIgnoreCase))
            if (video.TryGetValue("screen", out feed)) feed.Push(frame);
        var handler = VideoFrameJpeg;
        if (handler is null || client.State.Mode != "3d") return;
        var key = name.StartsWith("camera:") || name.StartsWith("view:") ? name : identity;
        var now = Stopwatch.GetTimestamp();
        if (videoSentAt.TryGetValue(key, out var before) && Stopwatch.GetElapsedTime(before, now).TotalMilliseconds < 200) return;
        videoSentAt[key] = now;
        using var bitmap = new SKBitmap(new SKImageInfo(frame.Width, frame.Height, SKColorType.Bgra8888, SKAlphaType.Opaque));
        Marshal.Copy(frame.DataBytes, 0, bitmap.GetPixels(), frame.DataBytes.Length);
        var width = Math.Min(960, frame.Width);
        var height = Math.Max(1, frame.Height * width / frame.Width);
        using var scaled = new SKBitmap(new SKImageInfo(width, height, SKColorType.Bgra8888, SKAlphaType.Opaque));
        bitmap.ScalePixels(scaled, new SKSamplingOptions(SKFilterMode.Linear));
        using var image = SKImage.FromBitmap(scaled);
        using var encoded = image.Encode(SKEncodedImageFormat.Jpeg, 70);
        handler(key, encoded.ToArray());
    }

    public Control CreateVideoView(string participantId) => new VideoSurface(video.GetOrAdd(participantId, _ => new VideoFeed()));

    private async Task ReportAsync() => await SetMediaStateAsync(microphone is not null, desktop is not null);
    private async Task SetMediaStateAsync(bool mic, bool sharing)
    {
        await Dispatcher.UIThread.InvokeAsync(() => { client.State.MicOn = mic; client.State.Sharing = sharing; client.State.Touch(); Changed?.Invoke(); });
        if (client.State.Connected && client.State.SessionId is not null)
            try { await client.SendAsync(new { t = "status", micOn = mic, sharing }); } catch (Exception) { }
    }

    private void SetStatus(string value) => Dispatcher.UIThread.Post(() => { status = value; Changed?.Invoke(); });
    private static string SafeError(Exception ex) => Regex.Replace(ex.GetBaseException().Message, @"eyJ[\w-]+\.[\w-]+\.[\w-]+", "[token]");

    private void UpdateSpatial()
    {
        var state = client.State;
        var people = state.Users.OfType<JsonObject>().Where(p => J.Text(p, "session") == state.SessionId).ToArray();
        var places = new Dictionary<string, (double X, double Z, double Ry)>();
        foreach (var person in people.Where(p => J.Text(p, "mode") == "3d"))
        {
            var id = J.Text(person, "id"); var a = state.Avatars[id];
            if (a is not null) places[id] = (J.Number(a, "x"), J.Number(a, "z"), J.Number(a, "ry"));
        }
        var followers = new Dictionary<string, int>(); var queue = 0;
        foreach (var person in people.Where(p => J.Text(p, "mode") != "3d"))
        {
            var id = J.Text(person, "id"); var presence = state.Presence[id];
            var follow = J.Text(presence, "follow", J.Text(person, "follow"));
            if (places.TryGetValue(follow, out var target))
            {
                followers.TryGetValue(follow, out var i); followers[follow] = i + 1;
                var side = (i % 2 == 1 ? -1 : 1) * Math.Ceiling(i / 2d) * .45;
                var back = .9 + Math.Floor(i / 3d) * .35;
                places[id] = (target.X + Math.Sin(target.Ry) * back + Math.Cos(target.Ry) * side,
                    target.Z + Math.Cos(target.Ry) * back - Math.Sin(target.Ry) * side, target.Ry);
            }
            else if (presence?["pos"] is JsonObject p) places[id] = (J.Number(p, "x"), J.Number(p, "z"), J.Number(p, "ry"));
            else { var radius = .45 * Math.Sqrt(queue); var angle = queue++ * 2.39996; places[id] = (Math.Sin(angle) * radius, 6.5 + Math.Cos(angle) * radius, 0); }
        }
        var gains = new Dictionary<string, (double Volume, double Pan)>();
        if (places.TryGetValue(state.SelfId, out var me))
        {
            var directional = state.Mode == "3d" || !string.IsNullOrEmpty(J.Text(state.Presence[state.SelfId], "follow"));
            foreach (var pair in places)
            {
                var dx = pair.Value.X - me.X; var dz = pair.Value.Z - me.Z; var distance = Math.Sqrt(dx * dx + dz * dz);
                var name = people.FirstOrDefault(p => J.Text(p, "id") == pair.Key);
                var blocked = name is not null && NativeSettings.BlockedNames.Contains(J.Text(name, "name"));
                var volume = blocked ? 0 : state.Broadcast ? 1 : Math.Pow(1 - Math.Clamp((distance - 2) / 13, 0, 1), 2);
                var pan = directional && distance > .3 ? (dx * Math.Cos(me.Ry) - dz * Math.Sin(me.Ry)) / distance * .8 : 0;
                gains[pair.Key] = (volume, pan);
            }
        }
        spatial = gains;
        SyncCameraTracks();
        SyncViewSubscriptions();
    }

    private void SyncViewSubscriptions()
    {
        if (closing || room?.IsConnected != true) return;
        var follow = J.Text(client.State.Presence[client.State.SelfId], "follow");
        foreach (var participant in room.RemoteParticipants.Values)
            foreach (var publication in participant.TrackPublications.Values.OfType<RemoteTrackPublication>())
            {
                if (!publication.Name.StartsWith("view:")) continue;
                var wanted = participant.Identity == follow;
                if (publication.IsSubscribed != wanted) publication.SetSubscribed(wanted);
            }
    }

    private static async Task<(ScreenSource Source, bool Audio)?> ChooseScreenAsync()
    {
        return await Dispatcher.UIThread.InvokeAsync(async () =>
        {
            var sources = DesktopCapture.EnumerateSources();
            if (sources.Count == 0) return ((ScreenSource Source, bool Audio)?)null;
            var list = new ListBox { ItemsSource = sources, SelectedIndex = 0, Height = 280 };
            var audio = new CheckBox { Content = "PC の音声も共有する（通話の音も含まれます）", IsChecked = false };
            var dialog = new Window { Title = "画面を共有", Width = 560, Height = 440, CanResize = false, WindowStartupLocation = WindowStartupLocation.CenterOwner };
            var share = new Button { Content = "この画面を共有", HorizontalAlignment = HorizontalAlignment.Right };
            share.Click += (_, _) => dialog.Close(list.SelectedItem is ScreenSource choice ? (choice, audio.IsChecked == true) : null);
            dialog.Content = new StackPanel { Margin = new Thickness(20), Spacing = 12, Children =
            {
                new TextBlock { Text = "共有する画面またはウィンドウを選んでください", FontSize = 17 }, list, audio, share
            } };
            if (Application.Current?.ApplicationLifetime is not IClassicDesktopStyleApplicationLifetime { MainWindow: { } owner }) return null;
            return await dialog.ShowDialog<(ScreenSource Source, bool Audio)?>(owner);
        });
    }

    public async Task ShowAudioSettingsAsync(Window? owner = null)
    {
        if (OperatingSystem.IsLinux()) { await ShowLinuxAudioSettingsAsync(owner); return; }
        owner ??= (Application.Current?.ApplicationLifetime as IClassicDesktopStyleApplicationLifetime)?.MainWindow;
        if (owner is null) return;
        await Dispatcher.UIThread.InvokeAsync(async () =>
        {
            using var enumerator = new MMDeviceEnumerator();
            var mic = new ComboBox { HorizontalAlignment = HorizontalAlignment.Stretch, Name = "MicrophoneDevice" };
            var speaker = new ComboBox { HorizontalAlignment = HorizontalAlignment.Stretch, Name = "SpeakerDevice" };
            Avalonia.Automation.AutomationProperties.SetName(mic, "マイク");
            Avalonia.Automation.AutomationProperties.SetName(speaker, "スピーカー / ヘッドホン");
            var hint = Ui.Text("", 12, Ui.Muted);
            var window = new Window { Title = "音声設定", Width = 520, Height = 380, MinWidth = 420, WindowStartupLocation = WindowStartupLocation.CenterOwner, CanResize = false, Background = Ui.Brush(Ui.Paper), FontFamily = Ui.BodyFont };
            void Reload(string? microphoneId, string? speakerId)
            {
                AudioDevice[] Devices(DataFlow flow)
                {
                    var endpoints = enumerator.EnumerateAudioEndPoints(flow, DeviceState.Active);
                    var devices = new List<AudioDevice> { new(null, "Windows の既定") };
                    foreach (var device in endpoints) { using (device) devices.Add(new(device.ID, device.FriendlyName)); }
                    return devices.ToArray();
                }
                var microphones = Devices(DataFlow.Capture); var speakers = Devices(DataFlow.Render);
                mic.ItemsSource = microphones; mic.SelectedItem = microphones.FirstOrDefault(d => d.Id == microphoneId) ?? microphones[0];
                speaker.ItemsSource = speakers; speaker.SelectedItem = speakers.FirstOrDefault(d => d.Id == speakerId) ?? speakers[0];
                hint.Text = microphones.Length == 1 ? "マイクが見つかりません。接続して「機器を再読み込み」を押してください。" : "選択はこのクライアントに保存されます。ミュート状態は変わりません。";
            }
            Reload(microphoneDevice, speakerDevice);
            var refresh = Ui.Button("機器を再読み込み", () => Reload((mic.SelectedItem as AudioDevice)?.Id, (speaker.SelectedItem as AudioDevice)?.Id));
            var save = Ui.Button("適用", () => window.Close(true)); save.Background = Ui.Brush("#2F5FC4"); save.Foreground = Avalonia.Media.Brushes.White;
            var cancel = Ui.Button("キャンセル", () => window.Close(false));
            window.Content = new StackPanel { Margin = new Thickness(24), Spacing = 12, Children =
            { Ui.Title("音声設定"), Ui.Text("マイク", 13), mic, Ui.Text("スピーカー / ヘッドホン", 13), speaker, hint,
                new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto,Auto"), ColumnSpacing = 8, Children = { refresh, cancel, save } } } };
            Grid.SetColumn(cancel, 1); Grid.SetColumn(save, 2);
            window.Opened += (_, _) => mic.Focus();
            window.AddHandler(InputElement.KeyDownEvent, (_, e) => { if (e.Key == Avalonia.Input.Key.Escape) { e.Handled = true; window.Close(false); } }, Avalonia.Interactivity.RoutingStrategies.Tunnel);
            if (!await window.ShowDialog<bool>(owner)) return;
            microphoneDevice = (mic.SelectedItem as AudioDevice)?.Id;
            speakerDevice = (speaker.SelectedItem as AudioDevice)?.Id;
            if (persistPreferences)
            {
                NativeSettings.SetString("microphoneDevice", microphoneDevice ?? "");
                NativeSettings.SetString("speakerDevice", speakerDevice ?? "");
            }
            await gate.WaitAsync();
            try
            {
                await StopMicrophoneAsync();
                output?.Stop(); output?.Dispose(); output = null;
                if (mixer is not null)
                {
                    output = new NativeAudioOutput(mixer.ToWaveProvider(), speakerDevice);
                }
                if (microphoneWanted && Connected) await StartMicrophoneAsync();
                await ReportAsync();
            }
            catch (Exception ex) { SetStatus($"音声デバイス: {SafeError(ex)}"); }
            finally { gate.Release(); }
        });
    }

    public async ValueTask DisposeAsync()
    {
        if (disposed) return;
        disposed = true; client.State.Changed -= UpdateSpatial;
        await DisconnectAsync();
        foreach (var feed in video.Values) feed.Dispose();
        http.Dispose(); gate.Dispose();
    }

    private sealed class TrackReader
    {
        public CancellationTokenSource Lifetime { get; } = new();
        public Task Task { get; set; } = Task.CompletedTask;
    }
    private sealed record AudioDevice(string? Id, string Name) { public override string ToString() => Name; }
    private static string? NullIfEmpty(string value) => string.IsNullOrEmpty(value) ? null : value;
}
