export const BROWSER_AI_MODEL = 'Qwen3-1.7B-q4f16_1-MLC';
export interface BrowserAiCooperation { version: 2; shareIdle: boolean; allowRemote: boolean; idle: boolean }
export interface BrowserAiMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface BrowserAiGeneration {
  messages: BrowserAiMessage[]; maxTokens: number; temperature: number;
  requestId: string; kind: 'npc' | 'gm';
}
export interface BrowserAiJob extends BrowserAiGeneration {
  leaseId: string; epoch: string; expiresAt: number;
  scope?: 'self' | 'shared';
}
export type BrowserAiResult = { leaseId: string; epoch: string; text?: string; error?: 'cancelled' | 'unavailable' | 'invalid' };
export type BrowserAiClientMsg =
  | { t: 'aiSupport'; ready: boolean; epoch: string; model: typeof BROWSER_AI_MODEL; cooperation?: BrowserAiCooperation }
  | ({ t: 'aiSupportResult' } & BrowserAiResult)
  | { t: 'aiSupportChunk'; leaseId: string; epoch: string; text: string; sequence: number };
export type BrowserAiServerMsg =
  | { t: 'aiSupportJob'; job: BrowserAiJob }
  | { t: 'aiSupportCancel'; leaseId: string; epoch: string };
export type BrowserAiGenerate = (request: BrowserAiGeneration, signal: AbortSignal, sharedRequest?: BrowserAiGeneration, progress?: (text: string) => void) => Promise<string | undefined>;
