using System.Diagnostics;
using System.Text.Json.Nodes;

namespace Tonarium.Desktop.Media;

internal sealed class LinuxVoiceSession : IAsyncDisposable
{
    private readonly Process process;
    private readonly Task pump;
    private readonly TaskCompletionSource ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private string? error;
    private Task? disposal;
    private bool stopping;
    public Task Ready => ready.Task;
    public Task Completion => pump;
    public event Action<string>? Changed;
    public event Action<string>? Failed;

    public LinuxVoiceSession(bool record, string path, string? device = null)
    {
        var info = new ProcessStartInfo(Environment.GetEnvironmentVariable("TONARIUM_PYTHON") ?? "/usr/bin/python3")
        { UseShellExecute = false, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var arg in new[] { Path.Combine(AppContext.BaseDirectory, "Linux", "voice.py"), record ? "record" : "play", Path.GetFullPath(path) }) info.ArgumentList.Add(arg);
        if (device is not null) { info.ArgumentList.Add("--device"); info.ArgumentList.Add(device); }
        process = Process.Start(info) ?? throw new IOException("音声処理を開始できません");
        process.ErrorDataReceived += (_, e) => { if (e.Data is not null) Program.Log("Voice: " + e.Data); };
        process.BeginErrorReadLine();
        pump = ReadAsync();
    }

    private async Task ReadAsync()
    {
        try
        {
            while (await process.StandardOutput.ReadLineAsync().ConfigureAwait(false) is { } line)
            {
                var value = JsonNode.Parse(line)!;
                var kind = value["event"]!.ToString();
                if (kind == "ready") ready.TrySetResult();
                else if (kind == "error") error = value["message"]?.ToString() ?? "音声処理に失敗しました";
                Changed?.Invoke(kind);
            }
            await process.WaitForExitAsync().ConfigureAwait(false);
            if (process.ExitCode != 0) error ??= "音声処理が終了しました。デバイスとコーデックを確認してください。";
        }
        catch (Exception ex) { error = ex.Message; }
        if (error is not null) { ready.TrySetException(new IOException(error)); Failed?.Invoke(error); }
        else if (!ready.Task.IsCompleted) ready.TrySetException(new IOException("音声処理が開始前に終了しました"));
    }

    public void Command(string command)
    {
        if (command is not ("stop" or "pause" or "play")) throw new ArgumentException(nameof(command));
        if (!process.HasExited) { process.StandardInput.WriteLine(command); process.StandardInput.Flush(); }
    }

    public async Task StopAsync()
    {
        if (!stopping) { stopping = true; Command("stop"); }
        await pump.WaitAsync(TimeSpan.FromSeconds(8));
        if (error is not null) throw new IOException(error);
    }

    public ValueTask DisposeAsync() => new(disposal ??= DisposeCoreAsync());
    private async Task DisposeCoreAsync()
    {
        try { await StopAsync(); }
        catch (Exception ex) { Program.Log("Voice cleanup: " + ex.Message); LinuxAudio.Stop(process); }
        await pump.ConfigureAwait(false);
        process.Dispose();
    }
}
