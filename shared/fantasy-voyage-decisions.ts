import type { FantasyCharacter } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';
import type { FantasyVoyageText } from './fantasy-voyage-scene-types.ts';
import { fantasyMainStage, fantasyMainTrial, validFantasyMainTrials } from './fantasy-main-trials.ts';
import { FANTASY_MAIN_QUESTS } from './fantasy-second-content.ts';
import { fantasyQuestRecordEligible } from './fantasy-access.ts';

interface VoyageChoice { id: string; label: FantasyVoyageText; result: FantasyVoyageText; gold: number; fatigue: number }
export interface FantasyVoyageDecision { id: string; quest: string; stage: 'field' | 'verify' | 'compare'; setup: FantasyVoyageText; choices: VoyageChoice[] }
const t = (ko: string, en: string, ja: string): FantasyVoyageText => ({ ko, en, ja });
const choice = (id: string, label: FantasyVoyageText, result: FantasyVoyageText, gold = 0, fatigue = 0): VoyageChoice => ({ id, label, result, gold, fatigue });
export const FANTASY_VOYAGE_DECISIONS: FantasyVoyageDecision[] = [
  { id: 'letter-promise', quest: 'main-night-01', stage: 'compare', setup: t(
    '미라는 편지 모서리를 펴다가 손을 멈춘다. “돌아오겠다는 말이 거짓이었다고 먼저 생각하고 싶지는 않아. 어디까지 알아봐 줄 수 있겠어?”',
    'Mira stops smoothing a letter’s corner. “I do not want to assume their promise to return was a lie. How far are you willing to look?”',
    'ミラは手紙の角を伸ばす手を止める。「帰るという約束が嘘だったと、先に決めたくないの。どこまで調べてくれる？」'), choices: [
      choice('promise', t('답장이 있는지 끝까지 찾아본다', 'Promise to search for a reply', '返事があるか最後まで探すと約束する'), t(
        '“답장이 없더라도 네 탓은 하지 않을게.” 미라는 편지를 조심히 내민다. 답을 약속하는 대신, 찾는 일을 끝까지 하기로 했다.',
        '“I will not blame you if there is no reply.” Mira carefully offers the letter. You promise to finish the search, rather than promise its answer.',
        '「返事がなくても、あなたのせいにはしない。」ミラはそっと手紙を差し出す。答えではなく、探し続けることを約束した。')),
      choice('verify', t('추측 없이 확인한 사실을 전한다', 'Promise only verified facts', '推測せず確かめた事実を伝える'), t(
        '미라는 잠시 눈을 내리깔다가 고개를 끄덕인다. “위로하려고 빈칸을 채우지는 말아 줘. 기다릴 수 있어.”',
        'Mira lowers her eyes, then nods. “Do not fill the gaps just to comfort me. I can wait.”',
        'ミラは少し目を伏せてから頷く。「慰めるために空白を埋めないで。待つことはできるから。」')),
    ] },
  { id: 'witness-care', quest: 'main-night-07', stage: 'verify', setup: t(
    '나침반 공방 아래에서 짐을 옮기던 운반인이 발목을 다쳤다. 확인한 도난 흔적도 지켜야 하지만, 그를 가파른 길에 그대로 둘 수는 없다.',
    'A porter below the compass workshop has injured an ankle. The theft traces need protecting, but the porter cannot be left on the steep path.',
    '羅針盤工房の下で荷運び人が足首を傷めている。盗難の痕跡を守る必要はあるが、急な道に置き去りにはできない。'), choices: [
      choice('aid', t('직접 부축해 안전한 곳으로 옮긴다', 'Help the porter to safety yourself', '自分で支えて安全な場所へ運ぶ'), t(
        '운반인을 그늘진 받침터에 앉히고 다리를 고정했다. 팔에 피로가 남았지만 그는 이제 혼자 위험한 길을 버틸 필요가 없다.',
        'You settle the porter on a sheltered ledge and secure the ankle. Your arms ache, but the porter no longer has to endure the dangerous path alone.',
        '荷運び人を陰のある足場に座らせ、足を固定した。腕は疲れたが、危険な道で一人耐える必要はなくなった。'), 0, 4),
      choice('watch', t('현지 일꾼에게 구조를 부탁하고 흔적을 지킨다', 'Pay local workers to help while guarding the traces', '地元の働き手に救助を頼み痕跡を守る'), t(
        '구조 품삯을 내고 일꾼들이 운반인을 옮기는 동안 현장을 지켰다. 목격자의 말을 증거로 단정하지 않은 채, 사람과 흔적을 모두 지켰다.',
        'You pay the workers to move the porter and watch the site. Both the person and the traces are protected, without treating testimony as proven evidence.',
        '手間賃を払い、荷運び人が運ばれる間は現場を見守った。証言を証拠と決めつけず、人と痕跡を両方守れた。'), 6),
    ] },
  { id: 'chart-offer', quest: 'main-night-10', stage: 'compare', setup: t(
    '리라의 책상에 철가면 선단의 매입장이 놓여 있다. “길을 아는 사람에게만 값을 치른다”는 문장 아래, 다음 대조본도 넘기라는 요구가 붙었다. 리라는 팔 생각이 없지만, 선단이 언제까지 기다려 줄지는 모른다.',
    'An Ironmask purchase offer lies on Lyra’s desk. Beneath “We pay those who know the way” is a demand for the next comparison chart. Lyra will not sell, but doubts the fleet will keep waiting.',
    'リラの机に鉄仮面船団の買付状がある。「道を知る者にだけ金を払う」とあり、次の照合図も渡せという要求が添えられている。リラに売る気はないが、いつまで待つ相手かは分からない。'), choices: [
      choice('refuse', t('리라와 함께 매입 요구를 분명히 거절한다', 'Stand with Lyra and reject the demand', 'リラと共に買付要求をはっきり断る'), t(
        '“당신도 이름을 걸겠다는 거군요.” 리라는 거절문에 함께 증언한 일을 적었다. 원본은 그대로 보관하고 선단에 넘긴 항해 정보는 없다.',
        '“You are willing to stand by that, too.” Lyra records your support in the refusal. The original stays safe; no navigation information is handed over.',
        '「あなたも、その言葉に立ち会ってくれるのですね。」リラは拒否状に立会いを記した。原本は保管したまま、航海の情報は渡していない。')),
      choice('decoy', t('자비로 판독 정보가 없는 미끼 사본을 준비한다', 'Fund a decoy copy with no usable readings', '自費で読取情報のない囮の写しを用意する'), t(
        '종이와 봉인 비용을 내고 쓸 수 있는 눈금을 뺀 사본을 준비했다. 리라는 “이것으로 속을 거라고 단정하지는 맙시다”라며 원본을 따로 보관했다. 선단의 대금은 받지 않았다.',
        'You pay for paper and seals and prepare a copy without usable scales. “Let us not assume this will fool them,” Lyra says, keeping the original apart. No payment is taken from the fleet.',
        '紙と封印代を払い、有効な目盛りを抜いた写しを用意した。「これで騙せると決めつけないように」とリラは原本を別に保管した。船団の代金は受け取っていない。'), 5),
    ] },
  { id: 'homeward-priority', quest: 'main-night-12', stage: 'compare', setup: t(
    '실패한 원정의 기록을 앞에 둔 미라가 빈 답장 봉투를 내려놓는다. “편지를 찾는 일과 돌아오는 일, 둘 다 놓치고 싶지 않아.” 출발 전에 무엇부터 챙길지 이야기하자.',
    'With the failed expedition’s record before her, Mira sets down an empty reply envelope. “I do not want to lose either the letters or the people returning.” Discuss what to prepare first.',
    '失敗した遠征の記録を前に、ミラは空の返信封筒を置く。「手紙も、帰ってくる人も、どちらも失いたくない。」出発前に何から備えるか話そう。'), choices: [
      choice('letters', t('편지를 안전하게 전할 준비부터 한다', 'Prepare to carry the letters safely first', '手紙を安全に届ける準備から始める'), t(
        '봉투를 방습천에 넣는 동안 미라는 “사람이 먼저야. 편지를 지키려다 돌아올 길을 놓치지는 마”라고 당부했다. 편지를 우선 챙기되 귀환 준비도 생략하지 않기로 했다.',
        'As the envelopes go into protective cloth, Mira says, “People first. Do not lose your way home protecting a letter.” The letters are prepared first; return preparations will still be completed.',
        '封筒を防湿布に包む間、ミラは「人が先よ。手紙を守って帰り道を失わないで」と念を押した。手紙を先に整えるが、帰還の準備も省かない。')),
      choice('return', t('모두 돌아올 귀환표 준비부터 한다', 'Prepare the return instructions first', '皆が帰るための帰還表から整える'), t(
        '미라는 빈 봉투를 잠시 내려놓고 귀환표 여백을 함께 폈다. “기다리는 사람이 더 생기는 일은 막자.” 편지 조사는 이어 가면서 돌아올 기준부터 갖추기로 했다.',
        'Mira leaves the empty envelope aside and helps unfold the return sheet. “Let us not leave more people waiting.” The letter search will continue, with a way home prepared first.',
        'ミラは空の封筒を一度置き、帰還表の余白を共に広げた。「待つ人を増やすことは防ごう。」手紙を探し続けながら、帰る基準から備えることにした。')),
    ] },
];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function validFantasyVoyageDecisions(character: FantasyCharacter): boolean {
  if (character.voyageDecisions === undefined) return true;
  if (!object(character.voyageDecisions) || Object.keys(character.voyageDecisions).length > FANTASY_VOYAGE_DECISIONS.length || !validFantasyMainTrials(character)) return false;
  return Object.entries(character.voyageDecisions).every(([id, value]) => {
    const decision = FANTASY_VOYAGE_DECISIONS.find(item => item.id === id), quest = FANTASY_MAIN_QUESTS.find(item => item.id === decision?.quest);
    const record = decision && character.mainTrials?.[decision.quest];
    const index = decision ? fantasyMainTrial(decision.quest)!.stages.findIndex(stage => stage.id === decision.stage) : -1;
    return !!decision && !!quest && fantasyQuestRecordEligible(character, quest) && !!record && object(value) && Object.keys(value).length === 2
      && decision.choices.some(choice => choice.id === value.choice) && typeof value.hour === 'number' && Number.isFinite(value.hour)
      && value.hour >= record.acceptedAt && value.hour <= character.hour && index >= 0 && record.proofs.length >= index
      && (index === 0 || value.hour >= record.proofs[index - 1].hour) && (!record.proofs[index] || value.hour <= record.proofs[index].hour);
  });
}
export function fantasyVoyageDecisionError(character: FantasyCharacter, decisionId: string, choiceId: string): string | undefined {
  const decision = FANTASY_VOYAGE_DECISIONS.find(item => item.id === decisionId), option = decision?.choices.find(item => item.id === choiceId);
  if (!decision || !option || !validFantasyVoyageDecisions(character)) return '物語の選択を確認できません。';
  if (character.voyageDecisions?.[decision.id]) return 'その場面ではすでに返事をしています。';
  const stage = fantasyMainStage(character, decision.quest), quest = FANTASY_MAIN_QUESTS.find(item => item.id === decision.quest)!;
  if (!fantasyQuestRecordEligible(character, quest) || stage?.id !== decision.stage || character.location !== stage.location || !validFantasyMainTrials(character)) return 'その物語の場面で選んでください。';
  if (character.gold < option.gold) return 'その返事に必要な金貨が足りません。';
  return undefined;
}
export function fantasyVoyagePendingDecisions(character: FantasyCharacter): FantasyVoyageDecision[] {
  return FANTASY_VOYAGE_DECISIONS.filter(item => !character.voyageDecisions?.[item.id] && item.choices.some(choice => !fantasyVoyageDecisionError(character, item.id, choice.id)));
}
export function fantasyVoyageDecisionMemories(character: FantasyCharacter, locale: NpcLocale) {
  if (!validFantasyVoyageDecisions(character)) return [];
  return FANTASY_VOYAGE_DECISIONS.flatMap(decision => {
    const record = character.voyageDecisions?.[decision.id], choice = decision.choices.find(option => option.id === record?.choice);
    return record && choice ? [{ id: decision.id, quest: decision.quest, choice: choice.id, label: choice.label[locale], text: choice.result[locale], hour: record.hour }] : [];
  });
}
export function fantasyVoyageDecisionLogText(raw: string, character: FantasyCharacter | null | undefined, locale: NpcLocale): string | undefined {
  const match = /^航海の返事［([a-z-]+)］。$/.exec(raw);
  if (!match) return undefined;
  return character ? fantasyVoyageDecisionMemories(character, locale).find(memory => memory.id === match[1])?.text ?? '' : '';
}
export function fantasyVoyageChoiceReply(character: FantasyCharacter, query: string, locale: NpcLocale): string | undefined {
  if (!/(?:내가|내|나의).*(?:선택|약속|대답)|what did i (?:choose|promise|answer)|my (?:choice|promise)|私.*(?:選択|約束|返事)/i.test(query)) return undefined;
  const memories = fantasyVoyageDecisionMemories(character, locale);
  if (!memories.length) return undefined;
  return memories.slice(-2).map(memory => memory.text).join(' ');
}
