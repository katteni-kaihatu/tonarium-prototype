// layers.mjs のデータ配列を React 描画用に TypeScript 化したもの。
// レンダラ（HTML 文字列）は使わず、データだけをここに置く。

export type LayerStatus = 'playable' | 'partial' | 'mock';

export interface LayerDef {
  id: string;
  nameJa: string;
  nameEn: string;
  order: number;
  tagline: string;
  currencyName: string;
  status: LayerStatus;
}

export const LAYERS: LayerDef[] = [
  { id: 'dimensions', nameJa: '反物質次元', nameEn: 'Antimatter Dimensions', order: 0, tagline: '反物質を生み出す8つの次元。ゲームの土台となる層。', currencyName: '反物質 (Antimatter)', status: 'playable' },
  { id: 'infinity', nameJa: 'インフィニティ', nameEn: 'Infinity', order: 1, tagline: '1.79e308 の壁を砕く Big Crunch。IP で買う恒久アップグレードと Infinity 次元、チャレンジの層。', currencyName: 'Infinity Point (IP)', status: 'partial' },
  { id: 'eternity', nameJa: 'エタニティ', nameEn: 'Eternity', order: 2, tagline: 'Infinity を超えた先。Time 次元と Time Studies（スキルツリー）で時間を操る層。', currencyName: 'Eternity Point (EP)', status: 'mock' },
  { id: 'reality', nameJa: 'リアリティ', nameEn: 'Reality', order: 3, tagline: '世界の法則そのものを書き換える。Glyph を集め、Reality を再構築する層。', currencyName: 'Reality Machine (RM)', status: 'mock' },
  { id: 'celestials', nameJa: 'セレスティアルズ', nameEn: 'Celestials', order: 4, tagline: '世界の外側にいる存在たちとの対峙。最終盤のボス群にあたる層の概要モック。', currencyName: '—（各セレスティアル固有）', status: 'mock' },
];

export const LAYER_BADGE: Record<LayerStatus, string> = { playable: 'プレイ可能', partial: '一部実装', mock: 'モック' };

export interface LayerTab extends LayerDef {
  badge: string;
  unlocked: boolean;
}

export function getLayerTabs(infinities: number): LayerTab[] {
  return [...LAYERS]
    .sort((a, b) => a.order - b.order)
    .map((layer) => ({
      ...layer,
      badge: LAYER_BADGE[layer.status],
      unlocked: layer.id === 'dimensions' ? true : layer.id === 'infinity' ? infinities > 0 : false,
    }));
}

export const INFINITY_UPGRADES = [
  { id: 'iu-dim-mult-1', name: '次元ブースト強化 I', costIP: 1, description: 'Dimension Boost の効果が各次元で少し強くなる（モック効果: 全次元 ×1.5 相当）', effect: '全次元 ×1.5' },
  { id: 'iu-start-am', name: '豊かな始まり', costIP: 1, description: 'リセット後の開始反物質が 100 になる', effect: '開始 AM 10 → 100' },
  { id: 'iu-tick-1', name: '加速する時間 I', costIP: 2, description: 'Tickspeed の1購入あたりの効果が +0.02 上がる', effect: 'Tickspeed 効率 +0.02' },
  { id: 'iu-dim-mult-2', name: '次元ブースト強化 II', costIP: 2, description: '全次元の生産が上がる（モック効果: ×2）', effect: '全次元 ×2' },
  { id: 'iu-keep-boost', name: 'ブースト保持', costIP: 3, description: 'Galaxy 購入時に Dimension Boost を1回分保持する', effect: 'Galaxy 後も Boost +1' },
  { id: 'iu-galaxy-1', name: '銀河効率 I', costIP: 4, description: '銀河1個あたりの Tickspeed 効率ボーナスが増える', effect: '銀河効率 +0.01/個' },
  { id: 'iu-dim-mult-3', name: '反物質の奔流', costIP: 5, description: '第1次元の生産が総反物質に応じて伸びる（モック式）', effect: '第1次元 ×(総AM依存)' },
  { id: 'iu-offline', name: '放置の加護', costIP: 10, description: 'オフライン進行の効率が 50% → 75% 相当に上がる（モック）', effect: 'オフライン効率UP' },
  { id: 'iu-tick-2', name: '加速する時間 II', costIP: 20, description: 'Tickspeed の1購入あたりの効果がさらに +0.03 上がる', effect: 'Tickspeed 効率 +0.03' },
  { id: 'iu-ip-passive', name: '受動的 IP 生成', costIP: 40, description: '最速の Big Crunch 記録に応じて IP が自動で増える（モック）', effect: 'IP 自動生成' },
  { id: 'iu-dim-mult-4', name: '次元の調律', costIP: 60, description: '全次元の生産が大きく上がる（モック効果: ×10）', effect: '全次元 ×10' },
  { id: 'iu-galaxy-2', name: '銀河効率 II', costIP: 100, description: '銀河の必要数が少し緩和される（モック: 要件 -5）', effect: 'Galaxy 要件緩和' },
  { id: 'iu-break-prep', name: 'Break Infinity への布石', costIP: 200, description: 'Break Infinity 解放への前提アップグレード（モック。本体は未実装）', effect: '次フェーズ前提' },
  { id: 'iu-replicanti-seed', name: 'レプリカントの種', costIP: 300, description: 'Replicanti 解放への前提（モック。本体は未実装）', effect: '次フェーズ前提' },
  { id: 'iu-dim-mult-5', name: 'インフィニティの残響', costIP: 1000, description: 'Infinity 回数に応じて全次元が伸びる（モック式: ×(1+infinities)）', effect: '全次元 ×Infinity回数依存' },
  { id: 'iu-eternity-seed', name: '永遠への扉', costIP: 5000, description: 'Eternity 層への到達を助ける最終アップグレード（モック）', effect: '次層への布石' },
];

