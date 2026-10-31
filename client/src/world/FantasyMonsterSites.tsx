import { useEffect, useState } from 'react';
import type { FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_APEX_PROVOCATIONS } from '../../../shared/fantasy-combat-catalog.ts';
import { fantasyCombatStartError, fantasyCombatWarningError } from '../../../shared/fantasy-combat-challenges.ts';
import { FANTASY_MONSTER_SITE_ITEMS, fantasyKnownMonsterSites, type FantasyMonsterSite } from '../../../shared/fantasy-monster-sites.ts';
import { fantasyPartyErrorText } from '../../../shared/fantasy-party.ts';
import { fantasyOnRoad } from '../../../shared/fantasy-travel.ts';
import { useLocale } from '../locale.ts';
import { set, useStore } from '../store.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { combatError } from './fantasy-combat-error.ts';
import { requestFantasyCombat } from './fantasy-combat-transport.ts';
import { requestFantasyParty } from './fantasy-party-transport.ts';

type Props = { c: FantasyCharacter; blocked: boolean };

function MonsterSite({ c, site, blocked }: Props & { site: FantasyMonsterSite }) {
  const [locale] = useLocale();
  const [confirmed, setConfirmed] = useState(false);
  const profile = useStore(state => state.fantasyProfile);
  const party = useStore(state => state.fantasyParty);
  const selfId = useStore(state => state.selfId);
  const worldHour = useStore(state => state.fantasyClock?.hour);
  const hour = Math.max(c.hour, worldHour ?? c.hour);
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const challenge = FANTASY_APEX_PROVOCATIONS.find(entry => entry.id === site.provocation);
  if (!challenge) return null;
  const warning = c.apexWarnings?.[challenge.id];
  const inspected = !!warning && warning.location === c.location && warning.hour <= hour && hour - warning.hour <= 1;
  const warningError = fantasyCombatWarningError(c, challenge.id);
  const invalid = profile ? fantasyCombatStartError({ ...profile, character: { ...c, hour } }, 'apex', challenge.id, true) : undefined;
  const needsLeader = !!party?.id && !party.members.some(member => member.id === selfId && member.isLeader);
  const startReason = needsLeader ? say('파티장만 전투를 제안할 수 있습니다.', 'Only the leader can propose a battle.', '戦闘を提案できるのはリーダーだけです。')
    : !inspected ? say('이곳의 위험한 흔적을 먼저 조사하세요. 조사 기록은 게임 1시간 동안 유효합니다.', 'Inspect the dangerous signs here first. The inspection lasts one game hour.', 'この場所の危険の兆しを先に調べてください。調査はゲーム内1時間有効です。')
    : !confirmed ? say('경고를 읽고 도전 의사를 확인하세요.', 'Read the warning and confirm your challenge.', '警告を読み、挑戦する意思を確認してください。')
    : invalid ? combatError(invalid, locale) : undefined;
  const map = FANTASY_MONSTER_SITE_ITEMS.find(item => item.id === site.item);
  return <article className="fr-combat-group">
    <h4>{site.names[locale]}</h4>
    <p><small>{site.kind === 'lair' ? say('용의 둥지', 'Dragon lair', '竜の巣') : say('유적', 'Ruins', '遺跡')} · {say(`${site.tier}등급`, `Rank ${site.tier}`, `${site.tier}級`)}</small></p>
    <p><small>{map?.names?.[locale] ?? site.names[locale]}</small></p>
    <p>{site.descriptions[locale]}</p>
    <ReasonButton type="button" className="fr-btn" disabled={blocked || !!warningError} reason={warningError ? combatError(warningError, locale) : undefined} onClick={() => {
      setConfirmed(false);
      requestFantasyCombat({ type: 'inspect', target: challenge.id });
    }}>{say('위험한 흔적 조사', 'Inspect the dangerous signs', '危険の兆しを調べる')}</ReasonButton>
    {inspected ? <>
      <p className="fr-combat-danger">{challenge.warning[locale]}</p>
      <label className="fr-combat-consent"><input type="checkbox" checked={confirmed} disabled={blocked} onChange={event => setConfirmed(event.target.checked)}/>{challenge.confirmation[locale]}</label>
    </> : <p role="status"><small>{warning ? say('조사 기록이 만료되었습니다. 다시 조사하세요.', 'The inspection has expired. Inspect the signs again.', '調査記録の期限が切れました。もう一度調べてください。') : say('흔적을 조사하면 위험과 도전 방법을 확인할 수 있습니다.', 'Inspect the signs to learn the danger and how to challenge.', '兆しを調べると危険と挑戦方法を確認できます。')}</small></p>}
    <div className="fr-action-grid"><ReasonButton type="button" className="fr-btn primary" disabled={blocked || !!startReason} reason={startReason} onClick={() => {
      if (blocked || !inspected || !confirmed || invalid || needsLeader) return;
      setConfirmed(false);
      if (party?.id) requestFantasyParty({ type: 'readyCombat', source: 'apex', target: challenge.id, confirm: true });
      else requestFantasyCombat({ type: 'start', source: 'apex', target: challenge.id, confirm: true });
    }}>{party?.id ? say('파티에 전투 제안', 'Propose battle to party', 'パーティーに戦闘を提案') : say('둥지·유적에 도전', 'Challenge this site', '巣・遺跡に挑む')}</ReasonButton></div>
  </article>;
}

export function FantasyMonsterSites({ c, blocked }: Props) {
  const [locale] = useLocale();
  const connected = useStore(state => state.wsConnected);
  const combatPending = useStore(state => state.fantasyCombatPending);
  const pending = useStore(state => state.fantasyPending || state.fantasyCombatPending || state.fantasyPartyPending || state.fantasyRealmPending);
  const profile = useStore(state => state.fantasyProfile);
  const partyError = useStore(state => state.fantasyPartyError);
  const party = useStore(state => state.fantasyParty);
  const selfId = useStore(state => state.selfId);
  useEffect(() => {
    if (!combatPending) return;
    const timer = setTimeout(() => set({ fantasyCombatPending: false, fantasyCombatError: 'unavailable' }), 10000);
    return () => clearTimeout(timer);
  }, [combatPending]);
  const sites = fantasyKnownMonsterSites(c).filter(site => site.location === c.location);
  if (!sites.length) return null;
  const disabled = blocked || !connected || pending || !profile || !!profile.death || !!profile.activity || !!profile.combatId || !!profile.event || !!c.downed || c.hp <= 0 || !!c.returnLantern || fantasyOnRoad(c);
  return <section className="fr-combat-menu">
    <h3>{{ ko: '지도에 기록한 둥지와 유적', en: 'Mapped lairs and ruins', ja: '地図で覚えた巣と遺跡' }[locale]}</h3>
    {partyError && <p role="alert" className="fr-error">{fantasyPartyErrorText(partyError, locale)}</p>}
    {party?.members.some(member => member.id === selfId && member.combatReady) && <p role="status">{{ ko: '전투 준비를 마쳤습니다. 파티 메뉴에서 모두 준비된 뒤 시작하세요.', en: 'Battle ready. Begin through Party once everyone is ready.', ja: '戦闘準備完了。全員の準備後、パーティーメニューから始めてください。' }[locale]}</p>}
    {sites.map(site => <MonsterSite key={`${c.location}:${site.id}:${c.apexWarnings?.[site.provocation]?.hour ?? ''}`} c={c} site={site} blocked={disabled}/>)}
  </section>;
}
