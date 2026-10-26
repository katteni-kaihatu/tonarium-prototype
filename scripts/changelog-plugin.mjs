import { join } from 'node:path';
import { aggregateChangelog, readFragments, root } from './changelog.mjs';

const normalized = value => value.replaceAll('\\', '/');

export function changelogPlugin(cwd = root) {
  const legacy = normalized(join(cwd, 'shared/changelog.ts'));
  const directory = normalized(join(cwd, 'changelog'));
  return {
    name: 'aggregate-changelog',
    configureServer(server) {
      server.watcher.add(directory);
      const update = filename => {
        const file = normalized(filename);
        if (!file.startsWith(directory + '/') || file.slice(directory.length + 1).includes('/') || !file.endsWith('.json')) return;
        const module = server.moduleGraph.getModuleById(legacy);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload', path: '*' });
      };
      for (const event of ['add', 'change', 'unlink']) server.watcher.on(event, update);
      server.httpServer?.once('close', () => {
        for (const event of ['add', 'change', 'unlink']) server.watcher.off(event, update);
      });
    },
    transform(_code, id) {
      if (normalized(id.split('?')[0]) !== legacy) return;
      this.addWatchFile(legacy);
      for (const filename of readFragments(cwd).keys()) this.addWatchFile(normalized(join(cwd, 'changelog', filename)));
      return { code: `export const CHANGELOG = ${JSON.stringify(aggregateChangelog(cwd))};`, map: null };
    },
  };
}
