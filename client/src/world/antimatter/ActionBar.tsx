import { useId, type CSSProperties, type ReactNode } from 'react';
import { t, useLanguage, msg, type UiMessage } from '../../i18n/index.ts';
import { bigLog10 } from '../../ad/engine.mjs';
import { Icon, type IconName } from '../Icon.tsx';
import type { AntimatterSlice, BigNum } from './types.ts';
import { formatNumber } from './format.ts';
import { s } from './styles.ts';
import { confirmAd } from './confirmAd.tsx';
import { AutoToggle } from './AutoToggle.tsx';
import { digitRatio, percent, ratio, remaining } from './progress.ts';

interface Effect { label: string; now: string; next: string }

interface Tip {
  desc: string;
  need: string;
  have: string;
  left?: string;
  effects: Effect[];
  resets: string[];
  keep: string;
}

interface CardProps {
  kind: string;
  icon: IconName;
  title: string;
  fullTitle?: string;
  count?: string;
  value: string;
  valueLabel: string;
  reqLabel: string;
  reqText: string;
  progress: number;
  label: string;
  can: boolean;
  onClick: () => void;
  tip: Tip;
  auto?: ReactNode;
}

export function tickspeedText(value: BigNum): string {
  return value.exponent >= 4 ? formatNumber(value) : (value.mantissa * 10 ** value.exponent).toFixed(2);
}

function ActionCard({ kind, icon, title, fullTitle, count, value, valueLabel, reqLabel, reqText, progress, label, can, onClick, tip, auto }: CardProps) {
  const tipId = useId();
  return (
    <div className={`adlab-action${can ? ' is-ready' : ''}`} data-kind={kind}>
      <div className="adlab-action-head"><Icon name={icon} size={15} /><b>{title}</b>{count && <span className="adlab-action-count">{count}</span>}</div>
      <div className="adlab-action-value adlab-number" title={`${value} ${valueLabel}`}>{value}<span>{valueLabel}</span></div>
      <div className="adlab-action-req-text" title={`${reqLabel} ${reqText}`}><span>{reqLabel}</span><span className="adlab-number">{reqText}</span></div>
      <div className="adlab-action-buttons">
        <button type="button" className="adlab-action-run" style={{ ...s.btn, '--ad-fill': percent(progress) } as CSSProperties} disabled={!can} onClick={onClick} aria-describedby={tipId}>{label}</button>
        {auto}
      </div>
      <TipBody id={tipId} title={fullTitle ?? title} ready={can} tip={tip} progress={progress} />
    </div>
  );
}

function TipBody({ id, title, ready, tip, progress }: { id: string; title: string; ready: boolean; tip: Tip; progress: number }) {
  return (
    <div className="adlab-tip" role="tooltip" id={id}>
      <div className="adlab-tip-head"><b>{title}</b><span className={`adlab-tip-state${ready ? ' is-ready' : ''}`}>{t(ready ? 'adUiTipReady' : 'adUiTipNotYet')}</span></div>
      <p className="adlab-tip-desc">{tip.desc}</p>
      <TipSection title={t('adUiTipNeed')}>
        <div className="adlab-tip-row"><span>{tip.need}</span><b className="adlab-number">{tip.have}</b></div>
        <div className="adlab-bar" aria-hidden="true"><span style={{ width: percent(progress) }} /></div>
        {tip.left && <span className="adlab-tip-note">{tip.left}</span>}
      </TipSection>
      <TipSection title={t('adUiTipEffect')}>
        {tip.effects.map(effect => (
          <div key={effect.label} className="adlab-tip-row">
            <span>{effect.label}</span>
            <span className="adlab-tip-change adlab-number">{effect.now}<Icon name="arrowRight" size={11} /><b>{effect.next}</b></span>
          </div>
        ))}
      </TipSection>
      <TipSection title={t('adUiTipReset')}>
        <div className="adlab-tip-chips">{tip.resets.map(item => <span key={item}>{item}</span>)}</div>
        <span className="adlab-tip-note">{tip.keep}</span>
      </TipSection>
    </div>
  );
}

function TipSection({ title, children }: { title: string; children: ReactNode }) {
  return <div className="adlab-tip-section"><span className="adlab-tip-label">{title}</span>{children}</div>;
}

