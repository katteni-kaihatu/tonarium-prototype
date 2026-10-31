interface PlatformAccount { id: string; kind?: string }

export function fantasyPlatformAuthorized(account: PlatformAccount | null, id: string | null, world: string | undefined): boolean {
  return !!account && account.id === id && world === 'fantasy';
}

export function platformSocketOriginAllowed(origin: string | undefined, expected: string, site: string | undefined): boolean {
  return site !== 'cross-site' && (origin === undefined || origin === expected);
}
