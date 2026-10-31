import type { FantasyQuest } from './fantasy.ts';

type Text = [ko: string, en: string, ja: string];
const l = ([ko, en, ja]: Text) => ({ ko, en, ja });
function service(id: string, issuer: string, location: string, item: string, count: number, names: Text, request: Text, requires?: string): FantasyQuest {
  const title = l(names), dialogue = l(request);
  return { id: `temple-service-${id}`, institution: 'temple', name: title.ja, names: title, description: dialogue.ja, descriptions: dialogue, dialogue, giver: location, destination: location, reportAt: location, issuer,
    item, count, gold: requires ? 45 : item === 'potion' ? 50 : 25, xp: requires ? 24 : 14, jobs: ['priest'], ...(requires ? { requiresCompleted: [`temple-service-${requires}`] } : {}) };
}
export const FANTASY_TEMPLE_QUESTS: FantasyQuest[] = [
  service('hearth-herbs', 'hearth-iona', 'hearth', 'herb', 3, ['신전 진료실의 약초', 'Herbs for the Temple Ward', '神殿の施療室の薬草'], ['진료실의 약초가 부족해요. 사제로서 물품을 살피고 이곳으로 가져와 주세요.', 'Our ward is short of herbs. As a priest, inspect the supplies and deliver them here.', '施療室の薬草が不足しています。司祭として品を確かめ、こちらへ届けてください。']),
  service('hearth-dressings', 'hearth-iona', 'hearth', 'linen', 2, ['깨끗한 치료용 천', 'Clean Dressings', '清潔な手当ての布'], ['약초를 정리했으니 상처를 감쌀 깨끗한 아마포를 마련해 주세요.', 'The herbs are sorted. Please prepare clean linen for dressings.', '薬草は整いました。傷を包む清潔な亜麻布を用意してください。'], 'hearth-herbs'),
  service('hearth-meal', 'hearth-iona', 'hearth', 'bread', 4, ['회복하는 이들의 식탁', 'A Table for Recovery', '養生する人の食卓'], ['몸을 회복하는 이들에게 나눌 빵이 필요해요. 먹을 수 있는 상태로 가져와 주세요.', 'We need bread to share with those recovering. Bring it in edible condition.', '養生する人に分けるパンが必要です。食べられる状態で届けてください。'], 'hearth-dressings'),
  service('suncourt-provisions', 'suncourt-aurel', 'suncourt', 'herb', 4, ['햇빛 뜰의 상비약', 'Remedies for the Sun Court', '陽の庭の常備薬'], ['순례자를 돌볼 상비약을 보충하려 합니다. 약초를 맡아 주시겠어요?', 'We are replenishing remedies for pilgrims. Will you gather the herbs?', '巡礼者を世話する常備薬を補充します。薬草をお願いできますか。']),
  service('suncourt-lamps', 'suncourt-aurel', 'suncourt', 'crystal', 1, ['기도실의 오래된 등', 'The Old Prayer Lamps', '祈りの間の古い灯り'], ['기도실 조명을 수리할 수정이 필요합니다. 신전으로 가져와 주세요.', 'We need a crystal to repair the prayer-room lamps. Please deliver it to the temple.', '祈りの間の灯りを直す水晶が必要です。神殿へ届けてください。'], 'suncourt-provisions'),
  service('suncourt-bed', 'suncourt-aurel', 'suncourt', 'linen', 3, ['순례자의 새 침구', 'Fresh Bedding for Pilgrims', '巡礼者の新しい寝具'], ['몸이 불편한 순례자를 위한 침구를 바꿉니다. 아마포를 마련해 함께 돌봐 주세요.', 'We are replacing bedding for unwell pilgrims. Bring linen and help us care for them.', '体の弱った巡礼者の寝具を替えます。亜麻布を揃え、ともに世話をしてください。'], 'suncourt-lamps'),
  service('mooncity-ward', 'mooncity-nera', 'mooncity', 'potion', 2, ['달빛 진료실의 비축', 'Reserves for the Moonlit Ward', '月明かりの施療室の備え'], ['야간 진료를 위한 회복약을 보충해야 해요. 물품을 이곳에 인계해 주세요.', 'We must replenish recovery potions for the night ward. Hand over the supplies here.', '夜の施療のため回復薬を補充したいのです。こちらで品を引き渡してください。']),
  service('mooncity-binding', 'mooncity-nera', 'mooncity', 'silk', 2, ['돌봄 기록의 제본', 'Binding the Care Records', '世話の記録の綴じ直し'], ['이름을 조심스럽게 다룬 진료 기록을 보존하려 해요. 제본에 쓸 비단을 부탁해요.', 'We are preserving care records with names handled discreetly. Bring silk for the binding.', '名前を慎重に扱った施療記録を残します。綴じ直しの絹をお願いします。'], 'mooncity-ward'),
];
