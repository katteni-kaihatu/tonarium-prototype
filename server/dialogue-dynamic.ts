import { NPC_PUBLIC, type NpcId, type NpcLocale } from '../shared/npc.ts';
import { FANTASY_WORLD_TIME_RATE, type FantasyCharacter, type FantasyProfile } from '../shared/fantasy.ts';
import type { FantasyEconomyShopView } from '../shared/fantasy-economy.ts';
import { FANTASY_ITEMS, FANTASY_QUESTS } from '../shared/fantasy-data.ts';
import { FANTASY_MAPS, fantasyBuildings } from '../shared/fantasy-town.ts';
import { FANTASY_DINING, FANTASY_LODGINGS } from '../shared/fantasy-life.ts';
import { fantasyPrice } from '../shared/fantasy-reputation.ts';
import { fantasyEnvironment } from '../shared/fantasy-environment.ts';
import { fantasyNpcTone } from '../shared/fantasy-dialogue-voice.ts';
import { fantasyGmActivityName } from '../shared/fantasy-gm-locale.ts';
import { fantasyQuestRecordEligible } from '../shared/fantasy-access.ts';
import { fantasyQuestText } from '../shared/fantasy-narrative.ts';
import { fantasyTaskObjective, fantasyTaskProgress } from '../shared/fantasy-task-progress.ts';
import { fantasyTermName } from '../shared/fantasy-lore.ts';

