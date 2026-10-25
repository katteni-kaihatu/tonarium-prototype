import type { AvatarState, Participant } from '../shared/protocol.ts';
import {
  SURVIVOR_CHOICE_TIMEOUT_MS, SURVIVOR_DURATION_MS, SURVIVOR_TICK_MS, SURVIVOR_WORLD_LIMIT,
  SURVIVOR_GEAR, SURVIVOR_JOIN, SURVIVOR_MAX_ENEMIES, SURVIVOR_META_UPGRADES,
  SURVIVOR_BASE_SYNERGY_GEAR, SURVIVOR_STYLES, clampSurvivorPosition, newSurvivorState,
  survivorDistance, survivorRunReward, survivorUpgradeCost, survivorXpFor, type SurvivorAchievement, type SurvivorEnemy, type SurvivorGearDef,
  isSurvivorSynergyRecipe, type SurvivorMetaUpgrade, type SurvivorPlayer, type SurvivorProfile, type SurvivorState, type SurvivorStyle,
} from '../shared/survivor.ts';
import { SPAWN } from '../shared/protocol.ts';

const states = new Map<string, SurvivorState>();
const ENEMY_HP_MULTIPLIER = 3;
export const survivorOf = (sid: string) => {
  let state = states.get(sid);
  if (!state) { state = newSurvivorState(); states.set(sid, state); }
  return state;
};
export const clearSurvivor = (sid: string) => {
  const rec = moveSends.get(sid);
  if (rec?.timer) moveClock.clearTimer(rec.timer);
  moveSends.delete(sid);
  return states.delete(sid);
};

export interface SurvivorDeps {
  sendState(sid: string, state: SurvivorState): void;
  profile(id: string): SurvivorProfile;
  saveProfiles(): void;
  users(sid: string): Participant[];
  avatars(sid: string): Map<string, AvatarState>;
  profileUpdated(id: string, profile: SurvivorProfile): void;
}

// roomSend は状態を同期的に pack してバイト列にするため、送信後の状態変更は混ざらず複製は要らない
function send(sid: string, s: SurvivorState, d: SurvivorDeps) { d.sendState(sid, s); }

const MOVE_SEND_MS = 100;
interface MoveSend { at: number; timer: ReturnType<typeof setTimeout> | null; s: SurvivorState; d: SurvivorDeps }
const moveSends = new Map<string, MoveSend>();

/** 間引きの時刻・タイマーは単体テストから差し替えられるようにしておく (本番は実時計) */
export interface MoveSendClock {
  now(): number;
  setTimer(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimer(timer: ReturnType<typeof setTimeout>): void;
}
const systemMoveClock: MoveSendClock = {
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (timer) => clearTimeout(timer),
};
let moveClock: MoveSendClock = systemMoveClock;
/** 単体テスト用。本番コードからは呼ばない */
export const setMoveSendClock = (clock: MoveSendClock | null) => { moveClock = clock ?? systemMoveClock; };

/** 移動メッセージは頻繁に届くので、状態の反映は即時でも送信だけ 100ms に間引く。最後の位置は末尾の送信で必ず届ける */
export function sendMove(sid: string, s: SurvivorState, d: SurvivorDeps) {
  let rec = moveSends.get(sid);
  if (!rec) { rec = { at: 0, timer: null, s, d }; moveSends.set(sid, rec); }
  rec.s = s; rec.d = d;
  const now = moveClock.now();
  const wait = MOVE_SEND_MS - (now - rec.at);
  if (wait <= 0) {
    if (rec.timer) { moveClock.clearTimer(rec.timer); rec.timer = null; }
    rec.at = now;
    send(sid, s, d);
    return;
  }
  if (rec.timer) return;
  rec.timer = moveClock.setTimer(() => {
    rec.timer = null;
    // 状態が入れ替わっていたら、開始時の送信で足りている。その場合は送っていないので
    // 最終送信時刻も進めない (進めると、次のランの最初の送信が最大で間引き間隔ぶん遅れる)
    if (states.get(sid) === rec.s) {
      rec.at = moveClock.now();
      send(sid, rec.s, rec.d);
    }
  }, wait);
}
function positionOf(u: Participant, avatars: Map<string, AvatarState>) {
  return u.mode === '3d' ? avatars.get(u.id) ?? SPAWN : u.pos ?? SPAWN;
}
const inJoinArea = (p: { x: number; z: number }) => survivorDistance(p, SURVIVOR_JOIN) <= SURVIVOR_JOIN.r;
const hasPendingChoice = (s: SurvivorState) => Object.values(s.players).some((p) => p.alive && p.choiceQueue.length > 0);
function random(s: SurvivorState) {
  let x = s.randomSeed | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  s.randomSeed = x >>> 0 || 1;
  return s.randomSeed / 0x1_0000_0000;
}
function pointSegmentDistance(point: { x: number; z: number }, from: { x: number; z: number }, to: { x: number; z: number }) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / lengthSq)) : 0;
  return Math.hypot(point.x - (from.x + t * dx), point.z - (from.z + t * dz));
}
function pickedStyle(s: SurvivorState, id: string): SurvivorStyle { return s.stylePicks[id] ?? 'bloodrose'; }
function playerFor(u: Participant, s: SurvivorState, d: SurvivorDeps, index: number): SurvivorPlayer {
  const profile = d.profile(u.id);
  const picked = pickedStyle(s, u.id);
  const style = profile.upgrades.characters >= (SURVIVOR_STYLES[picked].unlockAt ?? 0) ? picked : 'bloodrose';
  const def = SURVIVOR_STYLES[style];
  const a = index * 2.39996;
  const pos = clampSurvivorPosition(Math.sin(a) * 0.55, Math.cos(a) * 0.55);
  const maxHp = def.hp + profile.upgrades.vitality * 20;
  const player: SurvivorPlayer = {
    id: u.id, name: u.name, style, ...pos, hp: maxHp, maxHp, level: 1, xp: 0, nextXp: survivorXpFor(1),
    rerollsRemaining: profile.upgrades.rerolls,
    synergyGearSlots: SURVIVOR_BASE_SYNERGY_GEAR + profile.upgrades.synergySlots,
    alive: true, kills: 0, gear: { [def.weapon]: 1 }, choiceQueue: [], choiceDeadlineAt: null, hitAt: 0, attackAt: {}, moveAt: Date.now(),
  };
  discover(u.id, def.weapon, d);
  d.saveProfiles();
  return player;
}
function eligibleUsers(sid: string, d: SurvivorDeps) {
  const avatars = d.avatars(sid);
  return d.users(sid).filter((u) => inJoinArea(positionOf(u, avatars)));
}
function addPlayer(sid: string, s: SurvivorState, u: Participant, d: SurvivorDeps) {
  if (s.players[u.id]) return false;
  const player = playerFor(u, s, d, Object.keys(s.players).length);
  // 途中参加者は現在時刻・敵の強さはそのまま、レベル1で入る。
  if (s.phase !== 'lobby' && s.startedAt) player.xp = 0;
  s.players[u.id] = player;
  return true;
}

