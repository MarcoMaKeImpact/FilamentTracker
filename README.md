# Filament-Tracker

Filamentspulen per iPhone-Kamera scannen (EAN-Barcode auf dem Bambu-Karton) und den Bestand in einem Google Sheet um **+1** (Hinzufügen) oder **−1** (Entnehmen) ändern. Unbekannte Barcodes werden beim ersten Hinzufügen mit Bezeichnung, Farbe und optionalem Mindestbestand angelegt.

```
iPhone (PWA, GitHub Pages)  ──POST JSON + Token──▶  Apps Script Web-App  ──▶  Google Sheet „Filament Tracker“
                                                                               ├─ Bestand
                                                                               └─ Log
```

> **Was du noch tun musst:** siehe [EINRICHTUNG.md](EINRICHTUNG.md). Das ist eine Checkliste mit allen Schritten, die nur mit deinem Google- bzw. GitHub-Konto gehen (etwa 10 Minuten).

## Repo-Struktur

| Pfad | Inhalt |
|---|---|
| `docs/` | Die PWA, wird von GitHub Pages ausgeliefert (Branch `main`, Ordner `/docs`) |
| `docs/index.html` | App: Scannen, Bestand, Statistik, Einstellungen |
| `docs/sw.js` | Offline-Fähigkeit (`manifest.json` liegt bei, ist aber absichtlich nicht eingebunden, siehe unten) |
| `docs/vendor/html5-qrcode.min.js` | Scanner-Bibliothek html5-qrcode 2.3.8 (lokal statt CDN, Apache-2.0) |
| `docs/icon-*.png`, `docs/apple-touch-icon.png` | Icons, erzeugt mit `tools/make_icons.py` |
| `apps-script/Code.gs` | Backend (Google Apps Script) |
| `apps-script/appsscript.json` | Manifest (Zeitzone Europe/Berlin, Web-App-Einstellungen), nur für clasp nötig |
| `tests/code.test.js` | Unit-Tests für `Code.gs` gegen ein nachgebautes Sheet (`npm test`) |
| `tests/e2e/smoke.js` | Browser-Test der App gegen das echte `Code.gs` (`npm run e2e`, braucht Playwright) |
| `tools/make_icons.py` | Icon-Generator (Pillow) |

## Sheet-Aufbau

**Bestand:** Barcode | Bezeichnung | Farbe | Bestand | Zuletzt geändert | Mindestbestand
**Log:** Zeit | Barcode | Bezeichnung | Farbe | Änderung

- Spalte A ist als Text formatiert, damit führende Nullen erhalten bleiben.
- Bedingte Formatierung: Bestand 0 wird rot, Bestand ≤ Mindestbestand orange.
- Den Mindestbestand kannst du beim Anlegen in der App eingeben oder später direkt im Sheet in Spalte F eintragen.
- Bezeichnung und Farbe darfst du im Sheet jederzeit ändern. Den Barcode in Spalte A solltest du nicht ändern.

## API (Apps Script, `POST`, Body JSON als `text/plain`)

Jede Anfrage enthält `token`. Die Antwort ist immer `{ ok: true|false, … }`.

| `action` | weitere Felder | Antwort |
|---|---|---|
| `ping` | – | `{ ok, version }` (Verbindungstest) |
| `list` | – | `{ ok, items: [{ code, name, color, stock, min }] }` |
| `lookup` | `code` | `{ ok, found, item }` |
| `add` | `code`, bei neuem Code `name`, `color`, optional `min` | `{ ok, item, created? }` oder `error: need_details` |
| `remove` | `code` | `{ ok, item }` oder `error: empty` / `unknown_code` |
| `stats` | – | `{ ok, entries: [{ t, label, d }] }` |

Mögliche Fehler: `unauthorized`, `busy`, `setup_missing`, `no_code`, `bad_action`, `need_details`, `unknown_code`, `empty`.
Ein `GET` auf die Web-App-URL liefert nur ein Lebenszeichen (`{"ok":true,"app":"filament-tracker",…}`) und keine Daten.

Die App sendet mit `Content-Type: text/plain`, damit der Browser keinen CORS-Preflight auslöst, den Apps Script nicht beantworten kann.

## Funktionen der App

- **Scannen:** Modus „+ Hinzufügen“ oder „− Entnehmen“, Kamera mit EAN-13/EAN-8/UPC/Code-128/QR. Wird derselbe Code innerhalb von 3 Sekunden erneut erkannt, zählt er nur einmal. Grün, gelb oder rot hinterlegte Rückmeldung mit Piepton. Barcodes lassen sich auch manuell eingeben.
- **Bestand:** Liste nach Farbe sortiert, mit Suchfeld und Summe. Rot heißt leer, orange heißt Mindestbestand erreicht.
- **Statistik:** Verbraucht und gekauft je Farbe/Material für diesen Monat, dieses Jahr oder einen frei wählbaren Zeitraum, rechts daneben die Gesamtwerte.
- **Einstellungen:** Web-App-URL und Token (nur lokal auf dem Gerät gespeichert), Knopf „Verbindung testen“.
- **Einrichtung per Link:** `https://marcomakeimpact.github.io/FilamentTracker/#url=<WEB_APP_URL>&token=<TOKEN>` trägt beides automatisch ein. Die Werte bleiben in der Adresse, damit „Zum Home-Bildschirm“ sie ins Icon übernimmt. So gehen sie auch dann nicht verloren, wenn iOS den Speicher der App leert. Der Teil nach `#` wird nie an einen Server gesendet. Deshalb ist bewusst kein `<link rel="manifest">` eingebunden, sonst würde iOS die `start_url` ohne Einstellungen verwenden.

## Entwicklung

```bash
npm test
```

```bash
npm run e2e
```

```bash
npm run serve
```

`npm run serve` startet die App lokal auf http://localhost:8080. Die Kamera funktioniert nur über HTTPS oder auf localhost.

Nach Änderungen an der App die Konstante `C` in `docs/sw.js` hochzählen (z. B. `filament-v3`), damit installierte Apps den neuen Stand sicher übernehmen. Nach Änderungen an `Code.gs` muss im Apps-Script-Editor eine **neue Version bereitgestellt** werden (siehe EINRICHTUNG.md, Schritt „Updates“).

## Eigene Etiketten

Bambu-Kartons tragen in der Regel einen EAN-Barcode. Hat ein Karton keinen, drucke ein eigenes Etikett mit einem beliebigen eindeutigen Code als **Code-128** oder **QR**, z. B. `FIL-0001`. Die App liest beide Formate.
