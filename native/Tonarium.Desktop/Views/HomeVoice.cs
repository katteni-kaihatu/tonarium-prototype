using System;
using System.IO;
using System.Net.Http;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using NAudio.MediaFoundation;
using NAudio.Wave;
using Tonarium.Desktop.Core;

namespace Tonarium.Desktop.Views;

/// <summary>OSごとの録音・再生経路を使う音声メッセージ。</summary>
internal static partial class HomeVoiceMessage
{
    private static readonly HttpClient Http = new();

    public static void ShowRecorder(NativeContext context,string conversation)
    {
        if (OperatingSystem.IsLinux()) { ShowLinuxRecorder(context, conversation); return; }
        var folder=Path.Combine(Path.GetTempPath(),"Tonarium","voice");Directory.CreateDirectory(folder);
        var stem=Path.Combine(folder,Guid.NewGuid().ToString("N"));var wavePath=stem+".wav";var encodedPath=stem+".m4a";
        var window=MakeWindow("音声メッセージ");var status=Ui.Text("録音を始めるとマイクを使います。最長 60 秒。",13);
        var clock=Ui.Text("0:00",36);clock.HorizontalAlignment=HorizontalAlignment.Center;
        WaveInEvent? source=null;WaveFileWriter? writer=null;TaskCompletionSource? stopped=null;
        DateTime started=default;bool recording=false,sending=false,closed=false;int seconds=0;
        var timer=new DispatcherTimer{Interval=TimeSpan.FromMilliseconds(200)};
        Button record=null!;Button send=null!;
        record=Ui.Button("● 録音を始める",()=>Start());send=Ui.Button("停止して送信",()=>_ = Finish());send.IsEnabled=false;
        window.Content=Ui.Column(Ui.Title("音声メッセージ"),status,clock,Ui.Row(record,send,Ui.Button("やめる",()=>window.Close())));((StackPanel)window.Content).Margin=new Thickness(24);

        void Start()
        {
            try
            {
                source=new WaveInEvent{WaveFormat=new WaveFormat(48000,16,1),BufferMilliseconds=50};writer=new WaveFileWriter(wavePath,source.WaveFormat);stopped=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                source.DataAvailable+=(_,e)=>{writer?.Write(e.Buffer,0,e.BytesRecorded);};
                source.RecordingStopped+=(_,e)=>{writer?.Dispose();writer=null;stopped.TrySetResult();};
                started=DateTime.UtcNow;source.StartRecording();recording=true;timer.Start();record.IsEnabled=false;send.IsEnabled=true;status.Text="録音中… 停止して送信すると、この会話に届きます。";
            }
            catch(Exception e){status.Text="マイクを開始できませんでした: "+e.Message;source?.Dispose();source=null;writer?.Dispose();writer=null;}
        }
        async Task Finish()
        {
            if(!recording||sending)return;sending=true;recording=false;timer.Stop();send.IsEnabled=false;seconds=Math.Clamp((int)Math.Ceiling((DateTime.UtcNow-started).TotalSeconds),1,60);status.Text="音声を保存しています…";
            try
            {
                source!.StopRecording();if(stopped!=null)await stopped.Task;source.Dispose();source=null;
                await Task.Run(()=>EncodeWave(wavePath,encodedPath));if(closed){TryDelete(wavePath);TryDelete(encodedPath);return;}
                using var body=new ByteArrayContent(await File.ReadAllBytesAsync(encodedPath));using var response=await Http.PostAsync(new Uri(new Uri(context.State.ServerUrl.TrimEnd('/')+"/"),"media"),body);
                var result=JsonNode.Parse(await response.Content.ReadAsStringAsync());var url=result?["url"]?.GetValue<string>();if(!response.IsSuccessStatusCode||string.IsNullOrEmpty(url))throw new InvalidOperationException(result?["error"]?.GetValue<string>()??"アップロードできませんでした");
                await context.Client.SendAsync(new{t="msg",conv=conversation,text="",voice=new{url,sec=seconds}});context.Notify("音声メッセージを送りました");window.Close();
            }
            catch(Exception e){status.Text="送信できませんでした: "+e.Message;context.Notify(status.Text);}
        }
        timer.Tick+=(_,_)=>{seconds=Math.Min(60,(int)(DateTime.UtcNow-started).TotalSeconds);clock.Text=$"{seconds/60}:{seconds%60:00}";if(seconds>=60)_=Finish();};
        window.Closed+=(_,_)=>{closed=true;timer.Stop();recording=false;if(source!=null){source.StopRecording();source.Dispose();source=null;}writer?.Dispose();writer=null;TryDelete(wavePath);TryDelete(encodedPath);};
        _=window.ShowDialog(context.Owner);
    }

