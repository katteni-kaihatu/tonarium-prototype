import { BATTLEFIELD, battleColor, type BattleTank, type BattlefieldState } from '../../../shared/battlefield.ts';
import { useStore, nameOf } from '../store.ts';
import { t as tr, useLanguage } from '../i18n/index.ts';
import { Label } from './Label.tsx';
import { send } from '../net/ws.ts';

export function Tank3D({ tank }: { tank: BattleTank }) {
  useLanguage();
  return <group position={[tank.x, 0, tank.z]} rotation-y={tank.ry} userData={{ use: () => send({ t: 'battleMount', id: tank.id }), hint: tr('battleMount') }}>
    <mesh position={[0, .45, 0]}><boxGeometry args={[1.35, .65, 1.7]} /><meshStandardMaterial color="#71845e" /></mesh>
    {[-.7, .7].map(x => <mesh key={x} position={[x, .25, 0]}><boxGeometry args={[.25, .5, 1.9]} /><meshStandardMaterial color="#252c26" /></mesh>)}
    <mesh position={[0, .9, 0]}><boxGeometry args={[.9, .4, .8]} /><meshStandardMaterial color="#80966a" /></mesh>
    <mesh position={[0, .9, -.85]} rotation-x={Math.PI / 2}><cylinderGeometry args={[.09, .09, 1.3, 8]} /><meshStandardMaterial color="#3e4e33" /></mesh>
    <Label text={tank.rider ? `${tr('battleRiding')} ${nameOf(tank.rider)}` : tr('battleMount')} position={[0, 1.65, 0]} />
  </group>;
}
export function BattlefieldObjects() {
  useLanguage();
  const state: BattlefieldState | null | undefined = useStore(s => s.battlefields[s.session ?? '']);
  return <>
    <ambientLight intensity={1.2} /><directionalLight position={[6, 12, 4]} intensity={2} />
    {BATTLEFIELD.solids.map((s, i) => <mesh key={i} position={[s.x, .9, s.z]}><boxGeometry args={[s.w, 1.8, s.d]} /><meshStandardMaterial color="#8c947c" /></mesh>)}
    {BATTLEFIELD.bases.map(base => <group key={base.id} position={[base.x, .02, base.z]}>
      <mesh rotation-x={-Math.PI / 2}><circleGeometry args={[base.r, 32]} /><meshStandardMaterial color={battleColor(state?.bases.find(b => b.id === base.id)?.owner ?? null)} /></mesh>
      <Label text={base.id} position={[0, 2, 0]} height={.4} />
    </group>)}
    {Object.values(state?.actors ?? {}).filter(p => p.active && p.id !== useStore.getState().selfId).map(p => <group key={p.id} position={[p.x, 0, p.z]} userData={{ battleActor: p.id, bot: p.bot }}>
      {p.bot && p.alive && <group rotation-y={p.aim}>
        <mesh position={[0, .8, 0]}><boxGeometry args={[.6, 1.6, .6]} /><meshStandardMaterial color={battleColor(p.team)} /></mesh>
        <mesh position={[.25, 1.1, -.5]}><boxGeometry args={[.12, .12, .8]} /><meshStandardMaterial color="#243027" /></mesh>
      </group>}
      {p.alive && state!.at - p.firedAt < 150 && <group rotation-y={p.aim}><mesh position={[0, 1.1, -1]}><boxGeometry args={[.04, .04, 1.4]} /><meshBasicMaterial color="#fff2a0" /></mesh></group>}
      <Label text={`${p.bot ? tr('battleBot') : nameOf(p.id)} · ${p.hp} ${!p.alive ? tr('battleRespawn', Math.max(0, Math.ceil(((p.respawnAt ?? state!.at) - state!.at) / 1000))) : ''}`} fg={battleColor(p.team)} position={[0, 2.2, 0]} />
    </group>)}
  </>;
}
