import type { FantasyActivity, FantasyCharacter, FantasyTravelLeg, FantasyTravelPosition } from './fantasy.ts';
import { FANTASY_LOCATIONS, FANTASY_ROUTES } from './fantasy-data.ts';
import { FANTASY_GATE_HOURS, fantasyHasGate } from './fantasy-gates.ts';

const EPS = 1e-8;
const transports = new Set(['foot', 'carriage', 'ship', 'working-ship', 'airship', 'gate', 'escort']);
const place = (id: string) => FANTASY_LOCATIONS.find(value => value.id === id);
const edge = (from: string, to: string) => FANTASY_ROUTES.find(value => value.from === from && value.to === to || value.from === to && value.to === from);
const passengerTransports = ['ship', 'working-ship', 'airship', 'gate'] as const;
const passengerTransport = (value: unknown): value is NonNullable<FantasyTravelPosition['transport']> => passengerTransports.some(mode => mode === value);
function passengerEdge(position: FantasyTravelPosition, transport: NonNullable<FantasyTravelPosition['transport']>): boolean {
  const route = edge(position.from, position.to);
  return transport === 'gate' ? fantasyHasGate(position.from) && fantasyHasGate(position.to)
    : transport === 'airship' ? !!route && route.mode !== 'gate' : route?.mode === 'sea';
}

export function fantasyTravelContinuation(position: FantasyTravelPosition): { transport: NonNullable<FantasyTravelPosition['transport']>; hours: number } | undefined {
  if (!validFantasyTravelPosition(position)) return;
  const route = edge(position.from, position.to);
  const transport = position.transport ?? (route?.mode === 'sea' && position.fraction > EPS ? 'ship' : undefined);
  if (position.from === position.to || !passengerTransport(transport) || !passengerEdge(position, transport)) return;
  const factor = transport === 'ship' ? .7 : transport === 'working-ship' ? 2.5 : transport === 'airship' ? .2 : 1;
  const hours = position.remainingHours ?? (transport === 'gate' ? FANTASY_GATE_HOURS : route!.hours * factor) * (1 - position.fraction);
  return Number.isFinite(hours) && hours > 0 ? { transport, hours } : undefined;
}

/** Split a server quote into timed, paid legs. Sea itineraries walk on their land legs. */
export function fantasyTravelLegs(path: readonly string[], transport: string, hours: number, cost: number): FantasyTravelLeg[] {
  const raw = path.slice(1).map((to, index) => {
    const from = path[index], route = edge(from, to);
    const mode = ['ship', 'working-ship'].includes(transport) && route?.mode !== 'sea' ? 'foot' : transport;
    const weight = (route?.hours ?? 1) * (mode === 'ship' ? .7 : mode === 'working-ship' ? 2.5 : 1);
    return { from, to, transport: mode, weight };
  });
  const total = raw.reduce((sum, leg) => sum + leg.weight, 0);
  const paid = raw.findIndex(leg => leg.transport !== 'foot');
  return raw.map(({ weight, ...leg }, index) => ({ ...leg, hours: hours * weight / total, cost: index === paid ? cost : 0 }));
}

/** Find the persisted edge/fraction using the legs' actual scheduled durations. */
export function fantasyTravelPosition(activity: Pick<FantasyActivity, 'startedAt' | 'endsAt' | 'travel'>, hour: number): FantasyTravelPosition | undefined {
  const legs = activity.travel?.legs;
  if (!legs?.length) return undefined;
  let elapsed = Math.max(0, Math.min(hour, activity.endsAt) - activity.startedAt);
  for (const leg of legs) {
    if (elapsed < leg.hours - EPS) {
      const start = leg.startFraction ?? 0;
      return { from: leg.from, to: leg.to, fraction: start + (1 - start) * elapsed / leg.hours,
        ...(passengerTransport(leg.transport) ? { transport: leg.transport, remainingHours: leg.hours - elapsed } : {}) };
    }
    // The transfer comparison tolerates rounding; do not carry a tiny negative
    // remainder into the next leg's persisted position fraction.
    elapsed = Math.max(0, elapsed - leg.hours);
  }
  const to = legs.at(-1)!.to;
  return { from: to, to, fraction: 0 };
}