export const INFINITY_DIMENSIONS = [
  { tier: 1, name: '第1 Infinity 次元', baseCostIP: 10, costMultLog10: 3, produces: '第8反物質次元への倍率 / IP生成の土台（モック）' },
  { tier: 2, name: '第2 Infinity 次元', baseCostIP: 20, costMultLog10: 4, produces: '第1 Infinity 次元' },
  { tier: 3, name: '第3 Infinity 次元', baseCostIP: 30, costMultLog10: 5, produces: '第2 Infinity 次元' },
  { tier: 4, name: '第4 Infinity 次元', baseCostIP: 40, costMultLog10: 6, produces: '第3 Infinity 次元' },
  { tier: 5, name: '第5 Infinity 次元', baseCostIP: 50, costMultLog10: 8, produces: '第4 Infinity 次元' },
  { tier: 6, name: '第6 Infinity 次元', baseCostIP: 60, costMultLog10: 10, produces: '第5 Infinity 次元' },
  { tier: 7, name: '第7 Infinity 次元', baseCostIP: 80, costMultLog10: 12, produces: '第6 Infinity 次元' },
  { tier: 8, name: '第8 Infinity 次元', baseCostIP: 100, costMultLog10: 15, produces: '第7 Infinity 次元' },
];

export const CHALLENGES = [
  { id: 'c1', name: 'チャレンジ1: スタートライン', goal: '反物質 1e100 に到達', reward: '第1次元オートバイヤー（モック）', restriction: '制限なし（入門）' },
  { id: 'c2', name: 'チャレンジ2: 次元の試練', goal: '反物質 1e105 に到達', reward: '第2次元オートバイヤー（モック）', restriction: '購入間隔に制限（モック）' },
  { id: 'c3', name: 'チャレンジ3: 三次元の壁', goal: '反物質 1e110 に到達', reward: '第3次元オートバイヤー（モック）', restriction: '第1次元の生産方式が変化（モック）' },
  { id: 'c4', name: 'チャレンジ4: 減衰する世界', goal: '反物質 1e115 に到達', reward: '第4次元オートバイヤー（モック）', restriction: '生産が時間で減衰（モック）' },
  { id: 'c5', name: 'チャレンジ5: 高騰する市場', goal: '反物質 1e120 に到達', reward: '第5次元オートバイヤー（モック）', restriction: 'コスト上昇が激しい（モック）' },
  { id: 'c6', name: 'チャレンジ6: 犠牲なき世界', goal: '反物質 1e125 に到達', reward: '第6次元オートバイヤー（モック）', restriction: 'Sacrifice 使用不可（モック）' },
  { id: 'c7', name: 'チャレンジ7: 崩れる連鎖', goal: '反物質 1e130 に到達', reward: '第7次元オートバイヤー（モック）', restriction: '生産連鎖の向きが一部変化（モック）' },
  { id: 'c8', name: 'チャレンジ8: 第八の試練', goal: '反物質 1e135 に到達', reward: '第8次元オートバイヤー（モック）', restriction: 'Sacrifice の式が変化（モック）' },
  { id: 'c9', name: 'チャレンジ9: ティックの迷宮', goal: '反物質 1e140 に到達', reward: 'Tickspeed オートバイヤー（モック）', restriction: 'Tickspeed 購入に特殊条件（モック）' },
  { id: 'c10', name: 'チャレンジ10: 薄まる次元', goal: '反物質 1e145 に到達', reward: '次元関連の恒久強化（モック）', restriction: '次元倍率が薄まる（モック）' },
  { id: 'c11', name: 'チャレンジ11: 無の領域', goal: '反物質 1e150 に到達', reward: '恒久強化（モック）', restriction: '複合制限（モック）' },
  { id: 'c12', name: 'チャレンジ12: 時間の終わり', goal: '反物質 1e155 に到達', reward: '全チャレンジ制覇報酬への布石（モック）', restriction: '複合制限（モック）' },
];

