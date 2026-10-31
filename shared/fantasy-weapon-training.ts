import type { FantasySkill } from './fantasy.ts';

type Names = [string, string, string];
const names = ([ko, en, ja]: Names) => ({ ko, en, ja });
const technique = (id: string, title: Names, text: Names, mp: number, stat: NonNullable<FantasySkill['stat']>, xp: number): FantasySkill => ({ id, name: title[2], names: names(title), kind: 'active', description: text[2], descriptions: names(text), effect: 'check', power: 3, stat, mp, unlock: { kind: 'job', xp } });
export const FANTASY_WEAPON_TECHNIQUES: Record<string, FantasySkill[]> = {
  warrior: [technique('tech-warrior-cleave', ['부채꼴 베기', 'Sweeping Cleave', '扇薙ぎ'], ['전방180도를 벤다. 주변 대상 피해60%. 생활에서는 다음 힘 판정+3.', 'Cleave the forward 180°. Secondary damage60%. Outside combat: next Strength check+3.', '前方180度を薙ぐ。副対象への被害60%。生活では次の力判定+3。'], 8, 'strength', 20)],
  spearfighter: [technique('tech-spearfighter-thrust', ['꿰뚫는 창 찌르기', 'Piercing Spear Thrust', '貫く槍突き'], ['긴 직선으로 찌른다. 주변 대상 피해75%. 생활에서는 다음 힘 판정+3.', 'Thrust along a long line. Secondary damage75%. Outside combat: next Strength check+3.', '長い直線を貫く。副対象への被害75%。生活では次の力判定+3。'], 7, 'strength', 20)],
  archer: [technique('tech-archer-piercing', ['관통 사격', 'Piercing Shot', '貫通射撃'], ['좁은 직선의 적을 관통한다. 주변 대상 피해75%. 생활에서는 다음 민첩 판정+3.', 'Pierce a narrow line. Secondary damage75%. Outside combat: next Agility check+3.', '細い直線を貫く。副対象への被害75%。生活では次の敏捷判定+3。'], 8, 'agility', 20), technique('tech-archer-volley', ['집중 일제 사격', 'Clustered Volley', '集中斉射'], ['대상 중심 반경1에 사격한다. 주변 대상 피해65%. 생활에서는 다음 민첩 판정+3.', 'Fire into radius1 around the target. Secondary damage65%. Outside combat: next Agility check+3.', '対象中心の半径1へ撃つ。副対象への被害65%。生活では次の敏捷判定+3。'], 11, 'agility', 50)],
  hunter: [technique('tech-hunter-aimed-shot', ['먼 표적 사격', 'Distant Target Shot', '遠的射撃'], ['긴 사거리로 한 명을 노린다. 생활에서는 다음 민첩 판정+3.', 'Aim at one distant target. Outside combat: next Agility check+3.', '遠くの一体を狙う。生活では次の敏捷判定+3。'], 6, 'agility', 25)],
  ranger: [technique('tech-ranger-piercing', ['숲길 관통시', 'Trail Piercing Arrow', '道筋の貫き矢'], ['길게 이어진 적을 관통한다. 주변 대상 피해75%. 생활에서는 다음 민첩 판정+3.', 'Pierce enemies along a line. Secondary damage75%. Outside combat: next Agility check+3.', '並んだ敵を貫く。副対象への被害75%。生活では次の敏捷判定+3。'], 8, 'agility', 30)],
  pugilist: [technique('tech-pugilist-sweep', ['반달 돌려차기', 'Crescent Sweep Kick', '半月回し蹴り'], ['전방 가까운 적을 휩쓴다. 주변 대상 피해60%. 생활에서는 다음 힘 판정+3.', 'Sweep nearby foes ahead. Secondary damage60%. Outside combat: next Strength check+3.', '前方の近い敵を払う。副対象への被害60%。生活では次の力判定+3。'], 7, 'strength', 25)],
};
const additions: Record<string, FantasySkill[]> = {
  warrior: [technique('tech-warrior-charge', ['돌진 강타', 'Charging Smash', '突進強打'], ['상대 앞까지 파고들어 강타한다.', 'Close in and strike with force.', '相手の手前まで踏み込んで強打する。'], 11, 'strength', 50)],
  pugilist: [technique('tech-pugilist-step-strike', ['파고드는 정권', 'Stepping Straight Punch', '踏み込む正拳'], ['거리를 좁혀 정권을 뻗는다.', 'Close the gap and drive a straight punch.', '間合いを詰めて正拳を放つ。'], 8, 'strength', 40)],
  knight: [technique('tech-knight-shieldbreak', ['방패 틈 찌르기', 'Shield-Gap Thrust', '盾間の突き'], ['명중하면 방어의 틈을 드러낼 수 있다.', 'A hit may expose a defensive opening.', '命中時に守りの隙をさらすことがある。'], 8, 'strength', 35)],
  scout: [technique('tech-scout-pin', ['발목 견제 사격', 'Ankle Pinning Shot', '足首への牽制射撃'], ['명중하면 상대의 발을 묶을 수 있다.', 'A hit may root the target.', '命中時に相手の足を止めることがある。'], 7, 'agility', 30)],
  assassin: [technique('tech-assassin-tendon', ['힘줄 베기', 'Tendon Cut', '腱斬り'], ['명중하면 출혈을 남길 수 있다.', 'A hit may leave bleeding wounds.', '命中時に出血を残すことがある。'], 7, 'agility', 35), technique('tech-assassin-shadow-step', ['그림자 파고들기', 'Shadow Approach', '影の踏み込み'], ['상대 앞 빈칸으로 파고들어 급소를 벤다.', 'Close into a free tile before the target and cut.', '対象の手前の空きマスに踏み込み、斬りつける。'], 10, 'agility', 55)],
  bandit: [technique('tech-bandit-crush', ['거친 휩쓸기', 'Brutal Sweep', '荒い薙ぎ払い'], ['가까운 적을 휩쓸고 약화시킬 수 있다.', 'Sweep nearby enemies and possibly weaken them.', '近い敵を薙ぎ、弱らせることがある。'], 9, 'strength', 35)],
  spearfighter: [technique('tech-spearfighter-sweep', ['하단 쓸어치기', 'Low Spear Sweep', '下段払い'], ['창자루로 다리를 쓸어 이동을 막을 수 있다.', 'Sweep legs with the shaft to possibly halt movement.', '柄で脚を払い、移動を止めることがある。'], 9, 'strength', 45)],
  hunter: [technique('tech-hunter-hamstring', ['다리 노리기', 'Hamstring Shot', '脚狙い'], ['명중하면 이동을 둔하게 할 수 있다.', 'A hit may slow movement.', '命中時に動きを鈍らせることがある。'], 8, 'agility', 45)],
  spellblade: [technique('tech-spellblade-wave', ['초승달 검기', 'Crescent Blade Wave', '三日月の剣気'], ['직선으로 검기를 보내 흐름을 흔든다.', 'Send a blade wave along a line.', '直線に剣気を飛ばす。'], 10, 'intelligence', 45)],
  archer: [technique('tech-archer-reposition', ['사선 바꾸기', 'Change Firing Lane', '射線替え'], ['빈자리로 빠르게 이동해 사선을 잡는다.', 'Move quickly to an empty firing position.', '空いた射撃位置へ素早く移る。'], 7, 'agility', 30)],
  ranger: [technique('tech-ranger-reposition', ['엄호 위치 선점', 'Claim a Cover Position', '援護位置の確保'], ['빈자리로 길게 이동해 다음 공격을 준비한다.', 'Move farther to an empty position for the next attack.', '空いた位置へ大きく移り、次の攻撃に備える。'], 6, 'agility', 30)],
  thief: [technique('tech-thief-piercing-dash', ['그림자 돌진베기', 'Shadow Piercing Dash', '影の貫き斬り'], ['경로의 적을 베고 선택한 적 뒤 빈칸으로 빠진다.', 'Slash through enemies and emerge in an empty tile behind the target.', '進路の敵を斬り、対象の背後の空きマスへ抜ける。'], 10, 'agility', 40)],
};
for (const [job, skills] of Object.entries(additions)) FANTASY_WEAPON_TECHNIQUES[job] = [...(FANTASY_WEAPON_TECHNIQUES[job] ?? []), ...skills];
export const FANTASY_WEAPON_ATTACK_IDS = new Set(Object.values(FANTASY_WEAPON_TECHNIQUES).flatMap(skills => skills.filter(skill => !skill.id.endsWith('-reposition')).map(skill => skill.id)));
