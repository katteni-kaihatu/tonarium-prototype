# Monster balance draft — 2026-10-30

Status: implemented fixed stat proposal; **win rates unverified**. No tests,
simulation, type check, or build were run for this change, at the user's request.
The numbers below are acceptance targets, not measured percentages. This draft
does not establish that those targets have been reached.

## Target matrix

Rows are the adventurer's current combat-power grade; columns are the monster's
fixed tier. Guild registration does not alter either combatant's stats.

| Adventurer | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 60–80% | 10–40% | — | — | — | — | — | — |
| 2 | 80–100% | 60–80% | 10–40% | — | — | — | — | — |
| 3 | — | 80–100% | 60–80% | 10–40% | — | — | — | — |
| 4 | — | — | 80–100% | 60–80% | 10–40% | — | — | — |
| 5 | — | — | — | 80–100% | 60–80% | 10–40% | — | — |
| 6 | — | — | — | — | 80–100% | 60–80% | ≤5% | — |
| 7 | — | — | — | — | — | 80–100% | ~40% | ≤20% |
| 8 | — | — | — | — | — | — | ~60% | ~50% |

An em dash means no requested numeric acceptance band. For future automated
reporting, approximate targets use ±5 percentage points: 35–45%, 55–65%, and
45–55%. These tolerances are an explicit draft interpretation of “approximately,”
not measured uncertainty. `fantasyMonsterSoloWinTarget` stores this specification
and is never called by the battle resolver to select a winner.

Equipment should move an appropriately trained same-grade adventurer through
the regular 60–80% band. The grade alone cannot mathematically guarantee a rate:
different HP/offense distributions, learned skills, terrain, damage type, and
limited supplies change the outcome. Grade 8 has no upper power limit; its target
therefore requires a declared reference loadout rather than an assertion about
every possible grade-8 character. An arbitrarily powerful grade-8 build should
remain stronger than this reference, rather than making its opponent scale up.

## Fixed world stats

`shared/fantasy-monster-balance.ts` owns the stat table. The combat catalog uses
it for monsters; human bandits and guards retain their prior separate stats.
All monster IDs, names, stories, rewards, provocation actions, and attack patterns
remain intact. The obsolete elder-only 1,840 HP override is replaced by the common
tier-8 policy; its challenge identity and rewards remain intact.

| Tier | HP | MP | Attack | Defense | Agility | Intelligence | Accuracy | Magic resist |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 105 | 0 | 28 | 7 | 8 | 8 | 68 | 5 |
| 2 | 130 | 12 | 43 | 11 | 12 | 13 | 71 | 8 |
| 3 | 205 | 22 | 54 | 16 | 16 | 19 | 74 | 12 |
| 4 | 280 | 34 | 68 | 21 | 21 | 27 | 77 | 17 |
| 5 | 380 | 48 | 83 | 27 | 27 | 37 | 80 | 23 |
| 6 | 520 | 66 | 103 | 34 | 34 | 49 | 83 | 30 |
| 7 | 800 | 100 | 145 | 46 | 44 | 75 | 87 | 42 |
| 8 | 1,120 | 140 | 170 | 58 | 53 | 96 | 90 | 55 |

These are base rows, not the final stats of every species. Fixed role factors
usually shift individual stats by 2–12%; golems have zero MP. Resistance factors
are within 8% of neutral. Dragons retain breath, hydras regeneration, undead
draining attacks, and other existing patterns. Pattern effects can be larger
than the stat differences and must be measured separately by species.

The existing single, seeded individual-strength draw remains 0.92–1.08, with
integer rounding. It is taken independently of the adventurer's stats and never
redrawn in response to a win or loss. Existing multiplayer scaling depends only
on the saved active-player count and enemy rank. A solo multiplier is 1. The
same enemy and seed produce identical enemy stats against grades 1 through 8;
a new unexecuted regression test specifies that invariant.

## Reference power and source reasoning

The existing power thresholds remain 0, 75, 105, 145, 190, 240, 360, and 520.
`fantasyMonsterGradePowerReference` exposes the actual band and a diagnostic
anchor for every grade:

| Grade | Power band | Reference power | Diagnostic HP | Diagnostic MP |
| --- | --- | ---: | ---: | ---: |
| 1 | 0–74 | 60 | 100 | 50 |
| 2 | 75–104 | 90 | 115 | 55 |
| 3 | 105–144 | 125 | 145 | 65 |
| 4 | 145–189 | 168 | 180 | 75 |
| 5 | 190–239 | 215 | 220 | 90 |
| 6 | 240–359 | 295 | 290 | 110 |
| 7 | 360–519 | 440 | 390 | 140 |
| 8 | 520 and above | 600 | 520 | 180 |

