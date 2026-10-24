using System.Text.Json.Nodes;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;
using Tonarium.Desktop.Core;
using Tonarium.Desktop.Media;
using Tonarium.Desktop.ThreeD;

internal static class LinuxOnlineProbe
{
    internal static async Task Run(string server, string output, Action<string> pass)
    {
        using var instance = DesktopInstance.Acquire(Path.Combine(output, "preferences"));
        var suffix = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
        var name = "Linux検証 " + suffix;
        await using var first = new TonariumClient(persistSettings: false);
        await using var second = new TonariumClient(persistSettings: false);
        string? sid = null;
        try
        {
            await first.ConnectAsync(server, name);
            await second.ConnectAsync(server, "Linux検証受信 " + suffix);
            await Until(() => first.State.Connected && second.State.Connected);
            await first.SendAsync(new { t = "sessionCreate", name, topic = "Linux自動検証専用・終了時削除", world = "cafe", visibility = "public" });
            await Until(() => first.State.Sessions.Any(s => J.Text(s, "name") == name));
            sid = J.Text(first.State.Sessions.First(s => J.Text(s, "name") == name), "id");
            if (sid == "lounge" || string.IsNullOrWhiteSpace(sid)) throw new Exception("Test session isolation failed");
            await File.WriteAllTextAsync(Path.Combine(output, "session-id.txt"), sid);
            await first.JoinAsync(sid); await second.JoinAsync(sid);
            await Until(() => first.State.SyncStatus == "connected" && second.State.SyncStatus == "connected");
            await first.SendRoomAsync(new { t = "chat", text = "Linux同期確認 " + suffix, scope = "all" });
            await Until(() => second.State.Chats.Any(c => J.Text(c, "text").Contains(suffix)));
            await first.SendRoomAsync(new { t = "itemCreate", kind = "note", text = "Linux共有付箋", x = 0, z = 0, ry = 0 });
            await Until(() => second.State.Items.Any(i => J.Text(i.Value, "kind") == "note"));
            pass("Two Linux clients exchange chat and items in a newly created session outside the lounge");

            await using (var host = new ThreeDHost(first))
            {
                await host.StartAsync();
                if (!host.IsRunning) throw new Exception("Unity did not start");
                await host.TeleportAsync(1, 2, .5);
                await Task.Delay(1500);
                var before = first.DispatchDiagnostics!.Received;
                var burst = Task.Run(async () =>
                {
                    await Task.Delay(200);
                    for (int i = 0; i < 24; i++)
                    {
                        await second.SendRoomAsync(new { t = "chat", text = "UI停止検証 " + suffix + "-" + i, scope = "all" });
                        await Task.Delay(50);
                    }
                });
                Thread.Sleep(6000);
                var receivedWhileBlocked = first.DispatchDiagnostics!.Received - before;
                await burst;
                if (receivedWhileBlocked < 24) throw new Exception("Room receiver stalled with UI: " + receivedWhileBlocked);
                await Until(() => first.State.Chats.Any(c => J.Text(c, "text") == "UI停止検証 " + suffix + "-23"));
                if (!host.IsRunning || first.EventQueueDiagnostics!.OverflowType is not null) throw new Exception("UI stall interrupted synchronization or Unity");
                pass("Room reception continues through a six-second UI stall and delivers all 24 chat updates without SDK overflow");
                for (int retry = 0; retry < 3; retry++)
                {
                    var field = typeof(TonariumClient).GetField("room", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!;
                    var previous = (KokoSync.Client)field.GetValue(first)!;
                    var transport = (IAsyncDisposable)typeof(KokoSync.Client).GetField("transport", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!.GetValue(previous)!;
                    await transport.DisposeAsync();
                    await Until(() => !ReferenceEquals(field.GetValue(first), previous) && first.State.SyncStatus == "connected");
                    if (!host.IsRunning || first.State.Mode != "3d") throw new Exception("Room reconnect stopped Unity");
                    var text = "3D再接続確認 " + suffix + "-" + retry;
                    await first.SendRoomAsync(new { t = "chat", text, scope = "all" });
                    await Until(() => second.State.Chats.Any(c => J.Text(c, "text") == text));
                }
                pass("Three forced sync disconnects recover chat delivery while the real Unity player stays in 3D");
                await host.StopAsync();
                if (host.IsRunning || first.State.Mode != "2d") throw new Exception("Unity did not return to 2D");
                pass("Linux Unity player connects to the native bridge, receives the session and returns to 2D");
            }

            var source = "tonarium_source_" + Environment.ProcessId;
            var sink = "tonarium_receiver_" + Environment.ProcessId;
            var modules = new List<string>();
            try
            {
                foreach (var device in new[] { source, sink }) modules.Add(await Pactl("load-module", "module-null-sink", "sink_name=" + device, "rate=48000", "channels=2"));
                NativeSettings.SetString("microphoneDevice", source + ".monitor");
                NativeSettings.SetString("speakerDevice", sink);
                await using var sender = new NativeMedia(first, false, false);
                await using var receiver = new NativeMedia(second, false, false);
                await sender.ConnectAsync(sid); await receiver.ConnectAsync(sid);
                if (!sender.Connected || !receiver.Connected) throw new Exception("LiveKit: " + sender.Status + " / " + receiver.Status);
                using var tone = new NativeAudioOutput(new SignalGenerator(48000, 2) { Frequency = 440, Gain = .1 }.ToWaveProvider(), source);
                await sender.SetMicrophoneAsync(true);
                await Until(() => receiver.ReceivedAudioFrames > 30);
                await sender.SetMicrophoneAsync(false);
                if (first.State.MicOn) throw new Exception("Microphone mute failed");
                pass("LiveKit transmits synthetic microphone audio between two Linux clients and mutes cleanly");
                first.State.Mode = "3d";
                await first.SendRoomAsync(new { t = "mode", mode = "3d" });
                await first.SendRoomAsync(new { t = "itemCreate", kind = "camera", x = 0, z = 0, ry = 0 });
                await Until(() => first.State.Items.Any(i => J.Text(i.Value, "kind") == "camera"));
                var camera = first.State.Items.First(i => J.Text(i.Value, "kind") == "camera").Key;
                await first.SendRoomAsync(new { t = "itemAction", id = camera, action = new { a = "camLive", on = true } });
                await Until(() => J.Bool(first.State.Items[camera], "live"));
                using var pixels = new SkiaSharp.SKBitmap(640, 360); pixels.Erase(SkiaSharp.SKColors.CornflowerBlue);
                using var jpeg = pixels.Encode(SkiaSharp.SKEncodedImageFormat.Jpeg, 80);
                var bytes = jpeg.ToArray();
                for (int i = 0; i < 60 && receiver.ReceivedVideoFrames < 5; i++) { sender.SubmitCameraFrame(camera, bytes); await Task.Delay(100); }
                if (receiver.ReceivedVideoFrames < 5) throw new Exception("Virtual camera frames did not arrive");
                pass("Virtual camera JPEG frames publish through LiveKit and arrive on the second Linux client");
            }
            finally { foreach (var module in modules) await Pactl("unload-module", module); }
        }
        finally
        {
            await second.LeaveAsync(); await first.LeaveAsync();
            if (sid is not null)
            {
                await first.SendAsync(new { t = "sessionDelete", id = sid });
                await Until(() => !first.State.Sessions.Any(s => J.Text(s, "id") == sid));
                pass("The dedicated test session was removed after both clients left");
            }
        }
    }
    private static async Task Until(Func<bool> predicate)
    {
        var deadline = DateTime.UtcNow.AddSeconds(35);
        while (!predicate()) { if (DateTime.UtcNow > deadline) throw new TimeoutException("Linux integration condition timed out"); await Task.Delay(100); }
    }
    private static async Task<string> Pactl(params string[] args)
    {
        using var process = LinuxAudio.Start("pactl", args);
        var result = await process.StandardOutput.ReadToEndAsync(); await process.WaitForExitAsync();
        if (process.ExitCode != 0) throw new Exception("pactl failed");
        return result.Trim();
    }
}
