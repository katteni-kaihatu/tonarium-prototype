# Local combat balance v3 implementation and verification

User authorization: apply locally verifiable remaining adjustments now. Live-server long sessions and actual AI text quality remain deferred to future logs. Existing approved direction: assess capabilities before adjusting ordinary jobs, include real companions, rebuild tier7's spike profile and verify with actual combat; preserve fantasy role differences.

## Constraints

Fixed monster stats per species/seed, independent of challenger grade. Keep actual d20 combat resolution; no lookup of desired win percentages in game outcomes. Existing solo targets: grades1–6 same60–80%, lower80–100%, higher10–40%;6→7≤5%,7→7~40% (35–45),8→7~60% (55–65),7→8≤20%,8→8~50% (45–55). Rare races/special career paths excluded from ordinary comparison. No production saves, deploy, commit or push. Preserve existing dirty workspace.

## Design

- Capability-aware assessment accepts optional actual actor skills and assigned companions; stat-only callers retain baseline behavior. Use a bounded shared action/MP budget, best choices rather than sum of collections, diminishing utility, no transient MP depletion grade manipulation. Realistic attack reach, healing opportunity cost and defense matter. No private prerequisites leak into UI.
- Benchmark profiles must be legal after skills/retinue assembly; recompute grade using the complete build before selecting reference profile. Tactical policy uses visible state, legal orders and actual effect semantics.
- Tier stats grow coherently; remove blanket tier7 low-accuracy500attack/high-magic-resistance shape. Keep species patterns/resistances and rare provocation gates. Tune actual fixed values with explicit experiment labels.
- Buff/nerf ordinary class profiles only when supported by combat results. Keep mage HP weakness, tank durability, healer/support specialization and companion limitations; adjust functionality or valuation instead of merely equalizing raw damage.
- Party1–6 testing measures actual outcomes and support/companion contributions under documented budgets. Do not invent a party win target absent user instruction.

## Tasks

- [x] Capability scoring TDD in shared/fantasy-adventurer.ts, integration and focused assessment/encounter tests.
- [x] Benchmark policy/loadout correctness, retinue selection, reusable actual battle runner and tests.
- [x] Tier progression invariants, provisional fixed7/8 stats and real calibration runs.
- [x] Ordinary class adjustment only with measured weak/strong role evidence; tests preserve intended tradeoffs.
- [x] Party1–6/support/retinue report and actual functional checks.
- [x] Freeze source, independent seeds representative ordinary grades/apex/all species, class/race coverage and explicit exclusions; verify no errors/stalls/source changes.
- [x] RPG regressions, NPC/UI where affected, check:completion and independent review; record exact counts and any remaining failures.
- [x] Update handoff/backlog/measurement with current measured status; never mark untested or failed targets complete.

Ownership: power agent shared/fantasy-adventurer.ts (+adapter ifrequired), policy agent scripts/fantasy-monster-balance-report.ts, party agent new party report; root owns shared/fantasy-monster-balance.ts and shared/fantasy-job-balance.ts plus final calibration. Coordinate barriers before final measurements.

## Checkpoint

Capability scoring, indexed high-end assessment, exact-profile/coverage guards, tactical healing and live-companion setup are implemented. Ordinary job HP/role profiles are retained: the measured evidence does not justify a blanket damage/healing nerf. Role and low-HP/burst counter limitations remain explicit. Stage1 heldout found two apex failures; stage2 fixed species stats use a bulk/endurance tradeoff, with fresh400-seed apex and200-seed ordinary verification running. Stage1 full regression failures were unsupported party fixtures and an out-of-scope old six-person-party5% bound; original atomic-save/gear-quality assertions remain and a saved-battle catalog-change regression was added. Final complete-suite/check:completion and exact output counts are pending.

## Verified checkpoint

The fixed final source passes all 198 registered RPG files / 1,623 tests, NPC 159 tests, AI configuration and mock HTTPS/socket/diagnostic 16 tests, and required `check:completion` (39 content documents, types and build). No source changed during the final RPG or solo runs.

The final independently selected seeds 42001–43600 (1,600 seeds) produced 232,000 apex battles. All five aggregate cells pass: 6→7 1.08%, 7→7 36.907%, 8→7 63.632%, 7→8 18.30%, 8→8 46.844%. Ordinary 148,200 battles pass all 17 aggregate cells. Three legal protocol coverage gaps remain explicit, so that report's overall `accepted` stays false.

The current 55 ordinary enemies and 32 main / 119 race profiles were recreated with zero differences. Unchanged engine hashes and exact input proof carry the ordinary/race evidence forward without overwriting historical hashes. Party evidence covers 24,000 battles, including 9,600 fresh boss battles. See `docs/fantasy-combat-validation-2026-10-30-v3.md` and `work/qa/balance-v3-2026-10-30/verified-validation-summary.json`.

Not marked achieved: universal individual job/race balance, optimal human party tactics or every body-specific terrain interaction. Actual operational AI text quality and long sessions remain deferred to logs at the user's request. No commit, push, PR, deployment or production-save changes were made.
