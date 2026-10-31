# Secret maps for rank 7–8 monsters

Source changes only. No runtime data, commits, or pushes. Tests, typechecking, builds, and browser QA are deferred at the user's request; the cases below remain pending.

## Catalog and auction supply

`shared/fantasy-monster-sites.ts` catalogs all 11 existing monster combat templates at rank 7 or 8. A site is a hidden approach within an existing world location; it does not add a new travel node. Dragon maps lead to lairs, and other monster maps lead to ruins. Site names, descriptions, map items, and new challenge warnings have Korean, English, and Japanese text.

| Enemy suffix | Rank | Location | Kind | Provocation ID |
| --- | --- | --- | --- | --- |
| red-dragon | 7 | ashpeak | lair | apex-site-red-dragon |
| frost-dragon | 7 | frostpass | lair | apex-site-frost-dragon |
| storm-dragon | 7 | storm-isle | lair | apex-site-storm-dragon |
| abyss-hydra | 7 | eclipsevault | ruin | apex-site-abyss-hydra |
| obsidian-guardian | 7 | ashpeak | ruin | apex-site-obsidian-guardian |
| lich | 7 | oldwatch | ruin | apex-site-lich |
| phoenix | 7 | storm-isle | ruin | apex-site-phoenix |
| elder-dragon | 8 | ashpeak | lair | apex-elder-dragon |
| ancient-frost-dragon | 8 | frostpass | lair | apex-frost-dragon |
| ancient-storm-dragon | 8 | storm-isle | lair | apex-storm-dragon |
| void-chimera | 8 | eclipsevault | ruin | apex-void-chimera |

Each site ID is `monster-site-${enemy suffix}`; each map item ID is `black-map-${enemy suffix}`. The four existing rank 8 provocation records, locations, actions, warnings, and confirmation text are preserved. Seven rank 7 records use separate `apex-site-*` IDs, including frost and storm dragons, to avoid collisions with the rank 8 records.

Map items have category `black-market-map`, `craftOnly: true`, and item quality tier 4 for rank 7 sites or tier 5 for rank 8 sites. Item quality tiers are distinct from monster ranks. `FANTASY_BLACK_MARKET_ITEMS` includes the maps, and the existing `fantasy-data.ts` spread registers them in `FANTASY_ITEMS` without another spread.

Each auction lot has a deterministic 3% chance of selecting a rank 7 map pool and a 1% chance of selecting a rank 8 map pool. Every map lot contains exactly one map. The catalog prices are 7,000 and 18,000 gold respectively; existing auction rules set opening reserves at 65% (4,550 and 11,700 gold), increments at 5%, and competing NPC budgets from the item value. There is no guaranteed map lot. Existing persisted auctions remain intact.

## Integration contracts

- `FANTASY_MONSTER_SITES: FantasyMonsterSite[]`, containing `id`, `enemy`, `location`, `item`, `kind`, `tier`, `names`, `descriptions`, and `provocation`.
- `FANTASY_MONSTER_SITE_ITEMS: FantasyItem[]`.
- `fantasyMonsterSiteForItem(item: string): FantasyMonsterSite | undefined`.
- `fantasyMonsterSiteForProvocation(id: string): FantasyMonsterSite | undefined`.
- `fantasyKnownMonsterSites(c: FantasyCharacter): FantasyMonsterSite[]`, filtering by `c.monsterSites` site IDs in catalog order.

Root integration owns character knowledge persistence and validation, item-use consumption, access/source authorization, guild-hunt permissions, ordinary-market supply exclusion, and presentation. Studying a map should consume it only when new knowledge is learned; it should remember the site without entering combat. A known site needs the correct current location before its challenge can be used. All rank 8 encounters still require their explicit warning and confirmation. Rank 7 guild hunts are the separate authorized exception to map-based access.

Exclude `black-market-map` from ordinary random shop stock, including restocking sold items if the intended policy forbids resale availability. `craftOnly` already excludes maps from some ordinary item pools but should not be assumed to cover every supply path. Maps have no gathering/drop/recipe entry.

