import type { FantasyEconomyMerchantView } from '../shared/fantasy-economy.ts';
import { npcMapMerchantReply, npcMapMerchantFacts, npcMapMerchantUnverifiedSpeech } from './npc-map-merchant.ts';
import { NPC_PUBLIC, type NpcId, type NpcLocale } from '../shared/npc.ts';
import type { FantasyAction, FantasyCharacter } from '../shared/fantasy.ts';
import { FANTASY_ITEMS, FANTASY_JOBS, FANTASY_QUESTS, FANTASY_RECIPES } from '../shared/fantasy-data.ts';
import { FANTASY_MAPS, fantasyBuildings, fantasyBuildingStock, fantasyCraftFacility, fantasyLibraryHoldings } from '../shared/fantasy-town.ts';
import { FANTASY_DINING, FANTASY_LODGINGS } from '../shared/fantasy-life.ts';
import { FANTASY_LIBRARY_BOOKS } from '../shared/fantasy-library.ts';
import { fantasyPrice } from '../shared/fantasy-reputation.ts';
import { fantasyNpcMentorSkills } from '../shared/fantasy-apprenticeship.ts';
import { FANTASY_BOAT_OPTIONS } from '../shared/fantasy-gathering.ts';
import { npcBreaksFourthWall } from './npc-speech.ts';
import { fantasyTermName } from '../shared/fantasy-lore.ts';
import type { FantasyContractBoard } from '../shared/fantasy-contracts.ts';
import { fantasyQuestEligible } from '../shared/fantasy-access.ts';
import { fantasyQuestText } from '../shared/fantasy-narrative.ts';
import { npcReadingSubject } from '../shared/npc-reading.ts';
import { fantasyNpcTone } from '../shared/fantasy-dialogue-voice.ts';
import type { DialogueDynamicContext } from './dialogue-dynamic.ts';

const normal = (value: string) => value.normalize('NFKC').toLowerCase();
function mentions(query: string, value: string) {
  const name = normal(value);
  if (!name) return false;
  return /^[a-z0-9 -]+$/.test(name) || /^[가-힣]$/u.test(name) ? new RegExp(namePattern(name), 'u').test(query) : query.replace(/\s/g, '').includes(name.replace(/\s/g, ''));
}
const itemName = (id: string, locale: NpcLocale) => FANTASY_ITEMS.find(item => item.id === id)?.names?.[locale]
  ?? FANTASY_MAPS.find(map => map.item === id)?.name[locale] ?? fantasyTermName(id, locale);
const roomTopic = /객실|숙박|숙소|방(?:은|을|이|의|을|종류|\s*종류)|트리플|펜션|\b(?:rooms?|lodging|suite|pension|triple)\b|客室|部屋|宿泊|ペンション|トリプル/;
const foodTopic = /식사|음식|먹거리|메뉴|요리|먹을|\b(?:food|meals?|menu|dining|serve|dishes)\b|食事|料理|献立|メニュー/;
const stockTopic = /판매|파는|파나요|팔아|상품|물건|재고|품목|사고|구매|살수|살 수|얼마|가격|\b(?:sell|selling|stock|wares|goods|buy|purchase|price|cost)\b|売[るりっ]|品物|商品|在庫|買|値段|価格|いくら/;
const bookTopic = /도서|소장|책|서적|\b(?:books?|library|collection|shelves)\b|蔵書|本|書籍|図書/;
const teachingTopic = /가르치|가르칠|배울|배우|지도|직업|기술|\b(?:teach|learn|profession|lessons?|skills?)\b|教え|学べ|職業|技能|指導/;
const craftingTopic = /제작|만들|제련|조합|\b(?:craft|make|forge|recipes?)\b|制作|作れ|鍛え|調合/;
const generalTopic = /(?:여기|이곳|이\s*가게|이\s*시설).*(?:뭐|무엇|어떤|할\s*수)|무슨\s*서비스|어떤\s*서비스|what.*(?:offer|available|this place)|your (?:services|establishment)|こ(?:こ|の店).*(?:何|でき)|どんな.*施設/;
function namePattern(name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (/^[a-z0-9 -]+$/u.test(name)) return `(?<![a-z0-9])${escaped}(?![a-z0-9])`;
  if (/^[가-힣]$/u.test(name)) return `(?<![가-힣])${escaped}(?=(?:은|는|을|를|이|가|의|에서|에|도)?(?:$|[^가-힣]|가격|얼마|재고|몇\\s*개))`;
  return escaped;
}
const registeredFacilityNames = new RegExp([...new Set([
  ...FANTASY_ITEMS.flatMap(item => [item.id,...(['ko','en','ja'] as const).map(locale=>itemName(item.id,locale))]), ...FANTASY_MAPS.flatMap(map=>[map.item,...Object.values(map.name)]),
  ...FANTASY_LIBRARY_BOOKS.filter(book=>book.inGame!==false).flatMap(book=>[book.id,...Object.values(book.title)]), ...FANTASY_JOBS.flatMap(job=>[job.id,...Object.values(job.names)]),
  ...FANTASY_LODGINGS.flatMap(room=>[room.id,...Object.values(room.name)]), ...FANTASY_DINING.flatMap(meal=>[meal.id,...Object.values(meal.name)]),
].map(normal))].filter(Boolean).sort((a,b)=>b.length-a.length).map(namePattern).join('|'),'gu');

