import { join } from 'node:path';
import { aggregateChangelog, readFragments, root } from './changelog.mjs';

export function changelogPlugin(cwd = root) {
  const legacy = join(cwd, 'shared/changelog.ts').replaceAll('\\', '/');
  return {
    name: 'aggregate-changelog',
    transform(_code, id) {
      if (id.split('?')[0] !== legacy) return;
      this.addWatchFile(join(cwd, 'changelog'));
      this.addWatchFile(legacy);
      for (const filename of readFragments(cwd).keys()) this.addWatchFile(join(cwd, 'changelog', filename));
      return { code: `export const CHANGELOG = ${JSON.stringify(aggregateChangelog(cwd))};`, map: null };
    },
  };
}
