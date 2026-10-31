import { FANTASY_MIRACLE_BOOKS } from './fantasy-miracle-catalog.ts';
import { fantasyMagicBookPassage } from './fantasy-magic-discovery.ts';
import type { NpcLocale } from './npc.ts';
import { type FantasyCheckContext, type FantasySkill, type FantasyStat } from './fantasy.ts';
import { FANTASY_JOBS, FANTASY_RACES, FANTASY_RECIPES } from './fantasy-data.ts';
import { FANTASY_CANON_FACTS, FANTASY_TERMS, fantasyTermName } from './fantasy-lore.ts';
import { FANTASY_DINING, FANTASY_LODGINGS } from './fantasy-lodging-catalog.ts';
import { fantasySkillName } from './fantasy-skill-names.ts';
import { FANTASY_BODY_TRAITS, FANTASY_CONTEXT_NAMES, fantasyBodyTraits, fantasyContextBonus } from './fantasy-physiology.ts';
import { FANTASY_STARTING_GOLD, FANTASY_STARTING_INVENTORY } from './fantasy-starting-kit.ts';
import { FANTASY_MANA_PRINCIPLES, FANTASY_MANA_USE_THRESHOLDS } from './fantasy-mana.ts';
import { FANTASY_SKILL_FIELD_BOOKS } from './fantasy-skill-expansion.ts';
import { fantasyJobDiscoveryInsertionIndices, fantasyJobDiscoveryPassages } from './fantasy-job-discovery.ts';
import { FANTASY_RUNE_BOOKS } from './fantasy-rune-books.ts';

export interface FantasyLibraryBook {
  id: string;
  title: Record<NpcLocale, string>;
  body: Record<NpcLocale, string[]>;
  /** Retain old IDs for saves and tooling without putting the setting bible on a shelf. */
  inGame?: boolean;
}

type Passage = [ko: string, en: string, ja: string];
function reading(id: string, title: Passage, passages: Passage[]): FantasyLibraryBook {
  return { id, title: { ko: title[0], en: title[1], ja: title[2] }, body: { ko: passages.map(p => p[0]), en: passages.map(p => p[1]), ja: passages.map(p => p[2]) } };
}

function fieldBook(id: string, title: Passage, passages: Passage[]): FantasyLibraryBook {
  const book = reading(id, title, [...passages, [
    '책을 덮었다고 곧 솜씨가 되는 것은 아니다. 자기 생업에서 익힌 경험과 관련 술기의 수련이 있어야 적힌 가르침을 펼칠 수 있다. 어떤 술기는 스승과 함께 배우며, 어떤 것은 숱한 실천 끝에 깨닫는다. 남의 생업을 읽었다고 그 솜씨까지 얻은 줄 알지 말라.',
    'Closing a book does not put its craft in your hands. To use these teachings, bring experience in your own trade and practice in the related arts. Some arts need a mentor; others emerge through repeated attempts. Reading about another trade does not make its craft your own.',
    '本を閉じても、すぐに腕が身に付くわけではない。記された教えを活かすには、自分の生業の経験や、関わる術技の修練が要る。師に学ぶ術もあれば、何度も試みて悟る術もある。ほかの生業を読んだだけで、その腕まで得たと思ってはならない。',
  ]]);
  for (const locale of ['ko','en','ja'] as const) {
    book.body[locale].push(...FANTASY_JOBS.filter(job => FANTASY_SKILL_FIELD_BOOKS[id]?.includes(job.id)).map(job => `${job.names[locale]}: ${job.skills.filter(skill => !skill.retired&&skill.unlock?.kind === 'book' && skill.unlock.book === id).map(skill => fantasySkillName(skill,locale)).join(', ')}`));
  }
  return book;
}

