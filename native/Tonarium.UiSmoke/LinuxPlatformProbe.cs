using System.Diagnostics;
using Avalonia;
using Avalonia.Controls;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;
using SkiaSharp;
using Tonarium.Desktop.Core;
using Tonarium.Desktop.Media;
using Tonarium.Desktop.Views;

internal static class LinuxPlatformProbe
{
    internal static async Task Run(string output, Action<string> pass)
    {
        if (!OperatingSystem.IsLinux()) throw new PlatformNotSupportedException();
        using var instance = DesktopInstance.Acquire(Path.Combine(output, "preferences"));
        using (var bitmap = new SKBitmap(240, 120))
        {
            bitmap.Erase(SKColors.CornflowerBlue);
            using var input = bitmap.Encode(SKEncodedImageFormat.Png, 100);
            foreach (bool avatar in new[] { false, true })
            {
                var bytes = ProfileImage.Encode(input.ToArray(), avatar);
                using var result = SKBitmap.Decode(bytes);
                if (result.Width != (avatar ? 2048 : 128) || result.Height != (avatar ? 1024 : 128)) throw new Exception("Profile image dimensions");
                File.WriteAllBytes(Path.Combine(output, avatar ? "avatar.png" : "icon.jpg"), bytes);
            }
        }
        pass("Profile image and avatar conversion uses Linux-compatible codecs");

        var window = new Window { Width = 640, Height = 400, Title = "Tonarium Linux bridge check" };
        window.Show();
        try
        {
            await Task.Delay(200);
            var reply = new TaskCompletionSource<double>(TaskCreationOptions.RunContinuationsAsynchronously);
            using var youtube = new LinuxYoutube(window.TryGetPlatformHandle()!.Handle, "test", """
                <!doctype html><html><body>Linux WebKit bridge
                <script>
                window.applyClock = c => window.webkit.messageHandlers.tonarium.postMessage({a:'mediaSeek',pos:c.position});
                window.webkit.messageHandlers.tonarium.postMessage({a:'ready'});
                </script></body></html>
                """, message =>
                {
                    if (message["a"]?.ToString() == "mediaSeek") reply.TrySetResult(message["pos"]!.GetValue<double>());
                }, error => reply.TrySetException(new Exception(error)));
            for (var i = 0; i < 30 && !reply.Task.IsCompleted; i++)
            {
                youtube.Clock("{\"position\":12.5,\"playing\":false}");
                youtube.Resize(640, 340);
                await Task.Delay(200);
            }
            if (await reply.Task.WaitAsync(TimeSpan.FromSeconds(5)) != 12.5) throw new Exception("WebKit clock round trip");
            pass("Embedded WebKitGTK starts, resizes, applies playback clocks and returns actions");
        }
        finally { window.Close(); }

        var videoWindow = new Window { Width = 700, Height = 500 };
        using (var video = new NativeVideoView(new Uri(Path.Combine(AppContext.BaseDirectory, "Fixtures", "red-blue-4s.mp4")).AbsoluteUri, _ => { }))
        {
            videoWindow.Closing += (_, _) => video.Dispose();
            videoWindow.Content = video;
            video.UpdateClock(new System.Text.Json.Nodes.JsonObject { ["playing"] = true, ["base"] = 0, ["at"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
            videoWindow.Show();
            try
            {
                var player = (LibVLCSharp.Shared.MediaPlayer?)typeof(NativeVideoView).GetField("player", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!.GetValue(video);
                if (player is null) throw new Exception("Linux LibVLC player did not initialize");
                var deadline = DateTime.UtcNow.AddSeconds(10);
                while (player.Time < 500) { if (DateTime.UtcNow > deadline) throw new Exception("Linux video did not play"); await Task.Delay(100); }
                video.UpdateClock(new System.Text.Json.Nodes.JsonObject { ["playing"] = false, ["base"] = 2.5, ["at"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
                await Task.Delay(500);
                if (player.IsPlaying || Math.Abs(player.Time - 2500) > 300) throw new Exception("Linux video pause/seek failed");
                pass("LibVLC plays a local video and applies synchronized pause and seek");
            }
            finally { videoWindow.Close(); }
        }

        var sink = "tonarium_test_" + Environment.ProcessId;
        string module = await Pactl("load-module", "module-null-sink", "sink_name=" + sink, "rate=48000", "channels=2");
        try
        {
            var devices = await LinuxAudio.DevicesAsync(false);
            if (!devices.Any(d => d.Id == sink)) throw new Exception("PulseAudio device enumeration");
            var detected = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            await using var capture = new LinuxAudioCapture(true, sink);
            capture.LevelAvailable += (rms, peak) => { if (rms > .01f && peak > .02f) detected.TrySetResult(); };
            capture.Failed += error => detected.TrySetException(error);
            capture.Start();
            var tone = new SignalGenerator(48000, 2) { Frequency = 440, Gain = .1, Type = SignalGeneratorType.Sin };
            using var playback = new NativeAudioOutput(tone.ToWaveProvider(), sink);
            await detected.Task.WaitAsync(TimeSpan.FromSeconds(10));
            pass("PulseAudio device selection, PCM playback, monitor capture and LiveKit AudioSource accept a synthetic tone");
        }
        finally { await Pactl("unload-module", module); }
    }

    private static async Task<string> Pactl(params string[] args)
    {
        using var process = LinuxAudio.Start("pactl", args);
        var output = await process.StandardOutput.ReadToEndAsync();
        await process.WaitForExitAsync();
        if (process.ExitCode != 0) throw new Exception("pactl failed; check the session audio service");
        return output.Trim();
    }
}
