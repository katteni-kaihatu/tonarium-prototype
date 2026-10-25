import { BIKE, stepVehicle } from '../../../shared/vehicle.js';
import { pushOut } from '../../../shared/worlds.js';
export function moveBike(state, input, dt, solids, clamp) {
    let remaining = state.remainder + Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, 0.25));
    let next = { ...state, remainder: 0 };
    while (remaining + 1e-10 >= BIKE.step) {
        remaining -= BIKE.step;
        const candidate = stepVehicle(next, input, BIKE.step);
        const p = pushOut(clamp(candidate.x), clamp(candidate.z), BIKE.radius, solids);
        const x = clamp(p.x), z = clamp(p.z);
        const collision = Math.hypot(candidate.x - x, candidate.z - z) > 1e-6;
        next = { ...candidate, x, z, ...(collision ? { speed: 0, slipping: false, roll: 0, heading: candidate.ry } : {}) };
    }
    return { ...next, remainder: Math.max(0, remaining) };
}
