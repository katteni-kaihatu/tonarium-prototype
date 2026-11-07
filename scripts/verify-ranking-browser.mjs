import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

// 実データや接続先を使わず、ランキングと研究所パネルを確認する。
const server = await createServer({
  configFile: false,
  root: '.',
  envDir: false,
  cacheDir: '.local/ranking-vite-cache',
  plugins: [react()],
  optimizeDeps: { entries: ['scripts/fixtures/ranking.html'] },
  server: { host: '127.0.0.1', port: 5193, strictPort: true, fs: { deny: ['**/.env', '**/.env.*', '**/.git/**'] } },
});
await server.listen();
console.log('Ranking fixture: http://127.0.0.1:5193/scripts/fixtures/ranking.html');