export function fantasyTravelCurrentTransport(activity: Pick<FantasyActivity, 'action' | 'startedAt' | 'endsAt' | 'travel'>, hour: number): string | undefined {
  let elapsed = Math.max(0, hour - activity.startedAt);
  for (const leg of activity.travel?.legs ?? []) {
    if (elapsed < leg.hours - EPS) return leg.transport;
    elapsed -= leg.hours;
  }
  return activity.travel?.legs.at(-1)?.transport ?? (activity.action.type === 'travel' ? activity.action.transport : undefined);
}

export function fantasyTravelPassed(activity: Pick<FantasyActivity, 'startedAt' | 'travel'>, hour: number): string[] {
  let elapsed = Math.max(0, hour - activity.startedAt);
  const passed: string[] = [];
  for (const leg of activity.travel?.legs ?? []) {
    if (elapsed + EPS < leg.hours) break;
    passed.push(leg.to); elapsed -= leg.hours;
  }
  return passed;
}

export function fantasyTravelPoint(position: FantasyTravelPosition): { x: number; y: number } | undefined {
  const from = place(position.from), to = place(position.to);
  return from && to ? { x: from.x + (to.x - from.x) * position.fraction, y: from.y + (to.y - from.y) * position.fraction } : undefined;
}

/** Retain one common party arrival without changing the path or charging another fare. */
export function fantasyTravelRescale(activity: FantasyActivity, endsAt: number): void {
  const old = activity.endsAt - activity.startedAt, duration = endsAt - activity.startedAt;
  if (!(duration > 0) || !(old > 0)) return;
  if (activity.travel) for (const leg of activity.travel.legs) leg.hours *= duration / old;
  activity.endsAt = endsAt;
}

// 到着だけでなく経由地点でも隊列を保ち、各自の運賃と移動手段は変更しない。
export function fantasyTravelPartyPace(activities: readonly FantasyActivity[]): number | undefined {
  if (!activities.length) return undefined;
  const pace = activities.reduce((slowest, activity) => activity.endsAt > slowest.endsAt ? activity : slowest);
  const legs = pace.travel?.legs;
  if (!legs?.length || activities.some(activity => activity.action.type !== 'travel'
    || Math.abs(activity.startedAt - pace.startedAt) > EPS
    || activity.travel?.legs.length !== legs.length
    || activity.travel.legs.some((leg, index) => leg.from !== legs[index].from || leg.to !== legs[index].to
      || Math.abs((leg.startFraction ?? 0) - (legs[index].startFraction ?? 0)) > EPS))) return undefined;
  const hours = legs.map(leg => leg.hours);
  for (const activity of activities) {
    activity.travel!.legs.forEach((leg, index) => { leg.hours = hours[index]; });
    activity.endsAt = pace.endsAt;
  }
  return pace.endsAt;
}

export function validFantasyTravelPosition(value: unknown): value is FantasyTravelPosition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as FantasyTravelPosition;
  return Object.keys(p).every(key => ['from', 'to', 'fraction', 'transport', 'remainingHours'].includes(key)) && typeof p.from === 'string' && typeof p.to === 'string'
    && !!place(p.from) && !!place(p.to) && Number.isFinite(p.fraction) && p.fraction >= 0 && p.fraction < 1
    && (p.from !== p.to || p.fraction === 0)
    && (p.transport === undefined || passengerTransport(p.transport) && p.from !== p.to && passengerEdge(p, p.transport))
    && (p.remainingHours === undefined || p.transport !== undefined && Number.isFinite(p.remainingHours) && p.remainingHours > 0);
}