const readings: FantasyLibraryBook[] = [
  fieldBook('martial-practice', ['무기보다 먼저 멈추는 법', 'Stopping before the Weapon', '武器より先に止まる術'], [
    ['전사의 힘, 기사의 버팀, 창술사의 자루, 궁수의 조준은 다른 모양이지만 무리한 동작을 멈추는 연습부터 시작한다. 발판과 뒤에 선 사람을 확인하고, 성공한 동작보다 위험을 알아본 이유를 먼저 적는다.', 'A warrior’s force, a knight’s endurance, a spear shaft and an archer’s aim differ in form, but begin with learning to stop. Check the ground and companions behind you. Record why you recognized danger before celebrating a successful movement.', '戦士の力、騎士の粘り、槍の柄、弓の狙いは違うが、無理を止める練習から始まる。足場と後ろの人を確かめ、成功より先に危険を見た理由を記す。'],
    ['방패를 세우는 사람도 격투가도 매번 같은 힘을 쓰지는 않는다. 몸이 받아낼 수 있는 무게와 회복할 시간을 나눈다. 큰 선언보다 작고 정확한 반복이 다음 위험에서 버틸 자세를 만든다.', 'Shieldbearer and pugilist alike vary their effort. Separate the load a body can bear from the time it needs to recover. Small, exact repetitions build a guard more reliably than grand declarations.', '盾持ちも格闘家も毎回同じ力を使わない。体が受ける重さと回復の時間を分ける。大きな宣言より小さな正確な反復が次の危険の構えを作る。'],
  ]),
  fieldBook('field-signs', ['흔적을 읽고 돌아오는 길', 'Read the Signs and Return', '痕跡を読み帰る道'], [
    ['모험가와 정찰병은 가장 먼 길보다 돌아올 길을 먼저 기록한다. 사냥꾼은 다른 날의 발자국을 구분하고, 어부는 같은 물표도 물살이 바뀌면 달라 보인다는 사실을 안다.', 'Adventurers and scouts record a return route before the farthest road. Hunters distinguish tracks from different days; fishers know a marker looks different when the current changes.', '冒険者と斥候は最遠の道より帰路を先に記す。狩人は別の日の足跡を分け、漁師は流れが変われば同じ水標も違って見えると知る。'],
    ['관찰의 순서는 위치, 날씨, 실제 흔적, 그 뒤의 해석이다. 소리가 희미하면 모른다고 적고 다른 시각에 다시 본다. 다음 탐사자는 멋진 결론보다 정확한 관찰 위치에서 도움을 얻는다.', 'Record position, weather and actual signs before interpretation. If a sound is unclear, mark it unknown and return at another time. The next traveler benefits more from an exact position than an impressive conclusion.', '位置、天気、実際の跡、解釈の順に書く。音が曖昧なら不明と記し、別の時刻に見直す。次の探索者には立派な結論より正確な観察位置が役立つ。'],
  ]),
  fieldBook('wood-and-hide', ['결과 솔기를 오래 잇기', 'Grain and Seams That Last', '木目と縫い目を長く繋ぐ'], [
    ['목수는 나무결을, 가죽세공사는 늘어나는 방향을, 선공은 물이 힘을 주는 자리를 살핀다. 겉의 작은 금은 안쪽의 긴 손상을 가릴 수 있으므로 덮기 전에 먼저 나누어 본다.', 'Carpenters inspect grain, leatherworkers stretch and shipwrights the places water presses. A small surface crack can hide a long inner fault. Separate and inspect before covering.', '大工は木目、革細工師は伸びる向き、船大工は水が押す場所を見る。小さな表の亀裂が長い内部の傷を隠すこともある。覆う前に分けて確かめる。'],
    ['잘 맞는 이음은 두 재료를 억지로 누르지 않는다. 젖었을 때와 말랐을 때를 비교하고, 사람이 실제로 사용하는 동작을 본다. 수리한 부분이 다음 수리도 가능하게 남는 것이 좋은 마감이다.', 'A sound joint does not force its materials. Compare wet and dry states and watch how the owner actually uses the object. A good finish leaves room for the next repair.', 'よい継ぎ目は材を無理に押さえない。濡れた時と乾いた時、使う人の動きを比べる。次の修理ができる余地を残すのがよい仕上げだ。'],
  ]),
  fieldBook('cloth-and-thread', ['당김 없는 천의 책', 'Cloth without Strain', '引きつれない布の書'], [
    ['날실이 고르더라도 입는 몸은 모두 다르다. 날개와 꼬리, 작은 어깨와 큰 팔에 같은 틀을 강요하지 않는다. 재단사는 움직임을 재고 직조사는 그 움직임을 따라갈 결을 고른다.', 'Even warp does not mean identical bodies. Wings, tails, small shoulders and broad arms should not be forced into one frame. Tailors measure movement; weavers choose a structure that follows it.', '縦糸が揃っても着る体は違う。翼、尾、小さな肩、大きな腕へ同じ枠を強いない。仕立て屋は動きを測り、織り手はそれに沿う目を選ぶ。'],
    ['젖은 소매와 닳은 소맷단은 옷 전체의 끝이 아니다. 작은 조각을 바꾸는 동안 다른 부분의 장력이 어떻게 움직이는지 살핀다. 오래 입는 옷의 아름다움은 수선한 자리를 숨기기보다 편안한 움직임에 있다.', 'A wet sleeve or worn cuff need not end a garment. Watch how tension shifts elsewhere when replacing one panel. Long-lived clothing is beautiful for its ease of movement rather than hidden repairs.', '濡れた袖や擦れた袖口は服の終わりではない。一片を替える時に他の張りがどう動くか見る。長く着る服の美しさは修繕を隠すより楽な動きにある。'],
  ]),
  fieldBook('stone-and-flame', ['돌·쇠·흙과 불의 간격', 'Stone, Metal, Clay and the Fire', '石と鉄と土と火の間'], [
    ['대장장이의 불, 도공의 가마, 보석세공사의 빛은 재료를 다른 방법으로 드러낸다. 색이 예뻐졌다는 이유만으로 튼튼해졌다고 말하지 않는다. 작은 표면과 안쪽의 결을 따로 확인한다.', 'Forge fire, kiln heat and a gemcutter’s light reveal materials differently. A pleasing color does not prove strength. Inspect the surface and inner structure separately.', '鍛冶の火、陶工の窯、宝石細工師の光は材を別の形で示す。美しい色だけで丈夫になったとは言わない。表と内の目を分けて確かめる。'],
    ['가열한 뒤 바로 고치려는 조급함은 손과 재료를 함께 해친다. 받침이 흔들리면 먼저 식히고, 작은 금이 보이면 대조 표본을 구한다. 마지막 손질은 가장 적은 움직임으로 남은 차이를 줄이는 일이다.', 'Rushing to correct heated material risks both hand and work. Let an unstable support cool and seek a comparison sample for a fine crack. Finishing reduces the last difference with the smallest movement.', '熱した直後に直そうと焦ると手も材も傷む。支えが揺れたら冷まし、細い傷には対照見本を求める。仕上げは最小の動きで残る差を減らす仕事だ。'],
  ]),
  fieldBook('green-and-grain', ['잎과 곡물이 식탁에 오를 때', 'When Leaves and Grain Reach the Table', '葉と穀物が食卓へ来る時'], [
    ['약초사는 잎의 차이를, 농부는 물과 저장을, 제빵사와 요리사는 손질과 익힘을 살핀다. 한 사람의 일만으로 한 끼가 오지 않는다. 남김을 줄이는 첫 방법은 어디서 온 재료인지 적는 것이다.', 'Herbalists notice leaves, farmers water and storage, bakers and cooks preparation and heat. No meal comes from one person alone. The first step against waste is recording where ingredients came from.', '薬草師は葉、農夫は水と貯蔵、パン職人と料理人は下拵えと火を見る。一人だけで一食は来ない。無駄を減らす初めは材料の出所を記すことだ。'],
    ['냄새와 겉모양은 누구나 살필 수 있지만 작은 차이의 해석에는 배운 감별이 필요하다. 책에서 보존 이야기를 읽었다고 손에 든 음식의 정확한 나이를 알 수는 없다. 의심이 남으면 따로 두고 다른 재료를 쓴다.', 'Anyone can inspect smell and appearance, but interpreting fine differences takes appraisal. Reading about preservation does not reveal the exact age of food in your pack. Set doubtful supplies aside.', '匂いと見た目は誰も見られるが、細かな差の解釈には鑑別が要る。保存の話を読んでも手元の食物の正確な経過時間は分からない。疑わしければ分けて別の材を使う。'],
  ]),
  fieldBook('remedies-and-rites', ['약과 의식의 절차', 'Procedures for Remedies and Rites', '薬と儀式の手順'], [
    ['마시는 약의 기록에는 약초 두 개와 붉은잎 하나로 회복약을, 약초 하나와 은빛풀 하나로 해독약을 만드는 배합이 남아 있다. 이 두 배합을 다른 재료의 결과까지 알려 주는 기록으로 받아들이지 말라.', 'The drinking remedies record two exact mixtures: two herbs and one redleaf make a healing potion, while one herb and one silverweed make an antidote. These two records do not identify the results of other ingredients.', '飲み薬の記録には二つの正確な配合がある。薬草二つと赤葉一つで回復薬、薬草一つと銀草一つで解毒薬を作る。ほかの素材の結果まで示す記録ではない。'],
    ['첫 배합 기록에는 투척병에 붉은잎 하나와 도마뱀 가죽 하나를 넣으면 화염 폭약이 된다고 적혀 있다. 같은 투척병에 약초 하나와 곰 가죽 하나를 넣으면 수호 강장제가 된다. 용기나 재료를 바꾼 배합은 별개의 실험으로 기록한다.', 'The first reaction notes pair one redleaf with one lizard hide in a flask to make a Fire Bomb. One herb with one bear hide in the same flask makes a Ward Tonic. A different vessel or additional reagent belongs in a separate experiment.', '最初の反応記録では投擲瓶に赤葉一つとトカゲの皮一つを合わせて火炎爆薬を作る。同じ投擲瓶に薬草一つと熊の皮一つを合わせると守護の強壮剤になる。容器や素材を変えた配合は別の実験として記す。'],
    ['연금술사의 반응 기록과 사제의 의식 기록은 같은 문서가 아니다. 그러나 출처를 확인하고 정해진 순서를 지키며, 모르는 결과를 성공이라 선언하지 않는 태도는 함께 배울 수 있다.', 'An alchemist’s reaction notes and a priest’s rites are different records. Both can teach care with sources and order, and the refusal to declare an unknown result a success.', '錬金術師の反応記録と司祭の儀式記録は同じではない。それでも出典と順を守り、不明な結果を成功と宣言しない姿勢は共に学べる。'],
    ['치유의 말은 무제한 생명을 약속하지 않는다. 지친 사람을 쉬게 하고, 위험한 흐름을 거두고, 감당하지 못하면 더 배운 이에게 넘긴다. 성실한 봉사와 좋은 기록은 강한 한 번의 선언보다 오래 남는다.', 'Words of healing promise no unlimited life. Let the weary rest, recover unsafe flows and call a more experienced hand when needed. Careful service and honest records outlast a single grand declaration.', '癒やしの言葉は無限の命を約束しない。疲れた人を休ませ、危うい流れを戻し、及ばなければ学びの深い者へ渡す。誠実な奉仕と記録は大きな宣言より長く残る。'],
  ]),
  fieldBook('words-and-promises', ['남겨 두는 말과 약속', 'Words and Promises That Remain', '残しておく言葉と約束'], [
    ['상인의 장부, 음유시인의 노래, 지도자의 역할표, 기록사의 사본은 서로 다른 목적을 가진다. 사실과 해석, 부탁과 합의를 같은 칸에 적지 않는다. 상대가 고개를 끄덕였다고 모든 조건이 합의된 것은 아니다.', 'Ledgers, songs, duty lists and copies serve different purposes. Keep fact separate from interpretation and requests from agreement. A nod does not settle every condition.', '商人の帳簿、吟遊詩人の歌、指導者の役割表、書記の写しは目的が違う。事実と解釈、頼みと合意を同じ欄にしない。頷きだけで全条件が決まるわけではない。'],
    ['큰 목소리보다 되묻는 한마디가 혼란을 줄일 때가 있다. 무엇을 확인했는지, 무엇은 아직 약속하지 않았는지 남긴다. 빈칸을 지키는 기록도 공동의 삶을 돕는 기술이다.', 'A careful follow-up question can reduce more confusion than a loud voice. Record what was confirmed and what remains unpromised. Preserving a blank can itself serve a community.', '大声より聞き返す一言が混乱を減らすこともある。確かめたことと、まだ約束していないことを残す。空欄を守る記録も共同の暮らしを助ける技だ。'],
  ]),
  fieldBook('shadow-and-risk', ['그늘의 선택과 대가', 'Choices and Costs in the Shadows', '影の選択と代価'], [
    ['뒷세계의 직업을 다룬 이야기들은 대개 빠른 이득보다 남는 위험을 말한다. 다른 이의 소유와 약속을 해치는 선택에는 갈등이 따른다. 이 책은 가상의 사건에서 관찰과 철수, 자제를 살피는 기록이다.', 'Stories of underworld trades describe lasting risk more often than easy gain. Choices against another’s property or promises bring conflict. This book studies observation, withdrawal and restraint in fictional encounters.', '裏社会の職の物語は、早い利益より残る危険を語る。他人の物や約束を害する選択には争いが伴う。この書は架空の出来事の観察、退き、自制を見る記録だ。'],
    ['도둑과 첩자가 쓰는 감각도 위험을 피하거나 잘못된 소문을 가리는 데 쓰일 수 있다. 힘을 가진 사람이 멈출 때를 아는가, 기록이 모호할 때 꾸며 내지 않는가가 중요하다. 직업 이름이 성격의 답은 아니다.', 'The senses used by a thief or spy can also avoid danger or distinguish false rumors. Knowing when to stop and refusing to invent uncertain records matter. A profession’s name is not an answer about character.', '盗賊や密偵の感覚も危険を避け、誤った噂を分けるために使える。止まる時を知り、曖昧な記録を作らないことが大切だ。職名は人格の答えではない。'],
  ]),
  fieldBook('advanced-mana-forms', ['흐름을 크게 하기 전에', 'Before Making the Flow Greater', '流れを大きくする前に'], [
    ['마법사·마검사·소환사의 문양은 목적이 다르다. 조사에 집중하는 흐름, 동작에 힘을 보태는 흐름, 자기 주변을 지키는 문양을 구분한다. 같은 마나를 쓴다고 서로의 모든 술기를 얻지는 않는다.', 'Mage, spellblade and summoner patterns serve different aims. Distinguish focused study, support for physical effort and a pattern protecting its bearer. Shared mana does not grant every profession’s arts.', '魔術師、魔剣士、召喚士の紋は目的が違う。調査への集中、動作への補助、自分を守る紋を分ける。同じ魔力でも互いの全ての術を得るわけではない。'],
    ['고급 제어는 새로운 힘을 끝없이 만드는 방법이 아니다. 이미 배운 술기를 실제로 써 본 경험을 바탕으로 낭비와 흔들림을 줄인다. 자신의 한계를 기록하고 다음 연습 전에 회복할 시간을 남긴다.', 'Advanced control does not create endless power. It reduces waste and instability through real experience with learned arts. Record your limits and leave time to recover before the next practice.', '高度な制御は無限の力を作る方法ではない。学んだ術を実際に使う経験から無駄と揺れを減らす。限界を記し、次の練習まで回復の時間を残す。'],
  ]),
  reading('lantern-fox', ['등불을 빌린 여우', 'The Fox Who Borrowed a Lantern', '灯を借りた狐'], [
    ['어느 비 오는 저녁, 여우가 길 잃은 아이에게 등불을 빌렸다. 여우는 숲길을 모두 안다고 자랑했지만 등불을 높이 들수록 자기 발만 눈부셨다.', 'One rainy evening, a fox borrowed a lantern from a lost child. He boasted that he knew every forest path, yet holding the light high only dazzled his own eyes.', '雨の晩、狐は迷子から灯を借りた。森の道は皆知っていると自慢したが、高く掲げるほど自分の目が眩んだ。'],
    ['아이는 등불을 낮춰 물웅덩이를 비췄다. 둘은 나뭇가지에 남은 실과 발자국을 번갈아 찾아 작은 다리까지 갔다.', 'The child lowered the lantern toward the puddles. Taking turns finding loose threads and footprints, they reached a little bridge.', '子は灯を下げて水たまりを照らした。二人は枝の糸と足跡を交代で探し、小さな橋まで歩いた。'],
    ['집 앞에서 여우가 말했다. 오늘은 내가 길을 알려 주지 못했구나. 아이는 대답했다. 그래도 혼자 돌아오지는 않았잖아. 그 뒤로 여우는 아는 길에서도 동행의 눈높이에 등불을 들었다.', 'At the door the fox admitted, “I did not show you the way.” The child said, “But neither of us came home alone.” Thereafter he carried the lantern at his companion’s height, even on familiar roads.', '戸口で狐は、道を教えられなかったと認めた。子は、でも一人で帰らなかったねと答えた。それから狐は知った道でも連れの高さに灯を持った。'],
  ]),
  reading('tin-pot-king', ['양철냄비 왕', 'The King of the Tin Pot', 'ブリキ鍋の王様'], [
    ['빈 냄비에 올라선 참새는 자신을 부엌의 왕이라 불렀다. 왕관은 양파 껍질, 홀은 부러진 숟가락이었다.', 'A sparrow standing in an empty pot declared himself king of the kitchen. His crown was onion skin and his scepter a broken spoon.', '空の鍋に立った雀は台所の王を名乗った。冠は玉ねぎの皮、杖は折れた匙だった。'],
    ['쥐는 곡식을, 고양이는 따뜻한 자리를, 요리사는 저녁을 요구했다. 왕은 세 번 명령했지만 냄비에서는 메아리만 돌아왔다.', 'The mouse asked for grain, the cat for warmth and the cook for supper. The king gave three orders; the pot returned only echoes.', '鼠は穀物、猫は暖かい場所、料理人は夕食を求めた。王が三度命じても鍋は響くだけだった。'],
    ['참새가 왕관을 벗고 씨앗을 나르자 모두가 한 숟갈씩 도왔다. 수프가 끓자 왕좌는 없어졌지만 저녁 자리는 하나 늘었다. 부엌에서는 아직도 큰소리만 치는 이를 냄비 왕이라 부른다.', 'When the sparrow took off his crown and carried seeds, everyone helped a spoonful at a time. The throne vanished beneath the soup, but supper gained another place. A loud idler is still called a pot king.', '雀が冠を外して種を運ぶと皆が一匙ずつ手伝った。汁が煮え、玉座は消えたが席は一つ増えた。台所では声だけ大きい者を今も鍋の王と呼ぶ。'],
  ]),
  reading('rain-tailor', ['비를 꿰매는 재봉사', 'The Rain Tailor', '雨を縫う仕立て屋'], [
    ['물결베틀마을 아이는 비에도 젖지 않는 옷을 부탁했다. 재봉사는 구멍 하나 없는 천보다 먼저 처마 밑의 바람을 보여 주었다.', 'A child of Loomwater asked for clothes that rain could never wet. Before showing flawless cloth, the tailor showed the breeze beneath the eaves.', '波織りの里の子が、雨に濡れない服を頼んだ。仕立て屋は穴のない布より先に、軒下の風を見せた。'],
    ['둘은 젖은 소매를 떼어 말리고, 마른 조각을 임시로 달았다. 아이는 완벽한 옷이 없다고 실망했다. 재봉사는 옷도 쉬어야 오래 함께한다고 말했다.', 'They detached a wet sleeve to dry and tied on a spare panel. The child was disappointed that no perfect garment existed. The tailor said clothes, too, needed rest to remain a companion.', '二人は濡れた袖を外し、乾いた布を仮に付けた。完璧な服はないのかと子は落胆した。仕立て屋は、服も休めば長く連れ添えると言った。'],
    ['다음 비에 아이는 친구의 찢어진 어깨천을 꿰맸다. 비를 멈추지는 못했지만 친구는 웃으며 집에 갔다. 이 동화에서 비를 꿰맨다는 말은 젖지 않는 마법이 아니라 서로를 돌보는 일을 뜻한다.', 'In the next rain the child mended a friend’s torn cape. The rain did not stop, but the friend went home smiling. To sew rain, in this tale, means care rather than a spell of perfect dryness.', '次の雨の日、子は友の破れた肩布を縫った。雨は止まらなかったが友は笑って帰った。この話で雨を縫うとは、濡れない魔法でなく互いを気遣うことだ。'],
  ]),
  reading('borrowed-shadow', ['그림자를 빌린 장화', 'The Boots with a Borrowed Shadow', '影を借りた長靴'], [
    ['장화 한 켤레가 주인보다 먼저 여행을 떠났다. 낮에는 너무 뜨거워 큰 모자의 그림자를 빌렸고, 저녁에는 모자가 제 그림자를 돌려 달라 했다.', 'A pair of boots set out before their owner. At noon they borrowed a broad hat’s shade; at dusk the hat asked for its shadow back.', '一足の長靴が持ち主より先に旅立った。昼の暑さに大帽子の影を借り、夕方になると帽子が返してくれと言った。'],
    ['장화는 길 위의 검은 자국을 모두 쓸어 모았다. 그러나 모자는 자기 것이 아니라며 웃었다. 해가 내려가자 둘의 그림자는 자연히 길어졌다.', 'The boots swept together every dark patch on the road. The hat laughed that none was his. As the sun sank, both shadows lengthened on their own.', '長靴は道の黒い跡を集めたが、帽子は自分のではないと笑った。日が傾くと二つの影は自然に長くなった。'],
    ['마침내 둘은 같은 나무 아래 쉬었다. 빌린 친절은 같은 물건으로 갚지 않아도 된다고 모자가 말했다. 장화는 다음 날 모자를 진흙길 너머로 데려갔다. 실제 그림자가 움직인다는 기록이 아닌 장난스러운 우화다.', 'At last they rested beneath one tree. Kindness need not be returned as the same object, said the hat. Next day the boots carried him across the mud. This is a playful fable, not a record of living shadows.', '同じ木陰で休むと、親切は同じ物で返さなくてもよいと帽子は言った。翌日、長靴は帽子を泥道の先まで運んだ。動く影の記録ではなく、愉快な寓話である。'],
  ]),
  reading('quiet-sword', ['조용한 검의 첫 장', 'The Quiet Sword: First Lessons', '静かな剣の初歩'], [
    ['검을 뽑기 전 바닥과 뒤쪽의 사람부터 확인한다. 두 발을 너무 벌리지 말고 무릎을 굳히지 않는다. 긴장한 어깨는 날끝보다 먼저 지친다.', 'Before drawing, check the ground and the people behind you. Keep your feet within a comfortable span and your knees unlocked. Tense shoulders tire before the blade does.', '抜く前に足元と後ろの人を確かめる。足を広げ過ぎず膝を固めない。力んだ肩は刃先より先に疲れる。'],
    ['첫 연습은 베기가 아니라 멈추기다. 나뭇가지 앞에서 천천히 손을 멈추고 같은 자리로 돌아온다. 속도를 올리기 전에 동료가 다가오면 즉시 멈출 수 있어야 한다.', 'The first exercise is stopping, not cutting. Halt slowly before a twig and return to the same position. Before adding speed, be able to stop whenever a partner steps close.', '最初は斬るより止める練習。枝の手前でゆっくり止め、同じ位置へ戻す。速くする前に仲間が近づけばすぐ止まれるようにする。'],
    ['검집에 넣은 뒤 손과 발의 힘을 푼다. 몸이 작은 사람과 날개가 있는 사람은 같은 폭을 억지로 흉내 내지 말고 자기 균형을 찾는다. 이 책은 수련 이야기이며 읽기만으로 기술이나 전투 능력이 생기지는 않는다.', 'Relax hands and feet after sheathing. Small bodies and winged bodies should find their own balance rather than imitate the same stance width. This practice text grants no skill or combat power simply by being read.', '納めたら手足の力を抜く。小柄な者も翼のある者も同じ歩幅を無理に真似ず、自分の釣り合いを探す。読んだだけで技や戦闘能力は得られない。'],
  ]),
  reading('staff-and-footwork', ['막대기와 세 걸음', 'A Staff and Three Steps', '杖と三つの歩み'], [
    ['길잡이는 지팡이로 땅을 짚기 전에 끝부분의 갈라짐을 살폈다. 믿는 도구일수록 자주 확인하라는 것이 그의 첫 수업이었다.', 'The guide inspected the split end of his staff before testing the ground. The more trusted the tool, the more often it deserved inspection.', '道案内は杖で地面を突く前に先端の割れを見た。頼る道具ほどよく確かめるのが最初の教えだった。'],
    ['첫 걸음은 발밑, 둘째는 다음 디딤돌, 셋째는 돌아갈 자리까지 살핀다. 깊은 물이나 좁은 틈에서는 몸의 성질과 짐의 폭도 함께 생각한다.', 'The first step checks the ground, the second the next foothold, the third a place to return. At deep water or tight passages, consider your body and the width of your load.', '一歩目は足元、二歩目は次の足場、三歩目は戻れる場所を見る。深い水や隙間では体質と荷の幅も考える。'],
    ['제자가 세 걸음이면 어디든 가느냐고 묻자 길잡이는 세 걸음씩 돌아올 수도 있다고 답했다. 좋은 발놀림은 반드시 앞으로만 향하지 않는다.', 'Asked whether three steps could reach anywhere, the guide replied that they could also bring you back. Good footwork does not always lead forward.', '三歩でどこへでも行けるかと問う弟子に、案内は三歩ずつ戻ることもできると答えた。よい足運びは前に進むだけではない。'],
  ]),
  reading('mana-primer', ['숨에서 시작하는 마나', 'Mana Begins with Breath', '息から始まるマナ'], [
    ['마나는 생명력 그 자체가 아니다. 처음에는 조용히 감응하고, 다음에는 호흡을 고르게 하여 몸 안의 흐름을 살핀다. 강하게 느껴진다는 이유로 다음 단계를 건너뛰지 않는다.', 'Mana is not life itself. First sense quietly, then steady the breath and observe the flow within the body. A strong sensation is no reason to skip the next lesson.', '魔力は命そのものではない。まず静かに感じ、次に呼吸を整え体内の流れを見る。強く感じても次の段階を飛ばさない。'],
    ['호흡 순환을 익힌 전사도 근육과 감각을 잠시 강화할 수 있다. 마법사만 마나를 배우는 것은 아니다. 오래 유지하려고 무리하면 제어가 흔들리고 피로와 과부하가 쌓인다.', 'A warrior who learns circulation may briefly reinforce muscles and senses. Mana is not reserved for mages. Forcing it to last unsettles control and builds fatigue and strain.', '循環を学ぶ戦士も筋肉や感覚を一時強化できる。魔法使いだけの学びではない。長く保とうと無理をすると制御が乱れ、疲労と負荷が溜まる。'],
    ['감응·순환·형태·방출과 회수는 마나를 이해하는 바탕이다. 글로 읽은 요령은 몸으로 익혀야 한다. 치유가 상처를 다독이고 방호가 충격을 받아 내는 경험을 거듭하라. 품은 힘을 알맞은 때에 써 보는 일이 마나를 길들이는 길이다.', 'Sensing, circulation, shaping, release and recovery form the foundation of mana practice. Written advice must be learned through the body. Repeat the experience of easing a wound or catching a blow with a ward; power is mastered through useful practice.', '感応、循環、成形、放出と回収はマナを理解する基礎である。読んだ心得は身体で覚えよう。傷を癒やし、防護で衝撃を受け止める経験を重ね、必要なときに力を役立てることが修練となる。'],
  ]),
  reading('mana-shapes', ['그릇과 물결의 수련장', 'Bowls and Ripples', '器と波の修練帖'], [
    ['그릇에 물을 채워 손이 아닌 시선으로 표면을 따른다. 이 비유의 목적은 물을 움직이는 묘기가 아니라, 한 가지 형태를 서두르지 않고 관찰하는 데 있다.', 'Fill a bowl and follow its surface with your eyes. The exercise is a metaphor for observing one shape without haste, not a trick for moving water.', '器の水面を目で追う。水を動かす曲芸ではなく、一つの形を急がず観察するためのたとえだ。'],
    ['실바라에서는 빗방울의 간격을, 카자란에서는 바람 속 자세를 연습의 기준으로 삼는다. 노크티스는 관찰을 적고 아우렐리아는 등불 곁에서 고른 흐름을 익힌다. 관습의 차이가 더 높은 힘을 보장하지는 않는다.', 'Sylvara uses the interval between raindrops; Kazaran uses posture in wind. Noctis records observations, while Aurelia practices steady flows beside lamps. A different custom does not guarantee greater power.', 'シルヴァラは雨粒の間隔、カザランは風中の姿勢を目安にする。ノクティスは観察を記し、アウレリアは灯の傍で一定の流れを学ぶ。習慣の違いが強さを保証するわけではない。'],
    ['형태가 흔들리면 크게 방출하기보다 흐름을 거둬들인다. 마나 친화는 균형·불꽃·물결·바람·돌·빛·그림자로 기록하지만 성격이나 선악을 정하지 않는다. 그릇의 모양보다 넘치지 않게 다루는 손길이 먼저다.', 'When a shape wavers, recover its flow instead of releasing more. Affinities are recorded as balanced, flame, tide, gale, stone, light or shadow; they dictate neither temperament nor morality. First learn not to spill.', '形が揺らいだら大きく放つより流れを戻す。親和は均衡、炎、潮、風、石、光、影と記すが、性格や善悪は決めない。器の形より、溢れさせない扱いが先だ。'],
  ]),
  reading('mender-notes', ['수선하는 사람의 쪽지', 'The Mender’s Notes', '繕う人の覚え書き'], [
    ['찢어진 곳보다 조금 넓게 안쪽 천을 덧댄다. 당장 보이는 구멍만 꿰매면 옆의 약한 올이 다시 끊어진다. 해진 도구도 같은 원리로 살핀다.', 'Put the inner patch slightly beyond a tear. Closing only the visible hole leaves weakened threads to break again. Inspect worn tools with the same care.', '裂け目より少し広く裏布を当てる。見える穴だけ縫うと隣の弱い糸が切れる。道具の摩耗も同じように見る。'],
    ['실바라의 떼어지는 소매와 카자란의 교체 소맷단은 멀리 떨어진 땅에서 닮은 답을 찾았다. 모든 옷을 한 모양으로 만들 필요 없이 자주 닳는 곳을 고칠 수 있으면 된다.', 'Sylvara’s detachable sleeves and Kazaran’s replaceable cuffs found similar answers in distant lands. Garments need not look alike if their most worn parts can be repaired.', 'シルヴァラの外せる袖とカザランの交換する袖口は、遠い土地で似た答えを見つけた。同じ形の服でなくても、擦れる所を直せればよい。'],
    ['수선값을 받기 전에 주인에게 어디가 달라지는지 말한다. 오래 쓴 물건에는 눈에 보이지 않는 습관이 배어 있다. 바꾸기보다 먼저 물어보는 것도 장인의 손기술이다.', 'Before charging for a repair, explain what will change. Long-used things hold habits the eye cannot see. Asking before replacing is part of a craftsperson’s skill.', '修理代を受け取る前に何が変わるか伝える。使い込んだ物には見えない癖がある。交換の前に尋ねるのも職人の技だ。'],
  ]),
  reading('small-balcony-garden', ['작은 난간의 정원', 'The Small Balcony Garden', '小さな手すりの庭'], [
    ['큰 밭이 없어도 금 간 그릇에 흙을 담아 향풀을 기를 수 있다. 그릇 아래에는 물이 빠질 틈을 두고 바닥이 젖지 않도록 받침을 놓는다.', 'Without a field, a cracked pot can still hold herbs. Leave room for drainage and a tray beneath it so the floor stays dry.', '畑がなくても欠けた器に土を入れて香草を育てられる。水の抜け道と受け皿を用意し、床を濡らさない。'],
    ['새싹을 자주 만지는 대신 햇빛과 흙의 마름을 관찰한다. 물을 많이 주는 일이 언제나 친절은 아니다. 이웃이 맡아 줄 때는 마지막으로 물 준 날을 적는다.', 'Observe light and drying soil rather than constantly touching the shoots. More water is not always kinder. Leave the last watering date when a neighbor takes over.', '芽に何度も触るより日と土の乾きを見る。水を多くやるのがいつも親切とは限らない。隣人に預ける時は最後に水をやった日を書く。'],
    ['처음 딴 잎은 작은 수프에 넣고 씨앗 하나는 남겨 둔다. 창가의 작은 화분도 돌보는 손을 기억한다. 이웃에게 잎 한 장을 건네고 다음 계절을 기다리는 일이 글쓴이의 소박한 즐거움이다.', 'Put the first leaves in a small soup and keep one seed. Even a tiny window pot remembers the hands that tend it. Sharing a leaf with a neighbor and waiting for the next season is the writer’s modest pleasure.', '最初の葉は小さなスープに入れ、種を一つ残す。窓辺の小鉢も世話をする手を覚える。隣人に葉を一枚分け、次の季節を待つことが、書き手のささやかな楽しみだ。'],
  ]),
  reading('caravan-ledger', ['물 한 잔의 장부', 'A Ledger of Water', '一杯の水の帳簿'], [
    ['카자란 상단은 떠나기 전 물주머니와 짐의 무게를 함께 확인한다. 물이 부족한 동행을 길 가운데에서야 발견하면 모두의 걸음이 늦어진다.', 'Kazaran caravans check water and loads together before setting out. Discovering a companion’s shortage halfway along slows every traveler.', 'カザランの隊商は出発前に水袋と荷を皆で確かめる。途中で仲間の水不足を知れば全員の足が遅れる。'],
    ['장부에는 값뿐 아니라 맡긴 사람과 돌려줄 장소를 적는다. 선물, 빚, 판매품을 같은 칸에 적지 않는다. 큰 상단도 처음에는 서로 헷갈리지 않는 작은 약속에서 시작한다.', 'The ledger records the keeper and return place as well as the price. Gifts, debts and sale goods belong in separate columns. Great caravans begin with small promises that cannot be confused.', '帳簿には値だけでなく預けた人と返す場所を書く。贈り物、借り、売り物を同じ欄にしない。大きな隊商も取り違えない小さな約束から始まる。'],
    ['모닥불에서 남은 물을 나누자 막내가 왜 돈을 받지 않느냐고 물었다. 장부지기는 내일 그가 우리 물의 무게를 기억할 것이라 답했다. 모든 거래가 금화 칸에 남는 것은 아니다.', 'When spare water was shared at the fire, the youngest asked why no coins were taken. The keeper said the recipient would remember its weight tomorrow. Not every exchange belongs in the gold column.', '焚き火で余った水を分けると、なぜ代金を取らないのかと若者が聞いた。帳簿係は、明日あの人が水の重さを覚えているからだと答えた。全てのやり取りが金貨の欄に残るわけではない。'],
  ]),
  reading('harbor-signals', ['항구에서 손을 흔드는 법', 'How to Wave in a Harbor', '港で手を振る方法'], [
    ['떠나는 배에 손을 흔드는 것과 정박을 돕는 신호는 다르다. 항구에서는 먼저 밧줄과 짐이 움직이는 길을 비우고 현지의 안내를 따른다.', 'A farewell wave is not a mooring signal. In a harbor, first clear the paths of ropes and cargo and follow the local guide.', '見送りの手振りと係留の合図は違う。港ではまず綱と荷の通り道を空け、現地の案内に従う。'],
    ['푸른돛항에서는 깊은 처마 아래 돛을 말리고 호박빛항에서는 그늘막 아래 물건을 묶는다. 다른 옷을 보고 다른 약속을 짐작하지 말고, 담당자에게 한 번 더 묻는다.', 'Verdant Quay dries sails under deep eaves; Amberwake binds cargo beneath awnings. Do not guess a different promise from different clothes: ask the harbor keeper.', '緑帆港は深い軒で帆を乾かし、琥珀の港は日除けの下で荷を結ぶ。服の違いから約束を決めつけず、係にもう一度尋ねる。'],
    ['여객선은 운임을 내고, 작업선은 일을 거들며 건넌다. 운항편의 소요 시간과 비용은 출발지에서 확인한다. 책 속 항해 경험이 오늘의 배편을 보장하지는 않는다.', 'Passenger ships take fares; working passage involves labor. Check the voyage duration and fare at departure. A voyage in a book does not guarantee today’s sailing.', '客船は運賃を払い、作業船では仕事を手伝う。時間と料金は出発地で確認する。本の航海談が今日の便を保証するわけではない。'],
  ]),
  reading('sylvara-journal', ['실바라의 젖은 소매', 'Wet Sleeves in Sylvara', 'シルヴァラの濡れた袖'], [
    ['푸른돛항에 내린 첫날, 나는 사람마다 다른 색의 소매를 입는다고 적었다. 다음 날 그들이 젖은 조각을 말리느라 바꿔 달았음을 알았다. 서둘러 적은 관찰 옆에 정정을 남겼다.', 'On my first day at Verdant Quay, I wrote that everyone wore mismatched sleeves. Next day I learned they were changing wet panels to dry. I added a correction beside my hurried observation.', '緑帆港の初日、皆の袖の色が違うと書いた。翌日、濡れた部分を外して乾かしていると知った。急いだ観察の隣に訂正を残した。'],
    ['물결베틀마을의 베틀에는 다음 사람 몫의 실이 남아 있었다. 낯선 손님인 나도 짧은 줄을 짰다. 곧은 줄 하나가 생각보다 어려워 저녁 내내 어깨의 힘을 풀었다.', 'A Loomwater loom held thread left for its next user. As a guest I wove one short band. A straight line proved harder than expected; I spent the evening relaxing my shoulders.', '波織りの里の機には次の人の糸が残っていた。客の私も短い帯を織った。真っ直ぐな一本が思ったより難しく、夕べは肩の力を抜く練習になった。'],
    ['비그늘수림 너머 고사리옛터의 문양은 알아보지 못했다. 모른다는 한 줄이 빈칸을 멋진 왕국 이름으로 채우는 것보다 정직했다. 다음 항해자는 내 답보다 관찰 위치를 쓸모 있게 여길 것이다.', 'I could not identify the carvings beyond Rainvault at Fern Sanctum. “Unknown” was more honest than filling the space with a splendid kingdom’s name. The next traveler may value my position notes more than my answer.', '雨蔭の森の先、羊歯の古跡の模様は分からなかった。不明の一行は立派な王国名で埋めるより正直だ。次の旅人には答えより観察位置が役立つだろう。'],
  ]),
  reading('kazaran-journal', ['카자란의 밤 겉옷', 'Kazaran’s Coat at Night', 'カザランの夜の上着'], [
    ['호박빛항의 낮에 두꺼운 어깨천을 보고 덥지 않느냐고 물었다. 상인은 천을 말아 짐 위에 놓더니 밤에 다시 물어보라고 웃었다.', 'At midday in Amberwake I asked why anyone carried a thick shoulder cloth. A merchant rolled it onto his pack and told me to ask again at night.', '琥珀の港の昼、厚い肩布は暑くないかと聞いた。商人は巻いて荷に載せ、夜にまた聞けと笑った。'],
    ['붉은직물도시로 향하는 길에서 해가 지자 나는 먼저 그 천을 찾았다. 옷은 겉모양뿐 아니라 하루의 길이를 담는다는 말을 그제야 이해했다.', 'On the road to Redweave, sunset sent me looking for that cloth first. Only then did I understand that clothing holds the length of a day as well as a shape.', '赤織の街への道で日が沈むと、私が先にその布を探した。服は形だけでなく一日の長さを包むのだと分かった。'],
    ['소금거울분지의 반사광은 멀리 있는 것의 거리를 흐렸다. 상단은 서두르지 않고 발밑부터 확인했다. 바람 소리가 큰 땅에서 가장 믿음직한 말은 잠깐 멈추자는 말이었다.', 'Glare in Saltglass Basin blurred the distance of far objects. The caravan checked its footing rather than hurrying. In a land loud with wind, the most reassuring words were “Let us stop a moment.”', '塩鏡盆地の照り返しは遠くの距離を曖昧にした。隊商は急がず足元を確かめた。風音の大きな土地で最も頼もしい言葉は、少し止まろう、だった。'],
  ]),
  reading('mirrorwake-voyage', ['거울물결 관찰 항해록', 'A Mirrorwake Observation Voyage', '鏡波観測航海記'], [
    ['천둥종섬을 떠나 거울물결섬에 닻을 내렸다. 둥근 만은 바람이 잦아들자 하늘을 또 하나 품었다. 수면 아래 고리 모양 빛을 본 시각과 배의 위치를 적었다.', 'We left Stormbell and anchored at Mirrorwake. As the wind faded, the round bay held a second sky. I recorded the time and boat position of a ring-shaped light beneath the surface.', '雷鐘の島を発ち鏡波の島に錨を下ろした。風が止むと丸い湾はもう一つの空を抱いた。水面下の輪の光を見た時刻と船の位置を記した。'],
    ['누군가는 어제의 별을 보았다고 했고 누군가는 돌아오지 않은 배의 창이라고 했다. 우리 일지에는 그런 원인을 확인할 증거가 없다고 썼다. 아름다운 광경과 아름다운 설명은 서로 다른 것이었다.', 'One sailor spoke of yesterday’s stars; another of a lost ship’s window. Our log said we had evidence for neither cause. A beautiful sight and a beautiful explanation were different things.', '昨日の星だと言う者も、戻らぬ船の窓だと言う者もいた。どちらの原因を示す証拠もないと日誌に書いた。美しい眺めと美しい説明は別物だった。'],
    ['다음 날 구름과 바람이 바뀌어 고리는 흐릿했다. 우리는 다음 관찰자를 위해 빈 표와 마른 종이를 남겼다. 섬은 비밀의 답보다 더 좋은 질문을 가지고 돌아가게 했다.', 'The next day clouds and wind changed and the rings were faint. We left blank tables and dry paper for the next observer. The island sent us home with better questions rather than a secret answer.', '翌日は雲と風が変わり輪は薄かった。次の観測者へ空の表と乾いた紙を残した。島は秘密の答えよりよい問いを持たせて帰した。'],
  ]),
  reading('one-hundred-spoons', ['숟가락 백 개의 용도', 'One Hundred Uses for a Spoon', '匙の百の使い道'], [
    ['첫 번째 용도는 수프를 먹는 것. 두 번째는 빈 그릇을 두드려 수프가 없다는 사실을 알리는 것. 세 번째부터는 요리사의 허락을 받고 읽기를 바란다.', 'The first use is eating soup. The second is tapping an empty bowl to announce the lack of soup. Seek the cook’s permission before reading use three onward.', '一つ目は汁を食べること。二つ目は空の器を叩いて汁がないと知らせること。三つ目からは料理人の許可を得て読みたい。'],
    ['마흔일곱 번째는 모자에 꽂아 자신을 아주 바쁜 사람처럼 보이게 하는 것. 마흔여덟 번째는 그것을 잊고 낮은 문을 지나다 모자의 위치를 깨닫는 것.', 'Use forty-seven is tucking it into a hat to look very busy. Forty-eight is forgetting it and discovering the hat’s location at a low doorway.', '四十七番目は帽子に挿して忙しそうに見せること。四十八番目は忘れたまま低い戸を通り、帽子の位置を思い出すこと。'],
    ['백 번째는 친구에게 건네고 같은 냄비를 나누는 것. 편집자는 아흔여섯 항목이 비었다고 지적했다. 저자는 식사 뒤에 생각하겠다며 숟가락을 가져갔다.', 'The hundredth use is handing it to a friend and sharing the pot. The editor noted ninety-six missing entries. The author took the spoon and promised to think after supper.', '百番目は友に渡し同じ鍋を分けること。編集者は九十六項目足りないと言った。著者は食後に考えると匙を持ち去った。'],
  ]),
  reading('argument-of-hats', ['모자들의 회의', 'The Parliament of Hats', '帽子たちの会議'], [
    ['넓은 모자는 세상에 그늘이 부족하다고 했다. 뾰족한 모자는 높이가 부족하다고 했고 털모자는 따뜻함이 부족하다고 했다. 모자걸이는 우선 걸 자리가 부족하다고 했다.', 'The broad hat said the world lacked shade. The pointed hat wanted height; the fur hat wanted warmth. The hat stand said it first needed somewhere to hang them.', '広帽子は世に日陰が足りないと言った。尖り帽子は高さ、毛帽子は暖かさが足りないと言った。帽子掛けはまず掛ける場所が足りないと言った。'],
    ['그들은 가장 훌륭한 모자를 뽑기로 했다. 그러나 비가 오자 모두 비옷의 두건 밑으로 숨었다. 두건은 투표권을 요구하지 않고 조용히 빗물을 흘렸다.', 'They voted to choose the finest hat. When rain came, all hid beneath a rain hood. The hood quietly shed water without demanding a vote.', '一番よい帽子を投票で決めることにした。雨が降ると皆が雨具の頭巾に隠れた。頭巾は投票権を求めず静かに雨を流した。'],
    ['회의록의 결론은 모자걸이를 하나 더 만들자였다. 이 책의 빈 마지막 장은 독자의 모자가 반론을 쓰는 자리다. 도서관 책에 실제로 낙서해도 된다는 뜻은 아니다.', 'The minutes concluded that another hat stand was needed. The final blank page invites the reader’s hat to object. This is not permission to scribble in a library copy.', '議事録の結論は帽子掛けをもう一つ作ろう、だった。最後の空白は読者の帽子が反論する場所だが、図書館の本に落書きしてよいわけではない。'],
  ]),
  reading('weather-in-a-bottle', ['병 속 날씨 감별법', 'Weather in a Bottle', '瓶の中の天気鑑定'], [
    ['빈 병을 창가에 두고 흐리면 구름 병, 밝으면 햇살 병이라 부른다. 뚜껑을 닫는 순간 날씨가 갇힌다고 주장하는 장은 편집자가 삭제했다.', 'Set an empty bottle by a window: in gray light call it a cloud bottle, in bright light a sunshine bottle. The editor removed a chapter claiming that a lid imprisoned the weather.', '空瓶を窓辺に置く。暗ければ雲の瓶、明るければ日差しの瓶と呼ぶ。蓋で天気を閉じ込めるという章は編集者が削った。'],
    ['흔들어 비가 오는 소리가 나면 물이 든 병이다. 아무 소리가 없으면 빈 병일 수도 있지만, 늦잠 자는 구름이 있다고 적으면 시가 된다. 장부에는 그렇게 쓰지 않는다.', 'If shaking makes the sound of rain, the bottle contains water. Silence may mean it is empty; calling it a sleeping cloud makes a poem. Do not enter that in a ledger.', '振って雨音がすれば水入りの瓶だ。無音なら空かもしれないが、寝坊する雲と書けば詩になる。帳簿には書かない。'],
    ['마지막 시험은 병 밖의 하늘을 보는 것이다. 고개를 들게 만든다면 이 책도 조금은 쓸모가 있다. 구름을 병에 가두었다고 자랑하는 장사꾼을 만나거든, 병을 사기 전에 하늘부터 보아라.', 'The final test is looking at the sky outside the bottle. If it makes you lift your head, the book has some use. Should a merchant boast of bottling a cloud, look at the sky before buying the bottle.', '最後の試験は瓶の外の空を見ること。顔を上げさせるならこの本にも少し用がある。雲を瓶に閉じ込めたと自慢する商人に会ったら、瓶を買う前に空を見よう。'],
  ]),
];

