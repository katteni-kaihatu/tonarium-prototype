# Combat presentation — 2026-10-29

The tactical board keeps a separate set of visual token positions while the server remains authoritative for orders, targeting, HP, MP, movement legality, and outcomes. When a resolved snapshot arrives, newly received presentation events play in log order. Movement follows the recorded tile path; melee strikes, projectiles, impacts, elemental bursts, and alchemical splashes share reusable effects. Failed attack rolls show a localized miss marker instead of a normal impact.

The first snapshot of a battle establishes the current board without replaying its history. Later snapshots append fresh log IDs to the queue. A battle change, unmount, or the localized **Skip animation** control clears pending playback and shows the latest server positions. The queue is bounded to 40 pending events and ordinary actions accelerate when the queue is long. Status text and the skip control occupy a fixed-height row so they do not move the board.

## Presentation metadata

`FantasyCombatLog.presentation` describes an already resolved action:

```ts
{
  kind: 'move' | 'attack' | 'miracle';
  actor: string;
  target?: string;
  from?: { x: number; y: number };
  to?: { x: number; y: number };
  path?: { x: number; y: number }[];
  skill?: string;
  element?: string;
}
```

The server captures source and destination at execution time. A recorded path preserves special movement and obstacle traversal. If older logs lack metadata, the client can still interpolate position changes with the existing path finder; it does not infer attacks by parsing localized text. A source/destination pair with no available path falls back to direct interpolation.

Miracle IDs beginning with `miracle-` are recognized even when their actual rules use blessing, mana, cleansing, or guarding. Their usable skill buttons can use `fantasyCombatMiracleReadyClass(skill, usable)` for the luminous border. A resolved miracle displays its localized name and caster over the battlefield. `miracle-last-dawn` adds the extended light pillar, luminous rings, rising particles, and centered line:

- KO: 제게 남은 빛을, 저들에게 돌아갈 아침으로.
- EN: Let the light I have left become the morning that returns to them.
- JA: 私に残る光を、あの人たちに帰る朝へ。

Profession ultimate effects use the actual `fantasyUltimateAnimation` catalog: cleave, pierce, volley, impact, nova, ward, rally, and shadow motifs, each with its catalog color and duration. Their names come from real combat skills; this presentation layer grants no skill or unlock.

Tile controls pause during playback so the animated token position cannot be mistaken for a selectable authoritative position. The combat log, roster values, and combat rules continue to use the server snapshot. Reduced-motion settings show final positions immediately and keep static miracle/ultimate announcements and the Last Dawn line without animated effects. All new controls, announcements, and the Last Dawn line have Korean, English, and Japanese text.

## Verification deferred at the user's request

No tests, typecheck, build, `npm run check:completion`, or browser inspection were run for this change. The user's explicit instruction to defer these checks takes precedence over the normal completion checklist in `CLAUDE.md`. The implementation has received source review only; runtime behavior and visual layout remain unverified until the user requests checks.

When authorized, verify real server round updates with several actors, attacks that hit and miss, multi-tile movement and blocked routes, item splashes, every ultimate motif, miracle activation, Last Dawn, skip during playback, a new snapshot during playback, battle changes, mobile layout, keyboard controls, and reduced-motion settings. Then run the project completion checks.
