import subprocess,json,select,time,pathlib,os
native_root = pathlib.Path(__file__).resolve().parents[2]
source=(native_root / 'Tonarium.Desktop/Views/Items/NativeYoutubeView.cs').read_text()
html=source.split('private const string PlayerHtml = """')[1].split('""";')[0]
html=html.replace('window.chrome.webview.postMessage(m)', 'window.webkit.messageHandlers.tonarium.postMessage(m)')
html=html.replace('</script>', "setInterval(()=>{if(ready && player.getPlayerState()===1)post({a:'mediaSeek',pos:player.getCurrentTime()});},1000);</script>")
p=subprocess.Popen([os.environ.get('TONARIUM_PYTHON', '/usr/bin/python3'),str(native_root / 'Tonarium.Desktop/Linux/youtube.py')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
p.stdin.write(json.dumps({'html':html,'id':'M7lc1UVf-VE'})+'\n');p.stdin.flush()
try:
 deadline=time.monotonic()+45
 while time.monotonic()<deadline:
  if not select.select([p.stdout],[],[],1)[0]: continue
  line=p.stdout.readline()
  if not line: raise RuntimeError('WebKit exited')
  message=json.loads(line)
  print(message,flush=True)
  if message.get('a')=='error': raise RuntimeError('YouTube error '+str(message.get('code')))
  if message.get('a')=='ready':
   p.stdin.write(json.dumps({'clock':{'playing':True,'position':0,'revision':1}})+'\n');p.stdin.flush()
  if message.get('a')=='mediaSeek' and message.get('pos',0)>1:
   print('PASS YouTube iframe playback advances',flush=True)
   break
 else: raise RuntimeError('YouTube did not start within 45 seconds')
finally:
 p.stdin.close()
 try:p.wait(timeout=5)
 except subprocess.TimeoutExpired:p.kill();p.wait()
