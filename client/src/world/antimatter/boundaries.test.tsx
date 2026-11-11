import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { Children, isValidElement, type ReactNode, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { bigFromLog10, bigFromNumber, bigMulNumber, bigLog10, bigSub, createAntimatterEta, createNewGame, getDimensionCostForBulk, getDimensionalBoostRequirement, getGalaxyRequirement, getSacrificeCandidate, type GameState } from '../../ad/engine.mjs';
import { createAdSlice, type AdSlice } from '../../ad/slice.ts';
import { buildAdActions, buildAdLabSnapshot } from '../../ad/labView.ts';
import { AntimatterSpacePanel } from '../../view3d/antimatterPanels.tsx';
import { adaptAdSlice } from './adapter.tsx';
import { ActionBar } from './ActionBar.tsx';
import type { AdPanelTarget } from '../../../../shared/antimatterLayout.ts';
import { ProfilePanel } from './ProfilePanel.tsx';
import { ProgressPicker } from './ProgressPicker.tsx';
import { AchievementsPanel } from './AchievementsPanel.tsx';
import { RankingPanel } from './RankingPanel.tsx';
import { ACHIEVEMENT_DEFS } from './styles.ts';
import { StatsPanel } from './StatsPanel.tsx';
import { getLanguage, setLanguage, systemText, t } from '../../i18n/core.ts';
import { DimensionList } from './DimensionList.tsx';
import { LayerTabs } from './LayerTabs.tsx';
import { serialize } from '../../ad/engine.mjs';
import { AntimatterPanel } from './AntimatterPanel.tsx';
import { AutomationPanel } from './AutomationPanel.tsx';
import { InfinityPanel } from './InfinityPanel.tsx';
import { InfinityUpgradesPanel } from './InfinityUpgradesPanel.tsx';
import { confirmAd } from './confirmAd.tsx';
import { shouldFillWindow, simpleWindowSize } from '../windowSize.ts';
import { AUTOBUYER_IDS, AUTOBUYER_MAX_LEVEL, AUTOBUYER_UNLOCK_COST, INFINITY_UPGRADES } from '../../ad/engine.mjs';
import { getLayerTabs } from './layersData.ts';
import { subscribeAdFeedback } from '../../ad/feedback.ts';

test('personal BGM toggle is accessible in 2D and every 3D target regardless of ownership', () => {
  const previous = getLanguage();
  const slice = harness(createNewGame());
  const before = serialize(slice.adGame!);
  try {
    for (const language of ['ja', 'en', 'ko'] as const) {
      setLanguage(language);
      const views = [renderToStaticMarkup(<AntimatterPanel ad={adaptAdSlice(slice)!} />)];
      for (const target of ['core', 'tickspeed', 'boost', 'galaxy', 'sacrifice', 'crunch', 'dimension-1', 'exhibit-infinity', 'exhibit-eternity', 'exhibit-reality', 'exhibit-celestials'] as const) {
        for (const own of [true, false]) views.push(panels(slice, target, own).space);
      }
      for (const html of views) {
        const button = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]).find(button => button.includes(`aria-label="${t('adBgmLabel')}"`));
        assert.ok(button);
        assert.match(button, /type="button"/);
        assert.match(button, /aria-pressed="true"/);
        assert.ok(button.includes(t('adBgmOn')));
        assert.doesNotMatch(button, /disabled/);
      }
    }
    assert.equal(serialize(slice.adGame!), before);
  } finally { setLanguage(previous); }
});

test('2D tabs and 3D exhibits render in three languages without changing saves or names', () => {
  const previous = getLanguage();
  const slice = harness(createNewGame(0));
  slice.adProfile = { id: 'same-profile', name: '名前 {0} 플레이어', createdAt: null };
  const before = serialize(slice.adGame!);
  try {
    for (const language of ['ja', 'en', 'ko', 'ja'] as const) {
      setLanguage(language);
      const ad = adaptAdSlice(slice)!;
      const dimensions = renderToStaticMarkup(<DimensionList ad={ad} />);
      assert.ok(dimensions.includes(t('adLabText23', 1)));
      assert.ok(dimensions.includes(t('adLabText14')));
      const layers = renderToStaticMarkup(<LayerTabs ad={ad} />);
      assert.ok(layers.includes(t('adLabText147')));
      assert.ok(layers.includes(t('adLocked')));
      for (const html of [dimensions, layers]) assert.doesNotMatch(html, /[🔥🏆🔒]/u);
      const stats = renderToStaticMarkup(<AchievementsPanel ad={ad} />);
      assert.ok(stats.includes(t('adLabText133')));
      assert.ok(stats.includes(t('adNotAchieved')));
      assert.doesNotMatch(stats, /[🔥🏆🔒]/u);
      assert.ok(renderToStaticMarkup(<RankingPanel ad={ad} notice={() => {}} />).includes('名前 {0} 플레이어'));
      for (const target of ['core', 'tickspeed', 'boost', 'galaxy', 'sacrifice', 'crunch', 'dimension-1', 'dimension-8', 'exhibit-infinity', 'exhibit-eternity', 'exhibit-reality', 'exhibit-celestials'] as const) {
        const space = panels(slice, target).space;
        if (language !== 'ja') assert.doesNotMatch(space, /[ぁ-んァ-ヶ一-龠]/);
      }
      assert.equal(serialize(slice.adGame!), before);
      assert.equal(slice.adProfile.name, '名前 {0} 플레이어');
    }
  } finally { setLanguage(previous); }
});
import { formatDuration, formatNumber } from './format.ts';

function harness(game: GameState) {
  let slice: AdSlice;
  slice = createAdSlice((partial) => { Object.assign(slice, partial); }, () => slice);
  slice.adGame = game;
  return slice;
}

// DOM のないテストでも実コンポーネントのクリック処理と次の描画をつなぐ。
function interactivePanel(slice: AdSlice) {
  const react = createRequire(import.meta.url)('react') as {
    __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: unknown };
  };
  const hooks = react.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const states: unknown[] = [];
  const render = () => {
    let index = 0;
    const previous = hooks.H;
    hooks.H = {
      useState(initial: unknown) {
        const slot = index++;
        if (!(slot in states)) states[slot] = initial;
        return [states[slot], (next: unknown) => { states[slot] = next; }];
      },
      useRef: (current: unknown) => ({ current }),
      useEffect: () => {},
      useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
    };
    try { return AntimatterPanel({ ad: adaptAdSlice(slice)! }); }
    finally { hooks.H = previous; }
  };
  let tree = render();
  const findTab = (node: ReactNode, label: string): ReactElement<{ children: ReactNode; onClick: () => void; disabled?: boolean; 'aria-pressed'?: boolean }> | undefined => {
    let found: ReturnType<typeof findTab>;
    Children.forEach(node, child => {
      if (found || !isValidElement<{ children: ReactNode; className?: string }>(child)) return;
      if (child.type === 'button' && child.props.className?.split(' ').includes('adlab-tab') && Children.toArray(child.props.children).includes(label)) {
        found = child as NonNullable<ReturnType<typeof findTab>>;
      } else found = findTab(child.props.children, label);
    });
    return found;
  };
  return {
    html: () => renderToStaticMarkup(tree),
    clickTab(key: string) {
      const button = findTab(tree, t(key));
      assert.ok(button);
      assert.ok(!button.props.disabled);
      button.props.onClick();
      tree = render();
      assert.equal(findTab(tree, t(key))?.props['aria-pressed'], true);
    },
  };
}

