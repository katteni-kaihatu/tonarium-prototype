import { t as tr } from '../i18n/index.ts';
import { DiceStand } from './diceModel.tsx';
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DICE_COLORS, ROLL_MS, diceLabel, seededRng, type DiceRoll, type DieSides } from '../../../shared/dice.ts';
import type { Item } from '../../../shared/items.ts';
import { nameOf } from '../store.ts';
import { rollDice, rollElapsed, useDiceSettings, useRollResults } from '../items/dice.ts';
import { Label } from './Label.tsx';
import { removable, useFollow } from './itemHelpers.ts';
import type { Interactable } from './interact.ts';

const STAND_Y = 0.7;
/** 器の内側の底の高さ（器の原点から） */
const FLOOR = 0.035;
const DIE = 0.07;


function DieMesh({ sides }: { sides: DieSides }) {
  const geo = useMemo(() => {
    const r = DIE * 0.62;
    switch (sides) {
      case 4: return new THREE.TetrahedronGeometry(r * 1.2);
      case 6: return new THREE.BoxGeometry(DIE, DIE, DIE);
      case 8: return new THREE.OctahedronGeometry(r * 1.05);
      case 12: return new THREE.DodecahedronGeometry(r);
      case 20: return new THREE.IcosahedronGeometry(r * 1.05);
      default: return null;
    }
  }, [sides]);
  const mat = <meshStandardMaterial color={DICE_COLORS[sides].bg} roughness={0.45} flatShading />;
  if (geo) return <mesh geometry={geo}>{mat}</mesh>;
  // d10・d100 は五角の両錐で近似する
  return (
    <>
      <mesh position-y={DIE * 0.25}><coneGeometry args={[DIE * 0.5, DIE * 0.5, 5]} />{mat}</mesh>
      <mesh position-y={-DIE * 0.25} rotation-x={Math.PI}><coneGeometry args={[DIE * 0.5, DIE * 0.5, 5]} />{mat}</mesh>
    </>
  );
}

interface Path { a0: number; dir: number; fx: number; fz: number; axis: THREE.Vector3; spin: number; yaw: number; hops: number }

function pathsOf(roll: DiceRoll): Path[] {
  const rng = seededRng(roll.id);
  const off = rng() * Math.PI * 2;
  return Array.from({ length: roll.count }, (_, i) => {
    const r = roll.count === 1 ? 0 : 0.06 + 0.19 * Math.sqrt((i + 0.5) / roll.count);
    const a = off + i * 2.39996;
    return {
      a0: rng() * Math.PI * 2, dir: rng() < 0.5 ? -1 : 1, fx: Math.sin(a) * r, fz: Math.cos(a) * r,
      axis: new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(), spin: 14 + rng() * 10,
      yaw: rng() * Math.PI * 2, hops: 3 + Math.floor(rng() * 3),
    };
  });
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const qTumble = new THREE.Quaternion();
const qRest = new THREE.Quaternion();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** 器の縁から転がり込んで、決まった位置に止まる（全員が同じ動きを見る） */
function RollingDice({ roll, results }: { roll: DiceRoll; results: number[] | null }) {
  const paths = useMemo(() => pathsOf(roll), [roll]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const [settled, setSettled] = useState(() => rollElapsed(roll) >= ROLL_MS);
  useFrame(() => {
    const p = Math.max(0, Math.min(1, rollElapsed(roll) / ROLL_MS));
    if ((p >= 1) !== settled) setSettled(p >= 1);
    paths.forEach((d, i) => {
      const g = refs.current[i];
      if (!g) return;
      const ang = d.a0 + d.dir * 7 * (1 - (1 - p) ** 2);
      const rad = 0.32 - 0.08 * p;
      const k = smooth(0.45, 1, p);
      g.position.set(
        Math.sin(ang) * rad * (1 - k) + d.fx * k,
        FLOOR + DIE / 2 + Math.abs(Math.sin(p * Math.PI * d.hops)) * 0.14 * (1 - p) ** 2,
        Math.cos(ang) * rad * (1 - k) + d.fz * k,
      );
      qTumble.setFromAxisAngle(d.axis, d.spin * (1 - (1 - p) ** 3));
      qRest.setFromAxisAngle(Y_AXIS, d.yaw);
      g.quaternion.copy(qTumble).slerp(qRest, smooth(0.75, 1, p));
    });
  });
  return (
    <>
      {paths.map((d, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }}>
          <DieMesh sides={roll.sides} />
        </group>
      ))}
      {settled && paths.map((d, i) => (
        <Label key={`n${i}`} text={results ? String(results[i]) : '？'} position={[d.fx, FLOOR + DIE + 0.07, d.fz]} height={0.07} bg="rgba(40,26,16,.85)" />
      ))}
    </>
  );
}

export function Dice3D({ item }: { item: Item & { kind: 'dice' } }) {
  const ref = useRef<THREE.Group>(null);
  useFollow(ref, item.id, item.x, item.z, item.ry);
  const settings = useDiceSettings();
  const results = useRollResults(item.roll);
  const roll = item.roll;
  const [, rerender] = useState(0);
  const done = useRef(true);
  useFrame(() => {
    const d = !roll || rollElapsed(roll) >= ROLL_MS;
    if (d !== done.current) { done.current = d; rerender((n) => n + 1); }
  });
  const label = !roll
    ? tr("ui446")
    : !done.current
      ? tr("ui482", nameOf(roll.by), diceLabel(roll.sides, roll.count))
      : results
        ? `${nameOf(roll.by)}：${diceLabel(roll.sides, roll.count)} = ${results.reduce((a, b) => a + b, 0)}${roll.secret ? tr("ui483") : ''}`
        : tr("ui484", nameOf(roll.by), diceLabel(roll.sides, roll.count));
  const data: Interactable = {
    ...removable(item),
    hint: tr("ui485", diceLabel(settings.sides, settings.count), settings.secret ? tr("ui486") : tr("ui487")),
    use: () => rollDice(item.id),
  };
  return (
    <group ref={ref} position={[item.x, 0, item.z]} rotation-y={item.ry} userData={data}>
      <DiceStand>{roll && <RollingDice key={roll.id} roll={roll} results={results} />}</DiceStand>
      <Label text={label} position={[0, STAND_Y + 0.55, 0]} height={0.1} />
    </group>
  );
}
