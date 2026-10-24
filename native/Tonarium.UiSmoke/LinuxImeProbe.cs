using Avalonia.Controls;
using Avalonia.Controls.Presenters;
using Avalonia.VisualTree;
using Tonarium.Desktop.Linux;

internal static class LinuxImeProbe
{
    public static async Task Run(string output, Action<string> pass)
    {
        if (LinuxInputMethod.Select(["org.freedesktop.portal.IBus", "org.freedesktop.portal.Fcitx"]) != "fcitx" ||
            LinuxInputMethod.Select(["org.freedesktop.portal.IBus"]) != "ibus" ||
            LinuxInputMethod.Select([]) is not null)
            throw new Exception("IME service selection failed");
        foreach (var variable in new[] { "AVALONIA_IM_MODULE", "GTK_IM_MODULE", "QT_IM_MODULE", "XMODIFIERS" })
            if (!LinuxInputMethod.HasExplicitSelection(key => key == variable ? (key == "XMODIFIERS" ? "@im=ibus" : "none") : null))
                throw new Exception($"Explicit IME selection ignored: {variable}");
        pass("IME detection prefers Fcitx over its IBus compatibility service and preserves explicit settings");
        var input = new TextBox { Watermark = "IME確認：nihongo → 日本語", Margin = new(24), Focusable = false };
        var window = new Window { Title = "Tonarium IME verification", Width = 500, Height = 150, Content = input };
        var preeditSeen = false;
        try
        {
            window.Show();
            window.Activate();
            await Task.Delay(1000);
            input.Focusable = true;
            input.Focus();
            File.WriteAllText(Path.Combine(output, "window-id"), window.TryGetPlatformHandle()!.Handle.ToInt64().ToString());
            var deadline = DateTime.UtcNow.AddSeconds(45);
            while (DateTime.UtcNow < deadline)
            {
                preeditSeen |= input.GetVisualDescendants().OfType<TextPresenter>().Any(p => !string.IsNullOrEmpty(p.PreeditText));
                File.WriteAllText(Path.Combine(output, "input-state.txt"), $"active={window.IsActive}, focused={input.IsFocused}, text={input.Text}, preedit={preeditSeen}");
                if (input.Text == "日本語")
                {
                    if (!preeditSeen) throw new Exception("Japanese commit arrived without observable preedit");
                    pass("Real Fcitx/Mozc keys produce preedit, conversion and committed Japanese text in Avalonia TextBox");
                    return;
                }
                await Task.Delay(25);
            }
            throw new Exception($"IME timed out: text={input.Text}, preedit={preeditSeen}, module={Environment.GetEnvironmentVariable("AVALONIA_IM_MODULE")}");
        }
        finally { window.Close(); }
    }
}
