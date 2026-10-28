import { t, useLanguage } from '../i18n/index.ts';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { AdLabSnapshot } from '../../../shared/antimatterLayout.ts';
import { Box } from './parts3d.tsx';
import { makeCanvasTexture } from './textTexture.ts';
import { drawAdReadings } from './antimatterText.ts';

const WIDTH = 3.8;
const HEIGHT = 1.9;
const DISPLAY_Y = 4.5;
const FACES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
type Readings = Pick<AdLabSnapshot, 'antimatterText' | 'perSecondText'>;

/** A four-sided instrument mounted above the core; its faces never follow the camera. */
export function AntimatterReadout({ snapshot, onOpen }: { snapshot: Readings; onOpen?: () => void }) {
  const language = useLanguage();
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const { canvas, tex } = useMemo(() => {
    const display = makeCanvasTexture(1024, 512);
    drawAdReadings(display.canvas, latest.current);
    display.tex.needsUpdate = true;
    return display;
  }, []);
  useEffect(() => {
    let last = '';
    const update = () => {
      const next = `${latest.current.antimatterText}\n${latest.current.perSecondText}`;
      if (next === last) return;
      last = next;
      drawAdReadings(canvas, latest.current);
      tex.needsUpdate = true;
    };
    update();
    const timer = setInterval(update, 250);
    return () => { clearInterval(timer); };
  }, [canvas, tex, language]);
  useEffect(() => () => tex.dispose(), [tex]);

  return (
    <group name="antimatter-core-instrument" userData={onOpen
      ? { hint: t('adLabText87'), use: onOpen }
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
