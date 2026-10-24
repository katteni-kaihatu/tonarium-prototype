using System.Runtime.InteropServices;
using System.Text;
using LiveKit.Proto;
using LiveKit.Rtc;

namespace Tonarium.Desktop.Media;

public sealed record ScreenSource(string Name, nint Window, int X, int Y, int Width, int Height)
{
    public override string ToString() => Name;
}

/// <summary>Native GDI capture works without a browser or a desktop capture service.</summary>
internal sealed class DesktopCapture : IAsyncDisposable
{
    private readonly ScreenSource target;
    private readonly CancellationTokenSource lifetime = new();
    private Task? loop;
    private System.Diagnostics.Process? linux;
    public VideoSource Source { get; }
    public int Width { get; }
    public int Height { get; }
    public string CaptureMethod { get; private set; } = "waiting";
    public event Action<VideoFrame>? Frame;
    public event Action<Exception>? Failed;

    public DesktopCapture(ScreenSource target)
    {
        this.target = target;
        var scale = Math.Min(1d, 1280d / Math.Max(1, target.Width));
        Width = Math.Max(2, (int)(target.Width * scale) / 2 * 2);
        Height = Math.Max(2, (int)(target.Height * scale) / 2 * 2);
        Source = new VideoSource(Width, Height);
    }

    public void Start()
    {
        if (OperatingSystem.IsLinux()) { StartLinux(); return; }
        StartWindows();
    }

    private void StartLinux()
    {
        linux = LinuxAudio.Start(Environment.GetEnvironmentVariable("TONARIUM_PYTHON") ?? "/usr/bin/python3", [Path.Combine(AppContext.BaseDirectory, "Linux", "screencast.py")]);
        CaptureMethod = "PipeWire portal";
        loop = Task.Run(async () =>
        {
            try
            {
                while (!lifetime.IsCancellationRequested)
                {
                    var pixels = new byte[Width * Height * 4];
                    await linux.StandardOutput.BaseStream.ReadExactlyAsync(pixels, lifetime.Token);
                    var frame = new VideoFrame(Width, Height, VideoBufferType.Bgra, pixels);
                    Source.CaptureFrame(frame); Frame?.Invoke(frame);
                }
            }
            catch (Exception ex) when (lifetime.IsCancellationRequested && ex is OperationCanceledException or IOException or ObjectDisposedException) { }
            catch (Exception ex) { Failed?.Invoke(new IOException("画面共有が終了しました。デスクトップの共有設定とPipeWireを確認してください。", ex)); }
        });
    }

    private void StartWindows() => loop = Task.Run(async () =>
    {
        var desktop = GetDC(0);
        var dc = CreateCompatibleDC(desktop);
        var header = new BitmapInfo { Size = 40, Width = Width, Height = -Height, Planes = 1, BitCount = 32 };
        var bitmap = CreateDIBSection(desktop, ref header, 0, out var pixels, 0, 0);
        var previous = SelectObject(dc, bitmap);
        var windowDc = target.Window != 0 ? CreateCompatibleDC(desktop) : 0;
        nint windowBitmap = 0, windowPrevious = 0;
        var windowWidth = 0; var windowHeight = 0;
        SetStretchBltMode(dc, 4);
        try
        {
            using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(1000d / 15));
            do
            {
                var x = target.X; var y = target.Y; var w = target.Width; var h = target.Height;
                if (target.Window != 0)
                {
                    if (!IsWindow(target.Window)) break;
                    if (IsIconic(target.Window)) { await Task.Delay(200, lifetime.Token); continue; }
                    GetWindowRect(target.Window, out var rect);
                    x = rect.Left; y = rect.Top; w = rect.Right - rect.Left; h = rect.Bottom - rect.Top;
                }
                if (w <= 0 || h <= 0) continue;
                var captured = false;
                if (target.Window != 0)
                {
                    if (windowBitmap == 0 || windowWidth != w || windowHeight != h)
                    {
                        if (windowBitmap != 0) { SelectObject(windowDc, windowPrevious); DeleteObject(windowBitmap); }
                        windowBitmap = CreateCompatibleBitmap(desktop, w, h);
                        windowPrevious = SelectObject(windowDc, windowBitmap);
                        windowWidth = w; windowHeight = h;
                    }
                    // Ask the selected window to render itself, so an overlapping window is excluded.
                    // PW_RENDERFULLCONTENT also supports many composed/GPU windows on recent Windows.
                    if (PrintWindow(target.Window, windowDc, 2))
                    {
                        captured = StretchBlt(dc, 0, 0, Width, Height, windowDc, 0, 0, w, h, 0x00CC0020);
                        CaptureMethod = "PrintWindow";
                    }
                }
                if (!captured)
                {
                    // Some applications reject WM_PRINT. Fall back only when PrintWindow reports failure.
                    captured = StretchBlt(dc, 0, 0, Width, Height, desktop, x, y, w, h, 0x40CC0020);
                    CaptureMethod = target.Window == 0 ? "desktop" : "visible-region-fallback";
                }
                if (captured)
                {
                    var cursor = new CursorInfo { Size = Marshal.SizeOf<CursorInfo>() };
                    if (GetCursorInfo(ref cursor) && cursor.Flags == 1)
                        DrawIconEx(dc, (cursor.X - x) * Width / Math.Max(1, w), (cursor.Y - y) * Height / Math.Max(1, h), cursor.Cursor, 20, 20, 0, 0, 3);
                    var bytes = new byte[Width * Height * 4];
                    Marshal.Copy(pixels, bytes, 0, bytes.Length);
                    for (var i = 3; i < bytes.Length; i += 4) bytes[i] = 255;
                    var frame = new VideoFrame(Width, Height, VideoBufferType.Bgra, bytes);
                    Source.CaptureFrame(frame);
                    Frame?.Invoke(frame);
                }
            } while (await timer.WaitForNextTickAsync(lifetime.Token));
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { Failed?.Invoke(ex); }
        finally
        {
            if (windowBitmap != 0) { SelectObject(windowDc, windowPrevious); DeleteObject(windowBitmap); }
            if (windowDc != 0) DeleteDC(windowDc);
            SelectObject(dc, previous); DeleteObject(bitmap); DeleteDC(dc); ReleaseDC(0, desktop);
        }
    });

