#!/bin/bash
# Script de instalación para Monitor de Servidor

set -e

echo "==================================="
echo "Instalación Monitor de Servidor"
echo "==================================="

# Verificar que se ejecuta como root
if [ "$EUID" -ne 0 ]; then
    echo "Por favor ejecuta este script como root (sudo ./install.sh)"
    exit 1
fi

echo ""
echo "1. Instalando dependencias del sistema..."
apt-get update
apt-get install -y python3 python3-pip python3-venv nginx

echo ""
echo "2. Creando entorno virtual de Python..."
python3 -m venv venv
source venv/bin/activate

echo ""
echo "3. Instalando dependencias de Python..."
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "4. Configurando permisos..."
chown -R www-data:www-data /var/www/monitor-servidor
chmod +x install.sh

echo ""
echo "5. Instalando servicio systemd..."
cp monitor-servidor.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable monitor-servidor.service

echo ""
echo "6. Configurando Nginx..."
# Buscar el archivo de configuración principal de nginx
NGINX_CONF="/etc/nginx/sites-available/default"

# Verificar si ya existe la configuración
if grep -q "location /monitor" "$NGINX_CONF"; then
    echo "La configuración de /monitor ya existe en nginx"
else
    echo "Agregando configuración a nginx..."
    # Insertar la configuración antes del último }
    sed -i '/^}$/i \
    # Monitor de Servidor\
    location /monitor {\
        rewrite ^/monitor$ /monitor/ permanent;\
    }\
\
    location /monitor/ {\
        proxy_pass http://127.0.0.1:8000/;\
        proxy_http_version 1.1;\
        proxy_set_header Host $host;\
        proxy_set_header X-Real-IP $remote_addr;\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\
        proxy_set_header X-Forwarded-Proto $scheme;\
        proxy_set_header Upgrade $http_upgrade;\
        proxy_set_header Connection "upgrade";\
        proxy_connect_timeout 60s;\
        proxy_send_timeout 60s;\
        proxy_read_timeout 60s;\
    }' "$NGINX_CONF"
fi

echo ""
echo "7. Probando configuración de Nginx..."
nginx -t

echo ""
echo "8. Iniciando servicios..."
systemctl start monitor-servidor.service
systemctl reload nginx

echo ""
echo "==================================="
echo "✅ Instalación completada!"
echo "==================================="
echo ""
echo "El monitor está disponible en: http://10.10.9.252/monitor"
echo ""
echo "Comandos útiles:"
echo "  - Ver estado: systemctl status monitor-servidor"
echo "  - Ver logs: journalctl -u monitor-servidor -f"
echo "  - Reiniciar: systemctl restart monitor-servidor"
echo "  - Detener: systemctl stop monitor-servidor"
echo ""
