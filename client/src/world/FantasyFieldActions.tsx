import { ReasonButton } from './FantasyActionButton.tsx';
import { useState } from 'react';
import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_WORLD_TIME_RATE } from '../../../shared/fantasy.ts';
import { FANTASY_LOCATIONS } from '../../../shared/fantasy-data.ts';
import { FANTASY_SETTLEMENTS, fantasyBuildings } from '../../../shared/fantasy-town.ts';
import { FANTASY_BOAT_OPTIONS, fantasyBoatError, fantasyFishingOptions, fantasyGatheringOptions, fantasySkinError } from '../../../shared/fantasy-gathering.ts';
import { fantasyCombatHuntOptions } from '../../../shared/fantasy-combat-challenges.ts';
import { fantasyEnvironmentActionError } from '../../../shared/fantasy-environment.ts';
import { fantasyTerrainActivities } from '../../../shared/fantasy-terrain.ts';
import { fantasyCampingKit } from '../../../shared/fantasy-camping.ts';
import { useLocale } from '../locale.ts';

type Locale = 'ko' | 'en' | 'ja';
type Props = { c: FantasyCharacter; onAction: (action: FantasyAction) => void; blocked: boolean };

const COPY = {
  ko: { explore: '주변 탐색', help: '마을 일손 돕기', work: '직업 일하기', farm: '공동 농장 일하기', camp: '노숙', gather: '채집과 채광', hunt: '사냥과 해체', terrain: '이곳에서 할 수 있는 일', strong: '강적', huntNow: '사냥하기', skin: '사냥감 해체', noCarcass: '이곳에 해체할 신선한 사냥감이 없습니다.', darkness: '어두운 곳에서는 랜턴이나 어둠에 적응한 감각이 필요합니다.', fishing: '낚시', pier: '부두 낚시', sea: '바다 낚시', start: '시작', boat: '어선 준비', owned: '어선 보유 중', rented: '대여 어선', seaNeed: '바다 낚시는 귀항까지 사용할 수 있는 어선이 필요합니다.', noGold: '금화가 부족합니다.', boatReady: '이미 사용할 수 있는 어선이 있습니다.', boatTime: '대여 기간: 게임 24시간', forever: '기한 없이 사용', danger: '구조가 어려운 지역입니다. 사망하면 이번 삶이 끝날 수 있습니다.' },
  en: { explore: 'Explore nearby', help: 'Help the settlement', work: 'Practice your profession', farm: 'Work the communal fields', camp: 'Camp', gather: 'Gather and mine', hunt: 'Hunt and skin', terrain: 'Activities here', strong: 'Formidable', huntNow: 'Hunt', skin: 'Skin your quarry', noCarcass: 'There is no fresh quarry to skin here.', darkness: 'Dark places require a lantern or senses adapted to darkness.', fishing: 'Fishing', pier: 'Pier fishing', sea: 'Sea fishing', start: 'Begin', boat: 'Arrange a fishing boat', owned: 'Fishing boat owned', rented: 'Rented fishing boat', seaNeed: 'Sea fishing needs a boat available until you return to port.', noGold: 'Not enough gold.', boatReady: 'You already have an available boat.', boatTime: 'Rental term: 24 game hours', forever: 'No rental expiry', danger: 'Rescue is difficult here. Dying may end this life.' },
  ja: { explore: '周辺を探索', help: '町の手伝い', work: '職業の仕事', farm: '共同の畑仕事', camp: '野宿', gather: '採集と採掘', hunt: '狩猟と解体', terrain: 'この場所でできること', strong: '強敵', huntNow: '狩る', skin: '獲物を解体', noCarcass: 'ここには解体できる新しい獲物がありません。', darkness: '暗い場所にはランタンか暗所に適した感覚が必要です。', fishing: '釣り', pier: '桟橋釣り', sea: '海釣り', start: '始める', boat: '漁船の手配', owned: '漁船を所有中', rented: '借りている漁船', seaNeed: '海釣りには帰港まで使える漁船が必要です。', noGold: '金貨が足りません。', boatReady: 'すでに使える漁船があります。', boatTime: '貸出期間：ゲーム内24時間', forever: '期限なしで使用', danger: '救助の難しい地域です。倒れると今回の人生が終わることがあります。' },
};

