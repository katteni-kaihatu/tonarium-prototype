import type { FantasyAction, FantasyProfile } from '../../../shared/fantasy.ts';
import { fantasyRetreatByLocation } from '../../../shared/fantasy-retreats.ts';
import { useLocale } from '../locale.ts';
import { ReasonButton } from './FantasyActionButton.tsx';

export function FantasyRetreatPanel({ profile, onAction, blocked = false }: {
  profile: FantasyProfile;
  onAction: (action: FantasyAction) => void;
  blocked?: boolean;
}) {
  const [locale] = useLocale(), c = profile.character;
  const say = (ko: string, en: string, ja: string) => ({ ko, en, ja })[locale];
  const retreat = c && fantasyRetreatByLocation(c.location);
  if (!c || !retreat || profile.death) return null;
  const unavailable = blocked ? say('앞선 요청을 처리하고 있습니다.', 'The previous request is being processed.', '直前の依頼を処理中です。')
    : profile.activity || profile.combatId || profile.event || c.travelPosition ? say('진행 중인 활동을 마친 뒤 야영할 수 있습니다.', 'Finish your current activity before camping.', '現在の活動を終えると野営できます。')
    : c.hp <= 0 || c.downed ? say('의식을 되찾은 뒤 쉴 수 있습니다.', 'Recover consciousness before camping.', '意識を取り戻すと休めます。') : undefined;
  const memories = [...(c.retreatMemories ?? [])].reverse();
  return <section className="fr-card" aria-label={say('휴양과 추억', 'Retreats and memories', '休養と旅の思い出')}>
    <h3>{retreat.location.names?.[locale] ?? retreat.location.name}</h3>
    <p>{retreat.location.descriptions?.[locale] ?? retreat.location.description}</p>
    <p>{say('마물이 없는 안전한 휴양지입니다. 풍경을 즐기며 동료와 느긋하게 쉬세요.', 'This is a safe retreat with no monsters. Enjoy the scenery and unwind with your companions.', '魔物のいない安全な休養地です。景色を楽しみ、仲間とゆっくり過ごせます。')}</p>
    <ReasonButton type="button" className="fr-btn" disabled={!!unavailable} reason={unavailable} onClick={() => onAction({ type: 'rest' })}>
      {say('풍경을 보며 야영', 'Camp by the scenery', '景色を眺めて野営')} · {say('8시간 · 무료', '8 hours · Free', '8時間・無料')}
    </ReasonButton>
    <p className="fr-muted">{say('동료와 같은 장소에서 야영을 마치면 하루에 이곳의 추억 하나를 남깁니다. 추억은 함께한 이름을 간직하며 능력치나 경험치를 주지 않습니다.', 'Complete a camp with companions here to keep one memory of this place per day. Memories preserve the names of those present and award no stats or experience.', '同じ場所にいる仲間と野営を終えると、一日に一つ、この場所の思い出を残せます。一緒に過ごした名前を記録し、能力値や経験値は増えません。')}</p>
    <details>
      <summary>{say('이번 생의 여행 추억', 'Memories of this life', 'この生の旅の思い出')} · {memories.length}</summary>
      {memories.length ? <ol>{memories.map(memory => {
        const site = fantasyRetreatByLocation(memory.location);
        return <li key={memory.id}>
          <p><b>{site?.location.names?.[locale] ?? site?.location.name ?? memory.location}</b> · {say(`${memory.day + 1}일째`, `Day ${memory.day + 1}`, `${memory.day + 1}日目`)}</p>
          <p>{memory.characterName} · {memory.companions.map(person => person.name).join(' · ')}</p>
          {site && <p className="fr-muted">{site.moments[locale]}</p>}
        </li>;
      })}</ol> : <p className="fr-muted">{say('아직 함께 남긴 추억이 없습니다. 같은 장소의 동료들과 야영을 마치면 여기에 남습니다.', 'No shared memories yet. Complete a camp with companions at this place to keep one here.', '一緒に残した思い出はまだありません。同じ場所の仲間と野営を終えると、ここに記録されます。')}</p>}
    </details>
  </section>;
}
