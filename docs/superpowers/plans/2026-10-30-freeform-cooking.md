# Freeform Cooking Implementation Plan

> For agentic workers: implement sequentially in E:/tonarium2. User's deferred-test policy overrides automatic test/build execution. Do not commit/deploy.

**Goal:** Most ingredient mixtures produce a dish; inedible/toxic/spoiled ingredients produce harmful food rather than rejecting the mixture.

**Architecture:** Keep registered recipes and their knowledge/tool requirements. Derive a bounded improvised recipe for other registered raw ingredients, preserve authoritative station/stock/fuel checks, and use registered food items for resulting lots. Toxic/inedible mixtures remain harmful even on successful cooking; failed edible cooking yields charred food. Consuming harmful dishes applies existing validated statuses and bounded fatigue, not new arbitrary saved effects.

**Tech stack:** Existing TypeScript shared engine/server action validation and React ingredient UI.

- [x] Add pure food catalog (meal, thin broth, gritty dish, toxic dish, charred dish), sensory descriptions and penalty metadata; register items without eager module cycles.
- [x] Broaden raw ingredients, derive finite amount/nutrition/duration/DC fallback, preserve explicit recipe validation and private workshop/closed kitchen restrictions. Reserve wood fuel separately from wood ingredients.
- [x] Produce food on failed cooking; keep harmful ingredients harmful and give only minor training/no successful quest credit for bad dishes. Preserve food lots, pending loot, cancellation and seed behavior.
- [x] Apply harmful-food use via existing poison/weakness statuses and bounded needs; show natural appearance/smell and localized effects. Do not let ageing erase penalties.
- [x] Update KO/EN/JA mixing UI and log messages. Write/update regression cases (do not run), document pending shared/server/UI/expiry/capacity verification.

Decisions: raw materials (including ores/wood/monster parts) are accepted; equipment, maps, books, bags and other finished tools are protected. Known recipes retain their learned-knowledge requirements. Improvised cooking does not grant their special buffs or bypass locked recipes. No new libraries, no Tonarium-wide changes.

Implementation and deferred regression writing complete. Tests/type/build/browser/review deliberately deferred per user instruction; no new passing verification claim.
