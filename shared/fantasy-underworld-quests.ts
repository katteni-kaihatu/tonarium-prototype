import type { FantasyQuest } from './fantasy.ts';

type Text = [ko: string, en: string, ja: string];
const l = ([ko, en, ja]: Text) => ({ ko, en, ja });
const jobs = ['thief', 'smuggler', 'assassin', 'bandit', 'spy', 'crimeboss'];
function quest(id: string, issuer: string, location: string, item: string, count: number, names: Text, request: Text, advanced = false, prerequisite?: string): FantasyQuest {
  const labels = l(names), dialogue = l(request);
  return { id: `underworld-${id}`, name: labels.ja, names: labels, description: dialogue.ja, descriptions: dialogue, dialogue, issuer, giver: location, destination: location, reportAt: location,
    item, count, gold: advanced ? 60 : ['potion', 'jerky'].includes(item) ? 50 : 30, xp: advanced ? 28 : 16, jobs: [...jobs], ...(prerequisite ? { requiresCompleted: [`underworld-${prerequisite}`] } : {}) };
}

export const FANTASY_UNDERWORLD_QUESTS: FantasyQuest[] = [
  quest('nyx-dressing', 'hearth-nyx', 'hearth', 'herb', 3,
    ['연락책의 붕대', 'Dressings for the Contact', '連絡役の手当て'],
    ['다친 연락책의 약초를 구해 줘요. 약속한 물품을 여기로 가져오면 조직 장부에 기록할게요.', 'Find herbs for an injured contact. Bring the promised goods here and I will record the completed contract.', '負傷した連絡役の薬草を頼む。約束の品をここへ届けたら、組織の帳面に記す。']),
  quest('nyx-wrapped-record', 'hearth-nyx', 'hearth', 'silk', 2,
    ['비에 젖지 않는 기록', 'Records Kept Dry', '雨から守る記録'],
    ['지난 의뢰를 지켰군요. 이번에는 오래된 연락 장부를 감쌀 비단이 필요해요.', 'You kept the last promise. This time I need silk to wrap the old contact ledger.', '前の約束を守ったな。今度は古い連絡帳を包む絹が要る。'], true, 'nyx-dressing'),
  quest('vex-provisions', 'tidehaven-vex', 'tidehaven', 'jerky', 3,
    ['안개 부두의 식량', 'Food for the Fog Pier', '霧の波止場の糧'],
    ['항만의 연락책이 오래 기다려야 해요. 상하지 않은 육포를 마련해 이곳에서 정산해요.', 'The harbor contacts face a long wait. Bring sound jerky and settle the contract here.', '港の連絡役は長く待つ。傷んでいない干し肉を揃え、ここで清算しよう。']),
  quest('vex-packing', 'tidehaven-vex', 'tidehaven', 'linen', 3,
    ['회수품의 새 포장', 'Fresh Packing for Recovered Goods', '回収品の包み直し'],
    ['회수한 짐의 포장이 찢어졌어요. 항만에서 구할 수 있는 아마포로 갈아야 해요.', 'Recovered cargo has torn wrapping. Bring linen available around the harbor to replace it.', '回収した荷の包みが破れた。港で手に入る亜麻布で替えたい。'], true, 'vex-provisions'),
  quest('toren-braces', 'dawnport-toren', 'dawnport', 'wood', 2,
    ['무너진 연락소', 'The Fallen Contact Shelter', '崩れた連絡小屋'],
    ['연락소의 지붕을 받칠 목재가 필요해. 약속대로 가져오면 동료들이 기억할 거야.', 'The contact shelter needs timber braces. Keep this delivery promise and the others will remember.', '連絡小屋の屋根を支える木材が要る。約束どおり運べば仲間が覚えておく。']),
  quest('toren-fasteners', 'dawnport-toren', 'dawnport', 'ingot', 2,
    ['야영지의 연결쇠', 'Fasteners for the Camp', '野営地の留め金'],
    ['지붕은 버텼어. 이제 튼튼한 금속을 가져오면 장인이 연결쇠를 만들 수 있어.', 'The roof is holding. Bring metal ingots so the artisan can make sound fasteners.', '屋根は持った。次は金属の延べ棒があれば、職人が留め金を作れる。'], true, 'toren-braces'),
  quest('sable-watch', 'mooncity-sable', 'mooncity', 'potion', 2,
    ['돌아온 감시자', 'The Returning Watcher', '帰還した見張り'],
    ['밤길에서 돌아온 감시자를 쉬게 해야 해요. 회복약을 여기로 가져와요.', 'A watcher returning from the night road needs rest. Bring recovery potions here.', '夜道から帰った見張りを休ませたい。回復薬をここへ頼む。']),
  quest('sable-seal', 'mooncity-sable', 'mooncity', 'crystal', 2,
    ['깨진 보관함의 봉인', 'The Broken Archive Seal', '保管箱の封印'],
    ['연락 기록의 보관함을 고칠 수정이 필요해요. 기록의 주인은 이름을 밝히지 않을 거예요.', 'I need crystals to repair the contact-record chest. Its owner will keep their name private.', '連絡記録の箱を直す水晶が要る。記録の持ち主は名を伏せたままだ。'], true, 'sable-watch'),
  quest('iven-rations', 'saffron-port-iven', 'saffron-port', 'bread', 4,
    ['배를 기다리는 연락책', 'Contacts Waiting for a Ship', '船を待つ連絡役'],
    ['배가 늦어져 동료들의 식량이 모자라요. 먹을 수 있는 빵을 이곳으로 부탁해요.', 'A late ship has left the contacts short of food. Bring edible bread here.', '船が遅れて仲間の糧が足りない。食べられるパンをここへ頼む。']),
  quest('iven-signal', 'saffron-port-iven', 'saffron-port', 'spice', 3,
    ['향신료 장부의 대조', 'Comparing the Spice Ledger', '香辛料帳の照合'],
    ['지난 배의 물량과 장부가 달라요. 향신료 견본을 모아 계약 수량을 대조하려고 해요.', 'The last ship’s cargo differs from its ledger. Bring spice samples to check the contracted quantities.', '前の船の荷と帳面が違う。香辛料の見本を揃えて契約量を照合したい。'], true, 'iven-rations'),
  quest('cass-ledger', 'redweave-cass', 'redweave', 'silk', 2,
    ['갈라진 장부의 등', 'Binding the Split Ledger', '裂けた帳簿の背'],
    ['중개 장부의 책등을 고쳐야 해요. 비단을 마련하면 오래된 약속도 보존할 수 있어요.', 'The mediation ledger needs binding. Silk will preserve the old agreements.', '仲介帳の背を直したい。絹があれば古い約束を残せる。']),
  quest('cass-arbitration', 'redweave-cass', 'redweave', 'gem', 1,
    ['중재인의 보증품', 'The Mediator’s Pledge', '仲介人の預かり品'],
    ['분쟁 당사자들이 작은 보증품에 합의했어요. 보석 하나를 이곳에 맡기는 계약이에요.', 'Both sides of a dispute agreed to a small pledge. The contract calls for one gem deposited here.', '争いの双方が小さな預かり品で合意した。宝石一つをここへ届ける契約だ。'], true, 'cass-ledger'),
  quest('voss-shelter', 'redweave-voss', 'redweave', 'linen', 2,
    ['원탁의 빈 자리', 'A Place at the Table', '円卓の空いた席'],
    ['연락책들이 함께 쓸 작은 쉼터를 꾸미려 한다. 아마포를 가져오면 네 몫의 약속을 기록하마.', 'The contacts are furnishing a shared shelter. Bring linen and your fulfilled promise will be recorded.', '連絡役が使う小さな休み場を整える。亜麻布を届けたら、お前の果たした約束を記そう。']),
  quest('voss-archive', 'redweave-voss', 'redweave', 'relic', 2,
    ['옛 약속의 대조물', 'Traces of an Old Agreement', '古い約束の照合品'],
    ['오래된 약속에 찍힌 표식을 대조할 유물이 필요하다. 물건을 가져오면 기록관과 조사하겠다.', 'We need relics to compare the mark on an old agreement. Deliver them for examination with the archivist.', '古い約束の印を照合する遺物が要る。届けてくれたら記録係と調べよう。'], true, 'voss-shelter'),
  quest('sena-waiting', 'tidehaven-sena', 'tidehaven', 'herb', 4,
    ['기다림의 약초', 'Herbs for the Long Wait', '待ち人の薬草'],
    ['항만에서 오래 기다리는 동료들의 상비약이 모자라요. 약초를 모아 이곳에서 인계해요.', 'Contacts waiting at the harbor are low on remedies. Gather herbs and hand them over here.', '港で待つ仲間の常備薬が足りない。薬草を集め、ここで引き渡そう。']),
  quest('sena-settlement', 'tidehaven-sena', 'tidehaven', 'crystal', 2,
    ['밤항구의 정산', 'Settling the Night Harbor', '夜港の清算'],
    ['연락망이 빌린 조명을 수리할 수정이 필요해요. 이번 인계가 끝나면 정산도 마무리예요.', 'We need crystals to repair the network’s borrowed lamps. This handover will finish the settlement.', '連絡網で借りた灯りを直す水晶が要る。この引き渡しで清算を締めよう。'], true, 'sena-waiting'),
];
