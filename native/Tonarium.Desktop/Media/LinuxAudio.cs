using System.Diagnostics;
using System.Text.Json.Nodes;
using LiveKit.Rtc;
using NAudio.Wave;

namespace Tonarium.Desktop.Media;

internal static class LinuxAudio
{
    internal static Process Start(string command, IEnumerable<string> args, bool input = false)
    {
        var info = new ProcessStartInfo(command) { UseShellExecute = false, RedirectStandardInput = input, RedirectStandardOutput = !input, RedirectStandardError = true };
        foreach (var arg in args) info.ArgumentList.Add(arg);
        var process = Process.Start(info) ?? throw new IOException($"{command} を起動できません");
        process.ErrorDataReceived += (_, e) => { if (!string.IsNullOrEmpty(e.Data)) Program.Log(command + ": " + e.Data); };
        process.BeginErrorReadLine();
        return process;
    }

    internal static void Stop(Process? process)
    {
        if (process is null) return;
        try { if (!process.HasExited) process.Kill(entireProcessTree: true); }
        catch (InvalidOperationException) { }
    }

    internal static async Task<(string Id, string Name)[]> DevicesAsync(bool input)
    {
        using var process = Start("pactl", ["--format=json", "list", input ? "sources" : "sinks"]);
        var json = await process.StandardOutput.ReadToEndAsync();
        await process.WaitForExitAsync();
        if (process.ExitCode != 0) throw new IOException("PulseAudio/PipeWire のデバイスを取得できません");
        return JsonNode.Parse(json)!.AsArray().Select(d => (d!["name"]!.ToString(), d["description"]?.ToString() ?? d["name"]!.ToString())).ToArray();
    }
}

internal sealed class LinuxAudioCapture : IAsyncDisposable
{
    private readonly CancellationTokenSource lifetime = new();
    private readonly bool loopback;
    private readonly string? device;
    private readonly int channels;
    private Process? process;
    private Task? pump;
    public AudioSource Source { get; }
    public event Action<Exception>? Failed;
    public event Action<float, float>? LevelAvailable;

    public LinuxAudioCapture(bool loopback, string? device)
    {
        this.loopback = loopback; this.device = device;
        channels = loopback ? 2 : 1;
        Source = new AudioSource(48000, channels, 120);
    }

    public void Start()
    {
        var args = new List<string> { "--raw", "--format=s16le", "--rate=48000", $"--channels={channels}", "--latency-msec=20", "--client-name=Tonarium" };
        if (loopback) args.Add("--device=" + (device is null ? "@DEFAULT_MONITOR@" : device + ".monitor"));
        else if (device is not null) args.Add("--device=" + device);
        process = LinuxAudio.Start("parec", args);
        pump = Task.Run(async () =>
        {
            try
            {
                var bytes = new byte[480 * channels * 2];
                while (!lifetime.IsCancellationRequested)
                {
                    await process.StandardOutput.BaseStream.ReadExactlyAsync(bytes, lifetime.Token);
                    var pcm = new short[bytes.Length / 2];
                    Buffer.BlockCopy(bytes, 0, pcm, 0, bytes.Length);
                    double sum = 0; float peak = 0;
                    foreach (var sample in pcm) { var value = sample / 32768f; sum += value * value; peak = Math.Max(peak, Math.Abs(value)); }
                    LevelAvailable?.Invoke((float)Math.Sqrt(sum / pcm.Length), peak);
                    await Source.CaptureFrameAsync(new AudioFrame(pcm, 48000, channels, 480), lifetime.Token);
                }
            }
            catch (Exception ex) when (lifetime.IsCancellationRequested && ex is OperationCanceledException or IOException or ObjectDisposedException) { }
            catch (Exception ex) { Failed?.Invoke(ex); }
        });
    }

    public async ValueTask DisposeAsync()
    {
        lifetime.Cancel(); LinuxAudio.Stop(process);
        if (pump is not null) await pump;
        if (process is not null) { await process.WaitForExitAsync(); process.Dispose(); }
        Source.Dispose(); lifetime.Dispose();
    }
}

internal sealed class NativeAudioOutput : IDisposable
{
    private readonly WasapiOut? windows;
    private readonly Process? linux;
    private readonly CancellationTokenSource lifetime = new();
    private readonly Task? pump;

    public NativeAudioOutput(IWaveProvider provider, string? device)
    {
        if (OperatingSystem.IsWindows())
        {
            using var enumerator = new NAudio.CoreAudioApi.MMDeviceEnumerator();
            var endpoint = device is null ? enumerator.GetDefaultAudioEndpoint(NAudio.CoreAudioApi.DataFlow.Render, NAudio.CoreAudioApi.Role.Multimedia) : enumerator.GetDevice(device);
            windows = new WasapiOut(endpoint, NAudio.CoreAudioApi.AudioClientShareMode.Shared, true, 60);
            windows.Init(provider); windows.Play();
            return;
        }
        var format = provider.WaveFormat;
        var args = new List<string> { "--raw", "--format=float32le", $"--rate={format.SampleRate}", $"--channels={format.Channels}", "--latency-msec=60", "--client-name=Tonarium" };
        if (device is not null) args.Add("--device=" + device);
        linux = LinuxAudio.Start("paplay", args, input: true);
        pump = Task.Run(async () =>
        {
            try
            {
                var buffer = new byte[480 * format.BlockAlign];
                while (!lifetime.IsCancellationRequested)
                {
                    var count = provider.Read(buffer, 0, buffer.Length);
                    if (count == 0) break;
                    await linux.StandardInput.BaseStream.WriteAsync(buffer.AsMemory(0, count), lifetime.Token);
                }
            }
            catch (Exception ex) when (lifetime.IsCancellationRequested && ex is OperationCanceledException or IOException or ObjectDisposedException) { }
            catch (Exception ex) { Program.Log("Audio output: " + ex); }
        });
    }
    public void Stop() { lifetime.Cancel(); windows?.Stop(); LinuxAudio.Stop(linux); }
    public void Dispose()
    {
        Stop(); pump?.GetAwaiter().GetResult(); windows?.Dispose();
        if (linux is not null) { linux.WaitForExit(); linux.Dispose(); }
        lifetime.Dispose();
    }
}
