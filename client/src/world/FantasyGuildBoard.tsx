import { fantasyCombatEnemy } from '../../../shared/fantasy-combat-catalog.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { useEffect } from 'react';
import { FANTASY_WORLD_TIME_RATE, type FantasyAction, type FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_ITEMS, FANTASY_QUESTS } from '../../../shared/fantasy-data.ts';
import { FANTASY_TERMS, fantasyTermName } from '../../../shared/fantasy-lore.ts';
import { NPC_PUBLIC } from '../../../shared/npc.ts';
import { fantasyKnownLocations } from '../../../shared/fantasy-town.ts';
import { fantasyQuestEligible } from '../../../shared/fantasy-access.ts';
import { fantasyQuestText } from '../../../shared/fantasy-narrative.ts';
import { fantasyContractErrorText, FANTASY_CONTRACT_CYCLE, FANTASY_CONTRACT_RAID_PARTICIPANTS } from '../../../shared/fantasy-contracts.ts';
import { fantasyGuildRankName } from '../../../shared/fantasy-adventurer.ts';
import { fantasyQuestGrade } from '../../../shared/fantasy-quest-grades.ts';
import { fantasyRegisteredGuildGrade, fantasyCanRegisterGuild } from '../../../shared/fantasy-guild-progression.ts';
import { useLocale } from '../locale.ts';
import { useStore } from '../store.ts';
import { send } from '../net/ws.ts';
import { gameClock } from './fantasy-copy.ts';
import { fantasyTaskObjectiveLabel } from '../../../shared/fantasy-task-progress.ts';
import { fantasyInstitutionEligible, fantasyInstitutionName, fantasyInstitutionPresent, type FantasyInstitution } from '../../../shared/fantasy-institutions.ts';
import { fantasyInstitutionBoardOffers } from './fantasy-institution-board.ts';

