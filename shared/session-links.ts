export function sessionUrl(id: string, origin: string) {
  return new URL(origin).origin + '/#/session/' + encodeURIComponent(id);
}

export function sessionIdFromUrl(value: string): string | null {
  try {
    const match = new URL(value).hash.match(/^#\/session\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) || null : null;
  } catch { return null; }
}

export async function copySessionLink(id: string, origin: string, write: (text: string) => Promise<void>, notify: (success: boolean) => void) {
  try { await write(sessionUrl(id, origin)); }
  catch { notify(false); return; }
  notify(true);
}
