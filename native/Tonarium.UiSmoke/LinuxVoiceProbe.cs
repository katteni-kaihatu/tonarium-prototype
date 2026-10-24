using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.VisualTree;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;
using Tonarium.Desktop.Core;
using Tonarium.Desktop.Media;
using Tonarium.Desktop.Views;

internal static class LinuxVoiceProbe
{
    internal static async Task Run(string server, string output, Action<string> pass)
    {
        var sink = "tonarium_voice_" + Environment.ProcessId;
        var module = await Pactl("load-module", "module-null-sink", "sink_name=" + sink, "rate=48000", "channels=2");
        var oldSource = Environment.GetEnvironmentVariable("PULSE_SOURCE");
        var oldSink = Environment.GetEnvironmentVariable("PULSE_SINK");
        Environment.SetEnvironmentVariable("PULSE_SOURCE", sink + ".monitor");
        Environment.SetEnvironmentVariable("PULSE_SINK", sink);
        await using var client = new TonariumClient(new ClientState(), persistSettings: false);
        await using var media = new NativeMedia(client);
        var owner = new Window { Title = "Tonarium voice verification", Width = 500, Height = 200 };
        var notices = new List<string>();
        var context = new NativeContext(client, media, owner) { NotificationRequested = notices.Add };
        try
        {
            owner.Show();
            var name = "voice-test-" + Environment.ProcessId;
            await client.ConnectAsync(server, name);
            await client.SendAsync(new { t = "groupCreate", name, color = "#9E8DAC" });
            await Until(() => client.State.Groups.Any(g => J.Text(g, "name") == name), "group creation");
            var group = client.State.Groups.First(g => J.Text(g, "name") == name);
            var channel = group["channels"]!.AsArray()[0]!;
            string conv = "ch:" + J.Text(group, "id") + ":" + channel["id"];
            using var tone = new NativeAudioOutput(new SignalGenerator(48000, 2) { Frequency = 440, Gain = .15, Type = SignalGeneratorType.Sin }.ToWaveProvider(), sink);
            HomeVoiceMessage.ShowRecorder(context, conv);
            var recorder = owner.OwnedWindows.Single();
            Click(recorder, "● 録音を始める");
            await Until(() => Text(recorder).Any(t => t.StartsWith("録音中…")), "record start without native crash");
            await Task.Delay(2500);
            Click(recorder, "停止して送信");
            await Until(() => client.State.Conversations[conv]?.AsArray().Any(m => m?["voice"] is not null) == true, "record upload and channel message");
            var voice = client.State.Conversations[conv]!.AsArray().Last()!["voice"]!;
            var url = voice["url"]!.ToString();
            using var http = new HttpClient(); var bytes = await http.GetByteArrayAsync(server + url);
            if (!bytes.Take(4).SequenceEqual(new byte[] { 0x1a, 0x45, 0xdf, 0xa3 }) || bytes.Length < 2000) throw new Exception("Recorded WebM invalid");
            File.WriteAllBytes(Path.Combine(output, "recorded.webm"), bytes);
            await Until(() => !owner.OwnedWindows.Any(), "record dialog closes after send");
            pass("Group channel recording starts, stops, uploads Opus/WebM and publishes a voice attachment");
            HomeVoiceMessage.Play(context, url);
            var player = owner.OwnedWindows.Single();
            await Until(() => Text(player).Contains("再生中"), "voice playback starts");
            Click(player, "一時停止"); await Until(() => Text(player).Contains("一時停止中"), "pause");
            Click(player, "再生"); await Until(() => Text(player).Contains("再生中"), "resume");
            await Until(() => Text(player).Contains("再生しました"), "end of playback");
            Click(player, "もう一度再生"); await Until(() => Text(player).Contains("再生中"), "replay");
            player.Close(); await Task.Delay(300);
            pass("Voice attachment plays, pauses, resumes, ends and replays through Linux audio");
            var compatibility = Path.Combine(output, "compat.m4a");
            if (File.Exists(compatibility))
            {
                await using var aac = new LinuxVoiceSession(false, compatibility, sink);
                var ended = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                aac.Changed += state => { if (state == "ended") ended.TrySetResult(); };
                aac.Failed += error => ended.TrySetException(new IOException(error));
                await aac.Ready.WaitAsync(TimeSpan.FromSeconds(10)); await ended.Task.WaitAsync(TimeSpan.FromSeconds(10));
                pass("AAC/MP4 voice messages from Windows decode and play on Linux");
            }
            HomeVoiceMessage.ShowRecorder(context, conv); recorder = owner.OwnedWindows.Single();
            Click(recorder, "● 録音を始める"); await Until(() => Text(recorder).Any(t => t.StartsWith("録音中…")), "second capture starts");
            recorder.Close(); await Task.Delay(700);
            if (client.State.Conversations[conv]!.AsArray().Count != 1) throw new Exception("Cancel unexpectedly sent a recording");
            pass("Closing a recording stops capture without sending another message");
            await using (var broken = new LinuxVoiceSession(true, Path.Combine(output, "missing-folder", "invalid.webm"), sink + ".monitor"))
            {
                try { await broken.Ready.WaitAsync(TimeSpan.FromSeconds(10)); throw new Exception("Invalid output unexpectedly accepted"); }
                catch (IOException) { pass("Recording startup failure reports an error without terminating the application"); }
            }
        }
        finally
        {
            owner.Close();
            Environment.SetEnvironmentVariable("PULSE_SOURCE", oldSource); Environment.SetEnvironmentVariable("PULSE_SINK", oldSink);
            await Pactl("unload-module", module);
        }
    }
    private static IEnumerable<string> Text(Window w) => w.GetVisualDescendants().OfType<TextBlock>().Select(t => t.Text ?? "");
    private static void Click(Window w, string label) => w.GetVisualDescendants().OfType<Button>().Single(b => b.Content?.ToString() == label).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
    private static async Task Until(Func<bool> predicate, string description)
    {
        var deadline = DateTime.UtcNow.AddSeconds(20);
        while (!predicate()) { if (DateTime.UtcNow > deadline) throw new Exception("Timed out: " + description); await Task.Delay(25); }
    }
    private static async Task<string> Pactl(params string[] args)
    {
        using var process = LinuxAudio.Start("pactl", args); var value = await process.StandardOutput.ReadToEndAsync(); await process.WaitForExitAsync();
        if (process.ExitCode != 0) throw new IOException("pactl failed"); return value.Trim();
    }
}