export function chooseSurvivorStyle(sid: string, user: Participant, style: SurvivorStyle, d: SurvivorDeps) {
  if (!Object.hasOwn(SURVIVOR_STYLES, style)) return;
  if (d.profile(user.id).upgrades.characters < (SURVIVOR_STYLES[style].unlockAt ?? 0)) return;
  const s = survivorOf(sid);
  if ((s.phase === 'running' || s.phase === 'boss') && !inJoinArea(positionOf(user, d.avatars(sid)))) return;
  s.stylePicks[user.id] = style;
  send(sid, s, d);
}

export function startSurvivor(sid: string, by: Participant, d: SurvivorDeps) {
  const s = survivorOf(sid);
  if (s.phase === 'running' || s.phase === 'boss') {
    const u = d.users(sid).find((x) => x.id === by.id);
    if (u && inJoinArea(positionOf(u, d.avatars(sid)))) {
      if (addPlayer(sid, s, u, d)) send(sid, s, d);
    }
    return;
  }
  const group = eligibleUsers(sid, d);
  if (!group.some((u) => u.id === by.id)) return;
  const next = newSurvivorState();
  next.run = s.run + 1;
  next.phase = 'running';
  next.startedAt = Date.now();
  next.nextSpawnAt = next.startedAt + 500;
  next.randomSeed = (Math.random() * 0xffff_ffff) >>> 0 || 1;
  Object.assign(next.stylePicks, s.stylePicks);
  group.forEach((u, i) => { next.players[u.id] = playerFor(u, next, d, i); });
  states.set(sid, next);
  send(sid, next, d);
}

export function moveSurvivor(sid: string, user: Participant, x: number, z: number, d: SurvivorDeps) {
  const s = survivorOf(sid), p = s.players[user.id];
  if (!p?.alive || s.pausedAt != null || hasPendingChoice(s) || !Number.isFinite(x) || !Number.isFinite(z) || (s.phase !== 'running' && s.phase !== 'boss')) return;
  const now = Date.now();
  const dt = Math.max(0.04, Math.min(0.4, (now - (p.moveAt ?? now - 100)) / 1000));
  const speed = SURVIVOR_STYLES[p.style].speed * (1 + (p.gear.nightcloak ?? 0) * 0.025);
  const max = speed * dt + 0.35;
  const dx = x - p.x, dz = z - p.z, dist = Math.hypot(dx, dz);
  if (dist > max) { x = p.x + dx / dist * max; z = p.z + dz / dist * max; }
  Object.assign(p, clampSurvivorPosition(x, z), { moveAt: now });
  sendMove(sid, s, d);
}

