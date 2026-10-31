import type { FantasyItem } from './fantasy.ts';

const l = (ko: string, en: string, ja: string) => ({ ko, en, ja });

export const FANTASY_GUILD_LOAN_GEAR: FantasyItem[] = [
  {
    id: 'guild-loan-lantern', name: 'ギルド貸出用ランタン', names: l('길드 대여 랜턴', 'Guild Loan Lantern', 'ギルド貸出用ランタン'),
    description: 'ギルドから借りる弱い携帯灯。暗所で活動できるが暗さの判定負担が3残る。野営の襲撃危険を3%軽減する。返却用で売却できない。',
    descriptions: l(
      '길드에서 빌리는 약한 휴대등. 어두운 곳에서도 활동할 수 있지만 어둠의 판정 불이익이 3 남습니다. 야영 습격 위험을 3% 줄입니다. 일반 랜턴은 불이익 2·위험 10% 감소, 별빛 유리등은 불이익 1·위험 20% 감소로 더 강합니다. 반납용이며 판매할 수 없습니다.',
      'A weak portable light borrowed from the guild. Enables activity in darkness but leaves a darkness check penalty of 3. Reduces camp ambush risk by 3%. A normal lantern leaves penalty 2 and reduces risk by 10%; a starlit lantern leaves penalty 1 and reduces risk by 20%. Return it to the guild; it cannot be sold.',
      'ギルドから借りる弱い携帯灯。暗所で活動できるが暗さの判定負担が3残る。野営の襲撃危険を3%軽減する。普通のランタンは負担2・危険10%軽減、星明かりの玻璃灯は負担1・危険20%軽減と強い。返却用で売却できない。',
    ),
    price: 0, craftOnly: true, category: 'guild-loan', light: true,
  },
  {
    id: 'guild-loan-bedroll', name: 'ギルド貸出用寝袋', names: l('길드 대여 침낭', 'Guild Loan Bedroll', 'ギルド貸出用寝袋'),
    description: 'ギルドから借りる簡易寝袋。野営の基本疲労回復が20になる。普通の寝袋25、毛皮の寝袋33より低い。返却用で売却できない。',
    descriptions: l(
      '길드에서 빌리는 간이 침낭. 야영의 기본 피로 회복이 20이 됩니다. 침낭 없이는 15, 일반 침낭은 25, 모피 침낭은 33입니다. 가장 좋은 침낭 하나만 적용됩니다. 반납용이며 판매할 수 없습니다.',
      'A simple bedroll borrowed from the guild. Sets base camping fatigue recovery to 20: no bedroll restores 15, a normal bedroll 25, and a fur bedroll 33. Only the best carried bedroll applies. Return it to the guild; it cannot be sold.',
      'ギルドから借りる簡易寝袋。野営の基本疲労回復が20になる。寝袋なし15、普通の寝袋25、毛皮の寝袋33。最も良い寝袋一つだけが適用される。返却用で売却できない。',
    ),
    price: 0, craftOnly: true, category: 'guild-loan',
  },
];
