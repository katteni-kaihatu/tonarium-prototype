import { NPC_PUBLIC, type NpcLocale, type NpcRelationship } from '../shared/npc.ts';
import type { FantasyCharacter } from '../shared/fantasy.ts';
import type { FantasyTerm } from '../shared/fantasy-lore.ts';
import { fantasyNpcTone } from '../shared/fantasy-dialogue-voice.ts';
import { FANTASY_COMPANIONS, fantasyCompanyCapacity, fantasySpellCapacity, type FantasyCompanyKind } from '../shared/fantasy-specializations.ts';
import type { PrewrittenTone } from '../shared/fantasy-dialogue-prewritten-text.ts';

const polite = (id: string) => ['trade', 'scholar', 'priest'].includes(fantasyNpcTone(id));
const final = (text: string) => {
  const code = text.trim().codePointAt(text.trim().length - 1) ?? 0;
  return code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 : 0;
};
const topic = (text: string) => final(text) ? '은' : '는';
const copula = (text: string, formal: boolean) => formal ? final(text) ? '이에요' : '예요' : final(text) ? '이야' : '야';
const say = (locale: NpcLocale, ko: string, en: string, ja: string) => ({ko,en,ja})[locale];
type RelationshipLine=Readonly<Record<NpcLocale,string>>;
const rel=(ko:string,en:string,ja:string):RelationshipLine=>({ko,en,ja});
const RELATIONSHIPS:Record<PrewrittenTone,Record<NpcRelationship,RelationshipLine>>={
  host:{
    stranger:rel('아직은 서로 알아가는 손님과 주인 사이지. 처음부터 편해야 한다고 애쓸 건 없어.','We’re still getting to know each other as guest and host. There’s no need to force familiarity.','まだ、お客さんと主人として知り合っている途中だね。初めから親しくしようと頑張らなくていいよ。'),
    familiar:rel('이젠 말 붙이기 낯선 손님은 아니지. 격식 차리지 않아도 편한 사이가 되어 가는 것 같아.','You’re no longer a stranger to talk to. I think we’re getting comfortable without so much formality.','もう、声をかけるのに戸惑うお客さんじゃないね。気取らず話せる間柄になってきた気がするよ。'),
    trusted:rel('내게는 마음 놓고 이야기를 나눌 수 있는 사람이야. 말이 짧은 날에도 억지로 설명할 필요는 없어.','You’re someone I feel at ease talking with. Even on a quiet day, you don’t have to explain everything.','安心して話せる相手だと思っているよ。言葉の少ない日まで、無理に説明しなくても大丈夫。'),
  },
  trade:{
    stranger:rel('아직은 서로 어떤 사람인지 살펴보는 사이예요. 친한 척 서두르기보다는 천천히 알아가고 싶어요.','We’re still learning what to make of each other. I’d rather take our time than rush into familiarity.','まだ、お互いがどんな人か見ているところですね。親しいふりを急ぐより、ゆっくり知りたいです。'),
    familiar:rel('이제는 어떤 식으로 말씀하시는지 조금 알 것 같아요. 서로 말뜻을 맞춰 가는 사이죠.','I’m getting a feel for how you speak now. We’re learning to understand each other clearly.','どういうふうに話す方か、少し分かってきました。お互いの言葉を合わせているところですね。'),
    trusted:rel('당신의 말은 진지하게 받아들이는 편이에요. 그렇다고 중요한 약속까지 대충 넘기는 사이는 아니고요.','I take what you say seriously. That doesn’t mean we should be careless about important agreements.','あなたの言葉は、きちんと受け止めていますよ。だからこそ、大切な約束まで曖昧にするつもりはありません。'),
  },
  forge:{
    stranger:rel('아직 자네를 잘 안다고는 못 하겠네. 사람을 첫인상만으로 재단하진 않지.','Can’t say I know you well yet. I don’t judge a person by the first impression alone.','まだ、よく知っているとは言えんな。人を第一印象だけで決めつけはしない。'),
    familiar:rel('낯선 사람 취급할 사이는 지났네. 그래도 사람을 알아가는 데는 시간이 걸리지.','We’re past treating each other as strangers. Knowing a person still takes time.','他人行儀にする間柄ではなくなったな。それでも、人を知るには時間がかかる。'),
    trusted:rel('이제 자네 말은 허투루 듣지 않네. 믿는다는 말을 가볍게 쓰는 편은 아니야.','I don’t brush your words aside now. Trust isn’t a word I use lightly.','今では、あんたの言葉を聞き流しはしない。信用という言葉を、軽く使うつもりはないからな。'),
  },
  scholar:{
    stranger:rel('아직 서로 모르는 부분이 많아요. 몇 마디로 어떤 분인지 결론짓고 싶지는 않아요.','There’s still a great deal we don’t know about each other. I wouldn’t want to draw a conclusion from a few words.','まだ、お互いに知らないことが多いですね。わずかな言葉で、どんな方か決めつけたくはありません。'),
    familiar:rel('어떤 생각을 하시는지 조금씩 이해하고 있어요. 아직 모르는 부분을 알아 가는 것도 대화의 즐거움이죠.','I’m beginning to understand how you think. Discovering what I don’t yet know is part of the pleasure of talking.','どんなことを考える方か、少しずつ分かってきました。知らない部分を知るのも、会話の楽しみですね。'),
    trusted:rel('당신이 하는 말은 시간을 들여 살펴보고 싶어요. 의견이 달라도 차분히 이야기할 수 있는 사이라고 생각해요.','Your thoughts are worth taking time over. I think we can talk calmly even when we disagree.','あなたの考えには、時間をかけて向き合いたいです。意見が違っても、落ち着いて話せる間柄だと思います。'),
  },
  priest:{
    stranger:rel('아직 가까운 사이라고 하기는 이르겠죠. 그래도 이야기에 귀 기울이는 데 친분이 먼저일 필요는 없어요.','It may be too soon to call us close. But listening to someone need not wait for friendship.','親しい間柄というには、まだ早いかもしれませんね。でも、耳を傾けるのに親しさが先である必要はありませんよ。'),
    familiar:rel('이제는 당신의 말에 조금 더 귀가 머무는 것 같아요. 서둘러 가까워지기보다 편안한 사이면 좋겠어요.','I find myself listening a little more closely now. I’d rather we felt comfortable than rushed to become close.','今は、あなたの言葉に少し長く耳が留まる気がします。急いで親しくなるより、心安い間柄でありたいですね。'),
    trusted:rel('당신의 마음을 함부로 판단하지 않고 마주하고 싶어요. 그런 믿음을 지켜 가는 사이라고 생각해요.','I want to meet your thoughts without judging them carelessly. I think we’re building the kind of trust that takes care.','あなたの心を、軽々しく決めつけずに受け止めたいです。そういう信頼を、大切にしていく間柄だと思います。'),
  },
  leader:{
    stranger:rel('아직 자네를 다 안다고 할 단계는 아니네. 성급하게 믿거나 의심하기보다는 지켜보려 하지.','I’m not at the point of saying I know you well. I’d rather observe than rush into trust or suspicion.','まだ、君をよく知っているとは言えない。信用も疑いも急がず、見ていくつもりだ。'),
    familiar:rel('서로 말을 건네기 불편한 사이는 아니네. 자네의 판단을 조금씩 이해해 가는 중이지.','We’re comfortable enough to speak openly. I’m gradually getting a sense of your judgment.','気兼ねなく声をかける間柄にはなったな。君の考え方も、少しずつ分かってきたところだ。'),
    trusted:rel('자네 말은 판단할 때 무게를 두고 듣네. 신뢰한다고 해서 서로의 무리까지 당연하게 여기진 않겠어.','Your words carry weight with me. Trust doesn’t mean taking each other’s endurance for granted.','君の言葉には、判断するうえで重みを置いている。信頼しているからといって、無理を当然とは思わない。'),
  },
  covert:{
    stranger:rel('아직은 거리를 가늠하는 사이지. 서로를 잘 아는 척할 생각은 없어.','We’re still working out the distance between us. I won’t pretend we know each other well.','まだ、間合いを測っているところだね。よく知る仲のふりをする気はない。'),
    familiar:rel('이제 완전히 낯선 얼굴은 아니야. 그렇다고 말 한마디까지 함부로 믿는다는 뜻은 아니고.','You’re no longer a complete stranger. That doesn’t mean I take every word on faith.','もう、全く知らない顔ではない。だからといって、一言ずつ何でも信じるわけじゃないけどね。'),
    trusted:rel('네 말은 대충 흘려듣지 않아. 내 식으로는 그게 꽤 가까운 사이라는 뜻이야.','I don’t let your words pass without thought. In my terms, that’s a fair measure of closeness.','君の言葉は、聞き流したりしない。私の言い方なら、それは随分近い間柄だよ。'),
  },
  neighbour:{
    stranger:rel('아직은 서로 알아가는 중이지. 오래 안 사이인 것처럼 굴 필요는 없잖아.','We’re still getting acquainted. No need to act as though we’ve known each other for years.','まだ、知り合っている途中だね。昔からの仲みたいに振る舞う必要はないよ。'),
    familiar:rel('이젠 마주치면 말 한마디 건네기 편한 사람이야. 그렇게 조금씩 가까워지는 거겠지.','You’re someone I can comfortably exchange a few words with now. I suppose that’s how people grow familiar.','今は、会えばひと言話しかけやすい相手だよ。そうやって少しずつ、近くなるんだろうね。'),
    trusted:rel('이제는 편하게 생각을 나눌 수 있는 사이 같아. 꼭 특별한 용건이 있어야 이야기하는 건 아니잖아.','I think we can share our thoughts comfortably now. We don’t need a special reason just to talk.','今は、気楽に考えを分け合える仲だと思うよ。話すのに、特別な用事が必要なわけじゃないからね。'),
  },
};

