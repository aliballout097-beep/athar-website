// Tiny local server for dist/ (npm run serve -> http://localhost:5190)
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';

const ROOT = join(import.meta.dirname, 'dist');
const PORT = Number(process.env.PORT) || 5190;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

createServer((req, res) => {
  let p = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!p.startsWith(ROOT) || !existsSync(p)) return res.writeHead(404).end('not found');
  res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' });
  createReadStream(p).pipe(res);
}).listen(PORT, () => console.log(`ATHAR running at http://localhost:${PORT}`));
