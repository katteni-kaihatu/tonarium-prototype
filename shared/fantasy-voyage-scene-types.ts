import type { FantasyMainApproach } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';

export type FantasyVoyageText = Record<NpcLocale, string>;
export type FantasyVoyageStageId = 'field' | 'verify' | 'compare';
export interface FantasyVoyageScene {
  chapter: number;
  stage: FantasyVoyageStageId;
  requires: string[];
  setup: FantasyVoyageText;
  approaches: Record<FantasyMainApproach, FantasyVoyageText>;
  success: FantasyVoyageText;
  failure: FantasyVoyageText;
  clue: { name: FantasyVoyageText; fact: FantasyVoyageText };
  next: FantasyVoyageText;
}
export interface FantasyVoyageChapterDetail {
  chapter: number;
  motivation: FantasyVoyageText;
  stakes: FantasyVoyageText;
}
