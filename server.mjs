import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';
import { ConnectionManager, loadEnvFile } from './server/connections.mjs';
import { handleApi } from './server/routes.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 5173;
const watch = process.argv.includes('--watch');
const fakeMode = process.argv.includes('--fake') || process.env.VS_FAKE_PROVIDERS === '1';

// Load .env.local if present
loadEnvFile(path.join(root, '.env.local'));

// Generate random session token on startup
export const sessionToken = crypto.randomUUID();

export const manager = new ConnectionManager({ fake: fakeMode });
await manager.initEnvironmentKeys();

await build();
if (watch) {
  let timer;
  fs.watch(path.join(root, 'src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => build().then(() => console.log('Rebuilt — refresh the browser.')).catch((e) => console.error(e.message)), 120);
  });
}

export function validateHost(req, port) {
  const host = req.headers.host || '';
  const hostRegex = /^(localhost|127\.0\.0\.1)(:\d+)?$/i;
  if (!hostRegex.test(host)) return false;

  const origin = req.headers.origin;
  if (origin) {
    try {
      const u = new URL(origin);
      if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return false;
      const originPort = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
      if (originPort !== port) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export const server = http.createServer((req, res) => {
  if (!validateHost(req, port)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'forbidden', message: 'Forbidden: invalid host or origin' } }));
    return;
  }

  if (req.url.startsWith('/api/')) {
    handleApi(req, res, { manager, sessionToken, fakeMode });
    return;
  }

  const file = path.join(root, 'dist/index.html');
  fs.readFile(file, 'utf-8', (err, html) => {
    if (err) { res.writeHead(500); res.end('Build missing. Run npm run build.'); return; }
    // Inject session token meta tag
    const injectedHtml = html.replace(
      '<head>',
      `<head>\n<meta name="vs-token" content="${sessionToken}" />`
    );
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(injectedHtml);
  });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(port, '127.0.0.1', () =>
    console.log(`Vichaar Sabha running at http://127.0.0.1:${port}${watch ? ' (watching src/)' : ''}${fakeMode ? ' [FAKE PROVIDERS]' : ''}`)
  );
}