export function npcRelationshipSpeech(npcId:string,relationship:NpcRelationship,locale:NpcLocale,hasMetSpeaker?:boolean):string|undefined{
  const npc=NPC_PUBLIC.find(person=>person.id===npcId);
  if(!npc||!['ko','en','ja'].includes(locale)||!['stranger','familiar','trusted'].includes(relationship))return undefined;
  const tone=fantasyNpcTone(npcId);
  if(relationship==='stranger'&&hasMetSpeaker===false)return say(locale,
    {host:'이제 막 이야기를 시작한 손님과 주인 사이지. 편안해지는 건 천천히 해도 돼.',trade:'이제 막 인사를 나눈 사이예요. 서둘러 서로를 판단하지는 않았으면 해요.',forge:'이제 막 말을 섞은 사이지. 사람을 알아보는 데는 시간이 필요하네.',scholar:'이제 막 이야기를 시작했으니 아직은 모르는 부분이 더 많겠죠. 인상만으로 결론짓지 않을게요.',priest:'이제 막 만났지만 이야기를 들어 드릴 수는 있어요. 친분부터 서둘러 만들 필요는 없겠죠.',leader:'이제 막 자네를 알아보기 시작했네. 첫인상만으로 판단하지는 않겠어.',covert:'이제 막 말을 튼 사이야. 안다고 할 만큼 아는 건 아직 없어.',neighbour:'이제 막 이야기를 나누기 시작했잖아. 서로 천천히 알아 가면 되지.'}[tone],
    {host:'We’ve only just begun talking as guest and host. Feeling at home can come slowly.',trade:'We’ve only just introduced ourselves. I’d rather not rush to judge each other.',forge:'We’ve only just exchanged words. Knowing a person takes time.',scholar:'We’ve only just begun talking, so there is far more we don’t know. I won’t conclude too much from an impression.',priest:'We’ve only just met, but I can still listen. There’s no need to hurry friendship.',leader:'I’ve only begun getting to know you. I won’t judge by a first impression alone.',covert:'We’ve only just started talking. That’s not enough for me to say I know you.',neighbour:'We’ve only just begun talking. Getting acquainted can take its time.'}[tone],
    {host:'話し始めたばかりのお客さんと主人だね。くつろげるようになるのは、ゆっくりでいいよ。',trade:'まだ、挨拶を交わしたばかりですね。お互いを判断するのは、急がずにいたいです。',forge:'言葉を交わしたばかりだな。人を知るには、時間がいる。',scholar:'話し始めたばかりですから、知らないことのほうが多いですね。印象だけで結論づけたりはしません。',priest:'会ったばかりでも、お話を聞くことはできますよ。親しくなるのを急がなくてもいいでしょう。',leader:'君を知り始めたところだ。第一印象だけで判断はしない。',covert:'話し始めたばかりだね。知っていると言えるほどは、まだ知らない。',neighbour:'話し始めたばかりだもの。ゆっくり知り合っていけばいいよ。'}[tone]);
  return RELATIONSHIPS[tone][relationship][locale];
}
const koEndings: [RegExp,string,string][] = [
  [/하지 않는다$/u,'하지 않아요','하지 않아'], [/단정하지 않는다$/u,'단정하지 않아요','단정하지 않아'],
  [/중시한다$/u,'중시해요','중시해'], [/확인한다$/u,'확인해요','확인해'], [/구분한다$/u,'구분해요','구분해'],
  [/기록한다$/u,'기록해요','기록해'], [/조심한다$/u,'조심해요','조심해'], [/시험한다$/u,'시험해요','시험해'],
  [/거절한다$/u,'거절해요','거절해'], [/준비한다$/u,'준비해요','준비해'], [/점검한다$/u,'점검해요','점검해'],
  [/싫어한다$/u,'싫어해요','싫어해'], [/자랑스러워한다$/u,'자랑스러워해요','자랑스러워해'],
  [/마쳤습니다$/u,'마쳤어요','마쳤어'], [/시작됐습니다$/u,'시작됐어요','시작됐어'], [/끝났습니다$/u,'끝났어요','끝났어'],
  [/있습니다$/u,'있어요','있어'], [/없습니다$/u,'없어요','없어'], [/합니다$/u,'해요','해'], [/했다$/u,'했어요','했어'], [/됐다$/u,'됐어요','됐어'],
  [/있다$/u,'있어요','있어'], [/없다$/u,'없어요','없어'], [/한다$/u,'해요','해'], [/된다$/u,'돼요','돼'],
  [/준다$/u,'줘요','줘'], [/듣는다$/u,'들어요','들어'], [/살핀다$/u,'살펴요','살펴'], [/여긴다$/u,'여겨요','여겨'],
  [/둔다$/u,'둬요','둬'], [/고른다$/u,'골라요','골라'], [/건넨다$/u,'건네요','건네'], [/적는다$/u,'적어요','적어'],
  [/섞는다$/u,'섞어요','섞어'], [/싫다$/u,'싫어요','싫어'], [/신중하다$/u,'신중해요','신중해'], [/편이다$/u,'편이에요','편이야'],
  [/쓴다$/u,'써요','써'], [/쓰인다$/u,'쓰여요','쓰여'], [/돕는다$/u,'도와요','도와'], [/올린다$/u,'올려요','올려'], [/낮춘다$/u,'낮춰요','낮춰'],
];

