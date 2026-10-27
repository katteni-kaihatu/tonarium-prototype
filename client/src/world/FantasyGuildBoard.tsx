import { ReasonButton } from './FantasyActionButton.tsx';
import { useEffect } from 'react';
import { FANTASY_WORLD_TIME_RATE, type FantasyAction, type FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_ITEMS, FANTASY_QUESTS } from '../../../shared/fantasy-data.ts';
import { FANTASY_TERMS, fantasyTermName } from '../../../shared/fantasy-lore.ts';
import { FANTASY_MONSTERS } from '../../../shared/fantasy-monsters.ts';
import { NPC_PUBLIC } from '../../../shared/npc.ts';
import { fantasyBuildings, fantasyKnownLocations } from '../../../shared/fantasy-town.ts';
import { fantasyQuestEligible } from '../../../shared/fantasy-access.ts';
import { fantasyQuestText } from '../../../shared/fantasy-narrative.ts';
import { fantasyContractErrorText } from '../../../shared/fantasy-contracts.ts';
import { useLocale } from '../locale.ts';
import { useStore } from '../store.ts';
import { send } from '../net/ws.ts';
import { gameClock } from './fantasy-copy.ts';
import { fantasyTaskObjectiveLabel } from '../../../shared/fantasy-task-progress.ts';

