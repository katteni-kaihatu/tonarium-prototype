import { useEffect, useRef } from 'react';
import { BATTLEFIELD, battleColor, type BattlefieldState } from '../../../shared/battlefield.ts';
import { battleInputFor } from '../battlefield-input.ts';
import { toggleBattleTank } from '../battlefield-actions.ts';
import { get, nameOf, solidsOf, useStore } from '../store.ts';
import { send } from '../net/ws.ts';
import { t as tr, useLanguage } from '../i18n/index.ts';
import '../styles/battlefield.css';

const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName));
export function BattlefieldMap() {
  useLanguage();
  const battle: BattlefieldState | null | undefined = useStore(s => s.battlefields[s.session ?? '']);
  const keys = useRef<Record<string, boolean>>({});
  const aim = useRef(0), fire = useRef(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      keys.current[e.code] = true;
      if (e.code === 'KeyE' && !e.repeat) toggleBattleTank();
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    const reset = () => { keys.current = {}; fire.current = false; };
    const timer = setInterval(() => send({ t: 'battleInput', input: battleInputFor(keys.current, aim.current, false, fire.current) }), 50);
    addEventListener('keydown', down); addEventListener('keyup', up); addEventListener('blur', reset); addEventListener('pointerup', resetFire); document.addEventListener('visibilitychange', reset);
    function resetFire() { fire.current = false; }
    return () => { clearInterval(timer); removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', reset); removeEventListener('pointerup', resetFire); document.removeEventListener('visibilitychange', reset); };
  }, []);
  const me = battle?.actors[get().selfId];
  return <div className="battle-map map2d">
    <svg viewBox="-10 -10 20 20" role="img" aria-label={tr('battleMap')}
      onPointerMove={e => {
        if (!me) return;
        const point = e.currentTarget.createSVGPoint(); point.x = e.clientX; point.y = e.clientY;
        const matrix = e.currentTarget.getScreenCTM(); if (!matrix) return;
        const p = point.matrixTransform(matrix.inverse()); aim.current = Math.atan2(-(p.x - me.x), -(p.y - me.z));
      }} onPointerDown={e => { if (e.button === 0) { fire.current = true; e.currentTarget.setPointerCapture(e.pointerId); } }} onPointerCancel={() => { fire.current = false; }}>
      <rect x={-10} y={-10} width={20} height={20} fill="#46513c" />
      {solidsOf(get()).map((s, i) => 'r' in s ? <circle key={i} cx={s.x} cy={s.z} r={s.r} fill="#8c947c" /> : <rect key={i} x={s.x - s.w / 2} y={s.z - s.d / 2} width={s.w} height={s.d} fill="#8c947c" />)}
      {BATTLEFIELD.bases.map(b => <g key={b.id}><circle cx={b.x} cy={b.z} r={b.r} fill={battleColor(battle?.bases.find(v => v.id === b.id)?.owner ?? null)} opacity={0.45} /><text x={b.x} y={b.z + .2} textAnchor="middle" fontSize={.6} fill="white">{b.id}</text></g>)}
      {Object.values(battle?.tanks ?? {}).map(t => <g key={t.id} transform={`translate(${t.x} ${t.z}) rotate(${t.ry * 180 / Math.PI})`}><rect x={-.7} y={-1} width={1.4} height={2} rx={.2} fill="#293327" stroke="#d7d9b5" strokeWidth={.1} /><line y2={-1.4} stroke="#d7d9b5" strokeWidth={.2} /></g>)}
      {Object.values(battle?.actors ?? {}).filter(p => p.active).map(p => <g key={p.id} opacity={p.alive ? 1 : .35}>
        <circle cx={p.x} cy={p.z} r={.35} fill={battleColor(p.team)} stroke={p.id === get().selfId ? 'white' : '#202b22'} strokeWidth={.1} />
        <line x1={p.x} y1={p.z} x2={p.x - Math.sin(p.aim) * .9} y2={p.z - Math.cos(p.aim) * .9} stroke={(battle?.at ?? 0) - p.firedAt < 150 ? '#fff2a0' : battleColor(p.team)} strokeWidth={.12} />
        <text x={p.x} y={p.z - .6} fontSize={.35} textAnchor="middle" fill="white">{p.bot ? tr('battleBot') : nameOf(p.id)} {p.hp}</text>
      </g>)}
    </svg>
    <div className="battle-touch" aria-label={tr('battleMove')}>
      {(['KeyW', 'KeyA', 'KeyS', 'KeyD'] as const).map((code, i) => <button key={code} aria-label={['↑', '←', '↓', '→'][i]} onPointerDown={e => { keys.current[code] = true; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={() => { keys.current[code] = false; }} onPointerCancel={() => { keys.current[code] = false; }}>{['↑', '←', '↓', '→'][i]}</button>)}
      <button onPointerDown={() => { fire.current = true; }} onPointerUp={() => { fire.current = false; }}>{tr('battleFire')}</button>
    </div>
  </div>;
}

export function BattlefieldHUD() {
  useLanguage();
  const state: BattlefieldState | null | undefined = useStore(s => s.battlefields[s.session ?? '']);
  const selfId = useStore(s => s.selfId);
  const owner = useStore(s => s.guild.sessions.find(v => v.id === s.session)?.owner === s.selfId);
  if (!state) return null;
  const me = state.actors[selfId], bots = Object.values(state.actors).filter(p => p.bot);
  return <section className="battle-hud" aria-label={tr('battleMap')}>
    <strong>{tr('battleMap')} · <span style={{ color: battleColor(me?.team ?? null) }}>{me?.team === 'red' ? tr('battleRed') : tr('battleBlue')}</span> · {tr('battleHealth', me?.hp ?? 0)}</strong>
    {me && !me.alive && <div role="status">{tr('battleRespawn', Math.max(0, Math.ceil(((me.respawnAt ?? state.at) - state.at) / 1000)))}</div>}
    <div>{state.bases.map(b => <span key={b.id} style={{ color: battleColor(b.owner) }}>{b.id}: {b.owner === 'red' ? tr('battleRed') : b.owner === 'blue' ? tr('battleBlue') : tr('battleNeutral')} {b.capturing && `${Math.floor(b.progress / BATTLEFIELD.captureMs * 100)}%`} </span>)}</div>
    <small>{tr('battleControls')}</small>
    <button onClick={toggleBattleTank} disabled={!me?.alive}>{me?.tank ? tr('battleDismount') : tr('battleMount')}</button>
    <span>{me?.tank ? tr('battleRiding') : tr('battleInfantry')} · {tr('battleBots', bots.length)}</span>
    {owner && <div><button disabled={bots.length >= BATTLEFIELD.botLimit} onClick={() => send({ t: 'battleBot', action: 'add' })}>{tr('battleAddBot')}</button>
      {bots.map((bot, index) => <button key={bot.id} onClick={() => send({ t: 'battleBot', action: 'remove', id: bot.id })}>{tr('battleRemoveBot', index + 1)}</button>)}</div>}
  </section>;
}
