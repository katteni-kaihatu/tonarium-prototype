import { fantasyJobMagicAttackRatio, fantasyJobCombatProfile, fantasyJobHpMultiplier } from '../shared/fantasy-job-balance.ts';
import { FANTASY_MIRACLES, FANTASY_LAST_DAWN_SKILL } from '../shared/fantasy-miracle-catalog.ts';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { FANTASY_JOBS, FANTASY_RACES } from '../shared/fantasy-data.ts';
import { applyFantasyAction, newFantasyProfile, fantasyStats } from '../shared/fantasy-engine.ts';
import { FANTASY_JOB_PATHS, fantasyJobPathSkills, fantasyJobPathCombatPassive } from '../shared/fantasy-job-paths.ts';
import { FANTASY_PRIEST_PATH_SKILLS, FANTASY_PRIEST_BRANCHES } from '../shared/fantasy-priest-growth.ts';
import { FANTASY_MENTOR_SKILLS } from '../shared/fantasy-apprenticeship.ts';
import { fantasyManaSkills } from '../shared/fantasy-mana.ts';
import { FANTASY_READABLE_LIBRARY_BOOKS } from '../shared/fantasy-library.ts';
import { FANTASY_MAGIC_COMBINATIONS } from '../shared/fantasy-specializations.ts';
import { FANTASY_MAGIC_BOOK_DISCOVERIES } from '../shared/fantasy-magic-discovery.ts';
import { FANTASY_CIRCLE_CORES, FANTASY_CIRCLE_RUNES, FANTASY_CIRCLE_BOOK_DISCOVERIES, fantasyCompileCircle, grantFantasyCircleBasics } from '../shared/fantasy-magic-circle.ts';
import { FANTASY_SKILL_UTILITIES } from '../shared/fantasy-skill-variety.ts';
import { fantasyCombatSkillSummary } from '../shared/fantasy-combat-preview.ts';
import { fantasyBodyTraits, FANTASY_CONTEXT_NAMES } from '../shared/fantasy-physiology.ts';
import { fantasySkillName } from '../shared/fantasy-skill-names.ts';
import { fantasyIsLifeCareerSkill } from '../shared/fantasy-combat-capabilities.ts';
import { fantasyCombatPlayer } from '../server/fantasy-combat-adapter.ts';
import type { FantasyCombatSkill } from '../shared/fantasy-combat.ts';
import type { FantasyCharacter, FantasySkill } from '../shared/fantasy.ts';

