import type { FantasyAction, FantasyCharacter, FantasyProfile, FantasyResult } from './fantasy.ts';
import { FANTASY_MIRACLES, FANTASY_MIRACLE_IDS, type FantasyMiracleId } from './fantasy-miracle-catalog.ts';
import { fantasyPriestGrowthStatus } from './fantasy-priest-growth.ts';
import { fantasyBuildings } from './fantasy-town.ts';
import type { NpcLocale } from './npc.ts';

export interface FantasyMiracleKnowledge { learned: FantasyMiracleId[]; prepared: FantasyMiracleId[]; failedPrayers: number; lastDiscoveryDay?: number }
export type FantasyMiracleAction = { type: 'miraclePrepare'; miracles: FantasyMiracleId[] };
export const fantasyIsSaint = (c: FantasyCharacter) => c.job === 'priest' && c.priestGrowth?.branch === 'saint';
export function validFantasyLastDawnPledge(c:FantasyCharacter):boolean{
  const p=c.lastDawnPledge;return p===undefined||!!p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).length===2&&typeof p.combat==='string'&&p.combat.length>0&&p.combat.length<=200&&!/[\u0000-\u001f\u007f]/u.test(p.combat)&&Number.isSafeInteger(p.generation)&&p.generation>=1;
}
export function validFantasyMiracleKnowledge(c: FantasyCharacter): boolean {
  const m = c.miracles; if (m === undefined) return true;
  const ids = (v: unknown): v is FantasyMiracleId[] => Array.isArray(v) && new Set(v).size === v.length && v.every(id => (FANTASY_MIRACLE_IDS as readonly unknown[]).includes(id));
  return !!m && typeof m === 'object' && !Array.isArray(m) && Object.keys(m).every(k => ['learned', 'prepared', 'failedPrayers', 'lastDiscoveryDay'].includes(k)) && ids(m.learned) && m.learned.length <= FANTASY_MIRACLES.length && ids(m.prepared) && m.prepared.length <= 3 && m.prepared.every(id => m.learned.includes(id)) && Number.isSafeInteger(m.failedPrayers) && m.failedPrayers >= 0 && m.failedPrayers <= 200 && (m.lastDiscoveryDay === undefined || Number.isSafeInteger(m.lastDiscoveryDay) && m.lastDiscoveryDay >= 0 && m.lastDiscoveryDay <= Math.floor(c.hour / 24));
}
export function discoverFantasyMiracle(c: FantasyCharacter, roll: number): FantasyMiracleId | undefined {
  if (!fantasyIsSaint(c)) return;
  const m = c.miracles ??= { learned: [], prepared: [], failedPrayers: 0 };
  const growth = fantasyPriestGrowthStatus(c), day = Math.floor(c.hour / 24);
  if (m.lastDiscoveryDay === day) return;
  const eligible = FANTASY_MIRACLES.filter((entry, index) => !m.learned.includes(entry.id) && c.readBooks?.includes(entry.book) && growth.faith >= 90 + index * 12 && (c.jobXp.priest ?? 0) >= 500 + index * 100 && growth.service >= 12 + index * 3 && growth.pilgrimage >= 5 && growth.prayers >= 20 + index);
  if (!eligible.length) return;
  const chance = Math.min(.25, .03 + m.failedPrayers * .005);
  if (roll >= chance) { m.failedPrayers = Math.min(200, m.failedPrayers + 1); return; }
  const selected = eligible[Math.min(eligible.length - 1, Math.floor(Math.max(0, roll) / chance * eligible.length))];
  m.learned.push(selected.id); m.failedPrayers = 0; m.lastDiscoveryDay = day; return selected.id;
}
export function fantasyMiracleText(source: string, locale: NpcLocale): string | undefined {
  if (source === 'miracle:pledge-bound') return {ko:'마지막 새벽의 약속이 남아 있습니다. 이 전투가 끝나기를 기다려야 합니다.',en:'The pledge of the Last Dawn remains. Wait for this battle to end.',ja:'最後の夜明けの約束が残っています。この戦闘が終わるのを待ってください。'}[locale];
  if (source === 'miracle:prepare-error') return { ko: '낮에 신전을 방문해 깨달은 기적을 최대 3개 선택하세요.', en: 'Visit a temple during the day and select up to three discovered miracles.', ja: '昼に神殿を訪ね、悟った奇跡を三つまで選んでください。' }[locale];
  if (source === 'miracle:prepared') return { ko: '신전에서 사용할 기적을 준비했습니다.', en: 'Your miracles have been prepared at the temple.', ja: '神殿で使う奇跡を整えた。' }[locale];
  if (source.startsWith('miracle:discovered:')) { const entry = FANTASY_MIRACLES.find(m => m.id === source.slice(19)); if (entry) return { ko: `오랜 기도 끝에 ‘${entry.names.ko}’의 뜻을 깨달았다.`, en: `After long prayer, you grasped ${entry.names.en}.`, ja: `長い祈りの末、${entry.names.ja}の意味を悟った。` }[locale]; }
}
export function applyFantasyMiracleAction(profile: FantasyProfile, action: FantasyAction): FantasyResult | undefined {
  if (action.type !== 'miraclePrepare') return;
  const c = profile.character, ids = action.miracles;
  if (!c || profile.death || profile.activity || profile.combatId || profile.event || c.hp <= 0 || !fantasyIsSaint(c) || !fantasyBuildings(c).some(b => b.id === 'temple') || c.hour % 24 < 6 || c.hour % 24 >= 18 || !Array.isArray(ids) || ids.length > 3 || new Set(ids).size !== ids.length || ids.some(id => !(FANTASY_MIRACLE_IDS as readonly string[]).includes(id) || !c.miracles?.learned.includes(id))) return { profile, changed: false, error: 'miracle:prepare-error' };
  const next = structuredClone(profile), target = next.character!;
  target.miracles ??= { learned: [], prepared: [], failedPrayers: 0 }; target.miracles.prepared = [...ids]; next.revision++;
  next.log.push({ id: (next.log.at(-1)?.id ?? 0) + 1, hour: c.hour, kind: 'system', text: 'miracle:prepared' }); next.log = next.log.slice(-100); return { profile: next, changed: true };
}
