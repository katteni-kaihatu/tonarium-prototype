using System.Net.Http;
using System.Text.Json.Nodes;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Threading;
using Tonarium.Desktop.Core;
using Tonarium.Desktop.Media;

namespace Tonarium.Desktop.Views;

internal static partial class HomeVoiceMessage
{
    private static void ShowLinuxRecorder(NativeContext context, string conversation)
    {
        var folder = Path.Combine(Path.GetTempPath(), "Tonarium", "voice"); Directory.CreateDirectory(folder);
        var path = Path.Combine(folder, Guid.NewGuid().ToString("N") + ".webm");
        var window = MakeWindow("音声メッセージ");
        var status = Ui.Text("録音を始めるとマイクを使います。最長 60 秒。", 13);
        var clock = Ui.Text("0:00", 36); clock.HorizontalAlignment = HorizontalAlignment.Center;
        LinuxVoiceSession? source = null;
        bool closed = false, recording = false, sending = false;
        DateTime started = default;
        var lifetime = new CancellationTokenSource();
        var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(200) };
        var record = Ui.Button("● 録音を始める", () => { });
        var send = Ui.Button("停止して送信", () => { }); send.IsEnabled = false;
        window.Content = Ui.Column(Ui.Title("音声メッセージ"), status, clock, Ui.Row(record, send, Ui.Button("やめる", () => window.Close())));
        ((StackPanel)window.Content).Margin = new Thickness(24);
        record.Click += async (_, _) =>
        {
            record.IsEnabled = false;
            try
            {
                if (source is not null) await source.DisposeAsync();
                if (closed) return;
                source = new LinuxVoiceSession(true, path);
                source.Failed += error => Dispatcher.UIThread.Post(() => { if (!closed) { status.Text = "録音できませんでした: " + error; if (recording) record.IsEnabled = true; recording = false; timer.Stop(); send.IsEnabled = false; } });
                await source.Ready.WaitAsync(TimeSpan.FromSeconds(10), lifetime.Token);
                if (closed) return;
                started = DateTime.UtcNow; recording = true; timer.Start(); send.IsEnabled = true;
                status.Text = "録音中… 停止して送信すると、この会話に届きます。";
            }
            catch (Exception error)
            {
                if (source is not null) await source.DisposeAsync();
                if (!closed) { status.Text = "マイクを開始できませんでした: " + error.Message; record.IsEnabled = true; }
            }
        };
        async Task Finish()
        {
            if (!recording || sending || closed) return;
            sending = true; recording = false; timer.Stop(); send.IsEnabled = false;
            int seconds = Math.Clamp((int)Math.Ceiling((DateTime.UtcNow - started).TotalSeconds), 1, 60);
            status.Text = "音声を保存しています…";
            try
            {
                await source!.StopAsync(); await source.DisposeAsync();
                if (closed) return;
                using var body = new ByteArrayContent(await File.ReadAllBytesAsync(path, lifetime.Token));
                using var response = await Http.PostAsync(new Uri(new Uri(context.State.ServerUrl.TrimEnd('/') + "/"), "media"), body, lifetime.Token);
                var result = JsonNode.Parse(await response.Content.ReadAsStringAsync(lifetime.Token)); var url = result?["url"]?.GetValue<string>();
                if (!response.IsSuccessStatusCode || string.IsNullOrEmpty(url)) throw new IOException(result?["error"]?.GetValue<string>() ?? "アップロードできませんでした");
                if (closed) return;
                await context.Client.SendAsync(new { t = "msg", conv = conversation, text = "", voice = new { url, sec = seconds } });
                context.Notify("音声メッセージを送りました"); window.Close();
            }
            catch (Exception error) { if (!closed) { status.Text = "送信できませんでした: " + error.Message; record.IsEnabled = true; sending = false; } }
        }
        send.Click += async (_, _) => await Finish();
        timer.Tick += (_, _) => { int seconds = Math.Min(60, (int)(DateTime.UtcNow - started).TotalSeconds); clock.Text = $"{seconds / 60}:{seconds % 60:00}"; if (seconds >= 60) _ = Finish(); };
        window.Closed += async (_, _) =>
        {
            closed = true; recording = false; timer.Stop(); lifetime.Cancel();
            if (source is not null) await source.DisposeAsync();
            TryDelete(path); lifetime.Dispose();
        };
        _ = window.ShowDialog(context.Owner);
    }

    private static void PlayLinux(NativeContext context, string url)
    {
        var window = MakeWindow("音声メッセージ"); var status = Ui.Text("音声を読み込んでいます…", 14);
        var absolute = new Uri(new Uri(context.State.ServerUrl.TrimEnd('/') + "/"), url);
        LinuxVoiceSession? player = null; string? path = null; bool closed = false, playing = false, ended = false;
        var lifetime = new CancellationTokenSource();
        var toggle = Ui.Button("一時停止", () => { }); toggle.IsEnabled = false;
        toggle.Click += (_, _) => { try { player?.Command(playing && !ended ? "pause" : "play"); } catch (Exception error) { status.Text = error.Message; } };
        window.Content = Ui.Column(Ui.Title("音声メッセージ"), status, Ui.Row(toggle, Ui.Button("閉じる", () => window.Close())));
        ((StackPanel)window.Content).Margin = new Thickness(24);
        window.Opened += async (_, _) =>
        {
            try
            {
                var bytes = await Http.GetByteArrayAsync(absolute, lifetime.Token);
                var folder = Path.Combine(Path.GetTempPath(), "Tonarium", "voice"); Directory.CreateDirectory(folder);
                path = Path.Combine(folder, Guid.NewGuid().ToString("N") + Path.GetExtension(absolute.AbsolutePath));
                await File.WriteAllBytesAsync(path, bytes, lifetime.Token);
                if (closed) { TryDelete(path); return; }
                player = new LinuxVoiceSession(false, path);
                player.Changed += state => Dispatcher.UIThread.Post(() =>
                {
                    if (closed) return;
                    if (state == "ended") { ended = true; playing = false; status.Text = "再生しました"; toggle.Content = "もう一度再生"; }
                    else if (state == "playing") { ended = false; playing = true; status.Text = "再生中"; toggle.Content = "一時停止"; }
                    else if (state == "paused" && !ended) { playing = false; status.Text = "一時停止中"; toggle.Content = "再生"; }
                });
                player.Failed += error => Dispatcher.UIThread.Post(() => { if (!closed) { status.Text = "再生できませんでした: " + error; toggle.IsEnabled = false; } });
                await player.Ready.WaitAsync(TimeSpan.FromSeconds(10), lifetime.Token);
                if (!closed) toggle.IsEnabled = true;
            }
            catch (Exception error)
            {
                if (player is not null) await player.DisposeAsync();
                if (!closed) status.Text = "再生できませんでした: " + error.Message;
            }
            finally { if (closed && path is not null) TryDelete(path); }
        };
        window.Closed += async (_, _) => { closed = true; lifetime.Cancel(); if (player is not null) await player.DisposeAsync(); if (path is not null) TryDelete(path); lifetime.Dispose(); };
        _ = window.ShowDialog(context.Owner);
    }
}
