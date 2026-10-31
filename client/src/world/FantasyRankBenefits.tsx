import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_ITEMS } from '../../../shared/fantasy-data.ts';
import { FANTASY_MAPS } from '../../../shared/fantasy-town.ts';
import { fantasyGuildRankName } from '../../../shared/fantasy-adventurer.ts';
import { fantasyPriestRankName } from '../../../shared/fantasy-priest-ranks.ts';
import {
  fantasyRankBenefitActionError, fantasyRankBenefitGrade, fantasyRankBenefits, fantasyRankBenefitTitle,
  type FantasyRankBenefitAction, type FantasyRankBenefitSource,
} from '../../../shared/fantasy-rank-benefits.ts';
import { useLocale } from '../locale.ts';
import { fantasyCanRegisterGuild } from '../../../shared/fantasy-guild-progression.ts';
import { useStore } from '../store.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { realDuration } from './FantasyActivity.tsx';

export function FantasyRankBenefits({ c, source, blocked, onAction }: {
  c: FantasyCharacter; source: FantasyRankBenefitSource; blocked: boolean; onAction: (action: FantasyAction) => void;
}) {
  const [locale] = useLocale();
  const hour = useStore(state => state.fantasyClock?.hour) ?? c.hour;
  const beds = useStore(state=>state.fantasyRealm?.economy.location===c.location?state.fantasyRealm.economy.templeBeds:undefined);
  const pending = useStore(state => state.fantasyPending || !state.wsConnected);
  const t = {
    ko: { title: source === 'adventurer' ? '모험가 등급 혜택' : '성직 등급 혜택', current: '현재 등급', locked: '필요 등급', ready: '이용 가능', automatic: '자동 적용', daily: '세계 하루 1회 · 인물별', used: '오늘 이용함', claimed: '수령 완료', rent: '보증금으로 빌리기', return: '장비 반환 · 30G 환급', loaned: '대여 중 · 보증금 30G', buy: '구입하기', receive: '받기', rest: '무료로 묵기', honor: '보유 명예 칭호', wrong: '사제로 활동하면 성직 등급 혜택을 이용할 수 있습니다.', clock: '하루 횟수는 세계 시각의 자정에 갱신됩니다. 소지품을 받으려면 가방에 무게와 칸의 여유가 필요합니다.' },
    en: { title: source === 'adventurer' ? 'Adventurer rank benefits' : 'Clergy rank benefits', current: 'Current rank', locked: 'Required rank', ready: 'Available', automatic: 'Automatic', daily: 'Once per world day · per character', used: 'Used today', claimed: 'Received', rent: 'Borrow with deposit', return: 'Return equipment · refund 30G', loaned: 'On loan · 30G deposit', buy: 'Buy', receive: 'Receive', rest: 'Stay free', honor: 'Honorary titles', wrong: 'Serve as a priest to use clergy rank benefits.', clock: 'Daily allowances reset at world midnight. Receiving goods requires enough bag weight and item slots.' },
    ja: { title: source === 'adventurer' ? '冒険者等級の特典' : '聖職等級の特典', current: '現在の等級', locked: '必要等級', ready: '利用可能', automatic: '自動適用', daily: '世界の一日一回・人物ごと', used: '本日利用済み', claimed: '受領済み', rent: '保証金で借りる', return: '道具を返す・30G返金', loaned: '貸出中・保証金30G', buy: '購入', receive: '受け取る', rest: '無料で泊まる', honor: '所持する名誉称号', wrong: '司祭として活動すると聖職等級の特典を利用できます。', clock: '一日の回数は世界時刻の午前0時に更新。品物の受領には鞄の重さと枠に余裕が必要です。' },
  }[locale];
  const present = { ...c, hour }, grade = fantasyRankBenefitGrade(present, source);
  const rankName = (value: number) => source === 'adventurer' ? fantasyGuildRankName(value as Parameters<typeof fantasyGuildRankName>[0], locale) : fantasyPriestRankName(value as Parameters<typeof fantasyPriestRankName>[0], locale);
  const itemName = (id: string) => FANTASY_ITEMS.find(item => item.id === id)?.names?.[locale] ?? FANTASY_MAPS.find(map => map.item === id)?.name[locale] ?? id;
  const button = (action: FantasyRankBenefitAction, label: string) => {
    const reason = action.type==='rankBenefitClaim'&&action.benefit==='temple-lodging'&&beds===0?{ko:'신전의 순례자 침상이 모두 사용 중입니다.',en:'The temple’s pilgrim beds are occupied.',ja:'神殿の巡礼者用寝床は満床です。'}[locale]:fantasyRankBenefitActionError(present, action, locale);
    return <ReasonButton type="button" className="fr-btn" disabled={blocked || pending || !!reason} reason={blocked || pending ? undefined : reason} onClick={() => onAction(action)}>{label}</ReasonButton>;
  };
  const titles = (c.rankBenefits?.titles ?? []).filter(id => source === 'adventurer' ? id === 'guild-master' : id === 'temple-archpriest');
  if (source === 'adventurer' && !fantasyCanRegisterGuild(c)) return c.rankBenefits?.loans?.['guild-rental']
    ? <section className="fr-card">{button({ type: 'rankBenefitReturn', benefit: 'guild-rental' }, t.return)}</section> : null;
  return <section className="fr-card fr-rank-benefits">
    <h3>{t.title}</h3>
    {grade > 0 ? <p>{t.current}: <strong>{rankName(grade)}</strong></p> : <p>{t.wrong}</p>}
    {titles.length > 0 && <p>{t.honor}: {titles.map(id => fantasyRankBenefitTitle(id, locale)).join(' · ')}</p>}
    <p className="fr-muted">{t.clock}</p>
    {fantasyRankBenefits(present, source).map(benefit => <details key={benefit.id} className="fr-fold" open={benefit.unlocked && !!benefit.claim && !benefit.claimed}>
      <summary>{benefit.names[locale]} · {benefit.unlocked ? benefit.loaned ? t.loaned : benefit.claimed ? benefit.daily ? t.used : t.claimed : benefit.claim ? t.ready : t.automatic : `${t.locked}: ${rankName(benefit.grade)}`}</summary>
      <p>{benefit.descriptions[locale]}</p>
      {benefit.items && <p>{Object.entries(benefit.items).map(([id, count]) => `${itemName(id)} ×${count}`).join(' · ')}{benefit.price !== undefined && ` · ${benefit.price} G`}</p>}
      {benefit.daily && <p className="fr-muted">{t.daily}</p>}
      {benefit.claim && (benefit.loaned ? button({ type: 'rankBenefitReturn', benefit: 'guild-rental' }, t.return) : button({ type: 'rankBenefitClaim', benefit: benefit.claim }, benefit.claim === 'guild-rental' ? t.rent : benefit.claim === 'temple-lodging' ? `${t.rest} · ${realDuration(8, locale)}` : benefit.price ? `${t.buy} · ${benefit.price} G` : t.receive))}
    </details>)}
  </section>;
}
