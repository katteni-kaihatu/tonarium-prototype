import { encode, decode } from '@msgpack/msgpack';
export const PACKET_TOPIC = 'tonarium.v1';
export const MAX_PACKET = 32 * 1024 * 1024;
export const BLOB_THRESHOLD = 48 * 1024;
export const pack = (value) => encode(value, { ignoreUndefined: true });
export const unpack = (bytes) => decode(bytes, {
    maxStrLength: MAX_PACKET, maxBinLength: MAX_PACKET, maxArrayLength: MAX_PACKET, maxMapLength: 100_000,
});
export const base64 = (bytes) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
export const unbase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const importKey = (value) => crypto.subtle.importKey('raw', unbase64(value), 'AES-GCM', false, ['encrypt', 'decrypt']);
const aad = (grant, lane, seq) => pack([PACKET_TOPIC, grant, lane, seq]);
export async function seal(key, grant, lane, seq, value) {
    return sealBytes(key, grant, lane, seq, pack(value));
}
export async function sealBytes(key, grant, lane, seq, bytes) {
    if (bytes.length > MAX_PACKET - 1024)
        throw new Error('同期データが 32 MiB を超えています');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const body = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(grant, lane, seq) }, key, new Uint8Array(bytes)));
    return { grant, lane, seq, iv, body };
}
export async function open(key, grant, lane, raw) {
    const p = raw;
    if (!p || p.grant !== grant || p.lane !== lane || !Number.isSafeInteger(p.seq) || p.seq < 1 ||
        !(p.iv instanceof Uint8Array) || p.iv.length !== 12 || !(p.body instanceof Uint8Array) || p.body.length > MAX_PACKET)
        throw new Error('Invalid session packet');
    const value = unpack(new Uint8Array(await crypto.subtle.decrypt({
        name: 'AES-GCM', iv: new Uint8Array(p.iv), additionalData: aad(grant, lane, p.seq),
    }, key, new Uint8Array(p.body))));
    return { seq: p.seq, value };
}
export async function sendPacket(client, peer, packet) {
    const bytes = pack(packet);
    if (bytes.length > BLOB_THRESHOLD)
        await client.sendBlob(peer, bytes);
    else
        await client.message(PACKET_TOPIC, packet);
}
export function receiveBlob(client, offer, accept, receive) {
    if (!accept(offer.peer) || typeof offer.size !== 'bigint' || offer.size > BigInt(MAX_PACKET) || offer.size < 1n) {
        client.cancelBlob(offer.transfer, new Error('Unexpected session blob'));
        return Promise.resolve();
    }
    const bytes = new Uint8Array(Number(offer.size));
    let offset = 0;
    return client.acceptBlob(offer, {
        write(chunk) { bytes.set(chunk, offset); offset += chunk.length; },
        async close() { await receive(unpack(bytes), offer.peer); },
    }).then(() => { });
}
