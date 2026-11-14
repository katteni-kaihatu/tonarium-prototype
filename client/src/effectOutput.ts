import { get, useStore } from './store.ts';
import { fxVolume } from './volume.ts';

const outputs = new WeakMap<AudioContext, GainNode>();

/** エンベロープの最小値にかかわらず、最後の出力で完全に消音する。 */
export function effectOutput(context: AudioContext): GainNode {
  const existing = outputs.get(context);
  if (existing) return existing;
  const output = context.createGain();
  output.gain.setValueAtTime(fxVolume(), context.currentTime);
  output.connect(context.destination);
  outputs.set(context, output);
  const unsubscribe = useStore.subscribe((s, before) => {
    if (s.audioMuted !== before.audioMuted || s.audioVol.fx !== before.audioVol.fx) {
      output.gain.setValueAtTime(s.audioMuted ? 0 : s.audioVol.fx, context.currentTime);
    }
  });
  const closed = () => {
    if (context.state !== 'closed') return;
    unsubscribe();
    output.disconnect();
    outputs.delete(context);
    context.removeEventListener('statechange', closed);
  };
  context.addEventListener('statechange', closed);
  return output;
}

export const effectLevel = () => get().audioVol.fx;
