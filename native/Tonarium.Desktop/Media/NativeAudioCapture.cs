using System.Threading.Channels;
using LiveKit.Rtc;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace Tonarium.Desktop.Media;

/// <summary>WASAPI samples are resampled once to LiveKit's 48 kHz PCM input.</summary>
internal sealed class NativeAudioCapture : IAsyncDisposable
{
    private readonly WasapiCapture? capture;
    private readonly LinuxAudioCapture? linux;
    private readonly BufferedWaveProvider buffer = null!;
    private readonly ISampleProvider samples = null!;
    private readonly CancellationTokenSource lifetime = new();
    private readonly Channel<AudioFrame> frames = Channel.CreateBounded<AudioFrame>(new BoundedChannelOptions(8)
    { SingleReader = true, SingleWriter = true, FullMode = BoundedChannelFullMode.DropOldest });
    private readonly Task pump = Task.CompletedTask;
    private readonly int channels;
    public AudioSource Source { get; }
    public event Action<Exception>? Failed;
    public event Action<float, float>? LevelAvailable;

    public NativeAudioCapture(bool loopback, string? deviceId = null)
    {
        if (OperatingSystem.IsLinux())
        {
            linux = new LinuxAudioCapture(loopback, deviceId);
            Source = linux.Source;
            linux.Failed += error => Failed?.Invoke(error);
            linux.LevelAvailable += (rms, peak) => LevelAvailable?.Invoke(rms, peak);
            return;
        }
        using var devices = new MMDeviceEnumerator();
        var device = deviceId is null
            ? devices.GetDefaultAudioEndpoint(loopback ? DataFlow.Render : DataFlow.Capture, Role.Multimedia)
            : devices.GetDevice(deviceId);
        capture = loopback ? new WasapiLoopbackCapture(device) : new WasapiCapture(device);
        channels = loopback ? 2 : 1;
        buffer = new BufferedWaveProvider(capture.WaveFormat)
        { BufferDuration = TimeSpan.FromMilliseconds(250), DiscardOnBufferOverflow = true, ReadFully = false };
        ISampleProvider input = buffer.ToSampleProvider();
        if (!loopback && input.WaveFormat.Channels == 2) input = input.ToMono();
        if (loopback && input.WaveFormat.Channels == 1) input = input.ToStereo();
        if (input.WaveFormat.Channels != channels)
            throw new NotSupportedException("この音声デバイスのチャンネル構成には対応していません。モノラルまたはステレオを選んでください。");
        samples = input.WaveFormat.SampleRate == 48000 ? input : new WdlResamplingSampleProvider(input, 48000);
        Source = new AudioSource(48000, channels, 120);
        capture.DataAvailable += OnData;
        capture.RecordingStopped += (_, e) => { if (e.Exception is not null && !lifetime.IsCancellationRequested) Failed?.Invoke(e.Exception); };
        pump = Task.Run(async () =>
        {
            try
            {
                await foreach (var frame in frames.Reader.ReadAllAsync(lifetime.Token))
                    await Source.CaptureFrameAsync(frame, lifetime.Token);
            }
            catch (OperationCanceledException) { }
            catch (Exception ex) { if (!lifetime.IsCancellationRequested) Failed?.Invoke(ex); }
        });
    }

    public void Start() { if (linux is not null) linux.Start(); else capture!.StartRecording(); }

    private void OnData(object? sender, WaveInEventArgs e)
    {
        if (lifetime.IsCancellationRequested) return;
        buffer.AddSamples(e.Buffer, 0, e.BytesRecorded);
        var floats = new float[480 * channels];
        int read;
        while ((read = samples.Read(floats, 0, floats.Length)) > 0)
        {
            read -= read % channels;
            if (read == 0) break;
            var pcm = new short[read];
            double squareSum = 0;
            float peak = 0;
            for (var i = 0; i < read; i++)
            {
                var value = floats[i];
                squareSum += value * value;
                peak = Math.Max(peak, Math.Abs(value));
                pcm[i] = (short)Math.Clamp(value * 32767f, -32768f, 32767f);
            }
            LevelAvailable?.Invoke((float)Math.Sqrt(squareSum / read), peak);
            frames.Writer.TryWrite(new AudioFrame(pcm, 48000, channels, read / channels));
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (linux is not null) { await linux.DisposeAsync(); lifetime.Dispose(); return; }
        lifetime.Cancel();
        capture!.DataAvailable -= OnData;
        capture.StopRecording();
        capture.Dispose();
        frames.Writer.TryComplete();
        await pump.ConfigureAwait(false);
        Source.Dispose();
        lifetime.Dispose();
    }
}
