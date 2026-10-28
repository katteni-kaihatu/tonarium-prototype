// antimatter の空間内ボードと前面操作パネル。
// 購入ロジックはここに置かない。AdActions は親が engine.mjs の呼び出し（buyDimension /
// buyMaxDimension / buyTickspeed / dimensionalBoost / antimatterGalaxy / sacrifice /
// prestigeInfinity）とセーブへ結ぶ、ただ1つの口である。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ANTIMATTER_EXHIBITS, type AdLabSnapshot, type AdPanelTarget } from '../../../shared/antimatterLayout.ts';
import { drawText, makeCanvasTexture } from './textTexture.ts';
import { emitAdFeedback } from '../ad/feedback.ts';
import { uprightQuaternion } from '../xr/pose.ts';
import { t } from '../i18n/core.ts';

/** 親が engine へ結ぶ操作口。3D 側は数値計算もセーブもしない */
export interface AdActions {
  buyDimension: (tier: number) => void;
  buyDimensionUpTo: (tier: number, count: number) => void;
  buyDimensionMax: (tier: number) => void;
  buyMaxAll?: () => void;
  buyTickspeed: () => void;
  buyMaxTickspeed?: () => void;
  dimensionalBoost: () => void;
  antimatterGalaxy: () => void;
  sacrifice: () => void;
  prestigeInfinity: () => void;
}

// ---- 3D 空間内のボード（CanvasTexture 板） ----

