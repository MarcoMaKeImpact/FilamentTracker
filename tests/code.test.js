// Tests für apps-script/Code.gs mit einem kleinen Nachbau der Apps-Script-Dienste.
// Aufruf: npm test  (oder: node --test tests/*.test.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const { env } = require('./fake-gas');

test('setup legt Blätter und Kopfzeilen an und entfernt das leere Standardblatt', () => {
  const { sheets } = env();
  assert.deepEqual(sheets.Bestand.rows[0], ['Nr.', 'Barcode', 'Bezeichnung', 'Farbe', 'Bestand', 'Zuletzt geändert', 'Mindestbestand']);
  assert.deepEqual(sheets.Log.rows[0], ['Zeit', 'Barcode', 'Bezeichnung', 'Farbe', 'Änderung']);
  assert.equal(sheets.Tabellenblatt1, undefined);
  assert.equal(sheets.Bestand.rules.length, 2);
});

test('falscher Token → unauthorized', () => {
  const { call } = env();
  assert.deepEqual(call({ action: 'list' }, 'falsch'), { ok: false, error: 'unauthorized' });
});

test('fehlender TOKEN auf dem Server → unauthorized (auch bei leerem Token)', () => {
  const { call } = env(null);
  assert.equal(call({ action: 'list' }, undefined).error, 'unauthorized');
});

test('unbekannter Barcode hinzufügen → need_details, dann mit Name/Farbe anlegen', () => {
  const { call, sheets } = env();
  assert.deepEqual(call({ action: 'add', code: '6975337034001' }), { ok: false, error: 'need_details', code: '6975337034001' });
  assert.equal(call({ action: 'add', code: '6975337034001', name: 'PLA Basic' }).error, 'need_details'); // Farbe fehlt
  const r = call({ action: 'add', code: '6975337034001', name: 'PLA Basic', color: 'Schwarz', min: '1' });
  assert.equal(r.ok, true); assert.equal(r.created, true);
  assert.deepEqual(r.item, { nr: 1, code: '6975337034001', name: 'PLA Basic', color: 'Schwarz', stock: 1, min: 1 });
  assert.equal(sheets.Log.rows.length, 2);
});

test('erneut hinzufügen → +1, entnehmen → −1, bei 0 → empty', () => {
  const { call, sheets } = env();
  call({ action: 'add', code: '111', name: 'PETG HF', color: 'Weiß' });
  assert.equal(call({ action: 'add', code: '111' }).item.stock, 2);
  assert.equal(call({ action: 'remove', code: '111' }).item.stock, 1);
  assert.equal(call({ action: 'remove', code: '111' }).item.stock, 0);
  const r = call({ action: 'remove', code: '111' });
  assert.equal(r.ok, false); assert.equal(r.error, 'empty'); assert.equal(r.item.stock, 0);
  assert.equal(sheets.Bestand.rows[1][4], 0);
  assert.deepEqual(sheets.Log.rows.slice(1).map(r => r[4]), [1, 1, -1, -1]);
});

test('entnehmen bei unbekanntem Barcode → unknown_code', () => {
  const { call } = env();
  assert.deepEqual(call({ action: 'remove', code: '999' }), { ok: false, error: 'unknown_code', code: '999' });
});

test('Barcodes mit führender Null und Leerzeichen werden getrimmt verglichen', () => {
  const { call } = env();
  call({ action: 'add', code: ' 0123 ', name: 'PLA', color: 'Rot' });
  assert.equal(call({ action: 'add', code: '0123' }).item.stock, 2);
});

test('list, lookup, ping, stats', () => {
  const { call } = env();
  call({ action: 'add', code: '1', name: 'PLA', color: 'Rot' });
  call({ action: 'add', code: '1' });
  call({ action: 'remove', code: '1' });
  assert.deepEqual(call({ action: 'list' }).items, [{ nr: 1, code: '1', name: 'PLA', color: 'Rot', stock: 1, min: null }]);
  assert.equal(call({ action: 'lookup', code: '1' }).found, true);
  assert.equal(call({ action: 'lookup', code: '2' }).found, false);
  assert.equal(call({ action: 'ping' }).ok, true);
  const st = call({ action: 'stats' });
  assert.deepEqual(st.entries.map(e => [e.label, e.d]), [['Rot – PLA', 1], ['Rot – PLA', 1], ['Rot – PLA', -1]]);
});

