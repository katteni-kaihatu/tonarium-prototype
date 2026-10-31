# Guild ranks and encounter access implementation plan

> For agentic workers: implement independent catalog/UI domains in parallel, integrate shared state centrally. Preserve all existing changes. No tests/build/typecheck until the user requests the next verification batch.

**Goal:** Encounter-led combat, tier1–6 ordinary matching, map/contract access to elite monsters, named guild assessments and scheduled graded hunts.

**Architecture:** Retain actual combat engine and6-player cap. Add server-derived cached encounter tier; use it for ordinary encounters and dungeon selections capped6. Explicit hunt requests require accepted guild quests at the target location. Tier7/8 sites use auction maps and existing inspect/confirm apex protocol. Assessments use the server combat adapter stats, never a client-supplied rating. Shared global contract postings rotate every2gamehours; scheduled raids persist until actually started.

**Tech Stack:** Existing TypeScript shared rules, Node store/WebSocket transactions, React KO/EN/JA UI.

## Tasks
- [x] Menu: ranking last; no combat tab; mage/priest spells and priest-only faith with stale-tab protection.
- [x] Pure power/rank/threat helpers; guild assessment UI; persisted assessment and strict action validation.
- [x] All11 elite map items, ruins/lairs/provocations, rare black-market supply and item-use knowledge, ordinary-stock exclusion.
- [x] Normal matching capped6 from actual equipment/stats; ordinary exploration/ambush combat events; arbitrary hunt/challenge starts blocked.
- [x] 2h contract cycle, high-rank rarity, total-force grades,1–7 hunt catalog,6-player scheduled raids, grant compatibility.
- [x] Atomic server assessment and raid combat setup with validated consenting claims; post-start deadline and shared progress lifecycle.
- [x] Localized new paths wired; existing read-only preview reuses updated UI. No browser QA was run.
- [x] Record verification backlog and handoff; no unrequested verification commands.

## Pending verification focus
- Cross-job tab changes and forbidden direct client commands cannot bypass access.
- Highest equipment normally selects6, weaker builds lower; no7/8 ordinary roll from travel/explore/dungeon/old hunt paths.
- Auction map learning persists and does not count as a real visit; map provenance is not required for accepted tier7 guild hunts,8neverguild.
-2h boundaries/global concurrency/restarts and old12h postings migrate without corrupting accepted contracts.
- Scheduled raid joining until actualstart, at most6, online same-session/place availability, duplicated clicks and partial save failures, shared rewards only after actual combat.

- [x] Follow-up: carry/putDown moved to party member rows and new combat carry orders blocked. Existing carry state can still settle normally.
