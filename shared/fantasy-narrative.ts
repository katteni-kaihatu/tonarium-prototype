import type { FantasyEvent, FantasyQuest } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';

type Pair = [ko: string, en: string];
interface QuestText { name: Pair; description: Pair }
interface EventText extends QuestText { choices: Record<string, Pair> }
const q = (ko: string, en: string, koDescription: string, enDescription: string): QuestText => ({ name: [ko, en], description: [koDescription, enDescription] });
const e = (ko: string, en: string, koDescription: string, enDescription: string, choices: Record<string, Pair>): EventText => ({ ...q(ko, en, koDescription, enDescription), choices });

const QUESTS: Record<string, QuestText> = {
  'quest-herbalist': q('약사의 아침 준비', 'The Apothecary’s Morning', '푸른잎숲에서 약초를 모아 하스의 약사에게 돌아가 전달하자.', 'Gather herbs in Greenwood and bring them back to the apothecary in Hearth.'),
  'quest-timber': q('목장 울타리 수리', 'Mending the Pasture Fence', '햇살목초지의 울타리를 살펴보고 목재를 모아 하스의 수리 담당에게 가져가자.', 'Inspect the fence at Sunmeadow, gather timber and return it to the repairer in Hearth.'),
  'quest-ore': q('산속의 대장장이 동료', 'Fellow Smiths of the Mountains', '철관산맥에서 철광석을 모아 엠버홀의 대장장이 동료에게 돌아가자.', 'Gather iron ore in Ironridge and return it to the smiths in Emberhall.'),
  'quest-crystal': q('푸른 빛 조사', 'Investigating the Blue Glow', '푸른수정동굴에서 마정석을 모아 엠버홀의 조사대에게 가져가자.', 'Collect mana crystals in Deepcave and bring them back to the investigation team in Emberhall.'),
  'quest-fen': q('습지의 약장', 'Restocking the Wetland Remedies', '은갈대습지에서 약초를 채집해 조수항의 진료소로 돌아가 전달하자.', 'Gather herbs in Silverreed Fen and return them to the clinic in Tidehaven.'),
  'quest-fish': q('항구의 저녁 모임', 'A Supper from the Harbor', '조수항을 방문해 생선을 모으고 하스의 저녁 모임 주최자에게 가져가자.', 'Visit Tidehaven, gather fish and return them to the supper organizer in Hearth.'),
  'quest-court': q('왕도의 식재료 시장', 'The Royal City’s Food Market', '솔네왕도의 식재료 시장에서 향신료를 찾아 하스의 요리사에게 가져가자.', 'Find spices at the food market in Suncourt and bring them back to the cook in Hearth.'),
  'quest-watch': q('옛망루성의 기록', 'Records of Oldwatch', '옛망루성에서 기록이 남은 고대 유물을 모아 솔네왕도의 연구자에게 돌아가자.', 'Gather relics bearing old records at Oldwatch and return them to the researcher in Suncourt.'),
  'quest-tower': q('별읽는탑의 촉매', 'Catalysts for Starspire', '별읽는탑에서 촉매의 성질을 조사하고 마정석을 솔네왕도의 의뢰인에게 가져가자.', 'Study catalysts at Starspire and return the mana crystals to the client in Suncourt.'),
  'quest-silk': q('동쪽의 재봉사', 'Silk for the Tailor', '아사기항의 직물을 살피고 별비단을 모아 하스의 재봉사에게 돌아가자.', 'Examine the fabrics in Dawnport, gather starsilk and bring it back to the tailor in Hearth.'),
  'quest-moon': q('루네리아의 고서 복원', 'Restoring Mooncity’s Old Books', '루네리아에서 복원 방법을 조사한 뒤 복원용 고대 유물을 솔네왕도의 의뢰인에게 전달하자. 유물은 탐사나 시장에서 구할 수 있다.', 'Investigate restoration methods in Mooncity, then deliver relics to the client in Suncourt. Obtain the relics through exploration or at a market.'),
  'quest-desert': q('사막의 교역소', 'The Desert Trading Post', '유리사막의 교역소를 방문해 향신료를 모으고 아사기항의 상인에게 돌아가자.', 'Visit the trading post in Glass Desert, gather spices and bring them back to the merchant in Dawnport.'),
  'quest-island': q('유리산호 표본', 'Glasscoral Samples', '유리산호섬의 해변에서 보석 원석을 모아 조수항의 연구자에게 가져가자.', 'Gather rough gems on Glasscoral Isle’s shore and bring them back to the researcher in Tidehaven.'),
  'quest-mushroom': q('거대버섯의 향기', 'The Scent of Giant Mushrooms', '거대버섯섬에서 독특한 향신료를 채집해 솔네왕도의 요리사에게 가져가자.', 'Gather unusual spices on Mushroom Isle and bring them back to the cook in Suncourt.'),
  'quest-storm': q('천둥종 수리', 'Repairing the Storm Bell', '천둥종섬의 등대를 조사하고 수리용 철주괴를 엠버홀의 의뢰인에게 전달하자. 주괴는 단조하거나 시장에서 구입한다.', 'Inspect the lighthouse on Stormbell Isle and deliver iron ingots to the client in Emberhall. Forge the ingots or buy them at a market.'),
  'quest-sword': q('왕도의 호위대', 'Swords for the Royal Guard', '솔네왕도의 호위대를 방문해 필요한 검을 확인하고 손벼림검을 엠버홀의 의뢰인에게 전달하자. 검은 단조하거나 시장에서 구입한다.', 'Visit the guard in Suncourt to check their needs, then deliver a handforged sword to the client in Emberhall. Forge it or buy it at a market.'),
};

