export function resolveLocalInferenceUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.NPC_LLM_URL;
  const bundled = env.NPC_LLM_BUNDLED_URL?.trim();
  if (!bundled) return configured ?? 'http://127.0.0.1:18081/v1';
  if (!configured?.trim()) return bundled;
  try {
    const url = new URL(configured);
    if (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      && url.port === '18081' && ['/', '/v1', '/v1/', '/v1/chat/completions', '/chat/completions'].includes(url.pathname)
      && !url.username && !url.password && !url.search && !url.hash) return bundled;
  } catch { /* 不正な設定も既存の接続先検証へ渡す。 */ }
  return configured;
}
