import { registerHooks } from 'node:module';

// Node の表示テストでは CSS を読み飛ばし、スタイルと操作はブラウザで確認する。
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', source: 'export {};', shortCircuit: true };
    return nextLoad(url, context);
  },
});
