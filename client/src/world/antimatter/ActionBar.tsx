import { t, useLanguage, msg, type UiMessage } from '../../i18n/index.ts';
import type { AntimatterSlice, BigNum } from './types.ts';
import { formatNumber } from './format.ts';
import { s } from './styles.ts';
import { LabArt, type LabArtKind } from './LabArt.tsx';
import { confirmAd } from './confirmAd.tsx';

function Card({ art, title, children, label, can, onClick }: {
  art: LabArtKind; title: string; children: React.ReactNode; label: string; can: boolean; onClick: () => void;
}) {
  return (
    <div className="ad-card">
      <div className="ad-card-head"><LabArt kind={art} size={28} /><b>{title}</b></div>
      <div className="ad-card-body">{children}</div>
      <button type="button" style={s.btn} disabled={!can} onClick={onClick}>{label}</button>
    </div>
  );
}

function Requirement({ tier, amount, current }: { tier: number; amount: number; current: BigNum }) {
  return <>
    <span style={s.muted}>{t('adLabText13', tier)}</span>
    <span className="ad-number ad-card-value">{`${formatNumber(current)} / ${amount}`}</span>
  </>;
}

export function ActionBar({ ad, notice }: { ad: AntimatterSlice; notice: (message: UiMessage) => void }) {
  useLanguage();
  const { derived, game } = ad;
  const { boost, galaxy, sacrifice, infinity } = derived;

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

  return (
    <div className="ad-cards">
      <Card art="boost" title="Dimension Boost" label={t('adLabText26')} can={boost.can} onClick={() => { if (ad.dimensionalBoost()) notice(msg('adLabText38')); }}>
        <Requirement tier={boost.tier} amount={boost.amount} current={boost.currentAmount} />
      </Card>
      <Card art="galaxy" title="Antimatter Galaxy" label={t('adLabText28')} can={galaxy.can} onClick={onGalaxy}>
        <Requirement tier={galaxy.tier} amount={galaxy.amount} current={galaxy.currentAmount} />
      </Card>
      <Card art="reactor" title="Sacrifice" label={t('adLabText30')} can={sacrifice.unlocked && sacrifice.can} onClick={onSacrifice}>
        {sacrifice.unlocked
          ? <span className="ad-number ad-card-value">{t('adLabText331', formatNumber(sacrifice.boost), formatNumber(sacrifice.next))}</span>
          : <><span className="ad-number ad-card-value">×{formatNumber(sacrifice.boost)}</span><span style={s.muted}>{t('adLabText40', sacrifice.boosts)}</span></>}
      </Card>
      {(game.infinities > 0 || infinity.can) && (
        <Card art="singularity" title="Big Crunch" label={t('adLabText31')} can={infinity.can} onClick={onBigCrunch}>
          <span style={s.muted}>IP</span>
          <span className="ad-number ad-card-value">{formatNumber(game.infinityPoints)}</span>
          {infinity.can ? <span style={s.muted}>{t('adLabText41', infinity.gain)}</span> : <span style={s.muted}>{t('adLabText42')}</span>}
        </Card>
      )}
    </div>
  );
}
