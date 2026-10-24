using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using Avalonia.Threading;
using Tonarium.Desktop.Media;

namespace Tonarium.Desktop.Views;

internal sealed class LinuxYoutube : IDisposable
{
    private readonly Process process;
    private readonly nint display;
    private bool disposed;
    private readonly object writing = new();
    private int width, height;
    public LinuxYoutube(nint parent, string videoId, string html, Action<JsonObject> message, Action<string> error)
    {
        var info = new ProcessStartInfo(Environment.GetEnvironmentVariable("TONARIUM_PYTHON") ?? "/usr/bin/python3") { UseShellExecute = false, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
        info.ArgumentList.Add(Path.Combine(AppContext.BaseDirectory, "Linux", "youtube.py"));
        process = Process.Start(info) ?? throw new IOException("YouTubeプレーヤーを起動できません");
        process.ErrorDataReceived += (_, e) => { if (!string.IsNullOrWhiteSpace(e.Data)) Program.Log("YouTube: " + e.Data); };
        process.BeginErrorReadLine();
        try
        {
            Write(new { id = videoId, html = html.Replace("window.chrome.webview.postMessage(m)", "window.webkit.messageHandlers.tonarium.postMessage(m)") });
            var line = process.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(15)).GetAwaiter().GetResult();
            var child = (nint)(JsonNode.Parse(line ?? "{}")?["window"]?.GetValue<long>() ?? throw new IOException("WebKitGTKのウィンドウを作成できません。desktop.log を確認してください。"));
            display = XOpenDisplay(null);
            if (display == 0) throw new IOException("X11ディスプレイに接続できません");
            XReparentWindow(display, child, parent, 0, 0); XMapWindow(display, child); XFlush(display);
            _ = Task.Run(async () =>
            {
                try
                {
                    while (await process.StandardOutput.ReadLineAsync() is { } value)
                        if (JsonNode.Parse(value) is JsonObject node) Dispatcher.UIThread.Post(() => { if (!disposed) message(node); });
                    if (!disposed) Dispatcher.UIThread.Post(() => error("YouTubeプレーヤーが終了しました。アイテムを開き直してください。"));
                }
                catch (Exception ex) when (disposed && ex is ObjectDisposedException or IOException) { }
                catch (Exception ex) { Program.Log("YouTube bridge: " + ex); }
            });
        }
        catch { Dispose(); throw; }
    }

    private void Write(object value)
    {
        lock (writing)
        {
            if (disposed) return;
            process.StandardInput.WriteLine(JsonSerializer.Serialize(value)); process.StandardInput.Flush();
        }
    }
    public void Clock(string clock) { try { Write(new { clock = JsonNode.Parse(clock) }); } catch (IOException ex) { Program.Log("YouTube clock: " + ex.Message); } }
    public void Resize(int w, int h)
    {
        if (w == width && h == height) return;
        width = w; height = h;
        try { Write(new { size = new[] { w, h } }); } catch (IOException ex) { Program.Log("YouTube resize: " + ex.Message); }
    }
    public void Dispose()
    {
        lock (writing)
        {
            if (disposed) return;
            disposed = true;
            process.StandardInput.Close(); LinuxAudio.Stop(process); process.WaitForExit(); process.Dispose();
            if (display != 0) XCloseDisplay(display);
        }
    }
    [DllImport("libX11.so.6")] private static extern nint XOpenDisplay(string? name);
    [DllImport("libX11.so.6")] private static extern int XCloseDisplay(nint display);
    [DllImport("libX11.so.6")] private static extern int XReparentWindow(nint display, nint window, nint parent, int x, int y);
    [DllImport("libX11.so.6")] private static extern int XMapWindow(nint display, nint window);
    [DllImport("libX11.so.6")] private static extern int XFlush(nint display);
}
