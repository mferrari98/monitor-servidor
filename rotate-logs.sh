#!/bin/bash
# Script para rotar logs del monitor

LOG_DIR="/var/www/monitor-servidor/logs"
MAX_SIZE=10485760  # 10MB en bytes

# Función para rotar un archivo si supera el tamaño máximo
rotate_if_needed() {
    local file=$1
    if [ -f "$file" ]; then
        size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
        if [ $size -gt $MAX_SIZE ]; then
            # Guardar últimas 100 líneas y limpiar
            tail -100 "$file" > "${file}.tmp"
            mv "${file}.tmp" "$file"
            echo "$(date '+%Y-%m-%d %H:%M:%S') - Log rotado: $file"
        fi
    fi
}

# Rotar logs si son necesarios
rotate_if_needed "$LOG_DIR/monitor.log"
rotate_if_needed "$LOG_DIR/monitor-error.log"
rotate_if_needed "$LOG_DIR/alerts.log"
