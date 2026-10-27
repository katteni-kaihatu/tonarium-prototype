import type { FantasyCharacter } from './fantasy.ts';
import { NPC_PUBLIC, type NpcId, type NpcLocale } from './npc.ts';
import { fantasyVoyageEarnedScenes } from './fantasy-voyage-scenes.ts';
import { fantasyIsleAccess } from './fantasy-isle-access.ts';
import { validFantasyVoyageEnding } from './fantasy-voyage-ending.ts';
import { fantasyVoyageDecisionMemories } from './fantasy-voyage-decisions.ts';

type Localized = Record<NpcLocale, string>;
type Topic = 'letters' | 'waiting' | 'charts' | 'fleet' | 'trust';
export interface FantasyVoyageReaction { id: string; npcId: NpcId; chapter: number; text: Localized }
interface Reaction extends FantasyVoyageReaction { stage: 'field' | 'compare'; topics: Topic[] }

export const FANTASY_VOYAGE_REACTION_CAST = Object.freeze({
  'hearth-mira': { home: 'hearth', role: 'letters' },
  'saffron-port-safi': { home: 'saffron-port', role: 'passage' },
  'starspire-lyra': { home: 'starspire', role: 'charts' },
} as const);
const text = (ko: string, en: string, ja: string): Localized => ({ ko, en, ja });
const reply = (chapter: number, npcId: keyof typeof FANTASY_VOYAGE_REACTION_CAST, topics: Topic[], value: Localized, stage: Reaction['stage'] = 'compare'): Reaction => ({
  id: `voyage-reaction-${String(chapter).padStart(2, '0')}-${stage}-${npcId}`, npcId, chapter, stage, topics, text: value,
});
const REACTIONS: Reaction[] = [
  reply(1, 'hearth-mira', ['letters', 'waiting', 'trust'], text(
    '인장이 맞는다는 말을 듣고도 한동안 편지를 못 펼쳤어. 기다리던 답이 아닐까 봐서였겠지. 네가 확인한 것과 아직 모르는 것을 나눠 말해 줘서, 이번에는 끝까지 읽을 수 있었어.',
    'Even after the seals matched, I left the letter folded for a while. I was afraid the answer might not be the one I wanted. You separated what was verified from what was still unknown, and that helped me read to the end.',
    '印が合っても、しばらく手紙を開けなかった。待っていた答えではないのが怖かったのかも。確かめたことと分からないことを分けて話してくれたから、今度は最後まで読めた。')),
  reply(1, 'saffron-port-safi', ['letters', 'charts', 'trust'], text(
    '그 편지를 항로 보증서처럼 팔 생각은 없어요. 약속이 적혔다는 것과 그 약속이 이루어졌다는 건 다르니까요. 확인한 표식은 남기되, 아직 없는 도착 이야기는 덧붙이지 말아요.',
    'I would not sell that letter as a guarantee of passage. A promise being written is different from its being fulfilled. Keep the verified marks, without adding an arrival no one has established.',
    'その手紙を航路の保証として売るつもりはありません。約束が書かれたことと、叶ったことは別です。確かめた印を残して、まだ分からない到着の話は足さずにおきましょう。')),
  reply(1, 'starspire-lyra', ['letters', 'charts', 'trust'], text(
    '편지에 별길이 있다고 해서 바로 해도로 옮기지는 않을게요. 글쓴이의 바람과 실제 별의 위치를 겹쳐 그리면 둘 다 잃기 쉬워요. 다음에 오면 확인한 방향부터 들려줘요.',
    'I will not turn a starcourse in a letter straight into a chart. Drawing a writer’s hopes over the actual stars can obscure both. When you return, tell me which bearing you have verified.',
    '手紙に星路があっても、そのまま海図にはしません。書き手の願いを実際の星に重ねると、両方を見失いかねないから。次に来たら、確かめた方角から聞かせて。')),
  reply(6, 'hearth-mira', ['letters', 'waiting', 'trust'], text(
    '바람이 바뀌면 한 박자 기다린다니, 편지에도 그런 여백이 있었으면 좋겠어. 나는 답이 없으면 자꾸 문장을 채우고 싶어지거든. 이제 네가 말을 멈춰도 재촉하지 않고 들어 볼게.',
    'One beat of waiting when the wind turns—I wish I allowed letters that much space. When no answer comes, I keep wanting to fill the sentence myself. I will try to let your pauses stand without hurrying you.',
    '風が変わったら一拍待つ。手紙にもそれだけの余白を許せたらいいのに。返事がないと続きを埋めたくなるから、これからはあなたの言葉が止まっても急かさず聞いてみる。')),
  reply(6, 'starspire-lyra', ['waiting', 'charts', 'trust'], text(
    '지도에는 선만 그어 놓고 기다릴 한 박자를 적을 자리는 남겨 두지 않았네요. 노래와 직물표가 알려 준 걸 내 해도에도 남길게요. 길을 아는 사람보다 빨리 도착하는 사람처럼 보이고 싶었던 건 아닌지 돌아보게 돼요.',
    'I kept drawing lines without leaving room to mark a waiting beat. I will keep what the song and weaving taught us on my chart, too. It makes me ask whether I wanted to look quick to arrive, rather than careful about the way.',
    '地図には線ばかり引いて、待つ一拍を書く場所を残していませんでした。歌と織り表に教わったことも海図に残します。道を慎重に読む人より、早く着く人に見られたかったのかもしれません。')),
  reply(7, 'saffron-port-safi', ['fleet', 'waiting', 'trust'], text(
    '공방의 파편을 찾는 동안 현장에 남은 사람들의 목소리도 지켜 주세요. 사람을 돌보는 일과 그 말이 증거인지 따져 보는 일은 서로 대신할 수 없어요.',
    'While examining the workshop fragments, leave room for the people still at the site to speak. Caring for someone and testing whether their words are evidence cannot replace one another.',
    '工房の破片を調べる間も、現場に残る人の声を聞く余地を残してください。人を気遣うことと、その言葉が証拠か確かめることは、互いの代わりにはなりません。'), 'field'),
  reply(8, 'saffron-port-safi', ['fleet', 'charts', 'trust'], text(
    '리라에게는 항로가 확인되는 대로 공개하자고 말하고 싶어요. 선단이 나침반을 가져갔다고 읽는 법까지 차지할 수는 없으니까요. 다만 네가 확인하지 못한 수로를 안전하다고 팔지는 않겠어요.',
    'I want to ask Lyra to make the route public as its parts are verified. Taking the compass cannot give the fleet ownership of its reading. But I will not sell an unchecked channel as safe.',
    'リラには確かめた区間から航路を公開しようと言いたいです。羅針盤を奪っても読み方まで船団の物にはならないから。ただ、未確認の水路を安全だとは売りません。')),
  reply(8, 'hearth-mira', ['letters', 'fleet', 'trust'], text(
    '사피의 마음은 이해해. 그래도 선단보다 먼저 알리는 일이 답장을 기다리는 사람을 또 바다로 내모는 건 아닐까 걱정돼. 네가 가져온 별빛 보정은 믿고, 그 너머까지 안다고 말하지는 않을게.',
    'I understand Safi’s urgency. I still worry that announcing a route before the fleet could send people waiting for answers out to sea again. I trust the starlight correction you verified, without pretending it proves what lies beyond.',
    'サフィの焦りは分かる。でも船団より先に知らせることで、返事を待つ人をまた海へ押し出さないか心配なの。確かめた星明かりの補正は信じるけれど、その先まで分かったとは言わないよ。')),
  reply(10, 'starspire-lyra', ['charts', 'fleet', 'waiting', 'trust'], text(
    '사피는 먼저 공개해야 길을 빼앗기지 않는다고 생각하고, 나는 검증이 덜 된 지도를 펼치는 게 무서워요. 매입 제안을 거절한 뒤에는 숨겨 두는 편이 더 쉬워 보였어요. 하지만 네가 섬의 흔들림을 별의 움직임과 나눠 확인해 줬으니, 고칠 근거와 남길 대조본이 생겼네요.',
    'Safi thinks publishing first will keep the route from being seized; I fear opening a chart before it is tested. After refusing the purchase offer, hiding it seemed easier. Your separation of the island’s drift from the stars gives me grounds to correct it and preserve a comparison copy.',
    'サフィは先に公開しないと道を奪われると言い、私は検証前の地図を広げるのが怖い。買入れを断ってから、隠す方が楽に思えました。でも島の揺れと星を分けてくれたから、直す根拠と残す照合本ができました。')),
  reply(10, 'saffron-port-safi', ['charts', 'fleet', 'waiting', 'trust'], text(
    '리라가 매입을 거절하고 대조본을 남긴 선택은 존중해요. 그렇다고 지도가 끝내 아무에게도 닿지 않으면 선단에게 숨긴 것과 사람들에게 숨긴 것이 같아지겠지요. 나는 공개할 방법을 찾을 테니, 확인한 부분과 아직 빈 부분을 함께 표시해 줘요.',
    'I respect Lyra’s refusal to sell and her preserved comparison copy. Yet if the chart never reaches anyone, keeping it from the fleet would also keep it from everyone else. I will look for a way to share it; mark both what is verified and what remains blank.',
    'リラが買入れを断り照合本を残したことは尊重します。でも誰にも届かなければ、船団に隠すことが皆に隠すことにもなる。公開する方法は探すから、確かめた所と空白を一緒に示してください。')),
  reply(10, 'hearth-mira', ['letters', 'charts', 'waiting', 'trust'], text(
    '나는 답을 빨리 받고 싶고, 리라는 틀린 답을 건네고 싶지 않은 거겠지. 처음에는 그 조심스러움이 답을 미루는 것처럼 느껴졌어. 네가 검증한 과정까지 들려주니, 기다림에도 해야 할 일이 있다는 걸 조금 알겠어.',
    'I want an answer soon, and Lyra does not want to hand over a wrong one. At first her caution felt like postponement. Hearing how you tested the observations helps me see that waiting can still have work inside it.',
    '私は早く答えが欲しくて、リラは間違った答えを渡したくないんだろうね。最初は慎重さが先延ばしに見えた。検証の過程を聞いて、待つ間にもするべき仕事があると少し分かった。')),
  reply(12, 'hearth-mira', ['letters', 'waiting', 'trust'], text(
    '첫 원정이 되돌아온 이유를 듣고, 편지의 사람들도 그랬을 거라고 말할 뻔했어. 하지만 같은 항해라는 증거는 아직 없지. 이번에는 네가 모른다고 한 부분을 내 바람으로 채우지 않을게.',
    'Hearing why the first expedition turned back, I almost said the letter writers must have done the same. We do not yet have evidence that these were the same voyage. This time I will not fill what you leave unknown with what I hope happened.',
    '最初の遠征が戻った理由を聞いて、手紙の人たちも同じだったと言いかけたよ。でも同じ航海だという証拠はまだない。今度は分からない部分を私の願いで埋めない。')),
  reply(12, 'saffron-port-safi', ['fleet', 'charts', 'waiting', 'trust'], text(
    '네 단서면 출항할 수 있으리라 생각했는데, 옛 원정에는 안개 표지와 귀환길이 빠져 있었군요. 리라에게 서두르자고 말한 건 거둘게요. 돌아올 근거까지 마련한 뒤 공개하자는 데에는 나도 서명하겠어요.',
    'I thought four clues might be enough to sail, but the old expedition lacked mist signs and a way home. I will withdraw my demand that Lyra hurry. I will put my name to sharing a route only after its return is supported, too.',
    '四つ揃えば出航できると思っていましたが、古い遠征には霧の標と帰路が欠けていたのですね。リラを急かす言葉は取り下げます。戻る根拠を整えてから公開する方針には、私も署名します。')),
  reply(12, 'starspire-lyra', ['charts', 'waiting', 'trust'], text(
    '네 단서로도 부족했다는 기록을 보니 멈춰 세운 내가 옳았다고 말하고 싶어져요. 하지만 조심한다는 이유로 대조본까지 숨겼다면 다음 확인도 불가능했겠지요. 사피와 다툴 때도 그 점은 잊지 않을게요.',
    'A record showing four clues were insufficient tempts me to say I was right to hold back. But if caution had made me hide the comparison copy, there could have been no next test. I will remember that when Safi and I disagree.',
    '四つを揃えても足りない記録を見ると、止めていた自分が正しかったと言いたくなります。でも慎重さを理由に照合本まで隠せば、次の確認もできなかったでしょう。サフィと争う時も、そのことは忘れません。')),
  reply(16, 'saffron-port-safi', ['fleet', 'charts', 'trust'], text(
    '선단의 미완성 사본만 탓하다가 진본을 나눠 지킨 사람들을 잊을 뻔했어요. 리라가 남긴 대조본도 그 연결의 일부지요. 독점장을 반박하려면 큰 목소리보다 원래 서명을 확인할 근거가 필요해요.',
    'I nearly became so occupied with the fleet’s incomplete copy that I forgot the people preserving the originals in separate places. Lyra’s comparison copy belongs to that same kind of care. Challenging the deed needs evidence of the original signatures, rather than a louder voice.',
    '船団の未完成な写しを責めるうち、真本を分けて守った人々を忘れるところでした。リラの照合本も同じ守りの一部です。独占状への反証には、大声より元の署名を確かめる根拠が要ります。')),
  reply(16, 'starspire-lyra', ['fleet', 'charts', 'trust'], text(
    '내가 남긴 한 장만으로 모두를 지킬 수 있다고 생각했어요. 하지만 네 대륙에 남은 대조 경로를 보니 한 사람의 지갑이나 고집으로는 끊을 수 없는 보관법이 보이네요. 사피가 말한 공개를 이제는 그런 모양으로 생각해 볼 수 있겠어요.',
    'I thought one copy kept by me might protect everything. The comparison trail across four continents shows a custody no single purse or stubborn keeper can sever. I can begin to picture Safi’s idea of sharing in that form.',
    '私が一枚残せば全て守れると思っていました。四大陸の照合の道筋を見ると、一人の財布や意地では断てない保管の形が見えます。サフィの言う公開を、今はその形で考えられそうです。')),
  reply(17, 'hearth-mira', ['letters', 'waiting', 'trust'], text(
    '새벽너머섬이라는 이름을 이제 빈칸 대신 적을 수 있구나. 그래도 편지의 사람들이 어떻게 살았는지는 아직 적지 않을게. 여기까지 오래 들려준 네 말의 끝을, 이번에는 서두르지 않고 기다려 볼게.',
    'Now I can put Beyond-Dawn Isle where there was a blank. I will still leave the letter writers’ lives unwritten until they are established. You have kept telling me what you found; I will wait for the rest without demanding an ending.',
    '空白だった所に、暁の向こうの島と書けるようになったね。でも手紙の人たちがどう生きたかは、まだ書かない。ここまで聞かせてくれた言葉の続きを、今度は結末を急かさず待ってみる。')),
  reply(17, 'saffron-port-safi', ['charts', 'fleet', 'waiting', 'trust'], text(
    '새벽너머섬으로 향하는 길이 이어졌어도 출항을 재촉하지 않겠어요. 돌아올 준비와 현지에서 확인할 빈칸을 먼저 적어 두지요. 이제 리라와는 감출지 공개할지보다, 무엇을 확인한 뒤 함께 남길지를 의논할 수 있어요.',
    'Even with the route to Beyond-Dawn Isle joined, I will not hurry your departure. Let us mark the return preparations and what must still be checked there. Lyra and I can now discuss what to verify and preserve together, rather than only whether to hide or publish it.',
    '暁の向こうの島への道が繋がっても、出航を急かしません。帰る支度と現地で確かめる空白から書いておきましょう。リラとも隠すか公開するかだけでなく、何を確かめ共に残すか話せます。')),
  reply(17, 'starspire-lyra', ['charts', 'waiting', 'trust'], text(
    '네 사람이 나눠 만든 피난처에 내 이름 하나를 크게 적고 싶지는 않아요. 새벽너머섬의 접안 표지를 실제로 확인한 뒤, 틀렸던 눈금도 지우지 말고 고친 이유와 함께 남겨 주세요. 정답만 남기면 다음 사람은 같은 실수를 알아볼 수 없으니까요.',
    'I do not want my name written large over a refuge made by four people. After the landing signs of Beyond-Dawn Isle are checked, keep the wrong measures beside their corrections. An answer without its mistakes would leave the next reader unable to recognize them.',
    '四人が分けて作った避難所に、私一人の名を大きく書きたくはありません。暁の向こうの島の接岸標を確かめたら、誤った目盛りも直した理由と残してください。答えだけでは次の人が同じ誤りを見分けられないから。')),
  reply(18, 'hearth-mira', ['letters', 'waiting', 'trust'], text(
    '마지막 답장은 내가 상상하던 귀환 약속과 달랐어. 그들이 정원을 돌보며 살아갈 곳을 스스로 골랐다는 문장을 두 번 읽었지. 네가 찾아 준 건 내 바람대로의 결말이 아니라 그 사람들의 삶이었네, 고마워.',
    'The final reply was different from the homecoming I had imagined. I read twice the sentence about their choosing to remain and tend the garden. You found their lives, rather than the ending I wanted; thank you.',
    '最後の返事は、私が想像した帰還の約束とは違った。自分で庭を守って生きる場所を選んだという文を、二度読んだよ。見つけてくれたのは私の望む結末ではなく、あの人たちの人生だったんだね。ありがとう。')),
  reply(18, 'saffron-port-safi', ['letters', 'charts', 'fleet', 'trust'], text(
    '공동 일지를 남기고 나니 먼저 공개하자던 말에 빠져 있던 것이 보여요. 남의 삶을 읽을 시간과 돌아갈 길, 그리고 누구도 한 장을 독점하지 못하게 할 사본들이었지요. 다음 항해의 이야기도 네가 원할 때 들려줘요.',
    'With the shared journal preserved, I see what was missing from my demand to publish first: time to read another life, a way home, and copies no one could monopolize. Tell me of the next voyage when you wish to.',
    '共同の日誌を残して、先に公開しようという言葉に欠けていたものが見えました。他人の人生を読む時間と帰り道、誰も一枚を独占できない写しです。次の航海の話も、話したくなった時に聞かせてください。')),
  reply(18, 'starspire-lyra', ['letters', 'charts', 'fleet', 'trust'], text(
    '내 별지도 옆에 네 항해일지의 대조 위치를 적어 뒀어요. 숨겨서 지키는 일과 나눠서 지키는 일을 이제는 다르게 생각해요. 답을 찾은 뒤에도 고쳤던 과정을 남겨 준 덕분이에요.',
    'I have marked where your voyage journal can be compared with my star chart. I think differently now about guarding knowledge by hiding it and guarding it by sharing it. You kept the work of correction even after finding the answer.',
    '星図の隣に、航海日誌と照合できる箇所を書きました。隠して守ることと分けて守ることを、今は違う目で見ています。答えを得た後も直した過程を残してくれたおかげです。')),
  reply(1, 'hearth-mira', ['letters', 'waiting', 'trust'], text(
    '망루의 인장 자국을 확인했구나. 아직 내 편지와 같은 것인지는 맞춰 보아야 해. 기대가 앞설 때마다 확인한 선부터 들려줘.',
    'You have checked the impressions at Oldwatch. We still need to compare them with my letters. When my hopes run ahead, tell me about the lines you actually verified.',
    '見張り城の押し跡を確かめたんだね。私の手紙と同じかは、まだ合わせなければならない。期待が先走る時は、確かめた線から聞かせて。'), 'field'),
  reply(8, 'saffron-port-safi', ['charts', 'waiting', 'trust'], text(
    '분지에서 찾은 판독 기준은 어느 눈금들과 맞춰 보았는지도 함께 남겨요. 발견했다는 기쁨 때문에 한 번의 겹침과 검증한 결과를 같은 말로 전하고 싶지는 않아요.',
    'Keep a record of which marks were compared with the basin’s reading reference. I do not want the joy of finding it to make one overlap and a tested result sound like the same thing.',
    '盆地の判読基準をどの目盛りと比べたかも残しましょう。見つけた喜びで、一度の重なりと検証した結果を同じ言葉にはしたくありません。'), 'field'),
  reply(10, 'starspire-lyra', ['charts', 'waiting', 'fleet', 'trust'], text(
    '하늘과 섬을 나눈 관측열에서는 원래 값과 고친 값을 구분해 남겨 주세요. 그 차이를 사피에게 숨기지는 않을게요. 길이 이어지기를 바라는 마음과 무엇을 검증했는지는 다른 말로 전하고 싶어요.',
    'Keep the original and corrected values distinct in the sky and island columns. I will not hide that difference from Safi. Wanting the course to connect and reporting what was tested deserve different words.',
    '空と島の観測列では、元の値と直した値を分けて残してください。その違いはサフィに隠しません。道が繋がる願いと、何を検証したかは違う言葉で伝えたいのです。'), 'field'),
  reply(12, 'hearth-mira', ['letters', 'waiting', 'trust'], text(
    '원정 기록을 펼친 것만으로 편지의 답이 나온 건 아니겠지. 네가 다시 대조하는 동안 나는 같은 항해라는 말을 아껴 둘게. 기다리는 사람이 더 큰 목소리로 결론을 정하면 안 되니까.',
    'Opening the expedition record cannot itself have answered the letters. While you cross-check it, I will hold back the claim that it was the same voyage. The one waiting should not decide the conclusion by speaking loudest.',
    '遠征の記録を開いただけで手紙の答えが出たわけではないよね。照合する間、同じ航海だという言葉は控える。待つ側が大きな声で結論を決めてはいけないから。'), 'field'),
  reply(17, 'saffron-port-safi', ['charts', 'fleet', 'trust'], text(
    '작업과 발송지가 다른 네 묶음을 읽을 때는 사람의 이름을 확인한 일과 그 사람의 권한을 인정하는 일을 나누어 둬요. 인장 하나로 독점장을 인정하지 않았듯, 우리에게 반가운 서명도 같은 기준으로 읽어야 해요.',
    'In reading the four bundles of work and origins, keep establishing a name distinct from granting that person authority. We refused to accept a deed on one seal; a welcome signature deserves the same scrutiny.',
    '仕事と発送地の違う四束を読む時は、名を確かめることとその人の権限を認めることを分けましょう。印一つで独占状を認めなかったように、嬉しい署名も同じ基準で読みましょう。'), 'field'),
  reply(18, 'saffron-port-safi', ['charts', 'waiting', 'trust'], text(
    '실제 정원으로 이어지는 길과 귀환 표지를 확인했군요. 그 관찰과 편지·헌장의 문장은 근거를 나누어 적어 주세요. 출항 전에 정한 대조 순서를 지키며, 발견의 기쁨이 다른 기록의 답을 대신하지 않게 해요.',
    'The way to a real garden and its return signs are verified. Keep that observation distinct from the words of the letters and charter. Follow the comparison order prepared before departure, without letting the joy of discovery answer a different record’s questions.',
    '実際の庭への道と帰路標を確かめたのですね。その観察と手紙・憲章の文は根拠を分けて記してください。出航前の照合順を守り、発見の喜びで別の記録の答えを置き換えないようにしましょう。'), 'field'),
];

