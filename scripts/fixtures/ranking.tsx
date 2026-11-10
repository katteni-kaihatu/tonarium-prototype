import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AUTOBUYER_IDS, bigFromNumber, createNewGame } from '../../client/src/ad/engine.mjs';
import { createAdSlice, type AdSlice } from '../../client/src/ad/slice.ts';
import { adaptAdSlice } from '../../client/src/world/antimatter/adapter.tsx';
import { RankingPanel } from '../../client/src/world/antimatter/RankingPanel.tsx';
import { AntimatterPanel } from '../../client/src/world/antimatter/AntimatterPanel.tsx';
import { s } from '../../client/src/world/antimatter/styles.ts';
import { setLanguage, systemText, type UiMessage } from '../../client/src/i18n/core.ts';
import '../../client/src/world/antimatter/antimatter-panel.css';

let slice: AdSlice;
slice = createAdSlice(partial => Object.assign(slice, partial), () => slice);
slice.adGame = createNewGame();
const longName = '長い名前_LongName_긴이름_'.repeat(5);
const entry = (name: string, score: number, infinities: number, playTimeSec: number, self = false, dimensionalBoosts?: number, galaxies?: number) => ({ name, antimatterLog10: score, infinities, playTimeSec, self, dimensionalBoosts, galaxies });
const initial = [entry('Alpha', 1000, 1234567890123458, 90061, false, 17, 12), entry('Beta', 900, 1234567890123457, 3600, true, undefined, 0), entry(longName, 800, 1234567890123456, 9876543210), entry('Alpha', 700, 7, 70, true, 0, 0), entry('Beta', 600, 6, 60, false, undefined, 6), entry('Alpha', 500, 5, 50), entry(longName, 400, 987654321012345, 1234567890, true)];

function Fixture() {
  const [updated, setUpdated] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [revision, setRevision] = useState(0);
  const [calls, setCalls] = useState(0);
  const [reject, setReject] = useState(false);
  const [notice, setNotice] = useState<UiMessage | null>(null);
  const [infinity, setInfinity] = useState(false);
  const panel = new URLSearchParams(location.search).has('panel');
  const preview = new URLSearchParams(location.search).get('preview');
  if (preview) {
    slice.adGame!.infinityPoints = bigFromNumber(['initial', 'zero'].includes(preview) ? 0 : 10000);
    for (const id of AUTOBUYER_IDS) {
      slice.adGame!.autobuyers[id].unlocked = ['off', 'on', 'zero'].includes(preview);
      slice.adGame!.autobuyers[id].enabled = preview === 'on';
    }
  }
  slice.adGame!.infinities = infinity ? 1 : 0;
  const ad = adaptAdSlice(slice)!;
  const refreshLeaderboard = async () => {
    setCalls(value => value + 1);
    if (reject) throw new Error('fixture rejection');
    setUpdated(value => !value);
  };
  const props = { ...ad, leaderboard: updated ? [initial[1], initial[2], { ...initial[0], infinities: 8 }, ...initial.slice(3)] : initial, refreshLeaderboard };
  return <>
    <h1>Ranking verification</h1>
    <p>実コンポーネント・合成記録7件。Alpha: 3件 / Beta: 2件 / 長名: 2件。</p>
    <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button onClick={() => setUpdated(!updated)}>並び更新 ({updated ? '更新後' : '初期'})</button>
      <button onClick={() => setNarrow(!narrow)}>幅 ({narrow ? '320' : '900'}px)</button>
      <button onClick={() => setReject(value => !value)}>Reject: {String(reject)}</button>
      <button onClick={() => setInfinity(value => !value)}>Infinity: {String(infinity)}</button>
      {(['ja', 'en', 'ko'] as const).map(language => <button key={language} onClick={() => { setLanguage(language); setRevision(revision + 1); }}>{language}</button>)}
    </nav>
    <output data-refresh-calls>{calls}</output>
    {!panel && notice && <div role="status">{systemText(notice)}</div>}
    <div className="ranking-fixture-panel" style={{ ...(panel ? {} : s.root), width: narrow ? 320 : 900, maxWidth: '100%', height: 660, marginTop: 12 }}>
      {panel ? <AntimatterPanel ad={props} /> : <RankingPanel ad={props} notice={setNotice} />}
    </div>
  </>;
}
setLanguage('ja');
createRoot(document.getElementById('root')!).render(<Fixture />);
