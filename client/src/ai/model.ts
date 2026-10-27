import type { AppConfig, ModelRecord } from '@mlc-ai/web-llm';
import { BROWSER_AI_MODEL, type BrowserAiJob } from '../../../shared/ai-support.ts';

export { BROWSER_AI_MODEL };
export const BROWSER_AI_MODEL_REVISION = '80b3abcec6c3b3f5355dc0cc99cc4fb578f192bc';
export const BROWSER_AI_MODEL_REPOSITORY = `https://huggingface.co/mlc-ai/${BROWSER_AI_MODEL}`;
export const BROWSER_AI_MODEL_URL = `${BROWSER_AI_MODEL_REPOSITORY}/resolve/${BROWSER_AI_MODEL_REVISION}/`;
export const BROWSER_AI_MODEL_LIB = 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_86/base/Qwen3-1.7B-q4f16_1_cs1k-webgpu.wasm';
export const BROWSER_AI_DOWNLOAD_MB = 984;
export const BROWSER_AI_VRAM_ESTIMATE_MB = 2036.66;
export const BROWSER_AI_CONTEXT = 4096;
export const BROWSER_AI_MAX_TOKENS = 160;
export const BROWSER_AI_MAX_TEXT = 2400;
export const BROWSER_AI_DISPOSE_MS = 1500;
export const BROWSER_AI_MAX_JOB_MS = 45_000;

/** 0.2.86 の正式カタログだけを使い、モデル重みを検証済みの revision に固定する。 */
export function browserAiAppConfig(prebuilt: AppConfig): AppConfig {
  const record = prebuilt.model_list.find(record => record.model_id === BROWSER_AI_MODEL);
  if (!record || record.model !== BROWSER_AI_MODEL_REPOSITORY || record.model_lib !== BROWSER_AI_MODEL_LIB) throw new Error('Unsupported WebLLM model catalog');
  const selected: ModelRecord = { ...record, model: BROWSER_AI_MODEL_URL, overrides: { ...record.overrides, context_window_size: BROWSER_AI_CONTEXT } };
  return { model_list: [selected], cacheBackend: 'cache' };
}

export function validBrowserAiJob(value: unknown, now = Date.now()): value is BrowserAiJob {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const job = value as BrowserAiJob;
  if (![job.leaseId, job.epoch, job.requestId].every(id => typeof id === 'string' && id.length > 0 && id.length <= 160)
    || !['npc', 'gm'].includes(job.kind) || !Number.isFinite(job.expiresAt) || job.expiresAt <= now
    || !Number.isInteger(job.maxTokens) || job.maxTokens < 1 || job.maxTokens > BROWSER_AI_MAX_TOKENS
    || !Number.isFinite(job.temperature) || job.temperature < 0 || job.temperature > 1
    || !Array.isArray(job.messages) || job.messages.length < 2 || job.messages.length > 24) return false;
  if (job.messages[0]?.role !== 'system' || job.messages.at(-1)?.role !== 'user') return false;
  let length = 0;
  return job.messages.every((message, index) => !!message && typeof message === 'object' && ['system', 'user', 'assistant'].includes(message.role)
    && (message.role !== 'system' || index === 0) && typeof message.content === 'string' && (length += message.content.length) <= 12_000);
}

export function browserAiPlainText(text: string): string {
  return text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').replace(/<\|[^>]*\|>/g, '').replace(/<[^>]*>/g, '')
    .replace(/<[^>]*$/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, BROWSER_AI_MAX_TEXT);
}