export function npcFacilityQuerySupported(npcId: NpcId, text: string, character?: FantasyCharacter): boolean {
  const k = npcFacilityKnowledge(npcId, character);
  let query = normal(text).replace(/[.!?。！？]+$/u, '').trim();
  if (!query || query.length > 220 || /[\r\n\p{Cc}\p{Cf}<>{}\[\]]/u.test(query)) return false;
  if (roomTopic.test(query) && foodTopic.test(query)) return false;
  query = query.replace(registeredFacilityNames,' ');
  for (const name of k.skills.flatMap(skill=>[skill.id,...Object.values(skill.names)]).map(normal).sort((a,b)=>b.length-a.length)) if(name)query=query.replace(new RegExp(namePattern(name),'gu'),' ');
  if (/[.!?。！？;；]/u.test(query) || /\b(?:and|or|but|because|why|if)\b|그리고|하지만|왜|만약|けれど|けど|なぜ|どうして|それと|それから/u.test(query)) return false;
  const english = new Set('what which are is do does can could would you i have has here there this that the a an your at in on for to of about from me please tell show offer offers available sell selling sold stock wares goods buy purchase price prices cost costs how much many rooms room type types lodging inn stay food meal meals menu dining serve dishes book books library collection shelves shelf teach learn profession professions lesson lessons skills skill craft make forge recipe recipes workshop rent fishing boat boats contracts contract quests quest postings posted description describe effect effects mean meaning hold holdings provide services establishment place normal discount special standard pension triple'.split(' '));
  query = query.replace(/[a-z]+/gu, word => english.has(word) ? '' : word);
  query = query.replace(/(?:여기서는|여기서|여기는|여기|이곳에서는|이곳에서|이곳은|이곳|이\s*가게|이\s*시설|지금|현재|받을|받는|받아볼|있는|주문|어떤|어느|무슨|무엇|뭔가요|뭐야|뭘|뭐|어떻게|할\s*수\s*있(?:어|나요|어요)|할\s*수|배울\s*수\s*있(?:어|나요|어요)|배울\s*수|가르쳐|가르칠|가르치|알려주세요|알려줘|보여주세요|보여줘|설명해주세요|설명해줘|설명|알고\s*싶어|궁금해|있나요|있어요|있어|있니|있습니까|있을까|인가요|일까|예요|이에요|얼마(?:야|예요|인가요)?|종류|몇\s*개|가격|값|재고|판매|파는|팔아|파나요|팔고|상품|물건|품목|구매|살\s*수|사고|객실|숙박|숙소|방|특별|할인|트리플|펜션|일반|음식|식사|먹거리|메뉴|요리|먹을|책|도서|소장|서적|제작|만들|제련|조합|직업|기술|스킬|배우|배울|어선|배|대여|빌릴|빌려|의뢰|게시|내용|효과|뜻|추천|서비스|주세요|수|는|은|을|를|이|가|의|에서|에|도|좀|요|야)/gu, '');
  query = query.replace(/(?:いま|今|現在|ここでは|ここで|ここ|この店|この施設|どんな|どの|何が|何を|何|なに|できる|できますか|できます|教えてください|教えて|見せてください|見せて|ありますか|ある|あります|ですか|って|どういう|について|種類|値段|価格|料金|いくら|商品|品物|在庫|売る|売り|買う|買える|客室|部屋|宿泊|割引|トリプル|ペンション|食事|料理|献立|メニュー|蔵書|書籍|図書|本|技能|職業|学べますか|学べる|学べ|学ぶ|教えられますか|教えられる|教え|指導|制作|作れる|作れ|鍛え|調合|漁船|船|借りる|借り|借|依頼|掲示|意味|内容|説明|効果|サービス|は|を|の|が|に|で|も|と)/gu, '');
  return !query.replace(/[\s\p{P}\p{S}]/gu, '');
}

export function npcFacilityKnowledge(npcId: NpcId, character?: FantasyCharacter, dynamicFacts?: DialogueDynamicContext) {
  const npc = NPC_PUBLIC.find(npc => npc.id === npcId)!;
  const place = { location: npc.homeLocation };
  const building = fantasyBuildings(place).find(building => building.id === npc.building);
  const current = dynamicFacts?.location === npc.homeLocation && character?.location === npc.homeLocation ? dynamicFacts : undefined;
  const priceState = character?.location === npc.homeLocation ? { ...character, hour: current?.hour ?? character.hour } : { ...place, hour: 0, bargains: undefined };
  const catalogStock = building ? fantasyBuildingStock(place, building.id) : [];
  const lots = current?.shops.filter(shop => shop.building === building?.id).flatMap(shop => shop.lots.filter(lot => lot.count > 0));
  const stock = lots ? [...new Set(lots.map(lot => lot.item))] : catalogStock;
  const books = building?.id === 'library' ? FANTASY_LIBRARY_BOOKS.filter(book => book.inGame !== false && fantasyLibraryHoldings(place).includes(book.id)) : [];
  const jobs = FANTASY_JOBS.filter(job => npc.trainableJobs?.includes(job.id));
  const skills = fantasyNpcMentorSkills(npcId, character);
  const recipes = building ? FANTASY_RECIPES.filter(recipe => fantasyCraftFacility(recipe.job) === building.id) : [];
  const price = (base: number, service: 'room' | 'food' | 'goods') => fantasyPrice(priceState, base, service);
  return { npc, building, stock, catalogStock, lots, books, jobs, skills, recipes, price };
}

function goodsLine(knowledge: ReturnType<typeof npcFacilityKnowledge>, id: string, locale: NpcLocale) {
  const quotes = knowledge.lots?.filter(lot => lot.item === id).map(lot => `${lot.unitPrice}G ×${lot.count}`);
  return `${itemName(id, locale)}${quotes?.length ? ` ${quotes.join(' / ')}` : ''}`;
}

const spokenList = (values: string[], locale: NpcLocale) => values.length < 2 ? values[0] ?? ''
  : locale === 'en' ? `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`
    : values.join(locale === 'ko' ? ', ' : '、');
const politeVoice = (npcId: NpcId) => ['scholar', 'priest', 'trade'].includes(fantasyNpcTone(npcId));
const sturdyVoice = (npcId: NpcId) => ['forge', 'leader'].includes(fantasyNpcTone(npcId));
const koEnd = (npcId: NpcId, polite: string, casual: string, sturdy = casual) => politeVoice(npcId) ? polite : sturdyVoice(npcId) ? sturdy : casual;
const jaEnd = (npcId: NpcId, polite: string, casual: string) => politeVoice(npcId) ? polite : casual;
const koTopic = (word: string) => `${word}${koHasFinalConsonant(word) ? '은' : '는'}`;

