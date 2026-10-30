import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { bigFromLog10, bigFromNumber, bigMulNumber, createNewGame, getDimensionCostForBulk, getDimensionalBoostRequirement, getGalaxyRequirement, getSacrificeCandidate, type GameState } from '../../ad/engine.mjs';
import { createAdSlice, type AdSlice } from '../../ad/slice.ts';
import { buildAdActions, buildAdLabSnapshot } from '../../ad/labView.ts';
import { AntimatterSpacePanel } from '../../view3d/antimatterPanels.tsx';
import { adaptAdSlice } from './adapter.tsx';
import { ActionBar } from './ActionBar.tsx';
import type { AdPanelTarget } from '../../../../shared/antimatterLayout.ts';
import { ProfilePanel } from './ProfilePanel.tsx';
import { ProgressPicker } from './ProgressPicker.tsx';
import { StatsPanel } from './StatsPanel.tsx';
import { getLanguage, setLanguage, systemText, t } from '../../i18n/core.ts';
import { DimensionList } from './DimensionList.tsx';
import { LayerTabs } from './LayerTabs.tsx';
import { serialize } from '../../ad/engine.mjs';
import { AntimatterPanel } from './AntimatterPanel.tsx';

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
      const stats = renderToStaticMarkup(<StatsPanel ad={ad} notice={() => {}} />);
      assert.ok(stats.includes(t('adLabText133')));
      assert.ok(stats.includes('名前 {0} 플레이어'));
      for (const target of ['core', 'tickspeed', 'boost', 'galaxy', 'sacrifice', 'crunch', 'dimension-1', 'dimension-8', 'exhibit-infinity', 'exhibit-eternity', 'exhibit-reality', 'exhibit-celestials'] as const) {
        const space = panels(slice, target).space;
        if (language !== 'ja') assert.doesNotMatch(space, /[ぁ-んァ-ヶ一-龠]/);
      }
      assert.equal(serialize(slice.adGame!), before);
      assert.equal(slice.adProfile.name, '名前 {0} 플레이어');
    }
  } finally { setLanguage(previous); }
});
import { formatDuration } from './format.ts';

function harness(game: GameState) {
  let slice: AdSlice;
  slice = createAdSlice((partial) => { Object.assign(slice, partial); }, () => slice);
  slice.adGame = game;
  return slice;
}

test('ranking labels and collapsed self inclusion are shown in all three languages', () => {
  const previous = getLanguage();
  const slice = harness(createNewGame());
  slice.adProfile = { id: 'profile', name: 'Other', createdAt: null };
  slice.adLeaderboard = [
    { name: 'Shared', antimatterLog10: 100, infinities: 3, playTimeSec: 90061, dimensionalBoosts: 17 },
    { name: 'Other', antimatterLog10: 90, infinities: 2, playTimeSec: 60 },
    { name: 'Shared', antimatterLog10: 80, infinities: 1, playTimeSec: 10, self: true, dimensionalBoosts: 0 },
    { name: 'Shared', antimatterLog10: 70, infinities: 0, playTimeSec: 5, dimensionalBoosts: 8 },
    { name: 'Shared', antimatterLog10: 60, infinities: 0, playTimeSec: 1 },
  ];
  try {
    for (const language of ['ja', 'en', 'ko'] as const) {
      setLanguage(language);
      const html = renderToStaticMarkup(<StatsPanel ad={adaptAdSlice(slice)!} notice={() => {}} />);
      const [representatives, children] = html.split('<tbody id=');
      for (const key of ['adLabText52', 'adRankingRank', 'adLabText54', 'adLabText55', 'adRankingInfinity', 'adLabText56', 'adRankingContainsSelf', 'adRankingExpand']) assert.ok(representatives.includes(t(key)));
      assert.ok(representatives.includes(t('adRankingRecordCount', 4)));
      assert.ok(representatives.includes(t('adRankingBoost')));
      assert.ok(html.includes(t('adRankingUnavailable')));
      assert.match(representatives, /<td[^>]*>17<\/td>/);
      const childRows = [...children.split('</tbody>')[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)];
      assert.deepEqual(childRows.map(row => [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)][2][1]), ['0', '8', t('adRankingUnavailable')]);
      assert.match(html, /class="ad-ranking-scroll"[^>]*tabindex="0"/);
      assert.ok(!representatives.includes(t('adRankingSelf') + '</span>'));
      assert.ok(children.includes(t('adRankingSelf')));
      assert.match(html, /aria-expanded="false"/);
      assert.match(children, /hidden=""/);
      assert.equal([...html.matchAll(/ad-ranking-rank/g)].length, 2);
      assert.ok(html.includes(formatDuration(90061)));
      assert.equal(formatDuration(90061), language === 'ja' ? '1日 1時間 1分 1秒' : language === 'en' ? '1d 1h 1m 1s' : '1일 1시간 1분 1초');
      assert.equal(formatDuration(-10), language === 'ja' ? '0秒' : language === 'en' ? '0s' : '0초');
      const buttons = [...html.matchAll(/id="([^"]+)"[^>]*aria-expanded="false" aria-controls="([^"]+)"/g)];
      assert.equal(buttons.length, 1);
      assert.ok(html.includes(`id="${buttons[0][2]}" hidden="" aria-labelledby="${buttons[0][1]}"`));
      const ad = adaptAdSlice(slice)!;
      const own = renderToStaticMarkup(<StatsPanel ad={{ ...ad, leaderboard: [{ ...ad.leaderboard[0], self: true }] }} notice={() => {}} />);
      assert.ok(own.includes(t('adRankingSelf') + '</span>'));
      assert.ok(!own.includes(t('adRankingContainsSelf')));
      const unrelated = renderToStaticMarkup(<StatsPanel ad={{ ...ad, leaderboard: [ad.leaderboard[1]] }} notice={() => {}} />);
      assert.ok(!unrelated.includes('ad-ranking-badge'));
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
        const stats = renderToStaticMarkup(<StatsPanel ad={ad} notice={() => {}} />);
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
            assert.ok(flat.includes(t(target === 'boost' ? 'adLabText25' : 'adLabText27', req.tier, String(req.amount), req.tier, String(req.amount + offset), target === 'boost' ? game.dimensionalBoosts : game.galaxies)));
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
      const slice = harness(game);
      const { flat, space } = panels(slice, 'crunch');
      assert.equal(disabled(flat, t('adLabText31')), amount < 1.79e308);
      assert.equal(disabled(space, t('adLabText122')), amount < 1.79e308);
      assert.equal(disabled(panels(slice, 'crunch', false).space, t('adLabText122')), true);
    }
  });

}