function koreanSentence(source: string, formal: boolean, noun = false): string {
  const ending = /[.!?。！？]$/u.test(source) ? source.slice(-1) : '.';
  const body = source.replace(/[.!?。！？]+$/u,'').trim();
  for (const [pattern, yes, no] of koEndings) if (pattern.test(body)) return body.replace(pattern,formal ? yes : no) + ending;
  if (noun && !/(?:요|어|네|지|군|는다|하다|이다|되다|있다|없다)$/u.test(body)) return body + copula(body,formal) + ending;
  return body + ending;
}

export function npcInformationSpeech(npcId: string, locale: NpcLocale, text: string): string {
  const formal = polite(npcId);
  if (locale === 'ko') {
    const progress = text.match(/^이 지역의 공동 준비 기록: (.+)\.$/u);
    if (progress) return progress[1].split('; ').map(entry => {
      const row = entry.match(/^(.+) (\d+)\/(\d+), (\d+)$/u);
      return row ? `${row[1]}${topic(row[1])} ${row[3]}번 도울 일 가운데 ${row[2]}번을 ${formal ? '마쳤어요' : '마쳤어'}. 지금까지 마무리한 건 ${row[4]}${formal ? '차례예요' : '차례야'}.` : entry;
    }).join(' ');
    const legacy = text.match(/^이곳의 옛 여행자 기록: (.+), (.*?)\. 생전에 이 지역을 방문했고 (\d+)개의 의뢰를 마쳤다\. 이 인물은 이미 삶을 마쳤으며 기록은 남아 있다\.$/u);
    if (legacy) return `${legacy[1]}${topic(legacy[1])} ${legacy[2] ? `${legacy[2]}${final(legacy[2]) && final(legacy[2]) !== 8 ? '으로' : '로'} 일하며 ` : ''}이곳에도 ${formal ? '들렀어요' : '들렀어'}. 살아 있을 때 의뢰를 ${legacy[3]}개 ${formal ? '마쳤대요' : '마쳤대'}. 지금은 세상을 떠났지만 그 발자취는 ${formal ? '남아 있어요' : '남아 있어'}.`;
    const plain = text.replace(/^이 지역에는 아직 공동 준비 기여 기록이 없습니다\.$/u, formal ? '아직은 이 마을의 공동 준비를 도운 사람이 없어요.' : '아직은 이 마을의 공동 준비를 도운 사람이 없어.')
      .replace(/^이곳의 옛 여행자 기록:\s*/u,formal ? '이곳에 머물렀던 여행자의 이야기예요. ' : '이곳에 머물렀던 여행자의 이야기야. ');
    return plain.split(/(?<=[.!?。！？])\s+/u).map(sentence => koreanSentence(sentence,formal)).join(' ');
  }
  if (locale === 'en') {
    const progress = text.match(/^Shared preparations in this settlement: (.+)\.$/u);
    if (progress) return progress[1].split('; ').map(entry => {
      const row = entry.match(/^(.+) (\d+)\/(\d+), (\d+)$/u);
      return row ? `For ${row[1].replace(/^./u,c=>c.toLowerCase())}, ${row[2]} of the ${row[3]} contributions are in. We've finished ${row[4]} rounds so far.` : entry;
    }).join(' ');
    const legacy=text.match(/^Local traveler record: (.+), (.*?)\. Visited this place and completed (\d+) contracts during their life\. Their life has ended; their record remains\.$/u);
    if(legacy)return `A traveler named ${legacy[1]} once came through here.${legacy[2]?` They worked as ${/^[aeiou]/iu.test(legacy[2])?'an':'a'} ${legacy[2].toLowerCase()}.`:''} They completed ${legacy[3]} contracts in their lifetime. Their journey has ended, but a record of their travels remains.`;
    return text.replace(/^No shared preparation contributions have been recorded here yet\.$/u,"Nobody has helped with the town's shared preparations yet.")
      .replace(/^Local traveler record:\s*/u,'A traveler once stayed here. Their name was ');
  }
  const progress = text.match(/^この土地の共同準備記録：(.+)。$/u);
  if (progress) return progress[1].split('; ').map(entry=>{
    const row=entry.match(/^(.+) (\d+)\/(\d+), (\d+)$/u);
    return row ? `${row[1]}は、${row[3]}回の協力のうち${row[2]}回まで進んでいます。これまでに${row[4]}巡${formal ? '終えています' : '終えたよ'}。` : entry;
  }).join('');
  const legacy=text.match(/^この地の旅人の記録：(.+)、(.*?)。生前にこの地を訪れ、依頼を(\d+)件終えた。本人の生涯は終わっても記録は残っている。$/u);
  if(legacy)return `${legacy[1]}という${legacy[2]?legacy[2]+'の':''}旅人が、ここにも立ち寄りました。生前に依頼を${legacy[3]}件終えています。もう亡くなっていますが、その旅の記録は残っています。`;
  return text.replace(/^この土地にはまだ共同準備への協力記録がありません。$/u,'街の共同準備は、まだ誰も手伝っていないんです。').replace(/^この地の旅人の記録：/u,'この土地に立ち寄った旅人の話です。');
}

