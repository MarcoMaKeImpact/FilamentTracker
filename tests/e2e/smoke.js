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
    await page.waitForFunction(() => !/^(Sende|Suche)/.test(document.getElementById('status').textContent));
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

  // 0) Kamera: anfangs aus, Tippen schaltet ein, Treffer schaltet aus
  const camOn = () => page.evaluate(() => scanning && [...document.querySelectorAll('#reader video')].some(v => v.srcObject?.getTracks().some(t => t.readyState === 'live')));
  check(!(await camOn()) && await page.isVisible('#camStart'), 'Kamera ist beim Start aus, Knopf „Scannen“ sichtbar');
  const box = await page.$eval('#camBox', e => e.getBoundingClientRect().height);
  check(box <= 230, 'Kamerabereich ist kompakt (' + box + ' px hoch)');
  await page.click('#camStart');
  await page.waitForFunction(() => scanning, null, { timeout: 15000 });
  check(await camOn(), 'Tippen auf „Scannen“ schaltet die Kamera ein');
  await page.screenshot({ path: path.join(SHOTS, '0-kamera.png') });
  await page.click('nav button[data-t=tStock]'); await page.waitForTimeout(300);
  check(!(await camOn()) && await page.$$eval('#reader video', v => v.length) === 0, 'Reiterwechsel schaltet die Kamera aus');
  await page.click('nav button[data-t=tScan]');
  check(!(await camOn()), 'Zurück auf Scannen: Kamera bleibt aus, bis man tippt');

  // 1) Unbekannter Barcode per (simuliertem) Kamera-Treffer → Kamera aus, Dialog
  await page.click('#camStart');
  await page.waitForFunction(() => scanning, null, { timeout: 15000 });
  await page.evaluate(() => onScan('6975337034001'));
  await page.waitForSelector('#dNew[open]');
  check(!(await camOn()), 'Bei der Eingabe ist die Kamera aus');
  const opts = await page.$$eval('#dName option', o => o.map(x => x.textContent));
  check(JSON.stringify(opts) === JSON.stringify(['Bitte wählen …', 'PLA Basic', 'PLA Matte']), 'Material-Auswahlliste aus dem Sheet: ' + opts.join(', '));
  await page.selectOption('#dName', 'PLA Basic'); await page.fill('#dColor', 'Schwarz'); await page.fill('#dMin', '1');
  await page.click('#dNew button[value=ok]');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('Bestand'));
  check((await status()).includes('Neu angelegt: +1 PLA Basic – Schwarz → Bestand 1'), 'Neu angelegt mit Bestand 1: ' + await status());
  await page.screenshot({ path: path.join(SHOTS, '1-neu.png') });

  // 2) Erneut hinzufügen → Box mit Menge, nur Menge sichtbar; + zweimal, − einmal → 2
  await page.fill('#manual', '6975337034001'); await page.click('#bManual');
  await page.waitForSelector('#dNew[open]');
  check(await page.isHidden('#dName') && (await page.textContent('#dTitle')).includes('Aktueller Bestand: 1'), 'Box für bekannten Artikel zeigt nur Menge und aktuellen Bestand');
  await page.click('#dPlus'); await page.click('#dPlus'); await page.click('#dMinus');
  check(await page.inputValue('#dQty') === '2', 'Plus/Minus ändert die Menge');
  await page.screenshot({ path: path.join(SHOTS, '1b-menge.png') });
  await page.click('#dOk');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('→ Bestand'));
  check((await status()).includes('+2 PLA Basic – Schwarz → Bestand 3'), '+2 → ' + await status());

  // 2b) Menge direkt eintippen: 10
  await page.fill('#manual', '6975337034001'); await page.click('#bManual');
  await page.waitForSelector('#dNew[open]');
  await page.fill('#dQty', '10'); await page.click('#dOk');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('Bestand 13'));
  check(true, '+10 → ' + await status());
  // für die weiteren Tests wieder auf 3 reduzieren (10× entnehmen)
  await page.click('#bRemove');
  for (let n = 0; n < 10; n++) await scan('6975337034001');
  check((await status()).includes('Bestand 3'), '10× entnehmen → ' + await status());
  await page.click('#bAdd');

  // 3) Entnehmen −1 (zweimal), dann bei 0 Fehlermeldung
  await page.click('#bRemove');
  await scan('6975337034001');
  check((await status()).includes('−1') && (await status()).includes('Bestand 2'), '−1 → ' + await status());
  await scan('6975337034001');
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
  check(listText.includes('Schwarz') && !listText.includes('PLA Basic'), 'Bestandsliste zeigt Farbe, aber kein Material');
  const firstRow = await page.$$eval('#list tr:nth-child(2) td', t => t.map(x => x.textContent.trim()));
  check(firstRow[0] === '1', 'Bestandsliste zeigt die Nr.: ' + firstRow.join(' | '));
  await page.click('#list button.up'); await page.waitForFunction(() => document.getElementById('listInfo').textContent.includes('Bestand 1'));
  check(true, 'Knopf ▲ → ' + await page.textContent('#listInfo'));
  await page.click('#list button.up'); await page.waitForFunction(() => document.getElementById('listInfo').textContent.includes('Bestand 2'));
  await page.click('#list button.down'); await page.waitForFunction(() => document.getElementById('listInfo').textContent.includes('−1') && document.getElementById('listInfo').textContent.includes('Bestand 1'));
  check(true, 'Knopf ▼ → ' + await page.textContent('#listInfo'));
  await page.click('#list button.down'); await page.waitForFunction(() => document.getElementById('listInfo').textContent.includes('Bestand 0'));
  await page.waitForTimeout(1500);
  check(await page.$eval('#list button.down', b => b.disabled), 'Bei Bestand 0 ist ▼ gesperrt');
  check(await page.$('#list tr.zero') !== null, 'Bestand 0 wird rot markiert');
  await page.screenshot({ path: path.join(SHOTS, '2-bestand.png') });
  await page.click('nav button[data-t=tStats]');
  await page.waitForFunction(() => document.getElementById('stats').textContent.includes('Summe'));
  const sumRow = await page.$$eval('#stats tr.sum td', tds => tds.map(t => t.textContent));
  check(JSON.stringify(sumRow) === JSON.stringify(['Summe', '15', '15', '15', '15']), 'Statistik-Summe ' + sumRow.join(' | '));
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
  
  // Sheet-Inhalt prüfen
  const rows = gas.sheets.Bestand.rows;
  check(rows.length === 2 && rows[1][0] === 1 && rows[1][4] === 0 && rows[1][6] === 1, 'Sheet: Nr. 1, Bestand 0, Mindestbestand 1');
  check(gas.sheets.Log.rows.length === 1 + 3 + 13 + 4, 'Log: 20 Einträge (inkl. 4 Klicks auf ▲/▼)');

  await browser.close(); server.close();
  console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
