import { FANTASY_ARTISANS } from '../shared/fantasy-artisan-catalog.ts';
import type { NpcLocale } from '../shared/npc.ts';

type Localized = Record<NpcLocale, string>;
const l = (ko: string, en: string, ja: string): Localized => ({ ko, en, ja });

/** 非公開の人物設定を通常の会話プロンプトへ漏らさない。 */
const PRIVATE_NOTES: Record<string, Localized> = {
  cook: l('넬라는 한때 간을 망친 연회를 아직도 혼자 되새긴다.', 'Nella still privately replays a banquet she once seasoned badly.', 'ネラは昔味付けを失敗した宴を今もひそかに思い返す。'),
  baker: l('파벨은 스승의 오래된 빵 틀을 잃어버린 일을 털어놓지 못한다.', 'Pavel has never admitted losing his mentor’s old bread tin.', 'パヴェルは師の古いパン型を失くしたことを打ち明けられない。'),
  blacksmith: l('루리크는 손이 떨리는 날이면 견습생에게 들킬까 두렵다.', 'Rurik fears an apprentice noticing his hands shake on difficult days.', 'ルーリクはつらい日に手が震えることを見習いに知られるのが怖い。'),
  carpenter: l('실벤은 처음 만든 의자의 비뚤어진 다리를 몰래 간직한다.', 'Sylven secretly keeps the crooked leg from the first chair he built.', 'シルヴェンは初めて作った椅子の曲がった脚をひそかに残している。'),
  scribe: l('현은 완성하지 못한 자기 시를 작업대 아래에 숨긴다.', 'Hyeon hides an unfinished personal poem beneath the writing desk.', 'ヒョンは書き上げられない自作の詩を机の下に隠している。'),
  tailor: l('엘로디는 자기 축제옷을 만들 시간조차 없는 것을 서운해한다.', 'Elodie privately regrets never finding time to sew a festival outfit for herself.', 'エロディは自分の祭り服を縫う時間がないことをひそかに寂しく思う。'),
  weaver: l('마이리는 떠난 자매와 다시 함께 베를 짜는 꿈을 꾼다.', 'Mairi privately dreams of weaving again beside a sister who left.', 'マイリは去った姉妹とまた並んで織ることをひそかに願う。'),
  leatherworker: l('나디르는 오래전 서두른 수선 하나를 아직 용서하지 못했다.', 'Nadir has not forgiven himself for one hurried repair long ago.', 'ナディルは昔急いで済ませた一度の修理をまだ自分に許せない。'),
  gemcutter: l('브리스카는 값없는 조약돌을 가장 소중한 기념품으로 보관한다.', 'Briska keeps a worthless pebble as her most precious keepsake.', 'ブリスカはいちばん大切な思い出として値のない小石を持つ。'),
  potter: l('탈라는 물레 없이 만든 첫 그릇을 누구에게도 보여주지 않는다.', 'Tala never shows anyone the first bowl made without a wheel.', 'タラは轆轤を使わず初めて作った器を誰にも見せない。'),
  herbalist: l('엔나는 동생에게 약초 이름을 잘못 알려준 일을 부끄러워한다.', 'Enna privately feels ashamed of once teaching a sibling the wrong herb name.', 'エンナは弟妹に一度薬草の名を間違えて教えたことを恥じている。'),
  farmer: l('옴리는 흉작의 해에 씨앗을 더 남기지 못한 일을 후회한다.', 'Omri regrets not saving more seed before a year of poor harvest.', 'オムリは不作の年の前にもっと種を残さなかったことを悔やむ。'),
  fisher: l('페트라는 조용한 바다에서조차 옛 폭풍의 소리를 떠올린다.', 'Petra remembers the sound of an old storm even on a quiet sea.', 'ペトラは静かな海でも昔の嵐の音を思い出す。'),
  merchant: l('야스민은 장부에 적지 못한 고향의 작은 가게를 그리워한다.', 'Yasmin misses the small hometown shop that never appears in her ledgers.', 'ヤスミンは帳簿に載らない故郷の小店を懐かしむ。'),
  shipwright: l('일마르는 첫 진수식 때 울었던 일을 동료들에게 숨긴다.', 'Ilmar hides from the crew that he cried at his first launching.', 'イルマルは初めての進水式で泣いたことを仲間に隠している。'),
  alchemist: l('세리트는 버려진 실험의 아름다운 색을 아직 잊지 못한다.', 'Serit still remembers the beautiful color of an abandoned experiment.', 'セリトは中断した実験の美しい色をまだ忘れられない。'),
};

const REGIONAL_NOTES: Record<string, Localized> = {
  'artisan-pinewatch-brann': l('브란은 처음 겪은 겨울에 실험을 모두 잃었던 날을 숨긴다.', 'Brann hides the memory of losing every experiment during a first winter.', 'ブランは初めての冬に実験をすべて失った日の記憶を隠す。'),
  'artisan-mossbrook-rivet': l('리베트는 비 때문에 지워진 스승의 쪽지를 아직 말린다.', 'Rivet still keeps a mentor’s rain-blurred note between drying sheets.', 'リヴェトは雨で滲んだ師の手紙を今も乾燥紙に挟んでいる。'),
  'artisan-sunloom-dima': l('디마는 고향 우물물의 맛을 잊어버릴까 두렵다.', 'Dima privately fears forgetting the taste of the hometown well water.', 'ディマは故郷の井戸水の味を忘れることをひそかに恐れる。'),
  'artisan-saffron-fadila': l('파딜라는 끝내 보내지 못한 감사 편지를 보관한다.', 'Fadila keeps a thank-you letter that was never sent.', 'ファディラは結局送れなかった礼状を保管している。'),
  'artisan-rockshade-olek': l('올레크는 은퇴하면 장난감을 만들고 싶다는 꿈을 숨긴다.', 'Olek quietly dreams of making toys after retirement.', 'オレクは引退したら玩具を作りたい夢をひそかに抱く。'),
};

export const NPC_ARTISAN_PRIVATE: Record<string, Localized> = Object.fromEntries(
  FANTASY_ARTISANS.map(artisan => [artisan.id, { ...REGIONAL_NOTES[artisan.id] ?? PRIVATE_NOTES[artisan.job] }]),
);