function definitionSpeech(npcId: string, locale: NpcLocale, term: FantasyTerm): string {
  const name=term.names[locale], summary=term.summary[locale].trim(), formal=polite(npcId);
  if(term.id==='gold')return say(locale,formal?'여기서는 금화로 값을 치러요. G는 금화를 적을 때 쓰는 표시예요.':'여기서는 금화로 값을 치러. G는 금화를 적을 때 쓰는 표시야.','We pay for things with gold here. G is the mark we use when writing an amount in gold.','ここでは金貨で代金を払います。Gは金貨の額を書き表すときの印です。');
  if(term.id==='calendar')return say(locale,`여러 대륙에서 함께 쓰는 ${formal?'달력이에요':'달력이야'}. 연도를 적을 때는 '잔광력 312년'처럼 ${formal?'써요':'써'}.`,`The continents share this calendar. You'd write a year as 'Afterglow 312', for example.`,'各大陸で一緒に使っている暦です。「残光暦312年」のように年を書きます。');
  if(term.category==='race'){
    if(locale==='ko'){
      const sections=summary.match(/^(.+?) 계열\. (.*?) 능력 보정: (.*?)\. 신체 특성: (.*?)\.$/u);
      if(sections){
        const description=sections[2].replace('고유한 능력 보정과 기술을 가진 갈래.','저마다 타고난 능력과 기술이 다른 갈래.').split(/(?<=[.!?])\s+/u).map(part=>koreanSentence(part,formal,true)).join(' ');
        const changes=sections[3]==='없음' ? formal?'기본 능력에는 따로 차이가 없어요.':'기본 능력에는 따로 차이가 없어.' : `기본 능력과 비교하면 ${sections[3].replace(/([^,]+?)\s+([+-]\d+)/gu,(_all,attribute,value)=>`${attribute}${topic(attribute)} ${value}`)}만큼 차이가 ${formal?'나요':'나'}.`;
        const parts=sections[4].split(', '),traits=parts.length>1?parts.slice(0,-1).join(', ')+(final(parts.at(-2)!)?'과 ':'와 ')+parts.at(-1):parts[0];
        return `${name}${topic(name)} ${sections[1]} 계열${copula(sections[1]+' 계열',formal)}. ${description} ${changes} ${traits}${final(traits)?'이':'가'} 눈에 ${formal?'띄어요':'띄어'}.`;
      }
    }
    if(locale==='en'){
      const sections=summary.match(/^(.+?) lineage\. (.*?) Attribute changes: (.*?)\. Body traits: (.*?)\.$/u);
      if(sections){
        const raw=sections[2].replace(/ in this setting/gu,'');
        const description=raw==='A lineage with its own attribute changes and skills.'?"They have their own innate strengths and skills.":`${/^(?:a|an)\b/iu.test(raw)?'Each is':"They're"} ${raw.replace(/^./u,c=>c.toLowerCase())}`;
        const changes=sections[3]==='none'?"Their basic attributes don't have any added changes.":`Compared with the basic attributes, the differences are ${sections[3]}.`;
        const parts=sections[4].split(', ').map(value=>value.replace(/^./u,c=>c.toLowerCase())),traits=parts.length>1?parts.slice(0,-1).join(', ')+' and '+parts.at(-1):parts[0];
        return `${name} belongs to the ${sections[1]} lineage. ${description} ${changes} You'll notice their ${traits}.`;
      }
    }
    if(locale==='ja'){
      const sections=summary.match(/^(.+?)系統。(.*?)\s*身体特性：(.+)。$/u);
      if(sections){const traits=sections[3].split('・').join('と');return `${name}は${sections[1]}系統${formal?'です':'だよ'}。${sections[2]}${traits}という特徴${formal?'があります':'があるよ'}。`;}
    }
  }
  if(locale==='ko') {
    const spoken=koreanSentence(summary,formal,true);
    return summary.startsWith(name) ? spoken : `${name}${topic(name)} ${spoken}`;
  }
  if(locale==='en') {
    if(/^(?:a|an|the)\b/iu.test(summary)) return `${name} is ${summary.replace(/^./u,c=>c.toLowerCase())}`;
    if(summary.toLowerCase().startsWith(name.toLowerCase())) return summary;
    return `Here's what I know about ${name}. ${summary}`;
  }
  if(summary.startsWith(name)) return summary;
  const body=summary.replace(/。$/u,'');
  const noun=!/(?:[るうくぐすつぬぶむいた]|ない|ます|です)$/u.test(body);
  return `${name}は${body}${noun ? formal ? 'です' : 'だよ' : ''}。`;
}

