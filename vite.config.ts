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
  const playtest = process.env.VITE_SYSTEM_PLAYTEST === '1';
  const env = playtest ? process.env : loadEnv(mode, ROOT, '');
  // ワークツリーを並べて動かすときは .env でポートをずらす
  const api = `${process.env.VITE_SYSTEM_PLAYTEST === '1' ? '127.0.0.1' : 'localhost'}:${env.SERVER_PORT || 3001}`;
  return {
    root: 'client',
    // .env の変更でも再起動させる。クライアントに渡るのは VITE_ 付きだけ
    envDir: playtest ? false : ROOT,
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
      fs:{deny:['**/.env','**/.env.*','**/*.{crt,pem,key}','**/.git/**','**/data/**','**/work/**','**/fantasy-backups/**','**/fantasy-diagnostics/**','**/.actor-key','**/fantasy-accounts.json','**/fantasy.json','**/fantasy-clock.json','**/fantasy-community.json','**/fantasy-contracts.json']},
      proxy: {
        '/sync': { target: `http://${api}`, ws: true },
        '/token': `http://${api}`,
        '/icon': `http://${api}`,
        '/group-image': `http://${api}`,
        '/timeline-image': `http://${api}`,
        '/avatar': `http://${api}`,
        '/profile': `http://${api}`,
        '/report': `http://${api}`,
        // 文字列の書き方だと Host がサーバー側に書き換わる。ログインは Origin と Host を突き合わせ、Misskey の戻り先もこの Host で作るので残す
        '/auth': { target: `http://${api}` },
        '/ogp': `http://${api}`,
        '/api': `http://${api}`,
        '/system-originals': `http://${api}`,
        '/shared-originals': `http://${api}`,
        '/media': `http://${api}`,
        '/objects': `http://${api}`,
        '/ws': { target: `ws://${api}`, ws: true },
      },
    },
  };
});
