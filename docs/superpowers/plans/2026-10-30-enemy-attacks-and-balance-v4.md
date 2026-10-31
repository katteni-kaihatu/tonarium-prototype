# Enemy attack variety, visible preparation and balance follow-up

**Goal:** Give monsters and human adversaries characteristic attack shapes and shared visual effects. Powerful attacks spend one turn preparing and strike their previously displayed area on the next turn. Continue the outstanding ordinary race/job investigation using these actual rules.

**Authorized direction:** The user requested remaining balance adjustments and then explicitly added enemy attack variety, ranges, effects and one-turn preparation. Keep the existing flat map, turn combat, three languages, six-player parties and local-only workflow. Live AI quality and server longplay remain deferred.

**Approach:** Extend the existing skill/shape/effect system. A separate enemy attack catalog describes trait families; authoritative combat stores a bounded pending charge. Existing player animations render the enemy's actual skill metadata. Avoid per-enemy hardcoded combat branches and avoid assigning a target win probability at runtime.

## Rules

- Enemy stats and hit rolls remain real and independent of the player's rank or a desired win rate.
- The preparation turn deals no damage. Its origin, aim and affected tiles are fixed and visible.
- On the next round the charged attack resolves after player actions, providing a complete opportunity for movement, protection or interruption regardless of initiative.
- Leaving the displayed tiles avoids the attack; moving the intended target cannot redirect the attack. New walls/line-of-sight can protect a target. A displaced/dead caster or a silenced magical charge is cancelled. Root prevents movement rather than arbitrarily cancelling stationary attacks.
- Preparation pays the attack's MP once. Resolution does not pay twice; interruption does not refund the spent MP.
- Old saved battles without pending charges remain valid and retain their old enemy action data. Pending charges are strict, bounded save fields and cannot be forged by client orders.
- Existing actor positions, escort wagons, companions, miracle safety and mitigation continue to apply.
- KO/EN/JA warning labels and shape-specific danger tiles must not shift or cover the board. Multi-target attacks play one cast animation, while individual hit logs remain available.
- Do not modify changelog, deploy, commit or production data.

## Tasks

- [x] Helper agent: failing catalog/geometry tests; implement `shared/fantasy-enemy-attacks.ts` and its tests, with at least twelve trait families, regular/strong skills and all five supported shapes.
- [x] Root: failing actual turn/shape tests; add optional pending charge and bounded presentation tiles to `shared/fantasy-combat.ts`; populate new enemies' skills, prepare/resolve/cancel correctly and preserve legacy saves.
- [x] UI agent: board warning tiles, accessible/localized labels, subtle preparation and reusable release effects, one animation per multi-target cast; meaningful rendering/presentation tests.
- [x] Policy agent: correct public-state damage forecasts (rage, mitigation, magic dispatch) and use visible charge tiles to dodge or guard; regression tests without future RNG.
- [x] Root: integrate ownership boundaries, run focused engine/server/UI and persistence checks, inspect actual visuals if useful, then freeze sources.
- [x] Root: rebuild legal comparison profiles under the production scoring and new enemy AI. Measure ordinary and apex jobs/races with calibration seeds separate from the final holdout. Change assessment or base-job stats only for a demonstrated cause, preserving the mage/tank/support distinctions.
- [x] Root: final appropriate regressions, `check:completion`, independent review and accurate handoff. Publish average and per-job/race results separately; do not label an average fit universal balance.

## Evidence before changes

Read-only v4 audits found legal root/reposition greatly improves the archer against some tier7 melee patterns but not all apex patterns. A generic two-safe-turn range valuation overstates fast/ranged opponents. Lowering the healer reserve failed paired experiments and is not adopted. Damage forecasts omit public rage/condition factors; correcting those is supported, while arbitrarily capping heals is not.

Ownership: root owns combat core/types/validation and final integration; helper owns the new enemy catalog and its test; UI owns client board/presentation/effect/CSS files; policy owns benchmark fixtures and its tests. Wait for source freezes before final measurements.

## Added movement request

Ordinary player/commanded-unit moveTo uses real AGI-based normal movement, haste/chill/carrying and actual BFS paths. Extra one/two/three-or-more tiles require D20 18/19/20 (15/10/5%). A failed distance check traverses only the normal-distance prefix; existing obstacle checks and field effects still apply. No additional MP/fatigue tax. Skill movement, enemy movement and escort wagon distances stay strict. Client shows distance-check probability and failed-check endpoint, with amber attempt cells.

Implementation and focused core/store/UI tests are complete. Full regression first run:1681/1683; the two failures were old distance-legality expectation and an AFK-reward fixture whose active fighter could no longer survive the updated enemy skills. Updated fixture only (active level35 rather than20; all reward/participation assertions retained) and new-rule expectation pass focused tests. Required completion check passed; final rerun follows latest UI/policy freeze.

## Final review and validation progress

Final independent review reproduced and fixed invalid failed endpoints on passable obstacles, duplicate enemy move presentations, enemy area attacks continuing after reflection death, and drain resurrecting a dead caster. Actual edge/core regressions pass18/18. The final full fantasy run passed1707/1707, zero failures/skips; final type check passed. Real store charge tests pass after raising the fixture by one actual level to retain its intended genuine magic encounter under corrected scoring. Native priest healing was changed in the shared role factory (the adapter fallback alone was overridden and would not change actual output); circle healing remains38 in the reference profile. The beginner regression preserves level1, its earned weapon and original wallet; it now uses tactical combat, learned skills and actual supplies. Intro cave slime HP is90% of normal same-tier slime HP.

Runtime is frozen after the dead-drain gate. Final primary results: ordinary-v4-verified200.json and apex-v4-verified200.json (71001–71200); current race screening: races-v4-verified30.json (81001–81030). Earlier final-named files are superseded diagnostics and are not added to final sample totals. Any raw failed cell or missing legitimate profile remains visible in the final report; no more numeric tuning on final71001 seeds.

Final evidence:1707 fantasy tests pass, NPC159 pass, AI connection mock12 pass; primary152000+29000 and race32400 actual battles, zeroinvalid/timeout/sourcechanges. Primary aggregates21/22 within bounds;7→7=34.79% remains below35% and is not markedpassed. Missing legal earlypriest profiles and individual/race deviations remain explicit follow-ups in docs/fantasy-validation-backlog.md. New requested enemy/movement features are implemented and validated; universal balance is not claimed.