test('clicking Infinity before reaching it shows every upgrade and autobuyer with disabled actions', context => {
  const previous = getLanguage();
  context.after(() => setLanguage(previous));
  for (const language of ['ja', 'en', 'ko'] as const) {
    setLanguage(language);
    for (const mode of ['initial', 'rich-locked', 'rich-off', 'rich-on'] as const) {
      const game = createNewGame(0);
      game.infinities = 0;
      if (mode !== 'initial') game.infinityPoints = bigFromNumber(10000);
      for (const id of AUTOBUYER_IDS) {
        game.autobuyers[id].unlocked = mode === 'rich-off' || mode === 'rich-on';
        game.autobuyers[id].enabled = mode === 'rich-on';
      }
      const slice = harness(game);
      const before = serialize(game);
      const panel = interactivePanel(slice);
      assert.ok(!panel.html().includes('adlab-infinity-columns'));
      panel.clickTab('adInfinityTab');
      const html = panel.html().split('class="adlab-infinity"')[1];
      assert.ok(html.includes(t('adInfinityPreview')));
      for (const { id } of INFINITY_UPGRADES) assert.ok(html.includes(`data-iu="${id}"`));
      assert.equal([...html.matchAll(/class="adlab-iu-desc"/g)].length, INFINITY_UPGRADES.length);
      assert.equal([...html.matchAll(/class="adlab-auto-row/g)].length, AUTOBUYER_IDS.length);
      const buttons = [...html.matchAll(/<button\b([^>]*)>/g)];
      assert.ok(buttons.length >= AUTOBUYER_IDS.length);
      for (const button of buttons) assert.match(button[1], /\bdisabled=""/);
      const ad = adaptAdSlice(slice)!;
      assert.ok(ad.derived.infinityUpgrades.every(item => !item.canBuy));
      assert.ok(ad.derived.autobuyers.every(item => !item.canUnlock && !item.canUpgrade));
      assert.equal(serialize(game), before);
      panel.clickTab('adLabText4');
      assert.ok(!panel.html().includes('adlab-infinity-columns'));
    }
    const game = createNewGame(0);
    game.infinities = 1;
    game.infinityPoints = bigFromNumber(0);
    for (const id of AUTOBUYER_IDS) game.autobuyers[id].unlocked = true;
    const panel = interactivePanel(harness(game));
    panel.clickTab('adInfinityTab');
    assert.ok(!panel.html().includes(t('adInfinityPreview')));
    for (const button of panel.html().matchAll(/<button\b([^>]*role="switch"[^>]*)>/g)) assert.doesNotMatch(button[1], /disabled/);
  }
});

test('Infinity history is independent from layer unlocks', () => {
  for (const count of [0, 1, 0]) {
    assert.deepEqual(getLayerTabs(count).map(layer => [layer.id, layer.unlocked]), [
      ['dimensions', true], ['infinity', count > 0], ['eternity', false], ['reality', false], ['celestials', false],
    ]);
  }
});

test('slice rejects every Infinity operation before reaching it without changing progress, version or feedback', async context => {
  const events: unknown[] = [];
  context.after(subscribeAdFeedback(event => events.push(event)));
  const unchanged = (slice: AdSlice, action: () => boolean) => {
    const before = structuredClone(slice.adGame);
    const version = slice.adVersion;
    assert.equal(action(), false);
    assert.deepEqual(slice.adGame, before);
    assert.equal(slice.adVersion, version);
  };
  for (const ip of [0, 10000]) {
    const game = createNewGame(0);
    game.infinities = 0;
    game.infinityPoints = bigFromNumber(ip);
    game.antimatter = bigFromLog10(400);
    const slice = harness(game);
    for (const def of INFINITY_UPGRADES) {
      game.infinityUpgrades = INFINITY_UPGRADES.filter(u => u.id !== def.id).map(u => u.id);
      unchanged(slice, () => slice.adBuyInfinityUpgrade(def.id));
    }
    for (const id of AUTOBUYER_IDS) {
      game.autobuyers[id] = { unlocked: false, enabled: false, level: 0, elapsedMs: 123 };
      unchanged(slice, () => slice.adUnlockAutobuyer(id));
      unchanged(slice, () => slice.adUpgradeAutobuyer(id));
      unchanged(slice, () => slice.adSetAutobuyer(id, true));
      for (const enabled of [false, true]) {
        game.autobuyers[id] = { unlocked: true, enabled, level: 1, elapsedMs: 123 };
        unchanged(slice, () => slice.adSetAutobuyer(id, !enabled));
        unchanged(slice, () => slice.adUpgradeAutobuyer(id));
        unchanged(slice, () => slice.adUnlockAutobuyer(id));
      }
    }
  }
  await Promise.resolve();
  assert.deepEqual(events, []);
});

test('slice and adapter preserve every post-Infinity purchase condition and frozen-state guard', async context => {
  const events: unknown[] = [];
  context.after(subscribeAdFeedback(event => events.push(event)));
  const game = createNewGame(0);
  game.infinities = 1;
  const slice = harness(game);
  const check = (action: () => boolean, expected: boolean) => {
    const before = structuredClone(game);
    const version = slice.adVersion;
    assert.equal(action(), expected);
    assert.equal(slice.adVersion, version + Number(expected));
    if (!expected) assert.deepEqual(game, before);
  };
  for (const def of INFINITY_UPGRADES) {
    game.infinityUpgrades = [];
    game.infinityPoints = bigFromNumber(10000);
    if (def.row > 1) {
      assert.equal(adaptAdSlice(slice)!.derived.infinityUpgrades.find(u => u.id === def.id)!.canBuy, false);
      check(() => slice.adBuyInfinityUpgrade(def.id), false);
    }
    game.infinityUpgrades = INFINITY_UPGRADES.filter(u => u.column === def.column && u.row < def.row).map(u => u.id);
    game.infinityPoints = bigFromNumber(def.cost - 1);
    assert.equal(adaptAdSlice(slice)!.derived.infinityUpgrades.find(u => u.id === def.id)!.canBuy, false);
    check(() => slice.adBuyInfinityUpgrade(def.id), false);
    game.infinityPoints = bigFromNumber(def.cost);
    assert.equal(adaptAdSlice(slice)!.derived.infinityUpgrades.find(u => u.id === def.id)!.canBuy, true);
    check(() => slice.adBuyInfinityUpgrade(def.id), true);
    await Promise.resolve();
    assert.deepEqual(game.infinityPoints, bigFromNumber(0));
    assert.ok(game.infinityUpgrades.includes(def.id));
    game.infinityPoints = bigFromNumber(10000);
    assert.equal(adaptAdSlice(slice)!.derived.infinityUpgrades.find(u => u.id === def.id)!.canBuy, false);
    check(() => slice.adBuyInfinityUpgrade(def.id), false);
  }
  await Promise.resolve();
  assert.equal(events.length, INFINITY_UPGRADES.length);
  for (const id of AUTOBUYER_IDS) {
    const item = () => adaptAdSlice(slice)!.derived.autobuyers.find(ab => ab.id === id)!;
    game.infinityPoints = bigFromNumber(10000);
    assert.equal(item().canUpgrade, false);
    check(() => slice.adUpgradeAutobuyer(id), false);
    check(() => slice.adSetAutobuyer(id, true), false);
    game.infinityPoints = bigFromNumber(AUTOBUYER_UNLOCK_COST[id] - 1);
    assert.equal(item().canUnlock, false);
    check(() => slice.adUnlockAutobuyer(id), false);
    game.infinityPoints = bigFromNumber(AUTOBUYER_UNLOCK_COST[id]);
    assert.equal(item().canUnlock, true);
    check(() => slice.adUnlockAutobuyer(id), true);
    assert.deepEqual(game.infinityPoints, bigFromNumber(0));
    assert.equal(item().canUnlock, false);
    for (const enabled of [false, true]) {
      check(() => slice.adSetAutobuyer(id, enabled), true);
      assert.equal(game.autobuyers[id].enabled, enabled);
      assert.deepEqual(game.infinityPoints, bigFromNumber(0));
    }
    game.infinityPoints = bigFromNumber(10000);
    check(() => slice.adUnlockAutobuyer(id), false);
    for (let level = 0; level < AUTOBUYER_MAX_LEVEL; level++) {
      game.infinityPoints = bigFromNumber(level);
      assert.equal(item().canUpgrade, false);
      check(() => slice.adUpgradeAutobuyer(id), false);
      game.infinityPoints = bigFromNumber(level + 1);
      assert.equal(item().canUpgrade, true);
      check(() => slice.adUpgradeAutobuyer(id), true);
      assert.equal(game.autobuyers[id].level, level + 1);
      assert.deepEqual(game.infinityPoints, bigFromNumber(0));
    }
    game.infinityPoints = bigFromNumber(10000);
    assert.equal(item().canUpgrade, false);
    check(() => slice.adUpgradeAutobuyer(id), false);
  }
  for (const frozen of ['loading', 'choice', 'migration'] as const) {
    slice.adSync = frozen === 'migration' ? 'ready' : frozen;
    slice.adMigration = frozen === 'migration';
    game.infinityPoints = bigFromNumber(10000);
    game.infinityUpgrades = [];
    for (const def of INFINITY_UPGRADES) {
      game.infinityUpgrades = INFINITY_UPGRADES.filter(u => u.column === def.column && u.row < def.row).map(u => u.id);
      check(() => slice.adBuyInfinityUpgrade(def.id), false);
    }
    for (const id of AUTOBUYER_IDS) {
      game.autobuyers[id] = { unlocked: false, enabled: false, level: 0, elapsedMs: 0 };
      check(() => slice.adUnlockAutobuyer(id), false);
      game.autobuyers[id].unlocked = true;
      check(() => slice.adSetAutobuyer(id, true), false);
      check(() => slice.adUpgradeAutobuyer(id), false);
    }
  }
  await Promise.resolve();
  assert.equal(events.length, INFINITY_UPGRADES.length);
});

test('separated statistics and achievements preserve every value and save in three languages', (context) => {
  const previous = getLanguage();
  context.after(() => setLanguage(previous));
  const now = 1_800_000_000_000;
  context.mock.method(Date, 'now', () => now);
  const game = createNewGame(now - 90061_000);
  Object.assign(game, {
    totalAntimatter: bigFromLog10(105), dimensionalBoosts: 17, galaxies: 3,
    infinities: 2, infinityPoints: bigFromNumber(1234), tickspeedBought: 23,
    sacrificeBoost: bigFromNumber(8), achievements: ['first-dimension', 'unknown-{0}-실적'],
  });
  const slice = harness(game);
  const before = serialize(game);
  for (const language of ['ja', 'en', 'ko'] as const) {
    setLanguage(language);
    const ad = adaptAdSlice(slice)!;
    const stats = renderToStaticMarkup(<StatsPanel ad={ad} />);
    const tiles: [string, string][] = [
      [t('adUiStatTotal'), formatNumber(game.totalAntimatter)], [t('adUiStatPlay'), formatDuration(90061)],
      ['Dimension Boost', t('adUiTimes', 17)], [t('adUiStatGalaxy'), t('adUiGalaxyCount', 3)], ['Infinity', t('adUiTimes', 2)],
      ['Infinity Point', formatNumber(game.infinityPoints)], [t('adUiStatTick'), t('adUiTimes', 23)], [t('adUiStatSacrifice'), `×${formatNumber(game.sacrificeBoost)}`],
    ];
    for (const [label, value] of tiles) {
      const tile = `<span class="adlab-stat-label">${label}</span><b class="adlab-number">${value}</b>`;
      assert.ok(stats.includes(tile), `${language}: ${label} ${value}`);
    }
    assert.equal([...stats.matchAll(/class="adlab-stat"/g)].length, 8);
    assert.ok(!stats.includes('adlab-ranking'));
    assert.ok(!stats.includes(t('adLabText133')));
    const achievements = renderToStaticMarkup(<AchievementsPanel ad={ad} />);
    assert.ok(achievements.includes(t('adLabText51', 2, ACHIEVEMENT_DEFS.length + 1)));
    assert.ok(achievements.includes(t('adLabText59', 2)));
    for (const def of ACHIEVEMENT_DEFS) {
      assert.ok(achievements.includes(def.name));
      assert.ok(achievements.includes(def.desc));
    }
    assert.ok(achievements.includes('<b>unknown-{0}-실적</b>'));
    assert.ok(achievements.includes(t('adLabText57')));
    assert.equal(achievements.split('>' + t('adAchieved') + '</span>').length - 1, 2);
    assert.equal(achievements.split('>' + t('adNotAchieved') + '</span>').length - 1, ACHIEVEMENT_DEFS.length - 1);
    assert.equal(serialize(game), before);
  }
});

test('ranking labels and collapsed self inclusion are shown in all three languages', () => {
  const previous = getLanguage();
  const slice = harness(createNewGame());
  slice.adProfile = { id: 'profile', name: 'Other', createdAt: null };
  slice.adLeaderboard = [
    { name: 'Shared', antimatterLog10: 100, infinities: 3, playTimeSec: 90061, dimensionalBoosts: 17, galaxies: 12 },
    { name: 'Other', antimatterLog10: 90, infinities: 2, playTimeSec: 60 },
    { name: 'Shared', antimatterLog10: 80, infinities: 1, playTimeSec: 10, self: true, dimensionalBoosts: 0, galaxies: 0 },
    { name: 'Shared', antimatterLog10: 70, infinities: 0, playTimeSec: 5, dimensionalBoosts: 8, galaxies: 7 },
    { name: 'Shared', antimatterLog10: 60, infinities: 0, playTimeSec: 1 },
  ];
  try {
    for (const language of ['ja', 'en', 'ko'] as const) {
      setLanguage(language);
      const html = renderToStaticMarkup(<RankingPanel ad={adaptAdSlice(slice)!} notice={() => {}} />);
      const [representatives, children] = html.split('<tbody id=');
      for (const key of ['adLabText52', 'adRankingRank', 'adLabText54', 'adLabText55', 'adRankingInfinity', 'adLabText56', 'adRankingContainsSelf', 'adRankingExpand']) assert.ok(representatives.includes(t(key)));
      assert.ok(representatives.includes(t('adRankingRecordCount', 4)));
      assert.ok(representatives.includes(t('adRankingBoost')));
      assert.ok(representatives.includes(t('adRankingGalaxy')));
      assert.ok(html.includes(t('adRankingGuide')));
      assert.match(representatives, /<td[^>]*>12<\/td>/);
      assert.ok(html.includes(t('adRankingUnavailable')));
      assert.match(representatives, /<td[^>]*>17<\/td>/);
      const childRows = [...children.split('</tbody>')[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)];
      assert.deepEqual(childRows.map(row => [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)][2][1]), ['0', '8', t('adRankingUnavailable')]);
      assert.deepEqual(childRows.map(row => [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)][3][1]), ['0', '7', t('adRankingUnavailable')]);
      assert.equal([...html.matchAll(/scope="col"/g)].length, 7);
      assert.match(html, /class="adlab-ranking-scroll"[^>]*tabindex="0"/);
      assert.ok(!representatives.includes(t('adRankingSelf') + '</span>'));
      assert.ok(children.includes(t('adRankingSelf')));
      assert.match(html, /aria-expanded="false"/);
      assert.match(children, /hidden=""/);
      assert.equal([...html.matchAll(/adlab-ranking-rank/g)].length, 2);
      assert.ok(html.includes(formatDuration(90061)));
      assert.equal(formatDuration(90061), language === 'ja' ? '1日 1時間 1分 1秒' : language === 'en' ? '1d 1h 1m 1s' : '1일 1시간 1분 1초');
      assert.equal(formatDuration(-10), language === 'ja' ? '0秒' : language === 'en' ? '0s' : '0초');
      const buttons = [...html.matchAll(/id="([^"]+)"[^>]*aria-expanded="false" aria-controls="([^"]+)"/g)];
      assert.equal(buttons.length, 1);
      assert.ok(html.includes(`id="${buttons[0][2]}" hidden="" aria-labelledby="${buttons[0][1]}"`));
      const ad = adaptAdSlice(slice)!;
      const own = renderToStaticMarkup(<RankingPanel ad={{ ...ad, leaderboard: [{ ...ad.leaderboard[0], self: true }] }} notice={() => {}} />);
      assert.ok(own.includes(t('adRankingSelf') + '</span>'));
      assert.ok(!own.includes(t('adRankingContainsSelf')));
      const unrelated = renderToStaticMarkup(<RankingPanel ad={{ ...ad, leaderboard: [ad.leaderboard[1]] }} notice={() => {}} />);
      assert.ok(!unrelated.includes('adlab-ranking-badge'));
      const empty = renderToStaticMarkup(<RankingPanel ad={{ ...ad, leaderboard: [] }} notice={() => {}} />);
      assert.ok(empty.includes(t('adLabText53')));
      assert.ok(empty.includes(t('adRankingAuto', slice.adProfile.name)));
      assert.ok(empty.includes(t('adRankingRefresh')));
      assert.ok(!empty.includes('<table'));
      const pair = renderToStaticMarkup(<><RankingPanel ad={ad} notice={() => {}} /><RankingPanel ad={ad} notice={() => {}} /></>);
      const ids = [...pair.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
      assert.equal(new Set(ids).size, ids.length);
    }
  } finally { setLanguage(previous); }
});

test('共通プロフィール・ランキングの同期案内とv3形式は三言語で表示される', () => {
  const previous = getLanguage();
  const slice = harness(createNewGame());
  slice.adProfile = { id: 'local-profile', name: 'Player', createdAt: null };
  slice.adListRecovery = () => [{ key: 'old-record', createdAt: null }, { key: 'recent-record', createdAt: '2026-10-28T00:00:00.000Z' }];
  slice.adProgressSources = () => slice.adListRecovery().map(record => ({ ...record, profileId: 'local-profile', name: 'Player', source: 'local', save: JSON.parse(JSON.stringify(slice.adGame)) }));
  try {
    for (const language of ['ja', 'en', 'ko'] as const) {
      setLanguage(language);
      for (const status of ['loading', 'choice', 'error', 'ready'] as const) {
        slice.adSync = status;
        const ad = adaptAdSlice(slice)!;
        const profile = renderToStaticMarkup(<ProfilePanel ad={ad} notice={() => {}} />);
        const stats = renderToStaticMarkup(<RankingPanel ad={ad} notice={() => {}} />);
        assert.ok(profile.includes(t('adIssueCode')));
        assert.ok(profile.includes(t('adPreviousProgress')));
        assert.ok(profile.includes(t('adTransfer')));
        assert.ok(!profile.includes('adChecksumHelp'));
        assert.ok(!profile.includes('チェックサムは破損'));
        assert.ok(!profile.includes('newName'));
        assert.ok(!profile.includes('プロフィール・セーブ'));
        assert.ok(!profile.includes('adDeleteProfile'));
        assert.ok(!profile.includes('adNewProfile'));
        assert.equal([...profile.matchAll(/<input\b/g)].length, 1);
        assert.ok(!profile.includes('checksums detect'));
        assert.ok(!profile.includes('체크섬은 손상'));
        assert.ok(profile.includes(t('adRecoveryHistory')));
        assert.ok(profile.includes('value="old-record"'));
        assert.ok(profile.includes('value="recent-record"'));
        assert.ok(stats.includes(t('adRankingRefresh')));
        assert.ok(!profile.includes('Tonarium サーバーに保存しています'));
        assert.equal(ad.serverStatus && systemText(ad.serverStatus), status === 'ready' ? null : t(status === 'loading' ? 'adSyncLoading' : status === 'choice' ? 'adSyncChoice' : 'adSyncError'));
      }
    }
  } finally { setLanguage(previous); }
});

test('migration previews the active progress by default and offers only selection in all three languages', () => {
  const previous = getLanguage();
  const slice = harness(createNewGame());
  slice.adProfile = { id: 'current', name: 'Current', createdAt: null };
  slice.adMigration = true;
  slice.adProgressSources = () => ['previous', 'current'].map((id, index) => ({ key: 'profile:' + id, profileId: id, name: id, save: { ...JSON.parse(JSON.stringify(slice.adGame)), infinities: index + 1 } }));
  try {
    for (const language of ['ja', 'en', 'ko'] as const) {
      setLanguage(language);
      const ad = adaptAdSlice(slice)!;
      const html = renderToStaticMarkup(<ProgressPicker ad={ad} migration notice={() => {}} />);
      const selectedOption = html.match(/<option\b[^>]*value="profile:current"[^>]*>/)?.[0];
      assert.ok(selectedOption?.includes('selected=""'));
      assert.ok(html.includes('Infinity: 2'));
      assert.ok(html.includes(t('adTotalAntimatter')));
      assert.ok(html.includes(t('adUseProgress')));
      assert.ok(!html.includes(t('adRestoreProgress')));
      assert.ok(!html.includes(t('adExport')));
    }
  } finally { setLanguage(previous); }
});

function disabled(html: string, label: string) {
  const button = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find((match) => match[2] === label);
  assert.ok(button, `ボタン ${label} がある`);
  return /\bdisabled=/.test(button[1]);
}

function panels(slice: AdSlice, target: AdPanelTarget, isOwn = true) {
  const ad = adaptAdSlice(slice)!;
  return {
    ad,
    flat: renderToStaticMarkup(<ActionBar ad={ad} notice={() => {}} />),
    space: renderToStaticMarkup(<AntimatterSpacePanel target={target} snapshot={buildAdLabSnapshot(slice.adGame!)} actions={buildAdActions(slice)} isOwn={isOwn} />),
  };
}

for (const language of ['ja', 'en', 'ko'] as const) {
  for (const [target, boosts] of [['boost', 0], ['boost', 6], ['boost', 7], ['galaxy', 4]] as const) {
    for (const mode of ['single', 'ten', 'max'] as const) {
      test(`${language}: ${target} Boost=${boosts}: ${mode} 購入で2D・3Dの表示とボタンが一致`, (context) => {
        const previous = getLanguage();
        setLanguage(language);
        context.after(() => setLanguage(previous));
        const game = createNewGame(0);
        game.dimensionalBoosts = boosts;
        const slice = harness(game);
        for (let reset = 0; reset < 2; reset++) {
          if (target === 'galaxy') game.dimensionalBoosts = 4;
          const req = target === 'boost' ? getDimensionalBoostRequirement(game) : getGalaxyRequirement(game);
          const buy = (count: number) => {
            const requested = count;
            const before = game.dimensions[req.tier - 1].bought;
            game.antimatter = bigFromLog10(1000);
            if (mode === 'ten') {
              while (count > 0) {
                const batch = Math.min(count, 10 - game.dimensions[req.tier - 1].bought % 10);
                game.antimatter = bigMulNumber(getDimensionCostForBulk(game, req.tier, batch), 1.001);
                adaptAdSlice(slice)!.buyUntilNextTen(req.tier);
                count -= batch;
              }
            } else if (mode === 'max') {
              game.antimatter = bigMulNumber(getDimensionCostForBulk(game, req.tier, count), 1.001);
              buildAdActions(slice).buyDimensionMax(req.tier);
            } else {
              for (let i = 0; i < count; i++) slice.adBuyDimension(req.tier);
            }
            assert.equal(game.dimensions[req.tier - 1].bought - before, requested);
          };
          buy(req.amount - 1);
          for (const offset of [-1, 0, 1]) {
            if (offset !== -1) buy(1);
            const { flat, space, ad } = panels(slice, target);
            const expected = offset < 0;
            assert.equal(disabled(flat, target === 'boost' ? t('adLabText26') : t('adLabText28')), expected);
            assert.equal(disabled(space, target === 'boost' ? t('adLabText115') : t('adLabText119')), expected);
            assert.equal(target === 'boost' ? ad.derived.boost.can : ad.derived.galaxy.can, !expected);
            assert.ok(flat.includes(t('adLabText13', req.tier)));
            assert.ok(flat.includes(`${req.amount + offset} / ${req.amount}`));
            const header = renderToStaticMarkup(<AntimatterPanel ad={ad} />);
            assert.ok(header.includes(target === 'boost' ? t('adChipBoost', game.dimensionalBoosts) : t('adChipGalaxy', game.galaxies)));
            assert.ok(space.includes(t('adRequirementCurrentAmount', String(req.amount + offset))));
            assert.equal(disabled(panels(slice, target, false).space, target === 'boost' ? t('adLabText115') : t('adLabText119')), true);
          }
          if (target === 'boost') assert.equal(slice.adBoost(), true); else assert.equal(slice.adGalaxy(), true);
          const after = panels(slice, target);
          assert.equal(disabled(after.space, target === 'boost' ? t('adLabText115') : t('adLabText119')), true);
        }
      });
    }
  }

  test(`${language}: Sacrifice・Crunch は共通条件と所有者条件を両パネルで守る`, (context) => {
    const previous = getLanguage();
    setLanguage(language);
    context.after(() => setLanguage(previous));
    for (const boosts of [4, 5]) {
      for (const improved of [false, true]) {
        const game = createNewGame(0);
        game.dimensionalBoosts = boosts;
        game.dimensions[0].amount = bigFromLog10(100);
        game.dimensions[7].amount = bigFromNumber(1);
        if (!improved) game.sacrificeBoost = getSacrificeCandidate(game);
        const slice = harness(game);
        const { flat, space } = panels(slice, 'sacrifice');
        assert.equal(disabled(flat, t('adLabText30')), boosts < 5 || !improved);
        assert.equal(disabled(space, t('adLabText118')), boosts < 5 || !improved);
        assert.equal(disabled(panels(slice, 'sacrifice', false).space, t('adLabText118')), true);
      }
    }
    for (const amount of [1.78e308, 1.79e308, 1.795e308]) {
      const game = createNewGame(0);
      game.antimatter = bigFromNumber(amount);
      game.infinities = 1;
      const slice = harness(game);
      const { flat, space } = panels(slice, 'crunch');
      assert.equal(disabled(flat, t('adLabText31')), amount < 1.79e308);
      assert.equal(disabled(space, t('adLabText122')), amount < 1.79e308);
      assert.equal(disabled(panels(slice, 'crunch', false).space, t('adLabText122')), true);
    }
  });

}

test('Infinity is always browsable, Layers unlocks after Infinity, and Crunch requires reaching the threshold, in all languages', () => {
  const previous = getLanguage();
  try {
    for (const language of ['ja', 'en', 'ko'] as const) {
      setLanguage(language);
      const game = createNewGame(0);
      const slice = harness(game);
      const tabButton = (html: string, key: string) => html.includes('>' + t(key).replace(/&/g, '&amp;') + '</button>');
      const before = renderToStaticMarkup(<AntimatterPanel ad={adaptAdSlice(slice)!} />);
      for (const key of ['adLabText4', 'adLabText6', 'ui819', 'adLabText52', 'adSaveTab']) assert.ok(tabButton(before, key));
      assert.ok(!tabButton(before, 'adLabText7'));
      assert.ok(tabButton(before, 'adInfinityTab'));
      assert.doesNotMatch(before, /adlab-tab is-locked/);
      assert.equal(disabled(before, t('adLabText31')), true);
      assert.ok(before.includes(t('adLabText26')) && before.includes(t('adLabText28')) && before.includes(t('adLabText30')));
      game.antimatter = bigFromNumber(1.79e308);
      const reachable = renderToStaticMarkup(<AntimatterPanel ad={adaptAdSlice(slice)!} />);
      assert.equal(disabled(reachable, t('adLabText31')), false);
      assert.equal(slice.adPrestige(), true);
      assert.equal(slice.adGame!.infinities, 1);
      const after = renderToStaticMarkup(<AntimatterPanel ad={adaptAdSlice(slice)!} />);
      assert.ok(tabButton(after, 'adLabText7'));
      assert.ok(tabButton(after, 'adInfinityTab'));
      assert.equal(disabled(after, t('adLabText31')), true);
      slice.adGame = createNewGame(0);
      const restored = renderToStaticMarkup(<AntimatterPanel ad={adaptAdSlice(slice)!} />);
      assert.ok(!tabButton(restored, 'adLabText7'));
      assert.ok(tabButton(restored, 'adInfinityTab'));
      assert.equal(disabled(restored, t('adLabText31')), true);
    }
  } finally { setLanguage(previous); }
});

test('自動化は Infinity 後に解放・切り替え・短縮でき、3D には自動の印が出る', () => {
  const previous = getLanguage();
  try {
    for (const language of ['ja', 'en', 'ko'] as const) {
      setLanguage(language);
      const game = createNewGame(0);
      const slice = harness(game);
      const tabButton = (html: string) => html.includes('>' + t('adInfinityTab') + '</button>');
      assert.ok(tabButton(renderToStaticMarkup(<AntimatterPanel ad={adaptAdSlice(slice)!} />)));
      game.infinities = 1;
      game.infinityPoints = bigFromNumber(2);
      assert.ok(tabButton(renderToStaticMarkup(<AntimatterPanel ad={adaptAdSlice(slice)!} />)));
      const html = () => renderToStaticMarkup(<AutomationPanel ad={adaptAdSlice(slice)!} />);
      assert.ok(html().includes(t('adAutoUnlock', 1)) && html().includes(t('adAutoUnlock', 3)));
      assert.equal(disabled(html(), t('adAutoUnlock', 3)), true);
      assert.equal(slice.adUnlockAutobuyer('crunch'), false);
      assert.equal(slice.adUnlockAutobuyer('tickspeed'), true);
      assert.equal(buildAdLabSnapshot(game).autoTickspeed, true);
      assert.ok(panels(slice, 'tickspeed').space.includes(t('adAutoBadge')));
      assert.ok(!panels(slice, 'boost').space.includes(t('adAutoBadge')));
      assert.ok(html().includes(t('adAutoInterval', 5)) && html().includes(t('adAutoShorten', 1)));
      assert.equal(slice.adSetAutobuyer('tickspeed', false), true);
      assert.ok(html().includes(t('adAutoOff')));
      assert.ok(!panels(slice, 'tickspeed').space.includes(t('adAutoBadge')));
      assert.equal(slice.adUpgradeAutobuyer('tickspeed'), true);
      assert.ok(html().includes(t('adAutoInterval', 3)));
    }
  } finally { setLanguage(previous); }
});

test('Infinity 強化は列の順に買え、IP が足りないと変わらず、2D・3D の表示に反映される', () => {
  const previous = getLanguage();
  try {
    for (const language of ['ja', 'en', 'ko'] as const) {
      setLanguage(language);
      const game = createNewGame(0);
      game.infinities = 1;
      game.infinityPoints = bigFromNumber(2);
      const slice = harness(game);
      const html = () => renderToStaticMarkup(<InfinityUpgradesPanel ad={adaptAdSlice(slice)!} />);
      const card = (id: string) => html().split('<div class="adlab-card adlab-iu-card').find(part => part.includes(`data-iu="${id}"`)) ?? '';
      assert.equal(html().match(/data-iu="/g)?.length, 16);
      assert.ok(card('dims18').includes(t('adLocked')) && card('dims18').includes('is-locked'));
      assert.equal(slice.adBuyInfinityUpgrade('dims18'), false);
      assert.equal(disabled(card('startBoost1').replace(/^[^<]*/, ''), t('adLabText62', 6)), true);
      assert.equal(slice.adBuyInfinityUpgrade('startBoost1'), false);
      assert.equal(game.infinityPoints.mantissa, 2);
      assert.equal(slice.adBuyInfinityUpgrade('totalTime'), true);
      assert.ok(card('totalTime').includes('is-owned') && card('totalTime').includes(t('adIuOwned')));
      assert.ok(!card('dims18').includes('is-locked'));
      assert.equal(slice.adBuyInfinityUpgrade('dims18'), true);
      assert.equal(game.infinityPoints.mantissa, 0);
      assert.equal(slice.adBuyInfinityUpgrade('dims36'), false);
      assert.ok(card('buy10').includes('×2.2'));
      assert.ok(card('resetReq').includes('−9'));
      assert.ok(card('startGalaxy').includes(t('adChipBoost', 4)));
      const infinityTab = renderToStaticMarkup(<InfinityPanel ad={adaptAdSlice(slice)!} />);
      assert.ok(infinityTab.includes(t('adIuSegUpgrades')) && infinityTab.includes(t('adAutoTab')));
      assert.ok(panels(slice, 'exhibit-infinity').space.includes(t('adIuCount', 2, 16)));
      assert.ok(!panels(slice, 'exhibit-eternity').space.includes(t('adIuCount', 2, 16)));
    }
  } finally { setLanguage(previous); }
});

test('次元の倍率表示は Infinity 強化と Boost の効果を含むエンジンの値と一致する', () => {
  const game = createNewGame(0);
  game.dimensions[0].bought = 20;
  game.dimensionalBoosts = 2;
  const slice = harness(game);
  const before = renderToStaticMarkup(<DimensionList ad={adaptAdSlice(slice)!} />);
  assert.ok(before.includes('×16'));
  game.infinityUpgrades = ['buy10', 'boostMult'];
  const after = renderToStaticMarkup(<DimensionList ad={adaptAdSlice(slice)!} />);
  assert.ok(after.includes(`×${formatNumber(bigFromLog10(2 * Math.log10(2.2) + 2 * Math.log10(2.5)))}`));
});

test('phone window size fills the region only for AD windows in the phone layout', () => {
  const region = { w: 374, h: 560 };
  const opts = { region, bar: 44, aspect: 1.2 };
  assert.deepEqual(simpleWindowSize({ ...opts, fill: true }), { width: 374, height: 560 });
  assert.deepEqual(simpleWindowSize({ ...opts, fill: false }), { width: 374, height: 374 / 1.2 + 44 });
  assert.deepEqual(simpleWindowSize({ ...opts, aspect: undefined, fill: false }), { width: 374, height: undefined });
  assert.equal(shouldFillWindow({ phone: true, compact: false, isAd: true }), true);
  assert.equal(shouldFillWindow({ phone: true, compact: true, isAd: true }), false);
  assert.equal(shouldFillWindow({ phone: false, compact: false, isAd: true }), false);
  assert.equal(shouldFillWindow({ phone: true, compact: false, isAd: false }), false);
});

test('in-app confirm resolves false without a document and never calls window.confirm', async () => {
  assert.equal(await confirmAd('?'), false);
});

test('number fixtures straddle actual suffix and exponent formatting boundaries', () => {
  assert.equal(formatNumber(bigFromNumber(999)), '999');
  assert.equal(formatNumber(bigFromNumber(1000)), '1.00K');
  assert.equal(formatNumber(bigFromNumber(999999)), '1000.00K');
  assert.equal(formatNumber(bigFromNumber(1000000)), '1.00M');
  assert.equal(formatNumber(bigFromLog10(999)), '1.00mq');
  assert.equal(formatNumber(bigFromLog10(1000)), '1.00e1000');
  assert.equal(formatNumber(bigFromLog10(9999)), '1.00e9999');
  assert.equal(formatNumber(bigFromLog10(10000)), '1.00e10000');
  assert.equal(formatNumber(bigFromLog10(99999)), '1.00e99999');
  assert.equal(formatNumber(bigFromLog10(100000)), '1.00e100000');
});

test('次元の購入ボタンは貯まった割合・残り時間を出し、×2 に届く購入を払えるときだけ黄色にする', () => {
  const previous = getLanguage();
  try {
    for (const language of ['ja', 'en', 'ko'] as const) {
      setLanguage(language);
      const game = createNewGame(0);
      game.dimensions[0].bought = 5;
      const slice = harness(game);
      const cost = adaptAdSlice(slice)!.derived.dimensions[0].cost;
      const buttons = () => {
        const html = renderToStaticMarkup(<DimensionList ad={adaptAdSlice(slice)!} />);
        const find = (label: string) => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(m => m[0]).find(b => b.includes(`aria-label="${label}"`)) ?? '';
        return { html, single: find(t('adLabText23', 1)), block: find(t('adLabText24', 1)) };
      };
      game.antimatter = bigMulNumber(cost, 0.5);
      let view = buttons();
      assert.ok(view.single.includes('--ad-fill:50%'));
      assert.ok(view.block.includes('--ad-fill:10%'));
      assert.ok(view.single.includes(t('adUiEtaFar')));
      assert.ok(view.html.includes(t('adUiMakes', t('adUiResAntimatter'))) && view.html.includes(t('adUiMakes', t('adLabText13', 1))));
      game.antimatter = bigMulNumber(cost, 2);
      view = buttons();
      assert.ok(view.single.includes(t('adUiEtaNow')) && !view.single.includes('is-double'));
      assert.ok(view.block.includes('is-partial') && !view.block.includes('is-double'));
      assert.equal(/\bdisabled=/.test(view.block), false);
      game.antimatter = bigMulNumber(cost, 5);
      view = buttons();
      assert.ok(view.block.includes('is-double') && view.block.includes(t('adUiEtaNow')));
      game.dimensions[0].bought = 9;
      game.antimatter = adaptAdSlice(slice)!.derived.dimensions[0].cost;
      assert.ok(buttons().single.includes('is-double'));
    }
  } finally { setLanguage(previous); }
});

function displayedEta(seconds: number) {
  const rounded = Math.ceil(seconds);
  if (!Number.isFinite(rounded) || rounded > 9999 * 86400) return t('adUiEtaFar');
  if (rounded === 0) return t('adUiEtaNow');
  if (rounded < 60) return t('adUiEtaSec', rounded);
  if (rounded < 3600) return t('adUiEtaMin', Math.ceil(rounded / 60));
  if (rounded < 86400) return t('adUiEtaHour', Math.ceil(rounded / 3600));
  return t('adUiEtaDay', Math.ceil(rounded / 86400));
}

function dimensionBuyButtons(ad: NonNullable<ReturnType<typeof adaptAdSlice>>, tier = 1) {
  const html = renderToStaticMarkup(<DimensionList ad={ad} />);
  const buttons = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(m => m[0]);
  return [t('adLabText23', tier), t('adLabText24', tier)].map(label => {
    const button = buttons.find(b => b.includes(`aria-label="${label}"`));
    assert.ok(button);
    assert.doesNotMatch(button, /NaN|Infinity/);
    return button;
  });
}

test('purchase ETAs use full single and milestone costs, preserve linear estimates and update after production changes', () => {
  const previous = getLanguage();
  try {
    for (const language of ['ja', 'en', 'ko'] as const) {
      setLanguage(language);
      for (const bought of [0, 9, 10]) {
        const game = createNewGame(0);
        game.antimatter = bigFromNumber(0);
        game.dimensions[0].bought = bought;
        game.dimensions[0].amount = bigFromNumber(0.1);
        const slice = harness(game);
        const linear = adaptAdSlice(slice)!;
        const d = linear.derived.dimensions[0];
        const costs = [d.cost, bigMulNumber(d.cost, d.nextMilestoneRemaining)];
        const expected = costs.map(cost => 10 ** (bigLog10(bigSub(cost, game.antimatter)) - bigLog10(linear.derived.antimatterPerSecond)));
        dimensionBuyButtons(linear).forEach((button, i) => assert.ok(button.includes(displayedEta(expected[i]))));
        assert.equal(d.purchaseEtaSeconds, expected[0]);
        assert.equal(d.milestoneEtaSeconds, expected[1]);
        assert.equal(d.nextMilestoneRemaining, bought === 9 ? 1 : 10);
        game.dimensions[0].amount = bigFromNumber(0);
        game.dimensions[7].amount = bigFromNumber(1e6);
        game.dimensionalBoosts = 4;
        const save = serialize(game);
        const chain = adaptAdSlice(slice)!;
        assert.equal(chain.derived.antimatterPerSecond.mantissa, 0);
        const predict = createAntimatterEta(game);
        for (const dim of chain.derived.dimensions) {
          const times = [predict(dim.cost), predict(bigMulNumber(dim.cost, dim.nextMilestoneRemaining))];
          assert.ok(times.every(Number.isFinite));
          dimensionBuyButtons(chain, dim.tier).forEach((button, i) => assert.ok(button.includes(displayedEta(times[i]))));
        }
        assert.equal(serialize(game), save);
        game.dimensions[7].amount = bigFromNumber(1e12);
        const updated = adaptAdSlice(slice)!;
        assert.ok(updated.derived.dimensions[0].purchaseEtaSeconds < chain.derived.dimensions[0].purchaseEtaSeconds);
        assert.notDeepEqual(dimensionBuyButtons(updated), dimensionBuyButtons(chain));
      }
    }
  } finally { setLanguage(previous); }
});

test('ETA formatting retains second, minute, hour and day ceilings in all three languages', () => {
  const previous = getLanguage();
  try {
    for (const language of ['ja', 'en', 'ko'] as const) {
      setLanguage(language);
      const game = createNewGame(0);
      game.antimatter = bigFromNumber(0);
      const ad = adaptAdSlice(harness(game))!;
      const cases: [number, string][] = [
        [0.1, t('adUiEtaSec', 1)], [59, t('adUiEtaSec', 59)],
        [59.01, t('adUiEtaMin', 1)], [60, t('adUiEtaMin', 1)], [60.01, t('adUiEtaMin', 2)],
        [3599, t('adUiEtaMin', 60)], [3599.01, t('adUiEtaHour', 1)], [3600, t('adUiEtaHour', 1)],
        [3600.01, t('adUiEtaHour', 2)], [86399, t('adUiEtaHour', 24)],
        [86399.01, t('adUiEtaDay', 1)], [86400, t('adUiEtaDay', 1)], [86400.01, t('adUiEtaDay', 2)],
        [9999 * 86400, t('adUiEtaDay', 9999)], [9999 * 86400 + 0.1, t('adUiEtaFar')],
        [Infinity, t('adUiEtaFar')], [NaN, t('adUiEtaFar')],
      ];
      for (const [seconds, label] of cases) {
        ad.derived.dimensions[0].purchaseEtaSeconds = seconds;
        ad.derived.dimensions[0].milestoneEtaSeconds = seconds;
        dimensionBuyButtons(ad).forEach(button => assert.ok(button.includes(label), `${language}: ${seconds}`));
      }
      game.antimatter = bigMulNumber(ad.derived.dimensions[0].cost, 10);
      dimensionBuyButtons(ad).forEach(button => assert.ok(button.includes(t('adUiEtaNow'))));
    }
  } finally { setLanguage(previous); }
});

test('次元タブの自動化トグルは未解放で鍵、解放後は自動化パネルと同じ条件で切り替わり、カードのボタンは進み具合で塗る', () => {
  const previous = getLanguage();
  try {
    for (const language of ['ja', 'en', 'ko'] as const) {
      setLanguage(language);
      const game = createNewGame(0);
      const slice = harness(game);
      const html = () => renderToStaticMarkup(<DimensionList ad={adaptAdSlice(slice)!} />);
      const button = (markup: string, label: string) => [...markup.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(m => m[0]).find(b => b.includes(`aria-label="${label}"`)) ?? '';
      const lowLocked = button(html(), t('adUiAutoLockedPre', t('adAutoLow'), 1));
      assert.ok(lowLocked.includes('is-locked') && /\bdisabled=/.test(lowLocked));
      assert.ok(button(html(), t('adUiAutoLockedPre', 'Tickspeed', 1)).includes('is-locked'));
      assert.ok(!html().includes(t('adUiAutoLockedPre', 'Sacrifice', 1)));
      game.antimatter = bigMulNumber(adaptAdSlice(slice)!.derived.tickspeedCost, 0.25);
      assert.match(html(), /class="adlab-action-run"[^>]*style="[^"]*--ad-fill:25%/);
      game.infinities = 1;
      game.infinityPoints = bigFromNumber(1);
      assert.ok(button(html(), t('adUiAutoLocked', t('adAutoLow'), 1)).includes('is-locked'));
      assert.equal(slice.adUnlockAutobuyer('lowDims'), true);
      const on = button(html(), t('adUiAutoLabel', t('adAutoLow')));
      assert.ok(on.includes('role="switch"') && on.includes('aria-checked="true"') && !/\bdisabled=/.test(on));
      assert.ok(on.includes(t('adUiAutoRange', 1, 4)));
      adaptAdSlice(slice)!.setAutobuyer('lowDims', false);
      assert.ok(button(html(), t('adUiAutoLabel', t('adAutoLow'))).includes('aria-checked="false"'));
    }
  } finally { setLanguage(previous); }
});

test('狭い窓では PC 用の並びのまま縮め、縮めすぎになる幅ではスマホ用の並びに任せる', async () => {
  const { adPanelScale, AD_PANEL_DESIGN_WIDTH, AD_PANEL_MIN_SCALE } = await import('./panelScale.ts');
  assert.equal(adPanelScale(AD_PANEL_DESIGN_WIDTH), 1);
  assert.equal(adPanelScale(1200), 1);
  assert.equal(adPanelScale(AD_PANEL_DESIGN_WIDTH * 0.8), 0.8);
  assert.equal(adPanelScale(AD_PANEL_DESIGN_WIDTH * AD_PANEL_MIN_SCALE), AD_PANEL_MIN_SCALE);
  assert.equal(adPanelScale(AD_PANEL_DESIGN_WIDTH * AD_PANEL_MIN_SCALE - 1), 1);
  assert.equal(adPanelScale(0), 1);
  assert.ok(renderToStaticMarkup(<AntimatterPanel ad={adaptAdSlice(harness(createNewGame(0)))!} />).startsWith('<div class="adlab-scale-frame"><div class="adlab-lab-panel"'));
});
