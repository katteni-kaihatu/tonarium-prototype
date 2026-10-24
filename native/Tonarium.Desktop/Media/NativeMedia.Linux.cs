using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Layout;
using Avalonia.Threading;
using NAudio.Wave;
using Tonarium.Desktop.Core;
using Tonarium.Desktop.Views;

namespace Tonarium.Desktop.Media;

public sealed partial class NativeMedia
{
    private async Task ShowLinuxAudioSettingsAsync(Window? owner)
    {
        owner ??= (Application.Current?.ApplicationLifetime as IClassicDesktopStyleApplicationLifetime)?.MainWindow;
        if (owner is null) return;
        try
        {
            var inputs = await LinuxAudio.DevicesAsync(true);
            var outputs = await LinuxAudio.DevicesAsync(false);
            var microphones = new[] { new AudioDevice(null, "システムの既定") }.Concat(inputs.Select(d => new AudioDevice(d.Id, d.Name))).ToArray();
            var speakers = new[] { new AudioDevice(null, "システムの既定") }.Concat(outputs.Select(d => new AudioDevice(d.Id, d.Name))).ToArray();
            var mic = new ComboBox { ItemsSource = microphones, SelectedItem = microphones.FirstOrDefault(d => d.Id == microphoneDevice) ?? microphones[0], HorizontalAlignment = HorizontalAlignment.Stretch };
            var speaker = new ComboBox { ItemsSource = speakers, SelectedItem = speakers.FirstOrDefault(d => d.Id == speakerDevice) ?? speakers[0], HorizontalAlignment = HorizontalAlignment.Stretch };
            var dialog = new Window { Title = "音声設定", Width = 520, Height = 340, WindowStartupLocation = WindowStartupLocation.CenterOwner };
            dialog.Content = new StackPanel { Margin = new Thickness(24), Spacing = 12, Children = {
                Ui.Title("音声設定"), Ui.Text("マイク"), mic, Ui.Text("スピーカー / ヘッドホン"), speaker,
                Ui.Text("PipeWire / PulseAudio のデバイスを使用します", 12),
                Ui.Button("適用", () => dialog.Close(true)), Ui.Button("キャンセル", () => dialog.Close(false)) } };
            if (!await dialog.ShowDialog<bool>(owner)) return;
            microphoneDevice = (mic.SelectedItem as AudioDevice)?.Id;
            speakerDevice = (speaker.SelectedItem as AudioDevice)?.Id;
            if (persistPreferences)
            {
                NativeSettings.SetString("microphoneDevice", microphoneDevice ?? "");
                NativeSettings.SetString("speakerDevice", speakerDevice ?? "");
            }
            await gate.WaitAsync();
            try
            {
                await StopMicrophoneAsync(); output?.Dispose(); output = null;
                if (mixer is not null) output = new NativeAudioOutput(mixer.ToWaveProvider(), speakerDevice);
                if (microphoneWanted && Connected) await StartMicrophoneAsync();
                await ReportAsync();
            }
            finally { gate.Release(); }
        }
        catch (Exception ex) { SetStatus("音声デバイス: " + SafeError(ex)); }
    }
}
