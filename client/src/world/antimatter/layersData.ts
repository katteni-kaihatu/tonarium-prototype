import { t } from '../../i18n/core.ts';
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
  { id: 'dimensions', get nameJa() { return t('adLabText147'); }, nameEn: 'Antimatter Dimensions', order: 0, get tagline() { return t('adLabText148'); }, get currencyName() { return t('adLabText149'); }, status: 'playable' },
  { id: 'infinity', get nameJa() { return t('adLabText150'); }, nameEn: 'Infinity', order: 1, get tagline() { return t('adLabText151'); }, currencyName: 'Infinity Point (IP)', status: 'partial' },
  { id: 'eternity', get nameJa() { return t('adLabText152'); }, nameEn: 'Eternity', order: 2, get tagline() { return t('adLabText153'); }, currencyName: 'Eternity Point (EP)', status: 'mock' },
  { id: 'reality', get nameJa() { return t('adLabText154'); }, nameEn: 'Reality', order: 3, get tagline() { return t('adLabText155'); }, currencyName: 'Reality Machine (RM)', status: 'mock' },
  { id: 'celestials', get nameJa() { return t('adLabText156'); }, nameEn: 'Celestials', order: 4, get tagline() { return t('adLabText157'); }, get currencyName() { return t('adLabText158'); }, status: 'mock' },
];

export const LAYER_BADGE: Record<LayerStatus, string> = { get playable() { return t('adLabText328'); }, get partial() { return t('adLabText329'); }, get mock() { return t('ui1154'); } };

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
  { id: 'iu-dim-mult-1', get name() { return t('adLabText159'); }, costIP: 1, get description() { return t('adLabText160'); }, get effect() { return t('adLabText161'); } },
  { id: 'iu-start-am', get name() { return t('adLabText162'); }, costIP: 1, get description() { return t('adLabText163'); }, get effect() { return t('adLabText164'); } },
  { id: 'iu-tick-1', get name() { return t('adLabText165'); }, costIP: 2, get description() { return t('adLabText166'); }, get effect() { return t('adLabText167'); } },
  { id: 'iu-dim-mult-2', get name() { return t('adLabText168'); }, costIP: 2, get description() { return t('adLabText169'); }, get effect() { return t('adLabText170'); } },
  { id: 'iu-keep-boost', get name() { return t('adLabText171'); }, costIP: 3, get description() { return t('adLabText172'); }, get effect() { return t('adLabText173'); } },
  { id: 'iu-galaxy-1', get name() { return t('adLabText174'); }, costIP: 4, get description() { return t('adLabText175'); }, get effect() { return t('adLabText176'); } },
  { id: 'iu-dim-mult-3', get name() { return t('adLabText177'); }, costIP: 5, get description() { return t('adLabText178'); }, get effect() { return t('adLabText179'); } },
  { id: 'iu-offline', get name() { return t('adLabText180'); }, costIP: 10, get description() { return t('adLabText181'); }, get effect() { return t('adLabText182'); } },
  { id: 'iu-tick-2', get name() { return t('adLabText183'); }, costIP: 20, get description() { return t('adLabText184'); }, get effect() { return t('adLabText185'); } },
  { id: 'iu-ip-passive', get name() { return t('adLabText186'); }, costIP: 40, get description() { return t('adLabText187'); }, get effect() { return t('adLabText188'); } },
  { id: 'iu-dim-mult-4', get name() { return t('adLabText189'); }, costIP: 60, get description() { return t('adLabText190'); }, get effect() { return t('adLabText191'); } },
  { id: 'iu-galaxy-2', get name() { return t('adLabText192'); }, costIP: 100, get description() { return t('adLabText193'); }, get effect() { return t('adLabText194'); } },
  { id: 'iu-break-prep', get name() { return t('adLabText195'); }, costIP: 200, get description() { return t('adLabText196'); }, get effect() { return t('adLabText197'); } },
  { id: 'iu-replicanti-seed', get name() { return t('adLabText198'); }, costIP: 300, get description() { return t('adLabText199'); }, get effect() { return t('adLabText197'); } },
  { id: 'iu-dim-mult-5', get name() { return t('adLabText200'); }, costIP: 1000, get description() { return t('adLabText201'); }, get effect() { return t('adLabText202'); } },
  { id: 'iu-eternity-seed', get name() { return t('adLabText203'); }, costIP: 5000, get description() { return t('adLabText204'); }, get effect() { return t('adLabText205'); } },
];

