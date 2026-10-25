import { t as tr } from '../i18n/index.ts';
import { DICE_COLORS, DICE_MAX, DICE_SIDES, ROLL_MS, diceLabel } from '../../../shared/dice.ts';
import type { Item } from '../../../shared/items.ts';
import { nameOf } from '../store.ts';
import { isRolling, rollDice, rollElapsed, setDiceSettings, useDiceSettings, useRollResults, useRollTick } from '../items/dice.ts';

/** 転がっている間に見せる目。全員だいたい同じものが見えるよう、経過時間から決める */
const flicker = (elapsed: number, i: number, sides: number) => ((Math.floor(elapsed / 80) * 7919 + i * 104729) % sides) + 1;

export function DiceBody({ item, interactive }: { item: Item & { kind: 'dice' }; interactive: boolean }) {
  const st = useDiceSettings();
  const results = useRollResults(item.roll);
  useRollTick(item);
  const roll = item.roll;
  const rolling = isRolling(roll);
  const elapsed = roll ? rollElapsed(roll) : 0;
  const total = results?.reduce((a, b) => a + b, 0);
  return (
    <div className="dicewin">
      <div className="dicetray" aria-live="polite">
        {roll
          ? Array.from({ length: roll.count }, (_, i) => (
            <span
              key={`${roll.id}-${i}`} className={`die2d d${roll.sides} ${rolling ? 'spin' : ''}`}
              style={{
                background: DICE_COLORS[roll.sides].bg, color: DICE_COLORS[roll.sides].ink,
                // 途中から開いた人も同じところから回って見えるよう、経過分だけ進めておく
                animationDuration: `${ROLL_MS - i * 60}ms`, animationDelay: `${-elapsed}ms`,
              }}
            >
              <b>{rolling ? flicker(elapsed, i, roll.sides) : results ? results[i] : '？'}</b>
            </span>
          ))
          : <span className="sub">{tr("ui561")}</span>}
      </div>
      <div className="dicesum">
        {!roll ? tr("ui562")
          : rolling ? tr("ui482", nameOf(roll.by), diceLabel(roll.sides, roll.count))
          : results ? <><b>{nameOf(roll.by)}</b>：{diceLabel(roll.sides, roll.count)} = <b className="dtotal">{total}</b>{roll.secret && <span className="sub">{tr("ui563")}</span>}</>
          : <><b>{nameOf(roll.by)}</b> {tr("ui564")}{diceLabel(roll.sides, roll.count)} {tr("ui565")}</>}
      </div>
      {interactive && (
        <>
          <div className="dicesides" role="radiogroup" aria-label={tr("ui566")}>
            {DICE_SIDES.map((n) => (
              <button key={n} role="radio" aria-checked={st.sides === n} className={`ib dside ${st.sides === n ? 'on' : ''}`} onClick={() => setDiceSettings({ sides: n })}>d{n}</button>
            ))}
          </div>
          <div className="dicerow">
            <span className="dcount" role="group" aria-label={tr("ui567")}>
              <button className="ib" aria-label={tr("ui568")} disabled={st.count <= 1} onClick={() => setDiceSettings({ count: st.count - 1 })}>−</button>
              <b>{st.count}{tr("ui569")}</b>
              <button className="ib" aria-label={tr("ui570")} disabled={st.count >= DICE_MAX} onClick={() => setDiceSettings({ count: st.count + 1 })}>＋</button>
            </span>
            <label className="dsecret" title={tr("ui571")}>
              <input type="checkbox" checked={st.secret} onChange={(e) => setDiceSettings({ secret: e.target.checked })} />{tr("ui572")}</label>
            <button className="primary droll" disabled={rolling} onClick={() => rollDice(item.id)}>{diceLabel(st.sides, st.count)} {tr("ui573")}</button>
          </div>
        </>
      )}
    </div>
  );
}
