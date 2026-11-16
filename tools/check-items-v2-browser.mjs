// Optional local Chrome/Edge UI smoke for the independent v.o2 item reader.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const server = http.createServer((req, res) => {
  try {
    const request = new URL(req.url, 'http://localhost');
    let file = path.resolve(root, '.' + decodeURIComponent(request.pathname));
    if (!(file === root || file.startsWith(root + path.sep))) throw new Error('Forbidden path');
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(404).end('Not found'); }
});
const listen = () => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const close = () => new Promise(resolve => server.close(resolve));
await listen();
let browser;
try {
  const paths = [
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium', '/usr/bin/google-chrome', chromium.executablePath()
  ];
  const executablePath = paths.find(p => p && fs.existsSync(p));
  if (!executablePath) throw new Error('Chrome/Edge/Chromium required for optional browser check');
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push('JavaScript: ' + e.message));
  page.on('response', response => {
    if (response.status() >= 400) errors.push('HTTP ' + response.status() + ' ' + response.url());
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  await page.goto(base + '/items-v2/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('status')?.textContent.includes('4,014'), null, { timeout: 12000 });
  assert.equal(await page.locator('#items tr').count(), 100);
  await page.locator('#search').fill('산성비');
  await page.waitForTimeout(120);
  assert((await page.locator('#items tr').count()) >= 1);
  await page.locator('#items tr .item-name').first().click();
  assert(await page.locator('#detail').isVisible());
  assert((await page.locator('#detail-meta').innerText()).includes('Piratez.rul'));
  await page.locator('#detail-close').click();
  await page.locator('#search').fill('STR_');
  await page.waitForTimeout(100);
  const checks = page.locator('#items .select-item');
  await checks.nth(0).check();
  await checks.nth(1).check();
  assert(await page.locator('#compare-trigger').isEnabled());
  await page.locator('#compare-trigger').click();
  assert(await page.locator('#compare').isVisible());
  assert((await page.locator('#compare-data').innerText()).includes('sourceFiles'));
  await page.locator('#compare-close').click();
  await page.locator('#search').fill('');
  await page.locator('#type').selectOption('3');
  assert((await page.locator('#items tr').count()) > 0);
  assert.deepEqual(errors, []);
  console.log('PASS X-Piratez 2.1 items browser: 4014 load/search/detail/compare/filter');
} finally {
  if (browser) await browser.close();
  await close();
}