export const TIME_DIMENSIONS = [
  { tier: 1, name: '第1 Time 次元', baseCostEP: 1, costMultLog10: 3, produces: 'Time Shard（モック）' },
  { tier: 2, name: '第2 Time 次元', baseCostEP: 5, costMultLog10: 4, produces: '第1 Time 次元' },
  { tier: 3, name: '第3 Time 次元', baseCostEP: 100, costMultLog10: 5, produces: '第2 Time 次元' },
  { tier: 4, name: '第4 Time 次元', baseCostEP: 1000, costMultLog10: 6, produces: '第3 Time 次元' },
  { tier: 5, name: '第5 Time 次元', baseCostEP: '1e5', costMultLog10: 8, produces: '第4 Time 次元' },
  { tier: 6, name: '第6 Time 次元', baseCostEP: '1e8', costMultLog10: 10, produces: '第5 Time 次元' },
  { tier: 7, name: '第7 Time 次元', baseCostEP: '1e10', costMultLog10: 12, produces: '第6 Time 次元' },
  { tier: 8, name: '第8 Time 次元', baseCostEP: '1e12', costMultLog10: 15, produces: '第7 Time 次元' },
];

export const TIME_STUDIES = [
  { id: 11, col: 4, row: 1, costTT: 1, requires: [] as number[], description: '通常次元の倍率が、今回の Eternity 時間に応じて伸びる（モック）' },
  { id: 21, col: 3, row: 2, costTT: 3, requires: [11], description: 'Replicanti の上限が上がる（モック）' },
  { id: 22, col: 5, row: 2, costTT: 3, requires: [11], description: 'EP 獲得量が増える分岐（モック）' },
  { id: 31, col: 4, row: 3, costTT: 2, requires: [21, 22], description: 'Infinity 次元の倍率UP（モック）' },
  { id: 32, col: 2, row: 3, costTT: 2, requires: [21], description: '通常次元の倍率UP・左分岐（モック）' },
  { id: 33, col: 6, row: 3, costTT: 2, requires: [22], description: '時間系の倍率UP・右分岐（モック）' },
  { id: 41, col: 4, row: 4, costTT: 4, requires: [31], description: '第8次元が第1次元量に応じて伸びる（モック）' },
  { id: 42, col: 2, row: 4, costTT: 6, requires: [32], description: '銀河を保持したまま Eternity できる分岐（モック）' },
  { id: 51, col: 6, row: 4, costTT: 3, requires: [33], description: 'Time Shard の変換効率UP（モック）' },
  { id: 61, col: 4, row: 5, costTT: 5, requires: [41], description: '全次元への大きな倍率（モック）' },
  { id: 62, col: 3, row: 5, costTT: 3, requires: [41], description: '受動的 IP 生成が強化される（モック）' },
  { id: 71, col: 2, row: 6, costTT: 4, requires: [42, 62], description: 'Sacrifice 倍率の効きが強くなる（モック）' },
  { id: 72, col: 4, row: 6, costTT: 4, requires: [61], description: 'Tickspeed 効果の底上げ（モック）' },
  { id: 73, col: 6, row: 6, costTT: 4, requires: [51, 62], description: 'オフライン進行の効率UP（モック）' },
  { id: 81, col: 3, row: 7, costTT: 6, requires: [71, 72], description: 'Infinity チャレンジへの挑戦権（モック）' },
  { id: 82, col: 5, row: 7, costTT: 6, requires: [72, 73], description: 'Eternity チャレンジへの挑戦権（モック）' },
  { id: 91, col: 4, row: 8, costTT: 8, requires: [81, 82], description: 'Time Dilation 解放への布石（モック）' },
  { id: 101, col: 3, row: 9, costTT: 10, requires: [91], description: 'Dilation 時の Tachyon 粒子獲得UP（モック）' },
  { id: 102, col: 5, row: 9, costTT: 10, requires: [91], description: 'Reality 層への接近（モック）' },
  { id: 111, col: 4, row: 10, costTT: 12, requires: [101, 102], description: 'ツリー最下層: 全生産への最終倍率（モック）' },
];