function poolFor(p: SurvivorPlayer) {
  const synergyCount = Object.entries(p.gear).filter(([id, level]) => level > 0 && SURVIVOR_GEAR[id]?.synergyGear).length;
  return Object.values(SURVIVOR_GEAR).filter((g) => {
    const level = p.gear[g.id] ?? 0;
    if (level >= g.maxLevel) return false;
    if (g.synergyGear) {
      return synergyCount < p.synergyGearSlots
        && isSurvivorSynergyRecipe(g)
        && g.evolvedFrom!.every((source, index) => (p.gear[source] ?? 0) >= evolutionRequirement(g, index));
    }
    if (g.rarity === 'mythic') return false;
    if (g.evolvedFrom) {
      const [weapon, passive] = g.evolvedFrom;
      return (p.gear[weapon] ?? 0) >= 5 && (p.gear[passive] ?? 0) >= 1;
    }
    return true;
  }).map((g) => g.id);
}
function evolutionRequirement(gear: SurvivorGearDef, index: number) {
  const source = gear.evolvedFrom?.[index];
  return gear.evolutionLevels?.[index] ?? (source ? SURVIVOR_GEAR[source]?.maxLevel : undefined) ?? 1;
}
function choicesFor(p: SurvivorPlayer, s: SurvivorState, prioritySynergies: string[] = [], excluded: string[] = [], choiceCount = 3) {
  const excludedSet = new Set(excluded);
  const pool = poolFor(p).filter((id) => !excludedSet.has(id));
  const synergyPool = pool.filter((id) => SURVIVOR_GEAR[id]?.synergyGear);
  const choices = prioritySynergies.filter((id) => synergyPool.includes(id)).slice(0, choiceCount);
  const remainingSynergies = synergyPool.filter((id) => !choices.includes(id));
  while (remainingSynergies.length && choices.length < choiceCount) choices.push(remainingSynergies.splice(Math.floor(random(s) * remainingSynergies.length), 1)[0]);
  const ordinaryPool = pool.filter((id) => !SURVIVOR_GEAR[id]?.synergyGear);
  while (ordinaryPool.length && choices.length < choiceCount) choices.push(ordinaryPool.splice(Math.floor(random(s) * ordinaryPool.length), 1)[0]);
  return choices;
}
function giveXp(s: SurvivorState, d: SurvivorDeps, amount: number, now: number) {
  for (const p of Object.values(s.players)) {
    if (!p.alive) continue;
    p.xp += amount * (1 + (p.gear.soulcrown ?? 0) * 0.08);
    while (p.xp >= p.nextXp) {
      p.xp -= p.nextXp;
      p.level++;
      p.nextXp = survivorXpFor(p.level);
      const choices = choicesFor(p, s, [], [], 3 + d.profile(p.id).upgrades.choiceCount);
      if (choices.length) {
        if (!p.choiceQueue.length) p.choiceDeadlineAt = now + SURVIVOR_CHOICE_TIMEOUT_MS;
        p.choiceQueue.push(choices);
      }
    }
  }
}
function discover(id: string, gear: string, d: SurvivorDeps) {
  const profile = d.profile(id);
  if (!profile.discovered.includes(gear)) {
    profile.discovered.push(gear);
  }
  if (SURVIVOR_GEAR[gear]?.rarity === 'mythic' && !profile.achievements.includes('mythic')) profile.achievements.push('mythic');
  d.profileUpdated(id, profile);
}
function applySurvivorGear(s: SurvivorState, p: SurvivorPlayer, gear: string, d: SurvivorDeps, now: number) {
  const choices = p?.choiceQueue[0];
  if (!p?.alive || !choices?.includes(gear)) return;
  const def = SURVIVOR_GEAR[gear];
  if (!def) return;
  if (!poolFor(p).includes(gear)) {
    p.choiceQueue[0] = choices.filter((id) => poolFor(p).includes(id));
    if (!p.choiceQueue[0].length) {
      p.choiceQueue.shift();
      p.choiceDeadlineAt = p.choiceQueue.length ? now + SURVIVOR_CHOICE_TIMEOUT_MS : null;
    }
    return;
  }
  if (def.synergyGear) {
    const synergyCount = Object.entries(p.gear).filter(([id, level]) => level > 0 && SURVIVOR_GEAR[id]?.synergyGear).length;
    const stillEligible = (id: string) => {
      const candidate = SURVIVOR_GEAR[id];
      return !!candidate && (!candidate.synergyGear || (
        synergyCount < p.synergyGearSlots
        && !!candidate.evolvedFrom?.every((source, index) => (p.gear[source] ?? 0) >= evolutionRequirement(candidate, index))
      ));
    };
    if (!stillEligible(gear)) {
      p.choiceQueue[0] = choices.filter(stillEligible);
      if (!p.choiceQueue[0].length) {
        p.choiceQueue.shift();
        p.choiceDeadlineAt = p.choiceQueue.length ? now + SURVIVOR_CHOICE_TIMEOUT_MS : null;
      }
      return;
    }
  }
  if (def.evolvedFrom) {
    for (const source of def.evolvedFrom) if (SURVIVOR_GEAR[source]?.kind === 'weapon') p.gear[source] = 0;
  }
  const oldLevel = p.gear[gear] ?? 0;
  p.gear[gear] = Math.min(def.maxLevel, oldLevel + 1);
  if (gear === 'ironheart' && p.gear[gear] > oldLevel) {
    p.maxHp += 8;
    p.hp = Math.min(p.maxHp, p.hp + 8);
  }
  p.choiceQueue.shift();
  p.choiceDeadlineAt = p.choiceQueue.length ? now + SURVIVOR_CHOICE_TIMEOUT_MS : null;
  if (!def.synergyGear) {
    const newlyReady = poolFor(p).filter((id) => {
      const recipe = SURVIVOR_GEAR[id];
      const sourceIndex = recipe?.evolvedFrom?.indexOf(gear) ?? -1;
      return !!recipe && isSurvivorSynergyRecipe(recipe) && sourceIndex >= 0
        && oldLevel < evolutionRequirement(recipe, sourceIndex)
        && p.gear[gear] >= evolutionRequirement(recipe, sourceIndex);
    });
    if (newlyReady.length) {
      p.choiceQueue.unshift(choicesFor(p, s, newlyReady, [], 3 + d.profile(p.id).upgrades.choiceCount));
      p.choiceDeadlineAt = now + SURVIVOR_CHOICE_TIMEOUT_MS;
    }
  }
  discover(p.id, gear, d);
  d.saveProfiles();
}
export function chooseSurvivorGear(sid: string, user: Participant, gear: string, d: SurvivorDeps) {
  const s = survivorOf(sid), p = s.players[user.id];
  if (!p?.alive || !p.choiceQueue[0]?.includes(gear)) return;
  applySurvivorGear(s, p, gear, d, Date.now());
  send(sid, s, d);
}

export function rerollSurvivorChoice(sid: string, user: Participant, d: SurvivorDeps) {
  const s = survivorOf(sid), p = s.players[user.id];
  const current = p?.choiceQueue[0];
  if (!p?.alive || !current?.length || p.rerollsRemaining <= 0) return;
  const choices = choicesFor(p, s, [], current, 3 + d.profile(user.id).upgrades.choiceCount);
  if (!choices.length) return;
  p.choiceQueue[0] = choices;
  p.rerollsRemaining--;
  p.choiceDeadlineAt = Date.now() + SURVIVOR_CHOICE_TIMEOUT_MS;
  send(sid, s, d);
}