const EXPLANATION_OPENING:Record<PrewrittenTone,RelationshipLine>={
  host:rel('내가 아는 걸 편하게 풀어 볼게.','Let me put what I know in everyday terms.','私が知っていることを、気楽な言葉で話すね。'),
  trade:rel('뜻부터 분명히 짚고 갈게요.','Let’s be clear about what it means first.','まず、意味をはっきりさせておきますね。'),
  forge:rel('핵심만 짚어 주지.','Here’s the useful part, plain and simple.','肝心なところだけ、はっきり言おう。'),
  scholar:rel('확인된 내용부터 짚어 볼게요.','I’ll start with what is established.','確かめられていることから、お話しします。'),
  priest:rel('제가 아는 범위에서 차분히 말씀드릴게요.','I’ll explain carefully, as far as I know.','私の分かる範囲で、ゆっくりお話ししますね。'),
  leader:rel('판단할 때 기억할 부분을 짚겠네.','Here’s what to keep in mind when weighing it up.','判断するときに覚えておくところを話そう。'),
  covert:rel('아는 범위만 말할게.','I’ll tell you only what I can stand behind.','確かに言える範囲だけ、話すよ。'),
  neighbour:rel('알기 쉽게 말하면 이런 거야.','In ordinary words, this is how it works.','難しく言わなければ、こういうことだよ。'),
};
const GOLD_SPEECH:Record<PrewrittenTone,RelationshipLine>={
  host:rel('묵거나 먹을 때 값을 치르는 그 금화 말이구나. G는 금화를 적을 때 쓰는 표시야.','You mean the gold you pay with for things like food and a bed. G is how we mark an amount in gold.','食べたり泊まったりするときに払う金貨のことだね。Gは金貨の額を表す印だよ。'),
  trade:rel('계산할 때 쓰는 금화예요. 금액 옆의 G가 그 금화를 뜻하죠.','That’s the gold we use to settle a payment. A G beside the amount tells you it is counted in gold.','支払いの勘定に使う金貨ですよ。金額に付いているGが、その金貨を表しています。'),
  forge:rel('대금을 치르는 금화지. G라고 적혀 있으면 금화의 액수를 말하는 거네.','Gold pays the bill. If an amount has G beside it, it’s an amount in gold.','代金を払う金貨だ。Gと書いてあれば、金貨の額を示している。'),
  scholar:rel('G는 금화의 액수를 나타내는 표시예요. 이곳에서 물건값을 치를 때 쓰는 화폐죠.','G is the notation for an amount in gold. Gold is the currency used here for payment.','Gは金貨の額を示す表記です。ここで代金の支払いに使う通貨ですね。'),
  priest:rel('살림에 필요한 것을 살 때 쓰는 금화예요. G라고 적힌 금액은 그 금화의 액수를 뜻해요.','It’s the gold used to pay for everyday needs. An amount marked G is counted in that gold.','暮らしに必要なものの代金に使う金貨ですよ。Gと書かれた金額は、その金貨の額です。'),
  leader:rel('여비나 물자값을 계산할 때 쓰는 금화네. G는 그 액수를 적는 표시지.','Gold is what you reckon travel expenses and supplies in. G is the mark used when writing that amount.','旅費や物資の代金を計算する金貨だ。Gは、その額を書き表す印になる。'),
  covert:rel('G라고 적힌 건 금화의 액수야. 값을 치를 때 쓰는 돈이지.','G tells you the amount is in gold. It’s the money used to settle a price.','Gは金貨の額を表している。代金を払うときに使う金だよ。'),
  neighbour:rel('장 볼 때 쓰는 금화 말이야. 금액에 붙은 G가 그 금화를 뜻해.','It’s the gold you use when buying things. The G beside an amount stands for that gold.','買い物で使う金貨のことだよ。金額に付いたGが、その金貨を表しているんだ。'),
};
export function npcDefinitionSpeech(npcId:string,locale:NpcLocale,term:FantasyTerm):string{
  const tone=fantasyNpcTone(npcId);
  if(term.id==='gold')return GOLD_SPEECH[tone][locale];
  return EXPLANATION_OPENING[tone][locale]+(locale==='ja'?'':' ')+definitionSpeech(npcId,locale,term);
}

