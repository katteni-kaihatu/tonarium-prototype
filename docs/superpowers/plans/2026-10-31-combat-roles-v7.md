# Party-aware class moderation v7 implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline, with one fresh final reviewer. No commit, push, PR, deployment, live data or real AI calls.

**Goal:** Modestly reduce extreme class strengths/weaknesses without forcing every solo cell into the old ranges; preserve party roles.

**Architecture:** Keep fixed v6 monsters, grades/targets, XP gates, party scaling and public-state tactics. Modify existing base-role coefficients and a mastered warrior utility. Pair identical legitimate characters/equipment/XP and seeds before/after; report reassessed grade shifts separately rather than reselecting a more powerful actor to hide nerfs. Compare representative3/6-player teams and real support use.

**Tech Stack:** Existing TypeScript engine/adapter, seeded solo and party fixtures.

**Spec:** User explicitly permits residual out-of-range classes because parties are supported. See docs/fantasy-combat-targets-2026-10-31-v6.md for measured outliers.

## Selected design

- Mage INT multiplier1.30->1.25 and magic attack contribution.85->.80: modest damage reduction while retaining high damage, range and lowHP.
- Archer HP multiplier.96->1.00: small survival improvement; do not balance weaponless novice output as if it represented an equipped bow.
- Priest magic attack contribution.52->.56: small holy attack improvement, keep healing/wards/MP costs unchanged.
- Warrior base attack1->.98; at200 techniqueXP, charge weaken power2/.40chance->4/.80chance, keeping novice proc and existing duration/cap. This trades a little constant offense for practiced protective utility.
- Knight defense1.12->1.16; maintain attack and HP. Support/tank identities are not forced into DPS solo targets.
- Other role coefficients, class/race skills, miracles and unique specializations retain their authored modifiers.

## Alternatives

Global monster retuning was rejected because it shifts every class and cannot address opposite job extremes. Per-rank/desired-win-rate combat bonuses were rejected because registered rank must not change damage secretly. Existing role coefficients plus one mastery utility give small inspectable changes without new game systems.

## Tasks

- [x] Capture v6 source/actor inputs, paired prefix outcomes and representative3/6-person party baseline.
- [x] Reproduce stronger mastered charge behavior with a failing functional test; apply limited role/technique values; run role, job-HP migration and mastered-skill regressions.
- [x] Freeze v7 source; execute paired solo and party fights, track reassessed grades, damage, support use and invalid/timeouts; inspect for new extreme regressions. Old target compliance is diagnostic only.
- [x] Fresh final review, generated skill documentation, relevant checks + mandatory check:completion; publish honest v7 report and handoff.

## Rulings

- Ruling: Proceed under explicit implementation authorization without new design approval — user chose modest moderation and residual misses; no external actions.
- Ruling: Preserve current E:/tonarium2 work and prior dirty changes; no branch cleanup or moving unrelated files.
- Ruling: Do not repeat millions of calibration battles or promise every class in range — a controlled paired sample and actual party checks are sufficient for this limited numeric change.

- Ruling: Initial warrior ATK.97/charge6%65% reduced an already weak7->7 by3.14pp in the paired50-seed sample; archive candidate A and test ATK.98/charge8%80% instead. Keep original weak novice proc and finite3-round debuff.

- Final review: clean, no actionable findings. Root verified final22,890 new comparisons, no invalid/timeouts, no actor grade shifts; average out-of-range distance decreased13.4% ordinary/15.5% apex. Residual warrior7 regression2.28pp is explicit. Full suite1726/1726 and mandatory check:completion passed. No commit/push/PR/deployment.

- Final: Ruling: Retain the small warrior7 decline instead of adding hidden per-rank advantages — overall class extremes and party identity improve, user explicitly permits residual misses; cost is no claim that every weak matchup improves.