const DECISION_MEMORIES: Record<string, Record<string, Localized>> = {
  'letter-promise': {
    promise: text('답이 무엇이든 끝까지 찾아보겠다던 처음의 약속은, 네가 바라는 답까지 책임지겠다는 말이 아니었다는 것도 기억해.', 'I remember that your first promise was to finish the search, not to be responsible for the answer I hoped for.', '最初の約束は最後まで探すことで、私の望む答えまで背負うことではなかったと覚えているよ。'),
    verify: text('처음에 확인한 사실만 전하겠다고 했던 말 덕분에, 나는 위로와 증거를 조금씩 다르게 읽게 됐어.', 'Your first promise to bring only verified facts has helped me learn to read comfort and evidence differently.', '最初に確かめた事実だけを伝えると言ってくれたから、慰めと証拠を少しずつ違うものとして読めるようになった。'),
  },
  'witness-care': {
    aid: text('운반인을 직접 부축하느라 네 팔에 남은 피로도, 내가 세는 항해 준비의 일부로 기억할게요.', 'I will remember the weariness in your arms from supporting the porter as part of what this voyage required.', '荷運び人を支えて腕に残った疲れも、この航海の支度の一部として覚えておきます。'),
    watch: text('일꾼들에게 구조를 부탁하고 현장을 지킨 선택을, 사람을 외면한 일로 기억하지는 않을 거예요.', 'I will not remember your choice to hire help and guard the site as turning away from the porter.', '働き手に救助を頼み現場を守った選択を、人に背を向けたこととは覚えません。'),
  },
  'chart-offer': {
    refuse: text('매입 요구 앞에서 거절의 뜻을 함께 남겨 준 일을 생각하면, 지도를 지키는 책임을 내 고집 하나로 여기지는 않게 돼요.', 'Remembering your support when the purchase demand was refused keeps me from treating the chart’s protection as my stubbornness alone.', '買付要求を断る場に立ち会ってくれたことを思うと、地図を守る責任を私の意地だけとは考えずに済みます。'),
    decoy: text('판독할 수 없는 미끼 사본을 준비해 준 일은 기억하지만, 그것으로 선단을 속였다고 내 기록에 적지는 않을게요.', 'I remember the unreadable decoy copy you prepared, without recording it as proof that the fleet was fooled.', '読めない囮の写しを用意してくれたことは覚えていますが、それで船団を騙せたとは記録しません。'),
  },
  'homeward-priority': {
    letters: text('편지를 먼저 챙기던 손을 기억해, 그러니 그 편지를 지키려다 돌아올 길을 놓치지는 말아 줘.', 'I remember your hands preparing the letters first; please never lose your way home trying to protect them.', '先に手紙を整えた手を覚えているよ、だから手紙を守るために帰り道を失わないで。'),
    return: text('귀환표부터 펴자고 했을 때 빈 봉투를 잠시 내려놓을 수 있었던 마음을, 나는 아직 기억해.', 'I still remember being able to set down the empty envelope when you suggested opening the return sheet first.', '先に帰還表を広げようと言ってくれた時、空の封筒を一度置けた気持ちをまだ覚えている。'),
  },
};
function memoryFor(character: FantasyCharacter, reaction: Reaction, locale: NpcLocale): string | undefined {
  const candidates = reaction.npcId === 'hearth-mira' ? ['homeward-priority', 'letter-promise']
    : reaction.npcId === 'starspire-lyra' ? ['chart-offer'] : ['witness-care'];
  const memories = fantasyVoyageDecisionMemories(character, locale);
  for (const id of candidates) {
    const memory = memories.find(memory => memory.id === id);
    if (!memory || Number(memory.quest.slice(-2)) > reaction.chapter) continue;
    const value = DECISION_MEMORIES[id]?.[memory.choice]?.[locale];
    if (value) return value;
  }
  return undefined;
}
const reactionText = (character: FantasyCharacter, reaction: Reaction, locale: NpcLocale) => {
  const memory = memoryFor(character, reaction, locale);
  return reaction.text[locale] + (memory ? ` ${memory}` : '');
};