function serviceIntroduction(k: ReturnType<typeof npcFacilityKnowledge>, locale: NpcLocale): string | undefined {
  const npcId=k.npc.id,tone=fantasyNpcTone(npcId);
  const services: string[]=[];
  if(k.building?.id==='inn')services.push({ko:koEnd(npcId,'객실을 잡고 쉬실 수 있어요.','방을 잡고 쉬어 갈 수 있어.','방을 잡고 쉬어 갈 수 있네.'),en:'You can get a room and rest here.',ja:jaEnd(npcId,'お部屋を取って休めますよ。','部屋を取って休んでいけるよ。')}[locale]);
  if(['inn','restaurant'].includes(k.building?.id??''))services.push({ko:koEnd(npcId,'식사도 준비해 드려요.','식사도 차려 줘.','식사도 차려 주네.'),en:'I also serve meals.',ja:jaEnd(npcId,'食事もご用意しています。','食事も出しているよ。')}[locale]);
  if(k.stock.length)services.push({ko:koEnd(npcId,'물건을 살펴보고 사실 수도 있어요.','물건을 둘러보고 살 수도 있어.','물건을 살펴보고 살 수도 있네.'),en:tone==='trade'?'You can browse the goods and choose what suits you.':tone==='forge'?'There are goods here to put to use.':'You can buy goods here as well.',ja:jaEnd(npcId,'品物を見比べて、お買い物もできます。','品物を見比べて買っていけるよ。')}[locale]);
  if(k.books.length)services.push({ko:koEnd(npcId,'서가의 책을 골라 천천히 읽으실 수 있어요.','서가에서 책을 골라 천천히 읽을 수 있어.','서가에서 책을 골라 읽을 수 있네.'),en:'You can choose a book from the shelves and take your time reading.',ja:jaEnd(npcId,'書棚から本を選んで、ゆっくり読んでいけます。','書棚から本を選んで、ゆっくり読めるよ。')}[locale]);
  if(k.building?.id==='guild')services.push({ko:koEnd(npcId,'게시된 의뢰도 살펴보실 수 있어요.','게시된 의뢰도 살펴볼 수 있어.','게시된 의뢰를 살피고 맡을 일을 정할 수 있네.'),en:'You can look over the posted contracts.',ja:jaEnd(npcId,'掲示された依頼も見られます。','掲示された依頼も見られるよ。')}[locale]);
  if(k.jobs.length||k.skills.length)services.push({ko:{host:'내가 익힌 분야를 차근차근 가르쳐 줄 수도 있어.',trade:'제가 아는 분야를 배우는 수업도 있어요.',forge:'내가 익힌 솜씨는 가르쳐 줄 수 있네.',scholar:'제가 아는 분야는 차근히 배우실 수도 있어요.',priest:'제가 아는 분야라면 함께 익혀 가실 수 있어요.',leader:'내가 지도하는 수련도 있네.',covert:'내 분야의 일이라면 가르칠 수 있어.',neighbour:'내가 할 줄 아는 걸 배워 볼 수도 있어.'}[tone],en:tone==='leader'?'I also oversee training in my field.':tone==='covert'?'I can teach within my own field.':tone==='forge'?'I can also pass on the craft I know.':'I also give lessons in my field.',ja:jaEnd(npcId,'私の専門を学ぶ稽古もしています。','私の専門なら、教えられる。')}[locale]);
  if(k.recipes.length)services.push({ko:koEnd(npcId,'여기서 만들 수 있는 물건도 있어요.','여기서 만들 수 있는 물건도 있어.','여기서 만들 수 있는 물건도 있네.'),en:'You can make certain items here too.',ja:jaEnd(npcId,'ここで作れる物もあります。','ここで作れる物もあるよ。')}[locale]);
  if(!services.length)return undefined;
  const location=fantasyTermName(k.npc.homeLocation,locale);
  const place=k.building?{ko:`${location}의 ${k.building.name.ko}`,en:`the ${k.building.name.en} in ${location}`,ja:`${location}の${k.building.name.ja}`}[locale]:k.npc.role[locale];
  const role=`${/^[aeiou]/iu.test(k.npc.role.en)?'an':'a'} ${k.npc.role.en.toLowerCase()}`;
  const introductions={
    host:{ko:`여긴 ${place}${koCopula(place)}.`,en:k.building?`Welcome to ${place}.`:`I work as ${role}.`,ja:k.building?`ここは${place}だよ。`:`私は${place}なんだ。`},
    trade:{ko:`${place}${koCopula(place,true)}.`,en:k.building?`This is ${place}.`:`I work as ${role}.`,ja:k.building?`${place}です。`:`私は${place}です。`},
    forge:{ko:`여긴 ${place}이라네.`.replace(/이라네\.$/u,koHasFinalConsonant(place)?'이라네.':'라네.'),en:k.building?`You're at ${place}. Here's what we do.`:`I work as ${role}.`,ja:k.building?`ここは${place}だ。できることは、こんなところだ。`:`私は${place}だ。`},
    scholar:{ko:`제가 맡는 곳은 ${place}${koCopula(place,true)}.`,en:k.building?`I look after ${place}.`:`I work as ${role}.`,ja:k.building?`私の持ち場は${place}です。`:`私の仕事は${place}です。`},
    priest:{ko:`여기는 ${place}${koCopula(place,true)}.`,en:k.building?`Here at ${place}, this is what I can help with.`:`As ${role}, this is where I can help.`,ja:k.building?`ここは${place}です。私にお手伝いできるのは、こんなことです。`:`${place}として、お手伝いできるのはこんなことです。`},
    leader:{ko:`여긴 ${place}${koHasFinalConsonant(place)?'이라네':'라네'}. 할 일을 짚어 보지.`,en:k.building?`You're at ${place}. Let's go over what can be done.`:`I work as ${role}. Here's the practical side.`,ja:k.building?`ここは${place}だ。できることを確かめよう。`:`私は${place}だ。できることを確かめよう。`},
    covert:{ko:k.building?`여긴 ${place}${koCopula(place)}.`:`난 ${place}${koCopula(place)}.`,en:k.building?`This is ${place}.`:`I work as ${role}.`,ja:k.building?`ここは${place}だ。`:`私は${place}だ。`},
    neighbour:{ko:k.building?`이곳은 ${place}${koCopula(place)}.`:`난 ${place}${koCopula(place)}.`,en:k.building?`This is ${place}.`:`I work as ${role}.`,ja:k.building?`ここは${place}だよ。`:`私は${place}だよ。`},
  }[tone][locale];
  const endings={
    host:{ko:'여행길엔 밥과 잠도 잘 챙겨야 하니까.',en:'A meal and a little rest can make a difference on the road.',ja:'旅では、ご飯と休息も大事だからね。'},
    trade:{ko:'서두르지 않으셔도 돼요. 값을 잘 살피고 고르세요.',en:'Take your time and compare the prices.',ja:'急がず、値段も見比べて選んでくださいね。'},
    forge:{ko:'쓸모가 있는지부터 따져 보는 게 좋지.',en:'Usefulness comes first, as far as I’m concerned.',ja:'私としては、まず役に立つかどうかだ。'},
    scholar:{ko:'급하게 훑기보다는 차근히 살펴보는 편이 좋아요.',en:'It pays to take a careful look rather than hurry through.',ja:'急いで済ませるより、一つずつ確かめるほうがよいですよ。'},
    priest:{ko:'한 번에 서두르지 않으셔도 괜찮아요.',en:'There is no need to rush through everything at once.',ja:'一度に急いで進めなくても大丈夫ですよ。'},
    leader:{ko:'준비는 하나씩 확실히 해 두는 게 좋네.',en:'Make each preparation count.',ja:'準備は一つずつ、確実にしておこう。'},
    covert:{ko:'내가 맡는 일은 거기까지야.',en:'That is the extent of my business here.',ja:'私が扱うのは、そこまでだ。'},
    neighbour:{ko:'손에 익는 일부터 천천히 하면 돼.',en:'Start with whatever feels familiar and take it from there.',ja:'慣れたことから、ゆっくり始めればいいよ。'},
  }[tone][locale];
  const ending=tone==='host'&&!['inn','restaurant'].includes(k.building?.id??'')?{ko:'천천히 둘러봐도 좋아.',en:'You can take your time looking around.',ja:'ゆっくり見ていってね。'}[locale]:endings;
  return [introductions,...services,ending].join(locale==='ja'?'':' ');
}

