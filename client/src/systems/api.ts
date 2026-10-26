import { send } from '../net/ws.ts';
import { get, useStore } from '../store.ts';
import type { SystemCatalog, SystemCommand, SystemCommandResult, SystemValue, SystemView } from '../../../shared/system-types.ts';
import { useSystems } from './state.ts';
import { standInput } from './seat-input.ts';
import { SystemCommandQueue } from './command-queue.ts';

type InputCommand = Exclude<SystemCommand, { kind: 'map' }>;
let localTransport: { command: (command: InputCommand) => void; load: (mapId: string) => void } | undefined;
const commands = new SystemCommandQueue({
  context() {
    const { sid, view } = useSystems.getState(), state = get();
    if (!view || sid !== state.session) return;
    return { sid, mapId: view.map.id, revision: view.revision, ready: state.sync === 'connected' };
  },
  send: command => send({ t: 'systemCommand', command }),
  error: error => useSystems.setState({ error }),
});
export function resetSystemCommands() { commands.reset(); }
export function receiveSystemCommandResult(sid: string, view: SystemView, result?: SystemCommandResult, error?: string) {
  if (result) commands.reply({ sid, mapId: view.map.id, revision: view.revision, commandId: result.id, outcome: result.outcome, error });
}
const unsubscribeStore = useStore.subscribe((state, previous) => {
  if (state.session !== previous.session || (state.sync !== 'connected' && previous.sync === 'connected')) commands.reset();
});
const unsubscribeSystems = useSystems.subscribe((state, previous) => {
  if (state.sid !== previous.sid || state.view?.map.id !== previous.view?.map.id) commands.reset();
});
if (import.meta.hot) import.meta.hot.dispose(() => { unsubscribeStore(); unsubscribeSystems(); commands.dispose(); interactions.clear(); });
export function useSystemTransport(transport: NonNullable<typeof localTransport>) {
  commands.reset();
  localTransport = transport;
  return () => { if (localTransport === transport) localTransport = undefined; };
}
function command(command: InputCommand) {
  if (localTransport) localTransport.command(command);
  else commands.enqueue(command);
}

function current() {
  const state = useSystems.getState();
  if (!state.view || state.sid !== get().session) throw new Error('System map is not synchronized');
  return state.view;
}
const interactions = new Map<string, () => void>();
export function bindSystemInteraction(scope: { sessionId: string; mapId: string; objectId: string }, handler: () => void) {
  const key = JSON.stringify([scope.sessionId, scope.mapId, scope.objectId]);
  if (interactions.has(key)) throw new Error('System interaction is already bound');
  interactions.set(key, handler);
  return () => { if (interactions.get(key) === handler) interactions.delete(key); };
}
export function interactSystemObject(objectId: string) {
  const view = current();
  const handler = interactions.get(JSON.stringify([get().session, view.map.id, objectId]));
  if (handler) { handler(); return; }
  command({ kind: 'interact', id: `input-${crypto.randomUUID()}`, revision: view.revision, objectId });
}
export function inputSystem(instanceId: string, input: string, payload: Record<string, SystemValue> = {}) {
  const view = current();
  command({ kind: 'input', id: `input-${crypto.randomUUID()}`, revision: view.revision, instanceId, input, payload });
}
export function loadSystemMap(mapId: string) {
  commands.reset();
  if (localTransport) localTransport.load(mapId); else send({ t: 'systemLoad', mapId });
}

let seatCatalog: SystemCatalog | undefined;
export async function standFromSystemSeat() {
  const session = get().session, user = get().selfId;
  let view = current();
  if (!Object.values(view.seats).includes(user)) return;
  let input = seatCatalog && standInput(view, seatCatalog, user);
  if (!input) {
    const response = await fetch('/api/shared-systems');
    if (!response.ok) throw new Error('의자 시스템 정보를 불러오지 못했습니다.');
    seatCatalog = await response.json() as SystemCatalog;
    if (get().session !== session || get().selfId !== user) return;
    view = current();
    if (!Object.values(view.seats).includes(user)) return;
    input = standInput(view, seatCatalog, user);
  }
  if (!input) throw new Error('연결된 의자에 일어서기 입력이 없습니다.');
  inputSystem(input.instanceId, input.input, input.payload);
}