export function FantasyGuildBoard({ c, onAction, blocked }: { c: FantasyCharacter; onAction: (action: FantasyAction) => void; blocked: boolean }) {
  const [locale] = useLocale();
  const board = useStore(s => s.fantasyContractBoard);
  const error = useStore(s => s.fantasyContractError);
  const connected = useStore(s => s.wsConnected);
  const clock = useStore(s => s.fantasyClock);
  const hasGuild = fantasyBuildings(c).some(building => building.id === 'guild');
  const accepted = c.quests.join(','); const completed = c.completed.join(',');
  useEffect(() => { if (connected && hasGuild) send({ t: 'fantasyContracts' }); }, [c.location, c.job, c.race, accepted, completed, connected, hasGuild]);
  const t = {
    ko: { title: '길드 의뢰 게시판', refresh: '새로 확인', guild: '현재 지역의 길드에서 게시판을 확인할 수 있습니다.', loading: '게시판을 확인하고 있습니다.', disconnected: '연결을 기다리고 있습니다.', empty: '지금 수락할 수 있는 게시물이 없습니다. 시간이 지나면 새 의뢰가 올라옵니다.', issuer: '의뢰인', dialogue: '의뢰인의 요청', destination: '조사·토벌 지역', delivery: '납품·보고', broker: '수락 중개 길드', unknown: '아직 모르는 장소', reward: '기본 보상', posting: '게시 종료', deadline: '납품 기한', remaining: '남음', minutes: '실제 분', exclusive: '선착순 한 명', raid: '공동 토벌', people: '명 참가', accept: '수락', join: '공동 참가', taken: '다른 플레이어가 선점함', mine: '수락한 의뢰', expired: '게시 기간 종료', details: '목표 확인', hunt: '토벌', goods: '필요 물품', locked: '현재 수락 조건이 맞지 않습니다.' },
    en: { title: 'Guild contract board', refresh: 'Refresh', guild: 'Visit the local guild to view the board.', loading: 'Checking the board.', disconnected: 'Waiting for a connection.', empty: 'No postings can be accepted now. New contracts appear over time.', issuer: 'Issuer', dialogue: 'The issuer’s request', destination: 'Visit or hunt area', delivery: 'Delivery or report', broker: 'Broker guild', unknown: 'An unknown place', reward: 'Base reward', posting: 'Posting closes', deadline: 'Delivery deadline', remaining: 'remaining', minutes: 'real min', exclusive: 'One claimant', raid: 'Cooperative raid', people: 'participants', accept: 'Accept', join: 'Join raid', taken: 'Claimed by another player', mine: 'Accepted', expired: 'Posting expired', details: 'View objective', hunt: 'Hunt', goods: 'Required goods', locked: 'You do not currently meet the conditions.' },
    ja: { title: 'ギルドの依頼掲示板', refresh: '更新', guild: '現地のギルドで掲示板を確認できます。', loading: '掲示板を確認中です。', disconnected: '接続を待っています。', empty: '今は受けられる掲載がありません。時間がたつと新しい依頼が出ます。', issuer: '依頼人', dialogue: '依頼人のお願い', destination: '調査・討伐の場所', delivery: '納品・報告', broker: '受注を仲介するギルド', unknown: 'まだ知らない場所', reward: '基本報酬', posting: '掲載終了', deadline: '納品期限', remaining: '残り', minutes: '実時間の分', exclusive: '先着一人', raid: '共同討伐', people: '人が参加', accept: '受ける', join: '共同参加', taken: 'ほかのプレイヤーが受注済み', mine: '受注済み', expired: '掲載終了', details: '目標を確認', hunt: '討伐', goods: '必要な品', locked: '現在の受注条件が整っていません。' },
  }[locale];
  const known = fantasyKnownLocations(c);
  const location = (id: string) => known.includes(id) ? fantasyTermName(id, locale) : t.unknown;
  const unknownNames = FANTASY_TERMS.filter(term => term.category === 'place' && !known.includes(term.id)).flatMap(term => [...Object.values(term.names), ...Object.values(term.aliases ?? {}).flat()]).filter(name => name.length > 1).sort((a, b) => b.length - a.length);
  const mask = (text: string) => unknownNames.reduce((out, name) => out.split(name).join(t.unknown), text);
  const hour = clock?.hour ?? c.hour;
  const remaining = (end: number) => {
    const minutes = Math.max(0, Math.ceil((end - hour) * 60 / FANTASY_WORLD_TIME_RATE));
    return { ko: `실제 약 ${minutes}분`, en: `About ${minutes} real min`, ja: `実時間 約${minutes}分` }[locale];
  };
  const current = board?.location === c.location ? board : null;
  return <section className="fr-guild-board">
    <div className="fr-section-title"><h2>{t.title}</h2><ReasonButton type="button" className="fr-text-button" disabled={!connected || !hasGuild} reason={!hasGuild?t.guild:undefined} onClick={() => send({ t: 'fantasyContracts' })}>{t.refresh}</ReasonButton></div>
    {error && <p className="fr-muted" role="alert">{fantasyContractErrorText(error, locale)}</p>}
    {!hasGuild ? <p>{t.guild}</p> : !connected ? <p>{t.disconnected}</p> : !current ? <p role="status">{t.loading}</p> : !current.offers.length ? <p>{t.empty}</p> : current.offers.map(offer => {
      const quest = FANTASY_QUESTS.find(quest => quest.id === offer.quest);
      const issuer = NPC_PUBLIC.find(npc => npc.id === offer.issuer);
      if (!quest || !issuer) return null;
      const text = fantasyQuestText(quest, locale);
      const expired = hour >= offer.expiresAt;
      const eligible = fantasyQuestEligible(c, quest);
      const taken = !offer.available && !offer.mine;
      const monster = FANTASY_MONSTERS.find(monster => quest.objective?.type === 'hunt' && monster.id === quest.objective.monster);
      const item = FANTASY_ITEMS.find(item => item.id === quest.item);
      return <article className="fr-card" key={offer.id}>
        <div className="fr-section-title"><h3>{mask(text.name)}</h3><span className="fr-tag">{offer.mode === 'raid' ? t.raid : t.exclusive}</span></div>
        <p>{t.issuer}: <strong>{issuer.name[locale]}</strong> <small>{issuer.role[locale]}</small></p>
        <details><summary>{t.dialogue}</summary><blockquote>{mask(quest.dialogue?.[locale] ?? text.description)}</blockquote></details>
        <p className="fr-muted">{t.broker}: {location(offer.boardLocation)}<br />{t.delivery}: {location(quest.giver)}</p>
        <details><summary>{t.details}</summary><p>{t.destination}: {location(quest.destination)}</p><p>{fantasyTaskObjectiveLabel(quest,locale) ?? (quest.objective?.type === 'hunt' ? `${t.hunt}: ${monster?.names[locale] ?? '—'} ×${quest.objective.count}` : `${t.goods}: ${item?.names?.[locale] ?? fantasyTermName(quest.item, locale)} ×${quest.count}`)}</p></details>
        <p>{t.reward}: {offer.gold} G · {quest.xp} XP</p>
        <p className="fr-muted">{t.posting}: {gameClock(offer.expiresAt, locale)} · {t.remaining}: {remaining(offer.expiresAt)}<br />{t.deadline}: {gameClock(offer.deadline, locale)}</p>
        {offer.mode === 'raid' && <p className="fr-muted">{offer.participants} {t.people}</p>}
        {(taken || offer.mine || expired || !eligible) && <p className="fr-muted" role="status">{expired ? t.expired : offer.mine ? t.mine : taken ? t.taken : t.locked}</p>}
        <ReasonButton type="button" className="fr-btn primary" disabled={blocked || !connected || expired || !offer.available || !eligible} reason={blocked||!connected?undefined:expired?t.expired:offer.mine?t.mine:taken?t.taken:!eligible?t.locked:undefined} onClick={() => onAction({ type: 'accept', quest: quest.id, offer: offer.id })}>{offer.mode === 'raid' ? t.join : t.accept}</ReasonButton>
      </article>;
    })}
  </section>;
}