export function ActionBar({ ad, notice }: { ad: AntimatterSlice; notice: (message: UiMessage) => void }) {
  useLanguage();
  const { derived, game } = ad;
  const { boost, galaxy, sacrifice, infinity, preview } = derived;

  const onGalaxy = async () => {
    if (!await confirmAd(t('adLabText32'))) return;
    if (ad.antimatterGalaxy()) notice(msg('adLabText33'));
  };
  const onBigCrunch = async () => {
    if (!await confirmAd(t('adLabText34', infinity.gain))) return;
    const gained = ad.prestigeInfinity();
    if (gained) notice(msg('adLabText35', gained));
  };
  const onSacrifice = () => {
    if (ad.sacrifice()) notice(msg('adLabText36', formatNumber(game.sacrificeBoost)));
    else notice(msg('adLabText37'));
  };

  const resAntimatter = t('adUiResAntimatter');
  const resDims = t('adUiResDims');
  const amountLeft = (current: BigNum, amount: number) => {
    const left = remaining(current, amount);
    return left > 0 ? t('adUiLeftCount', left) : undefined;
  };
  const antimatterLog = bigLog10(game.antimatter);
  const infinityDigits = Math.max(0, Math.floor(antimatterLog));
  const infinityGoal = Math.floor(preview.infinityThresholdLog10);
  const tickProgress = ratio(game.antimatter, derived.tickspeedCost);
  const boostProgress = ratio(boost.currentAmount, boost.amount);
  const galaxyProgress = ratio(galaxy.currentAmount, galaxy.amount);
  const sacrificeProgress = sacrifice.unlocked ? ratio(sacrifice.next, preview.sacrificeNeeded) : Math.min(1, sacrifice.boosts / 5);
  const crunchProgress = infinity.can ? 1 : digitRatio(Math.max(0, antimatterLog), preview.infinityThresholdLog10);

  return (
    <div className="adlab-actions">
      <ActionCard
        kind="tick" auto={<AutoToggle ad={ad} id="tickspeed" />} icon="gauge" title="Tickspeed" count={t('adUiTimes', derived.tickspeedBought)}
        value={`×${tickspeedText(derived.tickspeedValue)}`} valueLabel={t('adUiAllDims')}
        reqLabel={resAntimatter} reqText={`${formatNumber(game.antimatter)} / ${formatNumber(derived.tickspeedCost)}`} progress={tickProgress}
        label={t('adBuyTickspeed')} can={derived.tickspeedAffordable} onClick={() => ad.buyTickspeed()}
        tip={{
          desc: t('adUiTipTick'),
          need: `${resAntimatter} ${formatNumber(derived.tickspeedCost)}`, have: formatNumber(game.antimatter),
          effects: [
            { label: t('adUiEffAllSpeed'), now: `×${tickspeedText(derived.tickspeedValue)}`, next: `×${tickspeedText(preview.tickspeedNext)}` },
            { label: t('adUiEffPerPurchase'), now: `×${derived.tickspeedPerPurchase.toFixed(4)}`, next: `×${derived.tickspeedPerPurchase.toFixed(4)}` },
          ],
          resets: [t('adUiTipNoReset')], keep: t('adUiKeepTick'),
        }}
      />
      <ActionCard
        kind="boost" auto={<AutoToggle ad={ad} id="boost" />} icon="rocket" title="Boost" fullTitle="Dimension Boost" count={t('adUiTimes', game.dimensionalBoosts)}
        value={`×${formatNumber(preview.boostFirst)}`} valueLabel={t('adLabText13', 1)}
        reqLabel={t('adLabText13', boost.tier)} reqText={`${formatNumber(boost.currentAmount)} / ${boost.amount}`} progress={boostProgress}
        label={t('adLabText26')} can={boost.can} onClick={() => { if (ad.dimensionalBoost()) notice(msg('adLabText38')); }}
        tip={{
          desc: t('adUiTipBoost'),
          need: t('adUiNeedDims', t('adLabText13', boost.tier), boost.amount), have: formatNumber(boost.currentAmount), left: amountLeft(boost.currentAmount, boost.amount),
          effects: [
            { label: t('adLabText13', 1), now: `×${formatNumber(preview.boostFirst)}`, next: `×${formatNumber(preview.boostFirstNext)}` },
            { label: t('adUiEffBoosts'), now: String(game.dimensionalBoosts), next: String(game.dimensionalBoosts + 1) },
          ],
          resets: [resAntimatter, resDims, 'Tickspeed'], keep: t('adUiKeepBoost'),
        }}
      />
      <ActionCard
        kind="galaxy" auto={<AutoToggle ad={ad} id="galaxy" />} icon="galaxy" title="Galaxy" fullTitle="Antimatter Galaxy" count={t('adUiGalaxyCount', game.galaxies)}
        value={`×${derived.tickspeedPerPurchase.toFixed(4)}`} valueLabel={t('adUiPerTick')}
        reqLabel={t('adLabText13', galaxy.tier)} reqText={`${formatNumber(galaxy.currentAmount)} / ${galaxy.amount}`} progress={galaxyProgress}
        label={t('adLabText28')} can={galaxy.can} onClick={onGalaxy}
        tip={{
          desc: t('adUiTipGalaxy'),
          need: t('adUiNeedDims', t('adLabText13', galaxy.tier), galaxy.amount), have: formatNumber(galaxy.currentAmount), left: amountLeft(galaxy.currentAmount, galaxy.amount),
          effects: [
            { label: t('adUiEffTickPer'), now: `×${derived.tickspeedPerPurchase.toFixed(4)}`, next: `×${preview.galaxyPerPurchaseNext.toFixed(4)}` },
            { label: t('adUiEffGalaxies'), now: String(game.galaxies), next: String(game.galaxies + 1) },
          ],
          resets: [resAntimatter, resDims, 'Tickspeed', 'Boost', 'Sacrifice'], keep: t('adUiKeepGalaxy'),
        }}
      />
      <ActionCard
        kind="sacrifice" icon="flame" title="Sacrifice"
        value={`×${formatNumber(sacrifice.boost)}`} valueLabel={t('adLabText13', 8)}
        reqLabel={sacrifice.unlocked ? t('adUiNextMult') : 'Boost'}
        reqText={sacrifice.unlocked ? `×${formatNumber(sacrifice.next)} / ×${formatNumber(preview.sacrificeNeeded)}` : `${sacrifice.boosts} / 5`}
        progress={sacrificeProgress}
        label={t('adLabText30')} can={sacrifice.unlocked && sacrifice.can} onClick={onSacrifice}
        tip={{
          desc: t('adUiTipSacrifice'),
          need: sacrifice.unlocked ? t('adUiSacNeed', formatNumber(preview.sacrificeNeeded)) : t('adLabText40', sacrifice.boosts),
          have: sacrifice.unlocked ? `×${formatNumber(sacrifice.next)}` : `${sacrifice.boosts} / 5`,
          effects: [{ label: t('adLabText13', 8), now: `×${formatNumber(sacrifice.boost)}`, next: `×${formatNumber(sacrifice.next)}` }],
          resets: [t('adUiResLowDims')], keep: t('adUiKeepSacrifice'),
        }}
      />
      <ActionCard
        kind="crunch" auto={<AutoToggle ad={ad} id="crunch" />} icon="infinity" title="Big Crunch" count={t('adUiTimes', game.infinities)}
        value={`+${infinity.gain} IP`} valueLabel={t('adUiNow')}
        reqLabel={resAntimatter} reqText={`e${infinityDigits} / e${infinityGoal}`} progress={crunchProgress}
        label={t('adLabText31')} can={infinity.can} onClick={onBigCrunch}
        tip={{
          desc: t('adUiTipCrunch'),
          need: `${resAntimatter} 1.79e308`, have: formatNumber(game.antimatter),
          left: infinity.can ? undefined : t('adUiLeftDigits', Math.max(0, infinityGoal - infinityDigits)),
          effects: [
            { label: 'IP', now: formatNumber(game.infinityPoints), next: `+${Math.max(1, infinity.gain)}` },
            ...(game.infinities === 0 ? [{ label: t('adInfinityTab'), now: t('adLocked'), next: t('adUiUnlocked') }] : []),
          ],
          resets: [resAntimatter, resDims, 'Tickspeed', 'Boost', t('adUiResGalaxy'), 'Sacrifice'], keep: t('adUiKeepCrunch'),
        }}
      />
    </div>
  );
}
