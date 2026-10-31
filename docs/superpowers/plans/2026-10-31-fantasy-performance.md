# RPG loading and server performance implementation plan

**Goal:** Improve RPG loading and measured server-side repeated computation without changing gameplay or authorization.
**Architecture:** Profile current Node workflows and browser build dependency sizes. Use request-local reuse for economy validation/quotes, compute only requested building stock, and lazy-load secondary RPG panels behind localized loading/error UI. Preserve all price, stock, freshness, permission and saved-data checks; no process-wide player caches.
**Execution:** Native in E:/tonarium2, current Draft PR391. User requested finishing the previously listed improvements and wants the actual results at the end.

## Constraints

- No balance, content, clock, reset marker, authentication, Kokoa provider or Tonarium host behavior changes.
- No new dependencies; keep unrelated previews and all current artwork/source records.
- Never use cached permission or mutable player state across requests. Inventory, local stock, prices and food freshness must reflect the current request.
- Keep menu/map/navigation available during secondary-panel loading; retain visible error recovery.
- Keep PR391 Draft. No merge or deploy.

## Tasks

- [x] Capture CPU profile and baseline: economy sync14.36ms, view35.96ms, validation542.82ms on the local benchmark; validation repeatedly rebuilds building stock. Timings are local samples, not production latency.
- [x] Record deterministic stock/economy output snapshots and add tests for immutable reads and refreshed state after changes.
- [x] Optimize requested-stock construction and per-shop validation; reuse request-local shop snapshots and compute each displayed quote once.
- [x] Measure build dependency sizes; defer secondary RPG UI with stable lazy declarations, localized fallback and existing error boundary.
- [x] Add a repeatable benchmark/report CLI; compare identical outputs, processing time and memory observations with the baseline.
- [x] Verify focused cases, shared logic, client/UI, dynamic import loading/failure recovery and required completion gate; read-only review.
- [x] Document actual measured outcomes, publish to the existing Draft PR and confirm its state.

## Review focus

Forged or mutated stock must still be rejected on every call. Requested stock and quote ordering must not change. Daily resets, discounts, freshness and location changes must not reuse previous requests. Lazy module failures must show a recovery path and not obscure map/navigation. Async panel loads must not expose prior account state or reset global conversation/progress state. Avoid initialization-order changes in the shared cyclic content catalog.

## Results

- The isolated previous shared-source fixture and optimized implementation produce identical hashes for all96 available shop lists and6 economy snapshots. No source fixture or profile data is persisted outside ignored QA files.
- Same Node24.22.1, GC flag, workload and6 samples: sync13.13→2.70ms; view42.31→7.63ms; validation504.82→7.20ms. Retained heap after forced GC28.6→27.9MB, a similar scale; peak RSS is not treated as proof of steady-state memory improvement.
- Initial additional RPG JS1,251,562→864,451 bytes, about31% less. Host initial static JS3,884,343→3,883,327 bytes; no RPG weight moved into host startup. Root RPG chunk134,415 bytes; some17 panel wrappers share15 dynamic targets.
- Client99, fantasy UI50, shared1411, server realm/conversation/backup41, new benchmark1 passed. Tool-inclusive typecheck and completion gate passed. Independent read-only review found no issues and independently reran all8 added tests.
- Browser verified16 menus, combat controls, three-language loading, pending-load ownership changes, synthetic rejection retry and real aborted module request retry. Initial combat/property/ranking UI fetches were absent. Map/navigation remained visible. Realm transport recheck passed.
- Temporary browser tab/server and temporary HTML entry points closed/removed. Reproduction harness and raw evidence remain under work/qa/fantasy-performance.

## Rulings

- Keep all gameplay, prices, stock ordering, validation and ownership checks. Cache only within the current function call; keep dynamic catalog lookups fresh between calls.
- Split error formatting and command transport out of heavy UI rather than altering global Vite chunk configuration or host behavior.
- The browser SSR loading-language test uses the project's existing useSyncExternalStore server-snapshot shim. Real browser language and retry behavior were checked separately.
- Real HTTP abort retry succeeded, so no automatic whole-page reload or additional recovery UI was introduced.
- Production multi-user load and AI inference latency remain deployment/log follow-ups; local operation timings do not represent them. Keep PR391 Draft, no merge/deploy.

- Final retry/reopen regression reproduced failure after successful retry, fixed shared code-type reuse across future mounts, and verified red/green with an actual aborted HTTP request. Follow-up independent review found no stale-account or race issue.
