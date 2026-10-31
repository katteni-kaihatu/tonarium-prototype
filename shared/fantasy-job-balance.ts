export const FANTASY_JOB_HP_MULTIPLIERS: Readonly<Record<string, number>> = {
  unassigned: 1,
  adventurer: 1.15, ranger: 1.05, hunter: 1.05, bard: 1, leader: 1.1,
  warrior: 1.28, knight: 1.38, spearfighter: 1.2, archer: 1, scout: 1.05,
  pugilist: 1.22, spellblade: 1.08, shieldbearer: 1.55,
  mage: .72, summoner: .82, priest: .95,
  thief: 1, smuggler: 1.05, assassin: .95, bandit: 1.2, spy: .95, crimeboss: 1.1,
  merchant: 1, blacksmith: 1.15, cook: 1.05, alchemist: .95,
  carpenter: 1.1, tailor: 1, weaver: 1, leatherworker: 1.05, gemcutter: 1,
  herbalist: 1, farmer: 1.1, fisher: 1.1, baker: 1.05, potter: 1.05,
  shipwright: 1.15, scribe: .95,
};

export function fantasyJobHpMultiplier(job: string): number {
  return Object.hasOwn(FANTASY_JOB_HP_MULTIPLIERS, job) ? FANTASY_JOB_HP_MULTIPLIERS[job] : 1;
}

// 装備や種族を含む未補正の最大HPから毎回導出し、保存値へ倍率を重ねない。
export function fantasyJobMaxHp(job: string, unscaledMaxHp: number): number {
  return Math.max(20, Math.round((Number.isFinite(unscaledMaxHp) ? unscaledMaxHp : 20) * fantasyJobHpMultiplier(job)));
}

export function fantasyClampJobHp(currentHp: number, maxHp: number): number {
  if (currentHp <= 0 || !Number.isFinite(currentHp)) return 0;
  return Math.max(1, Math.min(Math.round(currentHp), Math.max(20, Math.round(maxHp))));
}

export interface FantasyJobCombatProfile { attack: number; defense: number; intelligence: number; magicResist: number }
const neutral: Readonly<FantasyJobCombatProfile> = { attack: 1, defense: 1, intelligence: 1, magicResist: 1 };
const combatProfiles: Readonly<Record<string, Partial<FantasyJobCombatProfile>>> = {
  mage: { intelligence: 1.25 },
  warrior: { attack: .98 },
  knight: { attack: .98, defense: 1.16 },
  shieldbearer: { attack: .92, defense: 1.2, magicResist: 1.1 },
  pugilist: { attack: 1.08 },
};
export function fantasyJobCombatProfile(job: string): Readonly<FantasyJobCombatProfile> {
  return { ...neutral, ...(Object.hasOwn(combatProfiles,job)?combatProfiles[job]:{}) };
}

export function fantasyJobMagicAttackRatio(job: string | undefined): number {
  return job==='mage'?.80:job==='priest'?.56:.4;
}
export function fantasyJobHealingBonus(job: string | undefined, maximumHp: number): number {
  return job==='priest'?Math.floor(Math.max(0,maximumHp)*.04):0;
}
