/**
 * Filament-Tracker – Google Apps Script Web-App-API
 *
 * Aktionen: ping | materials | list | lookup | stats
 *           add    (code, qty; bei neuem Code name/color/min)  → Verpackt +qty          (Log-Art „Kauf“)
 *           open   (code)  → Verpackt −1, In Verwendung +1  „Spule öffnen“         (Log-Art „Geöffnet“)
 *           empty  (code)  → In Verwendung −1               „Spule leer“           (Log-Art „Leer“ = verbraucht)
 *           adjust (code, field: 'packed'|'used', delta: +1|−1)  reine Korrektur  (Log-Art „Korrektur“)
 *           remove (code)  → wie open (ältere App-Versionen)
 *
 * Bestand: Nr. | Barcode | Bezeichnung | Farbe | Verpackt | In Verwendung | Zuletzt geändert | Mindestbestand
 *          „Nr.“ = fortlaufende Nummer, bestimmt die Reihenfolge in der App (im Sheet frei änderbar).
 *          Mindestbestand gilt für Verpackt + In Verwendung.
 *          Ältere Sheets werden beim ersten Aufruf automatisch auf dieses Layout umgestellt.
 * Materialien: Material   (eine Zeile pro Eintrag – hier erweitern, die App übernimmt die Liste)
 * Log:     Zeit | Barcode | Bezeichnung | Farbe | Änderung | Art
 *          Änderung = Veränderung der Gesamtzahl (Verpackt + In Verwendung); Art = Kauf | Geöffnet | Leer | Korrektur
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
const MAT = 'Materialien'; // Auswahlliste für die App: Spalte A, ab Zeile 2
const DEFAULT_MATERIALS = ['PLA Basic', 'PLA Matte'];
const HEAD = ['Nr.', 'Barcode', 'Bezeichnung', 'Farbe', 'Verpackt', 'In Verwendung', 'Zuletzt geändert', 'Mindestbestand'];
const C = { nr: 0, code: 1, name: 2, color: 3, stock: 4, used: 5, ts: 6, min: 7 }; // Spaltenindex (0-basiert)
const LOG_HEAD = ['Zeit', 'Barcode', 'Bezeichnung', 'Farbe', 'Änderung', 'Art'];
const VERSION = '1.5.0';

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
  migrate(s);
  s.getRange(1, 1, 1, HEAD.length).setValues([HEAD]); // ergänzt ggf. fehlende Überschriften
  formatStock(s);

  ensureMaterials(ss);

  const l = ss.getSheetByName(LOG) || ss.insertSheet(LOG);
  if (l.getLastRow() === 0) l.appendRow(LOG_HEAD);
  else l.getRange(1, 1, 1, LOG_HEAD.length).setValues([LOG_HEAD]); // ergänzt ggf. „Art“
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

/** Stellt ein altes Bestand-Blatt (Spalte A = Barcode) auf das neue Layout mit „Nr.“ in Spalte A um. */
function migrate(s) {
  let changed = false;
  // Stufe 1: Spalte A „Nr.“ ergänzen (Sheets vor Version 1.4)
  if (String(s.getRange(1, 1).getValue()).trim() === 'Barcode') {
    s.insertColumnBefore(1);
    s.getRange('A:A').setNumberFormat('0');
    s.getRange(1, 1).setValue('Nr.');
    const n = s.getLastRow() - 1;
    if (n > 0) s.getRange(2, 1, n, 1).setValues(Array.from({ length: n }, (_, i) => [i + 1]));
    changed = true;
  }
  // Stufe 2: „Bestand“ → „Verpackt“, neue Spalte F „In Verwendung“ (Sheets vor Version 1.5)
  if (String(s.getRange(1, 6).getValue()).trim() === 'Zuletzt geändert') {
    s.insertColumnAfter(5);
    s.getRange(1, 5, 1, 2).setValues([['Verpackt', 'In Verwendung']]);
    const n = s.getLastRow() - 1;
    if (n > 0) s.getRange(2, 6, n, 1).setValues(Array.from({ length: n }, () => [0]));
    changed = true;
  }
  if (changed) formatStock(s);
  return changed;
}

/** Formate, Warnfarben und Material-Dropdown im Blatt „Bestand“ */
function formatStock(s) {
  s.getRange('A:A').setNumberFormat('0');
  s.getRange('B:B').setNumberFormat('@'); // Barcodes als Text (führende Nullen bleiben)
  s.getRange('E:F').setNumberFormat('0');
  s.getRange('G:G').setNumberFormat('dd.MM.yyyy HH:mm');
  s.getRange(1, 1, 1, HEAD.length).setFontWeight('bold');
  s.setFrozenRows(1);
  // Bedingte Formatierung auf Verpackt + In Verwendung: 0 → rot, ≤ Mindestbestand → orange
  const rng = s.getRange('A2:H');
  s.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($B2<>"",$E2+$F2<=0)').setBackground('#f4c7c3').setRanges([rng]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($B2<>"",$H2<>"",$E2+$F2<=$H2)').setBackground('#fce8b2').setRanges([rng]).build()
  ]);
  const m = s.getParent ? s.getParent().getSheetByName(MAT) : null;
  if (m) linkMaterials(s, m);
}

function linkMaterials(stock, m) {
  stock.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(m.getRange('A2:A'), true).setAllowInvalid(true).build());
}

