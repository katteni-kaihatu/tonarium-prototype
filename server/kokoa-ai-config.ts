export function npcEndpoint(value: string, remote = true): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const ip = host.split('.').map(Number);
    const privateIp = ip.length === 4 && ip.every(v => Number.isInteger(v) && v >= 0 && v < 256)
      && (ip[0] === 127 || ip[0] === 10 || (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31) || (ip[0] === 192 && ip[1] === 168));
    const localHost = host === '[::1]' || /^[a-z][a-z0-9-]{0,62}$/.test(host) || /^(?:[a-z0-9-]+\.)*docker\.internal$/.test(host);
    if (url.username || url.password || url.search || url.hash
      || (remote ? url.protocol !== 'https:' : !['http:', 'https:'].includes(url.protocol) || !(privateIp || localHost))) return null;
    url.pathname = url.pathname.replace(/\/+$/, '');
    if (!url.pathname.endsWith('/chat/completions')) url.pathname += '/chat/completions';
    return url.toString();
  } catch { return null; }
}

export function resolveDialogueBackend(options: { url?: string; model?: string } = {}, env: NodeJS.ProcessEnv = process.env) {
  const injected = options.url !== undefined;
  const model = options.model ?? (env.KOKOAAI_MODEL?.trim() || 'lfm3-1.7b');
  const apiKey = injected ? undefined : env.KOKOAAI_APIKEY?.trim();
  const validModel = model.length > 0 && model.length <= 160 && !/[\u0000-\u001f\u007f]/.test(model);
  const validKey = apiKey && !/[\u0000-\u001f\u007f]/.test(apiKey);
  const endpoint = validModel && (injected || validKey)
    ? npcEndpoint(injected ? options.url! : env.KOKOAAI_BASEURL?.trim() || 'https://chat.kokoa.dev/v1', !injected) : null;
  return { endpoint, model, apiKey: validKey ? apiKey : undefined };
}

export function dialogueErrorReporter(report: (error: unknown) => void) {
  return (error: unknown) => report(new Error(error instanceof Error && /^KokoaAI HTTP \d{3}$/.test(error.message) ? error.message : 'KokoaAI request failed'));
}
