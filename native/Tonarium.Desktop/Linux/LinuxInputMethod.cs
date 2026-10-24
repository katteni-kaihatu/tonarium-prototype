using Tmds.DBus.Protocol;
using System.Diagnostics;
using System.Reflection;
using Avalonia.Controls;
using Avalonia.Input.TextInput;

namespace Tonarium.Desktop.Linux;

internal static class LinuxInputMethod
{
    public static void Configure()
    {
        if (!OperatingSystem.IsLinux() || HasExplicitSelection(Environment.GetEnvironmentVariable)) return;
        try
        {
            var method = DetectAsync().GetAwaiter().GetResult();
            if (method is not null)
            {
                Environment.SetEnvironmentVariable("AVALONIA_IM_MODULE", method);
                Program.Log($"Linux IME auto-detected: {method}");
            }
        }
        catch (Exception error)
        {
            Program.Log($"Linux IME detection failed: {error.Message}");
        }
    }

    internal static async Task RestoreInitialClientAsync(Window window)
    {
        if (!OperatingSystem.IsLinux()) return;
        try
        {
            var ime = window.PlatformImpl?.TryGetFeature(typeof(ITextInputMethodImpl)) as ITextInputMethodImpl;
            if (ime is null) return;
            var type = ime.GetType();
            if (type.Namespace?.StartsWith("Avalonia.FreeDesktop.DBusIme", StringComparison.Ordinal) != true) return;
            var connected = type.GetProperty("IsConnected", BindingFlags.Instance | BindingFlags.NonPublic);
            var client = type.GetProperty("Client", BindingFlags.Instance | BindingFlags.Public);
            if (connected is null || client is null) return;
            // Avalonia 12.0はD-Bus接続前のSetClientを接続完了後に再送しない。
            for (int attempt = 0; attempt < 250 && window.IsVisible; attempt++)
            {
                if (connected.GetValue(ime) is true)
                {
                    typeof(ITextInputMethodImpl).GetMethod("SetClient", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)?.Invoke(ime, [client.GetValue(ime)]);
                    connected.DeclaringType?.GetMethod("UpdateCursorRect", BindingFlags.Instance | BindingFlags.NonPublic)?.Invoke(ime, null);
                    return;
                }
                await Task.Delay(20);
            }
        }
        catch (Exception error) { Program.Log("Initial IME connection: " + error.Message); }
    }

    internal static void ConfigureUnity(ProcessStartInfo info)
    {
        string? Get(string key) => info.Environment.TryGetValue(key, out var value) ? value : null;
        if (!OperatingSystem.IsLinux()) return;
        // Unity 6.6は長いSDLの未確定文字列を10文字単位で上書きするため、IME側で表示する。
        if (string.IsNullOrWhiteSpace(Get("SDL_IME_INTERNAL_EDITING"))) info.Environment["SDL_IME_INTERNAL_EDITING"] = "1";
        if (!string.IsNullOrWhiteSpace(Get("SDL_IM_MODULE"))) return;
        string? module = null;
        var modifiers = Get("XMODIFIERS");
        if (modifiers?.Contains("@im=fcitx", StringComparison.Ordinal) == true) module = "fcitx";
        else if (modifiers?.Contains("@im=ibus", StringComparison.Ordinal) == true) module = "ibus";
        else foreach (var name in new[] { "AVALONIA_IM_MODULE", "GTK_IM_MODULE", "QT_IM_MODULE" })
        {
            var value = Get(name);
            if (value is "fcitx" or "fcitx5" or "ibus") { module = value == "fcitx5" ? "fcitx" : value; break; }
        }
        if (module is null) return;
        // UnityのSDLはAvalonia用の自動検出結果を参照しない。
        info.Environment["SDL_IM_MODULE"] = module;
        if (string.IsNullOrWhiteSpace(modifiers)) info.Environment["XMODIFIERS"] = "@im=" + module;
    }

    internal static bool HasExplicitSelection(Func<string, string?> get) =>
        !string.IsNullOrWhiteSpace(get("AVALONIA_IM_MODULE")) ||
        new[] { "GTK_IM_MODULE", "QT_IM_MODULE" }.Any(name => get(name) is "fcitx" or "fcitx5" or "ibus" or "none") ||
        (get("XMODIFIERS")?.Contains("@im=", StringComparison.Ordinal) ?? false);

    internal static string? Select(IEnumerable<string> names)
    {
        var services = names.ToHashSet(StringComparer.Ordinal);
        // Fcitx5はIBus互換サービスも公開するため、専用プロトコルを優先する。
        if (services.Contains("org.freedesktop.portal.Fcitx") || services.Contains("org.fcitx.Fcitx")) return "fcitx";
        if (services.Contains("org.freedesktop.portal.IBus")) return "ibus";
        return null;
    }

    private static async Task<string?> DetectAsync()
    {
        if (Address.Session is not { } address) return null;
        using var connection = new Connection(address);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        await connection.ConnectAsync().AsTask().WaitAsync(timeout.Token);
        var names = await connection.CallMethodAsync(ListNames(connection),
            static (message, _) => message.GetBodyReader().ReadArrayOfString()).WaitAsync(timeout.Token);
        return Select(names);
    }

    private static MessageBuffer ListNames(Connection connection)
    {
        using var writer = connection.GetMessageWriter();
        writer.WriteMethodCallHeader(destination: "org.freedesktop.DBus", path: "/org/freedesktop/DBus",
            @interface: "org.freedesktop.DBus", member: "ListNames");
        return writer.CreateMessage();
    }
}