export const ETERNITY_UPGRADES = [
  { id: 'eu-1', name: '永遠の倍率 I', costEP: 5, description: 'Infinity 回数に応じて全次元が伸びる（モック: ×(infinities+1)）' },
  { id: 'eu-2', name: '永遠の倍率 II', costEP: 25, description: 'Eternity 回数に応じて全次元が伸びる（モック）' },
  { id: 'eu-3', name: '時間の結晶', costEP: 100, description: 'Time Shard の獲得が2倍になる（モック）' },
  { id: 'eu-4', name: '次元の残像', costEP: '1e4', description: 'Eternity 後も次元倍率の一部が残る（モック）' },
  { id: 'eu-5', name: '永遠の加速', costEP: '1e6', description: 'ゲーム速度そのものへの倍率（モック）' },
  { id: 'eu-6', name: 'Reality への鍵', costEP: '1e9', description: 'Reality 層の前提アップグレード（モック）' },
];

export const GLYPH_TYPES = [
  { id: 'power', nameJa: 'パワー', nameEn: 'Power', effectExample: '全反物質次元の倍率UP / 次元購入倍率UP（モック効果例）' },
  { id: 'infinity', nameJa: 'インフィニティ', nameEn: 'Infinity', effectExample: 'Infinity 次元の倍率UP / IP 獲得UP（モック効果例）' },
  { id: 'time', nameJa: 'タイム', nameEn: 'Time', effectExample: 'Time 次元の倍率UP / EP 獲得UP（モック効果例）' },
  { id: 'replication', nameJa: 'レプリケーション', nameEn: 'Replication', effectExample: 'Replicanti の速度・上限UP（モック効果例）' },
  { id: 'dilation', nameJa: 'ダイレーション', nameEn: 'Dilation', effectExample: 'Time Dilation 中の Tachyon 粒子・DT 獲得UP（モック効果例）' },
];

export const REALITY_UPGRADES = [
  { id: 'ru-1', name: '現実の倍率 I', costRM: 1, description: 'Glyph のレベル計算が有利になる（モック）' },
  { id: 'ru-2', name: '現実の倍率 II', costRM: 5, description: '全層の通貨獲得が少し増える（モック）' },
  { id: 'ru-3', name: 'ブラックホールの種', costRM: 15, description: 'Black Hole（時間加速装置）の解放前提（モック）' },
  { id: 'ru-4', name: 'パークツリーの拡張', costRM: 30, description: 'Perks の追加ノード解放前提（モック）' },
  { id: 'ru-5', name: 'セレスティアルへの道', costRM: 100, description: 'Celestials 層への接近（モック）' },
];

export const CELESTIALS_OVERVIEW = [
  { id: 'teresa', name: 'Teresa', role: '最初のセレスティアル。Reality の資源管理が試される（モック概要）' },
  { id: 'effarig', name: 'Effarig', role: 'Glyph の重みと難易度調整が鍵になる存在（モック概要）' },
  { id: 'nameless', name: 'The Nameless Ones', role: '時間と保存に関するギミックを持つ存在（モック概要）' },
  { id: 'v', name: 'V', role: '実績ベースの挑戦を課す存在（モック概要）' },
  { id: 'ra', name: 'Ra', role: '記憶と各層の回想で力を取り戻す存在（モック概要）' },
  { id: 'laitela', name: "Lai'tela", role: '最終盤。暗黒物質と特異点が絡む最難関（モック概要）' },
];