function duration(hours: number, locale: Locale): string {
  const seconds = Math.ceil(hours * 3600 / FANTASY_WORLD_TIME_RATE);
  const real = seconds < 60 ? (locale === 'ko' ? `실제 ${seconds}초` : locale === 'en' ? `${seconds} real sec` : `実時間${seconds}秒`)
    : locale === 'ko' ? `실제 ${Math.ceil(seconds / 60)}분` : locale === 'en' ? `${Math.ceil(seconds / 60)} real min` : `実時間${Math.ceil(seconds / 60)}分`;
  return `${hours} h · ${real}`;
}

export function FantasyFishingPanel({ c, onAction, blocked }: Props) {
  const [locale] = useLocale();
  const t = COPY[locale];
  const place = FANTASY_LOCATIONS.find(place => place.id === c.location);
  if (c.job !== 'fisher' || !place?.services.includes('port')) return null;
  const disabled = blocked || c.hp <= 0;
  const darkness = !!fantasyEnvironmentActionError(c, { type: 'fish', mode: 'pier' });
  const boat = c.fishingBoat;
  const rental = boat?.kind === 'rented' && (boat.expiresAt ?? 0) > c.hour;
  return <section>
    <h3>{t.fishing}</h3>
    {darkness && <p role="status"><small>{t.darkness}</small></p>}
    {fantasyFishingOptions(c).map(option => <div className="fr-service-row" key={option.mode}>
      <span>{option.mode === 'sea' ? t.sea : t.pier}<small>{duration(option.hours, locale)}{!option.available ? ` · ${t.seaNeed}` : ''}</small></span>
      <ReasonButton type="button" className="fr-btn" disabled={disabled || darkness || !option.available} title={darkness ? t.darkness : !option.available ? t.seaNeed : undefined} onClick={() => onAction({ type: 'fish', mode: option.mode })}>{t.start}</ReasonButton>
    </div>)}
    {fantasyBuildings(c).some(building => building.id === 'shipyard') && <details style={{ marginTop: 10 }}>
      <summary>{t.boat}</summary>
      {(boat?.kind === 'owned' || rental) && <p><small>{boat?.kind === 'owned' ? t.owned : `${t.rented} · ${duration(Math.max(0, (boat?.expiresAt ?? 0) - c.hour), locale)}`}</small></p>}
      {FANTASY_BOAT_OPTIONS.map(option => {
        const error = fantasyBoatError(c, option.mode);
        const reason = error ? c.gold < option.price ? t.noGold : t.boatReady : undefined;
        return <div className="fr-service-row" key={option.mode}>
          <span>{option.name[locale]}<small>{duration(0.25, locale)} · {option.mode === 'rent' ? t.boatTime : t.forever}</small></span><b>{option.price} G</b>
          <ReasonButton type="button" className="fr-btn" disabled={disabled || !!error} title={reason} onClick={() => onAction({ type: 'boat', mode: option.mode })}>{t.start}</ReasonButton>
        </div>;
      })}
    </details>}
  </section>;
}