## Pending checks

- Catalog covers every unique existing rank 7/8 monster template, exactly once, with valid world locations and collision-free item, site, and provocation IDs.
- All 11 item/provocation lookups resolve their matching sites; unknown IDs return undefined; missing knowledge returns an empty known-site list.
- Every locale displays a lair for dragons and ruins for other monsters; map reading makes clear that combat does not begin automatically.
- Auction generation eventually supplies both rank pools, produces one map per lot, and passes ledger validation with the higher reserves and NPC bids. Existing auctions still load.
- Map items occur once in `FANTASY_ITEMS`, remain absent from ordinary native/random merchant stock, and cannot be obtained from gathering or unrelated item rolls.
- Reading a newly acquired map consumes one copy and persists knowledge; rereading known maps does not consume another copy; invalid/dead/downed/busy use does not mutate inventory or knowledge.
- Unlearned and wrong-location challenges reject, including forged requests. Knowledge alone does not auto-trigger combat.
- Rank 7 normal/random/general sources reject; authorized guild hunts and learned-map site sources succeed.
- Rank 8 generic quests, random encounters, and guild hunts reject; only learned-map site challenges with explicit current warning confirmation succeed.
- Original rank 8 provocation actions and confirmation flow remain unchanged, and new rank 7 frost/storm records do not shadow the ancient dragon challenges.

## Adventure menu and site UI

`client/src/world/FantasyPanel.tsx` removes the standalone combat menu entry and render while retaining the central `FantasyCombatPanel` encounter presentation. GM combat navigation falls back to the location panel. Rankings are appended after every static and conditional menu entry. A selected tab is used only while it remains in the available navigation list, so profession changes immediately hide stale spells/faith/company/alchemy selections.

`client/src/world/FantasyFieldActions.tsx` keeps only the contract-target selector supplied by `fantasyCombatHuntOptions(c)` and labels it contract quarry tracking. The helper's server-side restrictions belong to root integration. Skinning remains available from actual fresh quarry. Combat/party pending requests also disable field actions, and combat request errors appear above the field controls.

`client/src/world/FantasyMonsterSites.tsx` exports `FantasyMonsterSites({ c, blocked })`. It appears beneath field actions only when viewing the current location and lists learned sites in that location. Each entry displays its map name, lair/ruin kind, and monster rank. Inspection sends `{ type: 'inspect', target: site.provocation }`; the warning comes from the matching `FANTASY_APEX_PROVOCATIONS` record. The warning must match the current location and be no more than one game hour old, using the greater of the character hour and live world clock. Future-dated warnings are rejected by the UI.

Each card requires an explicit confirmation checkbox before `{ type: 'start', source: 'apex', target, confirm: true }`. In a party, only the leader may instead send `{ type: 'readyCombat', source: 'apex', target, confirm: true }`. Confirmation resets on inspection, warning timestamp changes, leaving/reopening a location panel, and proposing or starting a battle. The component preserves the ten-second combat request timeout formerly provided by the removed combat menu.

Additional pending UI cases (no UI execution performed):

- Rankings stay last for priests, mages, alchemists, company professions, and characters with local black-market clues.
- No combat tab remains; central encounter battles still render and GM combat suggestions open location controls.
- Changing away from mage/priest immediately hides spells; changing away from priest hides faith, even when that panel was selected.
- Without an accepted hunt contract, no target picker appears; fresh carcasses still allow skinning. Accepted quarry appears only at the correct destination and disappears once completed.
- Unknown maps and known sites in other locations reveal no site controls. Current-location learned sites display all three locales and correct ranks/kinds.
- Inspection does not start combat. Warning expiry, future timestamps, activity, disconnection, low HP/downed state, return lantern, current encounters, and pending requests disable site actions appropriately.
- Keyboard users can inspect, read warnings, select the labeled checkbox, and start/propose only the selected site's challenge. Refreshing an inspection clears previous consent.
- Party members cannot propose as leader; leaders send apex proposals with confirmation, and the existing party consent flow remains available.
- Combat and party errors remain visible, pending requests recover after timeout, and long localized descriptions fit narrow layouts.

