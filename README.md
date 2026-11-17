# Filament-Tracker

Filamentspulen per iPhone-Kamera scannen (EAN-Barcode auf dem Bambu-Karton) und im Google Sheet zählen: verpackte Spulen und Spulen in Verwendung. Unbekannte Barcodes werden beim ersten Hinzufügen mit Material, Farbe und optionalem Mindestbestand angelegt.

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

**Bestand:** Nr. | Barcode | Bezeichnung | Farbe | Verpackt | In Verwendung | Zuletzt geändert | Mindestbestand

- **Nr.** ist eine fortlaufende Nummer (neue Artikel: höchste Nr. + 1). Sie bestimmt die Reihenfolge im Reiter „Bestand“ der App und darf im Sheet frei geändert werden. Ältere Sheets werden beim ersten Aufruf automatisch auf dieses Layout umgestellt.
- **Verpackt** = Spulen im Karton, **In Verwendung** = offene Spulen. Mindestbestand gilt für die Summe aus beiden.
**Materialien:** Material (Spalte A, ab Zeile 2) – Quelle der Auswahlliste „Material“ in der App, Standard: PLA Basic, PLA Matte. Einfach weitere Zeilen eintragen. Das Blatt wird automatisch angelegt, falls es fehlt.
**Log:** Zeit | Barcode | Bezeichnung | Farbe | Änderung | Art (Kauf, Geöffnet, Leer, Korrektur)

- Spalte B (Barcode) ist als Text formatiert, damit führende Nullen erhalten bleiben.
- Bedingte Formatierung: Bestand 0 wird rot, Bestand ≤ Mindestbestand orange.
- **Mindestbestand** (optional): Ab dieser Spulenzahl warnt die App, z. B. bei Mindestbestand 2 schon bei 2 Spulen, damit rechtzeitig nachgekauft wird. Bestand ≤ Mindestbestand wird orange, Bestand 0 rot.
- Den Mindestbestand kannst du beim Anlegen in der App eingeben oder später direkt im Sheet in Spalte H eintragen.
- Bezeichnung und Farbe darfst du im Sheet jederzeit ändern. Den Barcode in Spalte B solltest du nicht ändern.

## API (Apps Script, `POST`, Body JSON als `text/plain`)

Jede Anfrage enthält `token`. Die Antwort ist immer `{ ok: true|false, … }`.

| `action` | weitere Felder | Antwort |
|---|---|---|
| `ping` | – | `{ ok, version }` (Verbindungstest) |
| `materials` | – | `{ ok, materials: ["PLA Basic", …] }` |
| `list` | – | `{ ok, items: [{ code, name, color, stock, min }] }` |
| `lookup` | `code` | `{ ok, found, item, materials }` |
| `add` | `code`, `qty` (1–999), bei neuem Code `name`, `color`, optional `min` | `{ ok, qty, item, created? }` oder `error: need_details` |
| `open` | `code` | Verpackt −1, In Verwendung +1 (Art „Geöffnet“) |
| `empty` | `code` | In Verwendung −1 (Art „Leer“ = verbraucht) |
| `adjust` | `code`, `field` (`packed`/`used`), `delta` (±1) | Korrektur (Art „Korrektur“) |
| `remove` | `code` | wie `open` (für ältere App-Versionen) |
| `stats` | – | `{ ok, entries: [{ t, label, d }] }` |

Mögliche Fehler: `unauthorized`, `busy`, `setup_missing`, `no_code`, `bad_action`, `need_details`, `unknown_code`, `empty`.
Ein `GET` auf die Web-App-URL liefert nur ein Lebenszeichen (`{"ok":true,"app":"filament-tracker",…}`) und keine Daten.

Die App sendet mit `Content-Type: text/plain`, damit der Browser keinen CORS-Preflight auslöst, den Apps Script nicht beantworten kann.

## Funktionen der App

- **Scannen:** Modus „+ Hinzufügen“ oder „📦→🔄 Öffnen“ wählen, auf „📷 Scannen“ tippen. Die Kamera geht nach einem Treffer, beim Reiterwechsel, beim Verlassen der App und nach 60 s ohne Treffer sofort aus (Akku). Beim Hinzufügen fragt eine Box nach der Menge, bei neuen Artikeln zusätzlich nach Material (Auswahlliste), Farbe und Mindestbestand. Erkannt werden EAN-13/EAN-8/UPC/Code-128/QR. Auf iPhones mit Makro-Kamera (Pro) wird automatisch die Dreifach-Kamera genutzt; Zoom-Regler und Kamera-Auswahl in ⚙︎. Grün, gelb oder rot hinterlegte Rückmeldung mit Piepton. Barcodes lassen sich auch manuell eingeben.
- **Bestand:** Oben verpackt / in Verwendung / gesamt. Liste in der Reihenfolge der Nr. (Nr. · Farbe · 📦 · 🔄). Tipp auf eine Zeile öffnet die Details: „Spule öffnen“ (📦→🔄), „Spule leer“ (🔄 −1, zählt als verbraucht) und −/+ als Korrektur. Orange/Rot = am/unter Mindestbestand bzw. alles leer.
- **Statistik:** Verbraucht (= „Spule leer“) und gekauft (= Hinzufügen) je Farbe/Material für diesen Monat, dieses Jahr oder einen frei wählbaren Zeitraum, rechts daneben die Gesamtwerte.
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