function createEnemy(s: SurvivorState, kind: SurvivorEnemy['kind'], now: number, at?: { x: number; z: number }): SurvivorEnemy {
  const stats: Record<SurvivorEnemy['kind'], { hp: number; speed: number; damage: number; xp: number; radius: number }> = {
    ghoul: { hp: 18, speed: 1.15, damage: 7, xp: 2, radius: 0.32 },
    bat: { hp: 10, speed: 2, damage: 5, xp: 2, radius: 0.25 },
    knight: { hp: 55, speed: 0.72, damage: 14, xp: 5, radius: 0.42 },
    charger: { hp: 34, speed: 0.95, damage: 13, xp: 4, radius: 0.36 },
    wisp: { hp: 17, speed: 1.7, damage: 6, xp: 3, radius: 0.28 },
    slinger: { hp: 28, speed: 0.78, damage: 9, xp: 4, radius: 0.34 },
    splitter: { hp: 68, speed: 0.78, damage: 12, xp: 6, radius: 0.48 },
    shifter: { hp: 32, speed: 1.2, damage: 11, xp: 4, radius: 0.32 },
    pack: { hp: 23, speed: 1.35, damage: 8, xp: 3, radius: 0.3 },
    bulwark: { hp: 105, speed: 0.5, damage: 18, xp: 8, radius: 0.52 },
    boss: { hp: 34_000, speed: 1.05, damage: 28, xp: 0, radius: 1.25 },
  };
  const base = stats[kind];
  const angle = random(s) * Math.PI * 2;
  const spawnRadius = SURVIVOR_WORLD_LIMIT - (kind === 'boss' ? 1.5 : 0.75);
  const position = at ?? { x: Math.cos(angle) * spawnRadius, z: Math.sin(angle) * spawnRadius };
  const hpStage = Math.floor(Math.max(0, now - s.startedAt) / 60_000);
  const strengthStage = kind === 'boss' ? 0 : Math.floor(Math.max(0, now - s.startedAt) / 120_000);
  const hpScale = 1 + hpStage * 0.55;
  const damageScale = kind === 'boss' ? 1 : 1 + strengthStage * 0.4;
  const speedScale = kind === 'boss' ? 1 : Math.min(1.8, 1 + strengthStage * 0.07);
  const hp = Math.round(base.hp * ENEMY_HP_MULTIPLIER * hpScale);
  return {
    id: `e${s.run}-${++s.spawnIndex}`, kind, ...position,
    hp, maxHp: hp, speed: base.speed * speedScale, damage: Math.round(base.damage * damageScale), xp: base.xp, radius: base.radius,
    armor: kind === 'bulwark' ? 0.52 : 0, hpStage, strengthStage,
    hitAt: 0, attackAt: now,
    nextSpecialAt: kind === 'boss' ? now + 5_000 : kind === 'charger' ? now + 4_500 : kind === 'slinger' ? now + 2_000 : kind === 'shifter' ? now + 5_500 : 0,
    dashFrom: null, dashUntil: 0, movePhase: random(s) * Math.PI * 2, chargeTarget: null, chargeUntil: 0,
  };
}
type WeaponConfig = { interval: number; range: number; damage: number; aoe?: number; targets?: number; pierce?: boolean; chain?: boolean; chainRange?: number; fan?: boolean; fanAngle?: number; centered?: boolean };
// 武器ごとの設定は不変なので、呼び出しごとの組み直しを避けてモジュール定数に置く（中身は従来の関数内リテラルと同一）
const WEAPON_CONFIGS: Record<string, WeaponConfig> = {
  moonblade: { interval: 650, range: 2.3, damage: 16, targets: 1 },
  starbolt: { interval: 1050, range: 8.5, damage: 15, targets: 1 },
  shade: { interval: 1200, range: 7, damage: 17, targets: 3 },
  bloodaura: { interval: 650, range: 2.7, damage: 11, aoe: 2.7 },
  eclipse: { interval: 420, range: 3.2, damage: 30, aoe: 3.2 },
  starfall: { interval: 1000, range: 9.5, damage: 35, aoe: 2.8 },
  umbralstorm: { interval: 850, range: 8.2, damage: 27, targets: 8 },
  crimsonsun: { interval: 500, range: 3.7, damage: 19, aoe: 3.7 },
  frostlance: { interval: 1_050, range: 8.2, damage: 22, targets: 5, pierce: true },
  stormring: { interval: 1_300, range: 7.5, damage: 14, targets: 5, chain: true, chainRange: 4.2 },
  embermine: { interval: 1_450, range: 7, damage: 26, aoe: 2.8 },
  thornshot: { interval: 900, range: 9.5, damage: 13, targets: 4, fan: true, fanAngle: 0.42 },
  voidpulse: { interval: 780, range: 3.5, damage: 21, aoe: 3.5, centered: true },
  lunarconvergence: { interval: 400, range: 4.8, damage: 95, aoe: 4.8, centered: true },
  crimsonvoid: { interval: 360, range: 14, damage: 92, targets: 16, pierce: true },
  stormfrost: { interval: 590, range: 18, damage: 185, targets: 22, pierce: true },
  astralbarrage: { interval: 250, range: 15, damage: 78, targets: 14 },
  soulreaper: { interval: 600, range: 8, damage: 165, aoe: 7.2 },
  thunderweb: { interval: 650, range: 15, damage: 125, targets: 18, chain: true, chainRange: 6.5 },
  infernomine: { interval: 820, range: 14, damage: 205, aoe: 6.8 },
  thornstorm: { interval: 440, range: 16, damage: 82, targets: 18, fan: true, fanAngle: 0.9 },
  lunarvoid: { interval: 640, range: 8, damage: 180, aoe: 8, centered: true },
};

