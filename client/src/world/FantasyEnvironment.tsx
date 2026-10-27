import type { FantasyCharacter } from '../../../shared/fantasy.ts';
import { fantasyEnvironment } from '../../../shared/fantasy-environment.ts';
import { useLocale } from '../locale.ts';
export function FantasyEnvironment({c}:{c:FantasyCharacter}) {
  const [locale]=useLocale();const e=fantasyEnvironment(c);
  const seasons={ko:{spring:'봄',summer:'여름',autumn:'가을',winter:'겨울'},en:{spring:'Spring',summer:'Summer',autumn:'Autumn',winter:'Winter'},ja:{spring:'春',summer:'夏',autumn:'秋',winter:'冬'}}[locale];
  const weather={ko:{clear:'맑음',cloudy:'흐림',rain:'비',snow:'눈'},en:{clear:'Clear',cloudy:'Cloudy',rain:'Rain',snow:'Snow'},ja:{clear:'晴れ',cloudy:'曇り',rain:'雨',snow:'雪'}}[locale];
  const feel=e.temperature<5?{ko:'추움',en:'Cold',ja:'寒い'}:e.temperature>29?{ko:'더움',en:'Hot',ja:'暑い'}:{ko:'온화함',en:'Mild',ja:'穏やか'};
  return <div className="fr-environment"><span>{e.night?'☾':'☀'} {seasons[e.season]} {e.seasonDay}/15</span><span>{{clear:'☀',cloudy:'☁',rain:'☂',snow:'❄'}[e.weather]} {weather[e.weather]} · {feel[locale]}</span></div>;
}