/** Legt das Blatt „Materialien“ an (falls es fehlt) und verknüpft Spalte B im Bestand als Dropdown damit. */
function ensureMaterials(ss) {
  let m = ss.getSheetByName(MAT);
  if (!m) {
    m = ss.insertSheet(MAT);
    m.getRange(1, 1, DEFAULT_MATERIALS.length + 1, 1).setValues([['Material']].concat(DEFAULT_MATERIALS.map(x => [x])));
    m.getRange(1, 1).setFontWeight('bold');
    m.setFrozenRows(1);
    const b = ss.getSheetByName(SHEET);
    if (b) linkMaterials(b, m);
  }
  return m;
}

/** Materialliste aus dem Blatt „Materialien“ (Spalte A ohne Kopfzeile, leere Zellen und Doppelte entfernt) */
function materials(ss) {
  const vals = ensureMaterials(ss).getDataRange().getValues().slice(1).map(r => String(r[0]).trim()).filter(Boolean);
  return vals.filter((v, i) => vals.indexOf(v) === i);
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
    if (p.action === 'materials') return out({ ok: true, materials: materials(ss) });

    const sh = ss.getSheetByName(SHEET);
    if (!sh) return out({ ok: false, error: 'setup_missing' });
    migrate(sh);
    const data = sh.getDataRange().getValues();

    if (p.action === 'list') return out({ ok: true, items: data.slice(1).filter(r => String(r[C.code]).trim()).map(item) });

    const code = String(p.code || '').trim();
    if (!code) return out({ ok: false, error: 'no_code' });
    let row = -1;
    for (let i = 1; i < data.length; i++) if (String(data[i][C.code]).trim() === code) { row = i; break; }

    if (p.action === 'lookup') return out({ ok: true, found: row > 0, item: row > 0 ? item(data[row]) : null, materials: materials(ss) });

    const action = p.action === 'remove' ? 'open' : p.action; // ältere App-Versionen
    if (!['add', 'open', 'empty', 'adjust'].includes(action)) return out({ ok: false, error: 'bad_action' });

    if (row < 0) {
      if (action !== 'add') return out({ ok: false, error: 'unknown_code', code });
      const name = String(p.name || '').trim(), color = String(p.color || '').trim();
      if (!name || !color) return out({ ok: false, error: 'need_details', code }); // Farbe ist Pflicht
      const qty = toQty(p.qty);
      const min = p.min === '' || p.min == null || isNaN(Number(p.min)) ? '' : Math.max(0, Math.floor(Number(p.min)));
      const nr = data.slice(1).reduce((mx, r) => Math.max(mx, Number(r[C.nr]) || 0), 0) + 1; // nächste fortlaufende Nummer
      sh.appendRow([nr, code, name, color, qty, 0, new Date(), min]);
      log(ss, code, name, color, qty, 'Kauf');
      return out({ ok: true, created: true, qty, item: { nr, code, name, color, stock: qty, used: 0, min: min === '' ? null : min } });
    }

    const it = item(data[row]);
    let change = 0, kind = '';
    if (action === 'add') {
      const qty = toQty(p.qty);
      it.stock += qty; change = qty; kind = 'Kauf';
    } else if (action === 'open') {
      if (it.stock <= 0) return out({ ok: false, error: 'empty', item: it });
      it.stock -= 1; it.used += 1; kind = 'Geöffnet';
    } else if (action === 'empty') {
      if (it.used <= 0) return out({ ok: false, error: 'empty', item: it });
      it.used -= 1; change = -1; kind = 'Leer';
    } else { // adjust
      const d = Number(p.delta) > 0 ? 1 : -1, f = p.field === 'used' ? 'used' : 'stock';
      if (d < 0 && it[f] <= 0) return out({ ok: false, error: 'empty', item: it });
      it[f] += d; change = d;
      kind = 'Korrektur';
    }
    sh.getRange(row + 1, C.stock + 1, 1, 3).setValues([[it.stock, it.used, new Date()]]);
    log(ss, code, it.name, it.color, change, kind);
    return out({ ok: true, qty: Math.abs(change) || 1, kind, item: it });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function toQty(q) { return Math.min(999, Math.max(1, Math.floor(Number(q)) || 1)); } // 1–999, Standard 1

function item(r) {
  const min = r[C.min] === '' || r[C.min] == null ? null : Number(r[C.min]);
  const nr = r[C.nr] === '' || r[C.nr] == null || isNaN(Number(r[C.nr])) ? null : Number(r[C.nr]);
  return { nr, code: String(r[C.code]).trim(), name: r[C.name], color: r[C.color],
    stock: Number(r[C.stock]) || 0, used: Number(r[C.used]) || 0, min: isNaN(min) ? null : min };
}

// Alle Log-Einträge für die Statistik; die App filtert nach Zeitraum und summiert
// nr = aktuelle Nummer des Artikels im Bestand (für die Sortierung), null wenn es ihn nicht mehr gibt
function entries(ss) {
  const nrs = {};
  const sh = ss.getSheetByName(SHEET);
  if (sh) { migrate(sh); sh.getDataRange().getValues().slice(1).forEach(r => { nrs[String(r[C.code]).trim()] = item(r).nr; }); }
  return ss.getSheetByName(LOG).getDataRange().getValues().slice(1)
    .filter(r => r[0] && (Number(r[4]) || r[5]))
    .map(r => ({ t: new Date(r[0]).getTime(), label: (r[3] || 'ohne Farbe') + ' – ' + (r[2] || ''), d: Number(r[4]) || 0,
      kind: String(r[5] || ''), nr: nrs[String(r[1]).trim()] ?? null }));
}

function log(ss, code, name, color, delta, kind) {
  const l = ss.getSheetByName(LOG);
  if (String(l.getRange(1, 6).getValue()) !== 'Art') l.getRange(1, 6).setValue('Art');
  l.appendRow([new Date(), code, name, color, delta, kind]);
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
