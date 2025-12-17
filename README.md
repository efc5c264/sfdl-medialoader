# SFLD-Medialoader

Ein automatischer Download-Manager für SFDL-Dateien, der Filme und Serien automatisch erkennt, herunterlädt und sortiert.

## Was macht das Tool?

Du lädst eine SFDL-Datei hoch, der Rest passiert automatisch:
- Erkennt ob Film oder Serie (über TMDB)
- Lädt alle Dateien herunter
- Entpackt Archive automatisch
- Sortiert Dateien in die richtigen Ordner
- Löscht unnötige Dateien (Samples, NFO, etc.)

**Ergebnis:** Filme landen in `/movies/`, Serien in `/serien/Serienname/Season 01/`

---

## Schnellstart

### 1. Installation

**Voraussetzungen:**
- Python 3.7 oder höher
- `unrar` (für Archive)

**Pakete installieren:**
```bash
pip install pycryptodome requests
```

### 2. Konfiguration

Kopiere die Beispiel-Konfiguration:
```bash
cp .env.example .env
```

Öffne `.env` und passe die Pfade an:
```env
# Wo landen die heruntergeladenen Dateien?
FILES_DIR=/uploads
DOWNLOADS_DIR=/files

# TMDB API Key für Film/Serien-Erkennung
TMDB_API_KEY=dein_api_key_hier

# Passwörter für Web-Interface
START_PASSWORD=geheim123
STOP_PASSWORD=stop456
```

