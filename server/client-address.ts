import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

const normalizeAddress = (value?: string): string | undefined => {
  if (!value) return undefined;
  if (isIP(value) === 4) return value;
  if (isIP(value) !== 6 || value.includes('%')) return undefined;
  const address = new URL(`http://[${value}]/`).hostname.slice(1,-1);
  const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/u.exec(address);
  if (!mapped) return address;
  const first = Number.parseInt(mapped[1],16), second = Number.parseInt(mapped[2],16);
  return `${first >>> 8}.${first & 255}.${second >>> 8}.${second & 255}`;
};
const loopback = (value?: string) => { const address = normalizeAddress(value); return address === '::1' || !!address?.startsWith('127.'); };
interface TrustedProxyRange { version: 4 | 6; network: bigint; mask: bigint }
const addressValue = (address: string): { version: 4 | 6; value: bigint } | undefined => {
  if (isIP(address) === 4) {
    let value = 0n;
    for (const part of address.split('.')) value = value * 256n + BigInt(part);
    return { version: 4, value };
  }
  if (isIP(address) !== 6) return undefined;
  const halves = address.split('::');
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(':') : [], right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if (halves.length === 1 && left.length !== 8) return undefined;
  const missing = 8 - left.length - right.length;
  if (missing < 0) return undefined;
  let value = 0n;
  for (const group of [...left, ...Array<string>(missing).fill('0'), ...right]) {
    if (!/^[a-f0-9]{1,4}$/u.test(group)) return undefined;
    value = value * 65536n + BigInt(Number.parseInt(group, 16));
  }
  return { version: 6, value };
};
// CIDR 項目は許可帯域として解釈する。全域指定（/0）は「誰の転送ヘッダでも信じる」と同義なので不正として扱う。
const parseTrustedProxyRange = (entry: string): TrustedProxyRange | undefined => {
  const slash = entry.indexOf('/');
  if (slash < 0 || entry.indexOf('/', slash + 1) >= 0) return undefined;
  const address = normalizeAddress(entry.slice(0, slash)), prefixText = entry.slice(slash + 1);
  if (!address || !/^\d+$/u.test(prefixText)) return undefined;
  const parsed = addressValue(address);
  if (!parsed) return undefined;
  const bits = parsed.version === 4 ? 32 : 128, prefix = Number(prefixText);
  if (prefix < 1 || prefix > bits) return undefined;
  const mask = ((1n << BigInt(prefix)) - 1n) << BigInt(bits - prefix);
  return { version: parsed.version, network: parsed.value & mask, mask };
};


export interface ClientAddressOptions {
  trustProxy?: boolean;
  trustedProxyAddresses?: readonly string[];
}
export function createClientAddress(options: ClientAddressOptions = {}): (req: IncomingMessage) => string {
  const addresses = new Set<string>(), ranges: TrustedProxyRange[] = [];
  for (const entry of options.trustedProxyAddresses ?? []) {
    const range = entry.includes('/') ? parseTrustedProxyRange(entry) : undefined;
    if (range) { ranges.push(range); continue; }
    const address = normalizeAddress(entry);
    if (address !== undefined) addresses.add(address);
  }
  return req => {
    const remote = normalizeAddress(req.socket.remoteAddress);
    const parsed = remote && addressValue(remote);
    const trusted = !!remote && (addresses.has(remote) || !!options.trustProxy && loopback(remote)
      || !!parsed && ranges.some(range => range.version === parsed.version && (parsed.value & range.mask) === range.network));
    // 信頼するプロキシが末尾に足した IP だけを採用する。
    const forwarded = trusted && typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',').at(-1)?.trim() : undefined;
    return normalizeAddress(forwarded) ?? remote ?? 'unknown';
  };
}
