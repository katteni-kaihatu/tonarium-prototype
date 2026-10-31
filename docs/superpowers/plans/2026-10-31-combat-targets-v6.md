# Combat target calibration v6 implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution. No commit, push, PR, deployment, server data changes or real AI calls.

**Goal:** Bring all22 currently measured aggregate grade matchups into the existing win-rate ranges while retaining class/race identities and exposing individual weak groups.

**Architecture:** Retain v5 assessment, legitimate profile selection, skills, tactics, target ranges and fixed monster generation. Use isolated in-memory calibration to find small fixed HP/armor/resistance budget corrections for failing tiers; install only demonstrated candidates, then measure fresh seeds. Never draw a victory from a desired percentage or scale an opponent by challenger.

**Tech Stack:** Existing TypeScript engine, Node seeded simulation and unit tests.

**Spec:** User requests remaining win targets met. Baseline: docs/fantasy-combat-variance-2026-10-31-v5.md. Ordinary targets: equal60–80%, lower80–100%, higher10–40%; exceptional6→7<=5%,7→7=35–45%,7→8<=20%,8→7=55–65%,8→8=45–55%.

## Review focus

- Neighbouring cells must remain inside target; balancing7/8 cannot inflate7→8 above20%.
- Use identical legal v5 actors and public-state policy; do not change scores, rank thresholds, seeds or coverage to hide failure.
- Keep original source hashes, configuration, count, invalid outcomes and profile gaps visible.
- Calibration observations are not held-out evidence. Reserve fresh final seeds and freeze production before measuring.
- Finite sampling and unmatched novice caster profiles remain stated limits, not silently fabricated coverage.

## Tasks

- [x] Diagnose existing five missed cells and run fixed-budget calibration, including adjacent cells.
- [x] Observe existing target failure; pin chosen fixed budgets and invariance in regression tests, apply minimal table changes, verify tests.
- [x] Freeze sources; fresh ordinary/apex reports, invalid/timeout and individual-spread checks. Reject neighbouring target regressions and iterate only with recorded calibration.
- [x] Run relevant regression and mandatory check:completion; final independent review; update v6 report, README, handoff/backlog.

## Rulings

- Ruling: Continue the already authorized tuning design without another design approval — targets and tradeoffs were explicitly discussed and the user requested implementation.
- Ruling: Preserve the existing dirty E:/tonarium2 workspace — changes belong to the ongoing task; no checkout/reset of prior work.
- Ruling: Use fixed monster budget adjustments first — observed misses are modest; a new assessor previously worsened variability and is excluded.

- Final: fixed misleading formal acceptance copied from aggregate-only raw report — acceptance-scope tests RED (2 failures) → GREEN (3/3); preserve raw accepted, expose job failures and stricter measured-cohort acceptance separately. Runtime/report-source hashes remain unchanged.

- Final: Ruling: Preserve the existing aggregate-only producer report contract and add strict job/coverage acceptance in the v6 audit — avoids changing runtime/report hashes during frozen measurements; raw accepted alone must not be described as all-job acceptance.

- Final: verification — fresh aggregate22/22;114,400 executed battles including paired race breadth, invalid/timeouts0; legitimate actors unchanged,193 frozen source hashes stable.71 regression +3 acceptance audit tests and check:completion pass. No further reviewer pass.
- Final: Ruling: Aggregate target completion does not imply universal class/race balance — report ordinary/apex job misses and the worsened sampled race-cohort job spread explicitly; otherwise players would be misled about individual viability.
