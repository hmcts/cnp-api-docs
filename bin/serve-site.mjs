#!/usr/bin/env node
// Serves build/dist under /cnp-api-docs, matching GitHub Pages.
//
// The site is built with base: '/cnp-api-docs', so serving build/dist at the root
// returns 200 for the homepage and 404 for every link on it.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const ROOT = 'build/dist';
const BASE = '/cnp-api-docs';
const port = Number(process.env.PORT ?? 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

async function resolve(pathname) {
  const rel = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const candidates = rel.endsWith('/')
    ? [join(ROOT, rel, 'index.html')]
    : [join(ROOT, rel), join(ROOT, `${rel}.html`), join(ROOT, rel, 'index.html')];

  for (const path of candidates) {
    try {
      if ((await stat(path)).isFile()) return path;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${port}`);

  if (pathname === '/' || pathname === BASE) {
    res.writeHead(302, { location: `${BASE}/` });
    res.end();
    return;
  }

  if (!pathname.startsWith(`${BASE}/`)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end(`Not found. The site is served under ${BASE}/\n`);
    return;
  }

  const rel = decodeURIComponent(pathname.slice(BASE.length));
  let file = await resolve(rel);

  // The architecture app is a single-page app: its view URLs exist only in the
  // client router. GitHub Pages serves 404.html for them, which boots the app and
  // lets it route, so do the same here or deep links appear broken locally.
  if (!file && rel.startsWith('/architecture/explore/')) {
    file = await resolve('/architecture/explore/404.html');
  }

  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found\n');
    return;
  }

  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(await readFile(file));
}).listen(port, () => {
  console.log(`Serving ${ROOT} on http://localhost:${port}${BASE}/`);
});