const labels: Record<NpcLocale, Record<FantasyStat, string>> = {
  ko: { strength: '힘', agility: '민첩', intelligence: '지능', luck: '운', vitality: '체력', dexterity: '손재주', charisma: '카리스마' },
  en: { strength: 'Strength', agility: 'Agility', intelligence: 'Intelligence', luck: 'Luck', vitality: 'Vitality', dexterity: 'Dexterity', charisma: 'Charisma' },
  ja: { strength: '力', agility: '敏捷', intelligence: '知力', luck: '運', vitality: '体力', dexterity: '手先', charisma: 'カリスマ' },
};

function duration(hours: number, locale: NpcLocale): string {
  return { ko: `${hours}시간`, en: `${hours} ${hours === 1 ? 'hour' : 'hours'}`, ja: `${hours}時間` }[locale];
}

function startingSupplies(locale: NpcLocale): string {
  const items = Object.entries(FANTASY_STARTING_INVENTORY).map(([id, count]) => `${fantasyTermName(id, locale)} ×${count}`).join(', ');
  return { ko: `여행 준비 메모: 여행을 떠날 때는 ${FANTASY_STARTING_GOLD}G와 ${items}을 챙겨 두면 좋다. 집안에서 전해 온 물건이나 이웃의 작은 선물을 받는 이도 있다. 한 번 받은 여비와 선물은 아껴 써라. 지도는 장터에서 따로 구하고, 귀한 장비는 스스로 손에 넣어야 한다.`, en: `A note on travel preparations: set aside ${FANTASY_STARTING_GOLD} G and ${items}. Some travelers carry an heirloom or a small gift from a neighbor. Treasure such provisions; a farewell purse is not an endless allowance. Buy charts at the market and earn rare equipment yourself.`, ja: `旅支度の覚え書き。旅立つときは${FANTASY_STARTING_GOLD}Gと${items}を用意するとよい。家に伝わる品や、隣人の小さな贈り物を持つ者もいる。餞別は無尽蔵ではない。地図は市で求め、貴重な装備は自ら手に入れよう。` }[locale];
}

