import { fantasyLifeJob } from '../../../shared/fantasy-careers.ts';
import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_DUNGEONS } from '../../../shared/fantasy-dungeon-catalog.ts';
import { fantasyInteriorMapCraftError, fantasyInteriorMapUseError, fantasyInteriorMapText, fantasyInteriorMapLabel, FANTASY_INTERIOR_MAP_INPUTS } from '../../../shared/fantasy-interior-maps.ts';
import { useLocale } from '../locale.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { itemDisplayName } from './fantasy-action-help.ts';
import { realDuration } from './FantasyActivity.tsx';

type Props = { c: FantasyCharacter; blocked: boolean; onAction: (action: FantasyAction) => void };
export function FantasyInteriorMapSurvey({ c, blocked, onAction }: Props) {
  const [locale] = useLocale(), active = c.dungeon?.active;
  if (fantasyLifeJob(c) !== 'scribe' || c.jobPaths?.scribe?.path !== 'scribe-maps') return null;
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const sourceError = active ? fantasyInteriorMapCraftError(c, active.site) : undefined, error = sourceError && fantasyInteriorMapText(sourceError, locale);
  return <section className="fr-card"><h3>{say('내부 지도 기록', 'Record an interior map', '内部図を記録')}</h3>
    <p>{say('확보한 방에서 직접 걸은 방과 통로를 기록합니다. 구입한 지도에서만 본 방·숨은 함정·보상은 옮겨 적지 않습니다. 종이 사본을 시장에 팔거나 다른 여행자와 교환할 수 있습니다.', 'Record rooms and passages you personally walked through from a secured room. Rooms known only from bought maps, hidden traps and rewards are excluded. Sell the physical copy at a market or exchange it with another traveler.', '安全を確保した部屋で自ら歩いた部屋と通路を記します。購入した地図だけで知った部屋や、隠れた罠・報酬は写しません。写しは市場で売却し、旅人と交換できます。')}</p>
    <p>{Object.entries(FANTASY_INTERIOR_MAP_INPUTS).map(([id, count]) => `${itemDisplayName(id, locale)} ${c.inventory[id] ?? 0}/${count}`).join(' · ')}</p>
    {active ? <ReasonButton className="fr-btn" disabled={blocked || !!error} reason={blocked ? undefined : error} onClick={() => onAction({ type: 'interiorMapCraft', site: active.site })}>{say('지도 사본 제작', 'Craft a map copy', '地図の写しを制作')} <small>{realDuration(3, locale)}</small></ReasonButton>
      : <p className="fr-muted">{say('유적이나 던전 안에서 방을 조사하고 안전을 확보하면 제작할 수 있습니다.', 'Investigate and secure a room inside a ruin or dungeon to craft a copy.', '遺跡や洞窟内で部屋を調査し、安全を確保すると制作できます。')}</p>}
  </section>;
}
export function FantasyInteriorMapCopies({ c, blocked, onAction }: Props) {
  const [locale] = useLocale();
  return <div>{(c.interiorMaps ?? []).map(copy => {
    const sourceError = fantasyInteriorMapUseError(c, copy), error = sourceError && fantasyInteriorMapText(sourceError, locale);
    const site = FANTASY_DUNGEONS.find(site => site.id === copy.site);
    return <article className="fr-card" key={copy.id}><p>{fantasyInteriorMapLabel(copy, locale)}</p>
      <p className="fr-muted">{{ko: `조사 기록 ${copy.inspected.length}방 · ${site?.names.ko}의 배치 ${copy.layoutSeed ?? '기본'}`, en: `${copy.inspected.length} inspected rooms · ${site?.names.en} layout ${copy.layoutSeed ?? 'original'}`, ja: `調査記録${copy.inspected.length}室・${site?.names.ja}の配置${copy.layoutSeed ?? '初期'}`}[locale]}</p>
      <ReasonButton className="fr-btn" disabled={blocked || !!error} reason={blocked ? undefined : error} onClick={() => onAction({ type: 'interiorMapUse', copy: copy.id })}>{{ko: '이 사본 읽기', en: 'Read this copy', ja: 'この写しを読む'}[locale]}</ReasonButton>
    </article>;
  })}</div>;
}
