# Ruins, discovered magic and daily facilities

**Goal:** finish the requested effect reference and implement discovery-driven magic, explorable ruin/dungeon maps, ranger, traveling map sellers, global daily stock and facility hours inside the fantasy world.

**Architecture:** build on the existing authoritative character/activity/combat/party/economy store. New focused modules own magic discovery and dungeon state. Existing per-character and shared ledgers remain the persistence boundary; no browser authority over unlocks, traps, rewards, prayer odds or stock. All UI/content supports Korean/English/Japanese.

**User decisions:** priest may use light/water healing and protection combinations; job/skill XP persists across profession changes while unavailable skills are hidden/blocked; dice total visibility is 5.5 seconds from opening, including 2.5 seconds rolling.

## Concrete design

- Magic components: five existing elements and three existing forms, learned from named library books or first-time dungeon discoveries. Known components persist, prepared spells need their ingredients. Legacy prepared combinations preserve only their own components. Mage capacity stays 1/2/3 at job XP 0/30/100; priest uses the same thresholds for its own job and only water/light heal/guard.
- Prayer: one valid completed prayer per global game day as today. Priest has a 1% initial chance, +0.25 percentage points per valid unsuccessful prayer, cap 5%. On actually learning an unknown eligible component, reset failure count; canceled/duplicate/failed saves do not reroll or advance it.
- Dungeon/ruin: persisted room graph, entrance exit, revealed rooms, room inspection, trap detection/disarm, guarded discoveries, boss/room combat and exploration contracts. Surface location remains the site while dungeon state selects the map. Real tactical combat/reward hooks share the existing engine; no fake combat button resolving automatically.
- Party: keep maximum six and individual consent/progress. Shared room/discovery actions respect leader initiation; personal traps affect individuals. Do not silently move other players or award unearned loot.
- Detection: thieves, new ranger, elves and keen beastfolk receive contextual advantages, not unconditional success. Unknown traps stay hidden until discovered; disarming rolls separately; repeat rewards are prevented.
- Maps: specific site maps sold by a daytime traveling merchant encounter or low-probability market stock. Reading a map discovers the site; entrance checks knowledge rather than exposing all secret sites.
- Market: remaining quantity is shared globally per settlement and resets at floor(worldHour/24), with persisted atomic buy/sell. Rare map stock is rolled deterministically once per day/market, not once per refresh/customer.
- Facilities: inn/guild open at night; other facilities closed at night. Temple permits a dedicated paid wake-and-treat action only for actual injured/ill patients, not all temple actions. Enforce on UI and server action/economy/dialogue paths.
- Reference: document exact current skill formulas, targets, duration, MP and unlock/use conditions and the updated synthesis system. Distinguish world effects from tactical effects; do not invent unimplemented elemental statuses.

## Work

- [x] Preserve existing changes; no changelog edits, deployments, model downloads or production-data mutation.
- [x] Magic knowledge/prayer-pity, profession gating, priest synthesis, persistence and tests.
- [x] Dungeon state/data/actions/maps, traps, monsters/quests, combat and party integration with tests.
- [x] Ranger and its fitting skills/paths, acquisition and combat/detection integration.
- [x] Traveling merchant/site maps, daily rare market stock, service schedules/emergency temple treatment.
- [x] UI integration and accessible minimal information; detailed reference generation.
- [x] Regression, save failure/reconnect/multiplayer boundaries, three-language UI and required check:completion.

Verification: fantasy 1057/1057; adjacent NPC/client/account/diagnostics/Kokoa 341/341; focused follow-ups 24/24 and 19/19 (overlap). Required completion check passed. Source-generated reference 796 skills/9 combinations matches. Three-language isolated browser UI checked; production save hash unchanged; temporary UI/server removed. See docs/fantasy-cross-verification.md for logs and limits.

## Parallel ownership

- Magic: new shared/fantasy-magic-discovery*; shared/fantasy-specializations.ts; server/fantasy-combat-adapter.ts; magic portion of FantasySpecialtyPanels. Root wires common engine/prayer/read/validator.
- Dungeon: new shared/fantasy-dungeon* and related catalog/quests; shared/fantasy-combat-challenges.ts; server/fantasy-store.ts dungeon combat hooks. Coordinate root before touching common engine/schema.
- Ranger: job/data/skill/path catalogs and related integration tests; no shared engine/store/magic or root UI edits.
- Root: common schema/engine/protocol, dungeon UI/party integration, schedules/economy/travel merchant, documentation and final verification.
