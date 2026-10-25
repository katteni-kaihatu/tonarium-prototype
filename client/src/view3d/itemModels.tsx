import type { ReactNode } from 'react';
import type { ThreeElements } from '@react-three/fiber';
import * as THREE from 'three';
import type { Item } from '../../../shared/items.ts';
import type { ItemUi } from '../store.ts';
import { chessView, chessLegalMoves, squareIndex } from '../../../shared/chess.ts';
import { ITEM_INFO } from '../../../shared/items.ts';
import { Label } from './Label.tsx';
const NOTE_Y = 1.5;
/** 柄が +Y、頭が Z 方向 */
export function HammerModel(props: ThreeElements['group']) {
  return (
    <group {...props}>
      <mesh position-y={0.28}>
        <cylinderGeometry args={[0.025, 0.03, 0.56, 10]} />
        <meshStandardMaterial color="#facc15" />
      </mesh>
      <group position-y={0.6} rotation-x={Math.PI / 2}>
        <mesh>
          <cylinderGeometry args={[0.1, 0.1, 0.22, 18]} />
          <meshStandardMaterial color="#ef4444" />
        </mesh>
        <mesh position-y={0.13}>
          <cylinderGeometry args={[0.11, 0.11, 0.05, 18]} />
          <meshStandardMaterial color="#fde047" />
        </mesh>
        <mesh position-y={-0.13}>
          <cylinderGeometry args={[0.11, 0.11, 0.05, 18]} />
          <meshStandardMaterial color="#fde047" />
        </mesh>
      </group>
    </group>
  );
}

const SQ = 0.2;
const TABLE_Y = 0.78;
const PIECE_H: Record<string, number> = { P: 0.13, R: 0.16, N: 0.18, B: 0.2, Q: 0.23, K: 0.26 };

function ChessPiece({ code }: { code: string }) {
  const color = code[0] === 'w' ? '#f5f5f4' : '#27272a';
  const t = code[1];
  const h = PIECE_H[t];
  const mat = <meshStandardMaterial color={color} roughness={0.4} />;
  return (
    <group>
      <mesh position-y={0.02}><cylinderGeometry args={[0.07, 0.075, 0.04, 16]} />{mat}</mesh>
      <mesh position-y={0.04 + (h - 0.06) / 2}><cylinderGeometry args={[0.035, 0.055, h - 0.06, 12]} />{mat}</mesh>
      {t === 'P' && <mesh position-y={h}><sphereGeometry args={[0.045, 12, 10]} />{mat}</mesh>}
      {t === 'R' && <mesh position-y={h}><cylinderGeometry args={[0.06, 0.055, 0.06, 8]} />{mat}</mesh>}
      {t === 'N' && <mesh position={[0, h, 0.02]} rotation-x={-0.5}><boxGeometry args={[0.05, 0.1, 0.09]} />{mat}</mesh>}
      {t === 'B' && <mesh position-y={h}><coneGeometry args={[0.045, 0.1, 12]} />{mat}</mesh>}
      {t === 'Q' && <mesh position-y={h}><sphereGeometry args={[0.06, 14, 10]} />{mat}</mesh>}
      {t === 'K' && (
        <group position-y={h}>
          <mesh><boxGeometry args={[0.025, 0.1, 0.025]} />{mat}</mesh>
          <mesh position-y={0.015}><boxGeometry args={[0.07, 0.025, 0.025]} />{mat}</mesh>
        </group>
      )}
    </group>
  );
}

