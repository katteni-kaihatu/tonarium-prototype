using Avalonia;
using Avalonia.Threading;
using Tonarium.Desktop.Core;

namespace Tonarium.Desktop;

internal static class Program
{
    public static string[] Arguments { get; private set; } = [];
    [STAThread]
    public static void Main(string[] args)
    {
        Arguments = args;
        AppDomain.CurrentDomain.UnhandledException += (_, e) => Log(e.ExceptionObject?.ToString() ?? "Unknown error");
        TaskScheduler.UnobservedTaskException += (_, e) => { Log(e.Exception.ToString()); e.SetObserved(); };
        try
        {
            using var instance = DesktopInstance.Acquire(Argument("--data-dir"));
            BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
        }
        catch (Exception e) { Log(e.ToString()); throw; }
    }
    public static AppBuilder BuildAvaloniaApp()
    {
        Linux.LinuxInputMethod.Configure();
        return AppBuilder.Configure<App>().UsePlatformDetect()
            .With(new X11PlatformOptions { EnableIme = true }).LogToTrace();
    }
    public static string? Argument(string name)
    {
        var i = Array.IndexOf(Arguments, name);
        return i >= 0 && i + 1 < Arguments.Length ? Arguments[i + 1] : null;
    }
    public static void Log(string text)
    {
        try
        {
            var path = DesktopInstance.DataDirectory;
            Directory.CreateDirectory(path);
            File.AppendAllText(Path.Combine(path, "desktop.log"), $"{DateTimeOffset.Now:O} {text}\n");
        }
        catch (IOException) { }
    }
}
