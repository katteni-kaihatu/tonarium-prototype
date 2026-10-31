# Tactical carrying controls

The main player's combat actions include **부축 / Carry / 運ぶ**. Selecting it highlights eligible downed allies on the battlefield. Eligibility comes from the shared order validator, including adjacency, patient type, and whether someone is already carrying the patient. Summoned units are not patients. Troops and syndicate companions can be selected when injured.

Patient badges remain available when a living fighter occupies the same tile. If several patients share a tile, press the badge again to cycle through eligible patients. The selected patient's name, HP, and MP appear in the action sidebar. Keyboard users can focus and activate the same badge; its accessible label includes the full names and selection instruction.

When the selected player carries someone, the action changes to **내려놓기 / Put down / 降ろす**. For a patient in this battle, choose a highlighted empty adjacent tile or confirm without a tile and let the server choose an available adjacent tile. **Choose automatically** clears an explicit tile selection. An already carried patient from outside combat needs no battlefield tile.

The fixed-height battlefield guide shows the carried patient's name, or an outside-combat patient label when the snapshot contains only an external reference. It explains the halved movement range and unavailable movement skills. Movement skills have a localized disabled reason. Normal movement range comes from the shared movement rules. Units and the escort wagon do not receive Carry or Put down controls.

Carried patient badges follow their carrier's animated position. A patient does not cover the carrier's token. Downed troops and syndicate companions remain visible as patients after the round is resolved. Carrying changes neither the map's position nor the reserved height of its replay status row. Orders, placement, movement penalties, and patient state remain server-authoritative.

`FantasyTacticalBoard` accepts optional `selectedTargetId` and `tileLimit` props. `tileLimit={1}` restricts put-down selection to empty adjacent cells. Target IDs come from the panel's legal target list, and patient buttons call the existing `onTarget` callback. No new transport message is needed: the panel submits `{ type: 'carry', target }` or `{ type: 'putDown', tile? }` through the existing combat order transport.

## Verification deferred

The user explicitly requested implementation before verification. No tests, typecheck, build, completion check, browser inspection, or QA were run for this work.

Deferred cases: picking up a downed player, an injured troop, and an injured syndicate companion; excluding summons and patients held by another carrier; selecting a patient under a living fighter; cycling multiple patients on one tile; automatic and explicit adjacent placement; occupied or blocked placement; no available adjacent tile; external carrying; halved ordinary movement; blocked movement skills; switching the command actor; carried patient animation; keyboard activation; reduced-motion settings; and Korean, English, and Japanese labels.
