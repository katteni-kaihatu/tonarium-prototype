export const BIKE = {
  step: 1 / 120, maxSpeed: 10, acceleration: 3.5, braking: 7, drag: 0.35,
  wheelbase: 1.3, wheelRadius: 0.32, maxSteer: 0.55, grip: 5,
  leanFactor: 1, maxLean: 0.65, leanResponse: 8, skidDrag: 1.8, radius: 0.9,
} as const;

export interface VehicleState {
  x: number; z: number; ry: number; speed: number; heading: number;
  roll: number; wheel: number; steer: number; slipping: boolean; remainder: number;
}
export interface VehicleInput { throttle: number; brake: number; steering: number }
export const vehicleInitial = (x: number, z: number, ry: number): VehicleState =>
  ({ x, z, ry, speed: 0, heading: ry, roll: 0, wheel: 0, steer: 0, slipping: false, remainder: 0 });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 0));
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const angle = (a: number) => angleDelta(a, 0);
export const clampBike = (value: number, half: number) => clamp(value, -half + BIKE.radius, half - BIKE.radius);

export function stepVehicle(previous: VehicleState, input: VehicleInput, dt: number): VehicleState {
  const s = { ...previous };
  // 余りを状態に残し、描画フレームの分割に計算結果を依存させない。
  let remaining = s.remainder + clamp(dt, 0, 0.25);
  while (remaining + 1e-10 >= BIKE.step) {
    const h = BIKE.step;
    remaining -= h;
    s.steer = clamp(input.steering, -1, 1) * BIKE.maxSteer;
    s.speed = clamp(s.speed + (clamp(input.throttle, 0, 1) * BIKE.acceleration
      - clamp(input.brake, 0, 1) * BIKE.braking - BIKE.drag) * h, 0, BIKE.maxSpeed);
    const yawRate = -s.speed * Math.tan(s.steer) / BIKE.wheelbase;
    const lateral = s.speed * yawRate;
    s.slipping = Math.abs(lateral) > BIKE.grip;
    s.ry = angle(s.ry + yawRate * h);
    if (s.slipping) {
      const turn = BIKE.grip / Math.max(s.speed, 0.01) * h;
      s.heading = angle(s.heading + clamp(angleDelta(s.ry, s.heading), -turn, turn));
      s.speed = Math.max(0, s.speed - BIKE.skidDrag * h);
    } else s.heading = angle(s.heading + angleDelta(s.ry, s.heading) * Math.min(1, 10 * h));
    const lean = clamp(Math.atan(lateral / 9.81) * BIKE.leanFactor, -BIKE.maxLean, BIKE.maxLean);
    s.roll += (lean - s.roll) * (1 - Math.exp(-BIKE.leanResponse * h));
    s.x -= Math.sin(s.heading) * s.speed * h;
    s.z -= Math.cos(s.heading) * s.speed * h;
    s.wheel += s.speed * h / BIKE.wheelRadius;
  }
  s.remainder = Math.max(0, remaining);
  return s;
}

export const releaseBike = <T extends VehicleState & { rider: string | null }>(s: T): T =>
  ({ ...s, rider: null, speed: 0, roll: 0, steer: 0, slipping: false, remainder: 0, heading: s.ry });
