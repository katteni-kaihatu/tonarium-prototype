// インストールできるようにするだけで、キャッシュはしない（更新がいつもすぐ届くように）。
// つながらないときと、デプロイ中で前段のプロキシがエラーを返すときだけ、ページの代わりに案内を出す
importScripts('/offline-locales.js');
const page = (kind, retry) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tonarium</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#EAE5DB;color:#26262E;font-family:sans-serif;text-align:center;padding:16px;box-sizing:border-box}p{color:#5E5C64;line-height:1.6}button{margin-top:16px;padding:10px 20px;border:0;border-radius:12px;background:#2F5FC4;color:#fff;font-size:15px}</style></head>
<body><div><img src="/brand/mark.png" alt="" width="56" height="56" onerror="this.remove()"><h1 style="font-size:20px"></h1><p></p><button onclick="location.reload()"></button></div>
<script>
const messages = ${JSON.stringify(self.TONARIUM_OFFLINE_LOCALES)};
const languageOf = (code) => typeof code === 'string' ? ['ja', 'en', 'ko'].find((language) => language === code.trim().toLowerCase().split(/[-_]/)[0]) : undefined;
let saved;
try { saved = localStorage.getItem('tonarium.language'); } catch {}
const language = languageOf(saved) || (navigator.languages?.length ? navigator.languages : [navigator.language]).map(languageOf).find(Boolean) || 'ja';
document.documentElement.lang = language;
const text = messages[language];
document.querySelector('h1').textContent = text.${kind};
document.querySelector('p').textContent = text.${kind}Body;
document.querySelector('button').textContent = text.reload;
</script>
${retry ? '<script>setTimeout(() => location.reload(), 5000)</script>' : ''}</body></html>`;
const OFFLINE = page('offline', false);
const MAINTENANCE = page('maintenance', true);
const html = (s) => new Response(s, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).then(
    // npm run dev の案内（503）はそのまま見せる
    (r) => ([502, 503, 504].includes(r.status) && !r.headers.has('X-Tonarium-Dev') ? html(MAINTENANCE) : r),
    () => html(OFFLINE),
  ));
});