export const INFINITY_DIMENSIONS = [
  { tier: 1, get name() { return t('adLabText206'); }, baseCostIP: 10, costMultLog10: 3, get produces() { return t('adLabText207'); } },
  { tier: 2, get name() { return t('adLabText208'); }, baseCostIP: 20, costMultLog10: 4, get produces() { return t('adLabText206'); } },
  { tier: 3, get name() { return t('adLabText209'); }, baseCostIP: 30, costMultLog10: 5, get produces() { return t('adLabText208'); } },
  { tier: 4, get name() { return t('adLabText210'); }, baseCostIP: 40, costMultLog10: 6, get produces() { return t('adLabText209'); } },
  { tier: 5, get name() { return t('adLabText211'); }, baseCostIP: 50, costMultLog10: 8, get produces() { return t('adLabText210'); } },
  { tier: 6, get name() { return t('adLabText212'); }, baseCostIP: 60, costMultLog10: 10, get produces() { return t('adLabText211'); } },
  { tier: 7, get name() { return t('adLabText213'); }, baseCostIP: 80, costMultLog10: 12, get produces() { return t('adLabText212'); } },
  { tier: 8, get name() { return t('adLabText214'); }, baseCostIP: 100, costMultLog10: 15, get produces() { return t('adLabText213'); } },
];

export const CHALLENGES = [
  { id: 'c1', get name() { return t('adLabText215'); }, get goal() { return t('adLabText216'); }, get reward() { return t('adLabText217'); }, get restriction() { return t('adLabText218'); } },
  { id: 'c2', get name() { return t('adLabText219'); }, get goal() { return t('adLabText220'); }, get reward() { return t('adLabText221'); }, get restriction() { return t('adLabText222'); } },
  { id: 'c3', get name() { return t('adLabText223'); }, get goal() { return t('adLabText224'); }, get reward() { return t('adLabText225'); }, get restriction() { return t('adLabText226'); } },
  { id: 'c4', get name() { return t('adLabText227'); }, get goal() { return t('adLabText228'); }, get reward() { return t('adLabText229'); }, get restriction() { return t('adLabText230'); } },
  { id: 'c5', get name() { return t('adLabText231'); }, get goal() { return t('adLabText232'); }, get reward() { return t('adLabText233'); }, get restriction() { return t('adLabText234'); } },
  { id: 'c6', get name() { return t('adLabText235'); }, get goal() { return t('adLabText236'); }, get reward() { return t('adLabText237'); }, get restriction() { return t('adLabText238'); } },
  { id: 'c7', get name() { return t('adLabText239'); }, get goal() { return t('adLabText240'); }, get reward() { return t('adLabText241'); }, get restriction() { return t('adLabText242'); } },
  { id: 'c8', get name() { return t('adLabText243'); }, get goal() { return t('adLabText244'); }, get reward() { return t('adLabText245'); }, get restriction() { return t('adLabText246'); } },
  { id: 'c9', get name() { return t('adLabText247'); }, get goal() { return t('adLabText248'); }, get reward() { return t('adLabText249'); }, get restriction() { return t('adLabText250'); } },
  { id: 'c10', get name() { return t('adLabText251'); }, get goal() { return t('adLabText252'); }, get reward() { return t('adLabText253'); }, get restriction() { return t('adLabText254'); } },
  { id: 'c11', get name() { return t('adLabText255'); }, get goal() { return t('adLabText256'); }, get reward() { return t('adLabText257'); }, get restriction() { return t('adLabText258'); } },
  { id: 'c12', get name() { return t('adLabText259'); }, get goal() { return t('adLabText260'); }, get reward() { return t('adLabText261'); }, get restriction() { return t('adLabText258'); } },
];

export const TIME_DIMENSIONS = [
  { tier: 1, get name() { return t('adLabText262'); }, baseCostEP: 1, costMultLog10: 3, get produces() { return t('adLabText263'); } },
  { tier: 2, get name() { return t('adLabText264'); }, baseCostEP: 5, costMultLog10: 4, get produces() { return t('adLabText262'); } },
  { tier: 3, get name() { return t('adLabText265'); }, baseCostEP: 100, costMultLog10: 5, get produces() { return t('adLabText264'); } },
  { tier: 4, get name() { return t('adLabText266'); }, baseCostEP: 1000, costMultLog10: 6, get produces() { return t('adLabText265'); } },
  { tier: 5, get name() { return t('adLabText267'); }, baseCostEP: '1e5', costMultLog10: 8, get produces() { return t('adLabText266'); } },
  { tier: 6, get name() { return t('adLabText268'); }, baseCostEP: '1e8', costMultLog10: 10, get produces() { return t('adLabText267'); } },
  { tier: 7, get name() { return t('adLabText269'); }, baseCostEP: '1e10', costMultLog10: 12, get produces() { return t('adLabText268'); } },
  { tier: 8, get name() { return t('adLabText270'); }, baseCostEP: '1e12', costMultLog10: 15, get produces() { return t('adLabText269'); } },
];

