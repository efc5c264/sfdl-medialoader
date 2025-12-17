#!/bin/bash
# SFLD-Medialoader Control Script
# Usage: ./start.sh [start|stop|restart|status]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/medialoader.pid"
LOG_FILE="$SCRIPT_DIR/logs/medialoader.log"
PYTHON_SCRIPT="$SCRIPT_DIR/main.py"

# Farben für Ausgabe
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Log-Verzeichnis erstellen
mkdir -p "$SCRIPT_DIR/logs"

start() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo -e "${YELLOW}Server läuft bereits (PID: $PID)${NC}"
            return 1
        else
            echo -e "${YELLOW}Alte PID-Datei gefunden, wird entfernt...${NC}"
            rm -f "$PID_FILE"
        fi
    fi

    echo -e "${GREEN}Starte SFLD-Medialoader...${NC}"
    
    # Python-Umgebung prüfen
    if command -v python3 &> /dev/null; then
        PYTHON_CMD="python3"
    elif command -v python &> /dev/null; then
        PYTHON_CMD="python"
    else
        echo -e "${RED}Fehler: Python nicht gefunden!${NC}"
        exit 1
    fi

    # Server im Hintergrund starten
    nohup $PYTHON_CMD "$PYTHON_SCRIPT" >> "$LOG_FILE" 2>&1 &
    PID=$!
    echo $PID > "$PID_FILE"
    
    sleep 2
    
    if ps -p "$PID" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Server gestartet (PID: $PID)${NC}"
        echo -e "${GREEN}✓ Web-Interface: http://localhost:8282${NC}"
        echo -e "Log-Datei: $LOG_FILE"
    else
        echo -e "${RED}✗ Server konnte nicht gestartet werden${NC}"
        echo -e "Siehe Log: $LOG_FILE"
        rm -f "$PID_FILE"
        exit 1
    fi
}

stop() {
    if [ ! -f "$PID_FILE" ]; then
        echo -e "${YELLOW}Server läuft nicht (keine PID-Datei gefunden)${NC}"
        return 1
    fi

    PID=$(cat "$PID_FILE")
    
    if ! ps -p "$PID" > /dev/null 2>&1; then
        echo -e "${YELLOW}Server läuft nicht (PID $PID existiert nicht)${NC}"
        rm -f "$PID_FILE"
        return 1
    fi

    echo -e "${YELLOW}Stoppe SFLD-Medialoader (PID: $PID)...${NC}"
    kill "$PID"
    
    # Warte bis zu 10 Sekunden auf sauberes Beenden
    for i in {1..10}; do
        if ! ps -p "$PID" > /dev/null 2>&1; then
            break
        fi
        sleep 1
    done
    
    # Wenn noch läuft, force kill
    if ps -p "$PID" > /dev/null 2>&1; then
        echo -e "${YELLOW}Force kill...${NC}"
        kill -9 "$PID"
        sleep 1
    fi
    
    if ! ps -p "$PID" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Server gestoppt${NC}"
        rm -f "$PID_FILE"
    else
        echo -e "${RED}✗ Server konnte nicht gestoppt werden${NC}"
        exit 1
    fi
}

restart() {
    echo -e "${YELLOW}Starte Server neu...${NC}"
    stop
    sleep 2
    start
}

status() {
    if [ ! -f "$PID_FILE" ]; then
        echo -e "${RED}✗ Server läuft nicht${NC}"
        return 1
    fi

    PID=$(cat "$PID_FILE")
    
    if ps -p "$PID" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Server läuft (PID: $PID)${NC}"
        echo -e "  Web-Interface: http://localhost:8282"
        echo -e "  Log-Datei: $LOG_FILE"
        
        # Zeige letzte Log-Zeilen
        if [ -f "$LOG_FILE" ]; then
            echo ""
            echo "Letzte 5 Log-Einträge:"
            tail -n 5 "$LOG_FILE"
        fi
    else
        echo -e "${RED}✗ Server läuft nicht (PID $PID existiert nicht)${NC}"
        rm -f "$PID_FILE"
        return 1
    fi
}

logs() {
    if [ -f "$LOG_FILE" ]; then
        echo "Log-Datei: $LOG_FILE"
        echo "---"
        tail -f "$LOG_FILE"
    else
        echo -e "${YELLOW}Keine Log-Datei gefunden${NC}"
    fi
}

# Hauptprogramm
case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    status)
        status
        ;;
    logs)
        logs
        ;;
    *)
        echo "SFLD-Medialoader Control Script"
        echo ""
        echo "Usage: $0 {start|stop|restart|status|logs}"
        echo ""
        echo "Befehle:"
        echo "  start   - Server starten"
        echo "  stop    - Server stoppen"
        echo "  restart - Server neustarten"
        echo "  status  - Server-Status prüfen"
        echo "  logs    - Live-Logs anzeigen (Strg+C zum Beenden)"
        echo ""
        exit 1
        ;;
esac

exit 0
