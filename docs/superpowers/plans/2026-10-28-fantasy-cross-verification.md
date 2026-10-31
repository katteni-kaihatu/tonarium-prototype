# Fantasy handoff cross-verification plan

**Goal:** verify the handed-over implementation against the user's complete request and correct executable behavior, including same-town player presence.

**Architecture:** preserve the original dirty implementation in a local checkpoint and patch backup, merge current develop/KokoaAI cleanup, then repair engine, authoritative store/party protocols, tactical combat, and UI in disjoint scopes. Shared outcomes require persisted cohorts and a single atomic save; client approval never grants state by itself.

**Source of truth:** the user's latest request (normal ambush 3% per real 10 seconds; escort more frequent). Handoff status claims are evidence to test, not a restriction on repairs. Combat rejection cancels the proposal; sitting out permits others to proceed and remains eligible for matching quest progress.

**Constraints:** original world data stays untouched; no changelog edits, real AI/model downloads, deployments or external messages. UI copy in Korean/English/Japanese. Keep KokoaAI-only dialogue. Use Node24 and separate build output; test real state transitions, save failures, stale generations and individual-vs-shared effects. No unrequested PR publication.

## Work

- [x] Read handoff and capture original patch/untracked feature files; preserve checkpoint 4f3f77f.
- [x] Independently audit travel, party/store and tactical combat; identify helper-only and UI-only implementations.
- [x] Merge latest develop and retain the retired AI deletion.
- [x] Travel: preserve settled rewards on cancel, no completion credit; charge fares once; interpolate and persist current position, multi-leg transfers, passed-node fog, non-retroactive ambush cursor, escort abandonment.
- [x] Party/store: leader proposals with destination/transport/individual cost/time, immutable consent identity/expiry, atomic travel/redirect, mixed approaches with shared proof and personal consequences, nonparticipant eligible victory credit, joint ambush and cart battles, persistence and save-failure handling.
- [x] Combat: real field generation and ranged enemies, validated racial traits and traversal rolls, weapon/skill-aware obstacle attacks, coverage and temporary barriers with expiry; actual job/racial effect catalog.
- [x] UI: quest-screen party investigation/combat approval; travel/redirect approval; readable 2/5 panel, bounded tooltips, readable event/dice results/audio/motion; local player list.
- [x] Verify focused regressions and appropriately batched full fantasy tests, required completion checks and browser UI where practical. Write precise final coverage and remaining limitations, and refresh handoff/status docs.

## Integration owners

- Travel: shared engine/travel/ambush data and tests; shared/fantasy.ts schema coordinated with party/store owner.
- Party: server/fantasy-party.ts, server/fantasy-store.ts, shared/fantasy-party.ts and new persistence/cohort modules and tests.
- Combat: shared combat/obstacle modules and adapter, tactical/CombatPanel UI, related tests.
- Root: server/index.ts/protocol/presence, other UI/quest surfaces, tooling, integration and documentation.

## Required boundary checks

- Canceled jobs keep only already committed interval rewards; no quest passage or duplicate payment.
- Offline/reconnect and route redirection never rewind world time, reroll past ambushes, reveal unpassed regions, or refund paid fares.
- A stale member/generation/revision/quote/leader invalidates consent; failed persistence changes nobody.
- Any successful information check shares only same-step proof; traps, buffs, damage and combat loot remain personal.
- One party ambush creates one shared battle and, for escort, one real cart; nonparticipant credit is eligible and exactly once.
- Actual combat creation, order validation, damage, MP/practice receipts and state reload use obstacle/racial/skill data.
- Tooltip, menu, dice and same-town presence work on desktop and constrained views without private/offline player leakage.
