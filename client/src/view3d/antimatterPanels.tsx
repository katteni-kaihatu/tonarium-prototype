import { t, useLanguage } from '../i18n/index.ts';
// antimatter の空間内ボードと前面操作パネル。
// 購入ロジックはここに置かない。AdActions は親が engine.mjs の呼び出し（buyDimension /
// buyMaxDimension / buyTickspeed / dimensionalBoost / antimatterGalaxy / sacrifice /
// prestigeInfinity）とセーブへ結ぶ、ただ1つの口である。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ANTIMATTER_EXHIBITS, type AdLabSnapshot, type AdPanelTarget } from '../../../shared/antimatterLayout.ts';
import { makeCanvasTexture } from './textTexture.ts';
import { drawAdBoard } from './antimatterText.ts';
import { adExhibitTitle } from '../ad/labView.ts';
import { emitAdFeedback } from '../ad/feedback.ts';
import { uprightQuaternion } from '../xr/pose.ts';


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
  const language = useLanguage();
  const group = useRef<THREE.Group>(null);
  const latest = useRef(lines);
  latest.current = lines;
  const [shown, setShown] = useState({ language, lines });
  const visible = shown.language === language ? shown.lines : lines;
  useEffect(() => {
    setShown(previous => previous.language === language ? previous : { language, lines: latest.current });
  }, [language]);
  // 板のテクスチャ再描画は最大 1 秒に 1 回。100ms の tick ごとに描き直すと 13 枚分で重くなるため
  useEffect(() => {
    const t = setInterval(() => {
      if (language !== shown.language || latest.current.join('\n') !== shown.lines.join('\n')) setShown({ language, lines: latest.current });
    }, 1000);
    return () => clearInterval(t);
  }, [shown, language]);
  const tex = useMemo(() => {
    const { canvas, tex: t } = makeCanvasTexture(512, 320);
    drawAdBoard(canvas, visible);
    t.needsUpdate = true;
    return t;
  }, [visible, language]);
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

const panelStyle: React.CSSProperties = { color: '#e8ecff', fontSize: 14, lineHeight: 1.6, overflowWrap: 'anywhere' };
const btnStyle: React.CSSProperties = {
  margin: '2px 6px 2px 0', padding: '6px 12px', borderRadius: 6, border: '1px solid #4f7dff',
  background: '#1b2a5e', color: '#e8ecff', cursor: 'pointer', maxWidth: '100%', whiteSpace: 'normal', overflowWrap: 'anywhere',
};
const mockBadge: React.CSSProperties = {
  display: 'inline-block', marginLeft: 8, padding: '0 8px', borderRadius: 10,
  background: '#5c4a1e', color: '#ffe9a8', fontSize: 12,
};

function Btn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" style={{ ...btnStyle, opacity: disabled ? 0.45 : 1, cursor: disabled ? 'default' : 'pointer' }} onClick={onClick} disabled={disabled}>{label}</button>;
}

function Foot({ onClose }: { onClose?: () => void }) {
  useLanguage();
  return (
    <p style={{ color: '#9aa3c7', fontSize: 12 }}>
      {t('adLabText99')}
      {onClose && <Btn label={t('adLabText112')} onClick={() => { onClose(); emitAdFeedback({ kind: 'navigate' }); }} />}
    </p>
  );
}

