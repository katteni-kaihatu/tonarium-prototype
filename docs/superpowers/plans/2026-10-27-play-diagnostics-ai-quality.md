# Play diagnostics and dialogue quality implementation plan

> **For agentic workers:** Use subagent-driven-development for the independent logger, prompt-quality and boundary-test tasks. Root owns index integration and final verification.

**Goal:** Record real RPG play for later operator diagnosis, improve grounded NPC/GM answers, and run feasible predeployment tests.

**Architecture:** Keep diagnostics outside gameplay persistence in private bounded JSONL files. Observe authorized RPG messages and profile transitions, and export readable conversations only through an explicit offline operator CLI. Select relevant authoritative dialogue premises and diagnose narrow generated-answer problems without adding a second model call to every request.

**Tech stack:** Existing Node24/TypeScript server, React client, native file APIs, node:test, existing Qwen3-1.7B runtime and Playwright MCP. No new dependencies.

**Authorized choices:** The user requested server records and selected all GM/NPC dialogue capture. Defaults are all dialogue,14days,4MiB files/64MiB total,1024 queued events. Authentication payloads, passwords, cookies, tickets, recovery codes, private profiles and friend messages are not logging inputs. Actor/session/request identifiers are hashed. Redaction of recognizable secrets inside free speech is additional protection, not a guarantee of detecting arbitrary private content.

## Global constraints

- Preserve actual `data/fantasy.json` SHA256 `27d18a0cfa83e6ec8c6f8b25f7808af5f461e637051b08642c9c4410ed128374`.
- All verification uses temporary storage and owned temporary processes; shut them down afterward.
- Keep Tonarium common UI intact. No commit, push, merge or external deployment.
- Build into `work/`, then preserve existing hashed assets when applying the checked build.
- Never claim prepared responses or scripted fixtures are genuine model-quality evidence.

## Tasks

- [x] Private JSONL writer and read-only report/conversation CLI: `server/fantasy-diagnostics.ts`, tests, `scripts/fantasy-diagnostics.ts`, documentation. Verify fail-open behavior, bounded queue/rotation, key privacy, redaction, filters and escaped offline HTML.
- [x] Safe profile/combat observer: `server/fantasy-play-observer.ts` and tests. Verify delivery dedupe, new rolls/work steps, state deltas/death and bounded actor memory without storing full game state.
- [x] Request/reply observer and `server/index.ts` integration. Verify all canonical/generated/busy/cancelled dialogues, reconnects and action outcomes; no common-home chat or account credentials.
- [x] AI premises/prompt improvements and narrow quality flags. Reproduce the known age/weather and GM-style failures with tests, preserve secret/action boundaries and context budgets, then rerun genuine model samples.
- [x] Production static-file containment fix. Real fake-canary HTTP red reproduced sibling prefix escape; helper tests and actual post-fix paths verify containment, malformed encoding handling and symlink rejection.
- [x] New predeploy reverse-proxy, WSS, Vite private-file and account persistence failure checks with fake data only.
- [x] Run relevant full regression suites, typecheck, staged build, isolated browser/operator checks and bounded real-model comparison. Record remaining semantic issues and unavailable infrastructure honestly.

## Review focus

1. Raw dialogue never bypasses the transcript mode, redaction, bounds or offline-operator-only boundary.
2. A logging disk failure or queue overload cannot reject or roll back a valid game action.
3. A stale/revoked conversation cannot attach another account's answer or inventory to the log entry.
4. Relevant compound/coats/outdoor questions retain useful live premises while unrelated age questions omit weather/menu noise.
5. Genuine generated quality, diagnostic flags and canonical responses remain distinct in evidence.

## Outcome

All planned implementation and feasible verification steps completed. Root ran 1,278 regression tests, 43 overlapping final prompt tests, typecheck and staged build. Actual boundary checks passed: proxy/storage 15, static serving 8, log integration 10, Vite privacy 3. Independent review found a stale reply correlation bug; a failing reproduction, invocation token fix and actual NPC/GM reused-ID cases now pass. Genuine inference in 12 initial and 6 final samples shows scoped improvement but remaining semantic/persona weaknesses; no overall quality certification. Docker, physical devices and long play remain untested as documented. Actual save unchanged, no actual account or log created, temporary servers/model stopped. Checked client assets were already identical, so no files required copying. See docs/fantasy-predeploy-diagnostics-validation.md and work/qa/diagnostics-complete.json.
