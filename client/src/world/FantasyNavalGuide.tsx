import type { FantasyCombatFighter, FantasyCombatState } from '../../../shared/fantasy-combat.ts';
import type { NpcLocale } from '../../../shared/npc.ts';

export function fantasyNavalRoleLabel(role: 'body' | 'appendage' | 'boarder' | undefined, locale: NpcLocale) {
  return role ? {
    body: { ko: '괴수의 본체', en: 'Creature body', ja: '怪物の本体' },
    appendage: { ko: '선측의 약점', en: 'Deck-edge target', ja: '船縁の狙い所' },
    boarder: { ko: '갑판 침입자', en: 'Deck boarder', ja: '甲板への侵入者' },
  }[role][locale] : '';
}

export function FantasyNavalLegend({ locale }: { locale: NpcLocale }) {
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  return <div className="fr-naval-legend"><b>{say('선상 전투', 'Battle at sea', '船上の戦い')}</b><span className="deck">{say('선박 갑판', 'Ship deck', '船の甲板')}</span><span className="water">{say('바다', 'Open water', '海上')}</span></div>;
}

export function fantasyNavalTokenName(fighter: FantasyCombatFighter, role: 'body' | 'appendage' | 'boarder', locale: NpcLocale) {
  if (role === 'appendage') return fighter.template?.endsWith('-eye') ? { ko: '눈', en: 'Eye', ja: '眼' }[locale] : { ko: '촉수', en: 'Tentacle', ja: '触手' }[locale];
  const name = fighter.names[locale].replace(/^(?:어린 |Juvenile |若い)/, '');
  return locale === 'en' ? name.split(' ').at(-1)! : name;
}

export function FantasyNavalGuide({ battle, locale }: { battle: FantasyCombatState; locale: NpcLocale }) {
  if (!battle.naval) return null;
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const remaining = Math.max(0, battle.naval.harpoonReadyRound - battle.round);
  const bodies = battle.naval.offshore.filter(core => battle.fighters.some(fighter => fighter.id === core.id && fighter.hp > 0 && !fighter.fled));
  const limbs = bodies.some(core => core.parts.some(part => !part.severed));
  const queued = Object.values(battle.orders).some(order => order.type === 'skill' && order.skill === 'naval-deck-harpoon');
  return <aside className="fr-naval-guide" aria-label={say('해전 안내', 'Naval battle guide', '海戦の案内')}>
    {battle.status === 'active' && <p>{limbs ? say('촉수를 끊거나 드러난 약점을 무너뜨리면 본체도 다쳐요. 원거리는 본체를, 근접 전투원은 선측의 약점을 노리세요. 갑판 작살로 본체를 끌어당길 수도 있어요.', 'Sever tentacles or destroy exposed weak points to wound the body. Ranged fighters can aim offshore; melee fighters can strike deck-edge targets or use the deck harpoon to pull the body alongside.', '触手を断つか露出した弱点を壊すと本体も傷つきます。遠距離役は沖の本体を、近接役は船縁の弱点を狙いましょう。甲板の銛で本体を引き寄せることもできます。') : bodies.length ? say('원거리 공격은 바다의 본체를 노릴 수 있어요. 근접 전투원은 갑판 작살로 본체를 선측에 끌어당기세요.', 'Ranged attacks can reach the offshore body. Melee fighters can use the deck harpoon to pull it alongside.', '遠距離攻撃は沖の本体を狙えます。近接役は甲板の銛で本体を船縁へ引き寄せましょう。') : say('갑판의 침입자를 물리치세요. 바다 위로는 날 수 있는 전투원만 이동할 수 있어요.', 'Defeat the boarders on deck. Only flyers can cross the water.', '甲板の敵を倒しましょう。海上を渡れるのは飛べる戦闘員だけです。')}</p>}
    {battle.status === 'active' && bodies.length > 0 && <small role="status">{remaining ? say(`갑판 작살: ${remaining}라운드 뒤 재사용 · 선원 모두 공유`, `Deck harpoon: ready in ${remaining} rounds · shared by the crew`, `甲板の銛：あと${remaining}ラウンド・乗員で共有`) : queued ? say('선원이 작살을 준비 중이에요.', 'A crewmate is preparing the harpoon.', '乗員が銛を準備しています。') : say('갑판 작살 사용 가능 · 선원 모두 공유', 'Deck harpoon ready · shared by the crew', '甲板の銛が使用可能・乗員で共有')}{battle.naval.tether && battle.naval.tether.untilRound > battle.round ? ` · ${say('본체가 선측에 붙잡혀 있어요.', 'The body is held alongside.', '本体を船縁に引き留めています。')}` : ''}</small>}
  </aside>;
}

export function FantasyNavalEquipment({ battle, actor, locale, blocked, selected, onSelect }: {
  battle: FantasyCombatState; actor?: FantasyCombatFighter; locale: NpcLocale; blocked: boolean; selected: boolean; onSelect: (id: string) => void;
}) {
  const skill = battle.naval && actor?.skills.find(skill => skill.id === 'naval-deck-harpoon');
  if (!skill || battle.status !== 'active' || !battle.naval!.offshore.some(core => battle.fighters.some(fighter => fighter.id === core.id && fighter.hp > 0 && !fighter.fled))) return null;
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale], remaining = Math.max(0, battle.naval!.harpoonReadyRound - battle.round);
  const queued = Object.values(battle.orders).some(order => order.type === 'skill' && order.skill === 'naval-deck-harpoon');
  const detail = remaining ? say(`${remaining}라운드 뒤 재사용`, `Ready in ${remaining} rounds`, `あと${remaining}ラウンドで再使用`) : queued ? say('선원이 작살을 준비 중이에요.', 'A crewmate is preparing the harpoon.', '乗員が銛を準備しています。') : say('본체를 골라 선측으로 끌어당기기 · 선원 공용', 'Choose the body to pull it alongside · shared by the crew', '本体を選んで船縁へ引き寄せる・乗員で共有');
  return <section className="fr-combat-group fr-naval-equipment"><h3>{say('선박 장비', 'Ship equipment', '船の装備')}</h3><button type="button" className="fr-btn" disabled={blocked || remaining > 0 || queued} aria-pressed={selected} title={detail} onClick={() => onSelect(skill.id)}><b>{skill.names[locale]}</b><small>{detail}</small></button></section>;
}
