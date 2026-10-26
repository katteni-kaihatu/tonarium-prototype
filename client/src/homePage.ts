const pages = ['home', 'timeline', 'friends', 'sessions', 'events', 'groups', 'group', 'worlds', 'items', 'market', 'changelog', 'sounds', 'emotes'] as const;
export type HomePage = typeof pages[number];

export function homePageOf(value: unknown): HomePage {
  return typeof value === 'string' && pages.includes(value as HomePage) ? value as HomePage : 'home';
}

export function storedHomePageOf(value: unknown): HomePage {
  const page = homePageOf(value);
  return page === 'group' ? 'groups' : page;
}