test('ungültige Aktion, fehlender Code, kaputtes JSON', () => {
  const { call, ctx } = env();
  assert.equal(call({ action: 'xyz', code: '1' }).error, 'bad_action');
  assert.equal(call({ action: 'add' }).error, 'no_code');
  assert.equal(ctx.doPost({ postData: { contents: '{kaputt' } }).ok, false);
});

test('Menge beim Hinzufügen (neu und bestehend), Log mit Menge', () => {
  const { call, sheets } = env();
  const r = call({ action: 'add', code: '42', name: 'PLA', color: 'Blau', qty: 10 });
  assert.equal(r.item.stock, 10); assert.equal(r.qty, 10);
  assert.equal(call({ action: 'add', code: '42', qty: '3' }).item.stock, 13);
  assert.equal(call({ action: 'add', code: '42', qty: 0 }).item.stock, 14);    // ungültig → 1
  assert.equal(call({ action: 'add', code: '42', qty: 5000 }).item.stock, 1013); // max 999
  assert.equal(call({ action: 'remove', code: '42', qty: 5 }).item.stock, 1012); // Entnehmen immer 1
  assert.deepEqual(sheets.Log.rows.slice(1).map(r => r[4]), [10, 3, 1, 999, -1]);
});

test('Materialien: Blatt mit Standardliste, erweiterbar, lookup liefert Liste', () => {
  const { call, sheets } = env();
  assert.deepEqual(sheets.Materialien.rows, [['Material'], ['PLA Basic'], ['PLA Matte']]);
  sheets.Materialien.rows.push(['PETG HF'], [''], ['PLA Basic']); // erweitert, mit Leerzeile und Doppeltem
  assert.deepEqual(call({ action: 'materials' }).materials, ['PLA Basic', 'PLA Matte', 'PETG HF']);
  assert.deepEqual(call({ action: 'lookup', code: '1' }).materials, ['PLA Basic', 'PLA Matte', 'PETG HF']);
});

test('Materialien-Blatt wird automatisch angelegt, falls setup nicht erneut lief', () => {
  const { call, sheets } = env();
  delete sheets.Materialien;
  assert.deepEqual(call({ action: 'materials' }).materials, ['PLA Basic', 'PLA Matte']);
});

test('Fortlaufende Nummer: neue Artikel bekommen höchste Nr. + 1, auch nach manueller Umnummerierung', () => {
  const { call, sheets } = env();
  call({ action: 'add', code: 'a', name: 'PLA', color: 'Rot' });
  call({ action: 'add', code: 'b', name: 'PLA', color: 'Blau' });
  assert.deepEqual(sheets.Bestand.rows.slice(1).map(r => [r[0], r[1]]), [[1, 'a'], [2, 'b']]);
  sheets.Bestand.rows[1][0] = 10; // im Sheet umnummeriert
  assert.equal(call({ action: 'add', code: 'c', name: 'PLA', color: 'Grün' }).item.nr, 11);
  const st = call({ action: 'stats' }).entries;
  assert.deepEqual(st.map(e => e.nr), [10, 2, 11]);
});

test('Altes Sheet ohne „Nr.“ wird automatisch umgestellt, Daten bleiben erhalten', () => {
  const { call, sheets } = env();
  const b = sheets.Bestand;
  b.rows.length = 0;
  b.rows.push(['Barcode', 'Bezeichnung', 'Farbe', 'Bestand', 'Zuletzt geändert', 'Mindestbestand'],
              ['111', 'PLA Basic', 'Weiß', 2, '', ''], ['222', 'PLA Matte', 'Schwarz', 5, '', 1]);
  const items = call({ action: 'list' }).items;
  assert.equal(b.rows[0][0], 'Nr.');
  assert.deepEqual(items.map(i => [i.nr, i.code, i.stock, i.min]), [[1, '111', 2, null], [2, '222', 5, 1]]);
  assert.equal(call({ action: 'add', code: '111' }).item.stock, 3);
  assert.equal(b.rows[1][4], 3);
  assert.equal(call({ action: 'add', code: '333', name: 'PLA', color: 'Rot' }).item.nr, 3);
  call({ action: 'list' }); // zweiter Aufruf darf nicht erneut umstellen
  assert.equal(b.rows[0][1], 'Barcode');
});

test('doGet liefert Lebenszeichen ohne Daten', () => {
  const { ctx } = env();
  assert.equal(ctx.doGet().ok, true);
  assert.equal(ctx.doGet().items, undefined);
});