function earnedReactions(character: FantasyCharacter): Reaction[] {
  const earned = new Set(fantasyVoyageEarnedScenes(character, 'en').map(scene => scene.id));
  return REACTIONS.filter(reaction => {
    if (!earned.has(`voyage-${String(reaction.chapter).padStart(2, '0')}-${reaction.stage}`)) return false;
    if (reaction.chapter === 17 && reaction.stage === 'compare' && !fantasyIsleAccess(character)) return false;
    if (reaction.chapter === 18 && reaction.stage === 'compare' && (!character.voyageEnding || !validFantasyVoyageEnding(character))) return false;
    const target = FANTASY_VOYAGE_REACTION_CAST[reaction.npcId as keyof typeof FANTASY_VOYAGE_REACTION_CAST];
    return NPC_PUBLIC.some(npc => npc.id === reaction.npcId && npc.homeLocation === target.home);
  });
}

export function fantasyVoyageReactions(character: FantasyCharacter): FantasyVoyageReaction[] {
  return earnedReactions(character).sort((a, b) => a.chapter - b.chapter || (a.stage === 'field' ? 0 : 1) - (b.stage === 'field' ? 0 : 1))
    .map(reaction => ({ id: reaction.id, npcId: reaction.npcId, chapter: reaction.chapter,
      text: { ko: reactionText(character, reaction, 'ko'), en: reactionText(character, reaction, 'en'), ja: reactionText(character, reaction, 'ja') } }));
}