function weaponAttack(s: SurvivorState, p: SurvivorPlayer, gear: string, level: number, now: number, d: SurvivorDeps) {
  const cfg = WEAPON_CONFIGS[gear];
  if (!cfg) return;
  const styleHaste = p.style === 'stargazer' ? 0.9 : 1;
  const passiveHaste = Math.max(0.4, (1 - (p.gear.astralbook ?? 0) * 0.07) * styleHaste);
  // クールダウン中は何もしないので、プロフィール取得は実際に攻撃するときだけにする
  if (now < (p.attackAt[gear] ?? 0) + cfg.interval * passiveHaste) return;
  const profile = d.profile(p.id);
  p.attackAt[gear] = now;
  const range = cfg.range * (1 + (p.gear.huntsigil ?? 0) * 0.05);
  const areaRadius = cfg.aoe ? cfg.aoe * (1 + (p.gear.pyreseed ?? 0) * 0.05) : 0;
  const targets = s.enemies.filter((e) => e.hp > 0 && survivorDistance(e, p) <= range).sort((a, b) => survivorDistance(a, p) - survivorDistance(b, p));
  if (!targets.length) return;
  const raw = cfg.damage * (1 + (level - 1) * 0.18 + profile.upgrades.might * 0.05)
    * (gear === 'frostlance' ? 1 + (p.gear.frostcore ?? 0) * 0.08 : 1)
    * (cfg.aoe ? 1 + (p.gear.pyreseed ?? 0) * 0.06 : 1);
  let chosen: SurvivorEnemy[];
  if (cfg.centered) {
    chosen = s.enemies.filter((e) => e.hp > 0 && survivorDistance(e, p) <= areaRadius);
  } else if (cfg.aoe) {
    chosen = s.enemies.filter((e) => e.hp > 0 && survivorDistance(e, targets[0]) <= areaRadius);
  } else if (cfg.pierce) {
    const aim = targets[0];
    const dx = aim.x - p.x, dz = aim.z - p.z;
    const length = Math.hypot(dx, dz) || 1;
    const end = { x: p.x + dx / length * range, z: p.z + dz / length * range };
    chosen = s.enemies
      .filter((e) => {
        if (e.hp <= 0) return false;
        const projection = ((e.x - p.x) * dx + (e.z - p.z) * dz) / length;
        return projection >= 0 && projection <= range && pointSegmentDistance(e, p, end) <= e.radius + 0.24;
      })
      .sort((a, b) => survivorDistance(a, p) - survivorDistance(b, p))
      .slice(0, cfg.targets ?? 5);
  } else if (cfg.chain) {
    chosen = [targets[0]];
    const chainRange = (cfg.chainRange ?? 4) + (gear === 'stormring' ? (p.gear.coppercoil ?? 0) * 0.45 : 0);
    while (chosen.length < (cfg.targets ?? 1)) {
      const previous = chosen[chosen.length - 1];
      const next = s.enemies
        .filter((e) => e.hp > 0 && !chosen.includes(e) && survivorDistance(e, previous) <= chainRange)
        .sort((a, b) => survivorDistance(a, previous) - survivorDistance(b, previous))[0];
      if (!next) break;
      chosen.push(next);
    }
  } else if (cfg.fan) {
    const aimAngle = Math.atan2(targets[0].z - p.z, targets[0].x - p.x);
    chosen = targets.filter((e) => {
      const angle = Math.atan2(e.z - p.z, e.x - p.x);
      const delta = Math.atan2(Math.sin(angle - aimAngle), Math.cos(angle - aimAngle));
      return Math.abs(delta) <= (cfg.fanAngle ?? 0.42);
    }).slice(0, cfg.targets ?? 4);
  } else {
    chosen = targets.slice(0, cfg.targets ?? 1);
  }
  if (chosen.length) {
    s.effects.push({
      id: `${s.run}-${p.id}-${gear}-${now}`,
      playerId: p.id,
      gear,
      at: now,
      from: { x: p.x, z: p.z },
      targets: chosen.map((e) => ({ x: e.x, z: e.z })),
      reach: cfg.aoe ? areaRadius : Math.max(...chosen.map((e) => survivorDistance(p, e))),
      ...(cfg.aoe ? { areaCenter: cfg.centered ? { x: p.x, z: p.z } : { x: targets[0].x, z: targets[0].z } } : {}),
      ...(cfg.chain ? { chain: true } : {}),
    });
  }
  for (const e of chosen) {
    if (e.hp <= 0) continue;
    e.hp -= raw * (1 - e.armor);
    e.hitAt = now;
    if (e.hp <= 0) {
      p.kills++;
      s.kills++;
      if (e.kind === 'boss') s.bossDefeated = true;
      else giveXp(s, d, e.xp, now);
      if (e.kind === 'splitter') {
        for (const offset of [-1, 1]) {
          if (s.enemies.length >= SURVIVOR_MAX_ENEMIES) break;
          const fragment = createEnemy(s, 'bat', now, clampSurvivorPosition(e.x + offset * 0.48, e.z + offset * 0.34));
          fragment.hp = fragment.maxHp = Math.max(1, Math.ceil(fragment.hp * 0.55));
          fragment.damage = Math.max(1, Math.ceil(fragment.damage * 0.7));
          fragment.xp = 1;
          fragment.radius = 0.18;
          s.enemies.push(fragment);
        }
      }
    }
  }
}

function addAchievement(profile: SurvivorProfile, id: SurvivorAchievement) {
  if (!profile.achievements.includes(id)) profile.achievements.push(id);
}
function finish(sid: string, s: SurvivorState, d: SurvivorDeps, now: number) {
  if (s.phase === 'ended') return;
  s.phase = 'ended'; s.endedAt = now;
  s.pausedAt = null;
  for (const p of Object.values(s.players)) {
    const profile = d.profile(p.id);
    profile.points += survivorRunReward(p.level, p.gear.moonshard ?? 0);
    profile.runs++;
    profile.bestLevel = Math.max(profile.bestLevel, p.level);
    profile.bestKills = Math.max(profile.bestKills, p.kills);
    addAchievement(profile, 'firstNight');
    if (p.level >= 10) addAchievement(profile, 'level10');
    if (p.level >= 25) addAchievement(profile, 'level25');
    if (s.bossDefeated) addAchievement(profile, 'boss');
    d.profileUpdated(p.id, profile);
  }
  d.saveProfiles();
  send(sid, s, d);
}