export const TIME_STUDIES = [
  { id: 11, col: 4, row: 1, costTT: 1, requires: [] as number[], get description() { return t('adLabText271'); } },
  { id: 21, col: 3, row: 2, costTT: 3, requires: [11], get description() { return t('adLabText272'); } },
  { id: 22, col: 5, row: 2, costTT: 3, requires: [11], get description() { return t('adLabText273'); } },
  { id: 31, col: 4, row: 3, costTT: 2, requires: [21, 22], get description() { return t('adLabText274'); } },
  { id: 32, col: 2, row: 3, costTT: 2, requires: [21], get description() { return t('adLabText275'); } },
  { id: 33, col: 6, row: 3, costTT: 2, requires: [22], get description() { return t('adLabText276'); } },
  { id: 41, col: 4, row: 4, costTT: 4, requires: [31], get description() { return t('adLabText277'); } },
  { id: 42, col: 2, row: 4, costTT: 6, requires: [32], get description() { return t('adLabText278'); } },
  { id: 51, col: 6, row: 4, costTT: 3, requires: [33], get description() { return t('adLabText279'); } },
  { id: 61, col: 4, row: 5, costTT: 5, requires: [41], get description() { return t('adLabText280'); } },
  { id: 62, col: 3, row: 5, costTT: 3, requires: [41], get description() { return t('adLabText281'); } },
  { id: 71, col: 2, row: 6, costTT: 4, requires: [42, 62], get description() { return t('adLabText282'); } },
  { id: 72, col: 4, row: 6, costTT: 4, requires: [61], get description() { return t('adLabText283'); } },
  { id: 73, col: 6, row: 6, costTT: 4, requires: [51, 62], get description() { return t('adLabText284'); } },
  { id: 81, col: 3, row: 7, costTT: 6, requires: [71, 72], get description() { return t('adLabText285'); } },
  { id: 82, col: 5, row: 7, costTT: 6, requires: [72, 73], get description() { return t('adLabText286'); } },
  { id: 91, col: 4, row: 8, costTT: 8, requires: [81, 82], get description() { return t('adLabText287'); } },
  { id: 101, col: 3, row: 9, costTT: 10, requires: [91], get description() { return t('adLabText288'); } },
  { id: 102, col: 5, row: 9, costTT: 10, requires: [91], get description() { return t('adLabText289'); } },
  { id: 111, col: 4, row: 10, costTT: 12, requires: [101, 102], get description() { return t('adLabText290'); } },
];

export const ETERNITY_UPGRADES = [
  { id: 'eu-1', get name() { return t('adLabText291'); }, costEP: 5, get description() { return t('adLabText292'); } },
  { id: 'eu-2', get name() { return t('adLabText293'); }, costEP: 25, get description() { return t('adLabText294'); } },
  { id: 'eu-3', get name() { return t('adLabText295'); }, costEP: 100, get description() { return t('adLabText296'); } },
  { id: 'eu-4', get name() { return t('adLabText297'); }, costEP: '1e4', get description() { return t('adLabText298'); } },
  { id: 'eu-5', get name() { return t('adLabText299'); }, costEP: '1e6', get description() { return t('adLabText300'); } },
  { id: 'eu-6', get name() { return t('adLabText301'); }, costEP: '1e9', get description() { return t('adLabText302'); } },
];

export const GLYPH_TYPES = [
  { id: 'power', get nameJa() { return t('adLabText303'); }, nameEn: 'Power', get effectExample() { return t('adLabText304'); } },
  { id: 'infinity', get nameJa() { return t('adLabText150'); }, nameEn: 'Infinity', get effectExample() { return t('adLabText305'); } },
  { id: 'time', get nameJa() { return t('adLabText306'); }, nameEn: 'Time', get effectExample() { return t('adLabText307'); } },
  { id: 'replication', get nameJa() { return t('adLabText308'); }, nameEn: 'Replication', get effectExample() { return t('adLabText309'); } },
  { id: 'dilation', get nameJa() { return t('adLabText310'); }, nameEn: 'Dilation', get effectExample() { return t('adLabText311'); } },
];

export const REALITY_UPGRADES = [
  { id: 'ru-1', get name() { return t('adLabText312'); }, costRM: 1, get description() { return t('adLabText313'); } },
  { id: 'ru-2', get name() { return t('adLabText314'); }, costRM: 5, get description() { return t('adLabText315'); } },
  { id: 'ru-3', get name() { return t('adLabText316'); }, costRM: 15, get description() { return t('adLabText317'); } },
  { id: 'ru-4', get name() { return t('adLabText318'); }, costRM: 30, get description() { return t('adLabText319'); } },
  { id: 'ru-5', get name() { return t('adLabText320'); }, costRM: 100, get description() { return t('adLabText321'); } },
];

export const CELESTIALS_OVERVIEW = [
  { id: 'teresa', name: 'Teresa', get role() { return t('adLabText322'); } },
  { id: 'effarig', name: 'Effarig', get role() { return t('adLabText323'); } },
  { id: 'nameless', name: 'The Nameless Ones', get role() { return t('adLabText324'); } },
  { id: 'v', name: 'V', get role() { return t('adLabText325'); } },
  { id: 'ra', name: 'Ra', get role() { return t('adLabText326'); } },
  { id: 'laitela', name: "Lai'tela", get role() { return t('adLabText327'); } },
];