`shared/fantasy-monster-benchmark-fixture.ts` defines **synthetic diagnostic stat
lines**, not legal equipment loadouts or measured character samples. It inverts
the existing power formula to select attack at these anchors, then rounds to
an integer. These helpers are not used for live character stats or live monster
scaling. A future test checks that every fixture actually lands in its stated
grade before any result may be attributed to that grade.

The actual power formula is:

```
offense = (attack + intelligence × 0.25) × accuracy/100
          × (1 + agility/(agility + 100)) × (1 + 0.25 × MP/(MP + 100))
durability = HP × (1 + (defense + magicResist)/100)
power = round(sqrt(offense × durability))
```

The live combat formula uses a D20 hit threshold derived from accuracy, both
combatants' agility, distance, cover, status, focus and skills. Physical raw
damage starts at `attack + skillPower − defense × 0.7`; magic raw damage starts
at `intelligence × 1.3 + attack × 0.4 + skillPower − magicResist × 0.65`.
Existing minimum damage, critical hits, guarding, cover, wards, resistance,
conditions and rage then apply. MP, movement, legal targets and telegraphs remain
part of actual combat. There is no additional “60% victory” or defeat roll.

The proposal increases regular monsters from stats that were small relative to
the adapter's starting attack/HP and grows their HP enough to permit multiple
exchanges and equipment/skill choices. For example, a synthetic grade-1 attacker
near attack 33 deals about 28 physical damage before a critical hit, resistance,
or skills against base tier-1 defense 7; the monster deals about 21 against
defense 10. That is a rough four-hit versus five-hit comparison, **not a win-rate
estimate**. Fresh legal starting profiles still need explicit future checks.
The larger tier-6→7 step creates a boss barrier; tier 8 adds endurance and damage
without the old elder-specific HP exception. These choices are source-based
starting values and may require substantial revision after measurement.

## Deferred battle verification procedure

Run this only when the user reauthorizes verification. Do not substitute the
synthetic fixtures for the following real equipment/skill matrix.

`scripts/fantasy-monster-balance-report.ts` is an **unexecuted** report runner
using actual character creation, recipe-validated equipment, live adapter stats,
legal tactical orders and the real resolver. It searches levels 1–100, five job
practice values, and starter/weapon/full outfits where appropriate for a legal
sample nearest each reference. It records the selected practice, outfit,
equipment quality and all eight combat stats. “Fine” is a crafting configuration,
not an invented stat multiplier or a promise that a grade-1 fine set exists.
Unreachable job/gear/grade combinations are explicit coverage failures; a future
run may reveal that a reference gear definition itself needs revision.

After authorization, example commands from the repository root are:

```powershell
node --import tsx scripts/fantasy-monster-balance-report.ts --seeds 20 --report-only --out monster-balance-smoke.json
node --import tsx scripts/fantasy-monster-balance-report.ts --seeds 1000 --policies basic,trained,prepared --all-cells --out monster-balance-calibration.json
node --import tsx scripts/fantasy-monster-balance-report.ts --seeds 1000 --start-seed 1001 --policies basic,trained,prepared --all-cells --out monster-balance-holdout.json
```

The full matrix can take substantial time. The smoke report cannot pass the
1,000-seed acceptance gate. A normal run exits unsuccessfully if the primary
prepared-policy target cells or equipment aggregates miss the target, coverage
is missing, a round fails to advance, or an invalid order occurs. `--report-only`
retains the failing report for diagnostics and suppresses that process exit
status. It does not turn a failed measurement into an accepted one. Targets are
checked against observed rates; Wilson intervals are reported separately.

Every row saves an outcome character and `[rounds, HP, MP, itemsSpent]` for each
seed in ascending order, so no unsuccessful seed disappears. The report also
includes recipe provenance, source hashes, Git revision/dirty paths and the exact
mapped player skills/stats. Synthetic stat anchors appear only as metadata and
are not combatants in the actual equipment report.

1. Create isolated in-memory human profiles through `newFantasyProfile` and the
   existing creation action. Use `fantasyCombatPlayer` to obtain live combat
   stats. Cover warrior, knight, archer, mage, and priest; report summoner with
   ordinary class summons separately from a strict single-fighter trial. Never
   add extra player accounts or hired companions to the primary solo results.
