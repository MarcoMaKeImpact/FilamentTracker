# Einrichtung – was du noch selbst erledigen musst

Alles, was ohne dein Google- und GitHub-Konto geht, ist fertig: App, Backend-Code, Icons und Tests. Die folgenden Schritte gehen nur mit deinen Zugängen. Dauer: etwa 10 Minuten.

Platzhalter, die du dabei erzeugst und am Ende brauchst:

| Platzhalter | Woher | Wohin |
|---|---|---|
| `<TOKEN>` | Schritt 2 (Funktion `createToken`) | App → ⚙︎ → Token |
| `<WEB_APP_URL>` | Schritt 4 (Bereitstellung) | App → ⚙︎ → Web-App-URL |

---

## 1. Apps Script an das Sheet hängen

1. Dein Sheet **„Filament Tracker“** öffnen:
   https://docs.google.com/spreadsheets/d/1Hpq8HSnjtRObWbiwXRvUgxbO1lqvXqRZJRJOm03xUIQ/edit
2. **Erweiterungen → Apps Script**.
3. Den Inhalt von `Code.gs` im Editor komplett durch [`apps-script/Code.gs`](apps-script/Code.gs) aus diesem Repo ersetzen. Mit 💾 speichern.
4. Optional: Projektname oben links auf „Filament-Tracker“ ändern.

## 2. Token erzeugen

1. Im Editor oben in der Funktionsauswahl **`createToken`** wählen und auf **▶ Ausführen** klicken.
2. Beim ersten Mal die Berechtigung bestätigen: *Berechtigungen prüfen → dein Konto → Erweitert → „Filament-Tracker (unsicher)“ öffnen → Zulassen*. Die Warnung ist normal, weil das Skript von dir selbst stammt und nicht von Google geprüft wurde.
3. Im **Ausführungsprotokoll** steht `TOKEN: …`. Diesen Wert kopieren, das ist dein `<TOKEN>`.
   Der Wert steht jetzt auch unter *Projekteinstellungen (⚙︎) → Skripteigenschaften → TOKEN*. Du kannst dort alternativ einen eigenen langen Zufallswert eintragen.

## 3. Sheet einrichten

1. In der Funktionsauswahl **`setup`** wählen und auf **▶ Ausführen** klicken.
2. Im Sheet gibt es jetzt die Blätter **Bestand** und **Log** mit Kopfzeilen und Warnfarben. Das leere „Tabellenblatt1“ wurde entfernt.

## 4. Als Web-App bereitstellen

1. **Bereitstellen → Neue Bereitstellung**.
2. Beim Zahnrad neben „Typ auswählen“ **Web-App** wählen.
3. Einstellungen:
   - Beschreibung: `v1`
   - Ausführen als: **Ich**
   - Zugriff: **Jeder** (nicht „Jeder mit Google-Konto“, sonst kann die App nicht zugreifen; geschützt wird über den Token)
4. **Bereitstellen** klicken und die **Web-App-URL** kopieren (endet auf `/exec`). Das ist deine `<WEB_APP_URL>`.
5. Test: Die URL im Browser öffnen. Es sollte `{"ok":true,"app":"filament-tracker","version":"1.1.0"}` erscheinen.

## 5. GitHub Pages einschalten

1. Das Repo hat bisher nur den Branch `claude/dazzling-cori-0ywne5`. Mach daraus `main`:
   **Settings → General → Default branch** → auf `claude/dazzling-cori-0ywne5` umstellen, dann unter **Code → Branches** den Branch in `main` umbenennen (✏️).
   Alternativ in Schritt 2 direkt `claude/dazzling-cori-0ywne5` als Branch wählen.
2. Im Repo **Settings → Pages**:
   - Source: **Deploy from a branch**
   - Branch: **`main`**, Ordner **`/docs`** → **Save**
3. Nach 1–2 Minuten ist die App erreichbar unter:
   **https://marcomakeimpact.github.io/FilamentTracker/**

