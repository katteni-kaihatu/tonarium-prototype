import type { FantasyCharacter } from './fantasy.ts';
import type { NpcLocale } from './npc.ts';

export function fantasyCampingKit(character: Pick<FantasyCharacter, 'inventory'>) {
  const has = (id: string) => (character.inventory[id] ?? 0) > 0;
  return {
    fatigue: (has('fur-bedroll') ? 33 : has('bedroll') ? 25 : 15) + (has('pocket-hearth') ? 5 : 0),
    hp: .2,
    mp: .15 + (has('pocket-hearth') ? .05 : 0),
    riskMultiplier: (has('sentinel-bell') ? .55 : 1) * (has('camp-tarp') ? .9 : 1) * (has('camp-stakes') ? .9 : 1) * (has('lantern') || has('everglow-lantern') ? .9 : 1),
    ward: has('ward-seal'),
  };
}

export function fantasyCampLogText(text: string, locale: NpcLocale): string | undefined {
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const rest = text.match(/^野営を終えた。疲労-(\d+)、HP\+(\d+)%、MP\+(\d+)%、危険軽減(\d+)%。$/);
  if (rest) return say(`야영을 마쳤다. 피로 -${rest[1]} · HP +${rest[2]}% · MP +${rest[3]}%. 장비가 불상사 위험을 ${rest[4]}% 줄였다.`, `Finished camping. Fatigue -${rest[1]} · HP +${rest[2]}% · MP +${rest[3]}%. Equipment reduced incident risk by ${rest[4]}%.`, `野営を終えた。疲労-${rest[1]}・HP+${rest[2]}%・MP+${rest[3]}%。装備で災難の危険が${rest[4]}%減った。`);
  if (text === '野営の結界符が襲撃を防ぎ、1枚燃え尽きた。') return say('야영 결계부가 습격을 막고 한 장 타올라 사라졌다.', 'A camp ward blocked the attack and one seal burned away.', '野営の結界符が襲撃を防ぎ、1枚燃え尽きた。');
  return undefined;
}
