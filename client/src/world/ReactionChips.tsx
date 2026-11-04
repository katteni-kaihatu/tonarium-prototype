import { t as tr } from '../i18n/index.ts';

export function ReactionChips({ reactions, self, names, react }: {
  reactions: Record<string, string[]>; self: string; names?: (ids: string[]) => string;
  react: (emoji: string, on: boolean) => void;
}) {
  return <>{Object.entries(reactions).map(([emoji, ids]) => {
    const on = ids.includes(self);
    return <button key={emoji} className={`tlrx ${on ? 'on' : ''}`} aria-pressed={on}
      aria-label={tr(on ? 'reactionRemove' : 'reactionAdd', emoji)} title={names?.(ids)} onClick={() => react(emoji, !on)}>
      <span>{emoji}</span><b>{ids.length}</b>
    </button>;
  })}</>;
}
