// End-to-End-Test der PWA im Browser (Playwright/Chromium) gegen das echte Code.gs
// in einem nachgebauten Apps-Script-Backend. Kamera wird nicht benötigt (manuelle Eingabe).
// Aufruf: npm run e2e
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { env } = require('../fake-gas');

const DOCS = path.join(__dirname, '..', '..', 'docs');
const SHOTS = path.join(__dirname, 'screenshots');
const API = 'https://script.google.com/macros/s/FAKE/exec';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const p = path.join(DOCS, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(DOCS) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/`;
  const gas = env('geheim');
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.route(API, route => {
    const body = JSON.parse(route.request().postData());
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(gas.ctx.doPost({ postData: { contents: JSON.stringify(body) } })) });
  });

  let failed = 0;
  const check = (cond, msg) => { console.log((cond ? 'OK   ' : 'FEHL ') + msg); if (!cond) failed++; };
  const status = () => page.textContent('#status');
  const scan = async code => {
    await page.fill('#manual', code); await page.click('#bManual');
    await page.waitForFunction(() => !document.getElementById('status').textContent.startsWith('Sende'));
  };

  // Einrichtung per Link-Hash
  await page.goto(base + '#url=' + encodeURIComponent(API) + '&token=geheim');
  check(page.url().includes('token=geheim'), 'Token bleibt in der Adresse (für Home-Bildschirm-Icon)');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('nav button[data-t=tSet]');
  check(await page.inputValue('#token') === 'geheim', 'Nach Neustart ohne Speicher: Werte kommen aus der Adresse');
  await page.click('nav button[data-t=tScan]');
  check(await page.evaluate(() => localStorage.getItem('token')) === 'geheim', 'Token lokal gespeichert');

  // 1) Unbekannter Barcode → Dialog
  await page.fill('#manual', '6975337034001'); await page.click('#bManual');
  await page.waitForSelector('#dNew[open]');
  check(true, 'Dialog für neuen Artikel erscheint');
  await page.fill('#dName', 'PLA Basic'); await page.fill('#dColor', 'Schwarz'); await page.fill('#dMin', '1');
  await page.click('#dNew button[value=ok]');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('Bestand'));
  check((await status()).includes('Neu angelegt: PLA Basic – Schwarz → Bestand 1'), 'Neu angelegt mit Bestand 1: ' + await status());
  await page.screenshot({ path: path.join(SHOTS, '1-neu.png') });
  await page.waitForTimeout(1500);
  check(await page.evaluate(() => scanner.getState()) === 2, 'Kamera läuft nach dem Dialog weiter');

  // 2) Erneut hinzufügen → +1
  await scan('6975337034001');
  check((await status()).includes('+1 PLA Basic – Schwarz → Bestand 2'), '+1 → ' + await status());

  // 3) Entnehmen −1 (zweimal), dann bei 0 Fehlermeldung
  await page.click('#bRemove');
  await scan('6975337034001');
  check((await status()).includes('−1') && (await status()).includes('Bestand 1'), '−1 → ' + await status());
  await scan('6975337034001');
  check((await status()).includes('Bestand 0'), '−1 → ' + await status());
  await scan('6975337034001');
  check((await status()).includes('schon bei 0'), 'Entnehmen bei 0 → ' + await status());

  // 4) Unbekannter Barcode beim Entnehmen
  await scan('123');
  check((await status()).includes('Unbekannter Barcode'), 'Unbekannt entnehmen → ' + await status());

  // 5) Abbrechen im Dialog
  await page.click('#bAdd');
  await page.fill('#manual', '555'); await page.click('#bManual');
  await page.waitForSelector('#dNew[open]');
  await page.click('#dNew button[value=cancel]');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('Abgebrochen'));
  check(true, 'Abbrechen im Dialog → ' + await status());

  // 6) Bestandsliste und Statistik
  await page.click('nav button[data-t=tStock]');
  await page.waitForFunction(() => document.querySelectorAll('#list tr').length > 2);
  const listText = await page.textContent('#list');
  check(listText.includes('Schwarz') && listText.includes('PLA Basic'), 'Bestandsliste zeigt Artikel');
  check(await page.$('#list tr.zero') !== null, 'Bestand 0 wird rot markiert');
  await page.screenshot({ path: path.join(SHOTS, '2-bestand.png') });
  await page.click('nav button[data-t=tStats]');
  await page.waitForFunction(() => document.getElementById('stats').textContent.includes('Summe'));
  const sumRow = await page.$$eval('#stats tr.sum td', tds => tds.map(t => t.textContent));
  check(JSON.stringify(sumRow) === JSON.stringify(['Summe', '2', '2', '2', '2']), 'Statistik-Summe ' + sumRow.join(' | '));
  await page.screenshot({ path: path.join(SHOTS, '3-statistik.png') });

  // 7) Falscher Token
  await page.click('nav button[data-t=tSet]');
  await page.fill('#token', 'falsch'); await page.click('#bTest');
  await page.waitForFunction(() => !document.getElementById('setStatus').textContent.startsWith('Teste'));
  check((await page.textContent('#setStatus')).includes('Token falsch'), 'Falscher Token → ' + await page.textContent('#setStatus'));
  await page.fill('#token', 'geheim'); await page.click('#bTest');
  await page.waitForFunction(() => document.getElementById('setStatus').textContent.includes('OK'));
  check(true, 'Richtiger Token → Verbindung OK');
  await page.fill('#url', base + '#url=' + encodeURIComponent(API) + '&token=geheim'); await page.fill('#token', '');
  await page.click('#bSave');
  check(await page.inputValue('#url') === API && await page.inputValue('#token') === 'geheim', 'Einrichtungslink ins URL-Feld einfügen funktioniert');
  await page.click('nav button[data-t=tScan]'); await page.waitForTimeout(1500);
  check(await page.evaluate(() => scanner.getState()) === 2, 'Kamera läuft nach Reiterwechsel wieder');
  
  // Sheet-Inhalt prüfen
  const rows = gas.sheets.Bestand.rows;
  check(rows.length === 2 && rows[1][3] === 0 && rows[1][5] === 1, 'Sheet: Bestand 0, Mindestbestand 1');
  check(gas.sheets.Log.rows.length === 5, 'Log: 4 Einträge');

  await browser.close(); server.close();
  console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
