/**
 * Filament-Tracker – Google Apps Script Web-App-API
 *
 * Aktionen: ping | list | lookup | add (code, qty, bei neuem Code name/color/min) | remove (code) | stats
 *
 * Bestand: Barcode | Bezeichnung | Farbe | Bestand | Zuletzt geändert | Mindestbestand
 * Log:     Zeit | Barcode | Bezeichnung | Farbe | Änderung
 *
 * Skripteigenschaften (Projekteinstellungen → Skripteigenschaften):
 *   TOKEN     (Pflicht)  langer Zufallswert, muss in der App eingetragen werden
 *   SHEET_ID  (optional) nur nötig, wenn das Skript NICHT über Erweiterungen → Apps Script
 *                        direkt am Sheet hängt (Standalone-Skript)
 *
 * Nach jeder Codeänderung: Bereitstellen → Bereitstellungen verwalten → Bearbeiten → Neue Version.
 */

const SHEET = 'Bestand';
const LOG = 'Log';
const HEAD = ['Barcode', 'Bezeichnung', 'Farbe', 'Bestand', 'Zuletzt geändert', 'Mindestbestand'];
const LOG_HEAD = ['Zeit', 'Barcode', 'Bezeichnung', 'Farbe', 'Änderung'];
const VERSION = '1.2.0';

function book() {
  const active = SpreadsheetApp.getActive();
  if (active) return active;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Kein Sheet gefunden – Skript am Sheet anlegen oder SHEET_ID setzen');
  return SpreadsheetApp.openById(id);
}

/** Einmal im Editor ausführen: legt Blätter, Kopfzeilen, Formate und Warnfarben an. */
function setup() {
  const ss = book();

  const s = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  if (s.getLastRow() === 0) s.appendRow(HEAD);
  else s.getRange(1, 1, 1, HEAD.length).setValues([HEAD]); // ergänzt ggf. "Mindestbestand"
  s.getRange('A:A').setNumberFormat('@'); // Barcodes als Text (führende Nullen bleiben)
  s.getRange('E:E').setNumberFormat('dd.MM.yyyy HH:mm');
  s.getRange(1, 1, 1, HEAD.length).setFontWeight('bold');
  s.setFrozenRows(1);

  // Bedingte Formatierung: Bestand 0 → rot, unter/gleich Mindestbestand → orange
  const rng = s.getRange('A2:F');
  s.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($A2<>"",$D2<=0)').setBackground('#f4c7c3').setRanges([rng]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($A2<>"",$F2<>"",$D2<=$F2)').setBackground('#fce8b2').setRanges([rng]).build()
  ]);

  const l = ss.getSheetByName(LOG) || ss.insertSheet(LOG);
  if (l.getLastRow() === 0) l.appendRow(LOG_HEAD);
  l.getRange('A:A').setNumberFormat('dd.MM.yyyy HH:mm:ss');
  l.getRange('B:B').setNumberFormat('@');
  l.getRange(1, 1, 1, LOG_HEAD.length).setFontWeight('bold');
  l.setFrozenRows(1);

  // Leeres Standardblatt eines neuen Sheets entfernen
  ['Tabellenblatt1', 'Sheet1'].forEach(n => {
    const x = ss.getSheetByName(n);
    if (x && x.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(x);
  });

  if (!PropertiesService.getScriptProperties().getProperty('TOKEN')) {
    Logger.log('ACHTUNG: Skripteigenschaft TOKEN fehlt noch!');
  }
}

/** Optional im Editor ausführen: erzeugt einen zufälligen TOKEN, falls noch keiner existiert, und zeigt ihn im Log. */
function createToken() {
  const props = PropertiesService.getScriptProperties();
  let t = props.getProperty('TOKEN');
  if (!t) {
    t = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('TOKEN', t);
  }
  Logger.log('TOKEN: ' + t);
}

/** GET nur als Lebenszeichen (URL im Browser öffnen → {"ok":true,...}). Keine Daten ohne Token. */
function doGet() {
  return out({ ok: true, app: 'filament-tracker', version: VERSION });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return out({ ok: false, error: 'busy' });
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || p.token !== token) return out({ ok: false, error: 'unauthorized' });

    const ss = book();
    if (p.action === 'ping') return out({ ok: true, version: VERSION });
    if (p.action === 'stats') return out({ ok: true, entries: entries(ss) });

    const sh = ss.getSheetByName(SHEET);
    if (!sh) return out({ ok: false, error: 'setup_missing' });
    const data = sh.getDataRange().getValues();

    if (p.action === 'list') return out({ ok: true, items: data.slice(1).filter(r => String(r[0]).trim()).map(item) });

    const code = String(p.code || '').trim();
    if (!code) return out({ ok: false, error: 'no_code' });
    let row = -1;
    for (let i = 1; i < data.length; i++) if (String(data[i][0]).trim() === code) { row = i; break; }

    if (p.action === 'lookup') return out({ ok: true, found: row > 0, item: row > 0 ? item(data[row]) : null });
    if (p.action !== 'add' && p.action !== 'remove') return out({ ok: false, error: 'bad_action' });
    // Menge (nur beim Hinzufügen): ganze Zahl 1–999, Standard 1
    const qty = p.action === 'add' ? Math.min(999, Math.max(1, Math.floor(Number(p.qty)) || 1)) : 1;
    const delta = p.action === 'add' ? qty : -1;

    if (row < 0) {
      if (delta < 0) return out({ ok: false, error: 'unknown_code', code });
      const name = String(p.name || '').trim(), color = String(p.color || '').trim();
      if (!name || !color) return out({ ok: false, error: 'need_details', code }); // Farbe ist Pflicht
      const min = p.min === '' || p.min == null || isNaN(Number(p.min)) ? '' : Math.max(0, Math.floor(Number(p.min)));
      sh.appendRow([code, name, color, qty, new Date(), min]);
      log(ss, code, name, color, qty);
      return out({ ok: true, created: true, qty, item: { code, name, color, stock: qty, min: min === '' ? null : min } });
    }

    const it = item(data[row]);
    if (delta < 0 && it.stock <= 0) return out({ ok: false, error: 'empty', item: it });
    it.stock += delta;
    sh.getRange(row + 1, 4, 1, 2).setValues([[it.stock, new Date()]]);
    log(ss, code, it.name, it.color, delta);
    return out({ ok: true, qty: Math.abs(delta), item: it });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function item(r) {
  const min = r[5] === '' || r[5] == null ? null : Number(r[5]);
  return { code: String(r[0]).trim(), name: r[1], color: r[2], stock: Number(r[3]) || 0, min: isNaN(min) ? null : min };
}

// Alle Log-Einträge für die Statistik; die App filtert nach Zeitraum und summiert
function entries(ss) {
  return ss.getSheetByName(LOG).getDataRange().getValues().slice(1)
    .filter(r => r[0] && Number(r[4]))
    .map(r => ({ t: new Date(r[0]).getTime(), label: (r[3] || 'ohne Farbe') + ' – ' + (r[2] || ''), d: Number(r[4]) }));
}

function log(ss, code, name, color, delta) {
  ss.getSheetByName(LOG).appendRow([new Date(), code, name, color, delta]);
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
