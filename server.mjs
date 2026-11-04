// Firebase App Hosting için statik sunucu: site/ klasörünü sunar.
// Bağımlılık yok; PORT ortam değişkenini dinler.
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'site');
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function resolve(urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(ROOT, p));
  if (!file.startsWith(ROOT + sep) && file !== ROOT) return null;
  try {
    const st = statSync(file);
    if (st.isDirectory()) return resolve(p + '/');
    return { file, size: st.size };
  } catch {
    return null;
  }
}

http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const hit = resolve(req.url) || resolve('/index.html');
  const ext = extname(hit.file);
  // HTML her zaman taze; görseller, fontlar ve kütüphaneler uzun süre önbellekte
  const cache = ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable';
  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Content-Length': hit.size,
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(hit.file).pipe(res);
}).listen(PORT, () => console.log(`Sunucu hazır: ${PORT}`));
