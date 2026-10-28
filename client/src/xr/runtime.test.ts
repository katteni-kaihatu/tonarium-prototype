import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TURN, turnSettings } from './input.ts';
import { endVR, startVR, subscribeXR, updateXRSettings, xr, xrPatch, xrState } from './runtime.ts';

test('settings updates notify both views, merge current values and survive unavailable storage', t => {
  const previous = xr.settings;
  t.after(() => { xr.settings = previous; });
  const saved = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem: (key: string, value: string) => saved.set(key, value) } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  xr.settings = { ...DEFAULT_TURN };
  const views = [xr.settings, xr.settings];
  const unsubscribe = views.map((_, i) => subscribeXR(() => { views[i] = xr.settings; }));
  t.after(() => unsubscribe.forEach(stop => stop()));
  updateXRSettings({ mode: 'smooth', speed: 180 });
  updateXRSettings({ angle: 90, restrictMovementWhileAiming: false });
  assert.deepEqual(xr.settings, { mode: 'smooth', speed: 180, angle: 90, restrictMovementWhileAiming: false });
  assert.deepEqual(views, [xr.settings, xr.settings]);
  assert.deepEqual(turnSettings(JSON.parse(saved.get('tonarium.xr.turn')!)), xr.settings);
  for (const speed of Array.from({ length: 12 }, (_, i) => (i + 1) * 15)) {
    updateXRSettings({ speed });
    assert.equal(xr.settings.speed, speed);
    assert.equal(xr.settings.angle, 90);
  }
  for (const angle of [15, 30, 45, 60, 75, 90]) {
    updateXRSettings({ angle });
    assert.equal(xr.settings.angle, angle);
    assert.equal(xr.settings.speed, 180);
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('storage blocked'); } });
  updateXRSettings({ mode: 'snap', speed: 15, angle: 15 });
  assert.deepEqual(views, [xr.settings, xr.settings]);
  assert.deepEqual(xr.settings, { mode: 'snap', speed: 15, angle: 15, restrictMovementWhileAiming: false });
});

test('active stays false until session setup succeeds and resets on end, refusal and setup failure', async t => {
  const previousRenderer = xr.renderer;
  const previousState = xrState();
  const globals = ['window', 'document', 'navigator', 'HTMLElement'] as const;
  const descriptors = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  const classes = new Set<string>();
  const session = new EventTarget() as EventTarget & { end: () => Promise<void> };
  session.end = async () => { session.dispatchEvent(new Event('end')); };
  let request: () => Promise<unknown> = async () => session;
  let finishSetup!: () => void;
  let setup = () => new Promise<void>(resolve => { finishSetup = resolve; });
  const values = [new EventTarget(), { activeElement: null, pointerLockElement: null, body: { classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) } } }, { xr: { requestSession: () => request() } }, class {}];
  globals.forEach((key, i) => Object.defineProperty(globalThis, key, { configurable: true, value: values[i] }));
  xr.renderer = { xr: { enabled: false, setReferenceSpaceType: () => {}, setSession: () => setup() } } as unknown as typeof xr.renderer;
  t.after(() => {
    globals.forEach((key, i) => { if (descriptors[i]) Object.defineProperty(globalThis, key, descriptors[i]!); else Reflect.deleteProperty(globalThis, key); });
    xr.renderer = previousRenderer;
    xr.session = null;
    xrPatch(previousState);
  });
  xrPatch({ active: false, ready: false, pending: false });
  assert.equal(xrState().active, false);
  xrPatch({ ready: true });
  assert.equal(xrState().active, false);
  const start = startVR();
  assert.equal(xrState().pending, true);
  assert.equal(xrState().active, false);
  await Promise.resolve();
  assert.equal(xrState().active, false);
  finishSetup();
  await start;
  assert.equal(xrState().active, true);
  assert.equal(classes.has('xr-active'), true);
  await endVR();
  assert.equal(xrState().active, false);
  assert.equal(classes.has('xr-active'), false);
  request = async () => { throw new Error('permission denied'); };
  await startVR();
  assert.equal(xrState().active, false);
  assert.equal(xrState().pending, false);
  request = async () => session;
  setup = async () => { throw new Error('session setup failed'); };
  await startVR();
  assert.equal(xrState().active, false);
  assert.equal(xrState().pending, false);
  assert.equal(xr.session, null);
});
