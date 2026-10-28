export type AiResourceReason = 'hidden' | 'offline' | 'connection' | 'performance' | 'memory' | 'unsupported' | 'other-tab' | 'manual' | 'error' | null;
export interface AiResourceSignals {
  now: number; visible: boolean; online: boolean; connected: boolean; webGpu: boolean;
  deviceMemory?: number; heapRatio?: number; fps?: number; eventLoopDelay?: number; longTaskMs?: number; performanceSampleId?: number;
}
export interface AiResourcePolicy {
  paused: boolean; healthySince: number | null; cooldownUntil: number; hiddenSince: number | null; slowSamples: number; memoryPressure: boolean; lastPerformanceSampleId?: number;
}
export interface AiResourceDecision { state: AiResourcePolicy; pause: boolean; unload: boolean; unsupported: boolean; reason: AiResourceReason }
export const AI_HEALTHY_MS = 25_000;
export const AI_COOLDOWN_MS = 45_000;
export const AI_HIDDEN_UNLOAD_MS = 60_000;
export const AI_HEAP_PAUSE_RATIO = .85;
export const AI_HEAP_RESUME_RATIO = .75;
export const initialAiResourcePolicy = (): AiResourcePolicy => ({ paused: false, healthySince: null, cooldownUntil: 0, hiddenSince: null, slowSamples: 0, memoryPressure: false });

/** 精密なCPU/GPU使用率を仮定せず、ゲームで観測した遅延だけで抑制する。 */
export function evaluateAiResources(previous: AiResourcePolicy, input: AiResourceSignals): AiResourceDecision {
  const hiddenSince = input.visible ? null : previous.hiddenSince ?? input.now;
  const unsupported = !input.webGpu || input.deviceMemory !== undefined && input.deviceMemory <= 2;
  const lowMemoryDevice = input.deviceMemory !== undefined && input.deviceMemory <= 4;
  const heap = input.heapRatio !== undefined && Number.isFinite(input.heapRatio) ? input.heapRatio : undefined;
  // 境界付近で再ロードを繰り返さず、圧迫後は十分な余裕を待つ。
  const memoryPressure = heap !== undefined ? heap >= AI_HEAP_PAUSE_RATIO || previous.memoryPressure && heap > AI_HEAP_RESUME_RATIO : previous.memoryPressure;
  const severeMemory = lowMemoryDevice || memoryPressure;
  const measuredFps = input.fps !== undefined && Number.isFinite(input.fps) && input.fps >= 0 ? input.fps : undefined;
  const severeStall = input.visible && (measuredFps !== undefined && measuredFps < 8
    || (input.eventLoopDelay ?? 0) >= 1000 || (input.longTaskMs ?? 0) >= 1000);
  const slow = input.visible && (measuredFps !== undefined && measuredFps < 28
    || (input.eventLoopDelay ?? 0) > 350 || (input.longTaskMs ?? 0) > 500);
  // UI、通信、ジョブ受付による再評価で同じ1秒の観測を重複加算しない。
  const freshPerformanceSample = input.performanceSampleId === undefined || input.performanceSampleId !== previous.lastPerformanceSampleId;
  const slowSamples = slow ? previous.slowSamples + (freshPerformanceSample ? 1 : 0) : 0;
  const reason: AiResourceReason = unsupported ? 'unsupported' : severeMemory ? 'memory' : !input.visible ? 'hidden'
    : !input.online ? 'offline' : !input.connected ? 'connection' : severeStall || slowSamples >= 3 ? 'performance' : null;
  if (reason) return {
    state: { paused: true, healthySince: null, cooldownUntil: reason === 'memory' || reason === 'performance' ? input.now + AI_COOLDOWN_MS : previous.cooldownUntil, hiddenSince, slowSamples, memoryPressure, lastPerformanceSampleId: input.performanceSampleId },
    pause: true, unload: unsupported || severeMemory || reason === 'performance' || hiddenSince !== null && input.now - hiddenSince >= AI_HIDDEN_UNLOAD_MS,
    unsupported, reason,
  };
  const healthySince = previous.healthySince ?? input.now;
  const pause = previous.paused && previous.cooldownUntil > 0 && (slow || input.now < previous.cooldownUntil || input.now - healthySince < AI_HEALTHY_MS);
  return { state: { paused: pause, healthySince: slow ? null : healthySince, cooldownUntil: pause ? previous.cooldownUntil : 0, hiddenSince, slowSamples, memoryPressure, lastPerformanceSampleId: input.performanceSampleId },
    pause, unload: false, unsupported: false, reason: pause ? 'performance' : null };
}
