# Dual careers, grouped artisans and party roles

User approved one combat career plus one active life career; retain all former XP/skill history. Life jobs: alchemist,cook,baker,blacksmith,carpenter,tailor,weaver,leatherworker,gemcutter,herbalist,farmer,fisher,scribe,merchant,shipwright,potter.

## Work and ownership
- Root: career helper/types, acquisition/skill/practice/production integration, persistence and UI, server scheduling/ownership, overall checks/docs.
- Facilities: grouped services and resident public/private NPC catalog; merchantGuild new building. Existing settlement variety and hours retained.
- Commissions: quotes/material/fee/quality atomic fulfillment; hired-worker production/XP/catalog and ownership guard.
- Combat: filter life skills out of combat conversion, modest distinct role effects using existing IDs/conditions; functional tests and generated descriptions.

Contracts: shared/fantasy-careers.ts exports fantasyIsLifeJob, fantasyLifeJob, fantasyHasJob, fantasyCombatJob. FantasyCharacter.lifeJob optional, job remains combat for new players; legacy production job resolves as life through helper and migrates on load. Separate jobXp keys remain. Grouped facilities exactly requested. Commission request identifies resident npcId or hired workerId; employees only server context, never supplied by clients. Commissions consume materials+fee/time with NPC skill-based output, preserve both careers and do not grant player profession mastery. Reuse existing activity/warehouse/worker accounting.

## Tasks
- [x] Dual career core/persistence/production/UI.
- [x] Grouped facilities/16 profession artisan coverage and individual NPCs.
- [x] NPC commission and owned-worker jobs, materials/fee/time/output/XP guards.
- [x] Life combat skills excluded; combat role identity and meaningful balance samples.
- [x] KO/EN/JA UI, targeted/full regressions, check:completion, final independent review, docs/handoff.

Ruling: continue existing E:/tonarium2 dirty workspace; no commits/PR/deploy/live AI or production data changes. Proceed under user implementation authorization; routine fee/time defaults and regional placement are reversible implementation choices. Skill-guided independent tasks delegated after shared API defined.

## Completion evidence

- Independent review completed; its hired-alchemist potion-production gap was fixed with regression cases (23 focused checks passed).
- Final runtime party comparison: 480 battles, 0 invalid actions/timeouts, 352 career/stat/skill comparisons and 60 paired equal-result battles. Small samples are not an all-class target certification.
- Full fantasy suite: 1,761/1,761. Mandatory completion and generated capability reference checks passed.
- Actual UI components rendered for KO/EN/JA at 1440 and 390 px: six layouts without clipped/overlapping controls.
- Added NPC suite found one obsolete resident-count assertion; updated 138 to 159; full NPC rerun passed 160/160. Runtime changes after the full fantasy run are Japanese comment wording only.
- Detailed report: docs/fantasy-dual-careers-artisans-2026-10-31.md. No deployment/commit/production changes.

## Priest institution clarification

- User requested priest-only temple ranks, with no guild adventurer rank. Other careers are unchanged; crime-job exclusion was not requested.
- Guild registration and promotion reject priests; quest reports cannot add guild progress. Effective guild grade is zero while serving as priest, preserving old records and normal return of borrowed equipment.
- Rank perks/discounts/manuals/named commissions follow the effective grade. UI hides adventurer rank panels; KO/EN/JA NPC/GM responses explain temple ranks.
- Focused storage/benefit/NPC checks and UI checks cover the change; broad regression results are recorded separately from the earlier full suite.

## Criminal guild exclusion follow-up

- User now excludes criminal professions from guild registration. The prior priest-only limitation is superseded by the guild eligibility document.
- Eligibility reads the canonical crime category, covering all six current criminal professions and their paths. Server registration/promotion, effective grade, perks, reports, saved history and localized explanations use the shared rule.
- TDD failures reproduced, then 50 focused regression checks and 14 UI checks passed. Existing equipment loans can still be returned.
- Details and scope: docs/fantasy-guild-eligibility-2026-10-31.md. No deploy or production changes.
