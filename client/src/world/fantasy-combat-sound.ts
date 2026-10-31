import { fxVolume } from '../volume.ts';
import { activeEffectAudioContext } from './sounds.ts';
import { fantasyCombatSoundRecipe, type FantasyCombatSoundInput } from './fantasy-combat-audio.ts';

export class FantasyCombatSoundPlayer {
 private playing=new Set<()=>void>();
 private noise=new WeakMap<AudioContext,AudioBuffer>();
 constructor(private context:()=>AudioContext|undefined,private volume:()=>number,private visible:()=>boolean){}
 play(beat:FantasyCombatSoundInput,delay=0){
  const empty=()=>{};
  if(!this.visible())return empty;
  const raw=this.volume(),volume=Number.isFinite(raw)?Math.max(0,Math.min(1,raw)):0;
  if(volume<=.001)return empty;
  let context:AudioContext|undefined;try{context=this.context();}catch{return empty;}
  if(!context||context.state!=='running')return empty;
  const voices=fantasyCombatSoundRecipe(beat);if(!voices.length)return empty;
  const sources=new Set<AudioScheduledSourceNode>();
  const stop=()=>{for(const source of sources){try{source.stop();}catch{} }sources.clear();this.playing.delete(stop);};
  this.playing.add(stop);
  try{
   const start=context.currentTime+Math.max(0,Math.min(.8,delay));
   for(const voice of voices){
    const at=start+voice.at,end=at+voice.duration,gain=context.createGain();
    let source:AudioScheduledSourceNode,filter:BiquadFilterNode|undefined;
    if(voice.wave==='noise'){
     let buffer=this.noise.get(context);
     if(!buffer){buffer=context.createBuffer(1,Math.ceil(context.sampleRate*.4),context.sampleRate);const data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;this.noise.set(context,buffer);}
     const noise=context.createBufferSource();noise.buffer=buffer;source=noise;
     filter=context.createBiquadFilter();filter.type='bandpass';filter.Q.value=.6;
     filter.frequency.setValueAtTime(voice.hz,at);filter.frequency.exponentialRampToValueAtTime(voice.to,end);
     noise.connect(filter).connect(gain);
    }else{
     const oscillator=context.createOscillator();oscillator.type=voice.wave;source=oscillator;
     oscillator.frequency.setValueAtTime(voice.hz,at);oscillator.frequency.exponentialRampToValueAtTime(voice.to,end);oscillator.connect(gain);
    }
    gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(voice.gain*volume,at+.012);gain.gain.exponentialRampToValueAtTime(.0001,end);
    gain.connect(context.destination);sources.add(source);
    source.onended=()=>{source.disconnect();filter?.disconnect();gain.disconnect();sources.delete(source);if(!sources.size)this.playing.delete(stop);};
    source.start(at);source.stop(end+.015);
   }
  }catch{stop();}
  return stop;
 }
 stopAll(){for(const stop of [...this.playing])stop();}
}

// 過去ログや非表示タブの音は、操作再開後にまとめて鳴らさない。
export const fantasyCombatSounds=new FantasyCombatSoundPlayer(activeEffectAudioContext,fxVolume,()=>typeof document!=='undefined'&&document.visibilityState!=='hidden');