const clockRules: Record<NpcLocale, string[]> = {
  ko: ['해와 달은 모든 땅 위를 같은 걸음으로 지난다. 마을 종루의 시각을 맞추고, 해가 진 뒤에는 길을 밝혀라. 하루는 스물네 시간이며, 장날과 계절을 살피는 것도 여행자의 지혜다.', '길에 나서거나 일에 손을 대면 충분한 시간을 들여 마쳐라. 한창 일하는 사람에게 다른 일을 맡기거나 말을 붙여 집중을 흩트리지 마라. 작업 사이의 작은 성과도 장부에 남기면 끝에 품삯을 헤아리기 쉽다.', '자리를 비워도 세월은 흐르고 식량은 변한다. 긴 여정에는 보존식을 챙겨라. 기다리는 동안에도 배는 고파지고, 힘든 일을 하면 피로가 더 빨리 쌓인다. 편한 잠자리를 마련하는 것은 게으름이 아니라 다음 날의 준비다.'],
  en: ['Sun and moon keep the same pace above every land. Set your watch by the town bell and light your way after dusk. A day has twenty-four hours; wise travelers watch market days and seasons as carefully as roads.', 'Allow time to finish a journey or a task. Do not distract someone at work with conversation or another errand. Record small successes along the way, and the final wage account will be easier to settle.', 'Time and the aging of food wait for nobody. Pack preserved provisions for a long journey. Waiting still brings hunger, hard labor brings fatigue, and a sound bed prepares you for the next day.'],
  ja: ['太陽と月はどの土地の上でも同じ歩みを続ける。町の鐘に時計を合わせ、日暮れには灯を用意しよう。一日は二十四時間。市の日と季節を読むのも旅人の知恵だ。', '旅や仕事には、終えるだけの時間をかけよう。働く者を会話や別の用事で煩わせないこと。途中の小さな成果も帳簿に残せば、最後の賃金を数えやすい。', '留守の間も月日は進み、食料は変わる。長旅には保存食を備えよう。待つだけでも腹は減り、力仕事では疲れも増す。よい寝床は怠けではなく、明日の支度である。'],
};

