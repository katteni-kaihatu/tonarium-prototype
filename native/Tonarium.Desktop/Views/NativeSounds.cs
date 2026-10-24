using System.Media;
using System.Text;

namespace Tonarium.Desktop.Views;

internal static class NativeSounds
{
    public static void Play(string id)
    {
        _ = Task.Run(() =>
        {
            try
            {
                var frequency = id switch { "bell" => 880, "pop" => 520, "clap" => 180, "success" => 1047, _ => 660 };
                const int sampleRate = 22050, samples = 4410;
                using var stream = new MemoryStream(); using var writer = new BinaryWriter(stream, Encoding.ASCII, true);
                writer.Write(Encoding.ASCII.GetBytes("RIFF")); writer.Write(36 + samples * 2); writer.Write(Encoding.ASCII.GetBytes("WAVEfmt ")); writer.Write(16); writer.Write((short)1); writer.Write((short)1); writer.Write(sampleRate); writer.Write(sampleRate * 2); writer.Write((short)2); writer.Write((short)16); writer.Write(Encoding.ASCII.GetBytes("data")); writer.Write(samples * 2);
                for (var i = 0; i < samples; i++) writer.Write((short)(Math.Sin(2 * Math.PI * frequency * i / sampleRate) * Math.Exp(-5.0 * i / samples) * 7000));
                stream.Position = 0;
                if (OperatingSystem.IsLinux())
                {
                    using var player = Media.LinuxAudio.Start("paplay", ["--raw", "--format=s16le", "--rate=22050", "--channels=1", "--client-name=Tonarium"], input: true);
                    player.StandardInput.BaseStream.Write(stream.GetBuffer(), 44, samples * 2);
                    player.StandardInput.Close(); player.WaitForExit();
                }
                else { using var player = new SoundPlayer(stream); player.PlaySync(); }
            }
            catch (Exception e) { Program.Log("Sound: " + e.Message); }
        });
    }
}