export function npcSpecializationSpeech(npcId: string, character: FantasyCharacter, locale: NpcLocale): string {
  const formal=polite(npcId);
  const kind:FantasyCompanyKind|undefined=character.job==='leader'?'troop':character.job==='crimeboss'?'syndicate':character.job==='summoner'?'summons':undefined;
  if(kind){
    const members=character.specialization?.companies?.[kind]?.members??[],capacity=fantasyCompanyCapacity(character,kind);
    const group=say(locale,kind==='troop'?'부대원':kind==='syndicate'?'조직원':'계약한 동료',kind==='troop'?'company members':kind==='syndicate'?'organization members':'contracted companions',kind==='troop'?'隊員':kind==='syndicate'?'組織の仲間':'契約した仲間');
    const intro=say(locale,`${group}${topic(group)} 지금 ${members.length}${formal?'명이에요':'명이야'}. 현재는 ${capacity}명까지 함께할 수 ${formal?'있어요':'있어'}.`,`You have ${members.length} ${group}, and can currently have up to ${capacity}.`,`${group}は今${members.length}人で、今は${capacity}人まで一緒に行動できます。`);
    const details=members.map(member=>{
      const name=FANTASY_COMPANIONS.find(template=>template.id===member.id)?.names[locale]??say(locale,'이름이 확인되지 않은 동료','an unidentified companion','名前を確認できない仲間');
      const condition=say(locale,member.condition==='injured'?'부상 중':member.condition==='absent'?'이탈한 상태':'대기 중',member.condition==='injured'?'injured':member.condition==='absent'?'absent':'ready',member.condition==='injured'?'負傷中':member.condition==='absent'?'離脱中':'待機中');
      return say(locale,`${name}${topic(name)} 지금 ${condition}${formal?'이에요':'이야'}. 남은 생명력은 ${member.hp}${formal?'이고':'이고'}, ${member.assigned?'함께 나설 일행에 들어 있어':'아직 일행에 편성하지 않았어'}${formal?'요':''}.`,`${name} is ${condition}, with ${member.hp} health remaining, and ${member.assigned?'is assigned to your group':'has not been assigned to your group'}.`,`${name}は${condition}で、残る生命力は${member.hp}です。${member.assigned?'一緒に出る仲間に入っています':'まだ同行する仲間には入っていません'}。`);
    }).join(locale==='ja'?'':' ');
    return intro+(details?(locale==='ja'?'':' ')+details:'');
  }
  if(character.job==='mage')return say(locale,`지금은 마법을 ${fantasySpellCapacity(character)}개까지 준비해 둘 수 ${formal?'있어요':'있어'}. 숙련되면 최대 3개까지 ${formal?'늘어나요':'늘어나'}. 원소와 형태를 엮어 준비하고, 사용할 때 마나를 써서 힘을 보태거나 몸을 지키거나 상처를 ${formal?'회복해요':'회복해'}.`,`You can currently keep ${fantasySpellCapacity(character)} spells prepared, with room for up to 3 as you gain experience. Combine an element and a form; casting uses mana to aid a check, protect you or heal an injury.`,`今は${fantasySpellCapacity(character)}つまで魔法を用意でき、熟練すれば最大3つまで増えます。元素と形を組み合わせ、使うときにマナを注いで力を補ったり、身を守ったり、傷を癒やしたりします。`);
  if(character.job==='alchemist')return say(locale,`약을 조합하려면 이곳의 연금 공방에서 재료를 ${formal?'준비해야 해요':'준비해야 해'}. 재료의 등급과 손에 익은 정도가 품질을 좌우하고, 같은 방법으로 만들어도 결과가 조금씩 달라질 수 ${formal?'있어요':'있어'}.`,'For a mixture, you need the ingredients and a local alchemy workshop. The materials and your experience determine most of the quality, though each batch can vary a little.','薬を調合するには、材料をそろえて現地の錬金工房を使います。材料の質と腕前が仕上がりを左右しますが、同じ作り方でも少しずつ違いは出ます。');
  return say(locale,formal?'그 분야는 제가 자세히 알려드리기 어려워요.':'그 분야는 내가 자세히 알려주기 어려워.',"I'm not the right person to explain that field.",'その分野は、私から詳しくお教えするのは難しいです。');
}

