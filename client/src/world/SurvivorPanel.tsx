import { sourceText as uiSource } from '../i18n/core.ts';
import { t as tr } from '../i18n/index.ts';
import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../store.ts';
import { send } from '../net/ws.ts';
import { ROOM_HALF, SPAWN, type AvatarState, type Participant } from '../../../shared/protocol.ts';
import { SURVIVOR_ACHIEVEMENTS, SURVIVOR_GEAR, SURVIVOR_META_UPGRADES, SURVIVOR_STYLES } from '../i18n/static.ts';
import { SURVIVOR_BASE_SYNERGY_GEAR, SURVIVOR_CHOICE_TIMEOUT_MS, SURVIVOR_DURATION_MS, SURVIVOR_MAX_SYNERGY_GEAR, SURVIVOR_JOIN, SURVIVOR_TITLE, clampSurvivorPosition, isSurvivorSynergyRecipe, survivorDistance, survivorRunReward, survivorUpgradeCost, type SurvivorMetaUpgrade, type SurvivorPlayer, type SurvivorState } from '../../../shared/survivor.ts';
import { openWindow } from './windows.ts';
import { unlockSurvivorAudio } from './survivorAudio.ts';

const STYLES = Object.entries(SURVIVOR_STYLES) as [keyof typeof SURVIVOR_STYLES, typeof SURVIVOR_STYLES[keyof typeof SURVIVOR_STYLES]][];
const SYNERGY_RECIPES = Object.values(SURVIVOR_GEAR).filter(isSurvivorSynergyRecipe);
const SYNERGY_SOURCE_IDS = new Set(SYNERGY_RECIPES.flatMap((gear) => gear.evolvedFrom ?? []));
const RARITY_NAME = { common: uiSource('ui706'), rare: uiSource('ui707'), epic: uiSource('ui708'), mythic: uiSource('ui709') } as const;
const PLAYER_COLORS = ['#ff8ab2', '#8ed9ff', '#e1b0ff', '#ffd36d', '#9af0bd'];
const ATTACK_COLORS: Record<string, string> = {
  moonblade: '#ff65aa', eclipse: '#ffe675', bloodaura: '#ff315e', crimsonsun: '#ff9d35',
  starbolt: '#5fe5ff', starfall: '#ffe16e', shade: '#bc8aff', umbralstorm: '#a457ff',
  frostlance: '#8beaff', stormring: '#7cbdff', embermine: '#ff7c3b', thornshot: '#93e86b', voidpulse: '#d783ff',
  lunarconvergence: '#ff527d', crimsonvoid: '#b58cff', stormfrost: '#9af8ff',
  astralbarrage: '#4deaff', soulreaper: '#ff2d72', thunderweb: '#f4e95c', infernomine: '#ff782b', thornstorm: '#95ff5b', lunarvoid: '#db7aff',
};
const attackColor = (gear: string) => ATTACK_COLORS[gear] ?? '#fff3a6';
const isAreaWeapon = (gear: string) => ['moonblade', 'eclipse', 'bloodaura', 'crimsonsun', 'starfall', 'embermine', 'voidpulse', 'lunarconvergence', 'soulreaper', 'infernomine', 'lunarvoid'].includes(gear);
const isActive = (phase: SurvivorState['phase']) => phase === 'running' || phase === 'boss';

