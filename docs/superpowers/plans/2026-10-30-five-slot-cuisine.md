# Five-slot cuisine and repeated production plan

User's latest correction: one cook uses at most FIVE material UNITS, each slot one unit (not five types times five). Free: three mandatory mains and up to two optional additions attached to distinct mains. Repeats consume one batch at each timed boundary and are limited by selected inventory or authorized local commercial warehouse stock. No tests/type/build/browser/review execution until user asks; write regression cases and backlog.

## Contract and decisions

- Shared action ingredients aggregate the one-unit slots; duplicates across slots are allowed. Add optional repeats/storage/mains/additions; exact role aggregation is validated. Existing saved envelopes remain readable, newly excessive selections reject before consumption.
- Repeated activity tracks completed batches with deterministic per-batch seeds. On cancel, missing source stock, lost permission or death, completed output remains and untouched materials remain at source.
- Warehouse stock is staged by server, including FIFO lot identity and preservation, with profile and property ledger committed atomically. Source is local commercial warehouse only; no remote/residential access through cooking.
- New content:48 five-distinct-ingredient fixed recipes,20 safe free families with3 foods each,2 hazardous families with3 foods each,19 pantry ingredients. Fixed and free catalogs are pure modules to avoid import initialization cycles. Exact free variant is rolled on server after ingredient selection, weights depend on additions and their main attachment.
- UI has fixed/free modes,5 unit selectors,3main+2addition selectors, repeat/max/source controls, candidate preview and KO/EN/JA text.

## Owners

- Root: shared cooking/core/progression and catalog registration, integration docs and written regression updates.
- Catalog agent: pure cuisine catalog and full Korean food list only.
- Server agent: warehouse staging adapter and atomic store integration only.
- UI agent: cooking component and its unexecuted tests only.

## Completion ledger

- [ ] Shared action limits/roles and ingredient classification/weighted candidates.
- [ ] Register pantry/fixed/free foods and recipe catalogs.
- [ ] Per-batch engine progress, cancellation, seed/reload, source context rollback.
- [ ] Warehouse authority/save transaction integration.
- [ ] Slot UI and source-based repeat maxima.
- [ ] Update written tests and documentation, clearly mark all current checks deferred.