/** Called by the server on a fixed interval; the run state is authoritative. */
export function tickSurvivors(now: number, d: SurvivorDeps) {
  for (const [sid, s] of states) {
    if (s.phase !== 'running' && s.phase !== 'boss') continue;
    let choiceResolved = false;
    for (const p of Object.values(s.players)) {
      if (!p.alive || !p.choiceQueue.length) continue;
      if (p.choiceDeadlineAt == null) {
        p.choiceDeadlineAt = now + SURVIVOR_CHOICE_TIMEOUT_MS;
        continue;
      }
      if (now < p.choiceDeadlineAt) continue;
      let options = p.choiceQueue[0].filter((id) => poolFor(p).includes(id));
      if (!options.length) {
        options = choicesFor(p, s, [], [], 3 + d.profile(p.id).upgrades.choiceCount);
        if (options.length) p.choiceQueue[0] = options;
        else {
          p.choiceQueue.shift();
          p.choiceDeadlineAt = p.choiceQueue.length ? now + SURVIVOR_CHOICE_TIMEOUT_MS : null;
          choiceResolved = true;
          continue;
        }
      }
      const selected = options.splice(Math.floor(random(s) * options.length), 1)[0];
      applySurvivorGear(s, p, selected, d, now);
      choiceResolved = true;
    }
    if (choiceResolved) d.saveProfiles();
    if (s.pausedAt != null) {
      if (hasPendingChoice(s)) {
        if (choiceResolved) send(sid, s, d);
        continue;
      }
      const pausedFor = Math.max(0, now - s.pausedAt);
      s.startedAt += pausedFor;
      s.nextSpawnAt += pausedFor;
      for (const p of Object.values(s.players)) {
        p.moveAt += pausedFor;
        if (p.hitAt > 0) p.hitAt += pausedFor;
        for (const gear of Object.keys(p.attackAt)) p.attackAt[gear] += pausedFor;
      }
      for (const enemy of s.enemies) {
        enemy.attackAt += pausedFor;
        if (enemy.hitAt > 0) enemy.hitAt += pausedFor;
        if (enemy.nextSpecialAt > 0) enemy.nextSpecialAt += pausedFor;
        if (enemy.dashUntil > 0) enemy.dashUntil += pausedFor;
        if (enemy.chargeUntil > 0) enemy.chargeUntil += pausedFor;
      }
      if (s.spawnGrowthPausedAt != null) {
        s.spawnGrowthPausedAt += pausedFor;
        s.spawnGrowthPausedUntil += pausedFor;
      }
      for (const projectile of s.projectiles) projectile.expiresAt += pausedFor;
      s.pausedAt = null;
    } else if (hasPendingChoice(s)) {
      s.pausedAt = now;
      send(sid, s, d);
      continue;
    }
    if (s.spawnGrowthPausedAt != null && now >= s.spawnGrowthPausedUntil) {
      s.spawnGrowthPausedMs += Math.max(0, s.spawnGrowthPausedUntil - s.spawnGrowthPausedAt);
      s.spawnGrowthPausedAt = null;
      s.spawnGrowthPausedUntil = 0;
    }
    s.effects = s.effects.filter((effect) => now - effect.at <= 900);
    const users = d.users(sid), avatars = d.avatars(sid);
    const elapsed = now - s.startedAt;
    if (elapsed >= SURVIVOR_DURATION_MS && s.phase === 'running') {
      s.phase = 'boss';
      s.enemies.push(createEnemy(s, 'boss', now));
      s.bossesSpawned = 1;
    }
    if (s.phase === 'boss') {
      while (elapsed >= SURVIVOR_DURATION_MS + s.bossesSpawned * 30_000) {
        s.enemies.push(createEnemy(s, 'boss', now));
        s.bossesSpawned++;
      }
    }
    const hpStage = Math.floor(elapsed / 60_000);
    const strengthStage = Math.floor(elapsed / 120_000);
    for (const enemy of s.enemies) {
      const previousHpStage = enemy.hpStage ?? hpStage;
      if (previousHpStage < hpStage) {
        const previousHpScale = 1 + previousHpStage * 0.55;
        const nextHpScale = 1 + hpStage * 0.55;
        enemy.hp = Math.max(1, Math.round(enemy.hp * nextHpScale / previousHpScale));
        enemy.maxHp = Math.max(1, Math.round(enemy.maxHp * nextHpScale / previousHpScale));
      }
      enemy.hpStage = hpStage;
      if (enemy.kind === 'boss' || enemy.strengthStage >= strengthStage) continue;
      const previousDamageScale = 1 + enemy.strengthStage * 0.4;
      const nextDamageScale = 1 + strengthStage * 0.4;
      const previousSpeedScale = Math.min(1.8, 1 + enemy.strengthStage * 0.07);
      const nextSpeedScale = Math.min(1.8, 1 + strengthStage * 0.07);
      enemy.damage = Math.max(1, Math.round(enemy.damage * nextDamageScale / previousDamageScale));
      enemy.speed *= nextSpeedScale / previousSpeedScale;
      enemy.strengthStage = strengthStage;
    }
    for (const p of Object.values(s.players)) {
      if (!p.alive) continue;
      const regeneration = d.profile(p.id).upgrades.regeneration;
      if (regeneration > 0) p.hp = Math.min(p.maxHp, p.hp + regeneration * SURVIVOR_TICK_MS / 60_000);
      const u = users.find((x) => x.id === p.id);
      if (u?.mode === '3d') {
        const avatar = avatars.get(p.id);
        if (avatar) Object.assign(p, clampSurvivorPosition(avatar.x, avatar.z));
      }
    }
    const alive = Object.values(s.players).filter((p) => p.alive);
    if (!alive.length) { finish(sid, s, d, now); continue; }
    const growthPauseElapsed = s.spawnGrowthPausedAt == null ? 0 : Math.min(now, s.spawnGrowthPausedUntil) - s.spawnGrowthPausedAt;
    const spawnGrowthElapsed = Math.max(0, elapsed - s.spawnGrowthPausedMs - growthPauseElapsed);
    const spawnGrowthStage = Math.floor(spawnGrowthElapsed / 60_000);
    const partySize = Math.max(1, Object.keys(s.players).length);
    if (now >= s.nextSpawnAt && s.enemies.length < SURVIVOR_MAX_ENEMIES) {
      const seconds = elapsed / 1000;
      const growthSeconds = spawnGrowthElapsed / 1000;
      const partyScale = 1 + Math.min(2.5, (partySize - 1) * 0.3);
      const baseWaveCount = elapsed < 60_000 ? 2 : 4 + spawnGrowthStage * 2;
      const count = Math.min(24, Math.ceil(baseWaveCount * partyScale));
      for (let i = 0; i < count && s.enemies.length < SURVIVOR_MAX_ENEMIES; i++) {
        const roll = random(s);
        const kind: SurvivorEnemy['kind'] = seconds >= 240
          ? roll < 0.12 ? 'charger' : roll < 0.22 ? 'wisp' : roll < 0.32 ? 'slinger'
            : roll < 0.41 ? 'splitter' : roll < 0.49 ? 'shifter' : roll < 0.57 ? 'pack'
              : roll < 0.65 ? 'bulwark' : roll < 0.78 ? 'knight' : roll < 0.9 ? 'bat' : 'ghoul'
          : seconds >= 180 ? roll < 0.14 ? 'wisp' : roll < 0.27 ? 'slinger' : roll < 0.37 ? 'splitter' : roll < 0.52 ? 'bat' : 'ghoul'
            : seconds >= 120 ? roll < 0.12 ? 'slinger' : roll < 0.42 ? 'bat' : 'ghoul'
              : seconds >= 90 && roll < 0.56 ? 'bat' : 'ghoul';
        s.enemies.push(createEnemy(s, kind, now));
      }
      s.nextSpawnAt = now + Math.max(650, 1050 - growthSeconds * 1.2);
    }
    const packCellSize = 4;
    const packBuckets = new Map<string, SurvivorEnemy[]>();
    const packCellKey = (x: number, z: number) => `${Math.floor(x / packCellSize)}:${Math.floor(z / packCellSize)}`;
    const addPackToIndex = (enemy: SurvivorEnemy) => {
      const key = packCellKey(enemy.x, enemy.z);
      const bucket = packBuckets.get(key);
      if (bucket) bucket.push(enemy);
      else packBuckets.set(key, [enemy]);
    };
    const removePackFromIndex = (enemy: SurvivorEnemy) => {
      const key = packCellKey(enemy.x, enemy.z);
      const bucket = packBuckets.get(key);
      const index = bucket?.indexOf(enemy) ?? -1;
      if (bucket && index >= 0) {
        bucket.splice(index, 1);
        if (!bucket.length) packBuckets.delete(key);
      }
    };
    for (const enemy of s.enemies) if (enemy.kind === 'pack') addPackToIndex(enemy);
    const nearbyPackCount = (enemy: SurvivorEnemy) => {
      const cellX = Math.floor(enemy.x / packCellSize), cellZ = Math.floor(enemy.z / packCellSize);
      let count = 0;
      for (let x = cellX - 1; x <= cellX + 1; x++) for (let z = cellZ - 1; z <= cellZ + 1; z++) {
        for (const other of packBuckets.get(`${x}:${z}`) ?? []) {
          if (other !== enemy && survivorDistance(other, enemy) < packCellSize) count++;
        }
      }
      return count;
    };
    let playerWasHit = false;
    for (const e of s.enemies) {
      if (e.hp <= 0) continue;
      let target: SurvivorPlayer | undefined;
      let nearestDistance = Infinity;
      for (const player of alive) {
        if (!player.alive) continue;
        const distance = survivorDistance(player, e);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          target = player;
        }
      }
      if (!target) continue;
      if (e.kind === 'charger' && !e.chargeTarget && now >= e.nextSpecialAt) {
        e.chargeTarget = { x: target.x, z: target.z };
        e.chargeUntil = now + 700;
        e.nextSpecialAt = now + 7_000;
      }
      if (e.kind === 'charger' && e.chargeTarget) {
        if (now < e.chargeUntil) continue;
        const from = { x: e.x, z: e.z };
        const dx = e.chargeTarget.x - e.x, dz = e.chargeTarget.z - e.z;
        const distance = Math.hypot(dx, dz) || 1;
        const landing = clampSurvivorPosition(e.chargeTarget.x + dx / distance * 1.5, e.chargeTarget.z + dz / distance * 1.5);
        e.dashFrom = from;
        e.x = landing.x; e.z = landing.z;
        e.dashUntil = now + 480;
        e.chargeTarget = null;
        e.chargeUntil = 0;
        for (const player of alive) {
          if (!player.alive || pointSegmentDistance(player, from, landing) > e.radius + 0.5) continue;
          const hitCooldown = Math.max(250, 550 - (player.gear.nightcloak ?? 0) * 60);
          if (now < player.hitAt + hitCooldown) continue;
          const armor = Math.min(0.4, (player.gear.ironheart ?? 0) * 0.06);
          player.hp -= e.damage * 2.2 * (1 - armor);
          player.hitAt = now;
          playerWasHit = true;
          if (player.hp <= 0) { player.hp = 0; player.alive = false; }
        }
        continue;
      }
      if (e.kind === 'boss' && now >= e.nextSpecialAt) {
        const dx = target.x - e.x, dz = target.z - e.z;
        const distance = Math.hypot(dx, dz) || 1;
        const from = { x: e.x, z: e.z };
        const landing = clampSurvivorPosition(target.x - dx / distance * 0.9, target.z - dz / distance * 0.9);
        e.dashFrom = from;
        e.x = landing.x; e.z = landing.z;
        e.dashUntil = now + 520;
        e.nextSpecialAt = now + 5_000;
        e.attackAt = now;
        const armor = Math.min(0.4, (target.gear.ironheart ?? 0) * 0.06);
        target.hp -= e.damage * 2.4 * (1 - armor);
        target.hitAt = now;
        playerWasHit = true;
        if (target.hp <= 0) { target.hp = 0; target.alive = false; }
        const volleySize = 16;
        const angleOffset = random(s) * Math.PI * 2;
        for (let i = 0; i < volleySize; i++) {
          const angle = angleOffset + i * Math.PI * 2 / volleySize;
          const speed = 5.8;
          s.projectiles.push({
            id: `${e.id}-bullet-${now}-${i}`, sourceId: e.id, kind: 'boss', x: e.x, z: e.z,
            vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed,
            damage: 23, radius: 0.2, expiresAt: now + 5_000,
          });
        }
      }
      if (e.kind === 'shifter' && now >= e.nextSpecialAt) {
        const from = { x: e.x, z: e.z };
        let dx = e.x - target.x, dz = e.z - target.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.001) { dx = Math.cos(e.movePhase); dz = Math.sin(e.movePhase); }
        const length = Math.hypot(dx, dz) || 1;
        const landing = clampSurvivorPosition(target.x + dx / length * 1.7, target.z + dz / length * 1.7);
        e.dashFrom = from;
        e.x = landing.x; e.z = landing.z;
        e.dashUntil = now + 650;
        e.nextSpecialAt = now + 5_500;
      }
      let dist = survivorDistance(target, e);
      if (e.kind === 'slinger' && now >= e.nextSpecialAt && dist <= 10) {
        const baseAngle = Math.atan2(target.z - e.z, target.x - e.x);
        for (const spread of [-0.12, 0, 0.12]) {
          const angle = baseAngle + spread;
          const speed = 4.5;
          s.projectiles.push({
            id: `${e.id}-shot-${now}-${spread}`, sourceId: e.id, kind: 'slinger', x: e.x, z: e.z,
            vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed,
            damage: Math.round(e.damage * 1.15), radius: 0.15, expiresAt: now + 4_000,
          });
        }
        e.nextSpecialAt = now + 2_600;
        e.attackAt = now;
      }
      dist = survivorDistance(target, e);
      const slingerRetreat = e.kind === 'slinger' && dist < 4.5;
      const slingerAdvance = e.kind === 'slinger' && dist > 7;
      if (slingerRetreat || slingerAdvance || (e.kind !== 'slinger' && dist > e.radius + 0.42)) {
        const destinationGap = e.kind === 'slinger' ? (slingerRetreat ? 4.5 - dist : dist - 7) : dist;
        let dirX = dist > 0 ? (target.x - e.x) / dist : Math.cos(e.movePhase);
        let dirZ = dist > 0 ? (target.z - e.z) / dist : Math.sin(e.movePhase);
        if (slingerRetreat) { dirX *= -1; dirZ *= -1; }
        if (e.kind === 'wisp') {
          const weave = Math.sin(now * 0.004 + e.movePhase) * 1.25;
          const zigzagX = dirX * 0.82 - dirZ * weave;
          const zigzagZ = dirZ * 0.82 + dirX * weave;
          const length = Math.hypot(zigzagX, zigzagZ) || 1;
          dirX = zigzagX / length; dirZ = zigzagZ / length;
        }
        if (e.kind === 'shifter') {
          const curve = Math.sin(now * 0.006 + e.movePhase) * 0.7;
          const curvedX = dirX * 0.82 - dirZ * curve;
          const curvedZ = dirZ * 0.82 + dirX * curve;
          const length = Math.hypot(curvedX, curvedZ) || 1;
          dirX = curvedX / length; dirZ = curvedZ / length;
        }
        let packSpeed = 1;
        if (e.kind === 'pack') packSpeed += Math.min(0.6, nearbyPackCount(e) * 0.12);
        const step = Math.min(e.speed * packSpeed * SURVIVOR_TICK_MS / 1000, destinationGap);
        const next = clampSurvivorPosition(e.x + dirX * step, e.z + dirZ * step);
        if (e.kind === 'pack') removePackFromIndex(e);
        Object.assign(e, next);
        if (e.kind === 'pack') addPackToIndex(e);
      } else if (e.kind !== 'slinger' && now >= e.attackAt + 850 && now >= target.hitAt + Math.max(250, 550 - (target.gear.nightcloak ?? 0) * 60)) {
        const armor = Math.min(0.4, (target.gear.ironheart ?? 0) * 0.06);
        target.hp -= e.damage * (1 - armor);
        target.hitAt = e.attackAt = now;
        playerWasHit = true;
        if (target.hp <= 0) { target.hp = 0; target.alive = false; }
      }
    }
    const remainingProjectiles: typeof s.projectiles = [];
    for (const projectile of s.projectiles) {
      if (now >= projectile.expiresAt) continue;
      const next = { x: projectile.x + projectile.vx * SURVIVOR_TICK_MS / 1000, z: projectile.z + projectile.vz * SURVIVOR_TICK_MS / 1000 };
      const target = alive.find((player) => player.alive && pointSegmentDistance(player, projectile, next) <= projectile.radius + 0.42);
      if (target) {
        const hitCooldown = Math.max(250, 550 - (target.gear.nightcloak ?? 0) * 60);
        if (now >= target.hitAt + hitCooldown) {
          const armor = Math.min(0.4, (target.gear.ironheart ?? 0) * 0.06);
          target.hp -= projectile.damage * (1 - armor);
          target.hitAt = now;
          playerWasHit = true;
          if (target.hp <= 0) { target.hp = 0; target.alive = false; }
        }
        continue;
      }
      if (Math.abs(next.x) > SURVIVOR_WORLD_LIMIT + 0.5 || Math.abs(next.z) > SURVIVOR_WORLD_LIMIT + 0.5) continue;
      remainingProjectiles.push({ ...projectile, ...next });
    }
    s.projectiles = remainingProjectiles;
    if (playerWasHit) {
      if (s.spawnGrowthPausedAt == null || now >= s.spawnGrowthPausedUntil) s.spawnGrowthPausedAt = now;
      s.spawnGrowthPausedUntil = now + 30_000;
    }
    for (const p of alive) if (p.alive) for (const [id, level] of Object.entries(p.gear)) if (level > 0 && SURVIVOR_GEAR[id]?.kind === 'weapon') weaponAttack(s, p, id, level, now, d);
    s.enemies = s.enemies.filter((e) => e.hp > 0);
    if (s.bossDefeated || !Object.values(s.players).some((p) => p.alive)) { finish(sid, s, d, now); continue; }
    if (hasPendingChoice(s)) {
      s.pausedAt = now;
    }
    send(sid, s, d);
  }
}

