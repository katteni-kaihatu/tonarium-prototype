import type { FantasyEvent, FantasyEventChoice, FantasyJob, FantasySkill, FantasyStat } from './fantasy.ts';

const l = (ko: string, en: string, ja: string) => ({ ko, en, ja });
const priestSkill = (id: string, names: ReturnType<typeof l>, descriptions: ReturnType<typeof l>, kind: FantasySkill['kind'], effect: FantasySkill['effect'], power: number, mp: number): FantasySkill => ({ id, name: names.ja, names, description: descriptions.ja, descriptions, kind, effect, power, mp });

export const FANTASY_PRIEST_JOB: FantasyJob = {
  id: 'priest', name: '司祭', names: l('사제', 'Priest', '司祭'), category: 'ordinary', stat: 'intelligence',
  description: '神殿で神に仕え、祈りでマナを整える聖法と日々の奉仕を学ぶ。',
  descriptions: l('신전에서 신을 섬기며 기도로 마나를 정돈하는 성법과 봉사를 배운다.', 'Serves a deity at a temple and learns sacred arts that order mana through prayer and service.', '神殿で神に仕え、祈りでマナを整える聖法と日々の奉仕を学ぶ。'),
  skills: [
    priestSkill('priest-prayer', l('기도의 수호', 'Prayer’s Shelter', '祈りの守り'), l('침착한 기도로 위험에서 받는 피해를 2 줄인다.', 'A steady prayer reduces incoming danger damage by 2.', '落ち着いた祈りで危険による被害を2軽減する。'), 'passive', 'guard', 2, 0),
    priestSkill('priest-grace', l('회복의 은총', 'Restoring Grace', '癒やしの恩恵'), l('성법으로 자신의 HP를 28 회복한다.', 'Sacred arts restore 28 of your own HP.', '聖法で自分のHPを28回復する。'), 'active', 'heal', 28, 10),
  ],
  eventIds: ['priest-vigil', 'priest-pilgrims', 'priest-sanctuary'],
};

const choice = (id: string, labels: ReturnType<typeof l>, stat: FantasyStat, dc: number, successes: ReturnType<typeof l>, failures: ReturnType<typeof l>, gold: number, item: string): FantasyEventChoice => ({ id, label: labels.ja, labels, stat, dc, success: successes.ja, successes, failure: failures.ja, failures, gold, item });
const event = (id: string, names: ReturnType<typeof l>, descriptions: ReturnType<typeof l>, choices: FantasyEventChoice[]): FantasyEvent => ({ id, job: 'priest', name: names.ja, names, description: descriptions.ja, descriptions, choices });

