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
      <div style={{ ...s.row, background: 'linear-gradient(105deg, #202d49, #241e3a)', border: '1px solid #8572e64d', borderRadius: 14, padding: 10 }}>
        <LabArt kind="boost" size={64} />
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <b>Dimension Boost / Shift</b>
          <div style={s.muted}>{t('adLabText25', boost.tier, formatNumber(boost.amount), boost.tier, formatNumber(boost.currentAmount), game.dimensionalBoosts)}</div>
        </div>
        <span style={{ flex: 1 }} />
        <button style={s.btn} disabled={!boost.can} onClick={() => { if (ad.dimensionalBoost()) notice(msg('adLabText38')); }}>{t('adLabText26')}</button>
      </div>
      <div style={{ ...s.row, background: 'linear-gradient(105deg, #202d49, #241e3a)', border: '1px solid #8572e64d', borderRadius: 14, padding: 10 }}>
        <LabArt kind="galaxy" size={64} />
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <b>Antimatter Galaxy</b>
          <div style={s.muted}>{t('adLabText27', galaxy.tier, formatNumber(galaxy.amount), galaxy.tier, formatNumber(galaxy.currentAmount), game.galaxies)}</div>
        </div>
        <span style={{ flex: 1 }} />
        <button style={s.btn} disabled={!galaxy.can} onClick={onGalaxy}>{t('adLabText28')}</button>
      </div>
      <div style={{ ...s.row, background: 'linear-gradient(105deg, #202d49, #241e3a)', border: '1px solid #8572e64d', borderRadius: 14, padding: 10 }}>
        <LabArt kind="reactor" size={64} />
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <b>Dimensional Sacrifice</b>
          <div style={s.muted}>{t('adLabText29', formatNumber(sacrifice.boost), sacrifice.unlocked ? t('adLabText39') : t('adLabText40', sacrifice.boosts))}</div>
        </div>
        <span style={{ flex: 1 }} />
        <button style={s.btn} disabled={!(sacrifice.unlocked && sacrifice.can)} onClick={onSacrifice}>{t('adLabText30')}</button>
      </div>
      <div style={{ ...s.row, background: 'linear-gradient(105deg, #202d49, #241e3a)', border: '1px solid #8572e64d', borderRadius: 14, padding: 10 }}>
        <LabArt kind="singularity" size={64} />
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <b>Big Crunch（Infinity）</b>
          <div style={s.muted}>{t('adInfinityStatus', infinity.can ? t('adLabText41', infinity.gain) : t('adLabText42'), formatNumber(game.infinityPoints), game.infinities)}</div>
        </div>
        <span style={{ flex: 1 }} />
        <button style={s.btn} disabled={!infinity.can} onClick={onBigCrunch}>{t('adLabText31')}</button>
      </div>
    </div>
  );
}
