import { test } from '../assertion-runner.js';
import assert from 'node:assert/strict';
import { ROOM_HALF, SPAWN } from './protocol.js';
import { SURVIVOR_TITLE } from './survivor.js';
import { GARDEN, WORLDS, WORLD_KINDS, isWorldKind, pushOut } from './worlds.js';
const EPS = 1e-7;
const BODY_R = 0.35;
const solids = WORLDS.garden.solids;
function clearance(x, z, solid) {
    if ('r' in solid)
        return Math.hypot(x - solid.x, z - solid.z) - solid.r;
    const dx = Math.max(Math.abs(x - solid.x) - solid.w / 2, 0);
    const dz = Math.max(Math.abs(z - solid.z) - solid.d / 2, 0);
    return Math.hypot(dx, dz);
}
function clearAt(x, z, radius) {
    for (const [i, solid] of solids.entries()) {
        assert.ok(clearance(x, z, solid) >= radius - EPS, `(${x}, ${z}) with radius ${radius} overlaps garden solid ${i}`);
    }
}
function overlapSamples(solid, radius) {
    const points = [{ x: solid.x, z: solid.z }];
    if ('r' in solid) {
        for (const distance of [solid.r / 2, solid.r + radius / 2]) {
            for (let i = 0; i < 8; i++) {
                const angle = i * Math.PI / 4;
                points.push({ x: solid.x + Math.cos(angle) * distance, z: solid.z + Math.sin(angle) * distance });
            }
        }
    }
    else {
        for (const dx of [-0.45, 0, 0.45]) {
            for (const dz of [-0.45, 0, 0.45]) {
                points.push({ x: solid.x + dx * solid.w, z: solid.z + dz * solid.d });
            }
        }
        for (const sign of [-1, 1]) {
            points.push({ x: solid.x + sign * (solid.w / 2 + radius / 2), z: solid.z });
            points.push({ x: solid.x, z: solid.z + sign * (solid.d / 2 + radius / 2) });
        }
        for (const dx of [-1, 1]) {
            for (const dz of [-1, 1]) {
                points.push({ x: solid.x + dx * (solid.w / 2 + radius / 4), z: solid.z + dz * (solid.d / 2 + radius / 4) });
            }
        }
    }
    return points;
}
test('garden is selectable alongside every existing world', () => {
    assert.equal(isWorldKind('garden'), true);
    assert.equal(WORLD_KINDS.filter((kind) => kind === 'garden').length, 1);
    assert.ok(WORLDS.garden.name.trim());
    assert.ok(WORLDS.garden.desc.trim());
    assert.ok(solids.length > 0);
    for (const [kind, name] of Object.entries({ room: 'ホール', cafe: 'カフェ', game: 'ゲーム', survivors: SURVIVOR_TITLE, city: '街' })) {
        assert.ok(isWorldKind(kind));
        assert.ok(WORLD_KINDS.includes(kind));
        assert.equal(WORLDS[kind].name, name);
    }
});
test('garden obstacles fit the room and leave the spawn disk clear for a body', () => {
    for (const [i, solid] of solids.entries()) {
        const halfW = 'r' in solid ? solid.r : solid.w / 2;
        const halfD = 'r' in solid ? solid.r : solid.d / 2;
        assert.ok(Number.isFinite(solid.x) && Number.isFinite(solid.z));
        assert.ok(halfW > 0 && halfD > 0);
        assert.ok(Math.abs(solid.x) + halfW + BODY_R <= ROOM_HALF + EPS, `solid ${i} exceeds the x boundary`);
        assert.ok(Math.abs(solid.z) + halfD + BODY_R <= ROOM_HALF + EPS, `solid ${i} exceeds the z boundary`);
        assert.ok(clearance(SPAWN.x, SPAWN.z, solid) >= SPAWN.r + BODY_R - EPS, `solid ${i} obstructs spawn`);
    }
});
test('garden ejects bodies and items placed inside or against every obstacle', () => {
    for (const radius of [0.3, BODY_R, 0.6]) {
        for (const solid of solids) {
            for (const point of overlapSamples(solid, radius)) {
                const result = pushOut(point.x, point.z, radius, solids);
                assert.ok(Number.isFinite(result.x) && Number.isFinite(result.z));
                clearAt(result.x, result.z, radius);
            }
        }
    }
});
test('the central north-south path stays open from spawn to its northern end', () => {
    const path = GARDEN.paths[0];
    for (let z = SPAWN.z; z >= path.z - path.d / 2; z -= 0.1) {
        clearAt(SPAWN.x, z, BODY_R);
        assert.deepEqual(pushOut(SPAWN.x, z, BODY_R, solids), { x: SPAWN.x, z });
    }
});
test('positions throughout the existing spawn disk remain unchanged', () => {
    for (let ring = 0; ring <= 8; ring++) {
        const radius = SPAWN.r * ring / 8;
        for (let i = 0; i < 48; i++) {
            const angle = i * Math.PI * 2 / 48;
            const point = { x: SPAWN.x + Math.cos(angle) * radius, z: SPAWN.z + Math.sin(angle) * radius };
            clearAt(point.x, point.z, BODY_R);
            assert.deepEqual(pushOut(point.x, point.z, BODY_R, solids), point);
        }
    }
});
test('isWorldKind rejects inherited property names', () => {
    assert.equal(isWorldKind('room'), true);
    assert.equal(isWorldKind('__proto__'), false);
    assert.equal(isWorldKind('constructor'), false);
    assert.equal(isWorldKind('toString'), false);
});
