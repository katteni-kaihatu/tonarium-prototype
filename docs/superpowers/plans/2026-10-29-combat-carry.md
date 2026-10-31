# Combat Carry Implementation Plan

**Goal:** Finish the remaining implementation in `fantasy-saint-combat-handoff.md` without executing deferred verification.

**Architecture:** Server-owned carry/put-down orders reference existing downed combatants. The patient shares the carrier's tile and follows every ordinary movement step. Existing off-field carried patients reserve the same one-person capacity. Combat results transfer valid player relationships back into the persistent party carry system.

**Tech Stack:** Existing TypeScript combat reducer, atomic FantasyStore, React tactical UI, KO/EN/JA.

**Spec:** `docs/fantasy-saint-combat-handoff.md` and the user's request to finish implementation before verification.

## Constraints
- Preserve the dirty workspace and production data. No commit/upload requested.
- Do not execute tests, typechecking, build, browser QA, or completion checks until the user asks.
- One patient per living player carrier; same-side player or injured hired troop/syndicate. Summons and the caravan are excluded.
- Pickup requires an adjacent or shared tile with a clear reachable edge; put-down uses a free adjacent tile. Both consume the actor's turn.
- Carry halves normal movement, minimum one; root remains zero. Carry blocks motion skills and front/rear shortcuts.
- Damage, revival, fleeing, death, generation changes, and combat-end transitions cannot leave dangling links or duplicate carriers.

## Implementation
- [x] Add focused carry reducer helpers, strict state/order validation and localized errors.
- [x] Add pickup/drop turn resolution, movement following, casualty cleanup and paired escape.
- [x] Transfer persistent party carrying into/out of combat with atomic profile updates.
- [x] Add map-based patient selection, carry/drop actions, carrying badges and replay support.
- [x] Update handoff/status and queue regression cases without executing them.

## Deferred verification
Adjacent/wall/occupied-cell pickup, multiple carriers, root/frost/haste and movement limits, motion restrictions, drop default/explicit/no space, patient revival, carrier collapse/death/escape, end-of-fight transfer, external patients, NPC injury, saving/reconnect, animation and KO/EN/JA accessibility.

Implementation wired; all verification remains deferred by user instruction.
