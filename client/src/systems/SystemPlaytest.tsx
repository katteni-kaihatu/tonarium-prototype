import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { Group } from 'three';
import type { SystemCommand, SystemView } from '../../../shared/system-types.ts';
import type { Item } from '../../../shared/items.ts';
import { systemSeat } from '../../../shared/system-presentation.ts';
import { useStore } from '../store.ts';
import { OekakiAvatar } from '../view3d/OekakiAvatar.tsx';
import { Label } from '../view3d/Label.tsx';
import { inputSystem, interactSystemObject, useSystemTransport } from './api.ts';
import { receiveSystems, useSystems } from './state.ts';
import { SystemObjects3D } from './SystemObjects3D.tsx';
import './playtest.css';
import { useSpaceToStand } from './useSpaceToStand.ts';
import { Item3D } from '../view3d/items3d.tsx';
import { t, useLanguage } from '../i18n/index.ts';
import { LanguageSelect } from '../i18n/LanguageSelect.tsx';
import { systemErrorText } from './messages.ts';

interface Reply { sid: string; actor: string; token?: string; participants: string[]; view: SystemView; items?: Item[]; error?: string }
type InputCommand = Exclude<SystemCommand, { kind: 'map' }>;
const ACTORS = { alice: 'Alice', bob: 'Bob' };
type Notice = { key: string; error?: string } | { key?: never; error: string };
const errorMessage = (reason: unknown) => reason instanceof Error ? reason.message : String(reason);

function TestAvatar({ actor, index }: { actor: string; index: number }) {
  const group = useRef<Group>(null);
  useFrame((_, dt) => {
    if (!group.current) return;
    const seat = systemSeat(useSystems.getState().view, actor);
    const x = seat?.x ?? -2 + index * 1.5, y = seat?.y ?? 0, z = seat?.z ?? 1;
    const blend = 1 - Math.exp(-dt * 12);
    group.current.position.x += (x - group.current.position.x) * blend;
    group.current.position.y += (y - group.current.position.y) * blend;
    group.current.position.z += (z - group.current.position.z) * blend;
    group.current.rotation.y = Math.PI;
  });
  return <group ref={group} position={[-2 + index * 1.5, 0, 1]}>
    <OekakiAvatar name={ACTORS[actor as keyof typeof ACTORS] ?? actor} version={null} textureUrl="/oekaki/system-playtest.svg" speaking={false} userId={actor} seated={() => !!systemSeat(useSystems.getState().view, actor)} />
    <Label text={ACTORS[actor as keyof typeof ACTORS] ?? actor} position={[0, 1.5, 0]} height={0.18} />
  </group>;
}

