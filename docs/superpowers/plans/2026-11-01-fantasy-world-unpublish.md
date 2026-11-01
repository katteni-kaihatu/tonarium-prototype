# Fantasy World Unpublish Implementation Plan

**Goal:** Preserve a verified local development snapshot, then withdraw the RPG world from Tonarium without disrupting other worlds.

**Architecture:** Retain compatibility metadata and source, remove published entry points, and stop the RPG runtime's persistence and requests. Do not delete operational data or back it up.

**Spec:** `docs/fantasy-world-unpublish.md`; explicitly authorized by the user's request to back up the current version and remove the world.

- [x] Archive current tracked source/assets plus untracked preview source, excluding saves, logs and secrets; verify every archived SHA-256.
- [x] Add failing regression checks for world availability, old attachments and dormant runtime persistence.
- [x] Remove published catalog/prototype/render entry points and reject stale requests; exclude existing RPG sessions.
- [x] Stop RPG loading, clock, backups and diagnostics while preserving non-RPG behavior.
- [x] Verify retirement and general world/session behavior, run completion gate, and review diff.
- [x] Commit and create a separate PR against current develop; report deployment boundary and backup path.

Ruling: PR #391 is already merged. Use a new branch from current develop, leaving the original game development branch intact.

Published as PR #402: https://github.com/katteni-kaihatu/tonarium-prototype/pull/402 (open, ready for review). Production merge and redeployment remain with the operator; no live server change was made from this workspace.