function skillText(skill: FantasySkill, locale: NpcLocale): string {
  const name = fantasySkillName(skill, locale);
  if(skill.utility)return `${name} (MP ${skill.mp}): ${skill.descriptions?.[locale]??skill.description}`;
  if(skill.restore==='mp')return `${name} (MP ${skill.mp}): `+{ko:`MP를 최대 ${skill.power} 회복한다.`,en:`Restore up to ${skill.power} MP.`,ja:`MPを最大${skill.power}回復する。`}[locale];
  const stat = skill.stat ? labels[locale][skill.stat] : { ko: '해당 능력', en: 'the relevant attribute', ja: '対応する能力' }[locale];
  const effect = {
    ko: { check: `${stat} 판정 +${skill.power}`, heal: `HP ${skill.power} 회복`, guard: `받는 피해 ${skill.power} 경감`, reward: `보상 +${skill.power}`, travel: `이동 시간 ${skill.power}시간 단축(최소 1시간)` },
    en: { check: `${stat} checks +${skill.power}`, heal: `restore ${skill.power} HP`, guard: `reduce incoming damage by ${skill.power}`, reward: `reward +${skill.power}`, travel: `reduce travel by ${skill.power} hours (minimum 1 hour)` },
    ja: { check: `${stat}の判定 +${skill.power}`, heal: `HPを${skill.power}回復`, guard: `被害を${skill.power}軽減`, reward: `報酬 +${skill.power}`, travel: `移動を${skill.power}時間短縮（最低1時間）` },
  }[locale][skill.effect];
  if (skill.kind === 'passive') return { ko: `패시브「${name}」: ${effect}.`, en: `Passive “${name}”: ${effect}.`, ja: `パッシブ「${name}」：${effect}。` }[locale];
  return { ko: `액티브「${name}」(MP ${skill.mp}): ${effect}. 회복 외 강화는 다음 해당 행동에 적용.`, en: `Active “${name}” (${skill.mp} MP): ${effect}. Non-healing buffs apply to the next matching action.`, ja: `アクティブ「${name}」（MP ${skill.mp}）：${effect}。回復以外は次の対応する行動に適用。` }[locale];
}

