export function spokenPrefix(value: string, maximum = 2400): string {
  let text = value.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/gi, '');
  const partial = text.lastIndexOf('<');
  if (partial >= 0 && !text.slice(partial).includes('>')) text = text.slice(0, partial);
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trimStart().slice(0, maximum);
}

export async function readDialogueResponse(response: Response, progress?: (text: string) => void, maximum = 2400): Promise<{ text: string; model?: string }> {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const value = await response.json() as { model?: string; choices?: { message?: { content?: unknown } }[] };
    const content = value.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Dialogue has no spoken answer');
    return { text: spokenPrefix(content, maximum).trim(), model: value.model };
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Dialogue stream is missing');
  const decoder = new TextDecoder(); let buffer = '', raw = '', bytes = 0, model: string | undefined, finished = false;
  const consume = (event: string) => {
    const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    if (data === '[DONE]') { finished = true; return; }
    const value = JSON.parse(data) as { error?: unknown; usage?: unknown; model?: string; choices?: { delta?: { content?: unknown } }[] };
    if (value.error || !Array.isArray(value.choices) && !value.usage) throw new Error('Dialogue stream contains an upstream error');
    if (typeof value.model === 'string') model = value.model;
    const content = value.choices?.[0]?.delta?.content;
    if (typeof content !== 'string') return;
    raw += content;
    if (raw.length > maximum * 8) throw new Error('Dialogue output exceeds its limit');
    progress?.(spokenPrefix(raw, maximum));
  };
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength; if (bytes > 262144) throw new Error('Dialogue stream exceeds its limit');
      buffer += decoder.decode(chunk.value, { stream: true });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) { consume(buffer.slice(0, boundary.index)); buffer = buffer.slice(boundary.index + boundary[0].length); if (finished) break; }
      if (finished) break;
    }
    buffer += decoder.decode(); if (!finished && buffer.trim()) consume(buffer);
    return { text: spokenPrefix(raw, maximum).trim(), model };
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
