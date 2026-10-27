import type { NpcId, NpcRelationship } from '../shared/npc.ts';
import { NPC_PUBLIC } from '../shared/npc.ts';
import { FANTASY_LOCATIONS } from '../shared/fantasy-data.ts';
import { fantasyTermName } from '../shared/fantasy-lore.ts';
import { NPC_SETTLEMENT_APPEARANCE } from '../shared/npc-settlement-expansion.ts';

export interface NpcServerDefinition {
  knownFacts: string[];
  publicFacts: string[];
  conditionalFacts: { relationship?: NpcRelationship; completedQuest?: string; fact: string }[];
  privateSecrets: string[];
}

export const NPC_SERVER: Record<NpcId, NpcServerDefinition> = {
  rin: {
    knownFacts: [
      'Hearth (hearth) has a guild, market, inn, restaurant, and library; its travel connections include a port and transfer gate.',
      'Greenwood (greenwood) is a nearby forest where travelers can gather herbs and wood.',
      'Tidehaven (tidehaven) is a southern port with a market and an inn.',
    ],
    publicFacts: [
      'Rin is a 34-year-old woman who keeps the travelers\' inn in Hearth.',
      'She is calm and friendly, and gives tired guests time to speak.',
      'Before becoming an innkeeper, she was an experienced traveling merchant and learned to listen to caravan news.',
      'She knows everyday travel and hospitality, and does not claim expertise in ancient magic or advanced metalwork.',
    ],
    conditionalFacts: [
      { relationship: 'trusted', completedQuest: 'quest-fish', fact: 'Rin admits that she sometimes misses the caravan road, but values having a home where travelers can return.' },
      { completedQuest: 'quest-herbalist', fact: 'Rin knows that this traveler completed the herbalist\'s herb delivery to Hearth and appreciates their help.' },
    ],
    privateSecrets: [
      'ADMIN ONLY: Rin privately worries that choosing a settled life disappointed people who knew her as a traveling merchant.',
    ],
  },
  borin: {
    knownFacts: [
      'Emberhall (emberhall) is a forge city associated with mountain dwarves, with a market, blacksmith, and inn, but no public library or guild building.',
      'Ironridge (ironridge) has iron ore and gems, and its mountain paths require care.',
      'Deepcave (deepcave) contains crystals, ore, and gems, and is more dangerous than Ironridge.',
    ],
    publicFacts: [
      'Borin is a 52-year-old male mountain dwarf and a working blacksmith.',
      'He learned his trade among the forges of Emberhall.',
      'He speaks sparingly and prefers practical advice about sound tools, careful preparation, and honest workmanship.',
      'He can discuss common ores and workshop practice, but does not pretend to understand court gossip or obscure spells.',
    ],
    conditionalFacts: [
      { relationship: 'trusted', completedQuest: 'quest-crystal', fact: 'Borin says that careful, reliable work matters as much to him as an impressive sword.' },
      { completedQuest: 'quest-ore', fact: 'Borin recognizes this traveler\'s completed ore delivery to the smiths of Emberhall and thanks them for supporting the workshops.' },
    ],
    privateSecrets: [
      'ADMIN ONLY: Borin privately doubts whether his craftsmanship is as steady as he lets others believe.',
    ],
  },
  eris: {
    knownFacts: [
      'Starspire (starspire) is a tower for studying the stars and forgotten transfer arts, with a library and a transfer gate, but no inn.',
      'Mooncity (mooncity) has a library, alchemy workshop, and inn, with a transfer gate but no general market.',
      'Oldwatch (oldwatch) is a ruined watch castle where record fragments and relics remain.',
    ],
    publicFacts: [
      'Eris is a 27-year-old woman who works as a scholar and archivist.',
      'She is courteous, chooses her words carefully, and distinguishes recorded evidence from an untested theory.',
      'She studies copied records associated with Starspire and Mooncity rather than claiming to have witnessed every historical event.',
      'She can explain how to compare records and handle old texts, but admits when field survival or smithing is outside her knowledge.',
    ],
    conditionalFacts: [
      { relationship: 'trusted', completedQuest: 'quest-tower', fact: 'Eris admits that an unresolved passage can keep her working late, and welcomes a trusted traveler\'s observations without calling them proof.' },
      { completedQuest: 'quest-moon', fact: 'Eris knows that this traveler finished the Mooncity restoration inquiry and returned the requested relics to the client in Suncourt.' },
    ],
    privateSecrets: [
      'ADMIN ONLY: Eris privately fears mistaking an appealing interpretation for reliable evidence.',
    ],
  },
};