/** Validate authoritative saved route geometry, fare receipt, cursor and schedule. */
export function validFantasyTravel(character: Pick<FantasyCharacter, 'travelPosition' | 'hour'>, activity?: FantasyActivity): boolean {
  if (character.travelPosition !== undefined && !validFantasyTravelPosition(character.travelPosition)) return false;
  const travel = activity?.travel;
  if (travel === undefined) return true; // Legacy journeys are upgraded on their next advance.
  if (!travel || typeof travel !== 'object' || Array.isArray(travel) || !Object.keys(travel).every(key => ['legs', 'paid', 'ambushChecked', 'ambushStartedAt'].includes(key))) return false;
  if (!activity || activity.action.type !== 'travel' || !Array.isArray(travel.legs) || !travel.legs.length || travel.legs.length > 200
    || !Number.isSafeInteger(travel.paid) || travel.paid < 0 || !Number.isSafeInteger(travel.ambushChecked) || travel.ambushChecked < 0
    || travel.ambushStartedAt !== undefined && (!Number.isFinite(travel.ambushStartedAt) || travel.ambushStartedAt < 0 || travel.ambushStartedAt > activity.startedAt)) return false;
  const permitted = activity.action.transport === 'carriage' ? ['foot', 'carriage'] : ['ship', 'working-ship'].includes(activity.action.transport) ? ['foot', activity.action.transport] : [activity.action.transport];
  let total = 0, cost = 0;
  for (const [index, leg] of travel.legs.entries()) {
    if (!leg || typeof leg !== 'object' || !place(leg.from) || !place(leg.to) || leg.from === leg.to || !transports.has(leg.transport) || !permitted.includes(leg.transport)
      || !Object.keys(leg).every(key => ['from', 'to', 'transport', 'hours', 'cost', 'startFraction'].includes(key))
      || !Number.isFinite(leg.hours) || leg.hours <= 0 || !Number.isSafeInteger(leg.cost) || leg.cost < 0
      || leg.startFraction !== undefined && (index !== 0 || !Number.isFinite(leg.startFraction) || leg.startFraction < 0 || leg.startFraction >= 1)
      || index > 0 && travel.legs[index - 1].to !== leg.from) return false;
    const route = edge(leg.from, leg.to);
    if (leg.transport === 'gate' ? !FANTASY_ROUTES.some(r => r.mode === 'gate' && (r.from === leg.from && r.to === leg.to || r.to === leg.from && r.from === leg.to))
      && (!place(leg.from)?.services.includes('gate') || !place(leg.to)?.services.includes('gate'))
      : !route || ['foot', 'carriage', 'escort'].includes(leg.transport) && route.mode !== 'land'
        || ['ship', 'working-ship'].includes(leg.transport) && route.mode !== 'sea') return false;
    total += leg.hours; cost += leg.cost;
  }
  const expected = fantasyTravelPosition(activity, character.hour), actual = character.travelPosition;
  const expectedPoint = expected && fantasyTravelPoint(expected), actualPoint = actual && fantasyTravelPoint(actual);
  return !!expectedPoint && !!actualPoint && Math.hypot(expectedPoint.x - actualPoint.x, expectedPoint.y - actualPoint.y) < EPS
    && (actual?.transport === undefined || actual.transport === expected!.transport)
    && (actual?.remainingHours === undefined || expected?.remainingHours !== undefined && Math.abs(actual.remainingHours - expected.remainingHours) < EPS)
    && travel.legs.at(-1)!.to === activity.action.destination && cost === travel.paid
    && Math.abs(total - (activity.endsAt - activity.startedAt)) < EPS
    && travel.ambushChecked <= Math.floor((Math.max(character.hour, activity.startedAt) - (travel.ambushStartedAt ?? activity.startedAt) + EPS) * 12);
}

/** A road position grants no access to facilities in the previous settlement. */
export function fantasyOnRoad(character: Pick<FantasyCharacter, 'travelPosition'> | null | undefined): boolean {
  const p = character?.travelPosition;
  return !!p && p.from !== p.to && p.fraction > EPS;
}

/** Closing a journey at a reached node restores that node's ordinary local interactions. */
export function fantasyTravelAnchor(character: FantasyCharacter): void {
  const p = character.travelPosition;
  if (p && (p.from === p.to || p.fraction <= EPS) && character.visited.includes(p.from)) {
    character.location = p.from;
    delete character.travelPosition;
  }
}
