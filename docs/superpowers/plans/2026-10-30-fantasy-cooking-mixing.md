# Fantasy Cooking Mixing Implementation Plan

**Goal:** Player cooking selects ingredient quantities at outdoor camps and kitchens; invalid combinations are rejected unchanged and valid attempts resolve with saved d20 randomness.

**Architecture:** A shared cooking module normalizes all outdoor and cook-profession recipes, matches exact integer batches, validates the consumed food lots, and computes a proficiency/quality/difficulty trial. Existing `jobXp.cook` stores cooking discipline independently of the current profession. The engine owns elapsed time, saved activity seeds, logs and bag overflow. Existing recipe commands remain compatible. The server validates strict actions and facility ownership; one reusable ingredient-selection UI serves outdoor and kitchen cooking.

**Tech Stack:** Existing TypeScript engine and React UI; no dependencies or production-data migration.

**Spec:** User request transmitted by root on 2026-10-30: combination itself never fails; valid cooking may fail, spending materials/time and granting smaller cooking proficiency; invalid/missing formulas spend nothing.

## Constraints and choices

- Action `cookMix` carries station, distinct ingredient quantities, optional explicit recipe choice for ambiguous matches, and optional existing kitchen workshop ID. No client result, chance or success fields.
- At most8 selected ingredient types,1–99 units each,1–10 exact recipe batches. No unmatched partial or extra ingredients.
- Existing kitchen cook profession/facility rules and outdoor tools/fire rules remain.
- Success chance uses d20 with threshold clamped2–20: recipe DC minus proficiency bonus `min(10,floor(sqrt(cook XP)/3))`, plus consumed stale-food penalty0–3 and batch penalty0–3. Natural1 fails and20 succeeds. This is an implementation choice; the user did not specify rates.
- Completed valid attempts spend selected inputs and outdoor wood even on failure. Success earns6 cooking XP/batch; failure earns2/batch. All gains go to `jobXp.cook` and persist when changing professions.
- No changes to production saves, commits or deployment.

## Work

- [x] Add matching, malformed/unknown/ambiguous combination, probability threshold, actual consumed freshness, success/failure/batch and profession-isolation tests.
- [x] Implement shared matcher/trial and narrow engine timing/seed/capacity integrations, retaining legacy actions.
- [x] Coordinate strict saved/action validation and actual server cancel/reload/failure/storage tests with ranks/economy owner.
- [x] Replace player fixed recipe buttons with bounded ingredient quantities, explicit matching result choice and concise outcome/duration/proficiency preview in outdoor/kitchen UI.
- [x] Run domain regression, UI render, server persistence and global type checks. Record results and selected rates in final cooking validation document.