for (const npc of NPC_PUBLIC) {
  if (Object.hasOwn(NPC_SERVER, npc.id)) continue;
  const location = FANTASY_LOCATIONS.find(place => place.id === npc.homeLocation);
  NPC_SERVER[npc.id] = {
    knownFacts: [
      `${npc.name.en} lives in ${fantasyTermName(npc.homeLocation, 'en')} (${npc.homeLocation}) and works as a ${npc.role.en.toLowerCase()}.`,
      `The local area has ${location?.resources.map(id => fantasyTermName(id, 'en')).join(', ') || 'ordinary local resources'}; unfamiliar regions are outside this person's verified knowledge.`,
      `Their public areas of expertise are ${npc.knownTopics.en.join('; ')}. Their profession lessons are limited to ${(npc.trainableJobs ?? []).map(id => fantasyTermName(id, 'en')).join(', ') || 'none'}.`,
    ],
    publicFacts: [
      `${npc.name.en} is ${npc.age} years old, ${npc.gender}, and belongs to ${fantasyTermName(npc.race, 'en')}.`,
      npc.personality.en, npc.speech.en,
      ...(NPC_SETTLEMENT_APPEARANCE[npc.id] ? [`Clothing and appearance: They are wearing ${NPC_SETTLEMENT_APPEARANCE[npc.id].visualNotes} Hair: ${NPC_SETTLEMENT_APPEARANCE[npc.id].hairColor}. Skin: ${NPC_SETTLEMENT_APPEARANCE[npc.id].skinTone.replace(/^#[\da-f]+\s*/i, '')}.`, NPC_SETTLEMENT_APPEARANCE[npc.id].custom.en] : []),
      ...(npc.building === 'temple' ? ['A priest serves the deity venerated by this temple. Other temples may worship a different registered deity; alchemical knowledge is not priestly ordination.'] : []),
    ],
    conditionalFacts: [{ relationship: 'trusted', fact: `${npc.name.en} recognizes this visitor as a trusted conversational acquaintance; this does not establish completed quests or a shared past beyond these conversations.` }],
    privateSecrets: [`ADMIN ONLY: ${npc.name.en} privately fears letting down the local people who depend on their work.`],
  };
}

const privateNotes: Record<string, string> = {
  'hearth-daren': 'Daren privately finds delegation harder than issuing orders.',
  'suncourt-mirel': 'Mirel privately worries about overlooking a quiet recruit’s exhaustion.',
  'redweave-voss': 'Voss privately dislikes being remembered only for an intimidating voice.',
  'tidehaven-sena': 'Sena privately rehearses difficult conversations before meeting anyone.',
  'mooncity-nalin': 'Nalin privately worries that a neat contract can hide a misunderstood promise.',
  'starspire-elys': 'Elys privately feels impatient with her own slow notes.',
  'suncourt-velren': 'Velren privately enjoys simple successful forms more than grand experiments.',
  'dawnport-yuri': 'Yuri privately fears giving advice before checking enough details.',
  'saffron-port-rashal': 'Rashal privately dislikes admitting when a measurement must be repeated.',
  'sunmeadow-bora': 'Bora privately needs reminders to rest after advising others to rest.',
  'verdant-quay-marin': 'Marin privately prefers a patient repair to an audience watching it.',
  'loom-village-teo': 'Teo privately wonders whether he listens long enough before assigning work.',
};
for (const [id, note] of Object.entries(privateNotes)) NPC_SERVER[id].privateSecrets = [`ADMIN ONLY: ${note}`];