/** 空間内の 2D パネル板。drei Html ではなく CanvasTexture なので、撮影・配信にも写り、
//  3D 参加直後の人が空になる問題もない。ボタンは描画だけで、操作は照準＋クリックで開く前面パネルで行う */
export function PanelBoard({ position, lines, hint, onOpen }: {
  position: [number, number, number]; lines: string[];
  /** あればボード自体が操作対象になる。無ければ飾り（noRay） */
  hint?: string; onOpen?: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const latest = useRef(lines);
  latest.current = lines;
  const [shown, setShown] = useState(lines);
  // 板のテクスチャ再描画は最大 1 秒に 1 回。100ms の tick ごとに描き直すと 13 枚分で重くなるため
  useEffect(() => {
    const t = setInterval(() => {
      if (latest.current.join('\n') !== shown.join('\n')) setShown(latest.current);
    }, 1000);
    return () => clearInterval(t);
  }, [shown]);
  const tex = useMemo(() => {
    const { canvas, tex: t } = makeCanvasTexture(512, 320);
    drawText(canvas, shown.map((text, i) => ({ text, color: i === 0 ? '#aef3ff' : '#e8ecff', size: i === 0 ? 52 : 42 })), { bg: 'rgba(16,20,40,0.92)' });
    t.needsUpdate = true;
    return t;
  }, [shown]);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame(({ gl, camera }) => {
    if (!group.current) return;
    uprightQuaternion(gl.xr.isPresenting ? gl.xr.getCamera() : camera, group.current.quaternion);
    if (group.current.parent) group.current.quaternion.premultiply(group.current.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
  });
  return (
    <group ref={group} position={position} userData={onOpen ? { hint, use: onOpen } : { noRay: true }}>
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[2.6, 1.7]} />
        <meshBasicMaterial color="#0d1128" />
      </mesh>
      <mesh>
        <planeGeometry args={[2.4, 1.5]} />
        <meshBasicMaterial map={tex} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

// ---- 前面操作パネル（親が WindowLayer のウィンドウ中身として描く DOM） ----

const panelStyle: React.CSSProperties = { color: '#e8ecff', fontSize: 14, lineHeight: 1.6 };
const btnStyle: React.CSSProperties = {
  margin: '2px 6px 2px 0', padding: '6px 12px', borderRadius: 6, border: '1px solid #4f7dff',
  background: '#1b2a5e', color: '#e8ecff', cursor: 'pointer',
};
const mockBadge: React.CSSProperties = {
  display: 'inline-block', marginLeft: 8, padding: '0 8px', borderRadius: 10,
  background: '#5c4a1e', color: '#ffe9a8', fontSize: 12,
};

function Btn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" style={{ ...btnStyle, opacity: disabled ? 0.45 : 1, cursor: disabled ? 'default' : 'pointer' }} onClick={onClick} disabled={disabled}>{label}</button>;
}

function Foot({ onClose }: { onClose?: () => void }) {
  return (
    <p style={{ color: '#9aa3c7', fontSize: 12 }}>
      閉じたらキャンバスをクリックすると 3D 操作に戻ります。
      {onClose && <Btn label="閉じて3Dへ戻る" onClick={() => { onClose(); emitAdFeedback({ kind: 'navigate' }); }} />}
    </p>
  );
}

/** 照準＋クリックで開く操作パネル。ポインターロック中は DOM を触れないので、
//  3D 側の use() が開くと同時に exitPointerLock し、親がこのパネルを前面に出す。
//  Big Crunch の確認ダイアログはここでは出さず、親が action 呼び出し前に確認する責務とする */
export function AntimatterSpacePanel({ target, snapshot, actions, isOwn, onClose }: {
  target: AdPanelTarget; snapshot: AdLabSnapshot; actions: AdActions; isOwn: boolean; onClose?: () => void;
}) {
  const own = isOwn;
  if (target === 'core') {
    return (
      <div style={panelStyle}>
        <h3>反物質コア</h3>
        <p>反物質：{snapshot.antimatterText}</p>
        <p>生産：{snapshot.perSecondText} / 秒</p>
        <p>Infinity Point：{snapshot.infinityPointsText}（到達 {snapshot.infinities} 回）</p>
        {actions.buyMaxAll && <Btn label="すべて Max" onClick={actions.buyMaxAll} disabled={!own} />}
        <Foot onClose={onClose} />
      </div>
    );
  }
  if (target === 'tickspeed') {
    return (
      <div style={panelStyle}>
        <h3>Tickspeed</h3>
        <p>現在：{snapshot.tickspeedText}（購入 {snapshot.tickspeedBought} 回）</p>
        <Btn label="購入" onClick={actions.buyTickspeed} disabled={!own} />
        {actions.buyMaxTickspeed && <Btn label="Max" onClick={actions.buyMaxTickspeed} disabled={!own} />}
        <Foot onClose={onClose} />
      </div>
    );
  }
  if (target === 'boost') {
    return (
      <div style={panelStyle}>
        <h3>Dimension Boost / Shift</h3>
        <p>現在の Boost：{snapshot.boosts} 回</p>
        <p>要件：{snapshot.boostRequirementText}</p>
        <p>{t('adRequirementCurrentAmount', snapshot.boostCurrentAmountText)}</p>
        <Btn label="Boost を実行" onClick={actions.dimensionalBoost} disabled={!own || !snapshot.canBoost} />
        <Foot onClose={onClose} />
      </div>
    );
  }
  if (target === 'sacrifice') {
    return (
      <div style={panelStyle}>
        <h3>Dimensional Sacrifice</h3>
        <p>{snapshot.sacrificeUnlocked ? `現在の倍率：${snapshot.sacrificeText}` : 'Boost 5 回で解放されます'}</p>
        <Btn label="Sacrifice を実行" onClick={actions.sacrifice} disabled={!own || !snapshot.canSacrifice} />
        <Foot onClose={onClose} />
      </div>
    );
  }
  if (target === 'galaxy') {
    return (
      <div style={panelStyle}>
        <h3>Antimatter Galaxy</h3>
        <p>現在の銀河：{snapshot.galaxies} 個</p>
        <p>要件：{snapshot.galaxyRequirementText}</p>
        <p>{t('adRequirementCurrentAmount', snapshot.galaxyCurrentAmountText)}</p>
        <Btn label="Galaxy を実行" onClick={actions.antimatterGalaxy} disabled={!own || !snapshot.canGalaxy} />
        <Foot onClose={onClose} />
      </div>
    );
  }
  if (target === 'crunch') {
    return (
      <div style={panelStyle}>
        <h3>Big Crunch / Infinity</h3>
        <p>{snapshot.canCrunch ? '到達しています。実行すると IP +1 され、次元がリセットされます。' : '反物質 1.79e308 到達で実行できます。'}</p>
        <Btn label="Big Crunch を実行" onClick={actions.prestigeInfinity} disabled={!own || !snapshot.canCrunch} />
        <Foot onClose={onClose} />
      </div>
    );
  }
  if (target.startsWith('dimension-')) {
    const tier = Number(target.slice('dimension-'.length));
    const view = snapshot.dimensions[tier - 1];
    if (!view) return <div style={panelStyle}>次元が見つかりません</div>;
    return (
      <div style={panelStyle}>
        <h3>第{tier}次元</h3>
        {view.locked ? (
          <p>未解放です。Boost を進めると解放されます。</p>
        ) : (
          <>
            <p>所持：{view.amountText}（購入 {view.bought} 個）</p>
            <p>生産：{view.productionText} / 秒</p>
            <p>次コスト：{view.nextCostText}</p>
            <Btn label="1個" onClick={() => actions.buyDimension(tier)} disabled={!own} />
            <Btn label="10個まで" onClick={() => actions.buyDimensionUpTo(tier, 10)} disabled={!own} />
            <Btn label="Max" onClick={() => actions.buyDimensionMax(tier)} disabled={!own} />
          </>
        )}
        <Foot onClose={onClose} />
      </div>
    );
  }
  const exhibit = ANTIMATTER_EXHIBITS.find((e) => e.id === target);
  return (
    <div style={panelStyle}>
      <h3>{exhibit?.title ?? '展示'}<span style={mockBadge}>モック</span></h3>
      <p>Infinity 層以降の展示です。購入ボタンはまだ実装されていません。</p>
      <Btn label="購入（モック）" onClick={() => undefined} disabled />
      <Foot onClose={onClose} />
    </div>
  );
}
