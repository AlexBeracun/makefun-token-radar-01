// Retake the 4 Token Radar screenshots from the v6 out/ build.
// Board (tall viewport, ~17 rows), detail (tall viewport, all 7 steps),
// filtered (MARGINAL verdict chip — a visibly different set from the board),
// method (the evidence panel: scatter, validation, ablation, calibration).
import { chromium } from 'playwright-core';
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = '/home/hatch/workspace/makefun-agent/entries/token-radar-01/out';
const SHOTS = '/home/hatch/workspace/makefun-agent/entries/token-radar-01/screenshots';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'dashboard/index.html';
  const p = join(ROOT, rel);
  if (!existsSync(p) || !statSync(p).isFile()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' });
  createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/dashboard/index.html`;

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

const quality = Number(process.argv[2] ?? 85);

// 1-board: tall viewport so the ranking breadth shows.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('tbody tr', { timeout: 15000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, '1-board.jpg'), type: 'jpeg', quality });
  await page.close();
}

// 2-detail: first row (Steakhouse Financial), dialog open, tall viewport so all 7 steps fit.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1700 } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('tbody tr', { timeout: 15000 });
  await page.click('tbody tr:first-child');
  await page.waitForSelector('#detail', { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, '2-detail.jpg'), type: 'jpeg', quality });
  await page.close();
}

// 3-filtered: fresh load, MARGINAL verdict chip — a different set from the board shot.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('tbody tr', { timeout: 15000 });
  await page.click('button.chip:has-text("MARGINAL")');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, '3-filtered.jpg'), type: 'jpeg', quality });
  await page.close();
}

// 4-method: the evidence panel — scatter, validation splits, ablation, calibration.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#method', { timeout: 15000 });
  await page.waitForTimeout(300);
  await page.locator('#method').screenshot({ path: join(SHOTS, '4-method.jpg'), type: 'jpeg', quality });
  await page.close();
}

await browser.close();
server.close();
console.log('shots done, quality', quality);
