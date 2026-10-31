import { t, useLanguage, msg, type UiMessage } from '../../i18n/index.ts';
import type { AntimatterSlice } from './types.ts';
import { formatNumber } from './format.ts';
import { s } from './styles.ts';
import { LabArt } from './LabArt.tsx';

export function ActionBar({ ad, notice }: { ad: AntimatterSlice; notice: (message: UiMessage) => void }) {
  useLanguage();
  const { derived, game } = ad;
  const boost = derived.boost;
  const galaxy = derived.galaxy;
  const sacrifice = derived.sacrifice;
  const infinity = derived.infinity;

  const onGalaxy = () => {
    if (!window.confirm(t('adLabText32'))) return;
    if (ad.antimatterGalaxy()) notice(msg('adLabText33'));
  };
  const onBigCrunch = () => {
    if (!window.confirm(t('adLabText34', infinity.gain))) return;
    const gained = ad.prestigeInfinity();
    if (gained) notice(msg('adLabText35', gained));
  };
  const onSacrifice = () => {
    if (ad.sacrifice()) notice(msg('adLabText36', formatNumber(game.sacrificeBoost)));
    else notice(msg('adLabText37'));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="ad-upgrade" style={{ background: 'linear-gradient(105deg, #202d49, #241e3a)', border: '1px solid #8572e64d', borderRadius: 14, padding: 10 }}>
        <div className="ad-upgrade-description">
          <div className="ad-upgrade-heading"><LabArt kind="boost" size={40} /><b>Dimension Boost / Shift</b></div>
          <div className="ad-upgrade-status" style={s.muted}>
            <span>{t('adRequired')}: {t('adLabText13', boost.tier)}</span>
            <span className="ad-number">{formatNumber(boost.amount)}</span>
            <span>{t('adCurrent')}</span><span className="ad-number">{formatNumber(boost.currentAmount)}</span>
            <span className="ad-upgrade-summary">{t('adLabText46', game.dimensionalBoosts)}</span>
          </div>
        </div>
        <button style={s.btn} disabled={!boost.can} onClick={() => { if (ad.dimensionalBoost()) notice(msg('adLabText38')); }}>{t('adLabText26')}</button>
      </div>
      <div className="ad-upgrade" style={{ background: 'linear-gradient(105deg, #202d49, #241e3a)', border: '1px solid #8572e64d', borderRadius: 14, padding: 10 }}>
        <div className="ad-upgrade-description">
          <div className="ad-upgrade-heading"><LabArt kind="galaxy" size={40} /><b>Antimatter Galaxy</b></div>
          <div className="ad-upgrade-status" style={s.muted}>
            <span>{t('adRequired')}: {t('adLabText13', galaxy.tier)}</span>
            <span className="ad-number">{formatNumber(galaxy.amount)}</span>
            <span>{t('adCurrent')}</span><span className="ad-number">{formatNumber(galaxy.currentAmount)}</span>
            <span className="ad-upgrade-summary">{t('adLabText47', game.galaxies)}</span>
          </div>
        </div>
        <button style={s.btn} disabled={!galaxy.can} onClick={onGalaxy}>{t('adLabText28')}</button>
      </div>
      <div className="ad-upgrade" style={{ background: 'linear-gradient(105deg, #202d49, #241e3a)', border: '1px solid #8572e64d', borderRadius: 14, padding: 10 }}>
        <div className="ad-upgrade-description">
          <div className="ad-upgrade-heading"><LabArt kind="reactor" size={40} /><b>Dimensional Sacrifice</b></div>
          <div className="ad-upgrade-status" style={s.muted}>
            <span>{t('adMultiplier')} · {t('adLabText13', 8)}</span><span className="ad-number">×{formatNumber(sacrifice.boost)}</span>
            <span className="ad-upgrade-summary">{sacrifice.unlocked ? t('adLabText39') : t('adLabText40', sacrifice.boosts)}</span>
          </div>
        </div>
        <button style={s.btn} disabled={!(sacrifice.unlocked && sacrifice.can)} onClick={onSacrifice}>{t('adLabText30')}</button>
      </div>
      <div className="ad-upgrade" style={{ background: 'linear-gradient(105deg, #202d49, #241e3a)', border: '1px solid #8572e64d', borderRadius: 14, padding: 10 }}>
        <div className="ad-upgrade-description">
          <div className="ad-upgrade-heading"><LabArt kind="singularity" size={40} /><b>Big Crunch（Infinity）</b></div>
          <div className="ad-upgrade-status" style={s.muted}>
            <span className="ad-upgrade-summary">{infinity.can ? t('adLabText41', infinity.gain) : t('adLabText42')}</span>
            <span>IP</span><span className="ad-number">{formatNumber(game.infinityPoints)}</span>
            <span className="ad-upgrade-summary">{t('adLabText48', game.infinities)}</span>
          </div>
        </div>
        <button style={s.btn} disabled={!infinity.can} onClick={onBigCrunch}>{t('adLabText31')}</button>
      </div>
    </div>
  );
}
