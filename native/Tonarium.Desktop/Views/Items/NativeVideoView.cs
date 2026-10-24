using System.Text.Json.Nodes;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using LibVLCSharp.Shared;
using LibVLCSharp.Avalonia;

namespace Tonarium.Desktop.Views;

internal sealed class NativeVideoView : StackPanel, IDisposable
{
    private VideoView? surface;
    private bool disposed;
    private LibVLC? vlc;
    private MediaPlayer? player;
    private LibVLCSharp.Shared.Media? media;
    private readonly TextBlock time = ItemWindow.Text("", 12, "#B9B7C2");
    private readonly Slider seek = new() { Minimum = 0, Maximum = 100, MinWidth = 240 };
    private readonly Action<object> send;
    private bool dragging;
    private bool surfaceLoaded;
    private bool serverPlaying;
    private bool ended;
    private double duration;
    private double lastClockBase = double.NaN;
    private double lastClockAt = double.NaN;
    private bool lastClockPlaying;
    private JsonObject? pendingClock;
    private long pendingOffset;
    private readonly Button toggle;
    public NativeVideoView(string url, Action<object> send)
    {
        this.send = send; Spacing = 4; Background = ItemWindow.Brush("#1E1F24");
        toggle = ItemWindow.Button("▶ 再生", () => send(new { a = serverPlaying ? "mediaPause" : "mediaPlay", pos = ended ? 0 : CurrentPosition }));
        toggle.Background = Brushes.Transparent; toggle.Foreground = Brushes.White; toggle.BorderThickness = new Thickness(0); toggle.Width = 30; toggle.Height = 30; toggle.Padding = new Thickness(0);
        try
        {
            LibVLCSharp.Shared.Core.Initialize();
            vlc = new LibVLC("--no-video-title-show", "--quiet"); player = new MediaPlayer(vlc) { Volume = 50 }; media = new LibVLCSharp.Shared.Media(vlc, new Uri(url)); player.Media = media;
            surface = new VideoView { MediaPlayer = player, Height = 315, HorizontalAlignment = HorizontalAlignment.Stretch };
            Children.Add(surface);
            // Start only after the native video HWND exists, otherwise VLC can open its own window.
            player.Playing += (_, _) => Dispatcher.UIThread.Post(() => { if (pendingClock is null) player?.SetPause(true); else ApplyClock(pendingClock, pendingOffset, true); });
            player.EndReached += (_, _) => Dispatcher.UIThread.Post(() =>
            {
                // 各視聴者の再生終了から、共有の停止命令を重複送信しない。
                ended = true; serverPlaying = false; toggle.Content = new WebIcon("play",14,Brushes.White);
            });
            surface.Loaded += (_, _) => { surfaceLoaded = true; player?.Play(); UpdateClock(pendingClock, pendingOffset); };
        }
        catch (Exception error) { Children.Add(ItemWindow.Text("動画プレーヤーを起動できません: " + error.Message)); }
        seek.AddHandler(PointerPressedEvent, (_, _) => dragging = true, RoutingStrategies.Tunnel);
        seek.AddHandler(PointerReleasedEvent, (_, _) => { dragging = false; send(new { a = "mediaSeek", pos = seek.Value }); }, RoutingStrategies.Bubble, true);
        seek.KeyUp += (_, e) => { if (e.Key is Key.Left or Key.Right or Key.Up or Key.Down or Key.Home or Key.End or Key.PageUp or Key.PageDown) send(new { a = "mediaSeek", pos = seek.Value }); };
        var volume = new Slider { Minimum = 0, Maximum = 100, Value = 50, Width = 100 };
        volume.PropertyChanged += (_, e) => { if (e.Property == Slider.ValueProperty && player is not null) player.Volume = (int)volume.Value; };
        seek.Margin = new Thickness(10,0); Children.Add(seek); Children.Add(ItemWindow.Row(toggle, time, new WebIcon("volume",14,Brushes.White), volume));
    }
    private double CurrentPosition => Math.Max(0, player?.Time / 1000d ?? 0);
    public void UpdateClock(JsonObject? clock, long offset = 0)
    {
        pendingClock = clock; pendingOffset = offset;
        ApplyClock(clock, offset, false);
    }
    private void ApplyClock(JsonObject? clock, long offset, bool force)
    {
        if (clock is null || player is null || !surfaceLoaded) return;
        var position = ItemWindow.ClockPosition(clock, offset); var clockPlaying = ItemWindow.Bool(clock, "playing");
        var clockBase = ItemWindow.Num(clock,"base"); var clockAt = ItemWindow.Num(clock,"at");
        var changed = clockBase != lastClockBase || clockAt != lastClockAt || clockPlaying != lastClockPlaying;
        if (player.Length > 0) duration = player.Length / 1000d;
        ended = duration > 0 && position >= duration - .2;
        if (duration > 0) position = Math.Min(position, duration);
        var playing = clockPlaying && !ended;
        serverPlaying = playing;
        // 明示的なシークは短い移動も反映し、同じ時計の定期補正だけ許容差を使う。
        if (playing && !player.IsPlaying) player.Play(); else if (!playing && player.IsPlaying) player.SetPause(true);
        if (force || changed || Math.Abs(CurrentPosition - position) > .8) player.Time = (long)(position * 1000);
        lastClockBase = clockBase; lastClockAt = clockAt; lastClockPlaying = clockPlaying;
        toggle.Content = new WebIcon(playing ? "pause" : "play",14,Brushes.White);
        if (duration > 0) seek.Maximum = duration;
        if (!dragging) seek.Value = Math.Clamp(position, 0, seek.Maximum);
        time.Text = TimeSpan.FromSeconds(position).ToString(@"hh\:mm\:ss");
    }
    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        player?.Stop();
        if (surface is not null) surface.MediaPlayer = null;
        player?.Dispose(); player = null;
        media?.Dispose(); media = null;
        vlc?.Dispose(); vlc = null;
    }
}