export default function SystemPlaytest() {
  useLanguage();
  useSpaceToStand();
  const slot = new URLSearchParams(location.search).get('actor') === 'bob' ? 'bob' : 'alice';
  const [ready, setReady] = useState(false), [participants, setParticipants] = useState<string[]>([]), [message, setMessage] = useState<Notice>({ key: 'ssPlayConnecting' });
  const [target, setTarget] = useState(slot);
  const state = useSystems(), token = useRef('');
  const items = useStore(store => store.items);
  const view = state.sid === 'system-playtest' ? state.view : undefined;
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout> | undefined, queue = Promise.resolve();
    const controller = new AbortController();
    const accept = (reply: Reply, snapshot = false) => {
      if (!active) return;
      if (!receiveSystems(reply.sid, reply.view, reply.error, snapshot)) return;
      if (reply.items) useStore.setState(current => {
        const items = Object.fromEntries(reply.items!.map(item => [item.id, item]));
        return { items, itemsBy: { ...current.itemsBy, [reply.sid]: items } };
      });
      setParticipants(reply.participants); setReady(true);
    };
    const request = async (method = 'GET', body?: unknown, endpoint = '') => {
      const response = await fetch(`/api/system-playtest${endpoint}`, { method, headers: { 'Content-Type': 'application/json', 'x-system-playtest-token': token.current }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
      const reply = await response.json() as Reply;
      if (reply.view) accept(reply);
      return { response, reply };
    };
    const cleanupTransport = useSystemTransport({
      command(command) {
        queue = queue.then(async () => {
          const current = useSystems.getState().view;
          let result = await request('POST', { command: { ...command, revision: current?.revision ?? command.revision } });
          if (result.response.status === 409 && result.reply.error?.includes('revision') && result.reply.view) result = await request('POST', { command: { ...command, revision: result.reply.view.revision } });
          if (!result.response.ok) { setMessage(result.reply.error ? { error: result.reply.error } : { key: 'ssPlayInputFailed' }); return; }
          setMessage({ key: 'ssPlayApplied' });
        }).catch(reason => { if (active) setMessage({ error: errorMessage(reason) }); });
      },
      load() { setMessage({ key: 'ssPlayCodeMap' }); },
    });
    const poll = async () => {
      try {
        const result = await request();
        if (!result.response.ok) setMessage(result.reply.error ? { key: 'ssPlayCheckConnection', error: result.reply.error } : { key: 'ssPlayConnectionFailed' });
      } catch (reason) { if (active) setMessage({ key: 'ssPlayCheckConnection', error: errorMessage(reason) }); }
      if (active) timer = setTimeout(() => void poll(), 200);
    };
    void request('POST', { slot }, '/join').then(({ response, reply }) => {
      if (!response.ok || !reply.token) { setMessage(reply.error ? { error: reply.error } : { key: 'ssPlayJoinFailed' }); return; }
      token.current = reply.token;
      useStore.setState({ session: reply.sid, selfId: reply.actor, selfName: ACTORS[slot] });
      accept(reply, true); setMessage({ key: 'ssPlayReady' });
      return poll();
    }).catch(reason => { if (active) setMessage({ error: errorMessage(reason) }); });
    return () => {
      active = false; controller.abort(); if (timer) clearTimeout(timer); cleanupTransport();
      if (token.current) void fetch('/api/system-playtest/leave', { method: 'POST', headers: { 'x-system-playtest-token': token.current }, keepalive: true }).catch(() => {});
    };
  }, [slot]);
  const run = (action: () => void) => { try { action(); } catch (reason) { setMessage({ error: errorMessage(reason) }); } };
  const timer = view?.systems.find(s => s.instanceId === 'countdown');
  const status = state.error ? systemErrorText(state.error) : message.key ? t(message.key, message.error ? systemErrorText(message.error) : '') : systemErrorText(message.error ?? '');
  return <main className="system-playtest">
    <header><div><span className="playtest-badge">{t('ssPlayBadge')}</span><h1>{t('ssPlayTitle')}</h1><p>{t('ssPlayDescription')}</p></div>
      <div className="playtest-identity"><strong>{ACTORS[slot]}</strong><span>{t(ready ? 'ssPlayConnected' : 'ssPlayConnecting')}</span><LanguageSelect /><a href="/?systemLibrary=1" target="_blank" rel="noreferrer">{t('ssPlayOpenLibrary')}</a><a href={`/?systemPlaytest=1&actor=${slot === 'alice' ? 'bob' : 'alice'}`} target="_blank" rel="noreferrer">{t('ssPlayOpenOther')}</a></div>
    </header>
    <div className="playtest-layout"><section className="playtest-scene" aria-label={t('ssPlayScene')}>
      <Canvas camera={{ position: [5, 3.5, 6], fov: 45 }} shadows>
        <color attach="background" args={['#e9eef4']} /><ambientLight intensity={1.5} /><directionalLight position={[5, 8, 3]} intensity={2} />
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, -1]} receiveShadow><planeGeometry args={[22, 18]} /><meshStandardMaterial color="#d8e1eb" /></mesh>
        <gridHelper args={[20, 20, '#acbacb', '#cbd5e1']} position-y={0.005} />
        <Suspense fallback={null}><SystemObjects3D sessionId="system-playtest" />{Object.values(items).map(item => <Item3D key={item.id} item={item} />)}{participants.map((actor, index) => <TestAvatar key={actor} actor={actor} index={index} />)}</Suspense>
        <OrbitControls target={[0, 1, -1]} minDistance={3} maxDistance={22} maxPolarAngle={Math.PI / 2 - 0.04} />
      </Canvas><p className="playtest-camera-help">{t('ssPlayCameraHelp')}</p>
    </section>
    <aside className="playtest-controls"><h2>{t('ssPlayControls')}</h2><div className="playtest-timer" aria-label={t('ssPlayRemaining')}>{view?.objects['timer-text']?.text ?? '00:10'}</div>
      <p>{t('ssPlayTimer')}: <strong>{t(timer?.state.running ? 'ssPlayRunning' : timer?.state.remaining === 0 ? 'ssPlayFinished' : 'ssPlayStopped')}</strong></p>
      <div className="playtest-buttons"><button disabled={!ready} onClick={() => run(() => interactSystemObject('start-button'))}>{t('ssPlayStart')}</button><button disabled={!ready} onClick={() => run(() => interactSystemObject('pause-button'))}>{t('ssPlayPause')}</button><button disabled={!ready} onClick={() => run(() => interactSystemObject('reset-button'))}>{t('ssPlayReset')}</button></div>
      <h2>{t('ssPlayChairControls')}</h2><label>{t('ssPlayChooseUser')}<select value={target} onChange={event => setTarget(event.target.value as typeof slot)}>{participants.map(actor => <option key={actor} value={actor}>{ACTORS[actor as keyof typeof ACTORS] ?? actor}</option>)}</select></label>
      <div className="playtest-buttons"><button disabled={!ready} onClick={() => run(() => inputSystem('seat', 'sit', { user: target }))}>{t('ssPlaySeatSelected')}</button><button disabled={!ready} onClick={() => run(() => inputSystem('seat', 'stand', { user: target }))}>{t('ssPlayStand')}</button></div>
      <p>{t('ssPlayOccupant')}: <strong>{view?.seats['chair-object'] ? ACTORS[view.seats['chair-object'] as keyof typeof ACTORS] ?? view.seats['chair-object'] : t('ssPlayEmpty')}</strong></p>
      <button disabled={!ready} onClick={() => useStore.setState(current => ({ emotes: { ...current.emotes, [target]: { id: 'wave', at: Date.now(), started: performance.now() } } }))}>{t('ssPlayWave')}</button>
      <p className="playtest-status" role="status">{status}</p>
      <details><summary>{t('ssPlayChecklist')}</summary><ol>{['ssPlayCheckStart', 'ssPlayCheckPause', 'ssPlayCheckReset', 'ssPlayCheckSeat', 'ssPlayCheckPeers', 'ssPlayCheckOccupied'].map(key => <li key={key}>{t(key)}</li>)}</ol></details>
      {view?.diagnostics.map((item, index) => <p role="alert" key={index}>{systemErrorText(item)}</p>)}
      <small>{t('ssPlayLocalData')}</small>
    </aside></div>
  </main>;
}
