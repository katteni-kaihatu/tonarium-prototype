# Ordinary race and profession variance reduction

> **For agentic workers:** Use superpowers:executing-plans to implement task by task. Read the v4 evidence and this plan before editing.

**Goal:** Reduce actual ordinary race/profession performance spread while preserving damage, durability, support and mobility roles.

**Architecture:** First correct demonstrably unfair comparison inputs, policy omissions and rating errors. Then change shared mechanics or role-specific data only where actual repeated combat demonstrates a cause. Keep enemy stats fixed for all challengers and never assign outcomes from desired win rates. Runtime must remain deterministic and keep old saves valid.

**Tech stack:** Existing TypeScript combat engine, Node tests and real seeded battle reports.

**Spec:** User requests variance reduced as much as practical; prior target ranges and distinct job/race strengths remain in force. Baseline: docs/fantasy-combat-validation-2026-10-30-v4.md.

## Constraints and review focus

- Work in E:/tonarium2. Preserve unrelated dirty changes. No changelog, commit, push, deployment or real AI calls.
- Preserve guild thresholds/reference points, individual party control, three languages and existing failure/charge rules unless a demonstrated defect requires correction.
- Do not price an unarmed archer as representative bow combat. Expose unreachable early job/rank profiles rather than inventing stats.
- Rating must be monotone for useful stats and must not reward duplicate/unusable skills or ignore real shared MP/action costs.
- Compare actual armor, range, evasion, mobility breakpoints, healing windows and native utility rather than unmitigated damage alone.
- Retain source hashes, invalid actions, coverage gaps, worst-performing groups and held-out seeds. Mean acceptance does not imply all groups accepted.

## Tasks

- [x] Diagnose policy/input issues independently of racial and rating audits; record concrete reproductions.
- [x] Write failing tests for confirmed mechanical/valuation problems, implement minimal shared corrections and verify targeted tests.
- [x] Rebuild legitimate profiles with consistent appropriate equipment; measure fixed-level and same-rating comparisons separately.
- [x] Calibrate shared role/race coefficients only from explicit causes; evaluate spread as well as mean difficulty. Reject changes that improve means by hiding weak groups.
- [x] Freeze runtime before final measurement; use new held-out seeds, run full fantasy regressions and mandatory check:completion.
- [x] Update current validation, handoff and backlog with actual remaining limits; no universal balance claim without evidence.

## Baseline

V4:1707 functional tests pass. Main human normal17 aggregate cells within target; apex4/5 within target,7→7=34.79%. Individual differences remain large, and12-race screening uses only representative3 species/tier. Guild rating is a finite12-action heuristic; perfect same-rank equivalence across every opponent is not assumed. This pass targets the large avoidable differences first.


## Rulings — 2026-10-31

- Audited actual race stat inheritance, body attacks, policy and rating independently. Native passives were not being applied twice. Physical body skills on caster roles did inherit magic damage incorrectly; corrected and reproduced in real resolutions.
- Rejected a new fixed-probe twelve-action estimator after both mixed and full-equipment calibration worsened weak groups. Retained source/tests under `work/qa/balance-v5-2026-10-30/rejected-estimator/` as experimental evidence, outside the production build. Its proposed index1.5 and alternate loss aggregation were not adopted.
- Retained existing legacy formulas, rank thresholds/references, job role coefficients and the global high-end index. Narrow modern corrections account for unused MP, incoming evasion, periodic warning mobility with actual owned/paid repositioning, repeated approach costs, support actions filling those waiting turns, explicit fire/poison fields, and cold not being damage over time.
- The benchmark now distinguishes preparation from an immediate strike, avoids wasted opening focus against stationary ranged enemies, and can hold a safe position if guarding is cheaper than the subsequent ranged re-approach. Decisions use public state and no future random seed.
- Mixed equipment remains an exposed stress stratum; a full set alone did not resolve the failed prototype. Do not suppress missing early caster ranks or individual weak groups to make aggregate acceptance green.
- Initial exploratory seeds51001–51020 are calibration only. Final measurement must use fresh seeds and frozen runtime; no final acceptance yet.


## Final disposition — 2026-10-31

- Rejected prototype retained outside production. Kept guild thresholds/references/global index and role coefficients; no class-lookup win manipulation.
- Added two mastered physical-technique riders using exact individual XP>=200, existing nonstacking vulnerability6 (15%,3rounds) and source validation; beginners remain unchanged. Added real-resolution, old-job hiding and KO/EN/JA detail tests.
- Final fixed boss budgets lower canonical7HP about2% and canonical8HP about6%; genericbase table remains unchanged. Final apex seeds95001–95200, ordinary91001–91100, race93001–93030. Earlier apex92001/94001 phases are calibration evidence.
- Frozen-source input/monster equivalence permits reuse only of unchanged domains; changed7-grade ordinary rows and all apex fights remeasured. No double-counted reused trials.
- Full1725functional checks and final94data regressions pass, mandatorycompletionpasses. Typical class/race spreads improved; grade5spread worsened and normal14/17/apex3/5aggregate targets pass, so no exhaustive balance-acceptance claim.
- Detail/artifacts: docs/fantasy-combat-variance-2026-10-31-v5.md and work/qa/balance-v5-2026-10-30/final-summary.json. No commit/push/PR/deployment or real AI requests.