const firstPersonVerbs=['listens','keeps','dislikes','records','values','checks','shows','tests','makes','enjoys','takes','is','does','refuses','pays','prefers','treats','offers','remembers','avoids','waits','leaves','protects','trusts','believes','notices','gives','delays','shares','saves','likes','looks','praises','prepares','asks','cautions','distinguishes','acknowledges','speaks','finds','watches','searches','redirects','puts','spots','calls','judges','hides','chooses','seats','packs','attends'];
const baseVerb=(verb:string)=>verb==='is'?'am':verb==='does'?'do':verb.endsWith('ies')?verb.slice(0,-3)+'y':/(?:sh|ch|ss|x|o)es$/u.test(verb)?verb.slice(0,-2):verb.endsWith('s')?verb.slice(0,-1):verb;
const japaneseEndings:[string,string][]=[
  ['重んじる','重んじています'],['気にかける','気にかけています'],['確かめる','確かめます'],['見落とさない','見落としません'],
  ['しない','しません'],['捨てない','捨てません'],['語らない','語りません'],['責めない','責めません'],['見ない','見ません'],['触れない','触れません'],['隠さない','隠しません'],
  ['聞く','聞きます'],['する','します'],['戒める','戒めています'],['認める','認めています'],['延ばす','延ばします'],['尋ねる','尋ねます'],
  ['見る','見ます'],['探す','探します'],['持つ','持っています'],['そらす','そらします'],['見つける','見つけます'],['誇る','誇りにしています'],
  ['考える','考えています'],['見積もる','見積もります'],['集める','集めています'],['記す','記しています'],['整える','整えます'],
  ['試す','試します'],['見せる','見せます'],['断る','断ります'],['入る','入ります'],['選ぶ','選びます'],['座らせる','座らせます'],['置く','置いています'],['嫌う','好みません'],
];