/** 照準＋クリックで開く操作パネル。ポインターロック中は DOM を触れないので、
//  3D 側の use() が開くと同時に exitPointerLock し、親がこのパネルを前面に出す。
//  Big Crunch の確認ダイアログはここでは出さず、親が action 呼び出し前に確認する責務とする */
export function AntimatterSpacePanel({ target, snapshot, actions, isOwn, onClose }: {
  target: AdPanelTarget; snapshot: AdLabSnapshot; actions: AdActions; isOwn: boolean; onClose?: () => void;
}) {
  useLanguage();
  const own = isOwn;
  if (target === 'core') {
    return (
      <div style={panelStyle}>
        <h3>{t('adLabText88')}</h3>
        <p>{t('adLabText100', snapshot.antimatterText)}</p>
        <p>{t('adLabText101', snapshot.perSecondText)}</p>
        <p>{t('adLabText102', snapshot.infinityPointsText, snapshot.infinities)}</p>
        {actions.buyMaxAll && <Btn label={t('adLabText113')} onClick={actions.buyMaxAll} disabled={!own} />}
        <Foot onClose={onClose} />
      </div>
    );
  }
  if (target === 'tickspeed') {
    return (
      <div style={panelStyle}>
        <h3>Tickspeed</h3>
        <p>{t('adLabText103', snapshot.tickspeedText, snapshot.tickspeedBought)}</p>
        <Btn label={t('adLabText114')} onClick={actions.buyTickspeed} disabled={!own} />
        {actions.buyMaxTickspeed && <Btn label="Max" onClick={actions.buyMaxTickspeed} disabled={!own} />}
        <Foot onClose={onClose} />
      </div>
    );
  }
  if (target === 'boost') {
    return (
      <div style={panelStyle}>
        <h3>Dimension Boost / Shift</h3>
        <p>{t('adLabText104', snapshot.boosts)}</p>
        <p>{t('adLabText105', snapshot.boostRequirementText)}</p>
        <p>{t('adRequirementCurrentAmount', snapshot.boostCurrentAmountText)}</p>
        <Btn label={t('adLabText115')} onClick={actions.dimensionalBoost} disabled={!own || !snapshot.canBoost} />
        <Foot onClose={onClose} />
      </div>
    );
  }
  if (target === 'sacrifice') {
    return (
      <div style={panelStyle}>
        <h3>Dimensional Sacrifice</h3>
        <p>{snapshot.sacrificeUnlocked ? t('adLabText116', snapshot.sacrificeText) : t('adLabText117')}</p>
        <Btn label={t('adLabText118')} onClick={actions.sacrifice} disabled={!own || !snapshot.canSacrifice} />
        <Foot onClose={onClose} />
      </div>
    );
  }
  if (target === 'galaxy') {
    return (
      <div style={panelStyle}>
        <h3>Antimatter Galaxy</h3>
        <p>{t('adLabText106', snapshot.galaxies)}</p>
        <p>{t('adLabText105', snapshot.galaxyRequirementText)}</p>
        <p>{t('adRequirementCurrentAmount', snapshot.galaxyCurrentAmountText)}</p>
        <Btn label={t('adLabText119')} onClick={actions.antimatterGalaxy} disabled={!own || !snapshot.canGalaxy} />
        <Foot onClose={onClose} />
      </div>
    );
  }
  if (target === 'crunch') {
    return (
      <div style={panelStyle}>
        <h3>Big Crunch / Infinity</h3>
        <p>{snapshot.canCrunch ? t('adLabText120') : t('adLabText121')}</p>
        <Btn label={t('adLabText122')} onClick={actions.prestigeInfinity} disabled={!own || !snapshot.canCrunch} />
        <Foot onClose={onClose} />
      </div>
    );
  }
  if (target.startsWith('dimension-')) {
    const tier = Number(target.slice('dimension-'.length));
    const view = snapshot.dimensions[tier - 1];
    if (!view) return <div style={panelStyle}>{t('adLabText107')}</div>;
    return (
      <div style={panelStyle}>
        <h3>{t('adLabText13', tier)}</h3>
        {view.locked ? (
          <p>{t('adLabText108')}</p>
        ) : (
          <>
            <p>{t('adLabText109', view.amountText, view.bought)}</p>
            <p>{t('adLabText101', view.productionText)}</p>
            <p>{t('adLabText110', view.nextCostText)}</p>
            <Btn label={t('adLabText123')} onClick={() => actions.buyDimension(tier)} disabled={!own} />
            <Btn label={t('adLabText124')} onClick={() => actions.buyDimensionUpTo(tier, 10)} disabled={!own} />
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
      <h3>{exhibit ? adExhibitTitle(exhibit.id) : t('adLabText125')}<span style={mockBadge}>{t('ui1154')}</span></h3>
      <p>{t('adLabText111')}</p>
      <Btn label={t('adLabText126')} onClick={() => undefined} disabled />
      <Foot onClose={onClose} />
    </div>
  );
}
