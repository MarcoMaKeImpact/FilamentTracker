// Nachbau der Apps-Script-Dienste (SpreadsheetApp, PropertiesService, …), lädt apps-script/Code.gs.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');

function fakeSheet(name) {
  const rows = [];
  return {
    name, rows,
    getLastRow: () => rows.length,
    appendRow: r => rows.push([...r]),
    getDataRange: () => ({ getValues: () => rows.map(r => [...r]) }),
    getRange: (a, c, nr, nc) => {
      const api = { setNumberFormat() { return api; }, setFontWeight() { return api; },
        setValues(v) { if (typeof a === 'number') v.forEach((vr, i) => vr.forEach((x, j) => {
          const row = rows[a - 1 + i] || (rows[a - 1 + i] = []); row[c - 1 + j] = x; })); return api; } };
      return api;
    },
    setFrozenRows() {}, setConditionalFormatRules(r) { this.rules = r; }
  };
}

function env(token = 'secret') {
  const sheets = { Tabellenblatt1: fakeSheet('Tabellenblatt1') };
  const ss = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = fakeSheet(n)),
    getSheets: () => Object.values(sheets),
    deleteSheet: s => { delete sheets[s.name]; }
  };
  const props = { TOKEN: token };
  const rule = () => { const b = { whenFormulaSatisfied: () => b, setBackground: () => b, setRanges: () => b, build: () => ({}) }; return b; };
  const ctx = {
    SpreadsheetApp: { getActive: () => ss, newConditionalFormatRule: rule },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }) },
    Utilities: { getUuid: () => '0123-4567' },
    Logger: { log() {} },
    Date
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  ctx.setup();
  const call = (body, tok = token) => ctx.doPost({ postData: { contents: JSON.stringify({ ...body, token: tok }) } });
  return { ctx, sheets, call, props };
}

module.exports = { env };
