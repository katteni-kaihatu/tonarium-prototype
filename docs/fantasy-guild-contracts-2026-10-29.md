# Guild contracts and scheduled hunts — 2026-10-29

## Implemented contract behavior

- Ordinary guild postings rotate at global game-hour boundaries 0, 2, 4, …; accepted objectives keep their existing 36-hour deadline and progress.
- Each guild can display three ordinary postings plus one waiting scheduled raid. The waiting raid does not consume ordinary refresh slots.
- Hunt grade measures the full objective roster, including targets defeated over multiple battles. It uses `fantasyHuntGrade`, rather than taking only the highest individual monster tier. For example, two tier-3 enemies require grade 4.
- New ordinary board candidates exclude tier-8 monsters. An aggregate grade-8 (Master) objective is allowed when multiple targets of tier 7 or below justify it. Existing claims are retained during migration.
- Deterministic per-quest grade posting gates are 100%, 65%, 35%, 16%, 6%, 2%, 0.5%, and 0.1% for grades 1–8, followed by the ordinary board lottery and hunt-pressure gate. These are eligibility chances before slot selection, not a promised share of all visible contracts.
- New hunt metadata includes the concrete combat-template monster ID and simultaneous enemy count, capped at three. Objective count remains the total needed across waves.

## Scheduled raid lifecycle

1. A communal hunt posts with a rendezvous time six game hours after posting.
2. A player joins through the existing `accept` action. Joining consents to a raid battle while they remain present in the guild and available after the rendezvous time. Signing up remains possible after that time until the actual start.
3. At most six participants may claim a new communal posting; pending claims reserve a place. A seventh claim receives a localized `full` error.
4. A waiting offer and its claims persist across two-hour board refreshes, including when the rendezvous time or old 36-hour deadline has passed. Waiting offer/grant deadlines use `Number.MAX_SAFE_INTEGER`; the UI displays the battle-relative deadline instead of rendering that number as a clock.
5. A joined participant sees an explicit guild start button. It becomes enabled at the rendezvous time and sends `{ type: 'guildRaidStart', offer }`.
6. The server validates membership and starts the actual battle through the root raid dispatcher. `markRaidStarted` closes signups, records `startedAt`, and sets the deadline to 36 game hours after the actual start. Waiting raids do not gain shared hunt progress before starting.

Contract rank labels and warnings are localized in Korean, English, and Japanese. A higher recommended grade is a warning, not a hard participation lock.

## Server integration API

- `raidOffer(actor, offerId, now)` returns `{ offer, quest, participants }` only for an accepted claimant whose matching contract is active at the posting guild, after the rendezvous time and before actual start. `participants` contains accepted user IDs.
- `markRaidStarted(offerId, now): boolean` persists the start once. Repeated starts return false.
- `raidSnapshot(offerId)` returns the current public offer, quest, and accepted participant IDs, including the actual started time and deadline after marking.
- Root raid dispatch is responsible for live session/location/readiness checks, actual combat and wave setup, and copying actual `startedAt`/expiry values into participating character contract grants.
- Character profile migration must retain optional `grade`, `startsAt`, `startedAt`, `monster`, and `enemyCount`. Existing profile grants for migrated v1 waiting raids need the authoritative waiting metadata. Character quest-expiry checks exempt scheduled grants that have no `startedAt` yet.

## New catalog

`shared/fantasy-guild-hunts.ts` adds 21 localized quests: fourteen single-target hunts (two at each monster tier 1–7), four multi-target ordinary hunts, and three scheduled communal hunts. Issuers are the existing local NPCs Galen at Hearth, Borin at Emberhall, Varren at Suncourt, and Eris at Mooncity. The catalog imports only quest types, avoiding data initialization cycles.

`shared/fantasy-data.ts` imports and spreads the catalog once. Other existing dirty changes in that file are preserved.

## Save compatibility

The shared board reads versions 1 and 2. Version 1 keeps all claims, transaction phases, progress, rewards, hunt receipts, and pressure records, then migrates to version 2 in memory. Generation indices reset for the new two-hour cycle. Ordinary v1 postings acquire the next two-hour posting boundary while accepted claim deadlines remain intact. Communal v1 hunts acquire waiting-raid metadata without rejecting or deleting prior claims. The next normal persistence writes version 2.

## Verification deferred

Per user instruction, no tests, typecheck, build, browser QA, gameplay run, or saved-game data edit was performed. Source inspection only.

Pending verification when requested:

- Exact two-hour boundaries, accepted ordinary progress/deadline retention, deterministic rarity and tier-8 monster exclusion and aggregate Master-grade packs.
- Shared-board v1 migration and profile metadata hydration, including already expired legacy communal grants, pending claim reconciliation, save failure recovery, and reload after actual raid start.
- Zero-player waiting raids, signup after rendezvous time, six-player capacity, abandonment/rejoin, and two simultaneous start requests.
- Raid consent/readiness/session/location checks, disconnected members, full multi-wave objectives, shared progress/rewards, and delayed starts beyond 36 game hours.
- Korean/English/Japanese rank labels, countdowns, unknown-place masking, full-state explanations, and join/start-button availability.
