# Fantasy Platform Authentication Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development and dispatching-parallel-agents for independent server, client and reset domains. Root integrates, reviews, verifies briefly and publishes the requested PR.

**Goal:** Remove the separate RPG-world login and use the authenticated Tonarium account. User explicitly approved discarding all old RPG accounts, characters, belongings and progression.
**Architecture:** Trust the account authenticated by Tonarium at WebSocket upgrade/hello, use its immutable account ID directly for RPG ownership, remove world-cookie/ticket/identity switching and the extra login UI. Run a narrowly scoped, atomic/idempotent one-time RPG reset before world stores start; never erase Tonarium users, auth DB, friends, DMs or other worlds. Keep gameplay and the new frontier/naval features.
**Tech Stack:** Existing React/TypeScript, Node/ws, upstream server/auth.ts and PostgreSQL-backed Tonarium login. No second identity provider or automatic legacy-account linking.
**Spec:** User request in this chat and explicit response: 기존 RPG 캐릭터·진행도도 초기화. The user wants a brief overall check and a PR. Do not run another long balance simulation.

## Tasks

- [x] Integrate current develop preserving both upstream authentication/storage and the pending RPG features; resolve conflicts and verify types.
- [x] Add one-time reset helper/tests: only RPG files and RPG-specific backups; marker written last, failure stops startup, repeat boots preserve new progress. No production data tooling actions from this session.
- [x] Replace server world-account binding with Tonarium-authenticated identity; reject unauthenticated/forged identities and obsolete account routes/tickets. Preserve trusted-proxy address semantics and private messages.
- [x] Remove client registration/login/recovery/account settings and old account-state gate; retain language choice, character creation and account-switch clearing. Three-language UI.
- [x] Update test fixtures and add focused auth/privacy/reset regressions; independent review of server/client and destructive scope.
- [x] Brief fresh validation: completion gate and selected auth/reset/frontier/naval/UI tests. Real PostgreSQL integration locally if available; otherwise use CI and disclose limitations.
- [x] Commit, push feature branch, create detailed develop PR; retain workspace and excluded scratch files.

## Ownership

Server implementer: server/index.ts authentication boundary, shared/protocol.ts legacy account messages, related account integration tests and test-only fixture helper updates. Client implementer: client account UI/gates/state and tests. Reset implementer: new server/fantasy-platform-reset.ts and tests, RPG backup adaptation, reset docs. Root: merge/package/dependencies, cross-cutting test registration, final checks, PR.

## Review focus

Browser-supplied hello IDs or obsolete world tickets never choose the owner. Same-site/cross-origin cookie behavior and logout/reconnect must not expose another user's RPG data. Tonarium account identity is unchanged on RPG entry/exit. Reset has an explicit allowlist and never repeats after the completed marker; crashes/failures must not let new progress be erased after serving users. Existing fixture saves must be deliberately marked current in tests rather than bypassing migration in production.

## Verification results

- Completion gate: passed (38 content documents, typecheck and production build).
- Selected GM/naval/frontier/equipment/reset/backups: 118/118.
- Client: 102/102; fantasy UI: 47/47.
- Actual PostgreSQL platform-auth integration: 16/16; independent auth/reset review: 30/30.
- Adapted generic gameplay fixtures: 135 unique cases passed across the original run and a full NPC rerun; the original run had one 10-second startup deadline failure, fixed by a 20-second readiness deadline. NPC rerun: 38/38.
- No production data reset or deployment performed in this session. Published as ready-for-review PR #391: https://github.com/katteni-kaihatu/tonarium-prototype/pull/391. No merge or deployment performed.

- PR CI found one missed Kokoa HTTPS test fixture; reproduced and fixed its current-data marker and entry assertions without weakening production checks. Kokoa16/16, NPC163/163, GM chat21/21 passed; final typecheck passed.

- Follow-up user instruction: PR #391 is now Draft and must remain Draft after updates. Added23 individually generated, style-corrected raster NPC portraits, preserved the original137, removed runtime SVG fallback; portrait22/22, client102/102, fantasy UI47/47 and completion gate passed. No merge/deployment.
