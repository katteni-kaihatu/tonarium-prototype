export const FANTASY_LIFE_JOBS = ['alchemist','cook','baker','blacksmith','carpenter','tailor','weaver','leatherworker','gemcutter','herbalist','farmer','fisher','scribe','merchant','shipwright','potter'] as const;
export type FantasyLifeJob = typeof FANTASY_LIFE_JOBS[number];
export function fantasyIsLifeJob(job: string): job is FantasyLifeJob {
  return (FANTASY_LIFE_JOBS as readonly string[]).includes(job);
}
type Careers = {job:string;lifeJob?:string};
export function fantasyLifeJob(c: Careers): FantasyLifeJob | undefined {
  return fantasyIsLifeJob(c.job) ? c.job : c.lifeJob && fantasyIsLifeJob(c.lifeJob) ? c.lifeJob : undefined;
}
export function fantasyHasJob(c: Careers, job: string): boolean {
  return c.job === job || fantasyLifeJob(c) === job;
}
export function fantasyCombatJob(c: Careers): string {
  return fantasyIsLifeJob(c.job) ? 'unassigned' : c.job;
}