export const FANTASY_PRIEST_EVENTS: FantasyEvent[] = [
  event('priest-vigil', l('신전의 밤샘 봉사', 'The Temple Vigil', '神殿の夜の奉仕'), l('신전의 쉼터에 지친 주민들이 모였다. 기도와 돌봄으로 밤을 함께 보낸다.', 'Weary residents gather in the temple shelter. Share the night through prayer and care.', '神殿の休憩所に疲れた住民が集まった。祈りと世話で夜を共にする。'), [
    choice('diagnose', l('기도하며 마나 흐름을 안정시킨다', 'Steady mana with a prayer', '祈りでマナを整える'), 'intelligence', 12, l('호흡이 편안해져 주민들이 잠들었다.', 'Breathing eases and the residents settle to sleep.', '呼吸が落ち着き、住民は眠りについた。'), l('기도가 흐트러져 선임 사제와 함께 다시 돌봤다.', 'Your prayer falters; a senior priest helps you continue care.', '祈りが乱れ、先輩の司祭と世話を続けた。'), 26, 'herb'),
    choice('support', l('물과 침구를 나르며 봉사한다', 'Carry water and prepare bedding', '水と寝具を運んで仕える'), 'vitality', 11, l('쉼터가 정돈되어 모두 편히 쉬었다.', 'An orderly shelter lets everyone rest.', '休憩所が整い、皆が休めた。'), l('손이 부족해 신전 봉사자들과 일을 나눴다.', 'You share the workload with temple volunteers.', '手が足りず、神殿の奉仕者と仕事を分けた。'), 22, 'meal'),
  ]),
  event('priest-pilgrims', l('순례자의 작은 등불', 'The Pilgrims’ Lantern', '巡礼者の小さな灯'), l('긴 길을 걸어온 순례자들이 신전에 도착했다. 휴식과 다음 길의 준비를 돕는다.', 'Long-traveled pilgrims reach the temple. Help them rest and prepare for the next road.', '長い道を来た巡礼者が神殿に着いた。休息と次の道の準備を手伝う。'), [
    choice('remedy', l('은총으로 순례자의 회복을 돕는다', 'Offer grace to aid recovery', '恩恵で回復を助ける'), 'intelligence', 10, l('안정된 성법과 휴식이 순례자에게 힘을 돌려줬다.', 'Steady sacred arts and rest restore the pilgrims’ strength.', '安定した聖法と休息で巡礼者の力が戻った。'), l('집중이 부족해 약과 휴식으로 돌봄을 이어갔다.', 'When concentration slips, you continue care with remedies and rest.', '集中が続かず、薬と休息で世話を続けた。'), 20, 'potion'),
    choice('walk', l('순례길의 안전한 쉼터를 점검한다', 'Check safe resting places on the route', '巡礼路の休憩所を点検する'), 'vitality', 12, l('다음 쉼터까지 길을 확인해 안전한 여정을 도왔다.', 'Checking the next resting place helps the journey continue safely.', '次の休憩所まで道を確かめ、安全な旅を助けた。'), l('지친 순례자가 있어 가까운 쉼터에서 지원을 요청했다.', 'A tired pilgrim needs support, so you seek help at a nearby shelter.', '疲れた巡礼者のため、近くの休憩所で応援を頼んだ。'), 26, 'spice'),
  ]),
  event('priest-sanctuary', l('흔들리는 성소의 봉인', 'The Unsteady Sanctuary Seal', '聖所の揺れる封印'), l('신전에 맡겨진 상자의 봉인에서 마나가 새어 나온다. 기록된 의식과 돌봄으로 대응한다.', 'Mana leaks from a sealed box entrusted to the temple. Respond with recorded rites and care.', '神殿に預けられた箱の封印からマナが漏れる。記録された儀式と世話で対応する。'), [
    choice('seal', l('기도문과 봉인의 순서를 대조한다', 'Compare the prayer and sealing sequence', '祈祷文と封印の手順を照合する'), 'intelligence', 14, l('정해진 절차로 마나를 가라앉혀 봉인을 보수했다.', 'The recorded procedure calms the mana and repairs the seal.', '定められた手順でマナを鎮め、封印を直した。'), l('의식이 복잡해 선임 사제에게 기록을 넘겼다.', 'The rite is complex; you pass the records to a senior priest.', '儀式が複雑で、先輩の司祭に記録を渡した。'), 34, 'antidote'),
    choice('care', l('사람들을 물리고 안전한 자리를 지킨다', 'Clear the area and keep a safe watch', '人を離して安全を見守る'), 'vitality', 12, l('사람들이 안전하게 머무는 동안 봉인 담당자가 도착했다.', 'Everyone stays safe until the keeper of the seal arrives.', '皆の安全を守る間に、封印の担当者が着いた。'), l('밤새 경계를 서느라 지쳐 다른 사제와 교대했다.', 'An exhausting watch ends with another priest relieving you.', '夜通しの見張りに疲れ、別の司祭と交代した。'), 26, 'herb'),
  ]),
];

export const LEGACY_PRIEST_EVENTS: Readonly<Record<string, string>> = {
  'healer-fever': 'priest-vigil', 'healer-pilgrims': 'priest-pilgrims', 'healer-curse': 'priest-sanctuary',
};