type Source = '종족' | '직업' | '전문 분야' | '사제 분기' | '공통 스승' | '공통 마나';
interface Entry { source: Source; owner: string; title: string; skill: FantasySkill; conditions: string; path?: string }
const stats: Record<string, string> = { strength: '힘', agility: '민첩', intelligence: '지능', vitality: '체력', luck: '운', dexterity: '손재주', charisma: '카리스마', attack: '공격력', accuracy: '명중률', defense: '방어력', magicResist: '마력 방호' };
const base = applyFantasyAction(newFantasyProfile(), { type: 'create', name: 'Reference', source: 'human', gender: 'female' }, () => .5).profile;
assert.ok(base.character, 'Reference character creation must succeed');
function character(): FantasyCharacter {
  const c = structuredClone(base.character!); c.level = 1; c.jobXp = Object.fromEntries(FANTASY_JOBS.map(job => [job.id, 1000]));
  c.skillXp = Object.fromEntries(FANTASY_JOBS.flatMap(job => job.skills.map(skill => [skill.id, 1000])));
  c.readBooks = FANTASY_READABLE_LIBRARY_BOOKS.map(book => book.id); c.learnedSkills = FANTASY_MENTOR_SKILLS.map(skill => skill.id);
  c.unlockedSkills = FANTASY_JOBS.flatMap(job => job.skills.filter(skill => skill.unlock?.kind === 'mentor').map(skill => skill.id));
  c.practice = { explore: 1000, craft: 1000, gather: 1000, hunt: 1000, fish: 1000, command: 1000 };
  c.mana = { stage: 4, mastery: 0, strain: 0, affinity: 'balanced', useXp: 240 }; c.hour = 12; return c;
}
function unlock(skill: FantasySkill): string {
  const u = skill.unlock; if (!u) return '기본 습득';
  if (u.kind === 'job') return `현재 직업 XP ≥ ${u.xp}`;
  if (u.kind === 'skill') return `선행 기술 ${u.skill} XP ≥ ${u.xp}`;
  if (u.kind === 'book') return `도서 ${u.book} 완독 + 현재 직업 XP ≥ ${u.jobXp ?? 0}`;
  if (u.kind === 'mentor') return `해당 직업 스승에게 습득 + 현재 직업 XP ≥ ${u.jobXp ?? 0}`;
  return `유효한 ${u.condition} 활동 ≥ ${u.count}회`;
}
const entries: Entry[] = [];
for (const race of FANTASY_RACES) for (const skill of race.skills) entries.push({ source: '종족', owner: race.id, title: race.names.ko, skill, conditions: `현재 종족 ${race.names.ko}; ${unlock(skill)}` });
for (const job of FANTASY_JOBS) for (const skill of job.skills) entries.push({ source: '직업', owner: job.id, title: job.names.ko, skill, conditions: `현재 직업 ${job.names.ko}; ${unlock(skill)}` });
for (const field of FANTASY_JOB_PATHS) {
  const c = character(); c.job = field.job; c.jobPaths = { [field.job]: { path: field.id, hour: 12 } };
  const skills = fantasyJobPathSkills(c); assert.equal(skills.length, 2, `Both path skills must be catalogued: ${field.id}`);
  const index = FANTASY_JOB_PATHS.filter(path => path.job === field.job).findIndex(path => path.id === field.id);
  const prerequisite = FANTASY_JOBS.find(job => job.id === field.job)!.skills.find(skill => skill.id === `job-${field.job}-advanced-${[2, 3, 5, 4, 8][index]}`)!;
  for (const skill of skills) entries.push({ source: '전문 분야', owner: field.job, title: FANTASY_JOBS.find(job => job.id === field.job)!.names.ko, skill, path: field.id, conditions: `현재 직업 + 발견·선택한 전문 분야 ${field.names.ko} (${field.id}); 직업 XP ≥ 100; 선행 ${prerequisite.id} (${unlock(prerequisite)})` });
}
for (const skill of FANTASY_PRIEST_PATH_SKILLS) {
  const branch=FANTASY_PRIEST_BRANCHES.find(branch=>branch.id===skill.id.split('-')[1]);
  const conditions=skill.id==='miracle-last-dawn'?'성자·성녀; 전장에 7등급 이상 강적 생존 + 자신 외 아군 과반 빈사; 자신의 HP·MP 조건 없음; 승리 시 영구 사망'
    :skill.id.startsWith('miracle-')?'성자·성녀; 해당 기적 발견 후 신전에서 최대3개 준비; 전용 대상·재사용·대가 조건'
    :`현재 사제 + ${branch!.names.ko} 선택; 신앙 등급 R 적용${['inquisitor','paladin','saint'].includes(branch!.id)?'; 해당 유고·실제 봉사·교리·순례·숙련 조건 필요':''}`;
  entries.push({source:'사제 분기',owner:'priest',title:'사제',skill,conditions});
}
for (const skill of FANTASY_MENTOR_SKILLS) entries.push({ source: '공통 스승', owner: 'common', title: '직업 공통', skill, conditions: '해당 지역·스승에게 5G로 습득; 전직 후에도 사용 가능' });
for (const skill of fantasyManaSkills(character())) entries.push({ source: '공통 마나', owner: 'common', title: '직업 공통', skill, conditions: `마나 단계 ≥ ${skill.id === 'mana-ward' ? 4 : skill.id === 'mana-focus' ? 3 : 2}; 직업 무관; 사용 시 부하 < 80` });
assert.equal(new Set(entries.map(entry => entry.skill.id)).size, entries.length, 'Every actual skill must appear once');
for (const entry of entries) assert.ok(/[가-힣]/u.test(fantasySkillName(entry.skill, 'ko')) && !/[ぁ-ゖァ-ヺ]/u.test(fantasySkillName(entry.skill, 'ko')), `Missing Korean skill name: ${entry.skill.id}`);