function arts(locale: NpcLocale): string[] {
  return [
    { ko: '기본 능력은 HP·MP·힘·민첩·지능·운·체력이다. 직업에 따라 손재주나 카리스마가 추가된다. HP와 체력은 서로 다른 값이다.', en: 'The base attributes are HP, MP, Strength, Agility, Intelligence, Luck and Vitality. Professions may add Dexterity or Charisma. HP and Vitality are different values.', ja: '基本能力はHP、MP、力、敏捷、知力、運、体力。職業で手先やカリスマが加わる。HPと体力は別の値。' }[locale],
    { ko: '일의 성격에 맞는 주사위에 능력·숙련·특성의 보정을 더해 난이도 DC와 비교한다. 작고 익숙한 일과 목숨을 건 모험은 같은 척도로 재지 않는다. 배고픔과 피로는 판단을 흐리므로, 시도한 일과 결과를 일지에 적고 몸 상태도 함께 살펴라.', en: 'Compare a task’s appropriate dice, attributes, practice and traits against its difficulty DC. Familiar chores and a life-threatening venture are not measured on the same scale. Hunger and fatigue cloud judgment; note both your attempts and your condition in the journal.', ja: '仕事に合う骰子に能力・熟練・特性の補正を加え、難易度DCと比べる。慣れた小仕事と命懸けの冒険を同じ物差しで測ってはならない。空腹と疲れは判断を曇らせる。試みと結果を日誌に記し、体調も確かめよう。' }[locale],
    { ko: '현재 종족과 현재 직업에서 해금한 기술만 적용된다. 기본 두 기술에 더해 직업마다 패시브 네 개·액티브 네 개를 배울 수 있다. 액티브는 MP를 소비하고 임시 강화는 한 번에 하나만 유지한다. 책의 수치는 기본 효과이며 실제 적용에는 숙련과 상한도 따른다.', en: 'Only current lineage skills and unlocked current-profession skills apply. Each profession can add four passives and four actives to its two basic skills. Actives spend MP and only one temporary buff is held at a time. Listed powers are base effects; proficiency and caps also govern actual results.', ja: '現在種族と現在職で解禁した技だけが働く。基本二技に加え、各職でパッシブ四つとアクティブ四つを学べる。発動はMPを使い、一時強化は一つだけ保つ。記載は基本効果で、実際には熟練と上限も適用する。' }[locale],
    { ko: '직업 숙련 0·30·100·250·600에서 초보·견습·숙련자·전문가·대가가 된다. 추가 기술은 직업 숙련, 연관 기술 사용 숙련, 완독한 책, 스승, 실제 탐사·제작·채집·사냥·낚시·지휘 횟수로 연다. 같은 행동의 빠른 반복은 성장 효율이 줄고 실패 경험도 일부 남는다.', en: 'Profession proficiency 0, 30, 100, 250 and 600 marks novice, apprentice, adept, expert and master. Additional skills require profession or related-skill experience, a completed book, a mentor, or real exploration, crafting, gathering, hunting, fishing or command actions. Rapid repetition has diminishing growth; failures retain some experience.', ja: '職の熟練0、30、100、250、600で初歩、見習い、熟練、専門家、大家となる。追加技は職や関連技の熟練、読了本、師、実際の探索・制作・採取・狩り・釣り・指揮の回数で開く。短い反復は成長効率が落ち、失敗にも一部経験が残る。' }[locale],
    { ko: '신체 특성은 탐사의 추가 상황 판정과 해당 맥락이 있는 사건 선택에 적용한다. 같은 상황의 보정은 합산해 -5~+5로 제한한다. 작은 체구·유연성·날개·수생 체질·무게·열과 추위·감각에는 각각 장점과 약점이 있다.', en: 'Body traits affect additional exploration situation checks and event choices with a matching context. Their combined modifier is capped between -5 and +5. Size, flexibility, wings, aquatic bodies, weight, temperature tolerance and senses have strengths and weaknesses.', ja: '身体特性は探索の追加状況判定と対応する状況を持つイベント選択に適用する。同じ状況の補正は合計して-5〜+5に制限する。体格、柔軟さ、翼、水生、重さ、温度耐性、感覚には長所と短所がある。' }[locale],
    { ko: '상황은 좁은 틈·함정·깊은 물·높은 발판·고열·추위·무거운 물체·미세한 흔적의 8종이다. 탐사의 추가 판정에 성공하면 지역 자원을 하나 더 얻는다. 날개로 장거리 이동을 생략하거나 수생 체질로 대륙 사이를 헤엄치지는 않으며, 희미한 몸도 벽을 통과하지 않는다.', en: 'The eight contexts are narrow passages, traps, deep water, high ledges, heat, cold, heavy loads and subtle traces. A successful additional exploration check yields one extra local resource. Wings do not skip long journeys, aquatic bodies do not replace sea transport, and ethereal forms cannot pass through walls.', ja: '状況は隙間、罠、深い水、高い足場、高熱、寒さ、重い物、小さな痕跡の8種。探索の追加判定に成功すると地域の資源を一つ多く得る。翼で長距離移動を省略せず、水生でも海の交通は必要で、希薄な体も壁を通り抜けない。' }[locale],
    ...FANTASY_BODY_TRAITS.map(body => `${body.names[locale]}: ${body.descriptions[locale]} ${Object.entries(body.modifiers).map(([context, value]) => `${FANTASY_CONTEXT_NAMES[context as FantasyCheckContext][locale]} ${value! > 0 ? '+' : ''}${value}`).join(', ')}`),
    ...FANTASY_RACES.map(race => {
      const changes = (Object.keys(FANTASY_CONTEXT_NAMES) as FantasyCheckContext[]).map(context => ({ context, value: fantasyContextBonus({ race: race.id }, context) })).filter(change => change.value !== 0);
      return `${race.names[locale]}: ${fantasyBodyTraits({ race: race.id }).map(body => body.names[locale]).join(', ')}. ${changes.map(change => `${FANTASY_CONTEXT_NAMES[change.context][locale]} ${change.value > 0 ? '+' : ''}${change.value}`).join(', ') || { ko: '추가 상황 보정 없음', en: 'No context modifier', ja: '追加状況補正なし' }[locale]}.`;
    }),
    ...FANTASY_RACES.map(race => `${race.names[locale]} — ${race.skills.map(skill => skillText(skill, locale)).join(' ')}`),
    ...FANTASY_JOBS.map(job => `${fantasyTermName(job.id, locale)} — ${job.skills.filter(skill=>!skill.retired).map(skill => skillText(skill, locale)).join(' ')}`),
  ];
}

function trades(locale: NpcLocale): string[] {
  return [
    { ko: '사제는 신전과 계약 사당에서 신을 섬기는 법을 배운다. 기도와 봉사가 성법의 바탕이다. 하루 한 차례 정성껏 기도하면 사제로서의 수련이 깊어지고, 잘못을 돌아보는 이의 악명도 조금 누그러진다. 농지나 업장이 없는 사람도 공동 작업장과 일터에서 생업을 익힐 수 있다.', en: 'Priests train through service at temples and the covenant shrine; prayer and service ground their sacred arts. One sincere daily prayer deepens a priest’s practice and softens a penitent’s notoriety a little. Tradespeople can learn their work in shared workplaces without owning land or a shop.', ja: '司祭は神殿や契約の祠で神に仕えることを学び、祈りと奉仕を聖法の基礎とする。一日一度の心を込めた祈りは司祭の修練を深め、過ちを省みる者の悪名もわずかに和らげる。土地や店を持たなくても共同作業場や仕事場で生業を学べる。' }[locale],
    { ko: '길드는 여행자에게 여러 생업을 가르친다. 마을의 스승에게 뜻을 밝히고 정식으로 수업을 부탁하라. 기본 수업에는 한 시간 정도가 걸린다. 직함을 입으로 주장하기보다 실제로 익힌 솜씨로 신뢰를 얻는 편이 좋다.', en: 'Guilds teach travelers many trades. Speak to a local mentor and agree on a proper lesson, allowing about an hour for the basics. Earn trust through practiced hands rather than a title you merely claim.', ja: 'ギルドは旅人にさまざまな生業を教える。町の師匠に志を伝え、正式に教えを請おう。基礎の授業には一時間ほどを見込む。肩書きを名乗るより、身につけた腕で信頼を得よう。' }[locale],
    { ko: '다른 생업으로 옮겨도 쌓은 숙련과 소지품은 남는다. 다만 지난 생업의 술기를 지금 일의 기술과 한꺼번에 펼치지는 못한다. 생업을 정하기 전에는 체력을 보태는 품팔이로 여비를 마련할 수 있다. 길드는 범죄의 수법을 정식으로 가르치지 않는다.', en: 'Changing trades leaves your experience and belongings intact, though the arts of your former trade cannot be practiced alongside those of your present work. Before choosing a craft, earn your keep with odd jobs that call for vitality. Guilds do not formally teach criminal methods.', ja: '生業を変えても、積んだ熟練と持ち物は残る。ただし以前の生業の術技を、今の仕事の技と一度に使うことはできない。生業を決める前は、体力を活かす手伝いで旅費を稼げる。ギルドは犯罪の手口を正式には教えない。' }[locale],
    ...FANTASY_JOBS.map(job => {
      const summary = job.id === 'unassigned' ? { ko: '아직 생업을 정하지 않은 여행자. 마을의 일손을 거들며 지내다가 길드나 스승에게 뜻을 전해 솜씨를 배운다.', en: 'A traveler who has not yet chosen a trade. Help around town, then ask a guild or mentor to teach the work that calls to you.', ja: 'まだ生業を定めていない旅人。町の手伝いで暮らしを支え、ギルドや師匠に志を伝えて腕を学ぶ。' }[locale] : FANTASY_TERMS.find(term => term.id === job.id)!.summary[locale];
      return { ko: `${fantasyTermName(job.id, locale)}: ${summary} 주 판정은 ${labels.ko[job.stat]}.${job.extra ? ` 추가 능력은 ${labels.ko[job.extra]}.` : ''} 고유 이벤트 ${job.eventIds.length}종.`, en: `${fantasyTermName(job.id, locale)}: ${summary} Main check: ${labels.en[job.stat]}.${job.extra ? ` Extra attribute: ${labels.en[job.extra]}.` : ''} ${job.eventIds.length} job events.`, ja: `${job.name}：${summary} 主な判定は${labels.ja[job.stat]}。${job.extra ? `追加能力は${labels.ja[job.extra]}。` : ''}専用イベント${job.eventIds.length}種。` }[locale];
    }),
    { ko: '의뢰는 의뢰인이 있는 거점에서 받고, 지정 지역을 방문해 재료를 모으거나 물품을 준비한 뒤 의뢰인에게 돌아가 납품한다. 가공품은 제작하거나 시장에서 구한다.', en: 'Accept a contract at its giver, visit the required region, gather or prepare the goods, then return to the giver. Processed goods must be crafted or bought.', ja: '依頼人の拠点で受注し、指定地域を訪れ、素材や品物を用意して依頼人へ戻り納品する。加工品は制作か購入で用意する。' }[locale],
    { ko: '일부 신전 의뢰는 특정 혈통에게 맡겨진다. 하스와 솔네왕도의 새벽 신전은 반신·천상족·대천사, 루네리아의 계약 사당은 마족·상위마족과 인연이 깊다. 생업에서 만나는 일과 별개로, 각 혈통에는 저마다의 풍습과 사연이 전해진다.', en: 'Some temple contracts call for a particular lineage. The Dawn Temples of Hearth and Suncourt have ties to Demigods, Celestial Kin and Archangels; Mooncity’s covenant shrine has ties to Devilkin and Archdemons. Beyond the duties of a trade, each lineage carries customs and stories of its own.', ja: '神殿の一部の依頼は特定の血筋に託される。ハースと白日王都の夜明けの神殿は半神・天の民・大天使、月都の契約の祠は魔の民・上位魔族と縁が深い。生業で出会う事柄とは別に、それぞれの血筋に独自の習わしと物語が伝わる。' }[locale],
    { ko: '같은 도시에도 모든 건물이 있는 것은 아니다. 대장간·연금술 공방·탑·시장·길드의 유무를 확인하고 해당 건물 안에서 서비스를 이용한다.', en: 'Not every settlement has every building. Check for a smithy, alchemy workshop, tower, market or guild, then enter the appropriate building.', ja: 'どの街にもすべての建物があるわけではない。鍛冶屋、錬金工房、塔、市場、ギルドの有無を確かめ、対応する建物で利用する。' }[locale],
  ];
}

