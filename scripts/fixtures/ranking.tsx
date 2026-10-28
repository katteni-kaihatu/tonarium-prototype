import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createNewGame } from '../../client/src/ad/engine.mjs';
import { createAdSlice, type AdSlice } from '../../client/src/ad/slice.ts';
import { adaptAdSlice } from '../../client/src/world/antimatter/adapter.tsx';
import { StatsPanel } from '../../client/src/world/antimatter/StatsPanel.tsx';
import { s } from '../../client/src/world/antimatter/styles.ts';
import { setLanguage } from '../../client/src/i18n/core.ts';
import '../../client/src/world/antimatter/antimatter-panel.css';

let slice: AdSlice;
slice = createAdSlice(partial => Object.assign(slice, partial), () => slice);
slice.adGame = createNewGame();
const longName = '長い名前_LongName_긴이름_'.repeat(5);
const entry = (name: string, score: number, infinities: number, playTimeSec: number, self = false) => ({ name, antimatterLog10: score, infinities, playTimeSec, self });
const initial = [entry('Alpha', 1000, 10, 90061), entry('Beta', 900, 9, 3600, true), entry(longName, 800, 1234567890123456, 9876543210), entry('Alpha', 700, 7, 70, true), entry('Beta', 600, 6, 60), entry('Alpha', 500, 5, 50), entry(longName, 400, 987654321012345, 1234567890, true)];

function Fixture() {
  const [updated, setUpdated] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [revision, setRevision] = useState(0);
  const ad = adaptAdSlice(slice)!;
  return <>
    <h1>Ranking verification</h1>
    <p>実コンポーネント・合成記録7件。Alpha: 3件 / Beta: 2件 / 長名: 2件。</p>
    <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button onClick={() => setUpdated(!updated)}>並び更新 ({updated ? '更新後' : '初期'})</button>
      <button onClick={() => setNarrow(!narrow)}>幅 ({narrow ? '320' : '900'}px)</button>
      {(['ja', 'en', 'ko'] as const).map(language => <button key={language} onClick={() => { setLanguage(language); setRevision(revision + 1); }}>{language}</button>)}
    </nav>
    <style>{'.ranking-fixture-panel > div > :not(.ad-ranking) { display: none !important; }'}</style>
    <div className="ranking-fixture-panel" style={{ ...s.root, width: narrow ? 320 : 900, maxWidth: '100%', height: 660, marginTop: 12 }}>
      <StatsPanel ad={{ ...ad, leaderboard: updated ? [initial[1], initial[2], initial[0], ...initial.slice(3)] : initial, refreshLeaderboard: async () => setUpdated(value => !value) }} notice={() => {}} />
    </div>
  </>;
}
setLanguage('ja');
createRoot(document.getElementById('root')!).render(<Fixture />);