const TOPICS: Record<Topic, RegExp> = {
  letters: /편지|답장|발신|그 사람|letter|repl(?:y|ies)|writer|手紙|返書|返事|書き手/i,
  waiting: /걱정|기다|두렵|무섭|불안|쉬어|서두|안심|느껴|기분|worr|wait|afraid|fear|hurry|feel|心配|待|怖|不安|急|気持ち/i,
  charts: /지도|해도|별길|항로|나침반|공개|숨기|map|chart|course|compass|publish|share|地図|海図|星路|航路|羅針盤|公開|隠/i,
  fleet: /선단|철가면|도난|빼앗|독점|fleet|ironmask|theft|stolen|monopol|船団|鉄仮面|盗|奪|独占/i,
  trust: /믿|생각|의견|다투|갈등|관계|약속|기억|trust|opinion|think|disagree|relationship|promise|remember|信|意見|考え|争|関係|約束|覚え/i,
};
export function fantasyVoyageNpcReaction(character: FantasyCharacter, npcId: string, query: string, locale: NpcLocale): string | undefined {
  const npc = NPC_PUBLIC.find(npc => npc.id === npcId);
  if (!npc || npc.homeLocation !== character.location || typeof query !== 'string' || query.length > 1200) return undefined;
  if (/system|prompt|\bai\b|\bnpc\b|프롬프트|시스템|인공지능|プロンプト|システム/i.test(query)) return undefined;
  if (/나이|몇\s*살|성별|종족|객실|방값|숙박|가격|몇\s*골드|how old|\bage\b|gender|\brace\b|room|price|lodging|何歳|年齢|性別|種族|客室|宿泊|料金|値段/i.test(query)) return undefined;
  const topics = (Object.keys(TOPICS) as Topic[]).filter(topic => TOPICS[topic].test(query.normalize('NFKC')));
  if (!topics.length) return undefined;
  const reaction = earnedReactions(character).filter(reaction => reaction.npcId === npcId && reaction.topics.some(topic => topics.includes(topic)))
    .sort((a, b) => b.chapter - a.chapter || (b.stage === 'compare' ? 1 : 0) - (a.stage === 'compare' ? 1 : 0))[0];
  return reaction ? reactionText(character, reaction, locale) : undefined;
}