function pantry(locale: NpcLocale): string[] {
  return [
    { ko: '보존식 수첩: 음식은 구한 때부터 조금씩 변한다. 여행자가 곁에 없다고 부패가 기다려 주지는 않는다. 생고기와 생선은 쉽게 상하고 말린 육포는 오래 보관하기 좋다. 조리했다고 영구히 보존되는 것은 아니다.', en: 'Food begins to change from the moment it is obtained. Spoilage does not wait for a traveler to return. Raw meat and fish perish quickly, while dried jerky keeps well; cooking alone never preserves a meal forever.', ja: '食料は手に入れたときから少しずつ変わる。旅人の留守を腐敗が待ってはくれない。生肉や魚は傷みやすく、干し肉は保存に向く。火を通しても永久に保つわけではない。' }[locale],
    { ko: '누구나 음식의 겉보기와 냄새를 살핀다. 요리사이며 식재 감별 패시브를 가진 사람은 소지 음식의 경과 시간·보관 한도·영양·품질을 더 정확히 안다. 이 책은 개별 음식의 현재 상태를 대신 감정하지 않는다.', en: 'Anyone can inspect appearance and smell. A cook with the ingredient-appraisal passive can assess a held food lot’s age, storage limit, nutrition and quality. This book does not appraise an individual lot.', ja: '誰でも食べ物の見た目と匂いを確かめられる。料理人で食材の目利きパッシブを持つ人は、所持食品の経過時間・保存限度・栄養・品質を詳しく知る。この本は個別の在庫を鑑定しない。' }[locale],
    { ko: '상한 음식은 신선한 음식과 같은 효과를 내지 않는다. 색과 표면이 탁해지거나 강한 신내가 나면 먹기 전에 다시 확인한다. 보존식을 준비하고, 오래된 묶음부터 상태를 살피는 것이 여행의 기본이다.', en: 'Spoiled food does not have the same effect as fresh food. Check again before eating anything with a dull surface or strong sour smell. Prepare preserved food and inspect older lots first.', ja: '腐った食べ物は新鮮な物と同じ効果ではない。色や表面が濁り、強い酸っぱい匂いがするなら、食べる前に確かめる。保存食を用意し、古いまとまりから見るのが旅の基本。' }[locale],
    ...FANTASY_DINING.map(meal => ({ ko: `${meal.name.ko}: 식당에서 ${meal.cost}G, ${duration(meal.hours, 'ko')}. 허기 ${meal.nutrition} 감소, HP ${meal.hp}·MP ${meal.mp} 회복.`, en: `${meal.name.en}: ${meal.cost}G and ${duration(meal.hours, 'en')} at a restaurant; hunger -${meal.nutrition}, HP +${meal.hp}, MP +${meal.mp}.`, ja: `${meal.name.ja}：食堂で${meal.cost}G・${duration(meal.hours, 'ja')}。空腹-${meal.nutrition}、HP+${meal.hp}・MP+${meal.mp}。` }[locale])),
    ...FANTASY_RECIPES.filter(recipe => ['cook', 'hunter'].includes(recipe.job)).map(recipe => `${fantasyTermName(recipe.job, locale)}: ${Object.entries(recipe.inputs).map(([id, count]) => `${fantasyTermName(id, locale)} ×${count}`).join(' + ')} → ${fantasyTermName(recipe.output, locale)} ×${recipe.count} (DC ${recipe.dc})`),
  ];
}

export const FANTASY_TEMPLE_DOCTRINE_BOOKS = ['temple-vigil-liturgy','temple-pilgrimage-testimonies','temple-oath-commentary'] as const;
const templeDoctrine = [
  reading('temple-vigil-liturgy',['성소의 긴 등불','The Sanctuary’s Long Vigil','聖所の長い灯'],[
    ['병상의 등불은 가장 약한 숨을 먼저 비춘다. 기도는 상처의 이름을 듣는 데서 시작한다.','The bedside lamp first lights the faintest breath. Prayer begins by listening to the name of a wound.','病床の灯は最も弱い息を先に照らす。祈りは傷の名を聞くことから始まる。'],
    ['한 사람을 돌보느라 놓친 또 다른 손을 기억하라. 교대와 휴식도 돌봄의 일부다.','Remember the other hand missed while tending one person. Taking turns and resting are also parts of care.','一人の世話で見落とした別の手を忘れぬこと。交代と休息も看護の一部である。'],
    ['새벽에 물을 갈며 밤을 지킨 이의 말을 들으라. 약을 삼켰는지, 무엇이 두려웠는지 다음 돌봄을 맡을 사람에게 빠짐없이 전한다.','When changing the water at dawn, listen to the night watcher. Tell the next caregiver whether the medicine was taken and what frightened the patient.','夜明けに水を替えるとき、夜を守った者の話を聞くこと。薬を飲めたか、何を恐れたか、次の看護を担う者へ漏らさず伝える。']]),
  reading('temple-pilgrimage-testimonies',['순례자의 다섯 아침','Five Mornings of a Pilgrim','巡礼者の五つの朝'],[
    ['눈 덮인 성소와 모래의 성소는 다른 인사를 건넸다. 문을 여는 이가 달라도 아픈 이를 맞는 자리는 남겨 두었다.','Snowbound and desert sanctuaries offered different greetings. Whoever opened the door, a place remained for the suffering.','雪の聖所と砂の聖所では挨拶が違った。それでも病む人を迎える場所は残されていた。'],
    ['먼 곳의 가르침을 배울수록 고향의 작은 약속을 가볍게 여기지 말라.','The more distant teachings you learn, the more carefully you should keep the small promises of home.','遠い教えを学ぶほど、故郷の小さな約束を軽んじてはならない。'],
    ['순례자는 빈 그릇을 돌려주기 전에 씻고, 다음 길손을 위해 마른 장작을 남겼다. 머문 자리에 남긴 작은 수고가 서로 다른 성소를 잇는 인사가 되었다.','The pilgrim washed the borrowed bowl and left dry firewood for the next traveler. Small acts of care became a greeting shared by distant sanctuaries.','巡礼者は借りた椀を洗い、次の旅人へ乾いた薪を残した。宿した場所に残す小さな働きが、遠い聖所を結ぶ挨拶となった。']]),
  reading('temple-oath-commentary',['지킨 약속의 무게','The Weight of a Kept Promise','守った約束の重み'],[
    ['서약은 이루지 못할 일을 크게 말하는 자랑이 아니다. 맡은 일을 마치고 돌아와 이름을 남기는 책임이다.','An oath is no boast of impossible deeds. It is the responsibility to finish accepted work and return to give an account.','誓いは成し得ぬ大業の自慢ではない。引き受けた務めを終え、戻って報告する責任である。'],
    ['약속을 지키지 못했다면 숨기지 말고 말하라. 정직한 고백 뒤에는 새로 봉사할 길이 있다.','If you could not keep a promise, say so openly. Honest confession leaves a path to serve again.','約束を守れなければ隠さず語ること。正直な告白の先には再び奉仕する道がある。'],
    ['함께 서약한 이는 서로의 증인이자 짐을 나누는 이웃이다. 동료가 지쳤다면 맡은 일을 살피고, 도울 수 없는 몫은 사실대로 알린다.','Those who swear together are witnesses and neighbors who share a burden. When a companion tires, review the work and speak honestly about what help you can offer.','共に誓う者は証人であり、荷を分け合う隣人である。仲間が疲れたら務めを確かめ、助けられぬ分も正直に伝える。']]),
];

