/** Ephemeral reactions, shared by the server, portraits and world avatars. */
export const EMOTES = {
    cheer: { name: 'ばんざい！', caption: 'やったー！', mark: '🙌', particles: '✦', color: '#a3426b', tint: '#f6dfe9', duration: 2600 },
    bow: { name: 'ぺこり', caption: 'ありがとう', mark: '🌷', particles: '❀', color: '#665185', tint: '#e8e1f3', duration: 2400 },
    wave: { name: '手を振る', caption: 'やっほー！', mark: '👋', particles: '✦', color: '#bd642b', tint: '#fff0d5', duration: 2600 },
    hop: { name: 'ぴょんぴょん', caption: 'わーい！', mark: '✨', particles: '✧', color: '#a16a08', tint: '#fff6c9', duration: 2400 },
    slump: { name: 'しょんぼり', caption: 'しょぼん…', mark: '💧', particles: '︙', color: '#527ba6', tint: '#e8f2fc', duration: 2800 },
    fall: { name: 'ばたん', caption: 'ばたんっ', mark: '💫', particles: '☆', color: '#9161a9', tint: '#f5eafa', duration: 3000 },
};
export const isEmoteId = (id) => typeof id === 'string' && Object.hasOwn(EMOTES, id);
const smooth = (v) => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); };
/** Local visual offsets only; never changes movement, collisions, or the camera position. */
export function emotePose(id, elapsed) {
    const duration = EMOTES[id].duration;
    const weight = smooth(elapsed / 220) * smooth((duration - elapsed) / 350);
    const t = Math.max(0, elapsed) / 1000;
    const pose = { y: 0, rx: 0, rz: 0, sx: 1, sy: 1, left: 0, right: 0, bow: 0, liftLeft: 0, liftRight: 0, hands: 0 };
    if (weight <= 0)
        return pose;
    if (id === 'cheer') {
        pose.liftLeft = pose.liftRight = 68 * weight;
        pose.left = -.4 * weight;
        pose.right = .4 * weight;
        pose.hands = weight;
        pose.y = Math.abs(Math.sin(t * 5)) * .16 * weight;
    }
    else if (id === 'bow') {
        pose.bow = .65 * weight;
        pose.rx = -.3 * weight;
        pose.y = -.08 * weight;
    }
    else if (id === 'wave') {
        pose.right = (-0.25 + Math.sin(t * 17) * 0.55) * weight;
        pose.liftRight = 38 * weight;
        pose.hands = weight;
        pose.rz = Math.sin(t * 6) * 0.06 * weight;
    }
    else if (id === 'hop') {
        const bounce = Math.abs(Math.sin(t * Math.PI * 3));
        pose.y = bounce * 0.38 * weight;
        pose.sx = 1 + (0.08 - bounce * 0.12) * weight;
        pose.sy = 1 + (bounce * 0.16 - 0.1) * weight;
        pose.left = -0.4 * weight;
        pose.right = 0.4 * weight;
        pose.liftLeft = pose.liftRight = 28 * weight;
        pose.hands = weight;
    }
    else if (id === 'slump') {
        pose.y = -0.13 * weight;
        pose.rx = -0.2 * weight;
        pose.sy = 1 - 0.16 * weight;
        pose.left = 0.22 * weight;
        pose.right = -0.22 * weight;
        pose.bow = 0.48 * weight;
        pose.liftLeft = pose.liftRight = -10 * weight;
    }
    else {
        const collapse = smooth((elapsed - 150) / 500) * smooth((duration - elapsed) / 500);
        pose.rz = -Math.PI / 2 * collapse;
        pose.y = 0.12 * collapse;
        pose.left = -0.7 * collapse;
        pose.right = 0.8 * collapse;
    }
    return pose;
}
