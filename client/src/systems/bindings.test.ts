import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { SystemObjectBindings } from './bindings.ts';
import type { SystemView } from '../../../shared/system-types.ts';

function view(revision = 1): SystemView {
  return {
    revision, systems: [], seats: {}, diagnostics: [], traces: [],
    map: { schema: 1, id: 'map', systems: [], connections: [], objects: [{ id: 'target', capabilities: ['move', 'text', 'interact'], position: [2, 0, 3], rotation: Math.PI / 2, text: 'Original' }] },
    objects: { target: { position: [5, 1, 6], text: '00:09' } },
  };
}
function near(a: Vector3, b: Vector3) { assert.ok(a.distanceTo(b) < 1e-8, `${a.toArray()} != ${b.toArray()}`); }
function interact(object: Group) { assert.equal(typeof object.userData.use, 'function'); object.userData.use(); }

test('binds existing model movement, text and interaction without replacing or disposing it', () => {
  const model = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  model.position.set(1, 2, 3); model.rotation.set(0.1, 0.2, 0.3);
  const originalQuaternion = model.quaternion.clone(), originalData = { use: () => {}, hint: 'Old interaction' };
  model.userData = originalData;
  let text = 'Original', interactions: string[] = [], disposed = false;
  model.geometry.addEventListener('dispose', () => { disposed = true; });
  const bindings = new SystemObjectBindings({ sessionId: 'room', mapId: 'map' }, id => interactions.push(id));
  const release = bindings.bind('target', model, { getText: () => text, setText: value => { text = value; } });
  bindings.update('room', view());
  near(model.position, new Vector3(5, 1, 6)); assert.equal(text, '00:09');
  model.userData.use(); assert.deepEqual(interactions, ['target']);
  assert.equal(model.geometry.type, 'BoxGeometry'); assert.equal(disposed, false);
  release(); near(model.position, new Vector3(1, 2, 3)); assert.deepEqual(model.quaternion.toArray(), originalQuaternion.toArray());
  assert.equal(model.userData, originalData); assert.equal(text, 'Original'); assert.equal(disposed, false);
  release(); bindings.dispose();
});

test('world-space bindings account for a rotated, scaled existing parent', () => {
  const parent = new Group(), model = new Group();
  parent.position.set(20, 3, -5); parent.rotation.y = Math.PI / 3; parent.scale.set(2, 3, 2); parent.add(model);
  model.scale.set(0.5, 0.7, 0.9);
  const bindings = new SystemObjectBindings({ sessionId: 'room', mapId: 'map' }, () => {});
  bindings.bind('target', model); bindings.update('room', view());
  parent.updateWorldMatrix(true, true);
  near(model.getWorldPosition(new Vector3()), new Vector3(5, 1, 6));
  near(model.scale, new Vector3(0.5, 0.7, 0.9));
  const desired = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
  assert.ok(model.getWorldQuaternion(new Quaternion()).angleTo(desired) < 1e-7);
  bindings.dispose();
});

test('scope and revision checks ignore stale data while missing targets disable stale interaction', () => {
  const model = new Group(); let uses = 0;
  const bindings = new SystemObjectBindings({ sessionId: 'room', mapId: 'map' }, () => { uses++; });
  bindings.bind('target', model); bindings.update('room', view(3));
  const stale = view(2); stale.objects.target.position = [99, 99, 99];
  assert.equal(bindings.update('room', stale), false);
  assert.equal(bindings.update('other-room', stale), false);
  assert.equal(bindings.update('room', { ...stale, map: { ...stale.map, id: 'other-map' } }), false);
  near(model.position, new Vector3(5, 1, 6));
  model.userData.use(); assert.equal(uses, 1);
  const removed = view(4); removed.map.objects = []; removed.objects = {};
  bindings.update('room', removed);
  assert.equal(model.userData.use, undefined); assert.equal(model.userData.noRay, true);
  assert.deepEqual(bindings.diagnostics, ['System object unavailable: target']);
  near(model.position, new Vector3());
  bindings.update('room', view(5)); interact(model); assert.equal(uses, 2);
  assert.deepEqual(bindings.diagnostics, []);
  bindings.dispose(); assert.equal(bindings.update('room', view(6)), false);
});

test('duplicate object identities are rejected and text updates only notify when changed', () => {
  const model = new Group(), other = new Group(); let textUpdates = 0;
  const bindings = new SystemObjectBindings({ sessionId: 'room', mapId: 'map' }, () => {});
  bindings.bind('target', model, { setText: () => { textUpdates++; } });
  assert.throws(() => bindings.bind('target', other), /already bound/);
  assert.throws(() => bindings.bind('second', model), /already bound/);
  bindings.update('room', view()); bindings.update('room', view(2));
  assert.equal(textUpdates, 1);
  bindings.update('room', undefined); assert.equal(model.userData.noRay, true);
  bindings.dispose(); assert.throws(() => bindings.bind('target', other), /disposed/);
});
