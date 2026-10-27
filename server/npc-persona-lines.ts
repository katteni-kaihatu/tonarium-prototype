import { NPC_PUBLIC, type NpcLocale } from '../shared/npc.ts';
import { fantasyNpcTone } from '../shared/fantasy-dialogue-voice.ts';
import { npcPreferenceFacts } from '../shared/fantasy-npc-preferences.ts';
import type { PrewrittenTopic, PrewrittenTone } from '../shared/fantasy-dialogue-prewritten-text.ts';

type PersonaTopic = Extract<PrewrittenTopic, 'wellbeing'|'tired'|'worried'|'lonely'|'encouragement'|'values'|'travelAdvice'>;
type Lines = Readonly<Record<NpcLocale,string>>;
const l=(ko:string,en:string,ja:string):Lines=>({ko,en,ja});
const TEXT:Record<PrewrittenTone,Record<PersonaTopic,Lines>>={
  host:{
    wellbeing:l('난 괜찮아, 이렇게 느긋하게 이야기하는 게 좋네.','I’m well; I like having time for an unhurried conversation.','元気だよ、こうしてのんびり話せるのがいいね。'),
    tired:l('그럼 걸음부터 늦춰. 서두를 일도 몸이 버텨 줘야 할 수 있잖아.','Slow your pace, then. Even urgent business needs you well enough to see it through.','それなら、まず歩みを緩めて。急ぐ用事だって、体がもたないと続けられないよ。'),
    worried:l('머릿속에서만 돌리면 걱정이 자꾸 불어나지. 당장 손댈 수 있는 일 하나부터 골라 봐.','Worries grow when you keep circling them alone. Pick one small thing you can actually do next.','頭の中だけで考えると、心配は膨らむものだよ。今できる小さなことから選んでみて。'),
    lonely:l('쓸쓸한 날엔 별것 아닌 이야기도 도움이 되더라. 여기선 거창한 말을 찾지 않아도 돼.','On lonely days, ordinary conversation can help. You don’t have to find anything grand to say here.','寂しい日は、何気ない話でも助けになるよ。ここでは立派な言葉なんて探さなくていい。'),
    encouragement:l('오늘 모든 걸 끝내지 않아도 괜찮아. 무사히 하루를 이어 가는 것도 쉬운 일은 아니니까.','You don’t have to finish everything today. Getting through a day in one piece takes effort too.','今日全部を終えなくても大丈夫。無事に一日をつないでいくのも、簡単じゃないからね。'),
    values:l('난 사람 말을 끝까지 들어 주는 게 중요하다고 생각해. 급히 판단하면 놓치는 게 많거든.','I value hearing people out. A rushed judgment misses too much.','私は、人の話を最後まで聞くことを大切にしているよ。急いで決めつけると、見落とすものが多いから。'),
    travelAdvice:l('먼길이면 먹을 것과 쉴 곳부터 헤아려 봐. 목적지에 닿는 것만큼 무사히 쉬어 가는 것도 중요해.','For a long journey, think through your food and places to rest first. Staying well along the way matters as much as arriving.','遠出なら、食べ物と休める場所から考えてみて。着くことと同じくらい、道中で無理をしないことも大切だよ。'),
  },
  trade:{
    wellbeing:l('잘 지내요, 서두르지 않고 제 속도를 지키려고 해요.','I’m well; I try to keep a steady pace rather than rush.','元気ですよ、慌てず自分の調子を保つようにしています。'),
    tired:l('지쳤을 때는 결정을 잠깐 미뤄도 돼요. 물건도 약속도 서둘러 고르면 후회가 남기 쉬워요.','You can put a decision aside when you’re worn out. Rushing either a purchase or a promise is an easy way to regret it.','疲れたときは、決め事を少し待ってもいいんですよ。品物も約束も、焦って選ぶと後悔が残りやすいですから。'),
    worried:l('무엇을 잃을까 두려운지부터 나눠 생각해 보세요. 막연한 걱정보다는 확인할 수 있는 조건이 다루기 쉬워요.','Separate out what you’re afraid of losing. Conditions you can check are easier to handle than a worry without edges.','何を失うのが怖いのか、分けて考えてみてください。漠然とした心配より、確かめられる条件のほうが扱いやすいですよ。'),
    lonely:l('거래 이야기 없이 말을 나눠도 괜찮아요. 사람을 만나는 일이 늘 셈으로 끝날 필요는 없죠.','We can talk without making a deal. Meeting someone doesn’t always need to end in a reckoning.','商売の話抜きでお話ししても大丈夫ですよ。人との出会いが、いつも勘定で終わる必要はありませんから。'),
    encouragement:l('남의 속도에 맞추느라 손해 볼 필요는 없어요. 본인이 납득할 수 있는 한 걸음이면 충분해요.','You don’t need to lose out just to match somebody else’s pace. One step you can stand behind is enough.','誰かの速さに合わせて、損をすることはありません。自分で納得できる一歩なら、それで十分ですよ。'),
    values:l('저는 서로 알아들은 약속을 중요하게 여겨요. 말이 그럴듯한 것보다 조건이 분명한 편이 좋아요.','I value an agreement both sides understand. Clear terms matter more to me than impressive words.','お互いに理解した約束を大切にしています。立派な言葉より、条件がはっきりしているほうがいいですね。'),
    travelAdvice:l('여비는 도착할 때 쓸 몫까지 남겨 두세요. 낯선 곳에서는 싼 물건보다 확실한 약속이 더 도움이 될 때도 있어요.','Keep some money for after you arrive. In an unfamiliar place, a clear agreement can be worth more than a cheap purchase.','着いてから使う旅費も残しておいてください。知らない土地では、安い品物より確かな約束が役立つこともありますよ。'),
  },
  forge:{
    wellbeing:l('괜찮네, 쓸데없이 서두르진 않으려 하지.','Well enough; I see no point in hurrying without cause.','悪くない、むやみに急ぐつもりはないさ。'),
    tired:l('지친 손으로 힘을 더 줘 봐야 실수만 늘지. 손에서 힘을 풀고 쉬어.','Putting more force through tired hands only invites mistakes. Loosen your grip and rest.','疲れた手に余計な力を入れても、失敗が増えるだけだ。力を抜いて休め。'),
    worried:l('걱정도 한꺼번에 두드리면 모양을 망치지. 손댈 수 있는 데부터 하나씩 고쳐.','Hammer at every worry at once and you’ll ruin the shape of it. Work on what you can actually mend, one piece at a time.','心配事も、まとめて叩けば形を崩す。直せるところから、一つずつ手をつけろ。'),
    lonely:l('억지로 말재주를 부릴 필요는 없네. 말없이 곁에 있는 것도 나쁜 건 아니지.','No need to force a clever conversation. Quiet company can be worth having too.','無理に気の利いた話をしなくてもいい。黙って一緒にいるのも、悪くない。'),
    encouragement:l('처음부터 잘 벼려진 날은 없네. 어긋난 곳을 알고 다시 손보면 돼.','No edge starts out well forged. Find where it went wrong, then work it again.','初めからよく鍛えられた刃などない。曲がったところを見つけて、また手を入れればいい。'),
    values:l('겉만 번듯한 것보다 제대로 버티는 걸 믿네. 일도 말도 속이 단단해야 하지.','I trust something that holds up, not just something polished. Work and words both need substance.','見栄えだけより、ちゃんと持ちこたえるものを信じる。仕事も言葉も、中身がしっかりしていないとな。'),
    travelAdvice:l('떠나기 전에 도구와 장비부터 손봐. 길 위에서 고장 난 뒤에는 같은 수고도 훨씬 커지네.','Check your tools and equipment before leaving. The same repair costs much more effort once you’re on the road.','出る前に、道具と装備を見ておけ。道中で壊れてからでは、同じ修理でも手間が違う。'),
  },
  scholar:{
    wellbeing:l('괜찮아요, 차분히 생각할 틈이 있으면 마음이 놓여요.','I’m well; a little room to think quietly helps me settle.','元気です、静かに考える余裕があると落ち着きますね。'),
    tired:l('집중이 흐려졌다면 잠깐 멈추는 편이 좋아요. 여러 번 읽었다고 제대로 이해한 건 아닐 수도 있으니까요.','If your attention is fading, pause for a while. Reading something repeatedly doesn’t always mean you’ve understood it.','集中できなくなったら、少し休んだほうがいいですよ。何度読んでも、理解できているとは限りませんから。'),
    worried:l('확인된 사실과 아직 짐작뿐인 일을 나눠 보세요. 모르는 부분을 아는 것처럼 채우면 걱정도 커지기 쉬워요.','Separate established facts from what you’re only guessing. Filling the gaps as though you know them can make the worry grow.','確かめたことと、まだ推測にすぎないことを分けてみてください。分からない部分を決めつけると、心配も大きくなりますよ。'),
    lonely:l('말을 길게 잘해야 하는 건 아니에요. 짧은 생각 하나라도 차분히 나눌 수 있죠.','You don’t need to speak at length or speak brilliantly. Even a small thought can be worth sharing calmly.','長く上手に話さなくてもいいんです。小さな考え一つでも、落ち着いて分かち合えますよ。'),
    encouragement:l('아직 답을 못 찾았다는 건 틀렸다는 뜻이 아니에요. 오늘 알아낸 것과 남은 의문을 나눠 보면 다음 걸음이 보일 거예요.','Not having the answer yet doesn’t mean you were wrong. Separate what you learned from what remains uncertain, and the next step may be clearer.','まだ答えが出ないからといって、間違っているとは限りません。分かったことと残った疑問を分けると、次の一歩が見えますよ。'),
    values:l('저는 아는 것과 모르는 것을 구분하려고 해요. 근거가 부족한데 그럴듯하게 말하는 건 경계하고요.','I try to distinguish what I know from what I don’t. A convincing explanation without evidence makes me cautious.','知っていることと、知らないことを分けるようにしています。根拠の乏しい、もっともらしい説明には慎重になりますね。'),
    travelAdvice:l('지도와 기록은 언제의 것인지도 살펴보세요. 확인하지 못한 길은 익숙한 이름이 붙어 있어도 신중히 고르는 게 좋아요.','Check when a map or account was made. An unverified route deserves care even when its name sounds familiar.','地図や記録が、いつのものかも確かめてください。聞き覚えのある名でも、未確認の道は慎重に選んだほうがいいですよ。'),
  },
  priest:{
    wellbeing:l('저는 평온해요, 마음을 급히 몰아붙이지 않으려 해요.','I’m at peace; I try not to drive my thoughts too hard.','穏やかに過ごしています、心を追い立てないようにしていますよ。'),
    tired:l('힘들다는 몸의 말을 무시하지 마세요. 쉬어 가는 일을 부끄러워하실 필요는 없어요.','Please don’t ignore your body telling you it’s struggling. There’s no shame in stopping to rest.','つらいという体の声を、無視しないでくださいね。休むことを恥じる必要はありませんよ。'),
    worried:l('두려운 마음을 억지로 없애려 하지 않으셔도 돼요. 잠깐 숨을 고르고, 감당할 수 있는 일부터 살펴보세요.','You don’t have to force fear away. Take a breath, then consider what you can bear to face first.','怖い気持ちを、無理に消そうとしなくてもいいんです。ひと息ついて、向き合えることから見ていきましょう。'),
    lonely:l('외롭다는 마음에도 귀를 기울여 주세요. 누군가에게 말을 건네고 싶다는 바람을 감출 필요는 없어요.','Give that loneliness a little care too. You don’t need to hide the wish to speak with someone.','寂しいという気持ちにも、目を向けてあげてください。誰かと話したい願いを、隠さなくてもいいんですよ。'),
    encouragement:l('지금의 어려움만으로 자신을 재단하지 마세요. 힘이 모자란 날에도 당신의 걸음은 남아요.','Please don’t judge yourself only by this difficulty. Your steps still matter on days when your strength runs short.','今の苦しさだけで、ご自身を決めつけないでください。力の足りない日にも、その歩みは残りますよ。'),
    values:l('저는 괴로움을 가볍게 여기지 않으려 해요. 답을 서둘러 내놓기보다 먼저 귀를 기울이고 싶어요.','I try not to dismiss suffering. I’d rather listen first than hurry to offer an answer.','苦しみを軽く扱わないようにしています。答えを急ぐより、まず耳を傾けたいですね。'),
    travelAdvice:l('몸을 돌보는 준비도 여행의 일부예요. 무리한 걸음을 이어 가기보다 쉬어 갈 여유를 남겨 두세요.','Caring for your body is part of preparing to travel. Leave room to rest instead of pushing every step.','体をいたわる支度も、旅の準備の一つですよ。無理を重ねるより、休める余裕を残してくださいね。'),
  },
  leader:{
    wellbeing:l('잘 지내네, 무리하지 않고 판단할 여유를 지키려 하지.','I’m well; I try to preserve the clear head that sound judgment needs.','元気だ、無理をせず判断する余裕を保つようにしている。'),
    tired:l('지쳤으면 강행부터 멈추게. 자신이 버틸 수 있는지 아는 것도 판단의 일부네.','If you’re exhausted, stop forcing the pace. Knowing what you can withstand is part of good judgment.','疲れ切っているなら、強行はやめたまえ。自分がどこまでもつか知るのも、判断のうちだ。'),
    worried:l('우려가 여러 개라면 가장 큰 위험부터 가려 보게. 전부 한꺼번에 해결하겠다는 계획은 오래 버티기 어렵네.','If there are several concerns, identify the greatest risk first. A plan to settle everything at once is seldom a durable one.','懸念が幾つもあるなら、大きな危険から見定めたまえ。一度に全て解決する計画は、長続きしにくい。'),
    lonely:l('혼자서 버텨야만 강한 건 아니네. 다른 사람과 말을 나누는 것도 자신을 지키는 방법이지.','Strength doesn’t require enduring everything alone. Speaking with someone else is another way to look after yourself.','一人で耐えるだけが強さではない。誰かと言葉を交わすのも、自分を守る方法だ。'),
    encouragement:l('결과 하나로 자네의 전부를 정하지 말게. 준비를 살피고 다시 움직일 수 있으면 아직 끝난 게 아니네.','Don’t let one result define the whole of you. If you can review your preparation and move again, it isn’t over.','一度の結果で、自分の全てを決めないことだ。準備を見直してまた動けるなら、まだ終わりではない。'),
    values:l('난 감당할 수 있는 약속을 중요하게 보네. 누군가의 무리를 당연하게 여기는 계획은 믿기 어렵지.','I value promises that can actually be kept. A plan that takes someone’s overexertion for granted earns little trust from me.','果たせる約束を重んじる。誰かの無理を当てにする計画は、信用しにくいものだ。'),
    travelAdvice:l('출발하기 전에 돌아오거나 멈출 길도 생각해 두게. 앞으로 가는 계획만으로는 부족할 때가 있네.','Before you leave, think about how you could stop or turn back. A plan only for moving forward can fall short.','出発前に、引き返す道や足を止める場所も考えておくことだ。進むためだけの計画では、足りないこともある。'),
  },
  covert:{
    wellbeing:l('괜찮아, 조급하게 굴 이유는 없으니까.','Fine; I see no reason to be hurried into anything.','悪くない、急かされて動く理由もないからね。'),
    tired:l('지친 걸 의지만으로 덮으려 하지 마. 눈이 흐릴 때는 놓치는 것도 많아.','Don’t try to cover exhaustion with willpower. You miss too much when your attention blurs.','疲れを気力で覆い隠そうとするな。注意が鈍れば、見落とすものも増える。'),
    worried:l('모르는 일을 최악이라고 단정하진 마. 먼저 사실인지부터 확인해.','Don’t decide the unknown must be the worst. Find out what’s true before you act on it.','分からないことを、最悪だと決めつけるな。まず本当かどうか確かめることだ。'),
    lonely:l('말하고 싶은 마음까지 숨길 필요는 없어. 다만 털어놓을 만큼 믿을 상대인지는 천천히 봐.','You don’t have to hide wanting to talk. Just take your time deciding whom to trust with what you say.','話したい気持ちまで隠す必要はない。何を誰に話すかは、ゆっくり見極めればいい。'),
    encouragement:l('큰소리로 자신을 증명할 필요 없어. 다음에 뭘 할지 분명히 아는 편이 더 낫지.','You don’t need a loud declaration to prove yourself. Knowing your next move is worth more.','大きな声で自分を証明することはない。次に何をするか、はっきりしているほうがいい。'),
    values:l('말보다 그 말이 어디까지 책임지는지 봐. 지킬 수 없는 약속은 처음부터 하지 않는 편이 낫지.','I look past the words to what someone will stand behind. Better not to make a promise you can’t keep.','言葉より、どこまで責任を持つかを見る。守れない約束なら、初めからしないほうがいい。'),
    travelAdvice:l('낯선 길에서는 아는 척하며 서두르지 마. 사람 말도 길도 확인할 만큼만 믿어.','On an unfamiliar road, don’t hurry as though you know it. Trust a route or a story only as far as you can verify it.','知らない道で、知ったふりをして急ぐな。道も人の話も、確かめた分だけ信用することだ。'),
  },
  neighbour:{
    wellbeing:l('난 무난하게 지내, 작은 즐거움이 있으면 좋더라.','I’m doing all right; small pleasures make a difference.','まあまあ元気だよ、小さな楽しみがあるといいね。'),
    tired:l('오늘 못 끝낸 일이 있다고 몸까지 몰아붙이진 마. 내일 할 몫을 남겨 둬도 괜찮아.','Don’t drive yourself into the ground over unfinished work today. It’s all right to leave something for tomorrow.','今日終わらない仕事があっても、体を追い込まないで。明日に残すものがあっても大丈夫だよ。'),
    worried:l('걱정하는 일 전부가 오늘 벌어지는 건 아니잖아. 우선 눈앞의 일 하나부터 챙겨 봐.','Not everything you’re worrying about is happening today. Start by taking care of one thing in front of you.','心配していることが、全部今日起きるわけじゃないよ。まず目の前のことを一つ、片づけてみて。'),
    lonely:l('나눌 이야기가 대단할 필요는 없어. 날씨나 좋아하는 것 얘기로 시작해도 되잖아.','The conversation doesn’t have to be remarkable. Weather or something you like is a perfectly good start.','大した話じゃなくていいんだよ。天気でも、好きなものの話でも、そこから始めればいい。'),
    encouragement:l('남들이 보기엔 작아도 네가 해낸 건 사라지지 않아. 다음 한 가지를 할 힘부터 아껴 둬.','What you’ve managed doesn’t disappear because others think it small. Save some strength for the next thing.','誰かには小さく見えても、自分ができたことは消えないよ。次の一つに使う力を残しておこう。'),
    values:l('난 매일 마주칠 사람을 함부로 대하지 않으려고 해. 작은 배려가 오래 남을 때도 있거든.','I try to treat the people I meet every day with care. Small kindnesses can stay with someone.','毎日顔を合わせる人を、ぞんざいに扱いたくはないな。小さな気遣いが、長く残ることもあるからね。'),
    travelAdvice:l('일정에 빈틈을 조금 남겨 둬. 길을 헤매거나 쉬어 갈 일이 생겨도 덜 조급할 거야.','Leave a little slack in your plans. You’ll feel less rushed if you need to rest or find your way again.','予定は少し余裕を持たせておいて。道に迷ったり休んだりしても、慌てずにすむからね。'),
  },
};

export const NPC_PERSONA_DIALOGUE:Readonly<typeof TEXT>=TEXT;
export const NPC_PERSONA_TOPICS:readonly PersonaTopic[]=Object.freeze(['wellbeing','tired','worried','lonely','encouragement','values','travelAdvice']);

export function npcPersonaReply(npcId:string,locale:NpcLocale,topic:PrewrittenTopic):string|undefined{
  if(!NPC_PUBLIC.some(npc=>npc.id===npcId)||!['ko','en','ja'].includes(locale))return undefined;
  const line=TEXT[fantasyNpcTone(npcId)][topic as PersonaTopic]?.[locale];
  if(!line)return undefined;
  return topic==='wellbeing' ? line+(locale==='ja'?'':' ')+npcPreferenceFacts(npcId,locale)[1] : line;
}