function goodsSpeech(knowledge: ReturnType<typeof npcFacilityKnowledge>, id: string, locale: NpcLocale) {
  const name = itemName(id, locale), npcId = knowledge.npc.id;
  const lots = knowledge.lots?.filter(lot => lot.item === id);
  if (!lots?.length) return {
    ko: `${name}${koHasFinalConsonant(name) ? '을' : '를'} ${koEnd(npcId, '팔고 있어요.', '팔고 있어.', '팔고 있네.')}`,
    en: `I have ${name} for sale.`,
    ja: `${name}も${jaEnd(npcId, '扱っています。', '扱っているよ。')}`,
  }[locale];
  if (lots.length === 1) {
    const lot = lots[0],tone=fantasyNpcTone(npcId);
    return {
      ko: {
        host:`${koTopic(name)} 한 개에 ${lot.unitPrice}G야. 지금 ${lot.count}개 챙겨 줄 수 있어.`,trade:`${koTopic(name)} 한 개에 ${lot.unitPrice}G예요. 지금 ${lot.count}개 있어요.`,
        forge:`${koTopic(name)} 한 개에 ${lot.unitPrice}G라네. 남은 건 ${lot.count}개지.`,scholar:`확인해 보니 ${koTopic(name)} 한 개에 ${lot.unitPrice}G예요. 지금 ${lot.count}개 남아 있어요.`,
        priest:`${koTopic(name)} 한 개에 ${lot.unitPrice}G예요. 준비되어 있는 건 ${lot.count}개예요.`,leader:`${koTopic(name)} 한 개에 ${lot.unitPrice}G라네. 확보할 수 있는 건 ${lot.count}개네.`,
        covert:`${name}, 한 개에 ${lot.unitPrice}G야. 내줄 수 있는 건 ${lot.count}개뿐이야.`,neighbour:`${koTopic(name)} 한 개에 ${lot.unitPrice}G야. 지금 ${lot.count}개 남아 있어.`,
      }[tone],
      en:{host:`${name} is ${lot.unitPrice}G each. I can spare ${lot.count} for you.`,trade:`${name} costs ${lot.unitPrice}G each, and I have ${lot.count} left.`,forge:`${lot.unitPrice}G apiece for ${name}. ${lot.count} left.`,scholar:`I've checked. ${name} is ${lot.unitPrice}G each, with ${lot.count} available.`,priest:`${name} is ${lot.unitPrice}G each. There are ${lot.count} here.`,leader:`${name} is ${lot.unitPrice}G each. We have ${lot.count} on hand.`,covert:`For ${name}, ${lot.unitPrice}G each. I can part with ${lot.count}.`,neighbour:`It's ${lot.unitPrice}G each for ${name}, and ${lot.count} are left.`}[tone],
      ja:{host:`${name}は1個${lot.unitPrice}Gだよ。今なら${lot.count}個用意できるよ。`,trade:`${name}は1個${lot.unitPrice}Gで、今${lot.count}個あります。`,forge:`${name}は1個${lot.unitPrice}Gだ。残りは${lot.count}個だな。`,scholar:`確認しました。${name}は1個${lot.unitPrice}Gで、在庫は${lot.count}個です。`,priest:`${name}は1個${lot.unitPrice}Gです。今ご用意できるのは${lot.count}個ですよ。`,leader:`${name}は1個${lot.unitPrice}Gだ。確保できるのは${lot.count}個だ。`,covert:`${name}なら1個${lot.unitPrice}G。渡せるのは${lot.count}個だけだ。`,neighbour:`${name}は1個${lot.unitPrice}Gで、残りは${lot.count}個だよ。`}[tone],
    }[locale];
  }
  return {
    ko: `${koTopic(name)} ${spokenList(lots.map(lot => `개당 ${lot.unitPrice}G인 게 ${lot.count}개`), 'ko')} ${koEnd(npcId, '있어요.', '있어.', '있네.')}`,
    en: `For ${name}, I have ${spokenList(lots.map(lot => `${lot.count} at ${lot.unitPrice}G each`), 'en')}.`,
    ja: `${name}なら、${spokenList(lots.map(lot => `1個${lot.unitPrice}Gのものが${lot.count}個`), 'ja')}${jaEnd(npcId, 'あります。', 'あるよ。')}`,
  }[locale];
}

