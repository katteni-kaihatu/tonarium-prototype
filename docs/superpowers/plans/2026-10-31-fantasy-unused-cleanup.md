# Fantasy unused-code cleanup implementation plan

**Goal:** Remove proven obsolete RPG assets and code while preserving current gameplay, identity, authorization and rendering.
**Architecture:** Keep the single raster portrait registry as the runtime source. Delete the obsolete SVG pipeline and unused shop/magic UI. Use compiler unused-symbol diagnostics and repository references to trim imports and pure calculations; retain command-line tools, test fixtures, cache retirement and migrations that still have external purposes.
**Execution:** Native in the existing PR391 branch, no parallel implementation. Existing user authorization covers cleanup and updating the existing Draft PR.

## Constraints

- Work in E:/tonarium2. Do not touch Tonarium host behavior, changelog files, authentication/reset rules, RPG balance or saved data.
- Preserve all160 current WebPs, their generation sources and prompts, and unrelated untracked local work.
- Keep PR391 Draft; no merge or deployment.

## Tasks

- [x] Audit tracked import references, compiler unused symbols and external script entry points.
- [x] Record baseline runtime/portrait behavior; replace retired SVG-only tests with raster identity, rendering and wardrobe coverage.
- [x] Remove obsolete160 SVGs, generator/renderers, obsolete portrait design table/wrapper and unused shop/legacy magic UI. Remove the permanent true gate and extension sniffing for the single WebP format.
- [x] Remove compiler-confirmed unused RPG imports and pure calculations; preserve hooks with required effects and public call signatures.
- [x] Verify focused tests, client/UI suites, relevant shared/server regressions and required completion gate. Review the final diff and size changes.
- [x] Document cleanup, commit/push to PR391, update detailed PR body, verify Draft state.

## Review focus

Unknown/prototype NPC IDs must never resolve inherited properties or an unrelated face. Missing images must still use initials. All160 image files and identity records must remain intact. Actual finite shop, circular rune UI, equipment, caches and reset behavior must remain connected. CLI diagnostics and balance simulations are externally invoked and must not be mistaken for dead modules.

## Results and rulings

- Only compiler-proven unused imports and inspected pure expressions were removed. Public unused argument slots and migration/cache cleanup remain because callers/older installations still rely on their contracts.
- Independent read-only review: no findings. Baseline portrait runtime cases passed before refactoring and still pass after removal.
- Focused19/19, client99/99, fantasy UI47/47, shared/fixtures1407/1407, GM/reset/cache38/38; completion gate passed. Existing large-chunk warning remains.
- Removed165 files including160 SVGs (822,543 bytes). All160 WebPs and their source/prompt records unchanged. Build artifacts contain only the current raster portraits.
- NPC chat production chunk27,337 to16,276 bytes; main RPG chunk1,231,736 to1,231,686 bytes. Uncompressed artifact comparison only; no claim of runtime latency/RAM improvements.
- Detailed publication and check evidence is retained under work/qa/fantasy-cleanup. PR391 remains Draft; no merge/deployment.