## Scheduled guild raids in the field

`client/src/world/FantasyGuildRendezvous.tsx` exports `FantasyGuildRendezvous({ c, onAction, blocked })`, mounted in `FantasyFieldActions` before ordinary field activities. It lists only accepted, incomplete raid hunt contracts whose `startsAt` is defined, `startedAt` is absent, and destination matches the character's actual current location. It displays the localized contract title, whole-contract recommended guild rank, game-calendar muster time, and remaining game/real time. At or after muster, an available connected character can send `{ type: 'guildRaidStart', offer: grant.offerId }` from the field. This UI never moves a character to the hunt destination. The server owns the participant eligibility and launch rules.

`client/src/world/FantasyQuestBoard.tsx` shows recommended rank on active hunt contracts, using `grant.grade ?? fantasyContractHunt(quest)?.grade`. The existing exported helper is `fantasyContractHunt`; there is no `fantasyContractGrade` export. Individual monster tier is labeled separately, with text explaining that whole-objective target count contributes to the contract's aggregate threat. Scheduled raids show muster time, waiting/due/start status, and instructions to travel to the destination. Waiting raid grants are presented without an expiration countdown; the deadline is described as beginning after battle start. The `Number.MAX_SAFE_INTEGER` waiting sentinel is never formatted as a calendar date or remaining hours.

Additional pending rendezvous and accepted-quest UI cases:

- A signed-up character sees no field launch control at the guild or any other non-destination location; traveling remains a separate normal action.
- The correct destination shows the scheduled raid before muster with a disabled start button and accurate remaining time; the button becomes available when the live world clock reaches muster.
- Active/started, completed, abandoned, non-hunt, and non-raid contracts do not appear in the waiting rendezvous panel.
- Pending requests, disconnects, combat, activities, current events, downed/dead state, return lantern, and travel prevent field launch.
- Starting sends the offer ID without a teleport or remote-credit request; server launch includes only eligible joined players physically at the destination.
- Started snapshots remove the waiting field card and replace accepted-quest waiting copy with the actual start timestamp and a finite deadline.
- Existing grants without grade metadata derive whole-contract rank from the quest; a pack's aggregate rank remains distinct from each monster's tier.
- Waiting grants never display the sentinel deadline, regardless of how far muster is overdue. Ordinary finite contract deadlines still display normally.
- Korean, English, and Japanese muster/calendar/rank text fits narrow layouts and the start button is usable with a keyboard.

No tests, typecheck, build, or browser QA were executed for these UI changes.

## Map and assessment message localization

`fantasyMonsterSiteText(source, locale)` resolves the existing persisted map-reading marker `魔物の地図［<site ID>］を読み、秘密の入口を地図に記録した。` to Korean, English, or Japanese text using that site's localized name. It also translates duplicate secret-entrance and missing-map messages. Unknown markers and other text return `undefined` so existing translation fallbacks remain available.

`fantasyGuildAssessmentErrorText(source, locale)` resolves `guild:invalid`, `guild:not-alive`, `guild:busy`, and `guild:guildOnly` in all three locales. `FantasyGuildAssessmentError` exports the corresponding code union. The assessment helper now emits those prefixed rejection codes; its guards, rank formula, activation, and mutation behavior are unchanged. Both message resolvers run early in `fantasyErrorText` and `fantasyLogText`, before the Japanese fallback.

Pending localization cases (not executed):

- All 11 valid persisted map-reading markers show the matching localized lair/ruin name, without exposing the raw site ID.
- Duplicate-map and missing-map errors display correctly in Korean, English, and Japanese; unknown text still follows the existing fallback.
- Every prefixed assessment rejection displays a meaningful localized message in the global error header and when passed through log translation.
- Raw unrelated `invalid`, `busy`, and `guildOnly` codes remain outside the assessment resolver, preventing cross-feature message collisions.
- Existing rank calculations and assessment eligibility produce the same result apart from the prefixed error text.

No tests, typecheck, build, browser QA, or executable verification were run for this localization pass.
