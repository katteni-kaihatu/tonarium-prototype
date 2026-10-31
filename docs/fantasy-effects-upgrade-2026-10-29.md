# Elemental and miracle effects — 2026-10-29

`FantasyElementMiracleEffects.tsx` provides two SVG components for the tactical board's existing `viewBox="0 0 1000 800"`. The module imports its own scoped stylesheet, `fantasy-element-miracle-effects.css`. Neither component renders a text banner, announcement, or quotation; the parent presentation component controls those separately.

```tsx
<FantasyElementEffects
  kind="fire" // fire | frost | storm | poison | alchemy | water | earth | wind | star
  source={{ x: 150, y: 400 }}
  target={{ x: 650, y: 400 }}
  tier={4}
  durationMs={1200}
  seed="battle-id:event-id"
/>

<FantasyMiracleEffects
  id="miracle-last-dawn"
  source={{ x: 150, y: 400 }}
  target={{ x: 500, y: 400 }}
  tier={6}
  durationMs={4000}
  seed="battle-id:event-id"
/>
```

Both exports accept `source`, `target`, `tier`, `durationMs`, and `seed`. Coordinates use SVG view-box units. Tier is bounded to 1–6 and increases detail, particle counts, and elemental footprint. Duration is supplied by the replay owner; CSS phases and delays scale from `--fr-fx-duration`. A deterministic seed places particles consistently across rerenders. Each mounted component uses unique SVG gradient IDs, so simultaneous effects do not reuse another effect's definitions. No runtime randomness is used.

## Element silhouettes

| Kind | Distinct presentation |
| --- | --- |
| Fire | Curved heat trail, layered rising flame tongues, warm ground glow, upward embers, and a pressure ring at higher tiers |
| Frost | Crystalline spears growing from the ground, faceted internal edges, a frost sigil, and scattered ice shards |
| Storm | A branching source-to-target lightning path, a pale core, diffuse halo, spreading angular arcs, and electric particles |
| Poison | Layered translucent vapor, a spreading pool, vapor curls, and rising outlined bubbles |
| Alchemy | A glass flask travelling along a curved path, a distinct liquid reaction, alchemical geometry, glass shards, and reaction bubbles |
| Water | A cresting wave, spreading elliptical ripples, a second surge at higher tiers, and droplets that rise and fall |
| Earth | Ground cracks spreading before faceted stones erupt, with a low dust ring and scattered rock fragments; no projectile trail |
| Wind | Curved travelling ribbons, rotating crescent blades, a spiral vortex, and drifting motes |
| Star | A small linked constellation, converging starlight motes, and a descending central star strike |

## Miracle silhouettes

| Skill ID | Distinct presentation |
| --- | --- |
| `miracle-soul-anchor` | A settling anchor, tether lights, and a translucent aegis |
| `miracle-sacred-severance` | A diagonal cleaving seal and chain halves separating in opposite directions |
| `miracle-return-lantern` | A suspended lantern within a tall elliptical portal and trailing lights |
| `miracle-divide-calamity` | A small protected tile and shield dividing an approaching wave into two paths |
| `miracle-burden-wounds` | Red wound threads travelling toward the caster while golden stitches close on the target |
| `miracle-unfailing-cup` | A chalice, ascending mana streams, and pale blue bubbles |
| IDs containing `rekindle` | A small rising phoenix and a separate life flame |
| `miracle-last-dawn-awakening` | A restrained halo and a small promising star |
| `priest-*` and other holy skills | Compact radial holy rays and sparks, distinct from the named miracle silhouettes |
| `miracle-last-dawn` | Battlefield-wide translucent aurora, distributed light pillars, dawn rays, a large celestial ring, a rising sun motif, and feather motes |

Last Dawn uses the full 1000×800 field instead of a single target tile. Its broad gradients remain translucent, preserving the board beneath the effect. At tier 6 it has 34 feather motes and 12 constellation stars; these remain below the 48-particle cap. Other elements and miracles also keep particle counts bounded. Pillars, rings, shields, crystal spears, and similar structural geometry are separate from motes.

Reduced-motion CSS disables animation and travelling objects while retaining static silhouettes. The parent must keep this SVG visible in reduced-motion mode; an older parent rule that hides every `.fr-combat-effects svg` would hide these static motifs too.

This module changes presentation only. Skill availability, tier assignment, event timing, target selection, and Last Dawn's gameplay-wide area are determined by the parent and shared combat rules.

## Verification deferred

No tests, typecheck, build, browser inspection, completion check, or QA were run for these files, following the user's instruction to finish implementation first. This includes the water, earth, wind, and star extension for tide, stone, gale, and star magic. Deferred cases include each elemental kind at tiers 1 and 6, each named miracle, ordinary priest light, awakening versus Last Dawn, multiple simultaneous effects with distinct SVG definitions, long and short source-to-target paths, reduced-motion settings, and board readability during full-field Last Dawn.
