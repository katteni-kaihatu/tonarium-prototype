import type { FantasyCheckContext, FantasyEvent, FantasyEventChoice, FantasyJob, FantasySkill, FantasyStat } from './fantasy.ts';
type Text = [ko: string, en: string, ja: string];
const l = ([ko, en, ja]: Text) => ({ ko, en, ja });
const ability = (id: string, names: Text, descriptions: Text, kind: FantasySkill['kind'], stat: FantasyStat, power: number, mp = 0): FantasySkill => ({ id, names: l(names), name: names[2], descriptions: l(descriptions), description: descriptions[2], kind, stat, effect: 'check', power, mp });
export const FANTASY_RANGER_JOB: FantasyJob = {
  id: 'ranger', names: l(['레인저', 'Ranger', 'レンジャー']), name: 'レンジャー', category: 'ordinary', stat: 'agility',
  descriptions: l(['발자국과 작은 소리를 읽고 함정을 살피며, 활로 탐사대의 길을 지키는 전투 직업.', 'A combat profession that reads tracks and faint sounds, studies traps and protects expeditions with a bow.', '足跡と微かな音を読み、罠を調べ、弓で探索隊の道を守る戦闘職。']),
  description: '足跡と微かな音を読み、罠を調べ、弓で探索隊の道を守る戦闘職。',
  skills: [
    ability('ranger-signs', ['흔적 감지', 'Read the Signs', '痕跡の察知'], ['지능 판정에 +2. 흔적과 위험을 관찰할 때 쓰인다.', 'Intelligence checks gain +2, including checks to study traces and hazards.', '知力判定に+2。痕跡や危険の観察に使う。'], 'passive', 'intelligence', 2),
    ability('ranger-aim', ['약점 조준', 'Weak-Point Aim', '弱点への狙い'], ['다음 민첩 판정에 +4. 전투에서는 장비한 무기로 공격하며 활은 원거리로 쏜다.', 'The next Agility check gains +4. In combat, attack with the equipped weapon; bows use ranged attacks.', '次の敏捷判定に+4。戦闘では装備武器で攻撃し、弓なら遠距離で射る。'], 'active', 'agility', 4, 6),
  ],
  eventIds: ['ranger-tracks', 'ranger-snare', 'ranger-ridge'],
};
function scene(id: string, title: Text, body: Text, approaches: [Text, FantasyStat, FantasyCheckContext][], success: Text, failure: Text, item: string): FantasyEvent {
  const choices: FantasyEventChoice[] = approaches.map(([labels, stat, context], index) => ({ id: index ? 'careful' : 'direct', labels: l(labels), label: labels[2], stat, context, dc: 12 + index, gold: 24 + index * 2, item, successes: l(success), success: success[2], failures: l(failure), failure: failure[2] }));
  return { id, job: 'ranger', names: l(title), name: title[2], descriptions: l(body), description: body[2], choices };
}
export const FANTASY_RANGER_EVENTS: FantasyEvent[] = [
  scene('ranger-tracks', ['겹쳐진 발자국', 'Overlapping Tracks', '重なった足跡'], ['사라진 짐꾼의 발자국이 짐승의 흔적과 겹친다. 흔적을 나누어 안전한 귀환길을 찾자.', 'A missing porter’s prints cross animal tracks. Separate the traces to find a safe route home.', '行方の分からない荷運びの足跡に獣の跡が重なる。痕跡を分け、安全な帰路を探そう。'], [[['꺾인 풀과 발자국을 대조한다', 'Compare bent grass and footprints', '折れ草と足跡を照合する'], 'intelligence', 'keen-senses'], [['높은 발판에서 진행 방향을 살핀다', 'Read the route from a high foothold', '高い足場から進路を確かめる'], 'agility', 'high-place']], ['짐꾼을 찾아 안전한 길로 안내했다.', 'You find the porter and guide them along a safe path.', '荷運びを見つけ、安全な道へ導いた。'], ['흔적이 끊겨 위험 구간을 표시하고 지원을 기다렸다.', 'The trail ends; you mark the hazard and wait for support.', '跡が途切れ、危険な場所を示して応援を待った。'], 'herb'),
  scene('ranger-snare', ['길목의 낡은 올가미', 'The Old Trail Snare', '道端の古い括り罠'], ['여행길에 낡은 올가미가 남았다. 숨은 당김줄을 찾아 통행 전에 해체하자.', 'An old snare blocks a trail. Find its concealed trigger line before dismantling it.', '旅路に古い括り罠が残る。隠れた引き紐を見つけ、通る前に解体したい。'], [[['흙 위의 가는 줄을 찾아낸다', 'Locate the fine line above the soil', '土の上の細い紐を見つける'], 'intelligence', 'keen-senses'], [['장력을 고정하고 매듭을 푼다', 'Secure the tension and undo the knot', '張りを押さえて結び目を解く'], 'dexterity', 'trap']], ['올가미를 치우고 안전한 통로를 표시했다.', 'The snare is removed and the safe passage marked.', '括り罠を取り除き、安全な通路を示した。'], ['장력이 불안정해 길을 막고 도구를 갖춘 사람을 불렀다.', 'The tension is unstable; you close the path and call for tools.', '張りが不安定で、道を閉じて道具を持つ者を呼んだ。'], 'wood'),
  scene('ranger-ridge', ['능선 위의 경계', 'Watch on the Ridge', '尾根の見張り'], ['탐사대가 좁은 능선을 지난다. 멀리 움직이는 그림자를 확인하고 활로 퇴로를 지키자.', 'An expedition crosses a narrow ridge. Identify the distant movement and cover its retreat with a bow.', '探索隊が細い尾根を渡る。遠くの動きを確かめ、弓で退路を守ろう。'], [[['바람을 읽어 경고 화살을 쏜다', 'Read the wind and loose a warning arrow', '風を読んで警告の矢を放つ'], 'agility', 'high-place'], [['발소리를 구별해 안전한 시간을 고른다', 'Distinguish the footsteps and choose a safe interval', '足音を聞き分け安全な間を選ぶ'], 'intelligence', 'keen-senses']], ['탐사대가 모두 능선을 건너고 경계를 풀었다.', 'The expedition crosses safely before you leave your watch.', '探索隊が全員尾根を渡り、見張りを終えた。'], ['시야가 나빠 낮은 우회로로 탐사대를 돌렸다.', 'Visibility worsens, so you guide the expedition to a lower detour.', '見通しが悪く、低い迂回路へ探索隊を導いた。'], 'potion'),
];