export interface DialogueDynamicContext {
  hour: number;
  location: string;
  shops: Pick<FantasyEconomyShopView, 'building' | 'lots' | 'sales'>[];
  rumors: { hour: number; text: string }[];
  activity?: FantasyProfile['activity'];
}
const normal = (text: string) => text.normalize('NFKC').toLowerCase().trim().replace(/[.!?。！？]+$/u, '').trim().replace(/\s+/gu, ' ');
const itemName = (id: string, locale: NpcLocale) => FANTASY_ITEMS.find(item => item.id === id)?.names?.[locale] ?? FANTASY_MAPS.find(map => map.item === id)?.name[locale] ?? fantasyTermName(id, locale);
const WEATHER = /^(?:지금\s*날씨(?:는|가)?\s*(?:어때(?:요)?|어떤가요|알려줘)|오늘\s*날씨(?:는|가)?\s*(?:어때(?:요)?|어떤가요|알려줘)|날씨(?:는|가)?\s*(?:어때(?:요)?|어떤가요|알려줘)|what(?:'s| is) the weather(?: like)?(?: today| now)?|how(?:'s| is) the weather(?: today| now)?|(?:今日|今)の天気(?:は)?(?:どう|どうですか|教えて)|天気はどう(?:ですか)?)$/u;
const RUMORS = /^(?:(?:오늘|요즘|최근)(?:의)?\s*(?:소문|동네\s*소식)(?:이|은|을)?\s*(?:뭐야|있어(?:요)?|알려줘|들려줘)|(?:소문|동네\s*소식)(?:이|은|을)?\s*(?:있어(?:요)?|알려줘|들려줘)|any (?:news|rumou?rs)(?: today| lately)?|what(?:'s| is) (?:the latest news|today's news|the news today)|(?:今日|最近)の(?:噂|うわさ|知らせ)(?:は|を)?(?:ある|ありますか|教えて)|何か(?:噂|うわさ|知らせ)は(?:ある|ありますか))$/u;
const ACTIVITY = /^(?:(?:지금\s*)?(?:내가|나는|난|나|저는|제가)\s*(?:지금\s*)?(?:뭐|뭘|무엇을|무슨\s*(?:행동|일))\s*(?:하고\s*(?:있어(?:요)?|있나요)|하는\s*중이야)|무슨\s*행동\s*중(?:인데|이야|인가요)|(?:내\s*)?행동\s*(?:진행도|상태)(?:를)?\s*(?:알려줘|보여줘)?|what am i doing(?: now)?|what (?:activity|action) am i doing|how long (?:is left|until i finish)|(?:私|自分)は(?:今)?何をして(?:いる|いますか)|(?:今の|私の)行動の(?:進み具合|残り時間)(?:を教えて)?)$/u;
const PROGRESS = /^(?:(?:내|현재|받은)\s*(?:의뢰|퀘스트)\s*(?:진행도|진행상황|진행\s*상황)(?:를)?\s*(?:알려줘|보여줘)?|my quest progress|what(?:'s| is) my quest progress|(?:私の|受注中の)依頼の進み具合(?:を教えて)?)$/u;
const STOCK = /^(?:(?:지금\s*)?(?:파는\s*물건|판매\s*품목|상품|재고)(?:과|와)?\s*(?:가격)?(?:을|은|이)?\s*(?:알려줘|보여줘|뭐야|있어(?:요)?)?|what (?:do you sell|is in stock)|show (?:your )?(?:stock|prices)|(?:今の)?(?:品物|在庫|商品)(?:と値段)?(?:を教えて|は何|はありますか)?)$/u;
const PRICE = /^(?:가격|얼마|값|price|cost|how much|値段|価格|いくら)$/u;
function priceQuestion(text: string) {
  const query = normal(text);
  const candidates = [...FANTASY_ITEMS.map(item => ({ id: item.id, names: [item.id, ...(['ko','en','ja'] as const).map(locale => itemName(item.id, locale))] })), ...FANTASY_MAPS.map(map => ({ id: map.item, names: [map.item, ...Object.values(map.name)] }))];
  for (const candidate of candidates) for (const name of candidate.names.sort((a, b) => b.length - a.length)) {
    const value = normal(name);
    const forms = [value + ' 가격 알려줘', value + ' 가격', value + ' 얼마야', value + ' 얼마예요', value + ' 얼마인가요', value + '는 얼마야', value + '은 얼마야', value + ' 가격은 얼마야', value + ' 가격이 얼마야', value + ' 값 알려줘', 'how much is ' + value, 'how much does ' + value + ' cost', 'price of ' + value, "what's the price of " + value, 'what is the price of ' + value, value + 'の値段は', value + 'の値段はいくら', value + 'はいくら', value + 'はいくらですか', value + 'の価格を教えて'];
    if (forms.includes(query)) return { item: candidate.id, sell: false };
    if ([value + ' 팔면 얼마야', value + ' 판매 가격', 'how much can i sell ' + value + ' for', value + 'を売るといくら'].includes(query)) return { item: candidate.id, sell: true };
  }
  return PRICE.test(query) ? { sell: false } : undefined;
}
function voice(locale: NpcLocale, npcId: NpcId | undefined, subject: 'weather' | 'rumors' | 'prices' | 'progress', value: string): string {
  const tone = npcId && fantasyNpcTone(npcId);
  const casual = !!tone && ['host', 'forge', 'leader', 'covert', 'neighbour'].includes(tone);
  const labels = { weather: { ko: '지금 날씨', en: 'Current weather', ja: '今の天気' }, rumors: { ko: '오늘 확인된 소식', en: 'News confirmed today', ja: '今日確認された知らせ' }, prices: { ko: '현재 가격', en: 'Current prices', ja: '現在の価格' }, progress: { ko: '현재 진행 상황', en: 'Current progress', ja: '現在の進み具合' } };
  const koLabel = labels[subject].ko;
  const last = koLabel.charCodeAt(koLabel.length - 1), particle = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0 ? '은' : '는';
  return locale === 'ko' ? `${koLabel}${particle}${casual ? ' 이래' : ' 다음과 같습니다'}: ${value}` : `${labels[subject][locale]}: ${value}`;
}
function npcLine(locale: NpcLocale, npcId: NpcId, ko: [string, string, string, string], en: string, ja: [string, string]): string {
  const tone = fantasyNpcTone(npcId);
  if (locale === 'ko') return ko[tone === 'leader' ? 3 : ['forge', 'covert'].includes(tone) ? 2 : ['trade', 'scholar', 'priest'].includes(tone) ? 1 : 0];
  return locale === 'en' ? en : ja[['forge', 'leader', 'covert'].includes(tone) ? 0 : 1];
}
const koParticle = (text: string, consonant: string, vowel: string) => {
  const last = text.charCodeAt(text.length - 1);
  return last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0 ? consonant : vowel;
};
type TemperatureFeeling = 'freezing' | 'cold' | 'cool' | 'mild' | 'hot' | 'scorching';
export function npcTemperatureFeeling(temperature: number): TemperatureFeeling {
  return temperature < 0 ? 'freezing' : temperature < 10 ? 'cold' : temperature < 17 ? 'cool' : temperature < 25 ? 'mild' : temperature < 31 ? 'hot' : 'scorching';
}
function npcWeather(locale: NpcLocale, npcId: NpcId, kind: ReturnType<typeof fantasyEnvironment>['weather'], temperature: number): string {
  const tone=fantasyNpcTone(npcId), index=['freezing','cold','cool','mild','hot','scorching'].indexOf(npcTemperatureFeeling(temperature));
  const conditions={
    ko:{clear:'맑아',cloudy:'흐려',rain:'비가 와',snow:'눈이 와'},
    en:{clear:"It's clear",cloudy:"It's cloudy",rain:"It's raining",snow:"It's snowing"},
    ja:{clear:'晴れている',cloudy:'曇っている',rain:'雨が降っている',snow:'雪が降っている'},
  };
  const ko={
    host:['살을 에는 추위야. 따뜻한 곳이 절로 생각나지.','제법 추워. 따뜻한 차가 생각나는 날이야.','조금 쌀쌀해. 어깨에 뭔가 걸치면 좋겠어.','덥지도 춥지도 않아서 잠깐 쉬어 가기 좋은 날이야.','꽤 더워. 시원한 물 한 잔이 생각나네.','가만히 있어도 푹푹 쪄. 그늘이 반가운 날이야.'],
    trade:['금화를 세는 손끝도 얼겠어요. 단단히 입고 장을 보셔야겠네요.','꽤 춥네요. 오래 돌아다니실 거면 겉옷부터 챙기세요.','장은 보기 괜찮아도 조금 쌀쌀한 날이에요.','물건을 둘러보기에 부담 없는 포근한 날씨예요.','한 바퀴 돌기만 해도 더울 만한 날이에요.','이 더위엔 장도 쉬엄쉬엄 보셔야겠어요.'],
    forge:['매서운 추위다. 금속을 맨손으로 오래 쥘 날은 아니군.','손끝이 굳을 만큼 춥군. 작업 전엔 손부터 녹여야지.','도구 잡은 손에 서늘함이 느껴질 날이군.','손을 움직이기엔 딱 편안한 날이다.','좀 덥군. 힘쓰는 일을 하면 더 덥겠어.','푹푹 찌는군. 이럴 땐 몸부터 식혀야지.'],
    scholar:['책장을 넘기는 손도 얼 것 같은 날이에요.','책을 붙들고 가만히 있기엔 꽤 추워요.','가만히 글을 읽고 있으면 서늘함이 느껴져요.','차분히 책을 읽기에 편안한 날이에요.','조금 더워요. 책을 읽을 자리도 그늘이 좋겠네요.','열기가 심하네요. 오래 집중하기도 쉽지 않은 날이에요.'],
    priest:['몸이 금세 식을 만큼 매서운 추위예요.','꽤 추워요. 몸을 따뜻하게 감싸는 게 좋겠어요.','조금 서늘하네요. 얇은 겉옷이 있으면 편하겠어요.','몸에 부담이 적은 온화한 날이네요.','더운 날이에요. 목마르기 전에 물을 드세요.','더위가 심하네요. 무리하지 않고 쉬어 갈 때예요.'],
    leader:['매서운 추위네. 길을 나설 준비도 단단히 해야겠어.','꽤 춥네. 오래 움직일 사람은 추위부터 대비해야지.','조금 쌀쌀하군. 출발할 때 겉옷을 빼먹지는 말게.','움직이기에 무난한 날이네.','제법 덥군. 길을 간다면 중간에 쉴 여유를 두게.','심하게 덥네. 일행이 무리하지 않게 살펴야겠어.'],
    covert:['살을 에는군. 손이 굳으면 귀찮아져.','꽤 추워. 얇게 입고 나갈 날은 아니지.','약간 쌀쌀해. 얇은 외투 정도면 괜찮겠어.','몸 움직이기엔 거슬리는 날씨가 아니야.','좀 덥네. 두껍게 껴입는 건 성가시겠어.','지독하게 덥군. 가만히 있어도 땀이 나겠어.'],
    neighbour:['밖에 오래 서 있기 힘들 만큼 추워.','꽤 추워. 두툼하게 입어야겠어.','조금 쌀쌀한 편이야.','덥지도 춥지도 않고 딱 편해.','좀 덥네. 물이 자꾸 생각나.','가만히 있어도 푹푹 찌는 날이야.'],
  }[tone][index];
  if(locale==='ko'){
    const condition=conditions.ko[kind];
    const opening=tone==='trade'||tone==='scholar'||tone==='priest'?condition.replace(/맑아$/u,'맑아요').replace(/흐려$/u,'흐려요').replace(/와$/u,'와요'):tone==='forge'||tone==='leader'?condition.replace(/맑아$/u,'맑군').replace(/흐려$/u,'흐리군').replace(/와$/u,'오는군'):condition;
    return `${opening}. ${ko}`;
  }
  const en={
    host:["It's bitterly cold; somewhere warm sounds welcoming.","It's quite cold. A warm drink sounds good.","It's a little chilly, the sort of day for something warm around your shoulders.","It's comfortable weather for taking a breather.","It's warm enough to make a cool drink appealing.","It's sweltering. A patch of shade would be welcome."],
    trade:["It's bitterly cold for counting coins with bare fingers.","It's cold enough that I'd wrap up before browsing the stalls.","A little chilly, though not a bad day for looking over the wares.","Comfortable weather for browsing without hurrying.","It's hot enough that a circuit of the stalls could be tiring.","Shopping can wait a little in heat like this. Take your time."],
    forge:["Bitter cold. No day to hold metal in bare hands.","Cold enough to stiffen your fingers. Warm them before working.","A little cool on the hands when you're holding tools.","Comfortable weather for getting your hands to work.","Hot. Hard work would make it feel hotter.","Sweltering. Best cool yourself before anything else."],
    scholar:["Cold enough that turning pages could numb your fingers.","Quite cold if you're sitting still with a book.","A little cool when you settle down to read.","Comfortable weather for quiet reading.","Rather warm. I'd choose a shaded reading spot.","The heat makes prolonged concentration less inviting."],
    priest:["Bitterly cold. It is easy to lose your warmth in weather like this.","Quite cold. Keeping yourself warmly wrapped would be wise.","A little cool. A light outer layer would be comfortable.","Gentle weather, with neither harsh heat nor cold.","It is hot. Have some water before you feel parched.","The heat is severe. Allow yourself some rest."],
    leader:["Bitter cold. Anyone setting out should prepare properly.","Quite cold. A long journey calls for warm clothing.","A little chilly. Don't overlook an outer layer before setting out.","Reasonable weather for moving out.","Hot enough to leave time for breaks on the road.","Severe heat. Keep an eye on anyone traveling with you."],
    covert:["Bitter cold. Numb fingers are a nuisance.","Quite cold. No day to go out lightly dressed.","A little chilly. A light coat should do.","Nothing about the temperature to get in your way.","A little hot. Too many layers would be a bother.","Sweltering. The sort of heat that makes standing still sweaty."],
    neighbour:["Too cold to enjoy standing outside for long.","Quite cold. I'd dress warmly.","A little chilly, really.","Neither hot nor cold. Just comfortable.","A bit hot. Makes a drink of water sound good.","Sweltering even when you're standing still."],
  }[tone][index];
  if(locale==='en')return `${conditions.en[kind]}. ${en}`;
  const ja={
    host:['身にしみる寒さですね。暖かい場所が恋しくなります。','けっこう寒いですね。温かい飲み物が欲しくなります。','少し肌寒いですね。肩に何か掛けたくなる日です。','暑くも寒くもなく、ひと息つくのに気持ちのいい日ですね。','かなり暑いですね。冷たい飲み物が欲しくなります。','じっとしていても蒸し暑いですね。日陰がありがたい日です。'],
    trade:['硬貨を数える指先も凍えそうです。しっかり着込んで買い物をなさってください。','けっこう寒いですよ。店を回るなら上着がほしいですね。','少し肌寒いですが、品物を見て回るには悪くありません。','急がず品物を見るには、ちょうどいい陽気ですね。','店をひと回りするだけでも暑くなりそうですね。','この暑さですから、買い物も休みながらがよさそうです。'],
    forge:['厳しい寒さだ。金属を素手で長く持つ日じゃないな。','指がこわばる寒さだ。仕事の前に手を温めたいところだ。','道具を握る手には少しひんやりするな。','手を動かすには、ちょうどいい陽気だ。','暑いな。力仕事なら、なおさらだ。','ひどく暑い。まず体を冷ましたいところだな。'],
    scholar:['本をめくる指も凍えそうな寒さです。','本を持ってじっとしているには、けっこう寒いですね。','静かに読んでいると、少し肌寒く感じます。','落ち着いて本を読むには、過ごしやすい日ですね。','少し暑いですね。読む場所も日陰がよさそうです。','暑さが厳しいですね。長く集中するにはつらい日です。'],
    priest:['体の温もりを奪うような厳しい寒さですね。','けっこう寒いですね。暖かく包んでお過ごしください。','少し肌寒いですね。薄い上着があれば楽でしょう。','暑さも寒さも厳しくない、穏やかな日ですね。','暑いですね。喉が渇ききる前に水をどうぞ。','厳しい暑さですね。無理をせず休むことも大切です。'],
    leader:['厳しい寒さだな。出立するなら備えが要る。','けっこう寒いな。長く歩く者は防寒を忘れないように。','少し肌寒い。出るときは上着を忘れずにな。','動くには無理のない陽気だな。','かなり暑い。道中に休む余裕を見ておくといい。','厳しい暑さだ。同行者が無理をしていないか見たいところだ。'],
    covert:['身を切る寒さだな。指が鈍るのは面倒だ。','けっこう寒い。薄着で出る日じゃない。','少し肌寒い。薄い外套くらいでよさそうだ。','動くのに邪魔な暑さ寒さはないな。','少し暑い。着込みすぎると面倒そうだ。','ひどく暑い。じっとしていても汗が出そうだ。'],
    neighbour:['外に長く立つにはつらい寒さだね。','けっこう寒いね。厚着をしたくなるよ。','少し肌寒い感じだね。','暑くも寒くもなくて、ちょうどいいね。','少し暑いね。水が欲しくなるよ。','じっとしていても蒸し暑い日だね。'],
  }[tone][index];
  const condition=conditions.ja[kind];
  return `${['forge','leader','covert'].includes(tone)?condition:condition.replace(/いる$/u,'います')}。${ja}`;
}
function npcNews(locale: NpcLocale, npcId: NpcId, notices: readonly { text: string }[]): string {
  if (!notices.length) return npcLine(locale, npcId,
    ['오늘은 아직 새로 들은 소식이 없어.', '오늘은 아직 새로 들은 소식이 없어요.', '오늘 새로 들은 이야기는 없어.', '오늘 새로 들어온 소식은 없네.'],
    "I haven't heard any new local news today.", ['今日はまだ新しい話を聞いていない。', '今日はまだ新しい話を聞いていません。']);
  const plain = notices.map(note => note.text.trim()).join(' ');
  const strip = (value: string) => value.replace(/[.!。]+$/u, '');
  if (locale === 'ko') {
    const tone = fantasyNpcTone(npcId), polite = ['trade', 'scholar', 'priest'].includes(tone);
    const spoken=notices.map(note => {
      const line = strip(note.text.trim());
      if (/(?:입니다|이다)$/u.test(line)) {
        const noun = line.replace(/(?:입니다|이다)$/u, '');
        return `${noun}${koParticle(noun, '이래', '래')}${polite ? '요' : ''}.`;
      }
      const past = line.replace(/(?:습니다|다)$/u, '');
      const pastLast = past.charCodeAt(past.length - 1);
      if (past !== line && pastLast >= 0xac00 && pastLast <= 0xd7a3 && (pastLast - 0xac00) % 28 === 20) return `${past.replace(/되었$/u, '됐').replace(/하였$/u, '했')}${polite ? '대요' : '대'}.`;
      const stem = line.replace(/했습니다$/u, '했').replace(/됐습니다$/u, '됐')
        .replace(/있습니다$/u, '있').replace(/없습니다$/u, '없').replace(/됩니다$/u, '된')
        .replace(/했다$/u, '했').replace(/됐다$/u, '됐').replace(/었다$/u, '었').replace(/았다$/u, '았')
        .replace(/있다$/u, '있').replace(/없다$/u, '없').replace(/다퉜다$/u, '다퉜').replace(/옮겼다$/u, '옮겼')
        .replace(/마쳤다$/u, '마쳤').replace(/올랐다$/u, '올랐').replace(/왔다$/u, '왔').replace(/갔다$/u, '갔');
      return stem !== line ? `${stem}${polite ? '대요' : '대'}.` : npcLine(locale, npcId,
        [`오늘 이런 얘길 들었어. “${line}.”`, `오늘 이런 이야기를 들었어요. “${line}.”`, `오늘 들은 얘기는 이거다. “${line}.”`, `오늘 이런 이야기가 들어왔네. “${line}.”`], '', ['', '']);
    }).join(' ');
    return npcNewsTone(locale,npcId,spoken);
  }
  if (locale === 'ja') {
    const informal = ['forge','leader','covert'].includes(fantasyNpcTone(npcId));
    const spoken=notices.map(note => {
      const line = strip(note.text.trim());
      const spoken = line.replace(/始まりました$/u,'始まった').replace(/終わりました$/u,'終わった')
        .replace(/上がりました$/u,'上がった').replace(/下がりました$/u,'下がった').replace(/届きました$/u,'届いた')
        .replace(/運びました$/u,'運んだ').replace(/もめました$/u,'もめた').replace(/しました$/u,'した').replace(/されました$/u,'された')
        .replace(/始まります$/u,'始まる').replace(/終わります$/u,'終わる').replace(/でした$/u,'だった').replace(/です$/u,'だ');
      return !/(?:ました|ます|です)$/u.test(spoken) && /(?:た|だ|る)$/u.test(spoken) ? `${spoken}${informal ? 'そうだ' : 'そうですよ'}。` : `「${line}」${informal ? 'という話を聞いた' : 'という話を聞きました'}。`;
    }).join('');
    return npcNewsTone(locale,npcId,spoken);
  }
  const english = plain.replace(/Repairs to (.+?) have started\./gu,"They've started repairing $1.").replace(/Repairs to (.+?) are complete\./gu,"They've finished repairing $1.");
  return npcNewsTone(locale,npcId,english);
}
function npcNewsTone(locale: NpcLocale, npcId: NpcId, value: string): string {
  const tone=fantasyNpcTone(npcId);
  if(locale==='ko')return {
    host:`마을에 이런 소식이 있더라. ${value}`,
    trade:`오늘 이 근처에서 돌아가는 일은 이래요. ${value}`,
    forge:`${value} 알려진 건 거기까지다.`,
    scholar:`지금 확인할 수 있는 소식부터 전해 드릴게요. ${value}`,
    priest:`마을에서 전해 온 이야기가 있어요. ${value}`,
    leader:`현재 들어온 소식은 이렇네. ${value}`,
    covert:`${value} 더 보태서 말할 만큼 아는 건 없어.`,
    neighbour:`${value} 이 동네 소식은 그렇더라.`,
  }[tone];
  if(locale==='en')return {
    host:`There's news from around town. ${value}`,
    trade:`Here's what is happening locally today. ${value}`,
    forge:`${value} That's the word so far.`,
    scholar:`I can pass on the verified local news. ${value}`,
    priest:`There is news from the community. ${value}`,
    leader:`The latest local report is in. ${value}`,
    covert:`${value} That's as much as I know.`,
    neighbour:`${value} That's what has been going on around here.`,
  }[tone];
  return {
    host:`町からこんな話が届いていますよ。${value}`,
    trade:`今日この辺りで動きがあったのは、こちらですね。${value}`,
    forge:`${value}今知られているのは、そこまでだ。`,
    scholar:`確かめられる知らせからお伝えしますね。${value}`,
    priest:`町のことを一つお伝えしますね。${value}`,
    leader:`今入っている知らせは、こうだ。${value}`,
    covert:`${value}それ以上は知らない。`,
    neighbour:`${value}この辺りの話は、そんなところだね。`,
  }[tone];
}
function npcGoodsPrice(locale: NpcLocale, npcId: NpcId, name: string, price: number, count: number, sell = false): string {
  const topic = name + koParticle(name, '은', '는');
  const tone=fantasyNpcTone(npcId);
  const english = {
    host: `${name} is ${price}G each. I've still got ${count}.`,
    trade: `${name} is ${price}G each, and I've got ${count} left.`,
    forge: `${price}G apiece for ${name}. ${count} left.`,
    scholar: `For ${name}, it's ${price}G each. There are ${count} available.`,
    priest: `${name} costs ${price}G each. There are ${count} here.`,
    leader: `${name} is ${price}G apiece. We have ${count} on hand.`,
    covert: `${name}? ${price}G each. I can spare ${count}.`,
    neighbour: `It's ${price}G each for ${name}. There are ${count} left.`,
  }[tone];
  const korean={
    host:`${topic} 하나에 ${price}G야. 내놓을 수 있는 건 ${count}개야.`,
    trade:`${topic} 개당 ${price}G예요. 지금 남은 건 ${count}개고요.`,
    forge:`${topic} 하나에 ${price}G다. ${count}개 남았네.`,
    scholar:`${topic} 한 개에 ${price}G로 정해져 있어요. 준비된 수량은 ${count}개예요.`,
    priest:`${name}${koParticle(name,'이라면','라면')} 하나에 ${price}G예요. 지금 ${count}개가 남아 있어요.`,
    leader:`${name}${koParticle(name,'은','는')} ${count}개를 확보하고 있네. 한 개 값은 ${price}G라네.`,
    covert:`${name} 말이지. 하나에 ${price}G, 내줄 수 있는 건 ${count}개야.`,
    neighbour:`${topic} 하나에 ${price}G야. 아직 ${count}개는 남아 있네.`,
  }[tone];
  const japanese={
    host:`${name}なら一つ${price}Gですよ。今は${count}個あります。`,
    trade:`${name}は一つ${price}Gで、残りは${count}個です。`,
    forge:`${name}は一つ${price}Gだ。残り${count}個。`,
    scholar:`${name}は一つ${price}Gで扱っています。用意できるのは${count}個です。`,
    priest:`${name}をお探しでしたら、一つ${price}Gです。今は${count}個ありますよ。`,
    leader:`手元の${name}は${count}個だ。一つの値は${price}Gになる。`,
    covert:`${name}か。一つ${price}G。今なら${count}個は出せる。`,
    neighbour:`${name}は一つ${price}Gだよ。まだ${count}個残っているね。`,
  }[tone];
  return sell ? npcLine(locale, npcId,
    [`${name} ${count}개는 개당 ${price}G에 살 수 있어.`, `${name} ${count}개는 개당 ${price}G에 살 수 있어요.`, `${name} ${count}개라면 개당 ${price}G로 쳐 주지.`, `${name} ${count}개는 개당 ${price}G에 사겠네.`],
    `For ${name}, I can offer ${price}G each for the ${count} you have.`,
    [`その${name}${count}個なら、一つ${price}Gで買い取る。`, `その${name}${count}個なら、一つ${price}Gで買い取れますよ。`]) : npcLine(locale, npcId,
    [korean,korean,korean,korean],
    english,
    [japanese,japanese]);
}
function npcDuration(hours: number, locale: NpcLocale): string {
  const minutes = Math.max(0, Math.round(hours * 60)), h = Math.floor(minutes / 60), m = minutes % 60;
  if (locale === 'ko') return h ? `${h}시간${m ? ` ${m}분` : ''}` : `${m}분`;
  if (locale === 'ja') return h ? `${h}時間${m ? `${m}分` : ''}` : `${m}分`;
  return h ? `${h} ${h === 1 ? 'hour' : 'hours'}${m ? ` and ${m} ${m === 1 ? 'minute' : 'minutes'}` : ''}` : `${m} ${m === 1 ? 'minute' : 'minutes'}`;
}
function koActivity(name: string): string {
  if (/배우기$/u.test(name)) return name.replace(/배우기$/u, '배우고');
  if (/읽기$/u.test(name)) return name.replace(/읽기$/u, '읽고');
  if (/숙박$/u.test(name)) return name.replace(/ 숙박$/u, '에 묵고');
  if (/ 식사$/u.test(name)) {
    const meal = name.replace(/ 식사$/u, '');
    return `${meal}${koParticle(meal, '을', '를')} 먹고`;
  }
  if (/이동$/u.test(name)) return `${name}하고`;
  return `${name}${koParticle(name, '을', '를')} 하고`;
}
function englishActivity(name: string): string {
  const lowerJob = name.replace(/^(working|training) as (.+)$/u, (_match, action: string, job: string) => `${action} as ${/^[aeiou]/iu.test(job) ? 'an' : 'a'} ${job.toLowerCase()}`);
  return /^(?:working|training|traveling|learning|exploring|gathering|mining|hunting|skinning|fishing|buying|renting|crafting|staying|eating|camping|negotiating|reading|performing|forming|hiring|assigning|ending|carrying|treating|recontracting)\b/u.test(lowerJob) ? `You're ${lowerJob} right now.` : `You're working on “${name}” right now.`;
}
function npcActivitySpeech(locale: NpcLocale, npcId: NpcId, name: string, remaining: number): string {
  const tone=fantasyNpcTone(npcId),duration=npcDuration(remaining,locale);
  if(locale==='ko')return {
    host:`지금 ${koActivity(name)} 있어. 마치려면 약 ${duration} 더 걸리니 너무 서두르진 마.`,
    trade:`지금 ${koActivity(name)} 계세요. 마무리까지는 약 ${duration} 남아 있어요.`,
    forge:`${koActivity(name)} 있군. 끝내려면 아직 약 ${duration}은 더 필요하다.`,
    scholar:`지금은 ${koActivity(name)} 계세요. 남은 시간은 대략 ${duration} 정도예요.`,
    priest:`${koActivity(name)} 계시는군요. 약 ${duration} 더 걸릴 테니 무리하지 마세요.`,
    leader:`현재 ${koActivity(name)} 있네. 약 ${duration} 뒤에 마치니 다음 일정을 생각해 둘 수 있겠군.`,
    covert:`${koActivity(name)} 있잖아. 약 ${duration} 더 남았어. 조급해한다고 빨라지진 않지.`,
    neighbour:`아직 ${koActivity(name)} 있어. 다 하려면 약 ${duration}은 더 걸리겠네.`,
  }[tone];
  const activity=englishActivity(name);
  if(locale==='en')return {
    host:`${activity} Another ${duration} or so to go; no need to fret over it.`,
    trade:`${activity} Allow about ${duration} before it's finished.`,
    forge:`${activity} Still about ${duration} of work left.`,
    scholar:`${activity} The remaining time is approximately ${duration}.`,
    priest:`${activity} It will take about ${duration} more. Take care not to overdo it.`,
    leader:`${activity} Plan on another ${duration} before moving to the next task.`,
    covert:`${activity} About ${duration} left. Impatience won't shorten it.`,
    neighbour:`${activity} Looks like about ${duration} more to finish up.`,
  }[tone];
  const action=name.endsWith('の仕事')?name.replace(/の仕事$/u,'として働いている'):`「${name}」に取り組んでいる`;
  return {
    host:`今は${action}ところですね。あと約${duration}ですから、焦らずにいきましょう。`,
    trade:`今は${action}ところですね。仕上がりまでは約${duration}見ておけばよさそうです。`,
    forge:`まだ${action}ところだな。片づくまで、あと約${duration}はかかる。`,
    scholar:`今は${action}ところです。残る時間は、およそ${duration}ですね。`,
    priest:`${action}ところなのですね。あと約${duration}ですから、無理をなさらずに。`,
    leader:`現在は${action}ところだ。あと約${duration}を見て、次の予定を考えるといい。`,
    covert:`${action}ところだろう。あと約${duration}だ。焦っても短くはならない。`,
    neighbour:`まだ${action}ところだね。全部終わるには、あと約${duration}かかりそうだよ。`,
  }[tone];
}
function npcServicePrice(locale: NpcLocale, npcId: NpcId, name: string, price: number, hours?: number): string {
  const topic = name + koParticle(name, '은', '는'), duration = hours === undefined ? '' : `${hours}시간에 `;
  return npcLine(locale, npcId,
    [`${topic} ${duration}${price}G야.`, `${topic} ${duration}${price}G예요.`, `${topic} ${duration}${price}G다.`, `${topic} ${duration}${price}G라네.`],
    `${name} costs ${price}G${hours === undefined ? '' : ` for ${hours} hours`}.`,
    [`${name}は${hours === undefined ? '' : `${hours}時間で`}${price}Gだ。`, `${name}は${hours === undefined ? '' : `${hours}時間で`}${price}Gです。`]);
}
function dynamicReply(locale: NpcLocale, text: string, profile: FantasyProfile, facts: DialogueDynamicContext | undefined, npcId?: NpcId): string | undefined {
  if (!['ko', 'en', 'ja'].includes(locale) || typeof text !== 'string' || text.length > 180 || /[\r\n\u0000-\u001f\u007f]/.test(text)) return undefined;
  const character = profile.character;
  if (!character) return undefined;
  const npc = npcId && NPC_PUBLIC.find(person => person.id === npcId);
  if (npcId && (!npc || npc.homeLocation !== character.location)) return undefined;
  const query = normal(text);
  if (WEATHER.test(query) || ['날씨','오늘 날씨','지금 날씨','weather','weather today',"today's weather",'今日の天気','今の天気','天気を教えて'].includes(query)) {
    const weather = fantasyEnvironment({ location: character.location, hour: facts?.location === character.location ? facts.hour : character.hour });
    const names = { clear: { ko: '맑음', en: 'clear', ja: '晴れ' }, cloudy: { ko: '흐림', en: 'cloudy', ja: '曇り' }, rain: { ko: '비', en: 'rain', ja: '雨' }, snow: { ko: '눈', en: 'snow', ja: '雪' } };
    return npcId ? npcWeather(locale, npcId, weather.weather, weather.temperature) : voice(locale, npcId, 'weather', `${names[weather.weather][locale]} · ${weather.temperature}°C.`);
  }
  if (RUMORS.test(query) || ['오늘 소문','오늘의 소문','소문','today\'s rumors','today\'s rumours','today\'s news','今日の噂','今日のうわさ'].includes(query)) {
    const notices = facts?.location === character.location ? facts.rumors.filter(note => Math.floor(note.hour / 24) === Math.floor(facts.hour / 24) && note.hour <= facts.hour).slice(-2) : [];
    return npcId ? npcNews(locale, npcId, notices) : voice(locale, npcId, 'rumors', notices.length ? notices.map(note => note.text).join(' ') : { ko: '아직 확인된 새 소식은 없습니다.', en: 'There is no verified news yet.', ja: '確認できる新しい知らせはまだありません。' }[locale]);
  }
  if (ACTIVITY.test(query)) {
    const activity = profile.activity ?? facts?.activity;
    if (!activity) return npcId ? npcLine(locale, npcId,
      ['지금 하고 있는 일은 따로 없어.', '지금 하고 계신 일은 따로 없어요.', '지금 하던 일은 없어.', '지금 따로 하고 있는 일은 없네.'],
      "You're not in the middle of anything right now.", ['今は何かの作業中というわけではない。', '今は何かの作業中というわけではありませんよ。']) : voice(locale, npcId, 'progress', { ko: '진행 중인 행동이 없습니다.', en: 'No activity is in progress.', ja: '進行中の行動はありません。' }[locale]);
    const hour = facts?.location === character.location ? facts.hour : character.hour;
    const remaining = Math.max(0, activity.endsAt - hour), name = fantasyGmActivityName({ ...profile, activity }, locale);
    if (npcId) return npcActivitySpeech(locale,npcId,name,remaining);
    return voice(locale, npcId, 'progress', { ko: `${name}. 남은 시간은 게임 ${remaining.toFixed(2)}시간, 실제 약 ${(remaining * 60 / FANTASY_WORLD_TIME_RATE).toFixed(1)}분입니다.`, en: `${name}. About ${remaining.toFixed(2)} game hours, or ${(remaining * 60 / FANTASY_WORLD_TIME_RATE).toFixed(1)} real minutes, remain.`, ja: `${name}。残りはゲーム内約${remaining.toFixed(2)}時間、実時間約${(remaining * 60 / FANTASY_WORLD_TIME_RATE).toFixed(1)}分です。` }[locale]);
  }
  if (PROGRESS.test(query)) {
    const quests = FANTASY_QUESTS.filter(quest => character.quests.includes(quest.id) && fantasyQuestRecordEligible(character, quest) && (!npc || quest.issuer === npc.id));
    const lines = quests.slice(0, 4).map(quest => {
      const objective = fantasyTaskObjective(quest), current = objective ? fantasyTaskProgress(character, quest) : quest.objective?.type === 'hunt' ? character.contracts?.[quest.id]?.progress ?? 0 : Math.min(quest.count, character.inventory[quest.item] ?? 0);
      const total = objective?.count ?? (quest.objective?.type === 'hunt' ? quest.objective.count : quest.count), title = fantasyQuestText(quest, locale).name;
      if (!npcId) return `${title}: ${current}/${total}`;
      const times = !!objective || quest.objective?.type === 'hunt', unit = objective ? '번' : quest.objective?.type === 'hunt' ? '마리' : '개';
      const hunt = quest.objective?.type === 'hunt';
      return npcLine(locale, npcId,
        [`『${title}』 말이구나. ${total}${unit} 중 ${current}${unit}${hunt ? '를 토벌했어' : times ? '까지 마쳤어' : '는 준비했어'}.`, `『${title}』 말씀이군요. ${total}${unit} 중 ${current}${unit}${hunt ? '를 토벌하셨어요' : times ? '까지 마치셨어요' : '는 준비하셨어요'}.`, `『${title}』라면 ${total}${unit} 중 ${current}${unit}${hunt ? '를 토벌했군' : times ? '까지 마쳤군' : '는 준비했군'}.`, `『${title}』 일은 ${total}${unit} 중 ${current}${unit}${hunt ? '를 토벌했네' : times ? '까지 마쳤네' : '는 준비했네'}.`],
        times ? `For “${title},” you've completed ${current} of the ${total} required${hunt ? ' targets' : ' rounds'}.` : `For “${title},” you have ${current} of the ${total} items needed.`,
        [`『${title}』なら、必要な${total}${hunt ? '匹' : times ? '回' : '個'}のうち${current}${hunt ? '匹を倒している' : times ? '回を終えている' : '個は用意できている'}。`, `『${title}』なら、必要な${total}${hunt ? '匹' : times ? '回' : '個'}のうち${current}${hunt ? '匹を倒しています' : times ? '回を終えています' : '個は用意できています'}よ。`]);
    });
    if (npcId) return lines.join(' ') || npcLine(locale, npcId,
      ['지금 네가 맡고 있는 내 부탁은 없어.', '지금 제 부탁으로 맡고 계신 일은 없어요.', '내게서 맡은 일은 지금 없어.', '지금 내 부탁으로 맡아 둔 일은 없네.'],
      "You don't have any of my requests underway right now.", ['今、私から引き受けている頼み事はない。', '今、私から引き受けている頼み事はありませんよ。']);
    return voice(locale, npcId, 'progress', lines.join(' · ') || { ko: '받아 둔 의뢰가 없습니다.', en: 'You have no accepted quests.', ja: '受注中の依頼はありません。' }[locale]);
  }
  const roomPrices = /^(?:(?:객실|숙박|방)\s*가격(?:을)?(?:\s*알려줘)?|how much (?:are|do) (?:your )?rooms(?: cost)?|(?:客室|部屋|宿泊)の(?:値段|料金)(?:を教えて|は)?)$/u.test(query);
  const mealPrices = /^(?:(?:식사|음식|메뉴)\s*가격(?:을)?(?:\s*알려줘)?|how much (?:are|do) (?:your )?meals(?: cost)?|(?:食事|料理)の(?:値段|料金)(?:を教えて|は)?)$/u.test(query);
  if (roomPrices || mealPrices) {
    const buildings = fantasyBuildings(character);
    const available = roomPrices ? (!npc || npc.building === 'inn') && buildings.some(building => building.id === 'inn') : (!npc || ['inn', 'restaurant'].includes(npc.building)) && buildings.some(building => ['inn', 'restaurant'].includes(building.id));
    if (!available) return npcId ? npcLine(locale, npcId,
      [roomPrices ? '여기서는 방을 내주진 않아.' : '여기서는 식사를 팔진 않아.', roomPrices ? '여기서는 방을 내드리진 않아요.' : '여기서는 식사를 팔진 않아요.', roomPrices ? '여긴 숙박을 받지 않아.' : '여긴 식사를 파는 곳이 아니야.', roomPrices ? '여기서는 묵을 방을 내주지 않네.' : '여기서는 식사를 팔지 않네.'],
      roomPrices ? "We don't offer rooms here." : "We don't serve meals here.", [roomPrices ? 'ここには泊まれる部屋はない。' : 'ここでは食事は出していない。', roomPrices ? 'ここにはお泊まりいただける部屋はありません。' : 'ここではお食事は出していません。']) : {ko:'여기서는 해당 서비스를 제공하지 않습니다.',en:'That service is not offered here.',ja:'ここではそのサービスを提供していません。'}[locale];
    const source = roomPrices ? FANTASY_LODGINGS : FANTASY_DINING;
    const now = facts?.location === character.location ? { ...character, hour: facts.hour } : character;
    if (npcId) return source.map(service => npcServicePrice(locale, npcId, service.name[locale], fantasyPrice(now, service.cost, roomPrices ? 'room' : 'food'), roomPrices ? service.hours : undefined)).join(' ');
    return voice(locale, npcId, 'prices', source.map(service => `${service.name[locale]}: ${fantasyPrice(now, service.cost, roomPrices ? 'room' : 'food')}G`).join(' · '));
  }
  const requested = priceQuestion(text);
  const stock = STOCK.test(query);
  if (!requested && !stock) return undefined;
  if (!facts || facts.location !== character.location) return npcId ? npcLine(locale, npcId,
    ['지금 물건값을 확인하기가 어렵네. 잠깐 뒤에 다시 물어봐 줘.', '지금은 물건값을 확인하기가 어려워요. 잠시 뒤에 다시 물어봐 주세요.', '지금은 값을 확인할 수 없어. 잠깐 뒤에 다시 물어봐.', '지금은 물건값을 확인하기 어렵네. 조금 뒤에 다시 물어봐 주게.'],
    "I can't check the prices just now. Ask me again in a little while.", ['今は値段を確かめられない。少し待ってから聞いてくれ。', '今はお値段を確かめられません。少し待ってから、もう一度聞いてくださいね。']) : { ko: '현재 거래 정보를 확인할 수 없습니다.', en: 'Current trading information is unavailable.', ja: '現在の取引情報を確認できません。' }[locale];
  const shops = facts.shops.filter(shop => !npc || shop.building === npc.building);
  const lines = shops.flatMap(shop => requested?.sell ? shop.sales.filter(lot => lot.canSell && lot.item === requested.item).map(lot => npcId ? npcGoodsPrice(locale,npcId,itemName(lot.item,locale),lot.unitPrice,lot.count,true) : `${itemName(lot.item, locale)} ×${lot.count}: ${lot.unitPrice}G/${{ko:'개',en:'each',ja:'個'}[locale]}`) : shop.lots.filter(lot => lot.count > 0 && (!requested?.item || lot.item === requested.item)).slice(0, stock ? 10 : 4).map(lot => npcId ? npcGoodsPrice(locale,npcId,itemName(lot.item,locale),lot.unitPrice,lot.count) : `${itemName(lot.item, locale)}: ${lot.unitPrice}G · ×${lot.count}`));
  if (npcId) return lines.join(' ') || npcLine(locale, npcId,
    [requested?.sell ? '지금은 그 물건을 사들일 수 없어.' : '그 물건은 지금 남아 있는 게 없어.', requested?.sell ? '지금은 그 물건을 사들이기 어려워요.' : '그 물건은 지금 남아 있는 게 없어요.', requested?.sell ? '그 물건은 지금 안 사.' : '그 물건은 지금 없어.', requested?.sell ? '지금은 그 물건을 사들이지 않네.' : '그 물건은 지금 남아 있지 않네.'],
    requested?.sell ? "I can't buy that from you right now." : "I don't have any of that available right now.", [requested?.sell ? '今はその品を買い取れない。' : 'その品は今、手元に残っていない。', requested?.sell ? '今はその品を買い取れません。' : 'その品は今、品切れなんです。']);
  return voice(locale, npcId, 'prices', lines.join(' · ') || { ko: '지금 거래할 수 있는 해당 물건은 없습니다.', en: 'No matching goods can be traded now.', ja: '今取引できる該当の品物はありません。' }[locale]);
}
export function dynamicNpcReply(locale: NpcLocale, npcId: NpcId, text: string, character?: FantasyCharacter, facts?: DialogueDynamicContext): string | undefined {
  return dynamicReply(locale, text, { character } as FantasyProfile, facts, npcId);
}
export function dynamicGmReply(locale: NpcLocale, text: string, profile: FantasyProfile, facts?: DialogueDynamicContext): string | undefined {
  return dynamicReply(locale, text, profile, facts);
}
export function dialogueDynamicPremises(locale: NpcLocale, profile: FantasyProfile, facts?: DialogueDynamicContext, npcId?: NpcId, query = ''): string[] {
  const character = profile.character, npc = npcId && NPC_PUBLIC.find(person => person.id === npcId);
  if (!character || !facts || facts.location !== character.location || !['ko','en','ja'].includes(locale) || npcId && (!npc || npc.homeLocation !== character.location)) return [];
  const output: string[] = [];
  let remaining = 500;
  const append = (value: string) => {
    const separator = output.length ? 1 : 0;
    if (!value || remaining <= separator || output.length >= 3) return;
    const line = value.replace(/[\r\n]+/gu,' ').slice(0, Math.min(220, remaining-separator)).replace(/[\uD800-\uDBFF]$/u,'');
    output.push(line); remaining -= line.length+separator;
  };
  const q=normal(query);
  if(!q||/날씨|기온|온도|더위|더운|덥|더워|추위|추운|춥|추워|쌀쌀|외투|겉옷|옷차림|우산|서리|바깥|밖에|비가|눈이|\b(?:weather|temperatures?|hot|heat|cold|warm|chilly|frost|freezing|rain|snow|storm|umbrella|clothes|clothing|coat|jacket|wear|outside|outdoors)\b|天気|気温|暑|寒|暖|霜|雨|雪|嵐|上着|服装|傘|屋外|外へ/u.test(q)){
    const environment = fantasyEnvironment({location:character.location,hour:facts.hour});
    const weather = {clear:{ko:'맑음',en:'clear',ja:'晴れ'},cloudy:{ko:'흐림',en:'cloudy',ja:'曇り'},rain:{ko:'비',en:'rain',ja:'雨'},snow:{ko:'눈',en:'snow',ja:'雪'}}[environment.weather][locale];
    append(npcId ? npcWeather(locale,npcId,environment.weather,environment.temperature) : ({ko:`현재 날씨: ${weather}, ${environment.temperature}°C.`,en:`Current weather: ${weather}, ${environment.temperature}°C.`,ja:`現在の天気：${weather}、${environment.temperature}°C。`})[locale]);
  }
  if(!q||/소문|소식|\b(?:news|rumou?rs?)\b|噂|うわさ|知らせ/u.test(q)){
    const notices=facts.rumors.filter(note=>Math.floor(note.hour/24)===Math.floor(facts.hour/24)&&note.hour<=facts.hour).slice(-1);
    append(notices.length ? ({ko:'오늘 확인된 지역 소식: ',en:'Local news verified today: ',ja:'今日確認された地域の知らせ：'})[locale]+notices[0].text : ({ko:'오늘 확인된 새로운 지역 소식은 없습니다.',en:'No new local news has been verified today.',ja:'今日確認された新しい地域の知らせはありません。'})[locale]);
  }
  if (!/가격|얼마|재고|상품|판매|파는|구매|물건|가격표|price|cost|how much|stock|wares|sell|buy|値段|価格|いくら|在庫|商品|買|売/u.test(q)) return output;
  const room=/객실|숙박|\brooms?\b|lodging|部屋|客室|宿泊/u.test(q), meal=/식사|메뉴|\bmeals?\b|\bmenu\b|食事|料理|献立/u.test(q);
  const available=fantasyBuildings(character);
  if (room && (!npc || npc.building==='inn') && available.some(building=>building.id==='inn') || meal && (!npc || ['inn','restaurant'].includes(npc.building)) && available.some(building=>['inn','restaurant'].includes(building.id))) {
    const source=room?FANTASY_LODGINGS:FANTASY_DINING;
    append(({ko:'현재 서비스 가격: ',en:'Current service prices: ',ja:'現在のサービス料金：'})[locale]+source.map(service=>`${service.name[locale]} ${fantasyPrice({...character,hour:facts.hour},service.cost,room?'room':'food')}G`).join(' · '));
    return output;
  }
  const lots=facts.shops.filter(shop=>!npc||shop.building===npc.building).flatMap(shop=>shop.lots.filter(lot=>lot.count>0));
  const matched=lots.filter(lot=>[lot.item,...(['ko','en','ja'] as const).map(language=>itemName(lot.item,language))].some(value=>{
    const name=normal(value);
    return /^[a-z0-9 -]+$/u.test(name)?new RegExp(`(^|[^a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}($|[^a-z0-9])`,'u').test(q):q.replace(/\s/gu,'').includes(name.replace(/\s/gu,''));
  }));
  const selected=matched.length?matched:STOCK.test(q)?lots.slice(0,3):[];
  if(selected.length) append(({ko:'현재 판매품과 개당 가격: ',en:'Currently available goods and unit prices: ',ja:'現在の販売品と単価：'})[locale]+selected.slice(0,3).map(lot=>`${itemName(lot.item,locale)} ${lot.unitPrice}G ×${lot.count}`).join(' · '));
  return output;
}