function effectiveBattle(entry: Entry): FantasyCombatSkill | undefined {
  if (entry.skill.kind === 'passive') return;
  if (entry.skill.id.startsWith('miracle-')) return entry.skill.id==='miracle-last-dawn'?FANTASY_LAST_DAWN_SKILL:FANTASY_MIRACLES.find(m=>m.id===entry.skill.id)?.skill;
  const c = character(); c.race = entry.source === '종족' ? entry.owner : 'human'; c.job = ['직업', '전문 분야', '사제 분기'].includes(entry.source) ? entry.owner : 'unassigned';
  c.skillXp![entry.skill.id] = 0;
  if (entry.path) c.jobPaths = { [entry.owner]: { path: entry.path, hour: 12 } };
  if (entry.source === '사제 분기') c.priestGrowth = { version: 1, startedAt: 12, service: [], doctrine: [], pilgrimage: [], prayerDays: [], prayerTemples: {}, vows: [], branch: entry.skill.id.split('-')[1] as 'care', branchChanges: 0, changedAt: 12 };
  c.hp = fantasyStats(c).hp; c.mp = fantasyStats(c).mp;
  return fantasyCombatPlayer({ ...structuredClone(base), character: c }, 'reference').skills.find(skill => skill.id === entry.skill.id);
}
function power(entry: Entry): string {
  if(entry.skill.id.startsWith('miracle-'))return '전용 고정 효과; 일반 P 배율·숙련 보정 없음';
  const skill = entry.skill, gain = skill.kind === 'active' ? 'Gₐ' : 'Gₚ';
  if (entry.source === '공통 마나') return `${skill.id === 'mana-focus' ? 3 : skill.id === 'mana-ward' ? 4 : 2} + floor(M/10) + ${gain}`;
  if (entry.source === '사제 분기') return `${skill.power} + max(0,R−1) × ${skill.effect === 'travel' ? '.05' : skill.effect === 'heal' ? 4 : 1} + ${gain}`;
  return `${skill.power} + ${gain}`;
}
function world(entry: Entry): string {
  const s = entry.skill;
  if(s.id.startsWith('miracle-'))return s.id==='miracle-return-lantern'?FANTASY_MIRACLES.find(m=>m.id===s.id)!.descriptions.ko:'전투 전용; 일반 생활 기술로 사용하지 않음';
  const stat = s.stat ? stats[s.stat] : '대응 능력';
  if (s.retired) return '새 중심·룬 합성으로 통합되어 기존 단독 기술은 사용하지 않음; 저장 숙련은 보존';
  if (s.restore === 'mp') return `자신 MP +min(잃은 MP,P); MP ${s.mp} 소비, 1게임시간·공통 6시간 간격; 실제 회복 시만 숙련, 부활 불가`;
  if (s.utility) return ({ haste: '자신 민첩 +2, 3게임시간', regen: '자신 HP를 매시간2씩, 3게임시간 회복; 빈사 소생 불가', clarity: '자신 지능 +2, 3게임시간', resolve: '자신 보호 가능한 위험 피해 방호 +2, 3게임시간' } as Record<string, string>)[s.utility] ?? '전투 중 대상을 골라 사용; 생활 직접 발동 없음';
  const face = s.diceFaces ? `; D6 면 ${({ steady: '2·2·3·4·5·6', even: '2·2·4·4·6·6', upper: '4·4·5·5·6·6', odd: '1·1·3·3·5·5', lower: '1·1·2·2·3·3' } as Record<string, string>)[s.diceFaces]} (다른 면수 비례)` : '';
  if (s.effect === 'check') return s.kind === 'passive' ? `자신의 ${stat} 판정 보정 +P; 습득·활성 조건 동안 상시${face}` : `자신의 다음 ${stat} 판정 보정 +P + 유리 주사위 1개; 한 번 또는 게임 6시간, 중첩 불가${face}`;
  if (s.effect === 'guard') return s.kind === 'passive' ? '자신의 보호 가능한 위험 피해에서 P 차감; 활성 조건 동안 상시 (허기·중독 등 비보호 피해 제외)' : '자신의 다음 보호 가능한 위험 피해에서 P 추가 차감; 위험 1회에 소비, 다른 준비 강화와 중첩 불가';
  if (s.effect === 'heal') return '자신 HP +min(P, 잃은 HP); 즉시, 부활 불가; HP가 가득 차면 사용 불가';
  if (s.effect === 'reward') return s.kind === 'passive' ? '자신의 유효한 일·채집·제작 성과 보정에 P 합산; 상시' : '자신의 다음 유효한 일·제작 성과 보정에 P 합산 후 소비; 중첩 불가';
  return s.kind === 'passive' ? '자신의 일반 이동 시간에서 P 게임시간 차감; 기본 최저 1시간, 전이문에는 미적용' : '자신의 다음 대상 일반 이동에서 P 게임시간 차감 후 소비; 최저 1시간·전이문 예외, 중첩 불가';
}
function combat(entry: Entry): string {
  if(entry.skill.id.startsWith('miracle-'))return entry.skill.id==='miracle-return-lantern'?'전투 중 사용 불가':fantasyCombatSkillSummary(effectiveBattle(entry)!, 'ko');
  const s = entry.skill;
  if (fantasyIsLifeCareerSkill(s.id)) return '생활 직업 전용; 전투 발동·파생 능력치 보정 없음; 기존 기술·숙련 기록 보존';
  if (s.retired) return '중심·룬 합성으로 통합; 현재 전투 기술 목록에서 숨김';
  if (s.kind === 'passive') {
    const bonus = fantasyJobPathCombatPassive(s.id);
    if (bonus) return `${Object.keys(bonus).map(key => `${stats[key]} +min(3,P)`).join(', ')}; 각 경로 능력별 합계 최대 +3; 현재 선택 전문 분야 동안 상시`;
    if (s.id === 'priest-oath-witness') return '전투 능력치 증가 없음; 생활 기록 조사 전용';
    if (s.effect === 'guard') return '파생 방어력에 1.4×P 기여; 일반 방어 패시브 P 합계 상한 10; 상시';
    if (s.effect === 'check') return `전투 기준 능력치가 ${s.stat ? stats[s.stat] : '이 기술의 능력'}와 같을 때 파생 공격력 +P; 일반 판정 패시브 합계 상한 8; 상시 (D20 면 변경은 전투에 미적용)`;
    return '전투 직접 효과 없음; 생활 기능 유지';
  }
  const art = effectiveBattle(entry); if (!art) return '전투 명령에 노출되지 않음; 생활 기술';
  if (art.utility) return `${fantasyCombatSkillSummary(art, 'ko')}; P는1~12로 제한; 같은 상태 중첩 불가; 실제 효과 사용 때만 한 번 숙련`;
  if (art.kind === 'mana') return `자신·살아 있는 아군 MP +min(잃은 MP,P+floor(INT×.4)); 시전자 MP ${art.mp} 소비; 사거리8·시야; 전투당1회·세계 공통6시간 간격; 실제 회복만 숙련`;
  if (art.kind === 'blessing') return '자신·살아 있는 아군: 현재 라운드 방호 +clamp(round(P),1,12)+floor(INT×.3); 피해 강화 +min(4,max(1,floor(clamp(round(P),1,12)/2))), 3라운드·중첩 불가; 사거리8·시야; 실제 효과 때만 숙련';
  const p = entry.source === '전문 분야' ? `${art.power}+min(3,max(0,P−${s.power}))` : entry.source === '사제 분기' && art.kind === 'focus' ? 'clamp(10+2×(P−5),10,15)' : art.kind === 'focus' ? 'clamp(round(2P),3,15)' : s.id === 'priest-grace' ? 'min(100,round(P))' : `min(100,round(${art.kind === 'attack' ? 3 : 2}P))`;
  if (art.kind === 'focus') return `${art.selfOnly ? '자신 전용: 다음' : '자신·살아 있는 아군의 다음'} 공격 명중률 +${p}%p; 사거리 8·시야 필요; 한 번/최대 2라운드, 강한 효과 중첩 불가, 수레 제외`;
  if (art.kind === 'heal') return `살아 있는 아군 HP +min(잃은 HP,${p}+floor(INT×.8)); 사거리 8·시야; 즉시, 부활 불가`;
  if (art.kind === 'guard') return `${art.selfOnly ? '자신 전용' : '아군'} 방호 +${p}+floor(INT×.3); 사거리 8·시야; 현재 라운드 종료 소멸${s.id.includes('shieldbearer') ? '; 시전자 인접/전방에 소유 방벽 1개, 다음 라운드 종료 소멸·위치 엄폐' : ''}`;
  const range = entry.source === '전문 분야' ? `${art.range === 'melee' ? '근접 1' : art.range === 'ranged' ? '원거리 7' : '마력 8'}칸` : '직업·장비 기본 사거리 (근접1/원거리7/마력8)';
  const riders: string[] = [];
  if (art.onHit) riders.push(`실제 피해·비방어 적에게 ${art.onHit.chance * 100}%로 ${({ burn: '화상', frost: '냉기', poison: '중독' } as const)[art.onHit.id]} 위력 ${art.onHit.power}, 3라운드`);
  if (art.hitUtility) {
    const v = art.hitUtility.power, effect = ({ weaken: `주는 피해 −${Math.round(Math.min(.3,v*.02)*1000)/10}%`, vulnerable: `받는 피해 +${Math.round(Math.min(.35,v*.025)*1000)/10}%`, blind: `명중률 −${v*2}%p`, bleed: `매 라운드 HP −${v}`, root: '위치 이동 금지', silence: 'MP 기술 금지' })[art.hitUtility.id];
    riders.push(`실제 피해·비방어 적에게 ${Math.round(art.hitUtility.chance*100)}%로 ${effect}, 3라운드; 중첩 불가`);
  }
  const rider = riders.length ? `; ${riders.join('; ')}` : '; 추가 상태 이상 없음';
  const mode = entry.source === '전문 분야' ? (art.magic || art.range === 'magic' ? '마법 피해 수식' : '물리 피해 수식') : s.stat === 'intelligence' || ['mage', 'priest', 'summoner'].includes(entry.owner) ? '마법 피해 수식' : '기본 장비/직업이 마력 사거리면 마법, 그 외 물리 수식';
  return `적/파괴 장애물 공격 보정 A=${p}; ${mode}; ${range}·시야·D20 필요; 즉시${rider}${art.damageType ? `; 장애물 속성 ${art.damageType}` : ''}`;
}
const escape = (text: string) => text.replaceAll('|', '\\|').replaceAll('\n', ' ');
const lines: string[] = [];
lines.push('# 전체 기술·마법 효과 기준표', '', '이 문서는 실제 등록 데이터와 전투 어댑터에서 자동 생성한다. 미구현 효과를 이름에서 추정하지 않는다. 재생성: `tsx scripts/generate-fantasy-capabilities.ts`; 일치 검사: 같은 명령에 `--check`.', '',
  `총 **${entries.length}개 고유 기술**. 종족 ${entries.filter(e => e.source === '종족').length}, 직업 ${entries.filter(e => e.source === '직업').length}, 전문 분야 ${entries.filter(e => e.source === '전문 분야').length}, 사제 분기 ${FANTASY_PRIEST_PATH_SKILLS.length}, 공통 스승 ${FANTASY_MENTOR_SKILLS.length}, 공통 마나 ${entries.filter(e => e.source === '공통 마나').length}. 중심 ${FANTASY_CIRCLE_CORES.length}종·룬 ${FANTASY_CIRCLE_RUNES.length}종과 구형 합성 ${FANTASY_MAGIC_COMBINATIONS.length}종은 별도 표로 싣는다.`, '',
  '## 공통 수식과 사용 조건', '',
  '- 표의 **P**는 생활 기술의 최종 위력이다. B는 표에 적힌 숫자, Gₐ=min(3,floor(해당 기술 XP/50)), Gₚ=min(2,floor(해당 기술 XP/100)). 직업·종족·전문 분야 모두 이 숙련 보정은 한 번만 적용한다. M은 마나 숙련(0~단계×5, 최대20), R은 사제 신앙 등급(0~4)이다.',
  '- 모든 발동 기술은 생존·현재 습득 조건과 MP를 요구한다. 생활 발동은 MP를 먼저 쓰며 마나 부하 +=max(1,ceil(MP/2)), 피로 +=ceil(MP/5), 증가 후 부하≥90이면 HP 피해3; 부하≥80이면 새 사용 거절. 회복 외 준비 기술은 기존 강화가 있으면 거절한다. 휴식·숙박 등에서 강화가 지워질 수 있다.',
  '- 생활 판정은 (능력치−10)/2 내림 + 레벨−1 + 대응 패시브 합 + 준비 P + 직업 숙련·장비·동료·신체·환경 보정. 준비 판정 강화는 유리 주사위 1개를 제공하고 불리 상태와 상쇄한다. 유불리 순량에 따라 1~3개를 굴려 최고/최저를 채택한다. D20 미만 판정은 별도 보정/난도 상한을 적용한다. 패시브 면 변경은 주사위 개수를 늘리지 않는다.',
  '- 전투 거리: 맨해튼 거리, 기본 근접1·원거리7·마력8칸과 시야를 함께 검사한다. 새 술식은 컴파일된 사거리·중심 반경을 쓴다. 회복은 살아 있는 아군, 기적만 전투에 남은 HP0 여행자를 대상으로 한다. 집중·상태 강화는 수레를 대상으로 하지 않는다. 생활 주사위 면 변경은 전투에 자동 이식되지 않는다.',
  `- 일반 물리 피해 기초=max(1,ATK+A−DEF×.7), 마법=max(1,INT×1.3+ATK×직업계수+A−MR×.65), 직업계수는 마법사 ${fantasyJobMagicAttackRatio('mage')}·사제 ${fantasyJobMagicAttackRatio('priest')}·그 외 ${fantasyJobMagicAttackRatio(undefined)}다. 자연20 치명타×1.4, 엄폐 물리×.75/마법×.9, 방어×.35를 반올림·최저1로 적용한 뒤 방호가 먼저 흡수한다. 최종 HP 손실은 남은 HP 이하다. 신화급 분노·광역 계수는 해당 적 규칙을 추가 적용한다.`,
  '- 사제의 전투 HP 치유는 표의 기본 회복량에 floor(시전자 최대HP×.04)를 더한다. 회복의 은총은 P를 두 배로 늘리지 않고 그대로 쓰며, 합성 치유의 위력과 자기 대상 제한은 해당 술식을 따른다.',
  '- 명중률=max(10,min(100,정확도+집중+기술명중+명료+상황명중)−냉기−실명−거리−대상신속−엄폐(물리10/마법4)); 원거리/마법 거리 감점=min(10,max(0,거리−3)). 대상 냉기는 회피 민첩도 낮춘다. D20 목표=clamp(round(20−(명중률+공격자 AGI×.25−대상회피×.35)/5),3,19). 자연1 실패, 자연20 성공. 집중은 다음 공격 판정 한 번에 소비하며 실패해도 소비한다.',
  '- 일반 공격 기술은 명중했을 때 MP 소비, 회복/방호는 실제 대상이 있을 때 소비한다. 장애물 공격은 시도할 때 MP를 소비하며 성공해야 실제 사용 숙련을 준다. 장애물 피해=max(1,round((마법이면 INT×1.3+ATK×.4, 그 외 ATK)+A)); 취약 속성×2. 일반 무기는 실제 장비에 따라 타격/관통, 준비 화염은 불·대지는 타격·그 외 무속성이다.',
  '- 실제 유효 사용이 기술 XP와 직업 XP를 기른다. 같은 행동 반복은 1,1/2,1/4,1/8 배로 줄고 키/6시간 간격 규칙을 따른다. 미사용 집중·강화 준비만으로 숙련을 주지 않는다. 상태 강화/약화는 첫 실제 효과에만 한 번 기록한다. 합성 주문의 임시 슬롯 ID에는 별도 기술 XP를 만들지 않는다.',
  '- 전사의 돌진은 해당 기술200XP부터 유효 명중 시80% 확률로 적의 주는 피해를8% 줄인다. 200XP 미만은40% 확률·4% 감소다. 모두3라운드·같은 약화 중첩 불가이며 위력·MP·이동 거리는 늘지 않는다.',
  '- 관통 사격·방패 격파는 해당 기술 숙련200XP부터 유효 명중 시 3라운드 동안 받는 피해 +15%를 남긴다. 같은 취약 효과는 합산하지 않는다. 200XP 미만 관통 사격에는 이 효과가 없으며, 방패 격파는 기존의 명중 후50%로 받는 피해 +5%를 유지한다. 이 표의 직업 기술 전투 예시는 해당 기술0XP 조건이며 숙련별 변화는 별도로 표기한다.',
  '- 새 전투 상태12종은 3라운드·위력1~12, 같은 상태 중첩 불가다. 재생·흡수는 HP0을 일으키지 않으며, 정화는 적대 상태만 없앤다. 불굴은 피해를 줄이다가 적대 상태 한 번을 막으면 소멸한다. 속박은 이동만, 침묵은 MP를 소비하는 기술만 막는다.',
  '- 실제 피해에는 골렘·슬라임 등의 물리/마법 배율, 약화·취약·불굴과 명료 마법방호를 적용한다. 직업/전문 분야와 적 종류·장애물이 일치할 때만 상황 위력(최대6)·명중(최대4)을 더한다. 원형 술식을 준비한 마법사의 전투 방어는75%다.',
  '- 전문 분야는 최초 선택 무료, 변경100G·24게임시간 간격이다. 해당 경로의 선행 기술 해금과 현재 직업 XP100, 발견·선택 기록을 함께 검사한다.',
  '- 전직은 직업/기술 XP, 공통 스승·마나 지식과 저장 주문을 지우지 않는다. 이전 직업·이전 전문 분야 기술은 숨기고 사용을 막으며, 다시 돌아오면 충족된 습득 조건으로 복구한다.', '',
  '### 사제 신앙과 마나 성장', '',
  '- 신앙=봉사 완료 수×4 + 교리 도서 수×3 + 순례 신전 수×2 + 이행 서약 수×5 + min(10,유효 기도일 수). 등급 문턱 0/20/45/80/130 → R=0/1/2/3/4. 분기 선택에는 사제XP30, 봉사1, 교리1, 순례2, 이행서약1 또는 봉사3, 신앙20, 현 신전신뢰10이 필요하다. 분기 변경은 120G·24게임시간 간격; 재변경은 신앙45·사제XP100도 요구한다.',
  '- 전체 신뢰=min(100,봉사×5+이행서약×8+교리×2+min(5,기도일)). 현 신전 신뢰=min(100,교리×2+그 지역 봉사×5+그 지역 이행서약×8+min(5,그 신전 기도일)). 두 신뢰 값과 신앙 등급은 서로 다른 기록이다.',
  '- 사제 분기 위력은 G에 더해 max(0,R−1)×(회복4, 여행.05, 나머지1). 따라서 등급 추가분 상한은 회복12, 여행.15, 나머지3. 전투 사제 회복·방호는 min(100,2P), 서약 집중은 clamp(10+2(P−5),10,15). 기록 조사 패시브는 공격력에 넣지 않는다.',
  '- 마나 사용 XP 문턱 0/12/40/100/240 → 단계0~4; 유효 MP 소비 시 XP +=max(1,floor(MP×min(1,반복배율))), 최대100만. M=min(단계×5,max(기존M,floor(사용XP/12))). 마나 자체 능력 보너스: 최대MP +min(20,단계×3+floor(M/5)×2), 단계3 힘+1·민첩+1, 단계4 힘+2·민첩+1, 단계2 체력+1·단계4 체력+2. 휴식 경과 매시간 부하6 감소.', '',
  '### 물리·인지 능력의 전투 반영', '',
  '- 기본 힘·민첩·지능·운·체력=max(1,10+종족보정+출생보정+floor((레벨−1)/3)). 현재 직업의 추가 능력(손재주/카리스마)은 max(1,10+종족보정+min(8,floor(해당 직업XP/15))+레벨성장); 없는 능력의 일반 판정 기준은10이다. 장비·마나 보정을 더한다. 최대HP=max(20,100+종족HP+출생HP+(VIT−10)×4+(레벨−1)×8+장비HP), 최대MP=max(5,50+종족MP+출생MP+(INT−10)×3+(레벨−1)×4+장비/마나MP).',
  '- 활/석궁은 민첩, 지팡이/성서는 지능을 전투 기준 능력으로 쓴다. 그 외 지정 전투 직업은 직업의 주능력, 그 밖은 힘이다. 일반 대응 판정 패시브 P 합은 공격력에 최대8, 일반 방어 패시브 P 합은 최대10까지 각각 더한다. 전문 분야 패시브는 별도 각 능력 합계 최대3이다.',
  `- 직업 보정은 파생한 능력치에 한 번 적용한다. 전사 ATK×${fantasyJobCombatProfile('warrior').attack}, 기사 DEF×${fantasyJobCombatProfile('knight').defense}, 마법사 INT×${fantasyJobCombatProfile('mage').intelligence}. 궁수 최대HP 계수는${fantasyJobHpMultiplier('archer')}이며 사제 회복·방호는 기존 규칙을 유지한다.`,
  '- ATK=round(10+기준능력×2+레벨×1.3+무기등급×5+일반공격패시브+전문공격−필요패널티×2+걸작보정), 1~10000. DEF=round(VIT×.7+장비guard×1.5+갑옷등급×3+일반방어패시브×1.4+전문방어+걸작보정), 0~1000. AGI=round(AGI원값−필요−환경), INT=round(INT원값−필요+마력무기걸작), 각1~1000.',
  '- 정확도=clamp(round(64+AGI원값×.8+장비판정×2+전문명중−(필요+환경)×3),35,95). MR=clamp(round(INT원값×.6+VIT원값×.3+장신구등급×2+전문마력방호),0,1000). 품질4/5 걸작은 재료/기본등급≥3일 때 ATK+10/+20, 갑옷 DEF+6/+10, 마력무기 INT+5/+10. 인지 기술은 표의 집중 또는 조건부 공격력 수식으로만 반영하며 은신 해제·자동 탐지·자동 명중을 부여하지 않는다.', '');
