import { BATTLEFIELD, battleClear, battleDistance, battlePath, validBattleInput, type BattleActor, type BattleCommand, type BattleInput, type BattlefieldState } from '../shared/battlefield.ts';
import type { Solid } from '../shared/worlds.ts';
import { TANK } from '../shared/vehicle.ts';

export interface BattlefieldDeps {
  now(): number; random(): number;
  members(sid: string): { id: string }[];
  owner(sid: string): string | undefined;
  solids(sid: string): Solid[];
  publish(sid: string, state: BattlefieldState): void;
}
interface Run { state: BattlefieldState; inputs: Map<string, { input: BattleInput; at: number }>; botNumber: number; routes: Map<string, { at: number; path: { x: number; z: number }[]; target: number }> }
export class Battlefields {
  private runs = new Map<string, Run>();
  constructor(private d: BattlefieldDeps) {}
  state(sid: string): BattlefieldState | null { return this.runs.get(sid)?.state ?? null; }
  publish(sid: string) { const run = this.runs.get(sid); if (run) this.send(sid, run); }
  ensure(sid: string) {
    let run = this.runs.get(sid);
    if (!run) {
      const tanks = Object.fromEntries((['red', 'blue'] as const).map(team => {
        const p = BATTLEFIELD.spawns[team], id = `battlefield-tank-${team}`;
        return [id, { id, x: p.x, z: p.z + (team === 'red' ? -2 : 2), ry: 0, rider: null }];
      }));
      run = { state: { at: this.d.now(), revision: 0, actors: Object.create(null), tanks, bases: BATTLEFIELD.bases.map(b => ({ id: b.id, owner: null, capturing: null, progress: 0 })) }, inputs: new Map(), botNumber: 0, routes: new Map() };
      this.runs.set(sid, run);
    }
    const members = new Set(this.d.members(sid).map(p => p.id));
    for (const p of Object.values(run.state.actors)) if (!p.bot) {
      p.active = members.has(p.id);
      if (!p.active) this.release(sid, run, p);
    }
    for (const id of members) if (!Object.hasOwn(run.state.actors, id)) this.add(sid, run, id, false);
    return run.state;
  }
  private add(sid: string, run: Run, id: string, bot: boolean) {
    const actors = Object.values(run.state.actors).filter(a => a.active);
    const red = actors.filter(a => a.team === 'red').length;
    const team = red <= actors.length - red ? 'red' : 'blue';
    const spawn = this.spawnPosition(run, this.d.solids(sid), BATTLEFIELD.spawns[team]);
    const available = spawn !== undefined;
    run.state.actors[id] = { id, participantId: bot ? null : id, bot, active: true, team, ...(spawn ?? BATTLEFIELD.spawns[team]), aim: team === 'red' ? Math.PI / 2 : -Math.PI / 2,
      hp: available ? 100 : 0, alive: available, respawnAt: available ? null : this.d.now() + BATTLEFIELD.respawnMs, firedAt: -1e9, tank: null };
  }
  private release(sid: string, run: Run, p: BattleActor) {
    if (p.tank && p.alive) {
      const position = this.spawnPosition(run, this.d.solids(sid), p);
      if (position) Object.assign(p, position);
    }
    if (p.tank && run.state.tanks[p.tank]?.rider === p.id) run.state.tanks[p.tank].rider = null;
    p.tank = null; run.inputs.delete(p.id); run.routes.delete(p.id);
  }
  private obstacles(run: Run, solids: Solid[], exclude?: string) {
    return [...solids, ...Object.values(run.state.tanks).filter(t => t.id !== exclude).map(t => ({ x: t.x, z: t.z, r: TANK.radius }))];
  }
  private spawnPosition(run: Run, solids: Solid[], origin: { x: number; z: number }) {
    const obstacles = this.obstacles(run, solids);
    if (battleClear(origin, origin, BATTLEFIELD.radius, obstacles)) return origin;
    const candidates: { x: number; z: number }[] = [];
    for (let x = -9.5; x <= 9.5; x += .5) for (let z = -9.5; z <= 9.5; z += .5) candidates.push({ x, z });
    candidates.sort((a, b) => battleDistance(a, origin) - battleDistance(b, origin));
    return candidates.find(p => battleClear(p, p, BATTLEFIELD.radius, obstacles));
  }
  leave(sid: string, id: string) {
    const run = this.runs.get(sid), p = run?.state.actors[id];
    if (run && p) { this.release(sid, run, p); p.active = false; this.send(sid, run); }
  }
  clear(sid: string) { this.runs.delete(sid); }
  // sid と本人IDは認証済みのセッション経路だけから渡す。
  command(sid: string, id: string, command: BattleCommand): boolean {
    const run = this.runs.get(sid);
    if (!run || !this.d.members(sid).some(p => p.id === id)) return false;
    this.ensure(sid);
    const p = run.state.actors[id];
    if (!p || p.bot) return false;
    if (command.t === 'battleBot') {
      if (this.d.owner(sid) !== id) return false;
      if (command.action === 'add') {
        if (Object.values(run.state.actors).filter(a => a.bot).length >= BATTLEFIELD.botLimit) return false;
        let botId: string;
        do { botId = `battlefield-bot-${++run.botNumber}`; } while (Object.hasOwn(run.state.actors, botId));
        this.add(sid, run, botId, true);
      } else if (command.action === 'remove' && command.id && Object.hasOwn(run.state.actors, command.id) && run.state.actors[command.id].bot) {
        this.release(sid, run, run.state.actors[command.id]); delete run.state.actors[command.id];
      } else return false;
      this.send(sid, run); return true;
    }
    if (!p.active || !p.alive) return false;
    if (command.t === 'battleInput') return this.input(run, p, command.input);
    if (command.t !== 'battleMount') return false;
    if (command.id === null) {
      const tank = p.tank ? run.state.tanks[p.tank] : null;
      if (tank) {
        const solids = this.d.solids(sid), obstacles = this.obstacles(run, solids);
        const distance = TANK.radius + BATTLEFIELD.radius + .1;
        const candidates = Array.from({ length: 16 }, (_, i) => ({ x: tank.x + Math.cos(tank.ry + i * Math.PI / 8) * distance, z: tank.z + Math.sin(tank.ry + i * Math.PI / 8) * distance }));
        const exit = candidates.find(q => battleClear(q, q, BATTLEFIELD.radius, obstacles)
          && battleClear(tank, q, BATTLEFIELD.radius, this.obstacles(run, solids, tank.id)));
        if (!exit) return false;
        Object.assign(p, exit);
      }
      this.release(sid, run, p); this.send(sid, run); return true;
    }
    if (!Object.hasOwn(run.state.tanks, command.id)) return false;
    const tank = run.state.tanks[command.id];
    if (p.tank || tank.rider || battleDistance(p, tank) > 2.5 || !battleClear(p, tank, BATTLEFIELD.radius, this.d.solids(sid))) return false;
    tank.rider = p.id; p.tank = tank.id; p.x = tank.x; p.z = tank.z;
    run.inputs.delete(id); this.send(sid, run); return true;
  }
  private input(run: Run, p: BattleActor, input: BattleInput) {
    if (!p.alive || !p.active || !validBattleInput(input)) return false;
    if (p.tank && run.state.tanks[p.tank]?.rider !== p.id) return false;
    run.inputs.set(p.id, { input: { ...input }, at: this.d.now() }); return true;
  }
  private send(sid: string, run: Run) { run.state.revision++; this.d.publish(sid, run.state); }
  tick() { for (const sid of this.runs.keys()) this.update(sid); }
  update(sid: string) {
    const run = this.runs.get(sid); if (!run) return;
    this.ensure(sid);
    const s = run.state, now = this.d.now(), dt = Math.min(100, Math.max(0, now - s.at));
    if (!dt) return;
    s.at = now;
    const solids = this.d.solids(sid);
    for (const p of Object.values(s.actors)) {
      if (!p.active) continue;
      if (!p.alive) {
        if (p.respawnAt !== null && now >= p.respawnAt) {
          const spawn = this.spawnPosition(run, solids, BATTLEFIELD.spawns[p.team]);
          if (spawn) Object.assign(p, spawn, { hp: 100, alive: true, respawnAt: null });
        }
        continue;
      }
      if (p.bot) this.bot(sid, run, p, solids, now);
      const command = run.inputs.get(p.id);
      if (!command || now - command.at > 250) continue;
      const i = command.input; p.aim = i.aim;
      const tank = p.tank ? s.tanks[p.tank] : null;
      const radius = tank ? TANK.radius : BATTLEFIELD.radius;
      const speed = tank ? TANK.speed : BATTLEFIELD.speed;
      const next = { x: p.x + i.x * speed * dt / 1000, z: p.z + i.z * speed * dt / 1000 };
      if (battleClear(p, next, radius, this.obstacles(run, solids, p.tank ?? undefined))) { p.x = next.x; p.z = next.z; }
      if (tank) { tank.x = p.x; tank.z = p.z; tank.ry = p.aim; }
      if (i.fire && now - p.firedAt >= (tank ? TANK.fireMs : BATTLEFIELD.fireMs)) {
        p.firedAt = now;
        const dx = -Math.sin(p.aim), dz = -Math.cos(p.aim);
        const targets = Object.values(s.actors).filter(q => q.active && q.alive && q.team !== p.team)
          .map(q => ({ q, distance: battleDistance(p, q), along: (q.x - p.x) * dx + (q.z - p.z) * dz,
            across: Math.abs((q.x - p.x) * dz - (q.z - p.z) * dx) }))
          .filter(t => t.along > 0 && t.distance <= BATTLEFIELD.range && t.across <= (t.q.tank ? TANK.radius : 0.45)
            && battleClear(p, t.q, 0, [...solids, ...Object.values(s.tanks).filter(k => k.id !== p.tank && k.id !== t.q.tank).map(k => ({ x: k.x, z: k.z, r: TANK.radius }))]))
          .sort((a, b) => a.along - b.along);
        const target = targets[0]?.q;
        if (target) {
          target.hp = Math.max(0, target.hp - (tank ? TANK.damage : BATTLEFIELD.damage));
          if (!target.hp) { target.alive = false; target.respawnAt = now + BATTLEFIELD.respawnMs; this.release(sid, run, target); }
        }
      }
    }
    for (const base of s.bases) {
      const location = BATTLEFIELD.bases.find(b => b.id === base.id)!;
      const teams = new Set(Object.values(s.actors).filter(p => p.active && p.alive && battleDistance(p, location) <= location.r).map(p => p.team));
      const team = teams.size === 1 ? [...teams][0] : null;
      if (!team || team === base.owner) { base.capturing = null; base.progress = 0; }
      else {
        if (base.capturing !== team) { base.capturing = team; base.progress = 0; }
        base.progress += dt;
        if (base.progress >= BATTLEFIELD.captureMs) { base.owner = team; base.capturing = null; base.progress = 0; }
      }
    }
    this.send(sid, run);
  }
  private bot(sid: string, run: Run, p: BattleActor, solids: Solid[], now: number) {
    const enemies = Object.values(run.state.actors).filter(q => q.active && q.alive && q.team !== p.team)
      .sort((a, b) => battleDistance(p, a) - battleDistance(p, b));
    const enemy = enemies.find(q => battleDistance(p, q) <= BATTLEFIELD.range && battleClear(p, q, 0, this.obstacles(run, solids, q.tank ?? undefined)));
    const movementSolids = this.obstacles(run, solids);
    let route = run.routes.get(p.id);
    if (!route || now - route.at >= 750 || !route.path.length) {
      const candidates = BATTLEFIELD.bases.map((b, index) => ({ b, index, priority: run.state.bases[index].owner === p.team ? 100 : 0 }))
        .sort((a, b) => a.priority - b.priority || battleDistance(p, a.b) - battleDistance(p, b.b));
      // 同距離の目標だけを乱数で分散する。時刻と乱数は外から固定できる。
      if (this.d.random() < 0.25) candidates.reverse();
      for (const candidate of candidates) {
        const path = battlePath(p, candidate.b, movementSolids);
        if (path.length) { route = { at: now, path, target: candidate.index }; run.routes.set(p.id, route); break; }
      }
      if (!route || now - route.at >= 750) {
        run.routes.delete(p.id);
        this.input(run, p, { x: 0, z: 0, aim: enemy ? Math.atan2(-(enemy.x - p.x), -(enemy.z - p.z)) : p.aim, fire: !!enemy });
        return;
      }
    }
    while (route.path.length > 1 && battleDistance(p, route.path[0]) < 0.15) route.path.shift();
    const to = route.path[0];
    const d = to ? battleDistance(p, to) : 0;
    const step = Math.min(1, d / (BATTLEFIELD.speed * 0.05));
    const x = to && d > 0.1 ? (to.x - p.x) / d * step : 0, z = to && d > 0.1 ? (to.z - p.z) / d * step : 0;
    const aim = enemy ? Math.atan2(-(enemy.x - p.x), -(enemy.z - p.z)) : d ? Math.atan2(-x, -z) : p.aim;
    this.input(run, p, { x, z, aim, fire: !!enemy });
  }
}