function roomSpeech(locale: NpcLocale, knowledge: ReturnType<typeof npcFacilityKnowledge>) {
  return FANTASY_LODGINGS.map(room => ({
    ko: `${koTopic(room.name.ko)} ${room.hours}시간 묵는 데 ${knowledge.price(room.cost, 'room')}G${koEnd(knowledge.npc.id, '예요.', '야.', '라네.')}`,
    en: `${room.name.en} costs ${knowledge.price(room.cost, 'room')}G for ${room.hours} hours.`,
    ja: `${room.name.ja}は${room.hours}時間で${knowledge.price(room.cost, 'room')}G${jaEnd(knowledge.npc.id, 'です。', 'だよ。')}`,
  })[locale]).join(locale === 'ja' ? '' : ' ');
}

function roomLines(locale: NpcLocale, knowledge: ReturnType<typeof npcFacilityKnowledge>, detailed = false) {
  return FANTASY_LODGINGS.map(room => `${room.name[locale]} ${knowledge.price(room.cost, 'room')}G / ${room.hours}${{ ko: '시간', en: ' hours', ja: '時間' }[locale]}${detailed ? { ko: `, 피로 회복 ${room.fatigueRecovery}`, en: `, fatigue recovery ${room.fatigueRecovery}`, ja: `、疲労回復${room.fatigueRecovery}` }[locale] : ''}`).join(' · ');
}
const join = (values: string[]) => values.join(' · ');
const koHasFinalConsonant = (text: string) => {
  const last = text.trim().codePointAt(text.trim().length - 1) ?? 0;
  return last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
};
const koCopula = (text: string, polite = false) => {
  const consonant = koHasFinalConsonant(text);
  return polite ? consonant ? '이에요' : '예요' : consonant ? '이야' : '야';
};

const bookKey = (value: string) => normal(value).replace(/[\s\p{P}\p{S}]/gu, '');