export function npcPersonalitySpeech(npcId: string, locale: NpcLocale): string {
  const npc=NPC_PUBLIC.find(person=>person.id===npcId);if(!npc)return '';
  const text=npc.personality[locale],formal=polite(npcId);
  if(locale==='ko')return `${formal?'저는':'나는'} ${koreanSentence(text,formal,true)}`;
  if(locale==='ja'){
    const parts=text.split('。').filter(Boolean).map(part=>{
      if(formal){for(const [end,replacement]of japaneseEndings)if(part.endsWith(end))return part.slice(0,-end.length)+replacement+'。';return part+'です。';}
      if(/(?:実直|慎重|指揮官|料理人|主人)$/u.test(part))return part+'なんだ。';
      return part+(['host','neighbour'].includes(fantasyNpcTone(npcId))?'よ':'')+'。';
    });
    return '私は'+parts.join('');
  }
  if(text.startsWith('Behind an unhurried smile,'))return 'I may look unhurried, but I keep a careful eye on the firewood and whether my guests are cold.';
  if(text.startsWith('Lively and busy, yet a tiny torn seam'))return "I'm lively and usually busy, but even a tiny torn seam catches my eye.";
  const sentences=text.split(/;\s*/u).map((part,index)=>{
    const word=part.match(/^\w+/u)?.[0]?.toLowerCase()??'';
    if(word==='never')return `I ${part.replace(/^Never\s+(\w+)/u,(_all,verb)=>'never '+baseVerb(verb.toLowerCase()))}`;
    return firstPersonVerbs.includes(word) ? `I ${part.replace(/^\w+/u,()=>baseVerb(word))}` : `${index?'I am':"I'm"} ${part.replace(/^./u,c=>c.toLowerCase())}`;
  });
  return sentences.map(part=>part.replace(new RegExp(`\\b(and|but)(\\s+(?:never|first|quickly|readily|gently|also))?\\s+(${firstPersonVerbs.join('|')})\\b`,'gu'),(_all,join,adverb,verb)=>`${join}${adverb??''} ${baseVerb(verb)}`).replace(/\.*$/u,'.')).join(' ');
}
