import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { AdLabSnapshot } from '../../../shared/antimatterLayout.ts';
import { Box } from './parts3d.tsx';
import { makeCanvasTexture } from './textTexture.ts';

const WIDTH = 3.8;
const HEIGHT = 1.9;
const DISPLAY_Y = 4.5;
const FACES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
type Readings = Pick<AdLabSnapshot, 'antimatterText' | 'perSecondText'>;

/** Keep scientific notation on one line, including unusually long exponents. */
function fittedText(ctx: CanvasRenderingContext2D, text: string, y: number, size: number, color: string) {
  const font = (px: number) => `600 ${px}px "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif`;
  ctx.font = font(size);
  const fitted = Math.min(size, size * 912 / Math.max(1, ctx.measureText(text).width));
  ctx.font = font(fitted);
  ctx.fillStyle = color;
  ctx.fillText(text, 512, y);
}

function drawReadings(canvas: HTMLCanvasElement, readings: Readings) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#0b1325';
  ctx.fillRect(0, 0, 1024, 512);
  ctx.strokeStyle = '#426680';
  ctx.lineWidth = 3;
  ctx.strokeRect(16, 16, 992, 480);
  ctx.fillStyle = '#73dbf4';
  ctx.fillRect(50, 125, 924, 3);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fittedText(ctx, '反物質', 78, 64, '#9feaff');
  fittedText(ctx, readings.antimatterText, 231, 168, '#f0fbff');
  fittedText(ctx, `生産  ${readings.perSecondText} / 秒`, 397, 82, '#94e4b7');
}

/** A four-sided instrument mounted above the core; its faces never follow the camera. */
export function AntimatterReadout({ snapshot, onOpen }: { snapshot: Readings; onOpen?: () => void }) {
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const { canvas, tex } = useMemo(() => {
    const display = makeCanvasTexture(1024, 512);
    drawReadings(display.canvas, latest.current);
    display.tex.needsUpdate = true;
    return display;
  }, []);
  useEffect(() => {
    let last = '';
    const update = () => {
      const next = `${latest.current.antimatterText}\n${latest.current.perSecondText}`;
      if (next === last) return;
      last = next;
      drawReadings(canvas, latest.current);
      tex.needsUpdate = true;
    };
    update();
    const timer = setInterval(update, 250);
    return () => { clearInterval(timer); tex.dispose(); };
  }, [canvas, tex]);

  return (
    <group name="antimatter-core-instrument" userData={onOpen
      ? { hint: '反物質コア（クリックでパネル）', use: onOpen }
      : { noRay: true }}>
      {/* All legs remain inside the core's existing collision circle. The screens sit overhead. */}
      {[-0.65, 0.65].flatMap((x) => [-0.65, 0.65].map((z) => (
        <Box key={`${x}:${z}`} p={[x, 1.9, z]} s={[0.09, 3.8, 0.09]} color="#426078" />
      )))}
      <Box p={[0, DISPLAY_Y - HEIGHT / 2 - 0.07, 0]} s={[WIDTH + 0.16, 0.14, WIDTH + 0.16]} color="#273d54" />
      <Box p={[0, DISPLAY_Y + HEIGHT / 2 + 0.07, 0]} s={[WIDTH + 0.16, 0.14, WIDTH + 0.16]} color="#273d54" />
      {FACES.map((yaw, index) => (
        <group key={yaw} rotation-y={yaw}>
          <Box p={[0, DISPLAY_Y, WIDTH / 2]} s={[WIDTH + 0.12, HEIGHT + 0.12, 0.1]} color="#273d54" />
          <mesh name={`antimatter-readout-face-${index}`} position={[0, DISPLAY_Y, WIDTH / 2 + 0.056]}>
            <planeGeometry args={[WIDTH, HEIGHT]} />
            <meshBasicMaterial map={tex} toneMapped={false} depthTest depthWrite />
          </mesh>
        </group>
      ))}
    </group>
  );
}
