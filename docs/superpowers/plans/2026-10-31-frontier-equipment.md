# Uncharted Continent and Equipment Expansion Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development / dispatching-parallel-agents for separate content, artifacts and equipment domains; root owns authoritative admission, travel, dungeon rewards, persistence and integration.

**Goal:** A Gold-level uncharted survival continent, lawful and unlawful expedition access, undiscovered dungeons/ruins with one-time 30% ruin-clear artifact rolls, and explicit wearable slots.
**Architecture:** Extend existing location/route/camp/gather/hunt/dungeon systems. Canonical admission validates real registered Gold(4)+ or priest equivalent temple rank; criminal professions can use an illegal route gated by equivalent combat power. One small coast base with limited expedition stock and no town/inn; no interior shops or settlements. Add a diverse equipable artifact catalog and use one artifact slot with bounded effects. Preserve existing saves via explicit equipment migration and aliases.
**Tech Stack:** Existing shared TypeScript, Node store, React KO/EN/JA, SVG map; no dependencies, AI changes, new Tonarium-wide flows or deployment.
**Spec:** User messages in this chat. Confirmed: artifact chance is 30% on first clear of a new ruin, not repeated room clicks; priests may use equivalent temple ranks; criminal jobs may enter through an illegal route. Confirmed: preserve offhand. Shields are limited to warrior/knight/shieldbearer/paladin-priest, and parrying daggers to thief/assassin.

## Equipment target

Head, upper/body, legs, feet, weapon, ring1, ring2, necklace, gloves, artifact(1), normal bag(1), magic bags(2). Offhand retained with the confirmed job restrictions. Existing bag ownership/capacity/food preservation stays authoritative. Existing full-outfit climate clothing must keep working and not duplicate armor or accessory bonuses. Rings require owned counts/instances; at most one artifact effect source.

## Ownership

Root: shared/fantasy.ts, fantasy-data.ts integration, fantasy-engine.ts, server/fantasy-store.ts, expedition authority/entry, dungeon clear reward integration, common package/tests/docs.
Content agent: new frontier data/sites; map geometry/culture/terrain display and local content tests. No engine/store/shared types/data registry mutation without coordination.
Artifact agent: new artifact definitions/effect helpers with focused tests; no types/registry/engine/store changes without coordination.
Equipment agent: equipment mechanics, migration helper, profile equipment validators, equipment/inventory panels and direct dependencies/tests; coordinate edits to shared types/engine/store/data through root. Preserve dirty work.

## Tasks

- [x] Confirm dependencies, preserve user decisions, write failing authority/content/equipment tests.
- [x] Add continent topology and unseen site templates, diverse terrain-appropriate balanced tier4–6 regular fauna; no random7–8.
- [x] Add guild recruitment, priest-equivalent access, criminal smuggling, bound permits, legitimate departure/return travel and strict server validation including party entry.
- [x] Add limited base supply with shared daily stock, no inns/free living services; actual sustainable food and materials from hunting/gathering/fishing; restrict outside shop bypass.
- [x] Add real discoveries and randomized interior sites. Roll artifact chance once per new ruin completion, atomic with save/retry, no repeat/party-copy farming.
- [x] Add diverse artifacts with real bounded bonuses/utility, at most one equipped artifact.
- [x] Migrate/validate explicit equipment slots, dual rings, legacy armor/accessories/outfit, ordinary/magic bag consistency; UI and descriptions in three languages.
- [x] Review cross-system gates, run focused/full regressions and completion gate, update docs/README/handoff/evidence.

## Review focus

Direct forged travel/teleport bypass; no guild registration or stale suppressed guild ranks; priest access; criminal-only illegal path; party member individual qualification; player death/rebirth and admission receipts; one-time failed artifact roll permanence; simultaneous clear/save failure rollback; artifact stacking and duplicate ring instances; old saves and unowned equipped items; basecamp being accidentally inferred as a full port settlement/inn; world fog and hidden dungeon names; new land exhaustive mappings; item slots/bags and terrain survival.

No commits, PR, merging, deployment or changelog edits. Work in E:/tonarium2, not ambient C: worktree. Node runtime is C:/Users/user222/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe. Python UTF-8 explicit for Korean/Japanese output. Native PowerShell, no destructive workspace operations.


## Follow-up: naval combat (user request, 2026-10-31)

- [x] Add localized tier1–6 marine monsters and combat-only auxiliary appendages. Keep normal7–8 spawns excluded.
- [x] Distinguish deck and offshore water. Boarders fight on deck; offshore roots expose melee appendages while ranged attacks can reach their bodies.
- [x] Severed appendages damage the root once; killed root clears bound appendages; no duplicate rewards or inflated quest kills.
- [x] Provide a temporary shared-cooldown deck harpoon so all-melee parties have a reliable alternative. Keep player and unit ownership authoritative.
- [x] Preserve charged attack telegraphs, hit/range geometry, flight movement, party scaling and paid voyage continuation after victory/escape.
- [x] Verify actual Store start/reload/harpoon/party/reward/rollback and KO/EN/JA board UI, then rerun final checks and record evidence.

Ownership: equipment agent handles naval combat state/mechanics; artifact agent handles marine catalogs and attack metadata; content agent handles naval UI/presentation. Root owns sea encounter authority, Store integration, reward filtering and final checks. Existing frontier and equipment work remains part of the active task.

Implementation, domain reviews and focused Store/UI checks are complete. The final complete-suite execution passed; its result is recorded in work/qa/frontier-2026-10-31/verification.json.