**TMDB API Key bekommen:**
1. Registriere dich auf [themoviedb.org](https://www.themoviedb.org/)
2. Gehe zu Einstellungen → API
3. Erstelle einen API Key (v4 Bearer Token)

### 3. Starten

```bash
python main.py
```

Das wars! Öffne deinen Browser: `http://localhost:8282`

---

## Wie benutze ich es?

### SFDL hochladen

Im Web-Interface hast du 3 Möglichkeiten:

**1. Per URL** (einfachste Methode)
```
http://example.com/movie.sfdl
```
Klick auf "SFDL hochladen" → Tab "URL" → Link einfügen → Hochladen

**2. Per Datei-Upload**
Ziehe eine `.sfdl` Datei auf den Upload-Bereich (Drag & Drop)

**3. Per Text**
Kopiere den Inhalt einer SFDL-Datei und füge ihn ein

### Download starten

Nach dem Upload:
1. Die SFDL erscheint in der Liste mit einem Badge (Film oder Serie)
2. Klicke auf "Loader starten"
3. Der Download beginnt automatisch

### Was passiert jetzt?

Du siehst den Fortschritt live:
```
Status: LÄUFT
Aktion: Lade Dateien herunter (45/120)
Fortschritt: ████████░░░░ 65%
```

Wenn alles fertig ist:
```
Status: BEREIT
```

---

## Wie werden Dateien organisiert?

### Filme

**Download:** `The.Matrix.1999.GERMAN.1080p.BluRay.x264/`
```
The.Matrix.1999.GERMAN.1080p.BluRay.x264.mkv
The.Matrix.1999.sample.mkv (wird gelöscht)
The.Matrix.1999.nfo (wird gelöscht)
```

**Ergebnis:** `/movies/The.Matrix.1999.GERMAN.1080p.BluRay.mkv`

### Serien

**Download:** `Breaking.Bad.S01-S05.COMPLETE.GERMAN.1080p/`
```
Season 01/
  Breaking.Bad.S01E01.mkv
  Breaking.Bad.S01E02.mkv
Season 02/
  Breaking.Bad.S02E01.mkv
```

**Ergebnis:**
```
/serien/Breaking Bad/
  Season 01/
    Breaking.Bad.S01E01.mkv
    Breaking.Bad.S01E02.mkv
  Season 02/
    Breaking.Bad.S02E01.mkv
```

---

## Einstellungen

### In der `.env` Datei

```env
# Archive automatisch entpacken?
EXTRACT_ARCHIVES=true

# Archive nach dem Entpacken löschen?
REMOVE_ARCHIVES=true

# Wie viele parallele Downloads?
MAX_THREADS=3
```

### Passwort-Datei

Verschlüsselte SFDLs benötigen Passwörter. Füge sie zur `passwords.txt` hinzu.

Jede Zeile = ein Passwort. Das Tool probiert alle durch.

---

## Web-Interface Funktionen

### Dashboard
- **Live-Status:** Siehst sofort was gerade läuft
- **Fortschrittsbalken:** Prozentuale Anzeige
- **Dateiliste:** Alle hochgeladenen SFDLs

### SFDL-Verwaltung
- **Umbenennen:** Klick auf Namen → neuen Namen eingeben
- **Löschen:** Klick auf Mülleimer-Icon
- **Typ ändern:** Bei `unknown` kannst du manuell Film/Serie wählen

### Badges erklärt
- **Film (2024):** Erkannter Film mit Jahr
- **Serie (3 Staffeln, 24 Episoden):** Erkannte Serie mit Details
- **unknown:** Nicht erkannt → manuell korrigieren

---

## Problemlösung

### "Could not find password"
- Prüfe ob `passwords.txt` existiert
- Füge mehr Passwörter hinzu
- Gängig sind: `mlcboard.com`, `mega.nz`

### "Failed login attempt"
- Passwort in `.env` falsch
- Standard-Passwort: `startnow123`

### TMDB findet nichts
- Name enthält zu viele Tags (REMASTERED, PROPER, etc.)
- Manuell korrigieren: Klick auf "Film" oder "Serie" Button

### Download funktioniert nicht
- FTP-Server offline?
- Passwort für SFDL falsch?
- Logs anschauen: `logs/` Ordner

---

## Projekt-Struktur

```
SFDL/
├── .env                 # Deine Einstellungen
├── main.py             # Webserver (starten mit python main.py)
├── passwords.txt       # Passwörter für verschlüsselte SFDLs
├── src/
│   └── downloader.py   # Download-Logik
├── static/
│   ├── index.html      # Web-Interface
│   └── js/status.js    # Frontend-Logik
└── logs/               # Log-Dateien
```

---

## Tipps & Tricks

### Port ändern
```bash
python main.py port=9000
```

### Mit IP-Adresse starten
```bash
python main.py ip=192.168.1.100 port=8282
```

### Nur bestimmte Dateien herunterladen
Momentan noch nicht möglich, es wird immer alles heruntergeladen.

### Mehrere Downloads gleichzeitig
Ändere `MAX_THREADS` in der `.env`:
```env
MAX_THREADS=5  # Vorsicht: Mehr = schneller, aber Server-Last steigt
```

---

## Häufig gestellte Fragen

**Q: Brauche ich einen TMDB Account?**  
A: Ja, für die Film/Serien-Erkennung. Der API Key ist kostenlos.

**Q: Kann ich das Tool auf einem Server laufen lassen?**  
A: Ja! Einfach auf dem Server starten und per IP:Port darauf zugreifen.

**Q: Werden die Originaldateien gelöscht?**  
A: Nur wenn `REMOVE_ARCHIVES=true`. Die entpackten Dateien bleiben erhalten.

**Q: Was passiert mit Samples und NFO-Dateien?**  
A: Werden automatisch gelöscht. Samples braucht man nicht, NFOs sind meist nur Werbung.

**Q: Kann ich das Interface anpassen?**  
A: Ja! Bearbeite `static/index.html` und `static/js/status.js`

---

## Entwickelt für

Leute, die keine Lust haben:
- Manuell FTP-Clients zu bedienen
- Dateien händisch zu sortieren
- Archive einzeln zu entpacken
- Sample-Dateien zu löschen

**Einfach SFDL hochladen und fertig!**

---

## Haftungsausschluss

Dieses Tool dient ausschließlich dem Download von **legalen Inhalten**, für die der Nutzer die entsprechenden Rechte besitzt.

**Wichtige Hinweise:**
- Die Nutzung erfolgt auf **eigene Verantwortung**
- Der Entwickler übernimmt **keine Haftung** für heruntergeladene Inhalte
- Der Nutzer ist selbst verantwortlich für die Einhaltung geltender Urheberrechtsgesetze
- Dieses Tool ist **nicht** für die Verbreitung urheberrechtlich geschützter Inhalte gedacht
- Verstöße gegen Urheberrechte sind strafbar und werden vom Entwickler nicht unterstützt

**Nutzung auf eigenes Risiko.** Bei Missbrauch haftet ausschließlich der Nutzer.

---

## Lizenz

MIT License

Copyright (c) 2025 SFLD-Medialoader

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

