export const FANTASY_LODGINGS = [
  { id: 'common' as const, name: { ko: '공동 객실', en: 'Common room', ja: '相部屋' }, cost: 8, hours: 8, fatigueRecovery: 45, hpRecovery: 0.55, mpRecovery: 0.4 },
  { id: 'private' as const, name: { ko: '개인 객실', en: 'Private room', ja: '個室' }, cost: 20, hours: 8, fatigueRecovery: 75, hpRecovery: 0.8, mpRecovery: 0.75 },
  { id: 'suite' as const, name: { ko: '특실', en: 'Suite', ja: '特別室' }, cost: 50, hours: 8, fatigueRecovery: 100, hpRecovery: 1, mpRecovery: 1 },
];

export const FANTASY_DINING = [
  { id: 'simple' as const, name: { ko: '간단한 식사', en: 'Simple meal', ja: '軽い食事' }, cost: 5, hours: .5, nutrition: 30, hp: 5, mp: 0 },
  { id: 'hearty' as const, name: { ko: '든든한 식사', en: 'Hearty meal', ja: 'しっかりした食事' }, cost: 12, hours: .5, nutrition: 60, hp: 15, mp: 5 },
  { id: 'feast' as const, name: { ko: '풍성한 만찬', en: 'Feast', ja: '贅沢な食事' }, cost: 25, hours: .5, nutrition: 100, hp: 30, mp: 15 },
];