    public async ValueTask DisposeAsync()
    {
        lifetime.Cancel();
        LinuxAudio.Stop(linux);
        if (loop is not null) await loop.ConfigureAwait(false);
        if (linux is not null) { await linux.WaitForExitAsync(); linux.Dispose(); }
        Source.Dispose();
        lifetime.Dispose();
    }

    public static IReadOnlyList<ScreenSource> EnumerateSources()
    {
        if (OperatingSystem.IsLinux()) return [new ScreenSource("画面・ウィンドウを選択（デスクトップの共有ダイアログ）", 0, 0, 0, 1280, 720)];
        var list = new List<ScreenSource>();
        var i = 0;
        EnumDisplayMonitors(0, 0, (nint monitor, nint dc, ref Rect rect, nint data) =>
        {
            list.Add(new ScreenSource($"画面 {++i} · {rect.Right - rect.Left} × {rect.Bottom - rect.Top}", 0,
                rect.Left, rect.Top, rect.Right - rect.Left, rect.Bottom - rect.Top));
            return true;
        }, 0);
        EnumWindows((hwnd, _) =>
        {
            if (!IsWindowVisible(hwnd) || IsIconic(hwnd)) return true;
            var title = new StringBuilder(512); GetWindowText(hwnd, title, title.Capacity);
            if (title.Length == 0) return true;
            GetWindowRect(hwnd, out var rect);
            if (rect.Right - rect.Left > 120 && rect.Bottom - rect.Top > 80)
                list.Add(new ScreenSource(title.ToString(), hwnd, rect.Left, rect.Top, rect.Right - rect.Left, rect.Bottom - rect.Top));
            return true;
        }, 0);
        return list;
    }

    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct BitmapInfo { public uint Size; public int Width, Height; public ushort Planes, BitCount; public uint Compression, ImageSize; public int X, Y; public uint Used, Important; }
    [StructLayout(LayoutKind.Sequential)] private struct CursorInfo { public int Size, Flags; public nint Cursor; public int X, Y; }
    private delegate bool MonitorCallback(nint monitor, nint dc, ref Rect rect, nint data);
    private delegate bool WindowCallback(nint hwnd, nint data);
    [DllImport("user32.dll")] private static extern nint GetDC(nint hwnd);
    [DllImport("user32.dll")] private static extern int ReleaseDC(nint hwnd, nint dc);
    [DllImport("gdi32.dll")] private static extern nint CreateCompatibleDC(nint dc);
    [DllImport("gdi32.dll")] private static extern nint CreateCompatibleBitmap(nint dc, int width, int height);
    [DllImport("gdi32.dll")] private static extern nint CreateDIBSection(nint dc, ref BitmapInfo info, uint usage, out nint pixels, nint section, uint offset);
    [DllImport("gdi32.dll")] private static extern nint SelectObject(nint dc, nint obj);
    [DllImport("gdi32.dll")] private static extern bool DeleteObject(nint obj);
    [DllImport("gdi32.dll")] private static extern bool DeleteDC(nint dc);
    [DllImport("gdi32.dll")] private static extern int SetStretchBltMode(nint dc, int mode);
    [DllImport("gdi32.dll")] private static extern bool StretchBlt(nint dest, int dx, int dy, int dw, int dh, nint src, int sx, int sy, int sw, int sh, uint op);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(nint hwnd, out Rect rect);
    [DllImport("user32.dll")] private static extern bool PrintWindow(nint hwnd, nint dc, uint flags);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint hwnd);
    [DllImport("user32.dll")] private static extern bool IsWindow(nint hwnd);
    [DllImport("user32.dll")] private static extern bool IsIconic(nint hwnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(nint hwnd, StringBuilder title, int size);
    [DllImport("user32.dll")] private static extern bool EnumWindows(WindowCallback callback, nint data);
    [DllImport("user32.dll")] private static extern bool EnumDisplayMonitors(nint dc, nint rect, MonitorCallback callback, nint data);
    [DllImport("user32.dll")] private static extern bool GetCursorInfo(ref CursorInfo cursor);
    [DllImport("user32.dll")] private static extern bool DrawIconEx(nint dc, int x, int y, nint icon, int width, int height, uint step, nint brush, uint flags);
}
