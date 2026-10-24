using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Platform;
using Avalonia.Threading;
using Microsoft.Web.WebView2.Core;
using Tonarium.Desktop.Core;

namespace Tonarium.Desktop.Views;

/// <summary>The only web surface in the native UI: an on-demand official YouTube iframe player.</summary>
internal sealed class NativeYoutubeView : NativeControlHost, IDisposable
{
    private readonly string videoId;
    private readonly Action<object> send;
    private readonly Action<string> report;
    private LinuxYoutube? linux;
    private CoreWebView2Controller? controller;
    private CoreWebView2Environment? environment;
    private IntPtr window;
    private bool disposed;
    private bool updating;
    private string pendingClock = "{\"playing\":false,\"position\":0}";
    private DateTime lastUpdate = DateTime.MinValue;
    private bool lastPlaying;
    private double lastBase = -1;
    private double lastAt = -1;

    public NativeYoutubeView(string videoId, Action<object> send, Action<string> report)
    {
        this.videoId = videoId; this.send = send; this.report = report;
        Height = 340; MinHeight = 220;
        HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Stretch;
        LayoutUpdated += (_, _) => ResizeController();
    }

    protected override IPlatformHandle CreateNativeControlCore(IPlatformHandle parent)
    {
        if (OperatingSystem.IsLinux())
        {
            var host = base.CreateNativeControlCore(parent);
            try
            {
                linux = new LinuxYoutube(host.Handle, videoId, PlayerHtml, HandleMessage, report);
                linux.Clock(pendingClock);
                ResizeController();
            }
            catch (Exception ex) { report("YouTubeプレーヤーを開けませんでした: " + ex.Message); }
            return host;
        }
        window = CreateWindowEx(0, "STATIC", "", 0x40000000u | 0x10000000u | 0x04000000u, 0, 0, 1, 1, parent.Handle, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
        if (window == IntPtr.Zero) throw new InvalidOperationException("YouTube表示用のウィンドウを作成できませんでした。");
        _ = InitializeAsync(window);
        return new PlatformHandle(window, "HWND");
    }

    private async Task InitializeAsync(IntPtr handle)
    {
        try
        {
            var root = Path.Combine(DesktopInstance.DataDirectory, "YouTube");
            var pages = Path.Combine(root, "Player"); Directory.CreateDirectory(pages);
            await File.WriteAllTextAsync(Path.Combine(pages, "player.html"), PlayerHtml);
            environment = await CoreWebView2Environment.CreateAsync(userDataFolder: Path.Combine(root, "BrowserProfile"),
                options: new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required"));
            if (disposed || handle != window) return;
            controller = await environment.CreateCoreWebView2ControllerAsync(handle);
            if (disposed || handle != window) { controller.Close(); controller = null; return; }
            controller.DefaultBackgroundColor = System.Drawing.Color.FromArgb(255, 23, 21, 28);
            var web = controller.CoreWebView2;
            web.Settings.AreDefaultContextMenusEnabled = false;
            web.Settings.AreDevToolsEnabled = false;
            web.Settings.IsStatusBarEnabled = false;
            web.Settings.IsZoomControlEnabled = false;
            web.SetVirtualHostNameToFolderMapping("tonarium.local", pages, CoreWebView2HostResourceAccessKind.Allow);
            web.WebMessageReceived += OnMessage;
            web.NewWindowRequested += (_, e) =>
            {
                e.Handled = true;
                if (Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https")
                    try { Process.Start(new ProcessStartInfo(e.Uri) { UseShellExecute = true }); } catch { }
            };
            web.NavigationCompleted += async (_, _) => { if (!disposed && controller is not null) await web.ExecuteScriptAsync("window.applyClock && window.applyClock(" + pendingClock + ")"); };
            web.Navigate("https://tonarium.local/player.html?id=" + Uri.EscapeDataString(videoId));
            ResizeController();
            controller.IsVisible = true;
        }
        catch (Exception ex)
        {
            Dispatcher.UIThread.Post(() => report("YouTubeプレーヤーを開けませんでした。ブラウザでも視聴できます。 " + ex.Message));
        }
    }

    private void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!e.Source.StartsWith("https://tonarium.local/", StringComparison.OrdinalIgnoreCase)) return;
        try
        {
            if (JsonNode.Parse(e.WebMessageAsJson) is JsonObject message) HandleMessage(message);
        }
        catch (JsonException) { }
    }

    private void HandleMessage(JsonObject message)
    {
        var action = ItemWindow.Str(message, "a");
        if (action == "ready") { report("再生・一時停止・シークは全員に反映されます"); return; }
        if (action == "error") { report("この動画は埋め込みで再生できません。YouTubeで開いてください。（" + ItemWindow.Num(message, "code") + "）"); return; }
        if (action is "mediaPlay" or "mediaPause" or "mediaSeek") send(new { a = action, pos = Math.Max(0, ItemWindow.Num(message, "pos")) });
    }

    public async void UpdateClock(JsonObject? clock, long offset)
    {
        if (clock is null || disposed) return;
        var playing = ItemWindow.Bool(clock, "playing"); var basePosition = ItemWindow.Num(clock, "base"); var at = ItemWindow.Num(clock, "at");
        pendingClock = JsonSerializer.Serialize(new { playing, position = ItemWindow.ClockPosition(clock, offset), revision = new { playing, basePosition, at } });
        if (linux is not null)
        {
            if (DateTime.UtcNow - lastUpdate < TimeSpan.FromMilliseconds(500) && playing == lastPlaying && basePosition == lastBase && at == lastAt) return;
            lastUpdate = DateTime.UtcNow; lastPlaying = playing; lastBase = basePosition; lastAt = at;
            linux.Clock(pendingClock); return;
        }
        if (controller is null || updating || DateTime.UtcNow - lastUpdate < TimeSpan.FromMilliseconds(500) && playing == lastPlaying && basePosition == lastBase && at == lastAt) return;
        updating = true; lastUpdate = DateTime.UtcNow; lastPlaying = playing; lastBase = basePosition; lastAt = at;
        try
        {
            // スクリプト実行中に届いたシークや停止も、最後の時計まで順に反映する。
            string applied;
            do
            {
                applied = pendingClock;
                await controller.CoreWebView2.ExecuteScriptAsync("window.applyClock && window.applyClock(" + applied + ")");
            } while (!disposed && controller is not null && applied != pendingClock);
        }
        catch (Exception) when (disposed || controller is null) { }
        catch (Exception ex) { report("YouTubeの再生同期を再試行しています: " + ex.Message); }
        finally { updating = false; }
    }

    private void ResizeController()
    {
        if (linux is not null) { var scale = TopLevel.GetTopLevel(this)?.RenderScaling ?? 1; linux.Resize(Math.Max(1, (int)(Bounds.Width * scale)), Math.Max(1, (int)(Bounds.Height * scale))); return; }
        if (controller is null || window == IntPtr.Zero || disposed) return;
        if (GetClientRect(window, out var r)) controller.Bounds = new System.Drawing.Rectangle(0, 0, Math.Max(1, r.Right), Math.Max(1, r.Bottom));
    }

    protected override void DestroyNativeControlCore(IPlatformHandle control) { Dispose(); if (OperatingSystem.IsLinux()) base.DestroyNativeControlCore(control); }
    public void Dispose()
    {
        if (disposed) return; disposed = true;
        linux?.Dispose(); linux = null;
        if (controller is not null) { controller.CoreWebView2.WebMessageReceived -= OnMessage; controller.Close(); controller = null; }
        if (window != IntPtr.Zero) { DestroyWindow(window); window = IntPtr.Zero; }
        environment = null;
    }

    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr CreateWindowEx(uint extendedStyle, string className, string title, uint style, int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr parameter);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool DestroyWindow(IntPtr window);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool GetClientRect(IntPtr window, out Rect rect);

    private const string PlayerHtml = """
        <!doctype html><html lang="ja"><meta charset="utf-8">
        <meta name="referrer" content="strict-origin-when-cross-origin">
        <style>html,body,#player{width:100%;height:100%;margin:0;overflow:hidden;background:#17151c;color:#eee;font:14px system-ui}#loading{position:absolute;inset:0;display:grid;place-items:center}</style>
        <div id="loading">YouTube を読み込み中…</div><div id="player"></div>
        <script>
        let player,ready=false,desired={playing:false,position:0},suppressUntil=0,lastTime=0,lastTick=performance.now(),lastState=-1,appliedRevision='';
        const post=(m)=>window.chrome.webview.postMessage(m);
        window.applyClock=(clock)=>{
          desired=clock;if(!ready)return;
          const current=player.getCurrentTime()||0,state=player.getPlayerState(),duration=player.getDuration()||Infinity;
          const position=Math.min(clock.position,duration),playing=clock.playing&&clock.position<duration-.2;
          const revision=JSON.stringify(clock.revision),explicit=revision!==appliedRevision;
          appliedRevision=revision;
          const seek=explicit||Math.abs(current-position)>1.2;
          const toggle=playing ? state!==1&&state!==3 : state===1||state===3;
          if(!seek&&!toggle)return;
          suppressUntil=performance.now()+900;
          if(seek)player.seekTo(position,true);
          if(toggle){if(playing)player.playVideo();else player.pauseVideo();}
          lastTime=position;lastTick=performance.now();
        };
        window.onYouTubeIframeAPIReady=()=>{
          player=new YT.Player('player',{videoId:new URLSearchParams(location.search).get('id'),
            playerVars:{origin:location.origin,playsinline:1,rel:0,enablejsapi:1},
            events:{onReady:()=>{ready=true;document.getElementById('loading').remove();player.setVolume(50);window.applyClock(desired);post({a:'ready'});},
            onError:(e)=>post({a:'error',code:e.data}),
            onStateChange:(e)=>{lastState=e.data;if(performance.now()<suppressUntil)return;const pos=player.getCurrentTime()||0;
              if(e.data===1){post({a:'mediaPlay',pos});desired.playing=true;}
              else if(e.data===2||e.data===0){post({a:'mediaPause',pos});desired.playing=false;}
              lastTime=pos;lastTick=performance.now();}}
          });
        };
        setInterval(()=>{if(!ready)return;const now=performance.now(),pos=player.getCurrentTime()||0;
          const expected=lastTime+(lastState===1?(now-lastTick)/1000:0);
          if(now>suppressUntil&&Math.abs(pos-expected)>.35){post({a:'mediaSeek',pos});suppressUntil=now+500;}
          lastTime=pos;lastTick=now;
        },300);
        const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';document.head.append(script);
        </script></html>
        """;
}