    internal static void EncodeWave(string source,string target)
    {
        MediaFoundationApi.Startup();using var wave=new WaveFileReader(source);MediaFoundationEncoder.EncodeToAac(wave,target,96000);
    }

    public static void Play(NativeContext context,string url)
    {
        if (OperatingSystem.IsLinux()) { PlayLinux(context, url); return; }
        var window=MakeWindow("音声メッセージ");var status=Ui.Text("音声を読み込んでいます…",14);var absolute=new Uri(new Uri(context.State.ServerUrl.TrimEnd('/')+"/"),url).ToString();
        WaveOutEvent? player=null;MediaFoundationReader? reader=null;string? local=null;var closed=false;
        var toggle=Ui.Button("一時停止",()=>{if(player==null||reader==null)return;if(player.PlaybackState==PlaybackState.Playing)player.Pause();else{if(reader.Position>=reader.Length)reader.Position=0;player.Play();}});toggle.IsEnabled=false;
        var open=Ui.Button("ブラウザで開く",()=>{try{System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(absolute){UseShellExecute=true});}catch(Exception e){context.Notify(e.Message);}});
        window.Content=Ui.Column(Ui.Title("音声メッセージ"),status,Ui.Row(toggle,open,Ui.Button("閉じる",()=>window.Close())));((StackPanel)window.Content).Margin=new Thickness(24);
        window.Closed+=(_,_)=>{closed=true;player?.Stop();player?.Dispose();reader?.Dispose();if(local!=null)TryDelete(local);};
        window.Opened+=async(_,_)=>
        {
            try
            {
                var bytes=await Http.GetByteArrayAsync(absolute);if(closed)return;var folder=Path.Combine(Path.GetTempPath(),"Tonarium","voice");Directory.CreateDirectory(folder);local=Path.Combine(folder,Guid.NewGuid().ToString("N")+Path.GetExtension(new Uri(absolute).AbsolutePath));await File.WriteAllBytesAsync(local,bytes);if(closed){TryDelete(local);return;}
                MediaFoundationApi.Startup();reader=new MediaFoundationReader(local);player=new WaveOutEvent();player.Init(reader);player.PlaybackStopped+=(_,_)=>Dispatcher.UIThread.Post(()=>{if(!closed){status.Text="再生しました";toggle.Content="もう一度再生";}});toggle.Click+=(_,_)=>{toggle.Content=player.PlaybackState==PlaybackState.Playing?"一時停止":"再生";};
                status.Text=$"▶ {reader.TotalTime:m\\:ss}";toggle.IsEnabled=true;player.Play();
            }
            catch(Exception e){if(!closed)status.Text="この音声はブラウザで再生できます。 "+e.Message;}
        };
        _=window.ShowDialog(context.Owner);
    }
    private static Window MakeWindow(string title)=>new(){Title=title,Width=490,SizeToContent=SizeToContent.Height,CanResize=false,WindowStartupLocation=WindowStartupLocation.CenterOwner,ShowInTaskbar=false,Background=SolidColorBrush.Parse("#FFFDF9")};
    private static void TryDelete(string path){try{File.Delete(path);}catch(IOException){}catch(UnauthorizedAccessException){}}
}