export function ChessModel({ item, ui, tableData, sqData, actions }: {
  item: Item & { kind: 'chess' | 'chessAi' }; ui?: ItemUi;
  tableData?: ThreeElements['group']['userData']; sqData?: (i: number) => ThreeElements['group']['userData']; actions?: ReactNode;
}) {
  const active = ui?.chessRevision === item.chess.revision;
  const sel = active ? ui?.sel : undefined;
  const view = chessView(item.chess);
  const status = item.kind === 'chessAi' && view.turn === 'b' && !view.over ? 'AIが考えています…' : view.status;
  const legal = sel === undefined ? [] : chessLegalMoves(item.chess, sel);
  const promoting = active && ui?.promotionTo !== undefined;
  return (
    <group>
      <Label text={status} position={[0, 1.5, 0]} height={0.17} />
      <Label text={promoting ? '昇格する駒を選択 ↓' : active && ui?.chessMessage ? ui.chessMessage : item.kind === 'chessAi' ? '白：みんな / 黒：AI' : '手番の駒は誰でも操作できます'} position={[0, 1.28, 0]} height={0.09} />
      {actions ?? <group position={[0, TABLE_Y, 1.12]}><mesh><boxGeometry args={[0.8, 0.08, 0.25]} /><meshStandardMaterial color="#476b8c" /></mesh><Label text="新しい対局" position={[0, 0.14, 0]} height={0.08} /></group>}
      {/* 持ち運び・片付けは机に照準を合わせる */}
      <group userData={tableData}>
        <mesh position-y={TABLE_Y - 0.03}>
          <boxGeometry args={[1.9, 0.06, 1.9]} />
          <meshStandardMaterial color="#5b3a1e" />
        </mesh>
        {[[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]].map(([lx, lz]) => (
          <mesh key={`${lx},${lz}`} position={[lx, (TABLE_Y - 0.06) / 2, lz]}>
            <boxGeometry args={[0.08, TABLE_Y - 0.06, 0.08]} />
            <meshStandardMaterial color="#4a2f18" />
          </mesh>
        ))}
      </group>
      {item.board.map((code, i) => {
        const r = Math.floor(i / 8);
        const c = i % 8;
        const lx = (c - 3.5) * SQ;
        const lz = (r - 3.5) * SQ;
        const isLast = item.last && (item.last[0] === i || item.last[1] === i);
        const color = view.check && code === `${view.turn}K` ? '#d96a59' : sel === i ? '#608bb0' : legal.some(m => squareIndex(m.to) === i) ? '#6d9e90' : isLast ? ((r + c) % 2 ? '#aaa23a' : '#cdd26a') : (r + c) % 2 ? '#b58863' : '#f0d9b5';
        return (
          <group key={i} position={[lx, TABLE_Y, lz]} userData={sqData?.(i)}>
            <mesh position-y={0.01}>
              <boxGeometry args={[SQ, 0.02, SQ]} />
              <meshStandardMaterial color={color} />
            </mesh>
            {code && <group position-y={0.02}><ChessPiece code={code} /></group>}
          </group>
        );
      })}
    </group>
  );
}
export function NoteModel({ color, texture, selected = false }: { color: string; texture: THREE.Texture; selected?: boolean }) {
  return <group>
      <mesh position-y={(NOTE_Y - 0.6) / 2}>
        <cylinderGeometry args={[0.03, 0.03, NOTE_Y - 0.6]} />
        <meshStandardMaterial color="#78716c" />
      </mesh>
      <group position-y={NOTE_Y}>
        <mesh>
          <boxGeometry args={[1.6, 1.2, 0.04]} />
          <meshStandardMaterial color={color} />
        </mesh>
        <mesh position-z={0.021}>
          <planeGeometry args={[1.6, 1.2]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
        <mesh position-z={-0.021} rotation-y={Math.PI}>
          <planeGeometry args={[1.6, 1.2]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
        {selected && (
          <mesh>
            <boxGeometry args={[1.72, 1.32, 0.06]} />
            <meshBasicMaterial color="#f43f5e" wireframe />
          </mesh>
        )}
      </group>
  </group>;
}

const PANEL_H = 1.8;
export function PanelModel({ item, width: w, texture: tex, data }: { item: Item; width: number; texture: THREE.Texture; data?: ThreeElements['mesh']['userData'] }) {
  return <group>
      <mesh position-y={(1.6 - PANEL_H / 2) / 2}>
        <cylinderGeometry args={[0.04, 0.04, 1.6 - PANEL_H / 2]} />
        <meshStandardMaterial color="#4e5058" />
      </mesh>
      <mesh position={[0, 1.6, -0.03]}>
        <boxGeometry args={[w + 0.08, PANEL_H + 0.08, 0.04]} />
        <meshStandardMaterial color="#1e1f22" />
      </mesh>
      <mesh position-y={1.6} userData={data}>
        <planeGeometry args={[w, PANEL_H]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <Label
        position={[0, 1.6 + PANEL_H / 2 + 0.18, 0]} height={0.16}
        text={`${ITEM_INFO[item.kind].name}${item.kind === 'g2048' ? ' ・ 互換モード' : ''}`}
        bg={item.kind === 'g2048' ? 'rgba(88,101,242,0.95)' : 'rgba(0,0,0,0.75)'}
      />
  </group>;
}
