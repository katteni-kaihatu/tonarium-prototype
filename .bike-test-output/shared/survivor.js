import { ROOM_HALF } from './protocol.js';
/** Cooperative 10-minute survival run. The server owns all run and profile state. */
export const SURVIVOR_TITLE = '宵闇サバイバーズ：夜明けまで10分';
export const SURVIVOR_DURATION_MS = 10 * 60_000;
export const SURVIVOR_TICK_MS = 200;
export const SURVIVOR_CHOICE_TIMEOUT_MS = 10_000;
export const SURVIVOR_JOIN = { x: 0, z: 6.5, r: 1.8 };
/** Player centers stay inside the ordinary Tonarium room walls (ROOM_HALF - 0.5). */
export const SURVIVOR_WORLD_LIMIT = ROOM_HALF - 0.5;
export const clampSurvivorPosition = (x, z) => ({
    x: Math.max(-SURVIVOR_WORLD_LIMIT, Math.min(SURVIVOR_WORLD_LIMIT, x)),
    z: Math.max(-SURVIVOR_WORLD_LIMIT, Math.min(SURVIVOR_WORLD_LIMIT, z)),
});
export const SURVIVOR_MOVE_SPEED = 4.2;
export const SURVIVOR_MAX_ENEMIES = 100;
export const SURVIVOR_BASE_SYNERGY_GEAR = 1;
export const SURVIVOR_MAX_SYNERGY_GEAR = 5;
export const SURVIVOR_STYLES = {
    bloodrose: { name: '紅蓮の剣士', mark: '⚔', desc: '周囲を薙ぐ刃。体力が高く、近距離戦が得意。', weapon: 'moonblade', hp: 120, speed: 4.2 },
    stargazer: { name: '星詠み', mark: '✦', desc: '最も近い敵へ星弾を放つ。攻撃の回転が速い。', weapon: 'starbolt', hp: 90, speed: 4.2, unlockAt: 1 },
    wraith: { name: '宵渡り', mark: '☾', desc: '影の波で敵を貫く。移動が速く、敵をかわしやすい。', weapon: 'shade', hp: 100, speed: 4.8, unlockAt: 2 },
    cinderwitch: { name: '灰燼の魔女', mark: '♨', desc: '爆ぜる火種で敵の群れを焼く。身軽だが体力は控えめ。', weapon: 'embermine', hp: 88, speed: 4.35, unlockAt: 3 },
    stormweaver: { name: '雷鳴の紡ぎ手', mark: 'ϟ', desc: '雷を連鎖させて敵を薙ぐ。攻守の釣り合いに優れる。', weapon: 'stormring', hp: 102, speed: 4.2, unlockAt: 4 },
    frostwarden: { name: '霜壁の守人', mark: '❄', desc: '氷槍で敵を一直線に貫く。頑丈だが足は遅い。', weapon: 'frostlance', hp: 138, speed: 3.85, unlockAt: 5 },
};
export const SURVIVOR_GEAR = {
    moonblade: { id: 'moonblade', name: '月蝕の刃', kind: 'weapon', rarity: 'common', desc: '近くの敵を斬る回転刃。', maxLevel: 5, synergy: 'ironheart' },
    starbolt: { id: 'starbolt', name: '星屑の弾丸', kind: 'weapon', rarity: 'common', desc: '最も近い敵へ星弾を放つ。', maxLevel: 5, synergy: 'astralbook' },
    shade: { id: 'shade', name: '影縫い', kind: 'weapon', rarity: 'common', desc: '前方へ影の波を放ち、敵を貫く。', maxLevel: 5, synergy: 'nightcloak' },
    bloodaura: { id: 'bloodaura', name: '血月の輪', kind: 'weapon', rarity: 'rare', desc: '周囲を焼く血のオーラ。', maxLevel: 5, synergy: 'soulcrown' },
    ironheart: { id: 'ironheart', name: '鉄の心臓', kind: 'passive', rarity: 'common', desc: '最大体力と防御力が上がる。', maxLevel: 5 },
    astralbook: { id: 'astralbook', name: '星図の書', kind: 'passive', rarity: 'common', desc: '武器の攻撃間隔が短くなる。', maxLevel: 5 },
    nightcloak: { id: 'nightcloak', name: '夜渡りの外套', kind: 'passive', rarity: 'rare', desc: '移動速度と無敵時間が上がる。', maxLevel: 5 },
    soulcrown: { id: 'soulcrown', name: '魂喰らいの冠', kind: 'passive', rarity: 'epic', desc: '敵を倒したときの経験値が増える。', maxLevel: 5 },
    eclipse: { id: 'eclipse', name: '皆既の王冠', kind: 'weapon', rarity: 'mythic', desc: '月蝕・星・影を束ねる究極の魔具。', maxLevel: 1 },
    starfall: { id: 'starfall', name: '星界落とし', kind: 'weapon', rarity: 'mythic', desc: '広範囲へ星を降らせる。', maxLevel: 1 },
    umbralstorm: { id: 'umbralstorm', name: '常夜の嵐', kind: 'weapon', rarity: 'mythic', desc: '影の奔流が敵を呑み込む。', maxLevel: 1 },
    crimsonsun: { id: 'crimsonsun', name: '紅き太陽', kind: 'weapon', rarity: 'mythic', desc: '血月の輪が灼熱の太陽へ変わる。', maxLevel: 1 },
    frostlance: { id: 'frostlance', name: '霜牙の槍', kind: 'weapon', rarity: 'rare', desc: '狙った方向へ氷槍を一直線に放ち、最大5体を貫く。氷晶核と共鳴する。', maxLevel: 5, synergy: 'frostcore' },
    stormring: { id: 'stormring', name: '雷環', kind: 'weapon', rarity: 'rare', desc: '雷が近くの敵へ連鎖する。導電コイルと共鳴する。', maxLevel: 5, synergy: 'coppercoil' },
    embermine: { id: 'embermine', name: '火葬の種', kind: 'weapon', rarity: 'common', desc: '敵の足元で爆ぜ、周囲を巻き込む火種。焔の種火と共鳴する。', maxLevel: 5, synergy: 'pyreseed' },
    thornshot: { id: 'thornshot', name: '茨の連弩', kind: 'weapon', rarity: 'common', desc: '扇状に茨の矢を放ち、前方の敵をまとめて射抜く。狩人の印と共鳴する。', maxLevel: 5, synergy: 'huntsigil' },
    voidpulse: { id: 'voidpulse', name: '虚空の脈動', kind: 'weapon', rarity: 'epic', desc: '周囲へ虚空の衝撃波を放つ。月片の護符と共鳴する。', maxLevel: 5, synergy: 'moonshard' },
    frostcore: { id: 'frostcore', name: '氷晶核', kind: 'passive', rarity: 'rare', desc: '霜牙の槍の威力が上がる。', maxLevel: 5 },
    coppercoil: { id: 'coppercoil', name: '導電コイル', kind: 'passive', rarity: 'common', desc: '雷環の電撃がより遠くの敵まで連鎖する。', maxLevel: 5 },
    pyreseed: { id: 'pyreseed', name: '焔の種火', kind: 'passive', rarity: 'common', desc: '範囲攻撃の威力と範囲を強化する。', maxLevel: 5 },
    huntsigil: { id: 'huntsigil', name: '狩人の印', kind: 'passive', rarity: 'rare', desc: 'すべての武器の攻撃範囲を広げる。', maxLevel: 5 },
    moonshard: { id: 'moonshard', name: '月片の護符', kind: 'passive', rarity: 'epic', desc: 'ラン終了時にレベルから得るポイントが増える。', maxLevel: 5 },
    lunarconvergence: { id: 'lunarconvergence', name: '紅月の鉄輪', kind: 'weapon', rarity: 'mythic', desc: '月蝕の刃と鉄の心臓が共鳴。血色の刃輪が自分の周囲を守りながら敵を焼き払う。', maxLevel: 1, synergyGear: true, evolvedFrom: ['moonblade', 'ironheart'], evolutionLevels: [5, 1] },
    crimsonvoid: { id: 'crimsonvoid', name: '常夜の千影', kind: 'weapon', rarity: 'mythic', desc: '影縫いと夜渡りの外套が共鳴。幾重もの影刃が敵の群れをまとめて貫く。', maxLevel: 1, synergyGear: true, evolvedFrom: ['shade', 'nightcloak'], evolutionLevels: [5, 1] },
    stormfrost: { id: 'stormfrost', name: '絶零の穿槍', kind: 'weapon', rarity: 'mythic', desc: '霜牙の槍と氷晶核が共鳴。極大の氷槍が戦場を一直線に貫通する。', maxLevel: 1, synergyGear: true, evolvedFrom: ['frostlance', 'frostcore'], evolutionLevels: [5, 1] },
    astralbarrage: { id: 'astralbarrage', name: '星界連弩', kind: 'weapon', rarity: 'mythic', desc: '星屑の弾丸と星図の書が一体化。無数の星弾が次々と敵を追尾する。', maxLevel: 1, synergyGear: true, evolvedFrom: ['starbolt', 'astralbook'], evolutionLevels: [5, 1] },
    soulreaper: { id: 'soulreaper', name: '魂喰らいの紅月', kind: 'weapon', rarity: 'mythic', desc: '血月の輪と魂喰らいの冠が融合。魂を刈り取る巨大な血の爆発を起こす。', maxLevel: 1, synergyGear: true, evolvedFrom: ['bloodaura', 'soulcrown'], evolutionLevels: [5, 1] },
    thunderweb: { id: 'thunderweb', name: '天雷の網', kind: 'weapon', rarity: 'mythic', desc: '雷環と導電コイルが融合。雷撃が網のように連鎖し、遠方の敵まで焼き尽くす。', maxLevel: 1, synergyGear: true, evolvedFrom: ['stormring', 'coppercoil'], evolutionLevels: [5, 1] },
    infernomine: { id: 'infernomine', name: '紅蓮星の地雷', kind: 'weapon', rarity: 'mythic', desc: '火葬の種と焔の種火が融合。着弾点から巨大な紅蓮の爆炎が広がる。', maxLevel: 1, synergyGear: true, evolvedFrom: ['embermine', 'pyreseed'], evolutionLevels: [5, 1] },
    thornstorm: { id: 'thornstorm', name: '千棘の嵐', kind: 'weapon', rarity: 'mythic', desc: '茨の連弩と狩人の印が共鳴。無数の巨大な茨が広範囲を扇状に覆う。', maxLevel: 1, synergyGear: true, evolvedFrom: ['thornshot', 'huntsigil'], evolutionLevels: [5, 1] },
    lunarvoid: { id: 'lunarvoid', name: '月蝕虚空炉', kind: 'weapon', rarity: 'mythic', desc: '虚空の脈動と月片の護符が融合。月蝕の衝撃波が周囲の敵を虚空へ引きずり込む。', maxLevel: 1, synergyGear: true, evolvedFrom: ['voidpulse', 'moonshard'], evolutionLevels: [5, 1] },
};
/** A synergy evolution must use the exact weapon/passive pair advertised by the weapon. */
export function isSurvivorSynergyRecipe(gear) {
    const sources = gear.evolvedFrom;
    if (gear.synergyGear !== true || !sources || sources.length !== 2)
        return false;
    const weaponId = sources[0];
    const passiveId = sources[1];
    return SURVIVOR_GEAR[weaponId]?.kind === 'weapon'
        && SURVIVOR_GEAR[weaponId]?.synergy === passiveId
        && SURVIVOR_GEAR[passiveId]?.kind === 'passive';
}
export const SURVIVOR_RARITY_ORDER = ['common', 'rare', 'epic', 'mythic'];
export const SURVIVOR_META_UPGRADES = {
    might: { name: '夜狩りの鍛錬', desc: '攻撃力 +5%（最大 +25%）', cost: 10, max: 5 },
    rerolls: { name: '運命の引き直し', desc: '1ランにつき装備候補を1回引き直す（最大5回）', cost: 20, max: 5 },
    vitality: { name: '血の祝福', desc: '最大体力 +20（最大 +100）', cost: 10, max: 5 },
    regeneration: { name: '不死鳥の血', desc: '体力自然回復 +1/分（最大 +5/分）', cost: 20, max: 5 },
    choiceCount: { name: '運命の選択肢', desc: 'レベルアップ時の装備候補 +1（最大 +1）', cost: 100, max: 1 },
    synergySlots: { name: '共鳴の器', desc: 'シナジー装備枠 +1（初期1・最大5）', cost: 100, max: 4 },
    characters: { name: '異界の仲間', desc: '新しい初期キャラクターを1人解放（最大 +5）', cost: 50, max: 5 },
};
export const SURVIVOR_PROFILE_VERSION = 4;
export function survivorUpgradeCost(upgrade, level) {
    return SURVIVOR_META_UPGRADES[upgrade].cost * 2 ** Math.max(0, level);
}
export function survivorUpgradeRefund(upgrade, level, baseCost = SURVIVOR_META_UPGRADES[upgrade].cost) {
    let total = 0;
    for (let i = 0; i < Math.min(level, SURVIVOR_META_UPGRADES[upgrade].max); i++)
        total += baseCost * 2 ** i;
    return total;
}
export function survivorRunReward(level, moonshardLevel) {
    return Math.floor(level * (1 + moonshardLevel * 0.05));
}
export const SURVIVOR_ACHIEVEMENTS = {
    firstNight: { name: 'はじめての夜', desc: '初めてランを終える' },
    level10: { name: '夜明けの兆し', desc: '1回のランでレベル10に到達' },
    level25: { name: '宵闇の覇者', desc: '1回のランでレベル25に到達' },
    boss: { name: '夜を越えて', desc: '10分後の強敵を倒す' },
    mythic: { name: '神話の目撃者', desc: '神話級の装備を獲得' },
};
export const newSurvivorState = () => ({
    // players / stylePicks はユーザー ID がキー。prototype を持たせないことで __proto__ 等も通常のキーとして扱う
    run: 0, phase: 'lobby', startedAt: 0, endedAt: null, pausedAt: null, players: Object.create(null), enemies: [], projectiles: [], effects: [], stylePicks: Object.create(null),
    kills: 0, spawnIndex: 0, nextSpawnAt: 0, randomSeed: 1, bossDefeated: false, bossesSpawned: 0,
    spawnGrowthPausedAt: null, spawnGrowthPausedUntil: 0, spawnGrowthPausedMs: 0,
});
export const newSurvivorProfile = () => ({
    upgradeVersion: SURVIVOR_PROFILE_VERSION, points: 0,
    upgrades: { might: 0, rerolls: 0, vitality: 0, regeneration: 0, choiceCount: 0, synergySlots: 0, characters: 0 },
    upgradeSpent: { might: 0, rerolls: 0, vitality: 0, regeneration: 0, choiceCount: 0, synergySlots: 0, characters: 0 },
    runs: 0, bestLevel: 0, bestKills: 0,
    achievements: [], discovered: [],
});
export const survivorXpFor = (level) => level <= 4 ? 4 + level * 2 : 8 + level * 4;
export const survivorDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const SURVIVOR_EVOLUTIONS = {
    moonblade: 'eclipse', starbolt: 'starfall', shade: 'umbralstorm', bloodaura: 'crimsonsun',
};
