# Runic Circles Implementation Plan

**Goal:** replace the synthesis selector with a real core-and-runes circle, add meaningful combat resistances and priest miracles/downed allies, and relic-based profession discoveries.

**Architecture:** server-authoritative pure circle compiler; preserve existing saved element/form spells as legacy entries. New spells keep their required legacy keys plus optional `circle:{core,runes}`. Existing storage, action reservations and tactical combat remain the authority.

**User decision:** add a downed stage distinct from permanent death. In combat only a saint's miracle revives; afterwards temple treatment or a recovery potion plus waiting wakes the patient. Untreated lost travelers eventually follow existing rescue/death rules.

**Tech:** existing TypeScript/React/SVG, no new dependency, KO/EN/JA.

## Design and interfaces

- New `shared/fantasy-magic-circle.ts` owns catalog and compiler. Core ids: mage `flame,tide,gale,stone,physical` plus specialization `star`; priest `holy,healing,pure,barrier,blessing,miracle`. Basic mage admission grants flame/tide/gale/stone + focus/scatter/economy; physical via discovery. Priest admission grants holy/healing/pure/barrier and basic runes.
- New action `{type:'magicCompose',slot:number,core:string,runes:string[]}`; existing magicPrepare retained for legacy requests/saves. PreparedSpell keeps existing `element,form` plus optional `circle:{core:string,runes:string[]}`. Saved spell capacity stays1/2/3; node capacity2/4/6 at current jobXP0/30/100. No client-supplied effect/power/cost. Empty optional nodes allowed; no duplicate rune stacking.
- Compiler output includes names, kind attack/heal/guard/cleanse/blessing/miracle, power, mp, magic, reach, radius, selfOnly and effects. Focus power×1.35 reach−2 radius−1; scatter power×.75 radius+1; economy power×.8 MP×.65. Bound/cap all derived values. New mage spells get a modest damage advantage; legacy effects unchanged.
- `fantasyCircleKnowledge(c)`, `grantFantasyCircleBasics(c)`, `fantasyCompileCircle(c,core,runes)`, `fantasyCircleNodeCapacity(c)`, `learnFantasyCircleBook(c,id)`, `learnFantasyCircleDungeon(c,id)`; circle knowledge must be validated and persist. Specialization restrictions checked each use, not just learning.
- Agent progression exposes `fantasyOccultAction(profile,action,rng):FantasyResult|undefined`, `fantasyOccultHours(profile,action)`, `fantasyOccultActionValid(value)` for star observation/relic use and `fantasyOccultKnowledge(c):{cores:string[],runes:string[]}` for circle compiler. Root wires schema, validation, activities and UI. Progression may coordinate names with circle owner.
- Add priest inquisitor/paladin/saint branches alongside existing ones, hidden acquisition. Inquisitor/paladin blessing self-only. Saint requires substantially deeper real service/faith/pilgrimage and relic/book discovery; miracle is an explicit additional rune. No resurrection of already permanently dead lives.
- Star Mage: must observe at night on a canon star-related island, with mage practice and completed observation. Existing generic library discovery cannot bypass this condition. Keep continent/island lore consistent.
- Ruins contain job-specific secret books/items for existing professions, selected deterministically with persisted per-character first-claim receipts. Reading/using reveals a fitting special path, actual proficiency/skill eligibility still applies. More rune books and readable passages on distinct shelves or ruins, no fourth-wall copy.
- Downed character `downed?:{since:number,expiresAt:number,treatedAt?:number,wakesAt?:number}`. Persist, block normal actions, display treatment/wait; preserve combat membership until revival or final combat resolution. Duration defaults 6 game hours untreated, 2 game hours after potion stabilization. Temple wakes immediately with paid treatment. Rescue/death rules apply after untreated deadline. Patient help only same-world/physical location and consent/party authority, atomic save.
- Combat owner extends skill fields for circle reach/radius/secondaryeffects/revive/cleanse/selfOnly; normal healing/items cannot instantly revive. Physical and magic resistance traits apply to actual damage and show in hover details, with no unconditional immunity. Enemies cannot repeatedly target downed players; they remain eligible miracle targets while battle active.

## Ownership

- Circle agent: new circle module/tests, shared/fantasy-specializations.ts and magic-discovery.ts; no engine/schema/store/UI edits. Root wires book/prayer/job/dungeon callbacks.
- Combat agent: shared/fantasy-combat.ts, combat catalog/monster traits, server/fantasy-combat-adapter.ts, tactical UI hover/skill descriptions if needed; coordinate new types with root. No store edits.
- Occult agent: new occult/relic modules/tests, priest growth, job-path discovery, rune books/library/holdings, dungeon reward hook/catalog; no engine/schema/store or circle module edits.
- Root: schema/actions/store/mortality, integration callbacks, SVG circle editor and in-game handling, final docs, saves/three-language regression and check:completion.

## Execution

Additional user steering: show exact hit probability from the real attack formula, folded combat choice menus and concise effects/self-target eligibility; three existing skills become MP recovery with bounded cooldown; ten body traits diversify race stats; positive rune boosts have diminishing returns (no rune-count scaling); varied job/race buffs/debuffs with at most1–2duplicates perjob; mage/priest retain4foundation jobskills while retired records remain valid; alchemist ingredient synthesis creates attack/utility potions using herbs and actual monster byproducts.

- [x] Preserve original data and existing local modifications; no PR/push/deploy/changelog changes.
- [x] Compiler, persistent discovery, legacy compatibility and effective modifiers (red/green tests).
- [x] Tactical AoE/utilities/physical vs magic resistance, miracle target and MP checks.
- [x] Priest/Star/relic pathways and localized books/items with real discovery gates.
- [x] Downed persistence, stabilization, wake/rescue/death, atomic party treatment.
- [x] Circular2/4/6 UI, real calculated preview and discoverable-only choices.
- [x] Fresh regressions, balance simulations, UI in three languages, detailed docs and required completion checks.


Completed additions: scribe physical books and copied maps;27newproductionitems/29recipes,7furniture/recipes;6bags with type slots/weight and recoverable overflow delivery; native black market auctions with local resident discovery, NPC/player escrow, durable claims and three-language UI. Mage HP-healing synthesis blocked for new/legacy world and combat usage. Independent review corrections and final evidence: docs/fantasy-cross-verification.md. No production data changes, pushes or deployment.