const EVENTS: Record<string, EventText> = {
  'adventurer-ruins': e('돌문 너머의 의뢰', 'Beyond the Stone Door', '작은 유적의 돌문이 열리지 않아 조사대가 곤란해하고 있다.', 'An investigation team cannot open the stone door of a small ruin.', {
    force: ['동료들과 문을 밀어 연다', 'Push the door open with your companions'], read: ['벽의 고대 문자를 살핀다', 'Examine the ancient writing on the wall'],
  }),
  'adventurer-rescue': e('안개 속 부름', 'A Call in the Mist', '돌아오지 않은 약초 채집꾼을 찾아 달라는 부탁을 받았다. 멀리서 종소리가 들린다.', 'You are asked to find a missing herb gatherer. A bell sounds in the distance.', {
    track: ['작은 발자국을 뒤쫓는다', 'Follow the small footprints'], endure: ['능선에 올라 주변을 살핀다', 'Survey the area from the ridge'],
  }),
  'adventurer-beast': e('다리를 막은 맹수', 'The Beast on the Bridge', '큰 짐승이 길목의 다리를 차지했다. 건너려는 여행자들이 줄을 섰다.', 'A large beast occupies the road bridge. Travelers are waiting to cross.', {
    drive: ['방패를 울려 쫓아낸다', 'Clang your shield to drive it away'], lure: ['먹이로 숲에 유인한다', 'Lure it into the forest with food'],
  }),
  'merchant-peddler': e('마을 축제의 행상', 'Peddling at the Village Festival', '수확제 광장에 작은 노점을 낼 수 있다. 어떻게 손님을 모을까?', 'You can set up a small stall at the harvest festival. How will you attract customers?', {
    pitch: ['물건 쓰는 법을 재미있게 소개한다', 'Give a lively demonstration of your goods'], trend: ['잘 팔리는 물건을 보고 진열을 바꾼다', 'Rearrange the stall around popular goods'],
  }),
  'merchant-caravan': e('상단의 초대', 'An Invitation from a Caravan', '이웃 도시로 가는 상단이 함께 물건을 매입할 동료를 찾고 있다.', 'A caravan heading to the next town seeks a partner for a joint purchase.', {
    bargain: ['수익 배분과 호위 비용을 협상한다', 'Negotiate shares and escort costs'], forecast: ['시세와 날씨를 보고 화물을 고른다', 'Choose cargo based on prices and weather'],
  }),
  'merchant-bandits': e('길목의 통행료', 'A Toll on the Road', '도적들이 수레 앞을 막고 부당한 통행료를 요구한다.', 'Bandits block your cart and demand an unlawful toll.', {
    talk: ['추적대 소문을 섞어 협상한다', 'Negotiate while mentioning a pursuing patrol'], escape: ['샛길로 수레를 빼낸다', 'Escape with the cart along a side path'],
  }),
  'blacksmith-repair': e('광산의 긴급 수리', 'Emergency Repairs at the Mine', '광석 운반용 도르래가 고장 났다. 교대 광부들이 수리를 기다린다.', 'The ore hoist is broken. The next shift of miners is waiting for repairs.', {
    precise: ['부품을 정성껏 깎아 맞춘다', 'Carefully file the parts to fit'], brace: ['튼튼한 보강 쇠붙이를 벼린다', 'Forge a sturdy reinforcing bracket'],
  }),
  'blacksmith-blade': e('떠나는 검사의 주문', 'A Departing Swordsman’s Order', '젊은 검사가 자신의 손에 맞는 검 한 자루를 주문했다.', 'A young swordsman asks for a blade suited to their hand.', {
    balance: ['손잡이와 무게중심을 정밀하게 맞춘다', 'Fine-tune the grip and balance'], study: ['사용법을 듣고 설계한다', 'Ask how the blade will be used, then design it'],
  }),
  'blacksmith-court': e('왕실 공방의 심사', 'The Royal Workshop’s Trial', '왕실에 도구를 납품할 장인을 뽑는다. 심사관이 작업을 지켜본다.', 'The royal workshop is selecting a tool supplier. An examiner watches your work.', {
    masterpiece: ['세부까지 다듬은 작품을 만든다', 'Make a piece finished in every detail'], practical: ['튼튼하고 수리 쉬운 설계를 보인다', 'Present a durable, repairable design'],
  }),
  'cook-contest': e('거리의 요리 대회', 'The Town Cooking Contest', '광장에서 요리 대회가 열린다. 지역 식재료로 만든 한 접시가 과제다.', 'A cooking contest is held in the square. The challenge is a dish made with local ingredients.', {
    technique: ['불 조절과 담음새로 승부한다', 'Rely on heat control and presentation'], invent: ['뜻밖의 식재료 조합을 시도한다', 'Try an unexpected pairing of ingredients'],
  }),
  'cook-order': e('특별한 저녁 주문', 'An Order for a Special Evening', '긴 여행에서 돌아온 가족을 위해 추억의 요리를 재현해 달라는 부탁이다.', 'Someone wants a remembered dish recreated for a family returning from a long journey.', {
    listen: ['고향의 맛을 자세히 물어본다', 'Ask carefully about the taste of home'], finish: ['식감과 온도를 정성껏 맞춘다', 'Carefully finish the texture and temperature'],
  }),
  'cook-palace': e('궁정 요리사의 초대', 'An Invitation to the Royal Kitchen', '각지를 여행한 요리사로서 궁정 만찬에 한 접시를 선보일 기회가 왔다.', 'You have an opportunity to serve a traveler’s dish at a court banquet.', {
    banquet: ['제철 식재료로 아름답게 완성한다', 'Create a beautiful dish with seasonal ingredients'], story: ['요리에 여행 이야기를 곁들인다', 'Accompany the dish with a travel story'],
  }),
  'alchemist-trial': e('새 약의 시험 조제', 'Testing a New Remedy', '연구소가 여행의 피로를 덜어 주는 약을 함께 연구하자고 한다.', 'A laboratory asks you to help develop a remedy for travel fatigue.', {
    theory: ['기존 처방들을 비교한다', 'Compare existing formulas'], measure: ['한 방울씩 성분을 조절한다', 'Adjust the mixture drop by drop'],
  }),
  'alchemist-spring': e('흐려진 샘', 'The Clouded Spring', '마을 샘물이 이상한 색으로 흐려졌다. 마시지 말고 원인을 조사하자.', 'The village spring has turned a strange color. Investigate without drinking the water.', {
    analyze: ['물과 흙을 채취해 분석한다', 'Collect water and soil for analysis'], filter: ['여러 층의 여과기를 만든다', 'Build a layered filter'],
  }),
  'alchemist-moon': e('달빛 촉매', 'The Moonlight Catalyst', '한 달에 한 번만 모을 수 있는 이슬로 특별한 촉매를 만드는 밤이다.', 'Tonight is the chance to make a special catalyst from dew gathered only once a month.', {
    formula: ['달의 움직임에 맞춰 조제한다', 'Mix the formula in time with the moon'], steady: ['차가운 그릇을 흔들림 없이 유지한다', 'Hold the chilled vessel steady'],
  }),
  'healer-fever': e('마을의 열병', 'Fever in the Village', '열이 나는 주민들이 진료소에 모였다. 약과 쉴 자리를 확인하자.', 'Residents with fevers gather at the clinic. Check the remedies and places to rest.', {
    diagnose: ['증상을 비교해 치료한다', 'Compare symptoms and provide care'], support: ['물과 잠자리를 꾸준히 마련한다', 'Keep water and beds ready'],
  }),
  'healer-pilgrims': e('순례자의 걸음', 'The Pilgrims’ Journey', '오래 걸어온 순례단이 찰과상과 피로를 안고 여관에 도착했다.', 'A group of pilgrims arrives at the inn with grazes and fatigue from the long road.', {
    remedy: ['약초와 붕대로 처치한다', 'Treat them with herbs and bandages'], walk: ['다음 날 길에 동행한다', 'Accompany them on the next morning’s road'],
  }),
  'healer-curse': e('잠 못 드는 작은 상자', 'The Sleepless Box', '오래된 상자를 연 뒤 잠들지 못한다는 여행자가 왔다. 상자에는 푸른 문양이 빛난다.', 'A traveler has been unable to sleep since opening an old box. Blue markings glow on it.', {
    seal: ['문양을 살펴 봉인을 고친다', 'Examine the markings and repair the seal'], care: ['안심할 환경과 약을 마련한다', 'Arrange soothing surroundings and remedies'],
  }),
  'hunter-rare': e('은빛 뿔의 발자국', 'Tracks of the Silver Antlers', '희귀한 은각사슴이 목격됐다. 숲지기는 서식지 확인만을 바란다.', 'A rare silver-antlered deer has been sighted. The forest keeper only wants its habitat confirmed.', {
    quiet: ['바람 아래쪽에서 조용히 추적한다', 'Track quietly from downwind'], signs: ['먹이 흔적과 물가를 살핀다', 'Examine feeding signs and water sources'],
  }),
  'hunter-wolves': e('목장을 둘러싼 그림자', 'Shadows around the Pasture', '밤의 목장에 무리가 다가온다. 가축과 야생동물 모두 다치지 않게 물리치고 싶다.', 'A pack approaches the pasture at night. Drive it away without harming livestock or wildlife.', {
    patrol: ['높은 곳에서 움직임을 지켜본다', 'Watch its movements from higher ground'], fence: ['울타리와 경보 장치를 보강한다', 'Reinforce fences and warning devices'],
  }),
  'hunter-poacher': e('금렵지의 덫', 'Traps in the Protected Forest', '사냥이 금지된 숲에서 덫을 발견했다. 숲지기에게 알리기 전에 길을 안전하게 하자.', 'You find traps in a protected forest. Secure the path before informing the keeper.', {
    disable: ['덫을 살펴 안전하게 해체한다', 'Inspect and carefully disarm the traps'], read: ['발자국으로 설치 범위를 추정한다', 'Use tracks to estimate the trapped area'],
  }),
  'bard-festival': e('수확제의 무대', 'The Harvest Festival Stage', '마을 축제에서 노래하게 됐다. 광장에서 아이들과 어른들이 기다린다.', 'You are to sing at the village festival. Children and adults await you in the square.', {
    sing: ['모두 함께 부를 노래를 고른다', 'Choose a song everyone can sing'], improvise: ['지역 이야기를 즉흥 시로 엮는다', 'Improvise a poem from local stories'],
  }),
  'bard-epic': e('잊힌 서사시', 'The Forgotten Epic', '옛 노래의 마지막 절을 찾는다. 여행자의 기억과 비문의 글자가 단서다.', 'You seek the final verse of an old song. Travelers’ memories and an inscription hold clues.', {
    listen: ['여행자들에게 노래를 모아 듣는다', 'Collect versions of the song from travelers'], decode: ['비문의 운율과 뜻을 해독한다', 'Decode the inscription’s rhyme and meaning'],
  }),
  'bard-banquet': e('영주의 야회', 'The Lord’s Evening Reception', '영주의 연회에 초대됐다. 각지의 손님이 모여 있어 말을 신중히 골라야 한다.', 'You are invited to a lord’s banquet. Guests from many regions call for careful words.', {
    charm: ['손님 반응에 맞춰 공연을 바꾼다', 'Adapt the performance to the guests’ reactions'], history: ['귀빈 고향의 영웅담을 들려준다', 'Tell a heroic tale from a guest’s homeland'],
  }),
  'mage-exam': e('마법탑의 공개 시험', 'The Tower’s Public Examination', '마법사의 탑에서 오래된 조명 마법을 복원하는 시험이 열린다.', 'A mage tower holds a trial to restore an old illumination spell.', {
    runes: ['술식의 모순을 찾아낸다', 'Identify contradictions in the formula'], patience: ['마나의 흐름을 계속 유지한다', 'Maintain a steady flow of mana'],
  }),
  'mage-artifact': e('잠잠해지지 않는 유물', 'The Restless Relic', '시장의 유물이 저절로 소리를 내기 시작했다. 가게 주인이 도움을 청한다.', 'A market relic starts sounding on its own. The shopkeeper asks for help.', {
    analyze: ['마나가 흐르는 길을 해석한다', 'Read the paths of mana'], attune: ['반응을 살펴 알맞게 조율한다', 'Observe its reactions and find the right tuning'],
  }),
  'mage-rift': e('작은 차원의 틈', 'A Small Rift', '전이문 근처에 작은 균열이 생겨 종이와 모자를 빨아들인다.', 'A small rift near a gate is drawing in papers and hats.', {
    seal: ['전이문의 술식을 재구성한다', 'Reconstruct the gate’s formula'], anchor: ['마정석 추로 주변을 안정시킨다', 'Stabilize the area with mana crystal weights'],
  }),
  'leader-dispute': e('수로를 둘러싼 논의', 'A Dispute over the Waterway', '이웃한 두 밭이 같은 수로를 쓰는 방법을 두고 다툰다.', 'Two neighboring fields dispute how to share a waterway.', {
    mediate: ['양쪽 사정을 듣고 순서를 정한다', 'Hear both sides and agree on a schedule'], plan: ['수량과 시간을 조사해 계획을 짠다', 'Measure the water and plan its use'],
  }),
  'leader-settlement': e('개척단의 첫걸음', 'The Settlers’ First Step', '작은 개척단이 새 마을을 준비한다. 작업 배분을 부탁받았다.', 'A small expedition is preparing a new settlement. You are asked to assign the work.', {
    organize: ['특기를 듣고 작업반을 나눈다', 'Build teams around people’s strengths'], logistics: ['식량과 자재의 우선순위를 정한다', 'Plan the order of food and material supplies'],
  }),
  'leader-defense': e('요새의 대피 훈련', 'An Evacuation Drill at the Fort', '폭풍과 마물에 대비해 요새 수비대가 대피와 연락 훈련을 한다.', 'The garrison practices evacuation and communications for storms and monsters.', {
    rally: ['알기 쉬운 신호로 사람들을 이끈다', 'Guide people with clear signals'], support: ['마지막 확인까지 현장을 지킨다', 'Stay to complete the final safety checks'],
  }),
  'thief-market': e('군중 속 분실물', 'A Parcel in the Crowd', '붐비는 시장에서 뒷세계 동료가 놓아둔 꾸러미를 회수해 달라는 부탁을 받았다.', 'You are asked to retrieve a parcel left by an underworld associate in a crowded market.', {
    careful: ['사람들의 흐름을 읽으며 나아간다', 'Read the crowd as you move'], alternative: ['꾸러미의 표식을 찾아낸다', 'Identify the parcel’s mark'],
  }),
  'thief-cache': e('잊힌 은닉처', 'The Forgotten Cache', '오래된 은닉처에 주인 없는 물건이 남아 있다는 소문을 들었다.', 'An old cache is said to hold goods with no one left to claim them.', {
    careful: ['발 디딜 곳을 확인하며 접근한다', 'Check your footing as you approach'], alternative: ['적힌 순서를 풀어낸다', 'Work out the written sequence'],
  }),
  'thief-guild': e('도둑 동료의 시험', 'A Test among Thieves', '뒷세계 동료가 물건을 상하게 하지 않고 회수하는 솜씨를 시험한다.', 'An underworld associate tests your ability to retrieve goods without damaging them.', {
    careful: ['섬세한 손놀림을 보여 준다', 'Demonstrate a delicate touch'], alternative: ['조심스러운 몸놀림으로 응한다', 'Respond with careful movements'],
  }),
  'smuggler-border': e('닫힌 가도', 'The Closed Road', '공식 가도가 폐쇄되자 의뢰인이 화물을 어찌할지 몰라 곤란해한다.', 'The main road is closed, leaving your client unsure what to do with the cargo.', {
    careful: ['거래 조건을 협상한다', 'Negotiate the terms'], alternative: ['다른 일정으로 다시 계획한다', 'Arrange a different schedule'],
  }),
  'smuggler-cargo': e('주인을 밝히지 않은 화물', 'Cargo without a Name', '이름을 밝히고 싶지 않은 손님이 화물 인도를 제안했다.', 'A customer who wishes to remain unnamed proposes a cargo handover.', {
    careful: ['인도 약속을 확실히 정한다', 'Settle the handover agreement'], alternative: ['화물과 기록의 차이를 살핀다', 'Check discrepancies between the cargo and records'],
  }),
  'smuggler-contact': e('항구의 중개인', 'The Harbor Broker', '항구의 중개인이 수익 배분을 바꾸려 한다. 이야기를 나눠야겠다.', 'A harbor broker wants to change the shares. A discussion is needed.', {
    careful: ['서로의 이익을 정리한다', 'Clarify both sides’ interests'], alternative: ['장부에서 근거를 찾아 보인다', 'Support your case with the ledger'],
  }),
  'assassin-contract': e('위태로운 의뢰', 'A Dangerous Contract', '위험한 대상을 추적해 달라는 의뢰다. 어떻게 받아들일지 판단하자.', 'You are asked to track a dangerous target. Decide how to handle the contract.', {
    careful: ['거리를 두고 상황을 지켜본다', 'Keep your distance and observe'], alternative: ['의뢰의 모순을 조사한다', 'Investigate contradictions in the contract'],
  }),
  'assassin-shadow': e('그림자를 쫓는 자', 'The Shadow behind You', '추적하던 중 누군가 자신도 지켜보고 있다는 사실을 깨달았다.', 'While tracking someone, you realize that someone is watching you too.', {
    careful: ['조용히 추적을 중단한다', 'Quietly break off the pursuit'], alternative: ['상대의 목적을 읽어 낸다', 'Read the watcher’s intentions'],
  }),
  'assassin-retreat': e('물러날 때의 판단', 'Knowing When to Withdraw', '의뢰 내용이 바뀌어 무관한 여행자가 위험에 휘말릴 것 같다.', 'The terms have changed, and an uninvolved traveler may be drawn into danger.', {
    careful: ['안전한 철수를 우선한다', 'Prioritize a safe withdrawal'], alternative: ['의뢰를 거절할 근거를 설명한다', 'Explain your grounds for refusing the contract'],
  }),
  'bandit-ambush': e('산길의 몫', 'Shares on the Mountain Road', '산길에 멈춘 수레를 두고 동료들의 의견이 갈렸다.', 'Your companions disagree over a cart stopped on the mountain road.', {
    careful: ['힘을 써서 수레를 움직인다', 'Use your strength to move the cart'], alternative: ['다투지 않을 조건을 제시한다', 'Propose terms that avoid a quarrel'],
  }),
  'bandit-camp': e('황야의 야영', 'Camping in the Wilds', '궂은 날씨 속에서 동료들의 야영지를 정비해야 한다.', 'In rough weather, you need to prepare a campsite for your companions.', {
    careful: ['튼튼한 지지대를 세운다', 'Build sturdy supports'], alternative: ['끝까지 작업을 돕는다', 'Keep helping until the work is done'],
  }),
  'bandit-share': e('내분의 기미', 'A Quarrel over Shares', '몫을 둘러싼 말다툼이 커졌다. 동료들을 진정시키고 싶다.', 'An argument over shares is growing. You want to calm the group.', {
    careful: ['작업을 맡아 분위기를 바꾼다', 'Take on a task to change the mood'], alternative: ['양쪽의 주장을 듣는다', 'Hear both sides of the dispute'],
  }),
  'spy-record': e('엇갈린 기록', 'Conflicting Records', '두 기록의 날짜가 다르다. 어느 쪽을 믿을 수 있는지 확인하자.', 'Two records give different dates. Find out which one can be trusted.', {
    careful: ['기록 내용을 대조한다', 'Compare the accounts'], alternative: ['기록 담당자에게 묻는다', 'Ask the record keeper'],
  }),
  'spy-cover': e('빌린 직함', 'A Borrowed Title', '사람들 앞에서 자신의 입장을 설명하게 됐다. 신중한 말이 필요하다.', 'You must explain your position in public. Choose your words carefully.', {
    careful: ['미리 얻은 정보를 정리한다', 'Organize the information you prepared'], alternative: ['침착하게 묻는 말에 답한다', 'Answer questions calmly'],
  }),
  'spy-message': e('닿지 못한 전언', 'The Message That Went Astray', '맡은 전언과 받는 사람의 말이 다르다. 오해를 풀어야겠다.', 'The message you carry does not match the recipient’s account. Clear up the misunderstanding.', {
    careful: ['전언의 앞뒤 사정을 조사한다', 'Investigate the message’s context'], alternative: ['상대의 우려를 물어본다', 'Ask about the recipient’s concerns'],
  }),
  'crimeboss-dispute': e('뒷세계의 약속', 'An Underworld Agreement', '뒷거래의 약속이 서로 달라 중재를 부탁받았다.', 'An illicit deal has conflicting promises, and you are asked to mediate.', {
    careful: ['양쪽이 지킬 조건을 제시한다', 'Propose terms both sides can honor'], alternative: ['이전 약속을 조사한다', 'Review the earlier agreements'],
  }),
  'crimeboss-network': e('인맥의 균열', 'A Fraying Network', '연락 담당자들의 착오로 거래 일정이 흐트러지고 있다.', 'Miscommunication between contacts is disrupting the trading schedule.', {
    careful: ['역할을 정리해 전달한다', 'Clarify and communicate everyone’s role'], alternative: ['일정을 다시 짠다', 'Rework the schedule'],
  }),
  'crimeboss-truce': e('짧은 휴전', 'A Brief Truce', '대립하던 상대가 다툼을 멈추기 위한 대화를 요청했다.', 'A rival asks for talks to put a stop to the conflict.', {
    careful: ['대화 자리를 주선한다', 'Bring the talks together'], alternative: ['계속 지킬 조건을 계산한다', 'Work out sustainable terms'],
  }),
};

export function fantasyQuestText(quest: FantasyQuest, locale: NpcLocale): { name: string; description: string } {
  const text = locale === 'ja' ? undefined : QUESTS[quest.id];
  const index = locale === 'ko' ? 0 : 1;
  return {
    name: locale === 'ja' ? quest.name : quest.names?.[locale] ?? text?.name[index] ?? quest.name,
    description: locale === 'ja' ? quest.description : quest.descriptions?.[locale] ?? text?.description[index] ?? quest.description,
  };
}

export function fantasyEventText(event: FantasyEvent, locale: NpcLocale): { name: string; description: string; choices: Record<string, string> } {
  const text = locale === 'ja' ? undefined : EVENTS[event.id];
  const index = locale === 'ko' ? 0 : 1;
  return {
    name: locale === 'ja' ? event.name : event.names?.[locale] ?? text?.name[index] ?? event.name,
    description: locale === 'ja' ? event.description : event.descriptions?.[locale] ?? text?.description[index] ?? event.description,
    choices: Object.fromEntries(event.choices.map(choice => [choice.id, locale === 'ja' ? choice.label : choice.labels?.[locale] ?? text?.choices[choice.id]?.[index] ?? choice.label])),
  };
}