export function upgradeSurvivor(sid: string, id: string, upgrade: SurvivorMetaUpgrade, d: SurvivorDeps) {
  // upgrade はクライアント由来。継承プロパティ（__proto__ 等）を有効扱いしないよう自前プロパティだけを見る
  if (!Object.hasOwn(SURVIVOR_META_UPGRADES, upgrade)) return;
  const def = SURVIVOR_META_UPGRADES[upgrade];
  const profile = d.profile(id);
  const level = profile.upgrades[upgrade];
  const cost = survivorUpgradeCost(upgrade, level);
  if (profile.points < cost || level >= def.max) return;
  profile.points -= cost;
  profile.upgrades[upgrade]++;
  profile.upgradeSpent[upgrade] += cost;
  const s = states.get(sid), player = s?.players[id];
  if (upgrade === 'vitality' && player?.alive && s && (s.phase === 'running' || s.phase === 'boss')) {
    player.maxHp += 20;
    player.hp = Math.min(player.maxHp, player.hp + 20);
    send(sid, s, d);
  } else if (upgrade === 'rerolls' && player?.alive && s && (s.phase === 'running' || s.phase === 'boss')) {
    player.rerollsRemaining++;
    send(sid, s, d);
  } else if (upgrade === 'synergySlots' && player && s && (s.phase === 'running' || s.phase === 'boss')) {
    player.synergyGearSlots = SURVIVOR_BASE_SYNERGY_GEAR + profile.upgrades.synergySlots;
    send(sid, s, d);
  }
  d.saveProfiles();
  d.profileUpdated(id, profile);
}