export function npcLibraryReading(locale: NpcLocale, npcId: NpcId, text: string, character?: FantasyCharacter): { text: string; actions: FantasyAction[] } | undefined {
  const subject = npcReadingSubject(text);
  if (subject === undefined) return undefined;
  const k = npcFacilityKnowledge(npcId, character);
  if (k.building?.id !== 'library') return undefined;
  const polite = ['scholar', 'priest', 'trade'].includes(fantasyNpcTone(npcId));
  const fragment = bookKey(subject);
  const matched = FANTASY_LIBRARY_BOOKS.filter(book => book.inGame !== false && [book.id, ...Object.values(book.title)].some(title => fragment.includes(bookKey(title))));
  let remainder = fragment;
  const titles = matched.flatMap(book => [book.id, ...Object.values(book.title)]).map(bookKey).sort((a, b) => b.length - a.length);
  for (const title of titles) remainder = remainder.split(title).join('');
  // 未登録の続編名などを、題名の一部だけで既刊へ置き換えない。
  const named = /^(?:(?:와|과|랑|하고|그리고|및|또는|도|또|and|or|と|や|それから))*$/u.test(remainder) ? matched : [];
  const local = new Set(k.books.map(book => book.id));
  // 他館の正式題名を、この書棚の短い断片へ読み替えない。
  const foreign = named.some(book => !local.has(book.id));
  const generic = !fragment || /^(?:이|그|저|아무|아무책이나|책아무거나|book|books|abook|thebook|thisbook|thatbook|anybook|本|この本|その本|何かの本)$/u.test(fragment);
  const distinctive = /[가-힣\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(fragment) ? Array.from(fragment).length >= 2
    : fragment.length >= 4 && !/^(?:this|that|with|from|about|please|read|study|book|books)$/u.test(fragment);
  if (generic) return { text: {
    ko: `${spokenList(k.books.map(book => `『${book.title.ko}』`), 'ko')} 같은 책이 ${polite ? '있어요. 읽고 싶은 책이 있으면 제목을 말씀해 주세요.' : '있어. 읽고 싶은 책이 있으면 제목을 말해 줘.'}`,
    en: `I keep ${spokenList(k.books.map(book => book.title.en), 'en')} on these shelves. Tell me which book you'd like to read.`,
    ja: `${spokenList(k.books.map(book => `『${book.title.ja}』`), 'ja')}などがあります。読みたい本があれば、題名を教えてください。`,
  }[locale], actions: [] };
  const books = foreign ? [] : named.length ? named.filter(book => local.has(book.id))
    : distinctive ? k.books.filter(book => Object.values(book.title).some(title => bookKey(title).includes(fragment))) : [];
  if (!books.length) return { text: {
    ko: polite ? '그 제목의 책은 이 서가에서 찾기 어렵네요. 정확한 제목을 알려 주시거나, 여기 있는 책을 물어봐 주세요.' : '그 제목의 책은 이 서가에서 찾기 어렵네. 정확한 제목을 알려 주거나, 여기 있는 책을 물어봐 줘.',
    en: 'I cannot find that title on these shelves. Tell me its exact title, or ask which books we hold.',
    ja: 'その題名の本はこの書棚では見つかりません。正確な題名か、こちらの蔵書をお尋ねください。',
  }[locale], actions: [] };
  if (!character || character.location !== k.npc.homeLocation || !fantasyBuildings(character).some(building => building.id === 'library' && building.npcIds.includes(npcId))) return { text: {
    ko: polite ? '서고로 직접 오시면 책을 준비해 드릴게요.' : '서고에 직접 찾아오면 책을 준비해 줄게.', en: 'Visit the library in person and I can bring you a book.', ja: '書庫へ直接来てくれれば、本を用意できます。',
  }[locale], actions: [] };
  const unread = books.filter(book => !character.readBooks?.includes(book.id));
  if (!unread.length) return { text: {
    ko: polite ? '그 책은 이미 정독하셨어요. 다시 살펴보시거나 다른 책을 골라 보세요.' : '그 책은 이미 정독했어. 내용을 다시 살펴보거나 다른 책을 골라 봐.',
    en: 'You have already studied that book. You can look through it again or choose another.',
    ja: 'その本はすでに精読しています。内容を見直すか、別の本を選んでみてください。',
  }[locale], actions: [] };
  const names = join(unread.map(book => book.title[locale]));
  return { text: {
    ko: unread.length === 1 ? `『${names}』${koHasFinalConsonant(names) ? '을' : '를'} 읽고 ${polite ? '싶으시군요. 차근차근 읽어 보실 수 있어요.' : '싶구나. 차근차근 읽어 볼 수 있어.'}` : `${spokenList(unread.map(book => `『${book.title.ko}』`), 'ko')} 중 어느 책을 ${polite ? '읽으실래요?' : '읽을래?'}`,
    en: unread.length === 1 ? `You'd like to read ${names}? You can take your time studying it.` : `Did you mean ${spokenList(unread.map(book => book.title.en), 'en')}? Tell me which one you'd like.`,
    ja: unread.length === 1 ? `『${names}』を読みたいのですね。じっくり読めますよ。` : `${spokenList(unread.map(book => `『${book.title.ja}』`), 'ja')}のどれを読みますか。`,
  }[locale], actions: unread.map(book => ({ type: 'read', book: book.id })) };
}

export function npcFacilityReply(locale: NpcLocale, npcId: NpcId, text: string, character?: FantasyCharacter, board?: FantasyContractBoard, dynamicFacts?: DialogueDynamicContext, merchant?: FantasyEconomyMerchantView): string | undefined {
  if (NPC_PUBLIC.find(npc => npc.id === npcId)?.travelOnly) return npcMapMerchantReply(locale,text,merchant)
    ?? (teachingTopic.test(normal(text)) ? { ko:'제가 가르치는 직업이나 기술은 없어요. 확인한 길을 지도로 기록해 팔고 있어요.', en:'I teach no professions or skills. I record checked routes and sell their charts.', ja:'教えられる職業や技能はありません。確かめた道を地図にして売っています。' }[locale] : undefined);
  if(!npcFacilityQuerySupported(npcId,text,character))return undefined;
  const k = npcFacilityKnowledge(npcId, character, dynamicFacts), query = normal(text);
  const polite = ['scholar', 'priest', 'trade'].includes(fantasyNpcTone(npcId));
  const stockMatches = k.stock.filter(id => [id, ...(['ko', 'en', 'ja'] as const).map(language => itemName(id, language))].some(name => mentions(query, name)));
  const books = k.books.filter(book => [book.id, ...Object.values(book.title)].some(name => mentions(query, name)));
  const rooms = k.building?.id === 'inn' && roomTopic.test(query);
  if (k.building?.id === 'guild' && /의뢰|게시|\b(?:quests?|contracts?|postings?)\b|依頼|掲示/.test(query)) {
    if (!board || board.location !== k.npc.homeLocation || !character) return { ko: '게시된 의뢰를 살펴보고 있어. 잠시 뒤에 다시 물어봐 줘.', en: 'I am checking the posted contracts. Ask me again in a moment.', ja: 'いま掲載された依頼を確認しています。少し待ってからまたお尋ねください。' }[locale];
    const offers = board.offers.filter(offer => offer.available && !offer.mine && offer.expiresAt > board.hour && offer.boardLocation === k.npc.homeLocation
      && FANTASY_QUESTS.some(quest => quest.id === offer.quest && fantasyQuestEligible(character, quest) && !character.completed.includes(quest.id) && !character.quests.includes(quest.id)));
    const titles = offers.map(offer => {
      const title = fantasyQuestText(FANTASY_QUESTS.find(quest => quest.id === offer.quest)!, locale).name;
      return { ko: `『${title}』${koHasFinalConsonant(title) ? '은' : '는'} 보수가 ${offer.gold}G${koEnd(npcId, '예요.', '야.', '라네.')}`, en: `${title} pays ${offer.gold}G.`, ja: `『${title}』の報酬は${offer.gold}G${jaEnd(npcId, 'です。', 'だ。')}` }[locale];
    }).join(locale === 'ja' ? '' : ' ');
    return { ko: titles ? `${titles} 맡고 싶은 일이 있으면 ${koEnd(npcId, '말씀해 주세요.', '말해 줘.', '말해 주게.')}` : koEnd(npcId, '지금 맡으실 만한 새 의뢰는 없어요. 나중에 다시 들러 주세요.', '지금 네가 맡을 만한 새 의뢰는 없어. 나중에 다시 들러 줘.', '지금 맡을 만한 새 의뢰는 없네. 나중에 다시 들러 주게.'), en: titles ? `${titles} Let me know which one interests you.` : 'I have no new contracts for you just now. Come back a little later.', ja: titles ? `${titles}気になる依頼があれば${jaEnd(npcId, '教えてください。', '教えてくれ。')}` : jaEnd(npcId, '今、お任せできる新しい依頼はありません。また後で寄ってください。', '今、任せられる新しい依頼はない。また後で寄ってくれ。') }[locale];
  }
  if (rooms) {
    const named = FANTASY_LODGINGS.find(room => [room.id, ...Object.values(room.name)].some(name => mentions(query, name)));
    const suspicious = /특별\s*할인|트리플|펜션|일반\s*객실|\b(?:discount|triple|pension|standard)\b|割引.*(?:部屋|客室)|トリプル|ペンション/.test(query);
    const correction = suspicious ? { ko: koEnd(npcId, '그 이름의 방은 없어요. ', '그 이름의 방은 없어. ', '그런 이름의 방은 없네. '), en: 'I have no room by that name. ', ja: jaEnd(npcId, 'その名前の部屋はありません。', 'その名前の部屋はないよ。') }[locale] : '';
    if (named && !suspicious) {
      const rest = named.fatigueRecovery >= 100 ? { ko: '푹 자면 쌓인 피로를 말끔히 풀 수 있어.', en: 'A full rest there will leave you thoroughly refreshed.', ja: '十分に眠れば、たまった疲れをすっかり取れます。' }
        : named.fatigueRecovery >= 70 ? { ko: '혼자 조용히 푹 쉬기에 좋아.', en: 'It is a good place for a quiet, private rest.', ja: 'ひとりで静かに、ゆっくり休むのに向いています。' }
          : { ko: '다른 손님과 함께 쓰는 방이라 깊이 쉬기에는 조금 불편할 수 있어.', en: 'You share it with other guests, so it is harder to rest deeply.', ja: 'ほかのお客さんと使う部屋なので、ぐっすり休むには少し落ち着かないかもしれません。' };
      return { ko: `${koTopic(named.name.ko)} ${named.hours}시간 묵는 데 ${k.price(named.cost, 'room')}G${koEnd(npcId, '예요.', '야.', '라네.')} ${polite ? rest.ko.replace(/있어\.$/u, '있어요.').replace(/좋아\.$/u, '좋아요.') : rest.ko}`, en: `${named.name.en} costs ${k.price(named.cost, 'room')}G for ${named.hours} hours. ${rest.en}`, ja: `${named.name.ja}は${named.hours}時間で${k.price(named.cost, 'room')}G${jaEnd(npcId, 'です。', 'だよ。')}${rest.ja}` }[locale];
    }
    return correction + roomSpeech(locale, k);
  }
  if (['inn', 'restaurant'].includes(k.building?.id ?? '') && foodTopic.test(query) && !/좋아|favorite|favourite|好き/.test(query)
    && (!stockMatches.length || /메뉴|\b(?:menu|dining)\b|献立|メニュー/.test(query))) {
    const menu = FANTASY_DINING.filter(meal => Object.values(meal.name).some(name => mentions(query, name)));
    const meals = menu.length ? menu : FANTASY_DINING;
    return meals.map(meal => ({ ko: `${koTopic(meal.name.ko)} ${k.price(meal.cost, 'food')}G에 ${koEnd(npcId, '드실 수 있어요.', '먹을 수 있어.', '먹을 수 있네.')}`, en: `I can serve you ${meal.name.en} for ${k.price(meal.cost, 'food')}G.`, ja: `${meal.name.ja}なら${k.price(meal.cost, 'food')}Gで${jaEnd(npcId, 'お出しできます。', '用意できるよ。')}` })[locale]).join(locale === 'ja' ? '' : ' ');
  }
  if (k.building?.id === 'library' && (books.length || bookTopic.test(query))) {
    if (books.length) return books.map(book => {
      const first = npcBreaksFourthWall(book.body[locale][0] ?? '') ? '' : book.body[locale][0];
      return {
        ko: `『${book.title.ko}』 ${polite ? '말씀이시군요.' : '말하는 거구나.'}${first ? ` 첫머리에는 이렇게 ${polite ? '적혀 있어요' : '적혀 있어'}. “${first}”` : ` 이 서가에서 ${polite ? '찾으실 수 있어요.' : '찾을 수 있어.'}`}`,
        en: `You mean ${book.title.en}? ${first ? `It begins, “${first}”` : 'I keep it on these shelves.'}`,
        ja: `『${book.title.ja}』${jaEnd(npcId, 'ですね。', 'だね。')}${first ? `書き出しは「${first}」となっています。` : 'この書棚にあります。'}`,
      }[locale];
    }).join(locale === 'ja' ? '' : ' ');
    const names = spokenList(k.books.map(book => `『${book.title[locale]}』`), locale);
    return { ko: names ? `${names} 같은 책이 ${polite ? '있어요. 궁금한 책이 있으면 말씀해 주세요.' : '있어. 궁금한 책이 있으면 말해 줘.'}` : polite ? '지금은 빌려드릴 책이 없어요.' : '지금은 빌려줄 책이 없어.', en: names ? `I keep ${names} here. Tell me if one catches your interest.` : 'There are no books on these shelves yet.', ja: names ? `${names}などを置いています。気になる本があれば教えてください。` : 'まだこの書棚には本がありません。' }[locale];
  }
  if (k.building?.id === 'shipyard' && /어선|배\s*(?:대여|구매|사|빌)|fishing boat|rent.*boat|buy.*boat|漁船|船.*(?:借|買)/.test(query)) {
    const boats = FANTASY_BOAT_OPTIONS.map(option => ({
      ko: 'hours' in option ? `어선을 ${option.hours}시간 빌리려면 ${option.price}G가 ${koEnd(npcId, '들어요.', '들어.', '드네.')}` : `배를 아예 사려면 ${option.price}G${koEnd(npcId, '예요.', '야.', '라네.')}`,
      en: 'hours' in option ? `I can rent you a fishing boat for ${option.hours} hours at ${option.price}G.` : `Buying one costs ${option.price}G.`,
      ja: 'hours' in option ? `漁船を${option.hours}時間借りるなら${option.price}G${jaEnd(npcId, 'です。', 'だよ。')}` : `買うなら${option.price}G${jaEnd(npcId, 'です。', 'だよ。')}`,
    })[locale]).join(locale === 'ja' ? '' : ' ');
    return boats + { ko: ` 바다에 나가려면 먼저 어부 일을 ${koEnd(npcId, '배우셔야 해요.', '배워야 해.', '배워야 하네.')}`, en: ' You need to learn the fisher trade before taking a boat out to sea.', ja: '海へ出る前に、漁師の仕事を覚えてくださいね。' }[locale];
  }
  if (teachingTopic.test(query) && !stockMatches.length && !/되고|전직|become|なりたい|転職/.test(query)) {
    const subjects = spokenList([...k.jobs.map(job => job.names[locale]), ...k.skills.map(skill => skill.names[locale])], locale);
    return { ko: subjects ? `${subjects} 쪽은 ${koEnd(npcId, '제가 가르쳐 드릴 수 있어요. 배우고 싶은 걸 말씀해 주세요.', '내가 가르쳐 줄 수 있어. 배우고 싶은 걸 말해 줘.', '내가 가르쳐 줄 수 있네. 배우고 싶은 걸 말해 주게.')}` : koEnd(npcId, '제가 따로 가르칠 만한 직업이나 기술은 없어요.', '내가 따로 가르칠 만한 직업이나 기술은 없어.', '내가 따로 가르칠 만한 직업이나 기술은 없네.'), en: subjects ? `I can teach you ${subjects}. Tell me what you'd like to learn.` : 'I have no professions or skills I can teach you.', ja: subjects ? `${subjects}なら${jaEnd(npcId, 'お教えできます。学びたいものを教えてください。', '教えられるよ。何を学びたい？')}` : jaEnd(npcId, '私がお教えできる職業や技能はありません。', '私が教えられる職業や技能はないよ。') }[locale];
  }
  if (craftingTopic.test(query) && !stockTopic.test(query) && k.recipes.length) {
    const products = spokenList(k.recipes.map(recipe => itemName(recipe.output, locale)), locale);
    return { ko: `여기서 ${products} 같은 걸 ${koEnd(npcId, '만드실 수 있어요. 재료를 준비하고, 만드는 일도 배우셔야 해요.', '만들 수 있어. 재료를 준비하고, 만드는 일도 배워야 해.', '만들 수 있네. 재료를 준비하고, 만드는 일도 배워야 하네.')}`, en: `You can make things like ${products} here. Bring the materials and learn the trade first.`, ja: `ここでは${products}などが${jaEnd(npcId, '作れますよ。材料をそろえて、作り方も覚えてくださいね。', '作れるよ。材料をそろえて、作り方も覚えてきてね。')}` }[locale];
  }
  if (stockMatches.length || stockTopic.test(query)) {
    if (!stockMatches.length && k.lots && k.catalogStock.some(id => !k.stock.includes(id) && [id, ...(['ko','en','ja'] as const).map(language => itemName(id,language))].some(name => mentions(query,name)))) return {ko:koEnd(npcId, '그건 지금 다 팔렸어요. 아쉽지만 품절이에요.', '그건 지금 다 팔렸어. 아쉽지만 품절이야.', '그건 지금 다 팔렸네. 아쉽지만 품절이라네.'),en:'I have sold the last of those, so I have none left just now.',ja:jaEnd(npcId,'それは売り切れてしまいました。今は品切れです。','それは売り切れてしまったよ。今は品切れだね。')}[locale];
    if (!stockMatches.length && [...FANTASY_ITEMS.map(item => item.id), ...FANTASY_MAPS.map(map => map.item)].some(id => [id, ...(['ko', 'en', 'ja'] as const).map(language => itemName(id, language))].some(name => mentions(query, name)))) {
      return { ko: polite ? '그 물건은 여기서 팔지 않아요. 다른 품목이 궁금하면 말씀해 주세요.' : '그 물건은 여기서 팔지 않아. 다른 품목이 궁금하면 물어봐.', en: 'We do not sell that item here. You can ask about our other goods.', ja: 'その品物はここでは売っていません。ほかの品物ならお尋ねください。' }[locale];
    }
    const selected = stockMatches.length ? stockMatches : k.stock;
    if (!selected.length) return { ko: polite ? '여기서는 물건을 팔지 않아요. 제 일에 관해 궁금한 게 있으면 말씀해 주세요.' : '여기서는 물건을 팔지 않아. 내 일에 대해 궁금하면 물어봐.', en: 'I do not sell goods here. You can ask me about my work.', ja: 'ここでは品物を売っていません。私の仕事についてならお尋ねください。' }[locale];
    const names = selected.map(id => {
      const description = FANTASY_ITEMS.find(item => item.id === id)?.descriptions?.[locale];
      return `${goodsSpeech(k,id,locale)}${stockMatches.length && /뭐|설명|효과|what|describe|effect|何|説明|効果/.test(query) && description && !npcBreaksFourthWall(description) ? ` ${description}` : ''}`;
    }).join(locale === 'ja' ? '' : ' ');
    return names;
  }
  if (generalTopic.test(query)) return serviceIntroduction(k,locale);
  return undefined;
}

export function npcFacilityFacts(npcId: NpcId, locale: NpcLocale, character?: FantasyCharacter, query = '', dynamicFacts?: DialogueDynamicContext, merchant?: FantasyEconomyMerchantView): string[] {
  if (NPC_PUBLIC.find(npc => npc.id === npcId)?.travelOnly) return npcMapMerchantFacts(merchant,locale);
  const k = npcFacilityKnowledge(npcId, character, dynamicFacts), q = normal(query);
  const named = k.catalogStock.some(id => [id,...(['ko','en','ja'] as const).map(language=>itemName(id,language))].some(name=>mentions(q,name)))
    || k.books.some(book=>[book.id,...Object.values(book.title)].some(name=>mentions(q,name)))
    || FANTASY_LODGINGS.some(room=>[room.id,...Object.values(room.name)].some(name=>mentions(q,name)));
  if(query && !named && ![roomTopic,foodTopic,stockTopic,bookTopic,teachingTopic,craftingTopic,generalTopic].some(topic=>topic.test(q)))return [];
  const facts = [`Your premises: ${k.building?.name[locale] ?? k.npc.role[locale]}. Only the following actual services and stock exist here.`];
  if (k.building?.id === 'inn') facts.push(`Rooms (complete): ${roomLines(locale, k)}. No other room types or invented discounts.`);
  if (['inn', 'restaurant'].includes(k.building?.id ?? '')) facts.push(`Meals: ${join(FANTASY_DINING.map(meal => `${meal.name[locale]} ${k.price(meal.cost, 'food')}G`))}.`);
  if (k.stock.length) {
    const selected = k.stock.filter(id => [id, ...(['ko', 'en', 'ja'] as const).map(language => itemName(id, language))].some(name => mentions(q, name)));
    const stock = selected.length ? selected : k.stock.slice(0, stockTopic.test(q) ? 12 : 4);
    facts.push(`Current goods: ${join(stock.map(id => goodsLine(k,id,locale)))}. ${k.lots ? 'These are current available lots and unit prices.' : 'Current prices and quantities are unverified; do not quote them.'} Do not add unlisted wares; ask which item the visitor wants.`);
  }
  if (k.books.length && (bookTopic.test(q) || !query)) facts.push(`Books actually on these shelves: ${join(k.books.map(book => book.title[locale]))}.`);
  if (k.jobs.length || k.skills.length) facts.push(`You can teach: ${join([...k.jobs.map(job => job.names[locale]), ...k.skills.map(skill => skill.names[locale])])}.`);
  return facts;
}

export function npcUnfoundedFacilitySpeech(npcId: NpcId, text: string): boolean {
  const npc = NPC_PUBLIC.find(npc => npc.id === npcId);
  if (npc?.travelOnly) return npcMapMerchantUnverifiedSpeech(text);
  return npc?.building === 'inn' && /특별\s*할인\s*(?:객실|방)|트리플|펜션|\b(?:triple|pension|discount rooms?|standard rooms?)\b|割引.*(?:部屋|客室)|トリプル|ペンション/.test(normal(text));
}
