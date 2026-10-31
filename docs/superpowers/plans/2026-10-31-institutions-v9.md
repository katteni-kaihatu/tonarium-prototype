# Institution Contracts and Party Progression Implementation Plan

> **For agentic workers:** Use subagent-driven-development for independent contribution/economy/underworld work; root integrates contracts, party accounting and persistence.

**Goal:** Separate contract institutions, provide priest/criminal growth and rewards, share party contract pay equally, and measure party contributions/economy.
**Architecture:** Canonical quest institution metadata and shared authorization; server-owned accepted grants and participation receipts; atomic profile/party pay settlement. Preserve current guild reinstatement behavior.
**Tech stack:** Existing TypeScript shared domain, Node persistence, React KO/EN/JA UI; no new dependencies or live services.
**Spec:** User approved recommendations 2–5, rejected changing recommendation 1. User explicitly requires equal pay for everyone in the participating party, regardless of profession.

## Constraints and decisions

- Work only in E:/tonarium2, preserve dirty work. No changelog edits, commits, PRs, deploy, live AI or production data.
- Main combat job and life subjob remain concurrent. Guild rank comes back immediately after changing to an allowed profession, as currently implemented.
- Formal guild claim requires an actual registered eligible adventurer. Temple claims belong to priests; underworld claims to criminal professions; resident requests are public. Shared party helpers may participate without acquiring a forbidden institutional rank.
- Equal pay uses authoritative participants at the shared scene, up to six; preserve total gold, distribute integer remainder deterministically (difference at most 1G). No duplicate contracts/claims, stale generations or offsite users.
- Main story progress remains personal. Existing accepted quests are not erased by this migration.
- Priest service rewards require real ally healing/protection/rescue, exclude self and owned units, and are capped per completed encounter. Criminal trust requires completed underworld contracts; no failed/cancelled/duplicate receipts.
- Japanese concise code comments; localized player-facing text. Keep UI compact and use actual NPC contacts/facilities.

## Tasks

- [ ] Root: classify guild/temple/underworld/personal quests; channel-specific publication, facility and job checks; direct-NPC and board parity.
- [ ] Underworld worker: finite authored contracts, persistent organization trust/merit, tier rewards, localized compact interface and tests.
- [ ] Root: authoritative shared-party contract attachment/participation and equal conserved pay; clergy service progression and atomic persistence.
- [ ] Contribution worker: actual damage/heal/mana/protection/control/rescue receipts, owned-unit attribution and optional result detail, real role samples.
- [ ] Economy worker: multi-player multi-day seasonal accounting simulation, idempotence/conservation probes, fix demonstrated defects.
- [ ] Root: migration/forgery/reload/save-failure/party composition tests, KO/EN/JA UI checks, content/type/build/completion, final review and handoff.

## Review focus

- Missing guild registration cannot be replaced by a default copper label or client-supplied job/source.
- A party change, new life or offsite account cannot collect a prior scene's pay; no multiplying full contract pay per companion.
- Contributions must distinguish effective ally assistance from self/summon farming and overhealing.
- Failing persistence must roll back all participants' money, merits, inventory and completion receipts together.
- Generated postings must remain globally deterministic per location/cycle and institution, independent of who views first.

## Ownership

Root owns shared/fantasy.ts, engine, store, contracts, institution module, integration and package registration. Agents own their named new modules and independent combat/economy code. Changes to shared owner files require coordination.

## Implementation record

- [x] Canonical institution policy and deterministic per-institution postings; actual guild registration; guild-only named commissions.
- [x] Eight temple contracts, sixteen underworld contracts, persistent trust/merit/rewards and actual allied-support clergy growth.
- [x] Shared accepted-party contract receipts; same-scene proof, full gold including bonus split equally, normal quest XP once, profession-specific merit separately.
- [x] Atomic save/retry, stale-link cleanup, generation ownership, absent/dead/abandoned/disbanded cases, guild raid consent and companion broadcasts.
- [x] Actual combat contribution totals and optional result detail; 144 actual battles; four seasonal 4-player 14-day economy simulations.
- [x] Institution and supporting-party UI in KO/EN/JA, persistent UI test command, integrated documentation.
- [x] Final completion gate and final NPC suite result recorded in integrated report: fantasy 1,832/1,832, NPC 160/160, final contract regressions 30/30, new UI 5/5, existing career UI 14/14, capability reference matches, completion gate exit 0.

Decisions: retain immediate historical guild reinstatement, keep individual main-story progress, retain earned pay for injured or temporarily remote same-party participants, permit signed same-scene sit-outs, exclude late arrivals and unmet non-job eligibility. No economy coefficient change was justified by reproduced defects. Live deployment, real AI and operating-server long-duration sessions remain outside this local task.
