import type { SystemManifest, SystemMap } from '../../../shared/system-types.ts';

export function catalogExampleMap(manifest: SystemManifest): SystemMap {
  const objects: SystemMap['objects'] = [], bindings: Record<string, string[]> = {};
  for (const [role, target] of Object.entries(manifest.targets)) {
    const id = `target-${objects.length + 1}`;
    bindings[role] = [id];
    objects.push({ id, capabilities: [...target.capabilities], position: [objects.length * 2, 0, 0] });
  }
  return { schema: 1, id: 'my-map', objects, systems: [{ instanceId: 'example-system', systemId: manifest.id, bindings, config: Object.fromEntries(Object.entries(manifest.config).map(([key, field]) => [key, field.default])) }], connections: [] };
}

export function catalogExampleCode(manifest: SystemManifest): string {
  const map = catalogExampleMap(manifest), json = (value: unknown) => JSON.stringify(value, null, 2);
  return `import { createSystemMap } from './shared/system-map.ts';\n\nexport const myMap = createSystemMap('${map.id}')\n${map.objects.map(object => `  .object(${json(object)})\n`).join('')}  .system(${json(map.systems[0])})\n  .build();`;
}
