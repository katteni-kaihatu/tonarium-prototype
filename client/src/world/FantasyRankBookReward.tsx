import { useState } from 'react';
import type { FantasyAction, FantasyCharacter } from '../../../shared/fantasy.ts';
import { FANTASY_ITEMS } from '../../../shared/fantasy-data.ts';
import { fantasyRankBookClaimError, fantasyRankBookChoices, fantasyRankBookEligible, type FantasyRankBookSource } from '../../../shared/fantasy-rank-rewards.ts';
import { fantasySkillName } from '../../../shared/fantasy-skill-names.ts';
import { useLocale } from '../locale.ts';
import { useStore } from '../store.ts';
import { ReasonButton } from './FantasyActionButton.tsx';
import { skillDescriptionText, skillEffectText } from './fantasy-action-help.ts';

export function FantasyRankBookReward({ c, source, blocked, onAction }: { c: FantasyCharacter; source: FantasyRankBookSource; blocked: boolean; onAction: (action: FantasyAction) => void }) {
  const [locale] = useLocale(), [selected, setSelected] = useState('');
  const pending = useStore(state => state.fantasyPending || !state.wsConnected);
  const hour = useStore(state => state.fantasyClock?.hour) ?? c.hour;
  const reward = c.rankBookRewards?.[source];
  if (!reward && !fantasyRankBookEligible(c, source)) return null;
  const t = {
    ko: { guild: '미스릴 (6) 승급 교본', priest: '성직 등급 4 승급 교본', help: '이번 삶에서 이 승급 보상으로 교본 1권을 고를 수 있습니다. 지금 직업의 미습득 일반 기술 중에서 선택하세요. 보상을 나중에 받아도 됩니다. 선택 후에는 바꿀 수 없으며, 소지품에서 읽으면 교본이 소비되고 기술을 익힙니다.', choose: '배울 기술을 선택', claim: '이 기술의 교본 받기', received: '교본 수령 완료', read: '독서·습득 완료', inventory: '소지품에서 해당 직업으로 읽어 주세요.', none: '현재 직업에서 선택할 미습득 기술이 없습니다. 기회는 유지됩니다.', alive: '회복한 뒤 보상을 받아 주세요.', active: '액티브', passive: '패시브' },
    en: { guild: 'Mithril (6) promotion manual', priest: 'Clergy rank 4 promotion manual', help: 'Choose one manual for this promotion reward in this life. Select an unlearned ordinary skill from your current profession. You may claim later. The choice is final; reading the manual in inventory consumes it and teaches the skill.', choose: 'Choose a skill to learn', claim: 'Receive this skill’s manual', received: 'Manual received', read: 'Read and learned', inventory: 'Read it from inventory while following its profession.', none: 'No unlearned skills are available for your current profession. Your opportunity remains.', alive: 'Recover before claiming the reward.', active: 'Active', passive: 'Passive' },
    ja: { guild: 'ミスリル (6) 昇格教本', priest: '聖職等級4の昇格教本', help: 'この人生で、この昇格報酬の教本を1冊選べます。現在の職業の未習得の通常技能から選んでください。受け取りは後でも構いません。選択後の変更はできません。持ち物から読むと教本を消費して技能を習得します。', choose: '学ぶ技能を選ぶ', claim: 'この技能の教本を受け取る', received: '教本受取済み', read: '読了・習得済み', inventory: '対応する職業で持ち物から読んでください。', none: '現在の職業には選べる未習得技能がありません。受け取る機会は残ります。', alive: '回復してから報酬を受け取ってください。', active: 'アクティブ', passive: 'パッシブ' },
  }[locale];
  const choices = fantasyRankBookChoices(c), skill = choices.find(skill => skill.id === selected);
  const reason = c.hp <= 0 ? t.alive : fantasyRankBookClaimError({ ...c, hour }, source, skill?.id, locale);
  const book = reward && FANTASY_ITEMS.find(item => item.id === reward.book);
  return <section className="fr-card">
    <h3>{source === 'adventurer' ? t.guild : t.priest}</h3>
    {reward ? <><p role="status">{reward.readAt === undefined ? t.received : t.read} · {book?.names?.[locale] ?? book?.name ?? reward.book}</p>{reward.readAt === undefined && <p>{t.inventory}</p>}</>
      : <><p>{t.help}</p>{choices.length ? <>
        <label>{t.choose}<select value={skill?.id ?? ''} onChange={event => setSelected(event.target.value)} disabled={blocked || pending} style={{ display: 'block', width: '100%', padding: 8, font: 'inherit' }}>
          <option value="">{t.choose}</option>{choices.map(skill => <option key={skill.id} value={skill.id}>{fantasySkillName(skill, locale)} · {skill.kind === 'active' ? t.active : t.passive}</option>)}
        </select></label>
        {skill && <div><p>{skillDescriptionText(skill, locale)}</p><p>{skillEffectText(skill, locale)}</p></div>}
        <ReasonButton type="button" className="fr-btn" disabled={blocked || pending || !skill || !!reason} reason={blocked || pending ? undefined : reason} onClick={() => { if (skill) onAction({ type: 'rankBookClaim', source, skill: skill.id }); }}>{t.claim}</ReasonButton>
      </> : <p>{t.none}</p>}</>}
  </section>;
}
