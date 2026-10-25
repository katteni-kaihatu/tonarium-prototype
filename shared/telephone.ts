export interface TelephoneParticipant { id: string; name: string; kind: 'human' }
export interface TelephoneStroke { color: string; size: number; pts: number[] }
export type TelephoneAnswer = { kind: 'text'; text: string } | { kind: 'drawing'; strokes: TelephoneStroke[] };
export interface TelephoneEntry { by: string; answer: TelephoneAnswer }
export interface TelephoneView {
  registered: TelephoneParticipant[];
  present: string[];
  participants: TelephoneParticipant[];
  host: string | null;
  round: number;
  phase: 'lobby' | 'playing' | 'results';
  step: number;
  deadline: number | null;
  submitted: string[];
  assignment?: { chain: number; previous?: TelephoneEntry; own?: TelephoneAnswer };
  revealed: number;
  page: number;
  results: { chain: number; step: number; entry: TelephoneEntry }[];
}
export type TelephoneAction =
  | { a: 'telephoneRegister'; registered: boolean }
  | { a: 'telephoneStart' }
  | { a: 'telephoneSubmit'; round: number; step: number; answer: TelephoneAnswer }
  | { a: 'telephoneReveal'; round: number }
  | { a: 'telephonePage'; round: number; page: number };

export const telephoneKind = (step: number) => step % 2 === 0 ? 'text' : 'drawing';
export const telephoneDuration = (step: number) => telephoneKind(step) === 'text' ? 60_000 : 120_000;
export const telephoneChain = (participant: number, step: number, count: number) => (participant - step + count) % count;
export const TELEPHONE_MAX_POINTS = 2000;
export const TELEPHONE_MAX_STROKES = 250;
export const emptyTelephoneView = (): TelephoneView => ({ registered: [], present: [], participants: [], host: null,
  round: 0, phase: 'lobby', step: 0, deadline: null, submitted: [], revealed: 0, page: 0, results: [] });