export function FantasyFieldActions({ c, onAction, blocked }: Props) {
  const [locale] = useLocale();
  const [monsterId, setMonsterId] = useState('');
  const t = COPY[locale];
  const place = FANTASY_LOCATIONS.find(place => place.id === c.location);
  const gathering = fantasyGatheringOptions(c).filter(option => option.available);
  const targets = fantasyCombatHuntOptions(c);
  const target = targets.find(target => target.id === monsterId) ?? targets[0];
  const activities = fantasyTerrainActivities(c);
  const settled = !!FANTASY_SETTLEMENTS[c.location];
  const darkness = !!fantasyEnvironmentActionError(c, { type: 'explore' });
  const disabled = blocked || c.hp <= 0;
  const canSkin = !fantasySkinError(c);
  const row = (id: string, label: string, action: FantasyAction, hours: number, mp = 0) => {
    const dark = !!fantasyEnvironmentActionError(c, action);
    return <div className="fr-service-row" key={id}>
      <span>{label}<small>{duration(hours, locale)}{mp ? ` · ${mp} MP` : ''}</small></span>
      <ReasonButton type="button" className="fr-btn" disabled={disabled || dark || c.mp < mp} reason={blocked?undefined:dark?t.darkness:c.mp<mp?{ko:'MP가 부족합니다.',en:'Not enough MP.',ja:'MPが足りません。'}[locale]:c.hp<=0?{ko:'먼저 회복해야 합니다.',en:'Recover first.',ja:'先に回復が必要です。'}[locale]:undefined} aria-label={label} onClick={() => onAction(action)}>{t.start}</ReasonButton>
    </div>;
  };
  return <div>
    {darkness && <p role="status"><small>{t.darkness}</small></p>}
    {place && (['cave', 'island'].includes(place.kind) || place.danger >= 3) && <p><small>{t.danger}</small></p>}
    {row('explore', t.explore, { type: 'explore' }, 3)}
    {settled && row('work', c.job === 'farmer' && (place?.kind === 'city' || c.location === 'loom-village') ? t.farm : c.job === 'unassigned' ? t.help : t.work, { type: 'work' }, 4)}
    {gathering.length > 0 && <details style={{ marginTop: 12 }} open>
      <summary>{t.gather}</summary>
      {gathering.map(option => row(option.resource, option.name[locale], { type: 'gather', resource: option.resource }, option.hours))}
    </details>}
    {(targets.length > 0 || canSkin) && <details style={{ marginTop: 12 }}>
      <summary>{t.hunt}</summary>
      {target && <div className="fr-service-row">
        <span><select aria-label={t.hunt} value={target.id} onChange={event => setMonsterId(event.target.value)} disabled={disabled} style={{ maxWidth: '100%', padding: '6px 8px', color: 'inherit', background: '#fffbed', border: '1px solid #555', borderRadius: 6 }}>
          {targets.map(monster => <option key={monster.id} value={monster.id}>{monster.names[locale]}{monster.tier >= 5 ? ` · ${t.strong}` : ''}</option>)}
        </select><small>{{ko:'턴 전투',en:'Turn combat',ja:'ターン戦闘'}[locale]} · {target.tier >= 5 ? `${t.strong} · ` : ''}Tier {target.tier}</small></span>
        <ReasonButton type="button" className="fr-btn" disabled={disabled || darkness} title={darkness ? t.darkness : undefined} onClick={() => onAction({ type: 'hunt', monster: target.id })}>{t.huntNow}</ReasonButton>
      </div>}
      {canSkin ? row('skin', t.skin, { type: 'skin' }, 1) : <p><small>{t.noCarcass}</small></p>}
    </details>}
    {activities.length > 0 && <details style={{ marginTop: 12 }}>
      <summary>{t.terrain}</summary>
      {activities.map(activity => row(activity.id, activity.names[locale], { type: 'terrain', activity: activity.id }, activity.hours, activity.mp))}
    </details>}
    <FantasyFishingPanel c={c} onAction={onAction} blocked={blocked}/>
    <div className="fr-action-grid" style={{ marginTop: 16 }}><ReasonButton type="button" className="fr-btn" disabled={disabled} onClick={() => onAction({ type: 'rest' })}>{t.camp} · {duration(8, locale)}<small className="fr-service-effects">{{ko:'피로',en:'Fatigue',ja:'疲労'}[locale]} -{fantasyCampingKit(c).fatigue} · HP +20% · MP +{Math.round(fantasyCampingKit(c).mp*100)}%</small></ReasonButton></div>
  </div>;
}