for (const source of ['종족', '직업', '전문 분야', '사제 분기', '공통 스승', '공통 마나'] as Source[]) {
  lines.push(`## ${source} 기술`, '');
  for (const owner of [...new Set(entries.filter(entry => entry.source === source).map(entry => entry.owner))]) {
    const group = entries.filter(entry => entry.source === source && entry.owner === owner);
    lines.push(`### ${group[0].title} (${owner})`, '');
    if (source === '종족') lines.push(`신체: ${fantasyBodyTraits({ race: owner }).map(trait => `${trait.names.ko} (${Object.entries(trait.modifiers).map(([key, value]) => `${FANTASY_CONTEXT_NAMES[key as keyof typeof FANTASY_CONTEXT_NAMES].ko} ${value! >= 0 ? '+' : ''}${value}`).join(', ') || '별도 보정 없음'})`).join(' · ')}. 신체 문맥 합계는 −5~+5로 제한하며, 자동 성공/상시 피해 면역은 아니다.`, '');
    lines.push('| 기술 / ID | 종류 · MP | 최종 P | 습득·활성 조건 | 생활 효과 · 대상 · 기간 | 전투 효과 · 대상 · 사거리 · 기간 |', '| --- | --- | --- | --- | --- | --- |');
    for (const entry of group) lines.push(`| ${escape(fantasySkillName(entry.skill, 'ko'))}<br>\`${entry.skill.id}\` | ${entry.skill.kind === 'active' ? '발동' : '상시'} · ${entry.skill.mp} MP | ${power(entry)} | ${escape(entry.conditions)} | ${escape(world(entry))} | ${escape(combat(entry))} |`);
    lines.push('');
  }
}
lines.push('## 중심·룬 원형 술식', '', '저장 칸은 현재 직업XP0/30/100에서1/2/3, 룬 노드는2/4/6개다. 입문 마법사는 화염·물결·질풍·대지, 입문 사제는 신성·치유·정화·결계 중심과 집중·분산·절약 룬을 배운다. 물리 충격과 추가 룬은 도서·유적 발견이 필요하다. 직업·현재 전문 분야·발견 권한을 매 사용 시 다시 검사한다. 마법사는 구형 주문까지 HP 치유를 사용할 수 없다.', '', '| 중심 / ID | 직업·조건 | 기본 컴파일 위력 / MP | 사거리 / 반경 | 실제 전투 역할 |', '| --- | --- | --- | --- | --- |');
for (const core of FANTASY_CIRCLE_CORES) {
  const c = character(); c.job = core.job; c.hour = 1000;
  if (core.id === 'star') { c.jobPaths = { mage: { path: 'mage-star', hour: 20 } }; c.occult = { version: 1, starObservations: [{ hour: 20, location: 'starfall-isle' }], relicClaims: [], relics: [], usedRelics: [] }; }
  if (['blessing', 'miracle'].includes(core.id)) c.priestGrowth = { version: 1, startedAt: 12, service: [], doctrine: [], pilgrimage: [], prayerDays: [], prayerTemples: {}, vows: [], branch: 'saint', branchChanges: 0, changedAt: 12 };
  grantFantasyCircleBasics(c);
  const compiled = fantasyCompileCircle(c, core.id, core.id === 'miracle' ? ['miracle'] : []); assert.ok(compiled, `Core must compile in its reference context: ${core.id}`);
  const condition = core.id === 'star' ? '마법사·별섬 야간 관측 완료·별마법사 선택' : core.id === 'blessing' ? '심문관·성기사·성인 사제 분기, 자신 전용' : core.id === 'miracle' ? '성인 사제·생환 룬 필수, 전투 중 쓰러진 동료' : core.job === 'mage' ? `마법사${core.id === 'physical' ? '·충격 중심 발견' : ''}` : '사제';
  const { core: _core, runes: _runes, ...spell } = compiled;
  lines.push(`| ${core.names.ko} / ${core.id} | ${condition} | ${compiled.power} / ${compiled.mp} | ${compiled.reach} / ${compiled.radius} | ${escape(fantasyCombatSkillSummary({ id: core.id, ...spell, range: 'magic' }, 'ko'))} |`);
}
lines.push('', '증폭은 남는 증폭 여지를 사용해 함께 써도 최대1.65배다. 마법사 중심 기본위력×1.12, 최종 위력1~100·MP2~60·사거리1~10·반경0~2로 제한한다. 축복은 사거리0·반경0·자신 전용이다. 범위 공격은 적만, 지원은 아군만 적용하며 MP와 유효 사용 기록은 한 번이다. 물리 충격은 마력 사거리를 가지지만 물리 피해 수식을 쓴다.', '', '| 룬 / ID | 효과·제한 |', '| --- | --- |');
for (const rune of FANTASY_CIRCLE_RUNES) lines.push(`| ${rune.names.ko} / ${rune.id} | ${escape(rune.descriptions.ko)}${rune.special ? '; 현재 대응 마법사 전문 분야에서만 사용' : ''} |`);
lines.push('', '### 상태 강화·약화12종', '', '| 상태 / ID | 대상 | 실제 효과 |', '| --- | --- | --- |');
for (const utility of FANTASY_SKILL_UTILITIES) lines.push(`| ${utility.names.ko} / ${utility.id} | ${utility.target === 'ally' ? '자신·아군' : '적'} | ${escape(utility.descriptions.ko)} |`);
lines.push('', '## 구형 원소·형태 저장 주문9종', '', '예전 저장의 원소·형태 주문은 유지한다. 마법사는 HP 회복 조합을 준비하거나 사용할 수 없다. 사제는 물 장막·물 회복·빛 회복만 사용한다. 빛 장막 조합은 없다. 모든 구형 조합도 원소·형태 지식과 현재 직업·저장 칸 조건을 검사한다. 준비1시간, 저장 칸은 현재 직업XP0/30/100에서1/2/3개다.', '', '| 조합 / 이름 | MP | 생활 효과 | 전투 효과 | 직업 |', '| --- | ---: | --- | --- | --- |');
for (const spell of FANTASY_MAGIC_COMBINATIONS) {
  const support = ['tide', 'light'].includes(spell.element) && spell.effect !== 'check';
  lines.push(`| ${spell.element}/${spell.form} · ${spell.names.ko} | ${spell.mp} | ${spell.effect === 'heal' ? `자신 HP +min(${spell.power},잃은 HP), 즉시` : spell.effect === 'guard' ? `다음 보호 위험 피해 −${spell.power}, 1회` : `다음 ${stats[spell.stat!]} 판정 +${spell.power} + 유리 주사위 1개; 1회 (합성 강화에는 6시간 만료 필드가 없음)`} | ${spell.effect === 'check' ? `마력 공격 A=${spell.power * 3}, 8칸·시야·명중; 장애물 속성 ${spell.element === 'flame' ? '불' : spell.element === 'stone' ? '타격' : '없음'}; 자동 상태 이상 없음` : spell.effect === 'heal' ? `살아 있는 아군 HP +min(잃은 HP,${spell.power}+floor(INT×.8)), 8칸·즉시` : `아군 방호 +${spell.power}+floor(INT×.3), 8칸·현재 라운드`} | ${spell.effect === 'heal' ? '사제' : support ? '마법사·사제' : '마법사'} |`);
}
lines.push('', '## 구성 요소 발견과 기도', '', '| 완독 도서 | 새 구성 요소 |', '| --- | --- |');
for (const [book, components] of Object.entries(FANTASY_MAGIC_BOOK_DISCOVERIES)) lines.push(`| ${FANTASY_READABLE_LIBRARY_BOOKS.find(value => value.id === book)!.title.ko} (${book}) | ${components.map(component => `${component.kind === 'element' ? '원소' : '형태'} ${component.id}`).join(' · ')} |`);
lines.push('', '### 새 중심·룬 도서', '', '| 완독 도서 | 새 중심·룬 |', '| --- | --- |');
for (const [book, components] of Object.entries(FANTASY_CIRCLE_BOOK_DISCOVERIES)) lines.push(`| ${FANTASY_READABLE_LIBRARY_BOOKS.find(value => value.id === book)?.title.ko ?? book} (${book}) | ${components.map(component => `${component.kind === 'core' ? '중심' : '룬'} ${component.id}`).join(' · ')} |`);
lines.push('', '- 던전 최초 유효 발견은 magic-flame/tide/gale/stone/light/bolt/veil/mend의 고정 구성 요소를 배운다. 경비 전투/방 조건을 우회하거나 같은 발견 보상을 반복하지 못한다. 지식과 도서·던전 영수증은 저장되어 재접속·전직 후에도 남는다. 신규 인물은 지식이 비어 있다. 지식 필드가 없는 구버전은 실제 완독한 해당 도서와 실제 저장된 유효 조합의 구성 요소만 인정한다.', '- 유효한 **완료** 사제 기도는 세계 날짜당 한 번, 미지의 물·빛·장막·회복 중 한 구성 요소를 배울 수 있다. 확률=min(5%,1%+실패 기도 수×0.25%p), 실패16회부터 상한5%. 취소·중복·이미 모두 습득한 기도에는 발견 난수를 쓰지 않는다. 실제 새 구성 요소를 기도로 배웠을 때만 실패 수를0으로 되돌린다. 책/던전 습득은 기도 실패 수를 초기화하지 않는다. 저장 실패는 상태/영수증을 확정하지 않으며 같은 확정 전 행동을 중복 보상하지 않는다.', '', '## 구현 근거', '', '기술 원본: shared/fantasy-data.ts, fantasy-job-paths.ts, fantasy-priest-growth.ts, fantasy-apprenticeship.ts, fantasy-mana.ts. 실제 노출·전투 수식: server/fantasy-combat-adapter.ts, shared/fantasy-combat.ts. 생활 판정·소비: shared/fantasy-engine.ts, fantasy-progression.ts. 합성·발견: fantasy-specializations.ts, fantasy-magic-discovery.ts. 이 생성기는 모든 고유 ID·한국어 기술명·각 경로의 두 기술 존재를 검사한다.', '');
const output = lines.join('\n');
const destination = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/fantasy-combat-capabilities.md');
if (process.argv.includes('--check')) { assert.equal(fs.readFileSync(destination, 'utf8'), output, 'Regenerate docs/fantasy-combat-capabilities.md'); console.log(`Capability reference matches: ${entries.length} skills, ${FANTASY_CIRCLE_CORES.length} cores, ${FANTASY_CIRCLE_RUNES.length} runes, ${FANTASY_MAGIC_COMBINATIONS.length} legacy recipes.`); }
else { fs.writeFileSync(destination, output); console.log(`Generated ${destination}: ${entries.length} skills, ${FANTASY_CIRCLE_CORES.length} cores, ${FANTASY_CIRCLE_RUNES.length} runes, ${FANTASY_MAGIC_COMBINATIONS.length} legacy recipes.`); }
