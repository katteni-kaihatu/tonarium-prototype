# Seasonal Equipment and Visible Status Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for this inline implementation.

**Goal:** Weather-appropriate clothes/tools, meaningful unprotected exposure and visible current buffs/debuffs.
**Architecture:** Extend existing outfit values and add passive weather-tool metadata; derive one authoritative exposure breakdown for checks, camp recovery and UI. Reuse existing ward-seal/tarp/bedroll/hearth instead of parallel item systems. Derive live status rows, never persist calculated weather debuffs.
**Tech Stack:** Existing TypeScript shared engine, React, KO/EN/JA; no dependency or AI changes.
**Spec:** User request in this chat: cold-enchanted summer tools, warmth/fire winter tools, umbrellas and camp wards against rain, penalties and stat-area hover explanations. Existing authorization covers implementation and verification.

## Design decisions

Clothes must actually be worn and owned. Ordinary/magic weather tools work while carried, using only the strongest tool per protection axis plus the worn outfit. Camp-only items never protect field exploration. A ward remains until its existing attack-triggered consumption, and shields rain only during camp. Existing global time determines seasons/weather. Climate penalties use current capped check penalties; weather also reduces camp fatigue recovery. Warm outfits add heat burden in hot climates. Indoor facilities/dungeon interiors avoid outside rain/temperature exposure; city outdoor camping remains exposed. Current benefits/debuffs include weather, timed effects, action buff, hunger/fatigue and current battle conditions where available.

## Review focus

Unowned or merely carried clothes; tool stacking; consumed/sold wards; rainy nights and six-hour weather transitions; world-hour/UI consistency; over-hot winter wear; camp-only gear outside camp; old saves; keyboard/touch tooltip access and clipping; all three languages.

- [x] Write failing environment and gear tests, including four seasons, actual equip/use/purchase and camping integration.
- [x] Add data and metadata; centralize protection/exposure evaluation; connect penalty and camp recovery to it.
- [x] Write failing live-status tests; implement localized descriptions and a stat-area tooltip component.
- [x] Run focused regressions, full fantasy suite, relevant NPC/UI regressions and mandatory completion gate.
- [x] Update feature docs, README, handoff and evidence.

No commits, PR, deployment or production data changes. Preserve existing dirty work. No changelog edits.

## User steering incorporated

Allow wear/equip/unequip during active travel without changing route, arrival, costs or activity seed; retain other activity/combat restrictions and bag checks. Preserve fatigue/hunger gauges and show debuffs only at actual penalty thresholds 50/70/90. Group current effects into buffs/debuffs. Human darkness check penalties become 4/3/2/1 for no light/loan lantern/normal lantern/advanced lamp; tool illumination never removes darkness entirely. Natural night-vision traits retain their existing exemption; covert criminal work retains a smaller baseline.

Completion: full fantasy 1,852/1,852, NPC 160/160, UI 30+6, browser 30 scenarios, completion gate exit 0. No deployment. Temporary preview server stopped. Evidence and final scope are in docs/fantasy-weather-equipment-2026-10-31.md.
