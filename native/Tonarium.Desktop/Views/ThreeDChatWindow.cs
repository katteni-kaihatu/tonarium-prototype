using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Threading;

namespace Tonarium.Desktop.Views;

internal sealed class ThreeDChatWindow : Window
{
    private readonly TextBox input;
    private readonly TextBlock error = Ui.Text("", 12, "#C2402F");
    private readonly Func<string, Task> send;
    private bool sending;
    public string Draft => input.Text ?? "";

    public ThreeDChatWindow(string draft, Func<string, Task> send)
    {
        this.send = send;
        Title = "Tonarium 3D · チャット";
        Width = 560; Height = 190; MinWidth = 360; CanResize = false;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        FontFamily = Ui.BodyFont;
        input = Ui.Input("メッセージを入力", draft);
        input.Focusable = false;
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 10, HorizontalAlignment = HorizontalAlignment.Right };
        buttons.Children.Add(Ui.Button("閉じる", Close));
        buttons.Children.Add(Ui.Button("送信", () => _ = Submit()));
        Content = new StackPanel { Margin = new(20), Spacing = 12, Children = { input, error, buttons } };
        input.KeyDown += (_, e) =>
        {
            if (e.Key == Key.Enter) { e.Handled = true; _ = Submit(); }
        };
        KeyDown += (_, e) => { if (e.Key == Key.Escape && !sending) { e.Handled = true; Close(); } };
        // X11のIMEコンテキスト作成前に自動フォーカスしない。
        Opened += (_, _) => DispatcherTimer.RunOnce(() =>
        {
            input.Focusable = true;
            if (IsVisible && IsActive) { input.Focus(); input.CaretIndex = Draft.Length; }
        }, TimeSpan.FromMilliseconds(200));
    }

    private async Task Submit()
    {
        var text = Draft.Trim();
        if (sending || text.Length == 0) return;
        sending = true; input.IsReadOnly = true; error.Text = "";
        try { await send(text); input.Text = ""; Close(); }
        catch (Exception e) { error.Text = e.Message; }
        finally { sending = false; input.IsReadOnly = false; }
    }
}
