import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changelogPlugin } from './scripts/changelog-plugin.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function allowedHosts(value: string | undefined): string[] | true {
  const list = (value ?? '.trycloudflare.com').split(',').map((s) => s.trim()).filter(Boolean);
  return list.includes('*') ? true : list;
}

export default defineConfig(({ mode }) => {
  // root は client/ だが .env はサーバーと同じリポジトリ直下にある
  const env = loadEnv(mode, ROOT, '');
  // ワークツリーを並べて動かすときは .env でポートをずらす
  const api = `localhost:${env.SERVER_PORT || 3001}`;
  return {
    root: 'client',
    // .env の変更でも再起動させる。クライアントに渡るのは VITE_ 付きだけ
    envDir: ROOT,
    plugins: [
      react(),
      changelogPlugin(ROOT),
      // 開発中は相対 URL のままにする（本番はサーバーが __ORIGIN__ を埋める）
      { name: 'dev-origin', apply: 'serve', transformIndexHtml: (html: string) => html.replaceAll('__ORIGIN__', '').replaceAll('__VERSION__', '') },
    ],
    build: { outDir: 'dist', emptyOutDir: true },
    server: {
      port: Number(env.CLIENT_PORT || 5173),
      allowedHosts: allowedHosts(env.ALLOWED_HOSTS),
      proxy: {
        '/sync': { target: `http://${api}`, ws: true },
        '/token': `http://${api}`,
        '/icon': `http://${api}`,
        '/group-image': `http://${api}`,
        '/avatar': `http://${api}`,
        '/profile': `http://${api}`,
        '/report': `http://${api}`,
        '/ogp': `http://${api}`,
        '/api': `http://${api}`,
        '/media': `http://${api}`,
        '/ws': { target: `ws://${api}`, ws: true },
      },
    },
  };
});