> Hinweis: Bei einem privaten Repo setzt GitHub Pages ein kostenpflichtiges Konto (Pro/Team) voraus. Im kostenlosen Konto muss das Repo öffentlich sein. Im Repo stehen weder Token noch Web-App-URL, beides liegt nur auf deinem iPhone.

## 6. Auf dem iPhone installieren

**Variante A, per Link (am bequemsten):** Diesen Link mit deinen Werten zusammenbauen und auf dem iPhone in **Safari** öffnen, z. B. indem du ihn dir selbst schickst:

```
https://marcomakeimpact.github.io/FilamentTracker/#url=<WEB_APP_URL>&token=<TOKEN>
```

Der Link enthält deinen Token. Schick ihn also nur an dich selbst und lösche die Nachricht danach.

**Variante B, von Hand:** Die Seite in Safari öffnen, auf **⚙︎** tippen, Web-App-URL und Token eintragen, **Speichern**.

Danach in beiden Fällen:

1. **Teilen → Zum Home-Bildschirm**. Die App erscheint als „Filament“ auf dem Home-Bildschirm.
2. Die App vom Home-Bildschirm starten. Je nach iOS-Version hat sie dort einen eigenen Speicher. Ist das Einstellungsfeld leer, unter **⚙︎** den kompletten Einrichtungslink aus Variante A ins Feld „Web-App-URL“ einfügen und **Speichern** tippen. URL und Token werden dann automatisch getrennt.
3. **Kamerazugriff erlauben**.
4. Unter **⚙︎ → Verbindung testen** sollte „Verbindung OK“ erscheinen.

## 7. Abnahmetest (2 Minuten)

| Test | Erwartung |
|---|---|
| Modus „+“, unbekannten Karton scannen | Dialog fragt nach Bezeichnung, Farbe und Mindestbestand → „Neu angelegt … Bestand 1“ |
| Denselben Karton nach 3 s erneut scannen | „+1 … Bestand 2“ |
| Modus „−“, scannen | „−1 … Bestand 1“ |
| So lange entnehmen, bis 0 erreicht ist, dann noch einmal | „… ist schon bei 0“ |
| ⚙︎ → Token absichtlich falsch → Verbindung testen | „Token falsch …“, danach den richtigen Token wieder eintragen |
| Reiter Bestand / Statistik | Liste bzw. Zahlen erscheinen, im Sheet stehen die Log-Einträge |

---

## Updates später

- **App (`docs/`) geändert:** nach `main` pushen, GitHub Pages aktualisiert sich selbst. Vorher in `docs/sw.js` die Cache-Version hochzählen.
- **`Code.gs` geändert:** Code im Apps-Script-Editor ersetzen, dann **Bereitstellen → Bereitstellungen verwalten → ✏️ Bearbeiten → Version: Neue Version → Bereitstellen**. So bleibt die URL gleich. Eine „Neue Bereitstellung“ würde eine neue URL erzeugen.

## Fehlerbehebung

| Meldung in der App | Ursache / Lösung |
|---|---|
| „Token falsch oder auf dem Server nicht gesetzt“ | Token in der App und in den Skripteigenschaften vergleichen (Leerzeichen am Ende?) |
| „Antwort ist kein JSON …“ | URL endet nicht auf `/exec`, oder der Zugriff steht nicht auf „Jeder“ |
| „Sheet nicht eingerichtet …“ | Funktion `setup` im Editor ausführen |
| „Kamera nicht verfügbar“ | iPhone-Einstellungen → Safari → Kamera → Erlauben. Die Seite muss über https laufen (GitHub Pages) |
| Barcode wird nicht erkannt | Karton näher bzw. ruhiger halten, für Licht sorgen. Notfalls Code manuell eingeben |

## Optional: Deployment per clasp (statt Copy & Paste)

```bash
npm install -g @google/clasp
```

```bash
clasp login
```

Danach `apps-script/.clasp.json.example` nach `apps-script/.clasp.json` kopieren und die Script-ID eintragen (Apps Script → Projekteinstellungen → IDs). Dann im Ordner `apps-script`:

```bash
clasp push
```
