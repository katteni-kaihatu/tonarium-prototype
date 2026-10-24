using System.Reflection;
using Avalonia.Controls;
using Avalonia.Controls.Presenters;
using Avalonia.VisualTree;
using Tonarium.Desktop.Core;
using Tonarium.Desktop.Media;
using Tonarium.Desktop.Views;

internal static class LinuxFormImeProbe
{
    internal static async Task Run(string output, Action<string> pass)
    {
        await using var client = new TonariumClient(new ClientState { Name = "IME test" }, persistSettings: false);
        await using var media = new NativeMedia(client);
        var owner = new Window { Title = "Tonarium form IME verification", Width = 1000, Height = 720 };
        var home = new HomeView(new NativeContext(client, media, owner)); owner.Content = home;
        owner.Show(); owner.Activate();
        try
        {
            await Task.Delay(500);
            typeof(HomeView).GetMethod("CreateSession", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(home, ["cafe", null]);
            var dialog = owner.OwnedWindows.Single();
            var input = dialog.GetVisualDescendants().OfType<TextBox>().First(t => t.PlaceholderText == "セッション名");
            File.WriteAllText(Path.Combine(output, "window-id"), dialog.TryGetPlatformHandle()!.Handle.ToInt64().ToString());
            var deadline = DateTime.UtcNow.AddSeconds(40); bool preedit = false;
            while (DateTime.UtcNow < deadline)
            {
                preedit |= input.GetVisualDescendants().OfType<TextPresenter>().Any(p => !string.IsNullOrEmpty(p.PreeditText));
                File.WriteAllText(Path.Combine(output, "input-state.txt"), $"active={dialog.IsActive}, focused={input.IsFocused}, text={input.Text}, preedit={preedit}");
                if (input.Text == "日本語" && preedit) { pass("Session name accepts initial IME preedit and commit without Tab or refocusing"); dialog.Close(); return; }
                await Task.Delay(25);
            }
            throw new Exception("Initial session-name IME failed: " + File.ReadAllText(Path.Combine(output, "input-state.txt")));
        }
        finally { owner.Close(); }
    }
}
