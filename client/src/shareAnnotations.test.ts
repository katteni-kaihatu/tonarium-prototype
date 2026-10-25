import assert from 'node:assert/strict';
import test from 'node:test';
import { annotationColor, DRAWING_COLORS, normalizedPoint, selectAnnotationShare, ShareAnnotations, videoRect } from './shareAnnotations.ts';

function viewers() {
  const peers = new Map<string, ShareAnnotations>();
  const queue: { packet: unknown; sender: string; to?: string }[] = [];
  const join = (id: string, share = 'track-one') => {
    const peer = new ShareAnnotations((packet, to) => queue.push({ packet: structuredClone(packet), sender: id, to }));
    peers.set(id, peer);
    peer.setShare(share, 'host', id);
    return peer;
  };
  const flush = () => {
    while (queue.length) {
      const message = queue.shift()!;
      for (const [id, peer] of peers) {
        if (id !== message.sender && (!message.to || message.to === id)) peer.receive(message.packet, message.sender);
      }
    }
  };
  return { peers, queue, join, flush };
}

test('multiple viewers draw concurrently; late viewers merge history and live segments without duplicates', () => {
  const network = viewers();
  const host = network.join('host');
  const alice = network.join('alice');
  const bob = network.join('bob');
  network.flush();
  alice.draw({ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 });
  bob.draw({ x: 0.7, y: 0.8 }, { x: 0.9, y: 1 });
  network.flush();
  assert.equal(host.snapshot().segments.length, 2);
  host.setShare('track-one', 'host', 'host');
  assert.equal(host.snapshot().segments.length, 2);
  const sorted = (peer: ShareAnnotations) => peer.snapshot().segments.toSorted((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(sorted(alice), sorted(host));
  assert.deepEqual(sorted(bob), sorted(host));
  const late = network.join('late');
  alice.draw({ x: 0, y: 0 }, { x: 1, y: 1 });
  network.flush();
  assert.deepEqual(sorted(late), sorted(host));
  const count = late.snapshot().segments.length;
  late.receive({ share: 'track-one', kind: 'history', segments: host.snapshot().segments }, 'host');
  assert.equal(late.snapshot().segments.length, count);
});

test('history is chunked, survives its author leaving, and empty history finishes hydration', () => {
  const network = viewers();
  const host = network.join('host');
  const alice = network.join('alice');
  network.flush();
  const before = network.queue.length;
  alice.requestHistory();
  assert.equal(network.queue.length, before);
  for (let i = 0; i < 95; i++) alice.draw({ x: 0, y: 0 }, { x: i / 100, y: 1 });
  network.flush();
  network.peers.delete('alice');
  host.removeParticipant('alice');
  const late = network.join('late');
  network.flush();
  assert.equal(late.snapshot().segments.length, 95);
});

test('mode exit removes only that cursor; participant exit preserves strokes', () => {
  const network = viewers();
  const host = network.join('host');
  const alice = network.join('alice');
  const bob = network.join('bob');
  network.flush();
  alice.draw({ x: 0, y: 0 }, { x: 1, y: 1 });
  alice.cursor({ x: 0.2, y: 0.8 });
  bob.cursor({ x: 0.4, y: 0.6 });
  network.flush();
  assert.deepEqual(host.snapshot().cursors.get('alice'), { x: 0.2, y: 0.8 });
  alice.cursor(null);
  network.flush();
  assert.equal(host.snapshot().cursors.has('alice'), false);
  assert.equal(host.snapshot().cursors.has('bob'), true);
  host.removeParticipant('bob');
  assert.equal(host.snapshot().cursors.size, 0);
  assert.equal(host.snapshot().segments.length, 1);
  assert.equal(annotationColor('alice'), annotationColor('alice'));
  assert.notEqual(annotationColor('alice'), annotationColor('bob'));
});

test('ending and restarting the same owner share discards state and rejects stale queued packets', () => {
  const network = viewers();
  const host = network.join('host');
  const alice = network.join('alice');
  network.flush();
  alice.draw({ x: 0, y: 0 }, { x: 1, y: 1 });
  alice.cursor({ x: 0.5, y: 0.5 });
  for (const [id, peer] of network.peers) {
    peer.setShare(null, '', id);
    assert.equal(peer.snapshot().segments.length, 0);
    assert.equal(peer.snapshot().cursors.size, 0);
    peer.setShare('track-two', 'host', id);
  }
  network.flush();
  assert.equal(host.snapshot().segments.length, 0);
  assert.equal(alice.snapshot().cursors.size, 0);
  alice.draw({ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 });
  network.flush();
  assert.equal(host.snapshot().segments.length, 1);
  let updates = 0;
  const unsubscribe = host.subscribe(() => updates++);
  unsubscribe();
  host.setShare(null, '', 'host');
  assert.equal(updates, 0);
});

test('late subscription retries until the authority is ready, and rejects invalid or forged data', () => {
  const network = viewers();
  const alice = network.join('alice');
  network.flush();
  const host = network.join('host');
  host.draw({ x: 0, y: 0 }, { x: 1, y: 1 });
  network.queue.length = 0;
  alice.requestHistory();
  network.flush();
  assert.equal(alice.snapshot().segments.length, 1);
  const segment = { id: 'fake', owner: 'alice', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } };
  alice.receive({ share: 'track-one', kind: 'history', segments: [segment] }, 'intruder');
  host.receive({ share: 'track-one', kind: 'segment', segments: [segment] }, 'intruder');
  host.receive({ share: 'track-one', kind: 'cursor', point: { x: NaN, y: 0 } }, 'intruder');
  alice.draw({ x: -1, y: 0 }, { x: 0, y: 0 });
  assert.equal(alice.snapshot().segments.length, 1);
  assert.equal(host.snapshot().segments.length, 1);
  assert.equal(host.snapshot().cursors.size, 0);
});

test('coordinates use the actual video area for landscape, portrait, square and resized hosts', () => {
  for (const [w, h, vw, vh] of [[800, 600, 1920, 1080], [300, 900, 1920, 1080], [900, 400, 1080, 1920], [500, 500, 500, 500]]) {
    const rect = videoRect(w, h, vw, vh);
    for (const p of [{ x: 0, y: 0 }, { x: 0.25, y: 0.75 }, { x: 1, y: 1 }]) {
      const actual = normalizedPoint(rect.left + rect.width * p.x, rect.top + rect.height * p.y, rect)!;
      assert.ok(Math.abs(actual.x - p.x) < 1e-10);
      assert.ok(Math.abs(actual.y - p.y) < 1e-10);
    }
    assert.equal(normalizedPoint(rect.left - 1, rect.top, rect), null);
    assert.equal(normalizedPoint(rect.left, rect.top + rect.height + 1, rect), null);
  }
  assert.equal(normalizedPoint(0, 0, videoRect(0, 0, 0, 0)), null);
});

test('share identity is independent of subscription readiness and participant order', () => {
  const host = { identity: 'host', publication: { trackSid: 'TR_one', isMuted: false } };
  const other = { identity: 'other', publication: { trackSid: 'TR_two', isMuted: false } };
  assert.equal(selectAnnotationShare([host, other])?.publication?.trackSid, 'TR_one');
  assert.equal(selectAnnotationShare([other, host])?.publication?.trackSid, 'TR_one');
  assert.equal(selectAnnotationShare([{ ...host, publication: undefined }, other])?.identity, 'other');
  assert.equal(selectAnnotationShare([{ ...host, publication: { ...host.publication, isMuted: true } }]), undefined);
});

test('colored drawing, partial erasure and subsequent drawing have identical authority order on all clients', () => {
  const network = viewers();
  const host = network.join('host');
  const alice = network.join('alice');
  const bob = network.join('bob');
  network.flush();
  for (const color of DRAWING_COLORS) alice.draw({ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, color);
  network.flush();
  bob.draw({ x: 0.5, y: 0.4 }, { x: 0.5, y: 0.6 }, 'erase');
  host.draw({ x: 0, y: 0 }, { x: 1, y: 1 }, DRAWING_COLORS[2]);
  network.flush();
  alice.draw({ x: 0.5, y: 0.4 }, { x: 0.5, y: 0.6 }, DRAWING_COLORS[4]);
  network.flush();
  const late = network.join('late');
  network.flush();
  for (const peer of [alice, bob, late]) assert.deepEqual(peer.snapshot().segments, host.snapshot().segments);
  const colors = host.snapshot().segments.map((s) => s.color);
  assert.deepEqual(colors.slice(0, DRAWING_COLORS.length), DRAWING_COLORS);
  assert.equal(colors.at(-2), 'erase');
  assert.equal(colors.at(-1), DRAWING_COLORS[4]);
});

test('clear wins over old history, concurrent operations converge, and new shares discard erasure and color history', () => {
  const network = viewers();
  const host = network.join('host');
  const alice = network.join('alice');
  const bob = network.join('bob');
  network.flush();
  alice.draw({ x: 0, y: 0 }, { x: 1, y: 1 }, '#ef4444');
  network.flush();
  const stale = { share: 'track-one', kind: 'history', cleared: 0, segments: structuredClone(host.snapshot().segments) };
  bob.clear();
  alice.draw({ x: 0.2, y: 0 }, { x: 0.2, y: 1 }, 'erase');
  host.draw({ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, '#22c55e');
  network.flush();
  for (const peer of [alice, bob]) {
    peer.receive(stale, 'host');
    assert.deepEqual(peer.snapshot().segments, host.snapshot().segments);
  }
  bob.clear();
  network.flush();
  const late = network.join('late');
  network.flush();
  for (const peer of [host, alice, bob, late]) assert.equal(peer.snapshot().segments.length, 0);
  alice.draw({ x: 0, y: 0 }, { x: 1, y: 1 }, '#a855f7');
  network.flush();
  assert.deepEqual(late.snapshot().segments, host.snapshot().segments);
  host.clear();
  network.flush();
  for (const peer of network.peers.values()) assert.equal(peer.snapshot().segments.length, 0);
  for (const [id, peer] of network.peers) {
    peer.setShare(null, '', id);
    peer.setShare('track-two', 'host', id);
    peer.receive(stale, 'host');
  }
  network.flush();
  for (const peer of network.peers.values()) assert.equal(peer.snapshot().segments.length, 0);
});

test('viewers reject forged clear and ordered segments; invalid drawing colors are not sent', () => {
  const network = viewers();
  const host = network.join('host');
  const alice = network.join('alice');
  network.flush();
  host.draw({ x: 0, y: 0 }, { x: 1, y: 1 }, '#ef4444');
  network.flush();
  const before = structuredClone(alice.snapshot().segments);
  alice.receive({ share: 'track-one', kind: 'clear', cleared: 100 }, 'intruder');
  alice.receive({ share: 'track-one', kind: 'segment', segments: [{ ...before[0], id: 'forged', order: 101 }] }, 'intruder');
  alice.draw({ x: 0, y: 0 }, { x: 1, y: 1 }, 'invalid');
  assert.equal(network.queue.length, 0);
  assert.deepEqual(alice.snapshot().segments, before);
  host.receive({ share: 'track-one', kind: 'segment', segments: [{ ...before[0], id: 'invalid-color', color: 'invalid' }] }, 'alice');
  assert.deepEqual(host.snapshot().segments, before);
});
