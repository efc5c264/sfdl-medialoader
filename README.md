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

**Schnell-Installation mit Script (Linux/Mac):**
```bash
chmod +x start.sh       # Einmalig: Ausführbar machen
./start.sh install      # Installiert alle Abhängigkeiten automatisch
```

**Oder manuell:**
```bash
pip install pycryptodome requests
```

### 2. Konfiguration

Kopiere die Beispiel-Konfiguration:
```bash
cp .env.example .env
```

Öffne `.env` und passe die Einstellungen an:
```env
# Upload-Verzeichnis für SFDL-Dateien
UPLOAD_DIR=/uploads

# Medien-Hauptverzeichnis
MEDIA_DIR=/files

# Unterverzeichnisse (nutzen $MEDIA_DIR als Basis)
SERIEN_DIR=$MEDIA_DIR/serien
MOVIES_DIR=$MEDIA_DIR/movies
DOKU_DIR=$MEDIA_DIR/docus

# TMDB API Key für Film/Serien-Erkennung
TMDB_API_KEY=dein_api_key_hier

# Passwörter für Web-Interface
START_PASSWORD=letsgo
STOP_PASSWORD=stopmedaddy

# Optional: Forum-Login für automatischen SFDL-Link-Extrakt
FORUM_USERNAME=dein_username
FORUM_PASSWORD=dein_passwort
```

**TMDB API Key bekommen:**
1. Registriere dich auf [themoviedb.org](https://www.themoviedb.org/)
2. Gehe zu Einstellungen → API
3. Erstelle einen API Key (v4 Bearer Token)

### 3. Starten

**Manuell:**
```bash
python main.py
```

**Mit Start-Script (Linux/Mac):**
```bash
chmod +x start.sh       # Einmalig: Ausführbar machen
./start.sh install      # Abhängigkeiten installieren
./start.sh start        # Server starten
./start.sh status       # Status prüfen
./start.sh logs         # Live-Logs anzeigen
./start.sh restart      # Server neustarten
./start.sh stop         # Server stoppen
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

Du siehst den Fortschritt live in der **Media Bar** (unten rechts):

**Einzelne Dateien:**
```
Pluribus.2025.S01E08.German.DL.Atmos.1080p.ATVP.WEB.H265-ZeroTwo
Download läuft... • 1.95 GB                    ↓ 85.58 MB/s    47%

Dateien:
Pluribus.2025.S01E08...mkv    1.20 GB / 1.95 GB    47%
```

**Mehrere Archive:**
```
Movie.Title.2024.GERMAN.1080p.BluRay.x264
6 Archive werden geladen... • 8.42 GB         ↓ 42.15 MB/s    73%
⏱ 00:03:24

Dateien:
movie.r00                     1.45 GB / 1.45 GB    100%
movie.r01                     1.45 GB / 1.45 GB    100%
movie.r02                     982 MB / 1.45 GB     68%
movie.r03                     0 B / 1.45 GB        0%
```

**Features:**
- Echtzeit-Fortschritt für jede einzelne Datei
- Geschwindigkeit und verbleibende Zeit (ETA)
- Automatische Größenerkennung (GB/MB)
- SFDL-Dateien werden während Downloads aus der Liste ausgeblendet

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

### Dokumentationen

**Download:** `Planet.Earth.II.2016.COMPLETE.GERMAN.DOKU.1080p/`
```
Planet.Earth.II.E01.mkv
Planet.Earth.II.E02.mkv
Planet.Earth.II.E03.mkv
```

**Ergebnis:**
```
/docus/Planet.Earth.II.2016.COMPLETE.GERMAN.DOKU.1080p/
  Planet.Earth.II.E01.mkv
  Planet.Earth.II.E02.mkv
  Planet.Earth.II.E03.mkv
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
- **Media Bar:** Erweiterte Download-Anzeige mit:
  - Einzelnen Dateien und deren Fortschritt
  - Download-Geschwindigkeit in MB/s
  - Verbleibende Zeit (ETA) im Format HH:MM:SS
  - Gesamtgröße und bereits heruntergeladene Bytes
  - Automatische Erkennung von Archiv-Downloads
- **Dateiliste:** Alle hochgeladenen SFDLs (aktive Downloads ausgeblendet)

### SFDL-Verwaltung
- **Umbenennen:** Klick auf Namen → neuen Namen eingeben
- **Löschen:** Klick auf Mülleimer-Icon
- **Typ ändern:** Bei `unknown` kannst du manuell Film/Serie wählen
- **Auto-Hide:** Downloads verschwinden automatisch aus der Liste während sie laufen

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

### Download bleibt bei X% stehen
- Das Tool schätzt die finale Größe während des Downloads
- Bei Dateien ohne Index-Info kann es zu Abweichungen kommen
- Am Ende wird automatisch auf 100% korrigiert

### Fortschritt zeigt falsche Werte
- Der lftp-Index unterstützt zwei Formate (mit/ohne User/Group)
- Bei Parsing-Fehlern werden Dateien während des Downloads erkannt
- Nur Dateien des aktuellen Downloads werden gezählt (keine vorhandenen Dateien)

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

**Q: Warum sehe ich meine SFDL-Datei nicht mehr?**  
A: Während ein Download läuft, wird die SFDL automatisch aus der Liste ausgeblendet. Nach Abschluss wird sie gelöscht oder erscheint wieder.

**Q: Wie genau ist die Fortschrittsanzeige?**  
A: Bei Dateien mit Index-Info sehr genau. Ohne Index wird die Größe geschätzt anhand der Wachstumsrate. Am Ende wird immer auf die tatsächliche Größe korrigiert.

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

