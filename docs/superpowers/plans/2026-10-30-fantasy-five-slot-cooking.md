# Five-slot cooking implementation plan

User-approved scope: one ingredient unit per slot; three free-cooking mains and up to two distinct-main additions; five-unit fixed recipes; repetition count bounded by selected inventory or authorized local business warehouse. Name all new outputs in KO/EN/JA, with grounded fixed dishes and humorous improvised dishes. Implement in E:/tonarium2; no deployment or production-data changes.

- [x] Pure localized catalog: 48 fixed foods, 20 safe families × 3 candidates, 2 harmful families × 3 candidates, 19 raw foods; synchronize full combination list.
- [x] Per-unit input aggregation, duplicate materials, addition attachments and weighted candidates, fixed profession/knowledge constraints, repeat cap and fuel accounting.
- [x] Completion-boundary settlement, persisted per-repetition seed/progress, cancellation keeping completed outputs, source rollback and capacity behavior.
- [x] Warehouse authority: local permissions, original food-lot preservation, source contention, staged NPC/property settlement, private updated stock publishing.
- [x] Five-slot UI, source/repeat selection and activity progress; route other existing food professions through same controls.
- [x] Individual localized food names and documentation; write regression cases.
- [x] User requested verification: full RPG 1,584/1,584, NPC159/159, completion/type/build pass, browser12/12 and shared warehouse WS pass; independent review completed. See [verification and remaining scope](../../fantasy-cooking-validation-2026-10-30.md).

[Current implementation and pending verification](../../fantasy-five-slot-cooking.md). [Full dish list](../../fantasy-cuisine-expanded-list.md).
