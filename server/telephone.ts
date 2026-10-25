import type { Item } from '../shared/items.ts';
import { emptyTelephoneView, telephoneChain, telephoneDuration, telephoneKind, TELEPHONE_MAX_POINTS, TELEPHONE_MAX_STROKES,
  type TelephoneAction, type TelephoneAnswer, type TelephoneEntry, type TelephoneParticipant, type TelephoneView } from '../shared/telephone.ts';

export interface TelephoneGame {
  registered: TelephoneParticipant[];
  participants: TelephoneParticipant[];
  host: string | null;
  round: number;
  phase: TelephoneView['phase'];
  step: number;
  deadline: number | null;
  chains: TelephoneEntry[][];
  revealed: number;
  page: number;
}
type TelephoneItem = Extract<Item, { kind: 'telephone' }> & { telephoneState?: TelephoneGame };
export const newTelephoneGame = (): TelephoneGame => ({ registered: [], participants: [], host: null, round: 0,
  phase: 'lobby', step: 0, deadline: null, chains: [], revealed: 0, page: 0 });
export const telephoneState = (item: TelephoneItem) => item.telephoneState ??= newTelephoneGame();
export const hasTelephoneHistory = (items: Iterable<Item>) => [...items].some(it => it.kind === 'telephone' && telephoneState(it).round > 0);

