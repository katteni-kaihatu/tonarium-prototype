import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const server = await createServer({
  configFile: false, root: '.', envDir: false, publicDir: 'client/public',
  plugins: [react()], optimizeDeps: { entries: ['scripts/fixtures/map.html'] },
  server: { host: '127.0.0.1', port: 5194, strictPort: true,
    fs: { deny: ['**/.env', '**/.env.*', '**/.git/**', '**/*.{crt,pem,key}', '**/data/**', '**/work/**'] } },
});
await server.listen();
console.log('Map fixture: http://127.0.0.1:5194/scripts/fixtures/map.html');