function formatTime(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function synergyProgressForChoice(player: SurvivorPlayer, gearId: string) {
  const currentLevel = player.gear[gearId] ?? 0;
  if (currentLevel <= 0) return [];
  const synergyCount = Object.entries(player.gear).filter(([id, level]) => level > 0 && SURVIVOR_GEAR[id]?.synergyGear).length;
  if (synergyCount >= player.synergyGearSlots) return [];
  return SYNERGY_RECIPES.flatMap((recipe) => {
    if ((player.gear[recipe.id] ?? 0) > 0) return [];
    const sourceIndex = recipe.evolvedFrom?.indexOf(gearId) ?? -1;
    if (sourceIndex < 0) return [];
    const source = SURVIVOR_GEAR[gearId];
    const requiredLevel = recipe.evolutionLevels?.[sourceIndex] ?? source?.maxLevel ?? 1;
    if (currentLevel >= requiredLevel) return [];
    const progress = (recipe.evolvedFrom ?? []).reduce((total, sourceId, index) => {
      const requirement = recipe.evolutionLevels?.[index] ?? SURVIVOR_GEAR[sourceId]?.maxLevel ?? 1;
      const level = sourceId === gearId ? currentLevel + 1 : player.gear[sourceId] ?? 0;
      return total + Math.min(level, requirement);
    }, 0);
    const maximum = (recipe.evolvedFrom ?? []).reduce((total, sourceId, index) =>
      total + (recipe.evolutionLevels?.[index] ?? SURVIVOR_GEAR[sourceId]?.maxLevel ?? 1), 0);
    return [{ id: recipe.id, name: recipe.name, progress, maximum }];
  });
}

function evolutionConditionText(gear: { evolvedFrom?: string[]; evolutionLevels?: number[] }) {
  return gear.evolvedFrom?.map((id, index) => `${SURVIVOR_GEAR[id]?.name ?? id} Lv.${gear.evolutionLevels?.[index] ?? SURVIVOR_GEAR[id]?.maxLevel ?? 1}`).join(' + ');
}

function gearTooltipText(id: string, level?: number) {
  const gear = SURVIVOR_GEAR[id];
  if (!gear) return id;
  const partner = gear.synergy ?? Object.values(SURVIVOR_GEAR).find((candidate) => candidate.synergy === gear.id)?.id;
  return [
    `${gear.name} · ${RARITY_NAME[gear.rarity]}`,
    `${gear.kind === 'weapon' ? tr("ui710") : tr("ui711")} · ${level == null ? tr("ui712", gear.maxLevel) : `Lv.${level}/${gear.maxLevel}`}`,
    gear.desc,
    partner ? tr("ui713", SURVIVOR_GEAR[partner]?.name) : '',
    gear.evolvedFrom ? tr("ui714", evolutionConditionText(gear)) : '',
    gear.synergyGear ? tr("ui715", SURVIVOR_MAX_SYNERGY_GEAR) : '',
  ].filter(Boolean).join('\n');
}

function SurvivorCanvas({ state, player, participants, avatars, clock, serverOffset }: {
  state?: SurvivorState; player?: SurvivorPlayer; participants: Participant[]; avatars: Record<string, AvatarState>; clock: number; serverOffset: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1b1520'; ctx.fillRect(0, 0, w, h);
    const scale = Math.min(w, h) / (ROOM_HALF * 2);
    const cx = w / 2, cy = h / 2;
    const point = (x: number, z: number) => ({ x: cx + x * scale, y: cy + z * scale });
    const left = cx - ROOM_HALF * scale, top = cy - ROOM_HALF * scale, side = ROOM_HALF * 2 * scale;
    ctx.fillStyle = '#565961'; ctx.fillRect(left, top, side, side);
    ctx.strokeStyle = 'rgba(255,255,255,.11)'; ctx.lineWidth = 1;
    for (let i = -ROOM_HALF; i <= ROOM_HALF; i += 2) {
      const x = cx + i * scale, y = cy + i * scale;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + side); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + side, y); ctx.stroke();
    }
    ctx.strokeStyle = '#aeb1bb'; ctx.lineWidth = 3; ctx.strokeRect(left, top, side, side);
    const join = point(SURVIVOR_JOIN.x, SURVIVOR_JOIN.z);
    ctx.beginPath(); ctx.arc(join.x, join.y, SURVIVOR_JOIN.r * scale, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(239,107,155,.2)'; ctx.fill(); ctx.strokeStyle = '#ff9ac8'; ctx.lineWidth = 2; ctx.stroke();
    if (state?.phase === 'lobby') {
      for (const [i, user] of participants.entries()) {
        const pos = user.mode === '3d' ? avatars[user.id] : user.pos;
        const p = point(pos?.x ?? SPAWN.x, pos?.z ?? SPAWN.z);
        ctx.beginPath(); ctx.arc(p.x, p.y, user.id === player?.id ? 8 : 6, 0, Math.PI * 2);
        ctx.fillStyle = PLAYER_COLORS[i % PLAYER_COLORS.length]; ctx.fill();
        if (user.id === player?.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
      }
    }
    for (const enemy of state?.enemies ?? []) {
      const p = point(enemy.x, enemy.z);
      if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) continue;
      const boss = enemy.kind === 'boss';
      const hitAge = clock + serverOffset - enemy.hitAt;
      const hit = hitAge >= 0 && hitAge < 240 ? 1 - hitAge / 240 : 0;
      const radius = (boss ? 11 : enemy.kind === 'knight' || enemy.kind === 'bulwark' ? 7 : enemy.kind === 'charger' ? 7 : 5) * (1 + hit * 0.35);
      ctx.save();
      const now = clock + serverOffset;
      if (enemy.kind === 'charger' && enemy.chargeTarget && enemy.chargeUntil > now) {
        const target = point(enemy.chargeTarget.x, enemy.chargeTarget.z);
        const pulse = 0.55 + Math.sin(now * 0.018) * 0.2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(target.x, target.y);
        ctx.setLineDash([8, 6]); ctx.strokeStyle = `rgba(255,170,62,${pulse})`; ctx.lineWidth = 8; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,242,190,.9)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(target.x, target.y, 10 + (1 - pulse) * 8, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,105,54,${pulse})`; ctx.lineWidth = 2.5; ctx.stroke();
      }
      const dashRemaining = enemy.dashUntil - (clock + serverOffset);
      if ((boss || enemy.kind === 'charger' || enemy.kind === 'shifter') && enemy.dashFrom && dashRemaining > 0) {
        const from = point(enemy.dashFrom.x, enemy.dashFrom.z);
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(p.x, p.y);
        const dashColor = boss ? '#ff315d' : enemy.kind === 'shifter' ? '#d783ff' : '#ff9b38';
        ctx.strokeStyle = dashColor; ctx.lineWidth = 13; ctx.lineCap = 'round'; ctx.shadowColor = dashColor; ctx.shadowBlur = 24; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = '#fff0d8'; ctx.lineWidth = 3; ctx.shadowBlur = 0; ctx.stroke();
      }
      if (hit) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 20 * hit; }
      const color = hit ? '#fff4f7' : boss ? '#ff315d' : enemy.kind === 'charger' ? '#ff9b38' : enemy.kind === 'wisp' ? '#54e9e2' : enemy.kind === 'knight' ? '#bd81d0' : enemy.kind === 'bat' ? '#a17de0' : enemy.kind === 'slinger' ? '#ffd166' : enemy.kind === 'splitter' ? '#ff8066' : enemy.kind === 'shifter' ? '#d783ff' : enemy.kind === 'pack' ? '#a7e85c' : enemy.kind === 'bulwark' ? '#8ea0b7' : '#df6287';
      ctx.fillStyle = color;
      if (enemy.kind === 'charger') {
        const aimX = enemy.chargeTarget?.x ?? enemy.x + 1, aimZ = enemy.chargeTarget?.z ?? enemy.z;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(aimZ - enemy.z, aimX - enemy.x));
        ctx.beginPath(); ctx.moveTo(radius + 3, 0); ctx.lineTo(-radius, -radius * 0.82); ctx.lineTo(-radius * 0.5, 0); ctx.lineTo(-radius, radius * 0.82); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (enemy.kind === 'wisp') {
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4 + Math.sin(now * 0.008 + enemy.movePhase) * 0.25);
        ctx.fillRect(-radius * 0.72, -radius * 0.72, radius * 1.44, radius * 1.44);
        ctx.beginPath(); ctx.ellipse(0, 0, radius + 4, radius * 0.55, now * 0.002, 0, Math.PI * 2);
        ctx.strokeStyle = hit ? '#fff' : 'rgba(176,255,248,.9)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
      } else if (enemy.kind === 'slinger' || enemy.kind === 'shifter') {
        ctx.save(); ctx.translate(p.x, p.y);
        ctx.rotate(enemy.kind === 'slinger' ? Math.PI / 4 : now * 0.004 + enemy.movePhase);
        ctx.fillRect(-radius * 0.72, -radius * 0.72, radius * 1.44, radius * 1.44);
        if (enemy.kind === 'shifter') {
          ctx.beginPath(); ctx.ellipse(0, 0, radius + 4, radius * 0.58, -0.6, 0, Math.PI * 2);
          ctx.strokeStyle = '#f2b7ff'; ctx.lineWidth = 1.5; ctx.stroke();
        }
        ctx.restore();
      } else if (enemy.kind === 'splitter' || enemy.kind === 'bulwark') {
        ctx.save(); ctx.translate(p.x, p.y);
        ctx.beginPath();
        if (enemy.kind === 'bulwark') {
          ctx.moveTo(0, -radius * 1.25); ctx.lineTo(radius, -radius * 0.55); ctx.lineTo(radius * 0.82, radius * 0.65);
          ctx.lineTo(0, radius * 1.2); ctx.lineTo(-radius * 0.82, radius * 0.65); ctx.lineTo(-radius, -radius * 0.55);
        } else {
          for (let side = 0; side < 6; side++) {
            const angle = side * Math.PI / 3 - Math.PI / 2;
            const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
            if (side === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
        }
        ctx.closePath(); ctx.fill();
        if (enemy.kind === 'bulwark') { ctx.strokeStyle = '#e5efff'; ctx.lineWidth = 1.5; ctx.stroke(); }
        ctx.restore();
      } else if (enemy.kind === 'pack') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(radius + 2, 0); ctx.lineTo(-radius, -radius * 0.8); ctx.lineTo(-radius, radius * 0.8); ctx.closePath(); ctx.fill(); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill();
      }
      if (hit || boss) {
        ctx.beginPath(); ctx.arc(p.x, p.y, radius + (hit ? 3 + (1 - hit) * 4 : 4), 0, Math.PI * 2);
        ctx.strokeStyle = hit ? `rgba(255,255,255,${hit})` : 'rgba(255,82,117,.8)'; ctx.lineWidth = hit ? 2 : 1.5; ctx.stroke();
      }
      ctx.restore();
    }
    for (const projectile of state?.projectiles ?? []) {
      const p = point(projectile.x, projectile.z);
      const tail = point(projectile.x - projectile.vx * 0.12, projectile.z - projectile.vz * 0.12);
      const shotColor = projectile.kind === 'boss' ? '#ff315d' : '#ffd166';
      ctx.save(); ctx.shadowColor = shotColor; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = shotColor; ctx.lineWidth = projectile.kind === 'boss' ? 5 : 3; ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(3, projectile.radius * scale), 0, Math.PI * 2);
      ctx.fillStyle = projectile.kind === 'boss' ? '#fff1da' : '#fff8d2'; ctx.fill(); ctx.strokeStyle = shotColor; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
    for (const [i, other] of Object.values(state?.players ?? {}).entries()) {
      const p = point(other.x, other.z);
      const hitAge = clock + serverOffset - other.hitAt;
      const hit = hitAge >= 0 && hitAge < 300 ? 1 - hitAge / 300 : 0;
      if (hit) {
        ctx.save(); ctx.shadowColor = '#ff5a78'; ctx.shadowBlur = 18 * hit;
        ctx.beginPath(); ctx.arc(p.x, p.y, 12 + (1 - hit) * 8, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,110,136,${hit})`; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
      }
      ctx.beginPath(); ctx.arc(p.x, p.y, other.id === player?.id ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = hit ? '#fff2ee' : PLAYER_COLORS[i % PLAYER_COLORS.length]; ctx.fill();
      if (other.id === player?.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    }
    for (const effect of state?.effects ?? []) {
      const age = clock + serverOffset - effect.at;
      if (age < 0 || age > 650) continue;
      const progress = age / 650, alpha = 1 - progress;
      const from = point(effect.from.x, effect.from.z);
      const areaOrigin = point(effect.areaCenter?.x ?? effect.from.x, effect.areaCenter?.z ?? effect.from.z);
      const color = attackColor(effect.gear);
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.shadowColor = color; ctx.shadowBlur = 16;
      if (isAreaWeapon(effect.gear)) {
        const radius = Math.max(4, effect.reach * scale * (0.18 + progress * 0.82));
        const glow = ctx.createRadialGradient(areaOrigin.x, areaOrigin.y, 1, areaOrigin.x, areaOrigin.y, radius);
        glow.addColorStop(0, `${color}58`); glow.addColorStop(0.72, `${color}24`); glow.addColorStop(1, `${color}00`);
        ctx.beginPath(); ctx.arc(areaOrigin.x, areaOrigin.y, radius, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill();
        ctx.beginPath(); ctx.arc(areaOrigin.x, areaOrigin.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = color; ctx.lineWidth = 5 * alpha + 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(areaOrigin.x, areaOrigin.y, Math.max(2, radius * 0.66), 0, Math.PI * 2);
        ctx.strokeStyle = '#fff2cf'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(areaOrigin.x, areaOrigin.y, 4 + progress * 5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      } else {
        for (const [index, target] of effect.targets.entries()) {
          const beamFrom = effect.chain && index > 0
            ? point(effect.targets[index - 1].x, effect.targets[index - 1].z)
            : from;
          const to = point(target.x, target.z);
          ctx.beginPath(); ctx.moveTo(beamFrom.x, beamFrom.y); ctx.lineTo(to.x, to.y);
          ctx.strokeStyle = color; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.beginPath(); ctx.moveTo(beamFrom.x, beamFrom.y); ctx.lineTo(to.x, to.y);
          ctx.strokeStyle = '#fff4e8'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
          const head = { x: beamFrom.x + (to.x - beamFrom.x) * progress, y: beamFrom.y + (to.y - beamFrom.y) * progress };
          ctx.save(); ctx.translate(head.x, head.y); ctx.rotate(Math.atan2(to.y - from.y, to.x - from.x));
          ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, -5); ctx.lineTo(-2, 0); ctx.lineTo(-5, 5); ctx.closePath();
          ctx.fillStyle = color; ctx.shadowBlur = 14; ctx.fill(); ctx.restore();
          ctx.beginPath(); ctx.arc(to.x, to.y, 7 + (1 - progress) * 7, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${0.22 * alpha})`; ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();
          for (let i = 0; i < 6; i++) {
            const angle = i * Math.PI / 3 + progress * 1.5;
            const sparkRadius = (5 + progress * 12) * (i % 2 ? 0.72 : 1);
            ctx.beginPath(); ctx.moveTo(to.x + Math.cos(angle) * sparkRadius, to.y + Math.sin(angle) * sparkRadius);
            ctx.lineTo(to.x + Math.cos(angle) * (sparkRadius + 4), to.y + Math.sin(angle) * (sparkRadius + 4));
            ctx.strokeStyle = i % 2 ? color : '#fff'; ctx.lineWidth = i % 2 ? 2 : 1; ctx.stroke();
          }
        }
      }
      ctx.restore();
    }
  }, [state?.enemies, state?.players, state?.projectiles, state?.effects, state?.phase, player?.x, player?.z, player?.id, participants, avatars, clock, serverOffset]);
  return <canvas ref={ref} className="survivor-map" width={360} height={360} aria-label={tr("ui716")} />;
}

export function SurvivorPanel({ overlay = false }: { overlay?: boolean }) {
  const { state, profile, selfId, participants, avatars, mode, serverOffset } = useStore(useShallow((s) => ({
    state: s.survivors[s.session ?? ''], profile: s.survivorProfile, selfId: s.selfId,
    participants: s.participants, avatars: s.avatars, mode: s.mode, serverOffset: s.serverOffset,
  })));
  const [clock, setClock] = useState(Date.now());
  const [confirmReset, setConfirmReset] = useState(false);
  const [damageEvent, setDamageEvent] = useState<{ key: number; amount: number } | null>(null);
  const keys = useRef(new Set<string>());
  const pos = useRef({ x: 0, z: 0 });
  const choiceDialogRef = useRef<HTMLElement>(null);
  const previousHealth = useRef<{ run: number; hp: number } | null>(null);
  const damageSequence = useRef(0);
  const me = state?.players[selfId];
  const phase = state?.phase ?? 'lobby';
  const active = isActive(phase);
  const paused = active && state?.pausedAt != null;
  const stylePick = state?.stylePicks[selfId] ?? 'bloodrose';
  const elapsed = active ? Math.max(0, Math.min(clock + serverOffset, state!.pausedAt ?? Infinity) - state!.startedAt) : 0;
  const remaining = Math.max(0, SURVIVOR_DURATION_MS - elapsed);
  const xpRatio = me ? Math.min(1, me.xp / Math.max(1, me.nextXp)) : 0;
  const inJoin = participants.filter((u) => {
    const p = u.mode === '3d' ? avatars[u.id] : u.pos;
    return survivorDistance(p ?? SPAWN, SURVIVOR_JOIN) <= SURVIVOR_JOIN.r;
  });
  const canJoin = inJoin.some((u) => u.id === selfId);
  const choices = me?.choiceQueue[0] ?? [];
  const queuedPlayers = Object.values(state?.players ?? {})
    .filter((player) => player.alive && player.choiceQueue.length > 0)
    .sort((a, b) => Number(b.id === selfId) - Number(a.id === selfId));
  const pendingChoiceKey = queuedPlayers.map((player) => `${player.id}:${player.choiceQueue.map((choices) => choices.join('.')).join('/')}`).join(',');
  const needsOwnChoice = !!me?.alive && choices.length > 0;
  const choiceNow = clock + serverOffset;
  const runFinishedReward = phase === 'ended' && me ? survivorRunReward(me.level, me.gear.moonshard ?? 0) : 0;
  const investedPoints = Object.values(profile.upgradeSpent).reduce((total, points) => total + points, 0);
  const resultPlayers = Object.values(state?.players ?? {}).sort((a, b) => b.level - a.level || b.kills - a.kills);
  const resultDuration = phase === 'ended' && state ? Math.max(0, (state.endedAt ?? clock + serverOffset) - state.startedAt) : 0;
  const resultHighestLevel = resultPlayers.reduce((highest, player) => Math.max(highest, player.level), 0);
  const resultReward = me ? runFinishedReward : resultPlayers.reduce((total, player) => total + survivorRunReward(player.level, player.gear.moonshard ?? 0), 0);
  const bosses = state?.enemies.filter((enemy) => enemy.kind === 'boss') ?? [];
  const bossHp = bosses.reduce((total, enemy) => total + enemy.hp, 0);
  const bossMaxHp = bosses.reduce((total, enemy) => total + enemy.maxHp, 0);
  const acquiredSynergyGear = Object.entries(me?.gear ?? {}).filter(([id, level]) => level > 0 && SURVIVOR_GEAR[id]?.synergyGear);
  const mythicFound = profile.discovered.some((id) => SURVIVOR_GEAR[id]?.rarity === 'mythic');
  const synergyProgress = SYNERGY_RECIPES.filter((recipe) =>
    (recipe.evolvedFrom ?? []).some((id) => (me?.gear[id] ?? 0) > 0) || (me?.gear[recipe.id] ?? 0) > 0,
  ).map((recipe) => {
    const acquired = (me?.gear[recipe.id] ?? 0) > 0;
    const sources = (recipe.evolvedFrom ?? []).map((id, index) => {
      const source = SURVIVOR_GEAR[id];
      const maximum = recipe.evolutionLevels?.[index] ?? source?.maxLevel ?? 1;
      const level = acquired ? maximum : Math.min(me?.gear[id] ?? 0, maximum);
      return { id, name: source?.name ?? id, kind: source?.kind, level, maximum };
    });
    const maximum = sources.reduce((total, source) => total + source.maximum, 0);
    const completed = sources.reduce((total, source) => total + source.level, 0);
    const remaining = maximum - completed;
    const slotFull = !acquired && acquiredSynergyGear.length >= (me?.synergyGearSlots ?? SURVIVOR_BASE_SYNERGY_GEAR);
    const choiceIndex = me?.choiceQueue.findIndex((queue) => queue.includes(recipe.id)) ?? -1;
    return {
      recipe, sources, maximum, completed, remaining, acquired, slotFull, choiceIndex,
      revealed: acquired || mythicFound || profile.discovered.includes(recipe.id),
    };
  });
  const synergyGroups = [{ label: tr("ui717"), recipes: synergyProgress }];

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!me || !state) {
      previousHealth.current = null;
      return;
    }
    const previous = previousHealth.current;
    if (previous?.run === state.run && me.hp < previous.hp) {
      setDamageEvent({ key: ++damageSequence.current, amount: Math.max(1, Math.ceil(previous.hp - me.hp)) });
    }
    previousHealth.current = { run: state.run, hp: me.hp };
  }, [me?.id, me?.hp, state?.run]);
  useEffect(() => {
    if (queuedPlayers.length > 0 && !needsOwnChoice) choiceDialogRef.current?.focus();
  }, [pendingChoiceKey, needsOwnChoice]);
  useEffect(() => {
    if (me && mode === '2d' && !keys.current.size) pos.current = { x: me.x, z: me.z };
  }, [me?.x, me?.z, mode, state?.run]);
  useEffect(() => {
    if (mode !== '2d' || !active || paused || !me?.alive) return;
    const onDown = (e: KeyboardEvent) => {
      if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(e.code)) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return;
      e.preventDefault(); keys.current.add(e.code);
    };
    const onUp = (e: KeyboardEvent) => { keys.current.delete(e.code); };
    const clear = () => keys.current.clear();
    const timer = window.setInterval(() => {
      const down = keys.current;
      const f = Number(down.has('KeyW') || down.has('ArrowUp')) - Number(down.has('KeyS') || down.has('ArrowDown'));
      const r = Number(down.has('KeyD') || down.has('ArrowRight')) - Number(down.has('KeyA') || down.has('ArrowLeft'));
      if (!f && !r) return;
      const speed = SURVIVOR_STYLES[me.style].speed * (1 + (me.gear.nightcloak ?? 0) * 0.025);
      const step = speed * 0.1 / Math.hypot(f, r);
      let x = pos.current.x + r * step, z = pos.current.z - f * step;
      ({ x, z } = clampSurvivorPosition(x, z));
      pos.current = { x, z };
      send({ t: 'survivorMove', x, z });
    }, 100);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', clear);
    return () => { clearInterval(timer); window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); window.removeEventListener('blur', clear); clear(); };
  }, [mode, active, paused, me?.alive, me?.style, me?.gear.nightcloak]);

  const status = paused ? tr("ui718") : active && me && !me.alive ? tr("ui719")
    : phase === 'lobby' ? tr("ui720") : phase === 'running' ? tr("ui721")
      : phase === 'boss' ? tr("ui722", bosses.length) : state?.bossDefeated ? tr("ui723") : tr("ui724");
  const choiceDialog = queuedPlayers.length > 0 && typeof document !== 'undefined'
    ? createPortal(<div className={`survivor-choice-overlay ${needsOwnChoice ? 'needs-choice' : 'watching-choice'}`} onKeyDown={(e) => {
      if (e.key !== 'Tab') return;
      e.stopPropagation();
      const focusable = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (!focusable.length) { e.preventDefault(); choiceDialogRef.current?.focus(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }}>
      <section ref={choiceDialogRef} tabIndex={-1} key={`${state?.run}-${pendingChoiceKey}`} className="survivor-choices" role="dialog" aria-modal="true" aria-labelledby="survivor-choice-title">
        <div className="survivor-choice-title">
          <span>{needsOwnChoice ? tr("ui725") : '✦ CO-OP LEVEL UP ✦'}</span>
          <h3 id="survivor-choice-title">{needsOwnChoice ? tr("ui726") : tr("ui727")}</h3>
          <small>{tr("ui728")}{queuedPlayers.map((player) => player.id === selfId ? tr("ui84") : player.name).join('、')} {tr("ui729")}{needsOwnChoice ? tr("ui730", acquiredSynergyGear.length, me?.synergyGearSlots ?? SURVIVOR_BASE_SYNERGY_GEAR) : ''}</small>
        </div>
        <div className="survivor-choice-players">{queuedPlayers.map((owner) => {
          const isMine = owner.id === selfId;
          const options = owner.choiceQueue[0] ?? [];
          const ownerSynergyCount = Object.entries(owner.gear).filter(([id, level]) => level > 0 && SURVIVOR_GEAR[id]?.synergyGear).length;
          const deadline = owner.choiceDeadlineAt ?? choiceNow + SURVIVOR_CHOICE_TIMEOUT_MS;
          const choiceTimeLeft = Math.max(0, Math.min(SURVIVOR_CHOICE_TIMEOUT_MS, deadline - choiceNow));
          return <section key={owner.id} className={`survivor-choice-player ${isMine ? 'is-self' : ''}`} aria-label={tr("ui731", isMine ? tr("ui84") : owner.name)}>
            <div className="survivor-choice-player-head"><b>{isMine ? tr("ui84") : owner.name}</b><span>{isMine ? tr("ui732") : tr("ui733")} {tr("ui734")}{ownerSynergyCount}/{owner.synergyGearSlots}</span></div>
            <div className="survivor-choice-timer" role="progressbar" aria-label={tr("ui735", isMine ? tr("ui84") : owner.name)} aria-valuemin={0} aria-valuemax={SURVIVOR_CHOICE_TIMEOUT_MS} aria-valuenow={choiceTimeLeft}>
              <div><span>{tr("ui736")}</span><b>{Math.ceil(choiceTimeLeft / 1000)}{tr("ui737")}</b></div>
              <i style={{ width: `${Math.min(100, choiceTimeLeft / SURVIVOR_CHOICE_TIMEOUT_MS * 100)}%` }} />
            </div>
            <div className="survivor-choice-list">{options.map((id, index) => {
              const gear = SURVIVOR_GEAR[id];
              const partner = gear.synergy ?? Object.values(SURVIVOR_GEAR).find((candidate) => candidate.synergy === gear.id)?.id;
              const level = (owner.gear[id] ?? 0) + 1;
              const synergyProgress = gear.synergyGear ? [] : synergyProgressForChoice(owner, id);
              const details = <>
                <b>{gear.name}</b><small>{RARITY_NAME[gear.rarity]} · Lv.{level}</small><span>{gear.desc}</span>
                {synergyProgress.map((path) => <span key={path.id} className="survivor-choice-synergy-progress" role="progressbar" aria-label={tr("ui738", path.name)} aria-valuemin={0} aria-valuemax={path.maximum} aria-valuenow={path.progress}>
                  <span className="survivor-choice-synergy-progress-head"><span>{tr("ui739")}{path.name}</span><b>{path.progress}/{path.maximum}</b></span>
                  <i style={{ width: `${path.progress / path.maximum * 100}%` }} />
                </span>)}
                {partner && <small>{tr("ui740")}{SURVIVOR_GEAR[partner]?.name}</small>}
                {gear.evolvedFrom && <small>{tr("ui741")}{evolutionConditionText(gear)}</small>}
                {gear.synergyGear && <small className="survivor-synergy-choice-slot">{tr("ui742")}{Math.min(owner.synergyGearSlots, ownerSynergyCount + 1)}/{owner.synergyGearSlots}</small>}
              </>;
              return isMine
                ? <button key={id} type="button" autoFocus={index === 0} title={gearTooltipText(id, level)} className={`survivor-choice rarity-${gear.rarity} ${gear.synergyGear ? 'survivor-synergy-choice' : ''} ${synergyProgress.length ? 'survivor-synergy-step' : ''}`} onClick={() => { unlockSurvivorAudio(); send({ t: 'survivorChoose', gear: id }); }}>{details}</button>
                : <article key={id} title={gearTooltipText(id, level)} className={`survivor-choice survivor-choice-readonly rarity-${gear.rarity} ${gear.synergyGear ? 'survivor-synergy-choice' : ''} ${synergyProgress.length ? 'survivor-synergy-step' : ''}`}>{details}</article>;
            })}</div>
            {isMine && <button className="survivor-reroll" disabled={owner.rerollsRemaining <= 0} onClick={() => send({ t: 'survivorReroll' })}>
              {owner.rerollsRemaining > 0 ? tr("ui743", owner.rerollsRemaining) : tr("ui744")}
            </button>}
          </section>;
        })}</div>
      </section>
    </div>, document.body)
    : null;
  const damageFlash = damageEvent && typeof document !== 'undefined'
    ? createPortal(<div key={damageEvent.key} className="survivor-damage-flash" aria-hidden="true"><div className="survivor-damage-label"><b>{tr("ui745")}</b><span>−{damageEvent.amount} HP</span></div></div>, document.body)
    : null;
  return (
    <div className={`survivor-panel ${overlay ? 'overlay' : ''} ${paused ? 'is-paused' : ''} ${phase === 'boss' ? 'is-boss' : ''}`} tabIndex={0} aria-label={tr(SURVIVOR_TITLE)} onPointerDownCapture={unlockSurvivorAudio}>
      <div className="survivor-head">
        <div><h2>{tr(SURVIVOR_TITLE)}</h2><span>{status}</span></div>
        {active && <span className="survivor-enemy-count">{tr("ui746")}{state?.enemies.length ?? 0}{tr("ui747")}</span>}
        {active && <strong className={`survivor-time ${phase === 'boss' ? 'boss' : ''}`}>{phase === 'boss' ? 'BOSS' : formatTime(remaining)}</strong>}
      </div>
      {paused && <div className="survivor-pause-banner"><span className="survivor-pause-mark">✦</span><span><b>{tr("ui748")}</b><small>{tr("ui749")}</small></span><span className="survivor-pause-mark">✦</span></div>}
      {mode === '2d' && <SurvivorCanvas state={state} player={me} participants={participants} avatars={avatars} clock={clock} serverOffset={serverOffset} />}
      {phase === 'boss' && bossMaxHp > 0 && <div className="survivor-boss-health"><span>{tr("ui750")}{bosses.length} · {Math.ceil(bossHp).toLocaleString()} / {bossMaxHp.toLocaleString()}</span><div><i style={{ width: `${Math.max(0, bossHp / bossMaxHp * 100)}%` }} /></div></div>}
      <div className="survivor-legend"><span>{tr("ui751")}</span><span>{tr("ui752")}</span><span>{tr("ui753")}</span>{mode === '2d' && active && <span>{tr("ui754")}</span>}{mode === '3d' && active && <span>{tr("ui755")}</span>}</div>

      {me && <div className="survivor-vitals">
        <div className="survivor-vital"><span>Lv. {me.level}</span><div><i style={{ width: `${Math.max(0, me.hp / me.maxHp * 100)}%`, background: '#e45169' }} /></div><b>{Math.ceil(me.hp)} / {me.maxHp}</b></div>
        <div className="survivor-vital"><span>EXP</span><div><i style={{ width: `${xpRatio * 100}%`, background: '#e9c75b' }} /></div><b>{Math.floor(me.xp)} / {me.nextXp}</b></div>
        <span>{tr("ui756")}{me.kills}</span>
      </div>}

      {damageFlash}
      {choiceDialog}

      {phase === 'ended' && state && <section className="survivor-result" aria-labelledby="survivor-result-title">
        <header className="survivor-result-head">
          <span>{state.bossDefeated ? tr("ui757") : tr("ui758")}</span>
          <h3 id="survivor-result-title">{tr("ui759")}</h3>
          <small>{formatTime(resultDuration)} {tr("ui760")}{state.bossDefeated ? tr("ui723") : tr("ui761")}</small>
        </header>
        <div className="survivor-result-stats">
          <div><span>{tr("ui762")}</span><b>{state.kills.toLocaleString()}</b></div>
          <div><span>{tr("ui763")}</span><b>Lv.{resultHighestLevel}</b></div>
          <div><span>{tr("ui764")}</span><b>{resultPlayers.length}{tr("ui125")}</b></div>
          <div><span>{me ? tr("ui765") : tr("ui766")}</span><b>+{resultReward} pt</b></div>
        </div>
        <ol className="survivor-result-players" aria-label={tr("ui767")}>
          {resultPlayers.map((player, index) => <li key={player.id} className={player.id === selfId ? 'is-self' : ''}>
            <span className="survivor-result-rank">{index + 1}</span>
            <span className="survivor-result-player"><b>{SURVIVOR_STYLES[player.style].mark} {player.id === selfId ? tr("ui84") : player.name}</b><small>{player.alive ? tr("ui768") : tr("ui769")} · {SURVIVOR_STYLES[player.style].name}</small></span>
            <span><b>Lv.{player.level}</b><small>{tr("ui756")}{player.kills}</small></span>
            <span><b>+{survivorRunReward(player.level, player.gear.moonshard ?? 0)} pt</b><small>{tr("ui770")}</small></span>
          </li>)}
        </ol>
      </section>}

      {(!active || !me) && <section className="survivor-lobby">
        <h3>{active ? tr("ui771") : phase === 'ended' ? tr("ui772") : tr("ui773")}</h3>
        <div className="survivor-styles">{STYLES.map(([id, style]) => {
          const unlocked = !style.unlockAt || profile.upgrades.characters >= style.unlockAt;
          return <button key={id} disabled={!unlocked || (active && !canJoin)} className={`survivor-style ${stylePick === id ? 'selected' : ''} ${!unlocked ? 'locked' : ''}`} onClick={() => send({ t: 'survivorStyle', style: id })}>
            <b><span>{unlocked ? style.mark : '🔒'}</span>{style.name}</b>
            {!unlocked && <small className="survivor-style-lock">{tr("ui774")}{style.unlockAt}{tr("ui775")}</small>}
            <small>{style.desc}</small><small>{tr("ui776")}{SURVIVOR_GEAR[style.weapon].name} · HP {style.hp} {tr("ui777")}{style.speed.toFixed(1)}</small>
          </button>;
        })}</div>
        <div className="survivor-join-status">{tr("ui778")}{inJoin.length} {tr("ui779")}{inJoin.map((u) => u.name).join('、') || tr("ui780")}</div>
        <button className="primary big survivor-start" disabled={!canJoin || (active && !!me?.alive)} onClick={() => { unlockSurvivorAudio(); send({ t: 'survivorStart' }); }}>
          {active ? tr("ui781") : phase === 'ended' ? tr("ui782") : tr("ui783")}
        </button>
        {!canJoin && <small className="survivor-hint">{tr("ui784")}</small>}
      </section>}

      {me && <>
        <div className="survivor-loadout"><b>{tr("ui600")}</b><div className="survivor-loadout-items">{Object.entries(me.gear).filter(([id, level]) => level > 0 && !SURVIVOR_GEAR[id]?.synergyGear && !SYNERGY_SOURCE_IDS.has(id)).map(([id, level]) => <span key={id} title={gearTooltipText(id, level)}>{SURVIVOR_GEAR[id]?.name ?? id} Lv.{level}</span>)}</div></div>
        {synergyProgress.length > 0 && <div className="survivor-synergy-loadout" aria-label={tr("ui785", acquiredSynergyGear.length, me.synergyGearSlots)}>
          <b><span>{tr("ui786")}</span><strong>{tr("ui787")}{acquiredSynergyGear.length}/{me.synergyGearSlots}</strong></b>
          <small className="survivor-synergy-note">{tr("ui788")}</small>
          <div className="survivor-synergy-paths">
            {synergyGroups.map((group) => <section key={group.label} className="survivor-synergy-category">
              <b>{group.label}</b>
              {group.recipes.map(({ recipe, sources, maximum, completed, remaining, acquired, slotFull, choiceIndex, revealed }) => (
                <article key={recipe.id} className={`survivor-synergy-path ${acquired || (!slotFull && remaining === 0) ? 'ready' : ''}`}>
                  <div className="survivor-synergy-pair">
                    {sources.map((source, index) => <Fragment key={source.id}>
                      {index > 0 && <span className="survivor-synergy-plus" aria-hidden="true">＋</span>}
                      <span className="survivor-synergy-source"><b>{source.name}</b><small>Lv.{source.level}/{source.maximum}</small></span>
                    </Fragment>)}
                  </div>
                  <div className="survivor-synergy-progress" role="progressbar" aria-label={tr("ui789", sources.map((source) => source.name).join(tr("ui790")))} aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={completed}>
                    <i style={{ width: `${maximum ? completed / maximum * 100 : 0}%` }} />
                  </div>
                  <div className="survivor-synergy-result">
                     <small>{acquired ? tr("ui791") : slotFull ? tr("ui792", me?.synergyGearSlots ?? SURVIVOR_BASE_SYNERGY_GEAR) : remaining === 0 ? choiceIndex === 0 ? tr("ui793") : choiceIndex > 0 ? tr("ui794") : tr("ui795") : tr("ui796", remaining)}</small>
                    <b>→ {revealed ? recipe.name : tr("ui797")}</b>
                  </div>
                </article>
              ))}
            </section>)}
          </div>
          <b className="survivor-synergy-slots-title">{tr("ui791")}</b>
          <div className="survivor-synergy-slots">{Array.from({ length: me.synergyGearSlots }, (_, index) => {
            const item = acquiredSynergyGear[index];
            return item
              ? <span key={index} className="filled" title={gearTooltipText(item[0], item[1])}>✦ {SURVIVOR_GEAR[item[0]]?.name}</span>
              : <span key={index} className="empty">{tr("ui798")}{index + 1}</span>;
          })}</div>
        </div>}
      </>}

      <section className="survivor-meta">
        <div className="survivor-section-head"><h3>{tr("ui799")}</h3><b>{profile.points} pt</b></div>
        <button className="survivor-library-open" onClick={() => openWindow('survivor-library')}>{tr("ui800")}</button>
        <small className="survivor-upgrade-note">{tr("ui801")}</small>
        <div className="survivor-upgrades">{Object.entries(SURVIVOR_META_UPGRADES).map(([key, upgrade]) => {
          const upgradeKey = key as SurvivorMetaUpgrade;
          const level = profile.upgrades[upgradeKey];
          const cost = survivorUpgradeCost(upgradeKey, level);
          const nextCharacter = upgradeKey === 'characters'
            ? Object.values(SURVIVOR_STYLES).find((style) => style.unlockAt === level + 1)?.name
            : undefined;
          const synergySlotStatus = upgradeKey === 'synergySlots'
            ? tr("ui802", SURVIVOR_BASE_SYNERGY_GEAR + level, SURVIVOR_MAX_SYNERGY_GEAR)
            : '';
          return <button key={key} className="survivor-upgrade" disabled={profile.points < cost || level >= upgrade.max} onClick={() => send({ t: 'survivorUpgrade', upgrade: upgradeKey })}>
            <span><b>{upgrade.name} Lv.{level}/{upgrade.max}</b><small>{upgrade.desc}{nextCharacter ? tr("ui803", nextCharacter) : ''}{synergySlotStatus}</small></span><strong>{level >= upgrade.max ? 'MAX' : `${cost} pt`}</strong>
          </button>;
        })}</div>
        {investedPoints > 0 && (active
          ? <small className="survivor-reset-hint">{tr("ui804")}</small>
          : confirmReset
            ? <div className="survivor-reset-confirm" role="group" aria-label={tr("ui805")}>
              <span>{tr("ui806")}<b>{investedPoints} pt</b>{tr("ui807")}</span>
              <div><button className="survivor-reset-danger" onClick={() => { send({ t: 'survivorReset' }); setConfirmReset(false); }}>{tr("ui808")}{investedPoints} {tr("ui809")}</button><button className="survivor-reset-cancel" onClick={() => setConfirmReset(false)}>{tr("ui338")}</button></div>
            </div>
            : <button className="survivor-reset" onClick={() => setConfirmReset(true)}>{tr("ui810")}<span>+{investedPoints} {tr("ui811")}</span></button>
        )}
      </section>

    </div>
  );
}

export function SurvivorLibrary() {
  const profile = useStore((s) => s.survivorProfile);
  const mythicFound = profile.discovered.some((id) => SURVIVOR_GEAR[id]?.rarity === 'mythic');
  const visibleGear = Object.values(SURVIVOR_GEAR).filter((gear) => gear.rarity !== 'mythic' || mythicFound);
  return (
    <div className="survivor-library-window">
      <div className="survivor-library-stats">{tr("ui812")}{profile.runs} {tr("ui813")}{profile.bestLevel} {tr("ui814")}{profile.bestKills}</div>
      <div className="survivor-gear-grid">{visibleGear.map((gear) => {
        const found = profile.discovered.includes(gear.id);
        const partner = gear.synergy ?? Object.values(SURVIVOR_GEAR).find((candidate) => candidate.synergy === gear.id)?.id;
        return <article key={gear.id} title={gearTooltipText(gear.id)} className={`survivor-gear ${found ? 'found' : ''}`}>
          <b>{gear.name}</b><small>{RARITY_NAME[gear.rarity]} · {found ? tr("ui815") : tr("ui816")}</small><span>{gear.desc}</span>
          {partner && <small>{tr("ui740")}{SURVIVOR_GEAR[partner]?.name}</small>}
          {gear.evolvedFrom && <small>{tr("ui741")}{evolutionConditionText(gear)}</small>}
        </article>;
      })}{!mythicFound && <article className="survivor-gear hidden"><b>？？？</b><small>{tr("ui817")}</small><span>{tr("ui818")}</span></article>}</div>
      <h4>{tr("ui819")}</h4>
      <div className="survivor-achievements">{Object.entries(SURVIVOR_ACHIEVEMENTS).map(([id, achievement]) => <span key={id} className={profile.achievements.includes(id as keyof typeof SURVIVOR_ACHIEVEMENTS) ? 'earned' : ''} title={achievement.desc}>{profile.achievements.includes(id as keyof typeof SURVIVOR_ACHIEVEMENTS) ? '✦' : '◇'} {achievement.name}</span>)}</div>
    </div>
  );
}