export function registeredPresent(g: TelephoneGame, present: ReadonlySet<string>) {
  return g.registered.filter(p => p.kind === 'human' && present.has(p.id));
}
export function registerTelephone(g: TelephoneGame, person: TelephoneParticipant, registered: boolean) {
  const index = g.registered.findIndex(p => p.id === person.id);
  if (registered === (index >= 0)) return false;
  if (registered) g.registered.push({ id: person.id, name: person.name, kind: 'human' });
  else g.registered.splice(index, 1);
  return true;
}
export function reconcileTelephoneHost(g: TelephoneGame, present: ReadonlySet<string>, rng: () => number) {
  if (g.phase === 'lobby') return false;
  const candidates = registeredPresent(g, present);
  if (candidates.some(p => p.id === g.host)) return false;
  const host = candidates.length ? candidates[Math.floor(rng() * candidates.length)].id : null;
  if (host === g.host) return false;
  g.host = host;
  return true;
}
export function canStartTelephone(g: TelephoneGame, id: string, present: ReadonlySet<string>) {
  const candidates = registeredPresent(g, present);
  return g.phase !== 'playing' && candidates.length >= 2 && candidates.length <= 30 && candidates.some(p => p.id === id)
    && (g.phase === 'lobby' || !candidates.some(p => p.id === g.host) || g.host === id);
}
export function startTelephone(g: TelephoneGame, id: string, present: ReadonlySet<string>, now: number) {
  if (!canStartTelephone(g, id, present)) return false;
  g.participants = registeredPresent(g, present).map(p => ({ ...p }));
  g.host = id;
  g.round++;
  g.phase = 'playing';
  g.step = 0;
  g.deadline = now + telephoneDuration(0);
  g.chains = g.participants.map(() => []);
  g.revealed = 0;
  g.page = 0;
  return true;
}
function advance(g: TelephoneGame, at: number) {
  for (let i = 0; i < g.participants.length; i++) {
    const chain = g.chains[telephoneChain(i, g.step, g.participants.length)];
    if (!chain[g.step]) chain[g.step] = { by: g.participants[i].id,
      answer: telephoneKind(g.step) === 'text' ? { kind: 'text', text: '' } : { kind: 'drawing', strokes: [] } };
  }
  if (g.step + 1 === g.participants.length) { g.phase = 'results'; g.deadline = null; }
  else { g.step++; g.deadline = at + telephoneDuration(g.step); }
}
export function tickTelephone(g: TelephoneGame, now: number) {
  let changed = false;
  // 再起動やイベントループの遅延でも、元の締切から進める。
  while (g.phase === 'playing' && g.deadline !== null && now >= g.deadline) {
    advance(g, g.deadline);
    changed = true;
  }
  return changed;
}
function validAnswer(value: unknown, step: number): value is TelephoneAnswer {
  if (!value || typeof value !== 'object') return false;
  const v = value as TelephoneAnswer;
  if (telephoneKind(step) === 'text') return v.kind === 'text' && typeof v.text === 'string' && v.text.length <= 1000;
  if (v.kind !== 'drawing' || !Array.isArray(v.strokes) || v.strokes.length > TELEPHONE_MAX_STROKES) return false;
  let points = 0;
  return v.strokes.every(s => s && typeof s.color === 'string' && /^(#[0-9a-f]{6}|erase)$/i.test(s.color)
    && Number.isFinite(s.size) && s.size >= 1 && s.size <= 40 && Array.isArray(s.pts) && s.pts.length >= 2
    && s.pts.length % 2 === 0 && (points += s.pts.length / 2) <= TELEPHONE_MAX_POINTS
    && s.pts.every((n, i) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= (i % 2 ? 450 : 620)));
}
export function submitTelephone(g: TelephoneGame, id: string, round: number, step: number, answer: unknown, now: number) {
  if (g.phase !== 'playing' || round !== g.round || step !== g.step || g.deadline === null || now >= g.deadline) return false;
  const index = g.participants.findIndex(p => p.id === id);
  if (index < 0 || !validAnswer(answer, step)) return false;
  const chain = g.chains[telephoneChain(index, step, g.participants.length)];
  if (chain[step]) return false;
  const clean: TelephoneAnswer = answer.kind === 'text' ? { kind: 'text', text: answer.text }
    : { kind: 'drawing', strokes: answer.strokes.map(s => ({ color: s.color, size: s.size, pts: [...s.pts] })) };
  chain[step] = { by: id, answer: clean };
  if (g.chains.every(c => !!c[step])) advance(g, now);
  return true;
}
export function telephoneAction(g: TelephoneGame, person: TelephoneParticipant, action: TelephoneAction,
  present: ReadonlySet<string>, now: number, rng: () => number) {
  let changed = tickTelephone(g, now);
  if (action.a === 'telephoneRegister' && typeof action.registered === 'boolean') changed = registerTelephone(g, person, action.registered) || changed;
  if (action.a === 'telephoneStart') changed = startTelephone(g, person.id, present, now) || changed;
  if (action.a === 'telephoneSubmit') changed = submitTelephone(g, person.id, action.round, action.step, action.answer, now) || changed;
  if (g.phase === 'results' && g.host === person.id && registeredPresent(g, present).some(p => p.id === person.id)
    && 'round' in action && action.round === g.round) {
    if (action.a === 'telephoneReveal' && g.revealed < g.participants.length ** 2) {
      g.page = g.revealed++;
      changed = true;
    }
    if (action.a === 'telephonePage' && Number.isInteger(action.page) && action.page >= 0 && action.page < g.revealed && action.page !== g.page) {
      g.page = action.page;
      changed = true;
    }
  }
  return reconcileTelephoneHost(g, present, rng) || changed;
}
export function telephoneView(g: TelephoneGame, id: string, present: ReadonlySet<string>): TelephoneView {
  const view: TelephoneView = { ...emptyTelephoneView(), registered: g.registered.map(p => ({ ...p })),
    present: [...present], participants: g.participants.map(p => ({ ...p })), host: g.host, round: g.round,
    phase: g.phase, step: g.step, deadline: g.deadline, revealed: g.revealed, page: g.page };
  if (g.phase === 'playing') {
    view.submitted = g.chains.flatMap(c => c[g.step] ? [c[g.step].by] : []);
    const index = g.participants.findIndex(p => p.id === id);
    if (index >= 0) {
      const chain = telephoneChain(index, g.step, g.participants.length), entries = g.chains[chain];
      view.assignment = { chain, ...(g.step ? { previous: structuredClone(entries[g.step - 1]) } : {}),
        ...(entries[g.step] ? { own: structuredClone(entries[g.step].answer) } : {}) };
    }
  }
  if (g.phase === 'results') {
    for (let n = 0; n < g.revealed; n++) {
      const chain = Math.floor(n / g.participants.length), step = n % g.participants.length;
      view.results.push({ chain, step, entry: structuredClone(g.chains[chain][step]) });
    }
  }
  return view;
}
export function telephoneItemFor(it: Item, id: string, present: ReadonlySet<string>): Item {
  if (it.kind !== 'telephone') return it;
  // 保存用の秘密状態や将来追加されるフィールドを配信に混ぜない。
  return { id: it.id, kind: it.kind, x: it.x, z: it.z, ry: it.ry, createdBy: it.createdBy, updatedBy: it.updatedBy,
    game: telephoneView(telephoneState(it), id, present) };
}
