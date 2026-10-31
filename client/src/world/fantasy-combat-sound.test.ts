import test from 'node:test';
import assert from 'node:assert/strict';
import { FantasyCombatSoundPlayer } from './fantasy-combat-sound.ts';

function fixture(){
 let starts=0,stops=0,volume=1,visible=true;const gains:number[]=[];
 const param=()=>({value:0,setValueAtTime(value:number){gains.push(value);},linearRampToValueAtTime(value:number){gains.push(value);},exponentialRampToValueAtTime(){}});
 const node=()=>({connect(target:unknown){return target;},disconnect(){}});
 const context={state:'running',currentTime:1,destination:{},sampleRate:1000,
 createGain:()=>({...node(),gain:param()}),
 createBiquadFilter:()=>({...node(),type:'bandpass',Q:param(),frequency:param()}),
 createBuffer:()=>({getChannelData:()=>new Float32Array(400)}),
 createBufferSource:()=>({...node(),start(){starts++;},stop(){stops++;}}),
 createOscillator:()=>({...node(),frequency:param(),start(){starts++;},stop(){stops++;}})};
 const player=new FantasyCombatSoundPlayer(()=>context as unknown as AudioContext,()=>volume,()=>visible);
 return {player,context,gains,starts:()=>starts,stops:()=>stops,volume:(v:number)=>volume=v,visible:(v:boolean)=>visible=v};
}
const beat={visual:'fire',tier:3,event:{kind:'attack',skill:'flame'}};
test('combat sound drops muted, hidden and locked events without replaying them later',()=>{
 const f=fixture();f.volume(0);f.player.play(beat);f.volume(1);f.visible(false);f.player.play(beat);f.visible(true);f.context.state='suspended';f.player.play(beat);f.context.state='running';assert.equal(f.starts(),0);
 f.player.play(beat);assert.ok(f.starts()>0);assert.ok(f.gains.filter(g=>g<1).every(g=>g<=.06));
});
test('audio scheduling cleans up on exit and unsupported Web Audio cannot break combat',()=>{
 const f=fixture();f.player.play(beat);const before=f.stops();f.player.stopAll();assert.ok(f.stops()>before);
 const broken=new FantasyCombatSoundPlayer(()=>{throw new Error('unavailable');},()=>1,()=>true);
 assert.doesNotThrow(()=>broken.play(beat));
});
