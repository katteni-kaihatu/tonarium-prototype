import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmdirSync, writeFileSync, unlinkSync } from 'node:fs';

// Vite 起動済みの環境で、実コンポーネントと音声経路を検証する。
const { chromium } = await import(process.argv[2] || 'playwright');
const origin = process.argv[3] || 'http://127.0.0.1:5173';
const executablePath = process.argv[4] || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const fixture = new URL(`../client/.audio-mute-${process.pid}.html`, import.meta.url);
const bikeDirectory = new URL('../client/public/audio/bike/', import.meta.url);
const createdBikeDirectory = !existsSync(bikeDirectory);
const bikeFixtures = [];
writeFileSync(fixture, `<!doctype html><meta charset="utf-8"><div id="root"></div><div id="youtube"></div>
<script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorldScreen } from '/src/world/WorldScreen.tsx';
import { get, set } from '/src/store.ts';
import { setLanguage } from '/src/i18n/core.ts';
import { toggleAudioMute, setMasterVolume } from '/src/volume.ts';
import { mediaVolume } from '/src/mediaSync.tsx';
import { YouTubePlayer } from '/src/youtube.tsx';
import * as spatial from '/src/spatial.ts';
import { room } from '/src/net/livekit.ts';
import { RoomEvent, Track } from 'livekit-client';
import { createBikeAudio } from '/src/view3d/bikeAudio.ts';
import '/src/style.css';
setLanguage('en');
set({selfId:'self', selfName:'Test', session:'test', sync:'connected', mode:'2d',
 guild:{name:'Test', sessions:[{id:'test',name:'Test',world:'room'}]}});
if (!location.search.includes('routes')) createRoot(document.getElementById('root')).render(React.createElement(WorldScreen));
window.audioTest = {get, set, toggleAudioMute, setMasterVolume, mediaVolume, spatial, room, RoomEvent, Track, createBikeAudio,
 mountYouTube(item, volume) { createRoot(document.getElementById('youtube')).render(React.createElement(YouTubePlayer,{item,volume})); }};
</script>`);
let browser;
try {
  // 音源が未同梱でも出力処理を検証する。再生は下の Audio 代役で受け、実音は使わない。
  mkdirSync(bikeDirectory, { recursive: true });
  for (const name of ['engine.wav', 'skid.wav', 'mount.ogg']) {
    const file = new URL(name, bikeDirectory);
    if (!existsSync(file)) {
      writeFileSync(file, '', { flag: 'wx' });
      bikeFixtures.push(file);
    }
  }
  browser = await chromium.launch({ headless: true, executablePath, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.goto(`${origin}/${fixture.pathname.split('/').at(-1)}`);
  await page.locator('.dock').waitFor();
  await page.evaluate(() => {
    localStorage.clear();
    audioTest.set({ audioMuted: false, audioVol: { voice: 0.8, fx: 0.3, media: 0.6 } });
  });
  const dock = page.locator('.dock [data-popanchor]').last();
  const normalIcon = await dock.locator('svg').innerHTML();
  await dock.click();
  await page.getByRole('button', { name: 'Mute all audio', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Unmute all audio', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.match(await dock.getAttribute('aria-label'), /all audio muted/);
  const mutedIcon = await dock.locator('svg').innerHTML();
  assert.notEqual(mutedIcon, normalIcon);
  const sliders = page.locator('.popover input[type=range]');
  assert.equal(await sliders.count(), 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(await sliders.nth(i).isEnabled(), true);
    await sliders.nth(i).press('Home');
    for (let step = 0; step < [14, 8, 10][i]; step++) await sliders.nth(i).press('ArrowRight');
  }
  assert.deepEqual(await page.evaluate(() => audioTest.get().audioVol), { voice: 0.7, fx: 0.4, media: 0.5 });
  assert.equal(await page.evaluate(() => audioTest.get().audioMuted), true);
  await page.reload();
  await page.locator('.dock').waitFor();
  assert.equal(await dock.locator('svg').innerHTML(), mutedIcon);
  await dock.click();
  assert.equal(await page.getByRole('button', { name: 'Unmute all audio', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await sliders.evaluateAll(inputs => inputs.map(input => Number(input.value))), [0.7, 0.4, 0.5]);
  await page.getByRole('button', { name: 'Unmute all audio', exact: true }).click();
  assert.equal(await dock.locator('svg').innerHTML(), normalIcon);
  assert.deepEqual(await page.evaluate(() => audioTest.get().audioVol), { voice: 0.7, fx: 0.4, media: 0.5 });
  assert.equal(await page.evaluate(() => audioTest.get().audioMuted), false);
  await page.keyboard.press('Escape');

  await page.goto(`${origin}/${fixture.pathname.split('/').at(-1)}?routes`);
  await page.waitForFunction(() => !!window.audioTest);
  await page.evaluate(async () => {
    const {get,set,toggleAudioMute,setMasterVolume,mediaVolume,spatial,room,RoomEvent,Track,createBikeAudio} = audioTest;
    const equal = (actual, expected, label, tolerance = 1e-6) => {
      if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) throw Error(label + ': ' + actual + ' != ' + expected);
    };
    const silentVoice = async (gain, label) => {
      // AudioParam の予約値は音声処理側の次の更新で反映される。
      const deadline = performance.now() + 500;
      while (gain.value !== 0 && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
      equal(gain.value, 0, label);
    };
    const avatar = {x:0,z:0,ry:0};
    set({audioMuted:false,mode:'2d',participants:[{id:'self',mode:'2d',pos:avatar},{id:'peer',mode:'2d',pos:{...avatar,x:6}}],
      peerVolume:{peer:0.5},peerMuted:[],blocked:[],audioVol:{voice:0.8,fx:0.4,media:0.6},micEnabled:true});
    const sourceContext = new AudioContext();
    await sourceContext.resume();
    const source = sourceContext.createMediaStreamDestination();
    spatial.addVoice('peer', source.stream.getAudioTracks()[0]);
    spatial.resumeAudio();
    const voice = window.__spatial.voices.get('peer').gain.gain;
    await new Promise(resolve => setTimeout(resolve, 700));
    const voiceLevel = voice.value;
    if (!(voiceLevel > 0 && voiceLevel < 0.4)) throw Error('voice must include distance and peer level');
    const track = {kind:Track.Kind.Audio,source:Track.Source.ScreenShareAudio,
      attach(el) { if (el.volume !== (get().audioMuted ? 0 : get().audioVol.media)) throw Error('share initial volume'); this.el=el; return el; },
      detach() { return [this.el]; }};
    room.emit(RoomEvent.TrackSubscribed, track, {}, {identity:'peer'});
    equal(track.el.volume, 0.6, 'share');
    const item = {id:'video',kind:'youtube',videoId:'test',x:6,z:0,ry:0,clock:{playing:true,base:0,at:Date.now()}};
    set({items:{video:item},volumes:{video:0.5},windows:[{key:'item:video'}]});
    equal(mediaVolume(item), 0.3, 'window media');
    const unchanged = get();
    let sends = 0;
    const originalSend = WebSocket.prototype.send;
    const originalPublish = room.localParticipant.publishData;
    const originalMic = room.localParticipant.setMicrophoneEnabled;
    WebSocket.prototype.send = () => { sends++; };
    room.localParticipant.publishData = async () => { sends++; };
    room.localParticipant.setMicrophoneEnabled = async () => { sends++; };
    toggleAudioMute();
    await silentVoice(voice, 'running voice');
    equal(track.el.volume, 0, 'running share');
    equal(mediaVolume(item), 0, 'running media');
    const newTrack = {...track};
    room.emit(RoomEvent.TrackSubscribed,newTrack,{}, {identity:'peer'});
    equal(newTrack.el.volume, 0, 'new share');
    spatial.addVoice('peer', source.stream.getAudioTracks()[0]);
    const newVoice = window.__spatial.voices.get('peer').gain.gain;
    equal(newVoice.value, 0, 'new voice');
    setMasterVolume('voice',0.6);
    toggleAudioMute();
    await new Promise(resolve => setTimeout(resolve, 700));
    equal(newVoice.value, voiceLevel * 0.75, 'restored voice', 0.001);
    equal(track.el.volume,0.6,'restored share');
    equal(newTrack.el.volume,0.6,'restored new share');
    equal(mediaVolume(item),0.3,'restored media');
    for (const key of ['micEnabled','peerVolume','peerMuted','volumes','items']) if (get()[key] !== unchanged[key]) throw Error('changed '+key);
    equal(sends,0,'network or microphone side effects');
    WebSocket.prototype.send = originalSend;
    room.localParticipant.publishData = originalPublish;
    room.localParticipant.setMicrophoneEnabled = originalMic;
    set({peerMuted:['peer']}); toggleAudioMute(); toggleAudioMute();
    await silentVoice(newVoice,'peer mute');
    set({peerMuted:[],blocked:['peer']}); toggleAudioMute(); toggleAudioMute();
    await silentVoice(newVoice,'block');
    set({blocked:[],broadcast:{test:true}});
    toggleAudioMute(); await silentVoice(newVoice,'muted broadcast'); toggleAudioMute();
    await new Promise(resolve => setTimeout(resolve,700));
    equal(newVoice.value,0.3,'restored broadcast and peer level',0.001);
    set({broadcast:{}});
    set({windows:[]}); equal(mediaVolume(item),0,'closed 2D media');
    set({mode:'3d',selfAvatar:avatar});
    const distantMedia = mediaVolume(item);
    if (!(distantMedia > 0 && distantMedia < 0.3)) throw Error('media distance');
    toggleAudioMute(); equal(mediaVolume(item),0,'muted distant media');
    toggleAudioMute(); equal(mediaVolume(item),distantMedia,'restored media distance');
    set({volumes:{video:0}}); toggleAudioMute(); toggleAudioMute(); equal(mediaVolume(item),0,'individual media mute');
    set({mode:'2d',volumes:{video:0.5},windows:[{key:'item:video'}]});

    const calls = [];
    let yt;
    window.YT = {PlayerState:{PLAYING:1,BUFFERING:3}, Player: class {
      constructor(_el, options) { yt=this; this.volume=100; this.muted=false; setTimeout(() => options.events.onReady(),0); }
      setVolume(v) { this.volume=v; calls.push('volume'); } mute() { this.muted=true; calls.push('mute'); }
      unMute() { this.muted=false; calls.push('unmute'); }
      playVideo() { if(get().audioMuted && (!this.muted || this.volume!==0)) throw Error('audible start'); calls.push('play'); }
      pauseVideo() { calls.push('pause'); } seekTo() { calls.push('seek'); }
      getCurrentTime() { return 0; } getDuration() { return 1e15; } getPlayerState() { return 0; } destroy() {}
    }};
    toggleAudioMute();
    audioTest.mountYouTube(item,()=>mediaVolume(item));
    await new Promise(resolve=>setTimeout(resolve,500));
    equal(yt.volume,0,'YouTube ready and play');
    const count=calls.length;
    toggleAudioMute(); equal(yt.volume,30,'YouTube restore');
    if(calls.slice(count).some(c=>['play','pause','seek'].includes(c))) throw Error('mute changed YouTube playback');
    toggleAudioMute(); equal(yt.volume,0,'running YouTube');

    const originalAudio=window.Audio;
    const elements=[];
    window.Audio=class {
      volume=1; paused=true; currentTime=0; starts=[];
      constructor(){elements.push(this);} play(){this.starts.push(this.volume);this.paused=false;return Promise.resolve();} pause(){this.paused=true;}
      removeAttribute(){} load(){}
    };
    toggleAudioMute();
    const bike=createBikeAudio();
    bike.update(null,0,false,0.5);
    bike.update('peer',3,true,0.5);
    if(elements.length!==3)throw Error('bike assets missing');
    const bikeLevels=[0.5*(0.08+3*0.018),0.5*0.25,0.5*0.4];
    const checkBike=(fx,label)=>elements.forEach((el,i)=>{
      if(el.paused)throw Error(label+': bike sound '+i+' is not playing');
      equal(el.volume,bikeLevels[i]*fx,label+' '+i);
    });
    checkBike(0.4,'playing bike');
    elements.forEach((el,i)=>equal(el.starts[0],bikeLevels[i]*0.4,'initial bike '+i));
    toggleAudioMute();
    checkBike(0,'muted running bike');
    bike.update(null,0,false,0.5);
    bike.update('other-peer',3,true,0.5);
    checkBike(0,'bike started while muted');
    elements.forEach((el,i)=>{
      if(el.starts.length<2)throw Error('bike sound '+i+' was not restarted');
      equal(el.starts.at(-1),0,'muted bike start '+i);
    });
    setMasterVolume('fx',0.7);
    checkBike(0,'bike level changed while muted');
    toggleAudioMute();
    checkBike(0.7,'restored bike');
    bike.dispose(); const volumes=elements.map(el=>el.volume);
    toggleAudioMute(); setMasterVolume('fx',0.2);
    elements.forEach((el,i)=>{
      equal(el.volume,volumes[i],'disposed bike');
      if(!el.paused)throw Error('disposed bike is still playing');
    });
    window.Audio=originalAudio;
    room.emit(RoomEvent.TrackUnsubscribed,track,{}, {identity:'peer'});
    room.emit(RoomEvent.TrackUnsubscribed,newTrack,{}, {identity:'peer'});
    spatial.removeAllVoices(); await sourceContext.close();
  });
  console.log('Real MasterVolume / Dock, persistence, voice, share, media, YouTube and bike mute checks passed');
} finally {
  await browser?.close();
  unlinkSync(fixture);
  bikeFixtures.forEach(file => unlinkSync(file));
  if (createdBikeDirectory) rmdirSync(bikeDirectory);
}
