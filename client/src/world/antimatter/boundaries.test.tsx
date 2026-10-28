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
import { getLanguage, setLanguage, t } from '../../i18n/core.ts';

function harness(game: GameState) {
  let slice: AdSlice;
  slice = createAdSlice((partial) => { Object.assign(slice, partial); }, () => slice);
  slice.adGame = game;
  return slice;
}

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
        assert.equal(ad.serverStatus, status === 'ready' ? null : t(status === 'loading' ? 'adSyncLoading' : status === 'choice' ? 'adSyncChoice' : 'adSyncError'));
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

for (const [target, boosts] of [['boost', 0], ['boost', 6], ['boost', 7], ['galaxy', 4]] as const) {
  for (const mode of ['single', 'ten', 'max'] as const) {
    test(`${target} Boost=${boosts}: ${mode} 購入で2D・3Dの表示とボタンが一致`, () => {
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
          assert.equal(disabled(flat, target === 'boost' ? 'Boost する' : 'Galaxy を作る'), expected);
          assert.equal(disabled(space, target === 'boost' ? 'Boost を実行' : 'Galaxy を実行'), expected);
          assert.equal(target === 'boost' ? ad.derived.boost.can : ad.derived.galaxy.can, !expected);
          assert.ok(flat.includes(`現在: 第${req.tier}次元 ${req.amount + offset} 個`));
          assert.ok(space.includes(`対象次元の現在個数：${req.amount + offset} 個`));
          assert.equal(disabled(panels(slice, target, false).space, target === 'boost' ? 'Boost を実行' : 'Galaxy を実行'), true);
        }
        if (target === 'boost') assert.equal(slice.adBoost(), true); else assert.equal(slice.adGalaxy(), true);
        const after = panels(slice, target);
        assert.equal(disabled(after.space, target === 'boost' ? 'Boost を実行' : 'Galaxy を実行'), true);
      }
    });
  }
}

test('Sacrifice・Crunch は共通条件と所有者条件を両パネルで守る', () => {
  for (const boosts of [4, 5]) {
    for (const improved of [false, true]) {
      const game = createNewGame(0);
      game.dimensionalBoosts = boosts;
      game.dimensions[0].amount = bigFromLog10(100);
      if (!improved) game.sacrificeBoost = getSacrificeCandidate(game);
      const slice = harness(game);
      const { flat, space } = panels(slice, 'sacrifice');
      assert.equal(disabled(flat, 'Sacrifice する'), boosts < 5 || !improved);
      assert.equal(disabled(space, 'Sacrifice を実行'), boosts < 5 || !improved);
      assert.equal(disabled(panels(slice, 'sacrifice', false).space, 'Sacrifice を実行'), true);
    }
  }
  for (const amount of [1.78e308, 1.79e308, 1.795e308]) {
    const game = createNewGame(0);
    game.antimatter = bigFromNumber(amount);
    const slice = harness(game);
    const { flat, space } = panels(slice, 'crunch');
    assert.equal(disabled(flat, 'Big Crunch する'), amount < 1.79e308);
    assert.equal(disabled(space, 'Big Crunch を実行'), amount < 1.79e308);
    assert.equal(disabled(panels(slice, 'crunch', false).space, 'Big Crunch を実行'), true);
  }
});
