# NPC conversation transactions — 2026-10-30

## Behavior

- A permanent shop NPC answers stock, herb, price, and quantity questions using the server's current shop lots for that NPC's building. A named item, list number, or a short reference to the last single item can lead to a purchase quote. Quantities are whole numbers from 1 to 99, subject to current stock. The quote shows the exact total and requires a second confirmation before payment and inventory change.
- Innkeepers list actual vacant room counts and the existing common/private/suite rates. Choosing a room produces the existing lodging action and its cost/duration confirmation. Availability comes from the server's lodging occupancy accounting; dialogue does not invent rooms or vacancy.
- Guild NPCs recommend eligible posted contracts at or below the registered guild rank, prioritizing the closest grade. Naming a contract or choosing its list number produces a confirmation with the original offer ID. Acceptance follows the shared contract claim/reservation path.
- A daytime visit to the guild may produce a commission addressed to a Silver-or-higher adventurer by name. It uses a real, exclusive contract at the adventurer's registered rank, with a private recipient and normal authoritative acceptance. The NPC offers it; the player can decline or confirm in conversation.
- The daily limit uses the global game day (`floor(globalHour / 24)`), with new offers only during 06:00–18:00. A stable user/day contract ID and a separate persisted notice ledger prevent rerolling or repeat greetings after reconnection or reincarnation. The notice is saved before it is sent. Declining does not restore that day's new-offer allowance.
- Korean, English, and Japanese transactional dialogue remains in-world. Ordinary NPC knowledge and free conversation continue through the existing reply system. The GM continues to use its existing concise action quotes.

## Server boundaries

`server/npc-transactions.ts` contains deterministic browsing and proposal handling. `NpcTransactions.chat(context, conversationActions)` returns a handled reply and can create a pending proposal, but does not grant items, spend gold, rent a room, or accept a quest itself. Context includes trusted dynamic shop facts, room occupancy, the current contract board, and an optional newly offered named commission. `visit` is a trusted guild-visit flag, never an instruction inferred from model output.

`server/fantasy-conversation-actions.ts` remains the confirmation boundary. Existing revision, generation, life, location, timeout, and market-quote checks remain in force. Explicit purchase/rental/acceptance phrases are accepted only for the matching pending transaction type. A new relevant stock, room, or contract inquiry clears an older pending transaction before presenting the new information.

`server/fantasy-named-commissions.ts` persists only the latest notification day and offer ID per account. It is independent of a character life. `offer(user, day, create)` returns a commission only after a new notice has been saved; repeat calls that day return nothing. Contract creation and actual claims remain owned by `FantasyContracts`. An unavailable or invalid ledger suppresses new proactive offers instead of resetting the limit.

The authoritative buy action carries optional quantity and shop building, so the quoted NPC shop is the shop that actually trades. Lodging capacity is checked again when the confirmed action is applied. Shared contract claims validate recipient, availability, expiry, eligibility, and exclusive reservation at acceptance time.

## Limits

- Browsing references and confirmation proposals expire after two real minutes and are intentionally invalidated by character-state changes. Ask again after expiry or a changed quote.
- Purchases use one concrete stock lot at a time. Stock summaries can show several prices/lots; dialogue asks for a smaller quantity when the selected lot cannot supply the request.
- Named commissions use existing eligible exclusive quest content. If no uncompleted quest matches the rank and current guild board region, no artificial quest or reward is invented. A later eligible daytime visit may try again if no notice was issued.
- The persisted once-daily notification is at most once: a connection lost after the notice is saved can miss the proactive greeting. The private contract remains available through the guild board/conversation until its posting expires.
- No external AI billing integration or new dependencies are added.

## Pending checks

Tests, build, type checking, and browser verification are explicitly deferred at the user's request. No passing verification is claimed. Follow-up checks should cover KO/EN/JA stock → quantity → confirm, cancel/stale quote/insufficient funds, cross-shop price binding, concurrent last-unit purchase, inn occupancy and simultaneous last-room requests, guild list → selection → actual reserved acceptance, private-offer visibility, and named commissions across repeated visits, restart, reincarnation, day rollover, night, missing matching content, and save failure.

The production character save and changelog are outside this change. No commit is created by this work.