export function FantasyGuildBoard({ c, onAction, blocked, source = 'guild', npc }: { c: FantasyCharacter; onAction: (action: FantasyAction) => void; blocked: boolean; source?: FantasyInstitution; npc?: string }) {
  const [locale] = useLocale();
  const board = useStore(s => s.fantasyContractBoard);
  const error = useStore(s => s.fantasyContractError);
  const connected = useStore(s => s.wsConnected);
  const clock = useStore(s => s.fantasyClock);
  const hasGuild = fantasyInstitutionPresent({ ...c, hour: clock?.hour ?? c.hour }, source) && (!npc || NPC_PUBLIC.some(row => row.id === npc && row.homeLocation === c.location && !row.travelOnly));
  const cycle = Math.floor((clock?.hour ?? c.hour) / FANTASY_CONTRACT_CYCLE);
  const accepted = c.quests.join(','); const completed = c.completed.join(',');
  useEffect(() => { if (connected && hasGuild) send({ t: 'fantasyContracts' }); }, [c.location, c.job, c.race, accepted, completed, connected, hasGuild, cycle, source, npc]);
  const t = {
    ko: { title: '길드 의뢰 게시판', refresh: '새로 확인', guild: '현재 지역의 길드에서 게시판을 확인할 수 있습니다.', loading: '게시판을 확인하고 있습니다.', disconnected: '연결을 기다리고 있습니다.', empty: '지금 수락할 수 있는 게시물이 없습니다. 시간이 지나면 새 의뢰가 올라옵니다.', issuer: '의뢰인', dialogue: '의뢰인의 요청', destination: '조사·토벌 지역', delivery: '납품·보고', broker: '수락 중개 길드', unknown: '아직 모르는 장소', reward: '기본 보상', posting: '게시 종료', deadline: '납품 기한', remaining: '남음', minutes: '실제 분', exclusive: '선착순 한 명', raid: '공동 토벌', people: '명 참가', accept: '수락', join: '공동 참가', taken: '다른 플레이어가 선점함', mine: '수락한 의뢰', expired: '게시 기간 종료', details: '목표 확인', hunt: '토벌', goods: '필요 물품', locked: '현재 수락 조건이 맞지 않습니다.' },
    en: { title: 'Guild contract board', refresh: 'Refresh', guild: 'Visit the local guild to view the board.', loading: 'Checking the board.', disconnected: 'Waiting for a connection.', empty: 'No postings can be accepted now. New contracts appear over time.', issuer: 'Issuer', dialogue: 'The issuer’s request', destination: 'Visit or hunt area', delivery: 'Delivery or report', broker: 'Broker guild', unknown: 'An unknown place', reward: 'Base reward', posting: 'Posting closes', deadline: 'Delivery deadline', remaining: 'remaining', minutes: 'real min', exclusive: 'One claimant', raid: 'Cooperative raid', people: 'participants', accept: 'Accept', join: 'Join raid', taken: 'Claimed by another player', mine: 'Accepted', expired: 'Posting expired', details: 'View objective', hunt: 'Hunt', goods: 'Required goods', locked: 'You do not currently meet the conditions.' },
    ja: { title: 'ギルドの依頼掲示板', refresh: '更新', guild: '現地のギルドで掲示板を確認できます。', loading: '掲示板を確認中です。', disconnected: '接続を待っています。', empty: '今は受けられる掲載がありません。時間がたつと新しい依頼が出ます。', issuer: '依頼人', dialogue: '依頼人のお願い', destination: '調査・討伐の場所', delivery: '納品・報告', broker: '受注を仲介するギルド', unknown: 'まだ知らない場所', reward: '基本報酬', posting: '掲載終了', deadline: '納品期限', remaining: '残り', minutes: '実時間の分', exclusive: '先着一人', raid: '共同討伐', people: '人が参加', accept: '受ける', join: '共同参加', taken: 'ほかのプレイヤーが受注済み', mine: '受注済み', expired: '掲載終了', details: '目標を確認', hunt: '討伐', goods: '必要な品', locked: '現在の受注条件が整っていません。' },
  }[locale];
  const scheduleText = {
    "ko": {
      "rank": "길드 권장 등급",
      "warning": "의뢰 전체 전력이 현재 길드 평가보다 높습니다. 동료와 충분히 준비하세요.",
      "starts": "공동토벌 집결 시각",
      "waiting": "토벌 현장에 집결해 시작할 수 있습니다.",
      "waitUntil": "집결 시각 이후 토벌 현장에서 시작할 수 있습니다.",
      "start": "현장에서 공동토벌 시작",
      "join": "길드 공동토벌 참가",
      "afterStart": "전투 시작 후 게임 시간 36시간",
      "cycle": "일반 의뢰는 게임 시간 2시간마다 갱신됩니다. 예약 공동토벌은 시작할 때까지 유지됩니다.",
      "consent": "길드에서 참가 신청 후 토벌 현장으로 이동하세요. 집결 시각 이후 같은 현장에서 전투 가능한 참가자들과 출전하며, 실제 시작 전까지 신청할 수 있습니다."
    },
    "en": {
      "rank": "Recommended guild rank",
      "warning": "The whole contract exceeds your current guild assessment. Prepare carefully with companions.",
      "starts": "Raid muster time",
      "waiting": "Muster at the hunt site to begin.",
      "waitUntil": "Start at the hunt site after the muster time.",
      "start": "Start raid on site",
      "join": "Participate in guild raid",
      "afterStart": "36 game hours after the battle starts",
      "cycle": "Ordinary contracts refresh every 2 game hours. Scheduled raids remain until started.",
      "consent": "Sign up at the guild, then travel to the hunt site. After muster, available participants at the same site depart together. Signups stay open until the raid starts."
    },
    "ja": {
      "rank": "ギルド推奨等級",
      "warning": "依頼全体の戦力が現在のギルド評価を超えています。仲間と十分に準備してください。",
      "starts": "共同討伐の集合時刻",
      "waiting": "討伐現場に集結して開始できます。",
      "waitUntil": "集合時刻以降、討伐現場で開始できます。",
      "start": "現地で共同討伐を開始",
      "join": "ギルド共同討伐に参加",
      "afterStart": "戦闘開始からゲーム時間で36時間",
      "cycle": "通常依頼はゲーム時間で2時間ごとに更新されます。予約した共同討伐は開始まで残ります。",
      "consent": "ギルドで参加を申し込んだ後、討伐現場へ移動してください。集合時刻以降、同じ現場で戦える参加者と出発します。実際に始まるまでは参加できます。"
    }
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
  const offers = fantasyInstitutionBoardOffers(current?.offers ?? [], source, npc);
  const title = fantasyInstitutionName(source, locale);
  const venueText = { ko: '해당 의뢰를 맡기는 현지 시설이나 의뢰인을 찾아가세요.', en: 'Visit the local facility or issuer handling these contracts.', ja: 'この依頼を扱う現地の施設か依頼人を訪ねてください。' }[locale];
  return <section className="fr-guild-board">
    <div className="fr-section-title"><h2>{title}</h2><ReasonButton type="button" className="fr-text-button" disabled={!connected || !hasGuild} reason={!hasGuild?venueText:undefined} onClick={() => send({ t: 'fantasyContracts' })}>{t.refresh}</ReasonButton></div>
    <p className="fr-muted">{source === 'guild' ? { ko: '현재 길드에 등록할 수 있는 직업의 등록 회원이 직접 수락할 수 있습니다.', en: 'Registered members in a profession eligible for the guild may accept these contracts.', ja: '現在ギルドに登録できる職の登録会員が直接受注できます。' }[locale] : source === 'temple' ? { ko: '현재 사제만 신전의 의뢰를 직접 맡을 수 있습니다.', en: 'Current priests may accept temple commissions.', ja: '現在の司祭が神殿の依頼を直接受けられます。' }[locale] : source === 'underworld' ? { ko: '현재 뒷세계 직업으로 연락책의 의뢰를 맡을 수 있습니다.', en: 'Current underworld professions may take a contact’s contracts.', ja: '現在の裏稼業で連絡役の依頼を受けられます。' }[locale] : { ko: '주민의 개인적인 부탁은 직업과 관계없이 조건을 갖추면 맡을 수 있습니다.', en: 'Residents’ personal requests are open to any profession that meets their conditions.', ja: '住民の個人的な頼みは、条件を満たせば職を問わず受けられます。' }[locale]}</p>
    <p className="fr-muted">{scheduleText.cycle}</p>
    {error && <p className="fr-muted" role="alert">{fantasyContractErrorText(error, locale)}</p>}
    {!hasGuild ? <p>{venueText}</p> : !connected ? <p>{t.disconnected}</p> : !current ? <p role="status">{t.loading}</p> : !offers.length ? <p>{t.empty}</p> : offers.map(offer => {
      const quest = FANTASY_QUESTS.find(quest => quest.id === offer.quest);
      const issuer = NPC_PUBLIC.find(npc => npc.id === offer.issuer);
      if (!quest || !issuer) return null;
      const text = fantasyQuestText(quest, locale);
      const scheduled = offer.mode === 'raid' && offer.startsAt !== undefined;
      const ready = scheduled && hour >= offer.startsAt! && offer.startedAt === undefined;
      const expired = hour >= offer.expiresAt;
      const full = scheduled && !offer.mine && offer.participants >= FANTASY_CONTRACT_RAID_PARTICIPANTS;
      const grade = offer.grade ?? fantasyQuestGrade(quest);
      const overRank = source === 'guild' && fantasyCanRegisterGuild(c) && grade > fantasyRegisteredGuildGrade(c);
      const eligible = fantasyQuestEligible(c, quest) && fantasyInstitutionEligible(c, source);
      const taken = !offer.available && !offer.mine;
      const monster = quest.objective?.type==='hunt'&&quest.objective.monster?fantasyCombatEnemy(quest.objective.monster):undefined;
      const item = FANTASY_ITEMS.find(item => item.id === quest.item);
      return <article className="fr-card" key={offer.id}>
        <div className="fr-section-title"><h3>{mask(text.name)}</h3><span className="fr-tag">{offer.mode === 'raid' ? t.raid : t.exclusive}</span></div>
        {source === 'guild' && grade !== undefined && <p>{scheduleText.rank}: <strong>{fantasyGuildRankName(grade, locale)}</strong></p>}
        {overRank && <p className="fr-muted" role="status">{scheduleText.warning}</p>}
        <p>{t.issuer}: <strong>{issuer.name[locale]}</strong> <small>{issuer.role[locale]}</small></p>
        <details><summary>{t.dialogue}</summary><blockquote>{mask(quest.dialogue?.[locale] ?? text.description)}</blockquote></details>
        <p className="fr-muted">{title}: {location(offer.boardLocation)}<br />{t.delivery}: {location(quest.reportAt ?? quest.giver)}</p>
        <details><summary>{t.details}</summary><p>{t.destination}: {location(quest.destination)}</p><p>{fantasyTaskObjectiveLabel(quest,locale) ?? (quest.objective?.type === 'hunt' ? `${t.hunt}: ${monster?.names[locale] ?? '—'} ×${quest.objective.count}` : `${t.goods}: ${item?.names?.[locale] ?? fantasyTermName(quest.item, locale)} ×${quest.count}`)}</p></details>
        <p>{t.reward}: {offer.gold} G · {quest.xp} XP</p>
        <p className="fr-muted">{!scheduled && <>{t.posting}: {gameClock(offer.expiresAt, locale)} · {t.remaining}: {remaining(offer.expiresAt)}<br /></>}{t.deadline}: {scheduled && offer.startedAt === undefined ? scheduleText.afterStart : gameClock(offer.deadline, locale)}</p>
        {scheduled && <p className="fr-muted">{scheduleText.consent}</p>}
        {scheduled && <p>{scheduleText.starts}: <strong>{gameClock(offer.startsAt!, locale)}</strong><br /><span className="fr-muted">{ready ? scheduleText.waiting : remaining(offer.startsAt!)}</span></p>}
        {offer.mode === 'raid' && <p className="fr-muted">{offer.participants}/{FANTASY_CONTRACT_RAID_PARTICIPANTS} {t.people}</p>}
        {(taken || offer.mine || expired || !eligible) && <p className="fr-muted" role="status">{full ? fantasyContractErrorText('full', locale) : offer.mine ? t.mine : expired ? t.expired : taken ? t.taken : t.locked}</p>}
        <ReasonButton type="button" className="fr-btn primary" disabled={blocked || !connected || expired || !offer.available || !eligible} reason={blocked||!connected?undefined:full?fantasyContractErrorText('full', locale):expired?t.expired:offer.mine?t.mine:taken?t.taken:!eligible?t.locked:undefined} onClick={() => onAction({ type: 'accept', quest: quest.id, offer: offer.id })}>{scheduled ? scheduleText.join : offer.mode === 'raid' ? t.join : t.accept}</ReasonButton>
        {scheduled && offer.mine && c.location===quest.destination && <ReasonButton type="button" className="fr-btn primary" disabled={blocked || !connected || !ready} reason={!ready ? scheduleText.waitUntil : undefined} onClick={() => onAction({ type: 'guildRaidStart', offer: offer.id })}>{scheduleText.start}</ReasonButton>}
      </article>;
    })}
  </section>;
}
