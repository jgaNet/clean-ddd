#!/usr/bin/env node
/**
 * A static server for a front end of `web/`, for development: plain Node, no package. It
 * serves one folder, answers `index.html` to any path it has no file for (the front end's own
 * routes, `/me`), and may fill the page's `<meta name="api-base">` so the page talks to an API
 * on another origin — which is the point: the front end has no relation to any server of
 * `typescript/`, `rust/` or `python/` beyond the API they all answer (API-ONE-SURFACE).
 *
 *   node web/serve.mjs web/htmx --port 8080 --api http://127.0.0.1:10000
 *
 * In production any static server does the same: nginx `try_files $uri /index.html`, Caddy
 * `try_files {path} /index.html`, a bucket with an index document — and the meta edited once.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const args = process.argv.slice(2);
const folder = resolve(args.find((arg) => !arg.startsWith('-')) ?? 'web/htmx');
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const port = Number(option('--port', '8080'));
const apiBase = option('--api', '');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function page() {
  const html = await readFile(join(folder, 'index.html'), 'utf8');
  return apiBase ? html.replace(/(<meta name="api-base" content=")[^"]*(")/, `$1${apiBase}$2`) : html;
}

createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname));
  const file = join(folder, path);
  try {
    if (!file.startsWith(folder)) throw new Error('outside');
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    response.end(await readFile(file));
  } catch {
    response.writeHead(200, { 'content-type': types['.html'] });
    response.end(await page());
  }
}).listen(port, () => {
  console.log(`serving ${folder} on http://127.0.0.1:${port}${apiBase ? ` (API at ${apiBase})` : ' (API on the same origin)'}`);
});
