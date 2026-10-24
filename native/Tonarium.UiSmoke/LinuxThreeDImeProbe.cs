using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json.Nodes;
using Tonarium.Desktop.Linux;

internal static class LinuxThreeDImeProbe
{
    public static async Task Run(string output, Action<string> pass)
    {
        var path = Environment.GetEnvironmentVariable("TONARIUM_UNITY_PLAYER") ?? throw new Exception("Set TONARIUM_UNITY_PLAYER");
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var info = new ProcessStartInfo(path) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(path)! };
        LinuxInputMethod.ConfigureUnity(info);
        foreach (var arg in new[] { "--tonarium-port", ((IPEndPoint)listener.LocalEndpoint).Port.ToString(), "--tonarium-hud-probe", "--tonarium-output", output, "-screen-fullscreen", "0", "-screen-width", "1024", "-screen-height", "768", "-logFile", Path.Combine(output, "unity.log") }) info.ArgumentList.Add(arg);
        using var player = Process.Start(info)!;
        try
        {
            using var socket = await listener.AcceptTcpClientAsync().WaitAsync(TimeSpan.FromSeconds(40));
            using var reader = new StreamReader(socket.GetStream());
            await using var writer = new StreamWriter(socket.GetStream(), new UTF8Encoding(false)) { AutoFlush = true };
            var messages = new JsonArray();
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(240));
            while (true)
            {
                var line = await reader.ReadLineAsync(timeout.Token) ?? throw new Exception("Unity bridge closed");
                var message = JsonNode.Parse(line)!;
                var type = message["t"]?.ToString();
                if (type == "ready")
                {
                    await writer.WriteLineAsync("{\"t\":\"snapshot\",\"selfId\":\"ime-test\",\"sessionId\":\"offline-ime\",\"world\":\"cafe\"}");
                    File.WriteAllText(Path.Combine(output, "unity-pid"), player.Id.ToString());
                    continue;
                }
                if (type == "focusChat") throw new Exception("Unity unexpectedly delegated chat to a native window");
                if (type == "room" && message["message"]?["t"]?.ToString() == "avatar") continue;
                messages.Add(message);
                File.WriteAllText(Path.Combine(output, "messages.json"), messages.ToJsonString());
                if (type == "room" && message["message"]?["t"]?.ToString() == "world")
                    await writer.WriteLineAsync(message["message"]!.ToJsonString());
                if (type == "return2d") break;
            }
            var chats = messages.Where(m => m?["t"]?.ToString() == "room" && m["message"]?["t"]?.ToString() == "chat").ToArray();
            if (chats.Length != 1 || chats[0]!["message"]!["text"]?.ToString() != (Environment.GetEnvironmentVariable("TONARIUM_IME_EXPECTED") ?? "日本語")) throw new Exception("Unity chat must submit Japanese exactly once");
            if (!messages.Any(m => m?["message"]?["world"]?.ToString() == "room")) throw new Exception("World selection did not reach the desktop bridge");
            pass("Unity HUD world selection and return-to-2D reach the real local bridge");
            pass("Unity IMGUI composes and sends Japanese exactly once without a native popup");
            await writer.WriteLineAsync("{\"t\":\"shutdown\"}");
            await player.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10));
        }
        finally
        {
            if (!player.HasExited) { player.Kill(true); await player.WaitForExitAsync(); }
        }
    }
}