2. Build legal basic, ordinary, and fine gear sets through recipe input checks,
   `createFantasyGear`, and `fantasyEquipGear`. Use actual available materials,
   socket gems and recipe tiers. Use fixed quality draws 0.1, 0.5, and 0.999;
   record the resulting actual quality instead of assuming those draws guarantee
   a particular quality. Include starter equipment for grade 1. For grades 7–8,
   include fine pre-apex craftable equipment so victory does not require the
   material awarded by that same boss. Retain a separate apex-equipment sample.
3. Search legitimate level/job-practice combinations for each gear/job variant
   near each declared grade reference. Determine the grade using the current
   adapter stats and `fantasyAdventurerGrade`, not a forged guild record. Freeze
   the resulting profiles before fighting any species. Save actual IDs, item
   provenance, quality, material, gems, level, skill practice and prepared skills.
   A missing reachable grade/loadout is a coverage gap, not permission to edit
   a character's attack or grade to make it fit. Record actual score and grade
   again after every equipment change.
4. Freeze three deterministic legal policies before calibration: basic attacks
   with shortest legal paths; trained skill use with finite MP and defensive
   responses to announced area attacks; prepared trained play with one suitable
   HP potion and one MP potion. Healing consumes a normal action; supplies are
   actually deducted. Fixed heal trigger: HP below 50% and a legal effective heal;
   fixed MP trigger: insufficient MP for the next selected useful skill. Select
   offensive skills by expected legal damage per MP, then skill ID for ties.
   Use the same choices for every monster. Report basic and trained results
   separately; use prepared trained play as the declared primary equipment
   comparison. Do not tune a policy per seed or inspect future random draws.
5. Use `createFantasyCombat` and `submitFantasyCombatOrder` with tactical movement
   enabled. Obey range, cover, obstacles, legal paths, status and finite supplies.
   Use identical fresh profile copies for every battle. Include every monster
   species within each requested target cell, plus all 64 grade/tier combinations
   as diagnostics. Grade/tier cells with no target remain descriptive only.
6. Primary seeds are integers 1–1,000 inclusive, for every frozen combination.
   Keep independent holdout seeds 1,001–2,000 untouched during tuning. Retain all
   results and replay any failure with the same seed. Record victory, defeat,
   escape, timeout, invalid-order error, turns, HP/MP left, items spent, and
   damage/skill types. Cap at 100 rounds; timeouts are non-victories and reported
   separately. Never discard a bad seed, failed action, or awkward species.
7. Report each species/job/gear/policy result and a 95% Wilson interval, then
   an equal-species/equal-job aggregate for each target cell. Report lower,
   reference and upper power-band samples separately; do not hide an easy
   species or a weak job inside an aggregate. First ensure coverage of all eight
   grades and the five exceptional cells: 6→7, 7→7, 8→7, 7→8, and 8→8.
8. Adjust only explicit fixed tier/species stats, and document the reason and
   delta. Rerun calibration seeds after an adjustment; evaluate the untouched
   holdout only after freezing a candidate. A percentage is “measured” only with
   recorded seeds, loadouts, policies, sample count, outcomes and commit/tree
   identity. No gate should replace a real battle outcome with the target rate.

After authorization, run the new invariant/specification tests, existing combat
catalog tests, combat engine and adapter regressions, followed by the full
fantasy test group and normal project checks as appropriate. The prior six-person
elder-dragon fixture measures a different scenario and cannot substantiate any
solo percentage in this document. Previously recorded elder-party results and
their hardcoded expectations must be treated as historical when tuning changes.

## Measurement record

| Item | Status |
| --- | --- |
| Source review of hit, damage, adapter, power and party formulas | Completed |
| Fixed monster tier/species stats and target specification | Implemented |
| Real equipment / seeded tactical report runner | Authored, not executed |
| Real starting-profile survivability | Not run |
| Grade-1 through grade-8 legal-loadout coverage | Not run |
| Target matrix calibration and holdout results | Not run |
| Regression tests / type check / build | Not run |

Open risks include class matchups, guard/regeneration patterns, consumable action
economy, terrain and pathing, and the unbounded grade-8 power band. None has been
converted into an artificial outcome cap. The measured matrix remains the next
verification task, not a completed claim.