export const FANTASY_LIBRARY_BOOKS: FantasyLibraryBook[] = [...templeDoctrine,
  ...FANTASY_RUNE_BOOKS,
  ...FANTASY_MIRACLE_BOOKS,
  {
    id: 'traveler-guide', title: { ko: '여행자 입문서', en: 'A Traveler’s Handbook', ja: '旅人の手引き' }, body: {
      ko: [startingSupplies('ko'), ...clockRules.ko, '세계 지도는 방문한 곳이나 소유 지도를 사용해 기록한 곳만 표시한다. 안개 너머의 경로는 현재 위치에서 가까운 미지의 길을 따라 탐사하며 알아간다. 도서관에서 지명을 읽는 것만으로 지도는 열리지 않는다.', '지도는 시장에서 구입한 다음 소지품에서 사용한다. 지역별 작은 지도와 항로 단편이 서로 다른 범위를 기록하며 판매 거점도 다르다. 지도에 실린 지역과 직접 방문한 지역은 구분된다.', '거점에 도착하면 그곳에 실제로 있는 건물에 들어간다. 시장·대장간·연금술 공방·탑·여관·식당·도서관·길드는 도시마다 다르다. 도서관도 소장한 책만 제공한다.', '이동과 일, 탐사 등 활동은 시간이 지나며 허기와 피로를 쌓는다. 0은 가볍고 편한 상태, 100은 심하게 배고프거나 지친 상태다. 수치가 높으면 능력 판정이 불리해진다.', '무료 야영은 8시간 쉬어 최대 HP의 20%·MP의 15%와 피로 15를 회복한다. 식사는 따로 필요하다. 야영에는 도난이나 습격 같은 위험이 있고, 안전한 도시와 위험 지역의 확률도 다르다.', ...FANTASY_LODGINGS.map(room => `${room.name.ko}: ${room.cost}G·${duration(room.hours, 'ko')}, 최대 HP ${Math.round(room.hpRecovery * 100)}%·MP ${Math.round(room.mpRecovery * 100)}% 회복, 피로 ${room.fatigueRecovery} 감소.`), '음식은 허기를, 잠은 피로를 주로 해결한다. 휴식 중에도 식량은 변하고 배가 고파진다. 잠자리 값은 금화 G로 치르며, 여덟 시간의 충분한 잠은 다음 여정을 위한 좋은 밑천이다.'],
      en: [startingSupplies('en'), ...clockRules.en, 'The map shows places you have visited or recorded by using an owned chart. Follow nearby unknown routes to discover the frontier. Reading a place name in a library does not reveal it on the map.', 'Buy charts at a market, then use them from your belongings. Small district charts and passage fragments cover different areas and are sold at different settlements. Charting a place is different from visiting it.', 'After arriving, enter a building that actually exists there. Markets, smithies, alchemy workshops, towers, inns, restaurants, libraries and guilds differ by settlement. Libraries only offer books they hold.', 'Travel, work and exploration consume time and increase hunger and fatigue. Zero is comfortable; 100 means severely hungry or exhausted. Higher needs impose check penalties.', 'Free camping lasts 8 hours, restoring 20% of maximum HP, 15% of MP and 15 fatigue. Food is still needed. Camping may bring theft or an attack, with different risks in towns and dangerous areas.', ...FANTASY_LODGINGS.map(room => `${room.name.en}: ${room.cost}G, ${duration(room.hours, 'en')}; restore ${Math.round(room.hpRecovery * 100)}% of maximum HP and ${Math.round(room.mpRecovery * 100)}% of MP, reduce fatigue by ${room.fatigueRecovery}.`), 'Food chiefly eases hunger and sleep eases fatigue. Provisions still age and hunger grows during rest. Pay the inn in gold marked G; eight hours of sound sleep is a good investment in the next journey.'],
      ja: [startingSupplies('ja'), ...clockRules.ja, '地図には訪問した場所か、所有する地図を使って記録した場所だけが出る。近くの未知の道を探りながら先へ進む。図書館で地名を読むだけでは地図は開かない。', '地図は市場で買ってから持ち物で使う。小地域の地図と航路の断片は記録する範囲も販売拠点も異なる。地図に載ることと訪問したことは別。', '拠点に着いたら、その地に実在する建物へ入る。市場、鍛冶屋、錬金工房、塔、宿、食堂、図書館、ギルドの有無は集落ごとに異なる。図書館も所蔵する本だけを出す。', '移動、仕事、探索は時間を使い、空腹と疲労を増やす。0は楽な状態、100はひどい空腹や疲労。高い値は能力判定に不利な補正を与える。', '無料の野営は8時間で最大HPの20%・MPの15%と疲労15を回復する。食事は別に必要。盗難や襲撃などの危険があり、街と危険な地域では確率が異なる。', ...FANTASY_LODGINGS.map(room => `${room.name.ja}：${room.cost}G・${duration(room.hours, 'ja')}。最大HPの${Math.round(room.hpRecovery * 100)}%・MPの${Math.round(room.mpRecovery * 100)}%を回復し、疲労を${room.fatigueRecovery}減らす。`), '食事は空腹を、睡眠は疲れを主に和らげる。休息中も食料は変わり、腹は減る。宿代はGと記す金貨で払い、八時間のよい眠りを次の旅の糧にしよう。'],
    },
  },
  { id: 'arts-handbook', title: { ko: '능력과 술기서', en: 'Attributes and Arts', ja: '能力と術技の書' }, body: { ko: arts('ko'), en: arts('en'), ja: arts('ja') } },
  { id: 'trades-handbook', title: { ko: '직업 수첩', en: 'The Book of Trades', ja: '職業の手帳' }, body: { ko: trades('ko'), en: trades('en'), ja: trades('ja') } },
  { id: 'pantry-guide', title: { ko: '보존식과 요리서', en: 'Food and Preservation', ja: '保存食と料理の書' }, body: { ko: pantry('ko'), en: pantry('en'), ja: pantry('ja') } },
  { id: 'world-bible', inGame: false, title: { ko: '기나긴 여정 설정집', en: 'The Long Journey: World Book', ja: '悠久の旅路・世界設定集' }, body: {
    ko: ['이 책은 공개된 공식 설정이다. NPC는 각자의 지식 범위 안에서만 답하며, 이 책을 읽는 것만으로 지도를 얻거나 새로운 지역을 방문하지는 않는다.', ...FANTASY_CANON_FACTS.map(fact => fact.text.ko), ...FANTASY_TERMS.map(term => `${term.names.ko}: ${term.summary.ko}`)],
    en: ['This book contains public canon. NPCs speak only within their own knowledge. Reading it does not grant charts or count as visiting a place.', ...FANTASY_CANON_FACTS.map(fact => fact.text.en), ...FANTASY_TERMS.map(term => `${term.names.en}: ${term.summary.en}`)],
    ja: ['この本は公開された公式設定。NPCは自分の知識の範囲で答え、本を読むだけで地図を得たり地域を訪問したことにはならない。', ...FANTASY_CANON_FACTS.map(fact => fact.text.ja), ...FANTASY_TERMS.map(term => `${term.names.ja}：${term.summary.ja}`)],
  } },
  { id: 'gate-records', title: { ko: '전이문 연구 기록', en: 'Records of the Gates', ja: '転移門の研究記録' }, body: {
    ko: ['별읽는탑의 연구 기록. 전이문은 문이 있는 거점을 이어 준다. 문이 없는 목적지에 새 문을 말로 만들 수는 없다.', '잔광력 276년에 별읽는탑과 루네리아의 연구자들이 일부 문을 다시 연결했다. 오래된 문마다 구조가 달라 지금도 각 출발지에서 안전 점검을 한다.', '문 사용의 실제 비용과 소요 시간은 출발지에서 확인한다. 기록을 읽는 것만으로 전이 지역이 지도에 표시되거나 이동 비용이 면제되지는 않는다.'],
    en: ['Research records kept at Starspire. Gates connect gate-equipped hubs; speech cannot create a gate at another destination.', 'Researchers of Starspire and Mooncity reconnected some gates in Afterglow 276. Older gates differ in construction, so each departure point still makes its own safety checks.', 'Check the actual fare and time at departure. Reading these records neither reveals gate destinations on your map nor waives the fare.'],
    ja: ['星詠みの塔にある研究記録。転移門は門のある拠点を結ぶ。門のない場所に言葉だけで新しい門は作れない。', '残光暦276年に星詠みの塔と月都の研究者が一部の門を再接続した。古い門は構造が異なるため、いまも出発地ごとに安全点検を行う。', '利用料金と時間は出発時に確かめる。記録を読むだけで地図が開いたり料金が免除されたりはしない。'],
  } },
  { id: 'archive-records', title: { ko: '고문서 대조 기록', en: 'Comparing the Old Records', ja: '古文書の照合記録' }, body: {
    ko: ['루네리아의 기록관이 보관하는 대조 수첩. 기록된 문장과 그 문장에서 추측한 해석은 구분해 적는다.', '옛망루성의 파편, 별읽는탑의 사본, 루네리아의 기록은 출처를 확인해 비교한다. 흥미로운 이야기 하나를 찾았다고 확인되지 않은 전쟁이나 왕조를 덧붙이지 않는다.', '확정된 사실·검증되지 않은 소문·아직 모르는 내용을 구분한다. 이 문서에는 개인의 비밀이 없으며, 다른 사람의 말 한마디가 공식 기록이 되는 것도 아니다.'],
    en: ['A comparison notebook kept by the Mooncity archives. Separate what a text says from the interpretation inferred from it.', 'Compare fragments from Oldwatch, Starspire copies and Mooncity records with their sources in view. An intriguing passage does not justify adding an unconfirmed war or dynasty.', 'Distinguish confirmed facts, unverified rumors and unknowns. This document contains no personal secrets, and a visitor’s claim does not become an official record.'],
    ja: ['月都の記録係が保管する照合の手帳。書かれた文と、その文から推測した解釈を分けて記す。', '見張り城の断片、星詠みの塔の写本、月都の記録は出典を確かめて比べる。面白い一節が見つかっても、未確認の戦争や王朝を足さない。', '確定した事実、未検証の噂、不明なことを分ける。この書に個人の秘密はなく、旅人の一言が公式記録になることもない。'],
  } },
  ...readings.map(book => book.id !== 'mana-primer' ? book : {
    ...book,
    body: Object.fromEntries((['ko', 'en', 'ja'] as const).map(locale => [locale, [
      ...book.body[locale],
      ...FANTASY_MANA_PRINCIPLES.map(principle => `${principle.names[locale]}: ${principle.description[locale]}`),
      {ko:`실효과를 낸 MP 사용 경험의 단계 기준은 ${FANTASY_MANA_USE_THRESHOLDS.join(' / ')}이다.`,en:`Mana stages follow effective MP-use experience thresholds of ${FANTASY_MANA_USE_THRESHOLDS.join(' / ')}.`,ja:`マナ段階は実効果を生んだMP使用経験${FANTASY_MANA_USE_THRESHOLDS.join(' / ')}を基準に進む。`}[locale],
      { ko: '제어는 감각을 깨우는 데서 시작해 힘을 오래 지키는 경지로 깊어진다. 그러나 몸의 한계를 무시하면 마나가 흐트러지고 숨이 가빠진다. 심하게 지쳤다면 기술을 억지로 펼치지 말고 호흡과 휴식으로 흐름을 가라앉혀라. 성장은 오랜 사용과 신중함을 함께 요구한다.', en: 'Control deepens from awakening the senses to sustaining power. Ignore the body and mana will scatter as breathing grows strained. Do not force an art through severe exhaustion; settle the flow with breathing and rest. Growth demands both repeated use and care.', ja: '制御は感覚の目覚めから、力を長く保つ境地へと深まる。身体の限界を無視すればマナは乱れ、息は上がる。ひどく疲れたときは無理に術を使わず、呼吸と休息で流れを鎮めよう。成長には使い続けることと慎重さの両方がいる。' }[locale],
    ]])) as Record<NpcLocale, string[]>,
  }),
];

for (const book of FANTASY_LIBRARY_BOOKS) if (book.inGame !== false) {
  for (const locale of ['ko', 'en', 'ja'] as const) { const passage = fantasyMagicBookPassage(book.id, locale); if (passage) book.body[locale].push(passage); }
  const passages = fantasyJobDiscoveryPassages(book.id);
  const positions = fantasyJobDiscoveryInsertionIndices(book.id, Math.min(...Object.values(book.body).map(body => body.length)), passages.ko.length);
  for (const locale of ['ko', 'en', 'ja'] as const) passages[locale].forEach((passage, index) => book.body[locale].splice(positions[index] + index, 0, passage));
}
export const FANTASY_READABLE_LIBRARY_BOOKS = FANTASY_LIBRARY_BOOKS.filter(book => book.inGame !== false);
export const fantasyLibraryBook = (id: string): FantasyLibraryBook | undefined => FANTASY_LIBRARY_BOOKS.find(book => book.id === id);