export function resetSurvivorUpgrades(sid: string, id: string, d: SurvivorDeps) {
  const s = states.get(sid);
  if (s && (s.phase === 'running' || s.phase === 'boss')) return;
  const profile = d.profile(id);
  const upgrades = Object.keys(SURVIVOR_META_UPGRADES) as SurvivorMetaUpgrade[];
  const refund = upgrades.reduce((total, upgrade) => total + profile.upgradeSpent[upgrade], 0);
  if (refund <= 0) return;
  profile.upgrades = Object.fromEntries(upgrades.map((upgrade) => [upgrade, 0])) as SurvivorProfile['upgrades'];
  profile.upgradeSpent = Object.fromEntries(upgrades.map((upgrade) => [upgrade, 0])) as SurvivorProfile['upgradeSpent'];
  profile.points += refund;
  d.saveProfiles();
  d.profileUpdated(id, profile);
}

export function removeSurvivor(sid: string, id: string, d: SurvivorDeps) {
  const s = states.get(sid), p = s?.players[id];
  if (!s || !p || !p.alive || (s.phase !== 'running' && s.phase !== 'boss')) return;
  p.alive = false; p.hp = 0;
  if (!Object.values(s.players).some((x) => x.alive)) finish(sid, s, d, Date.now());
  else send(sid, s, d);
}

