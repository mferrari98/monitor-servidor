# Monitor de Servidor

Sistema de monitoreo de recursos en tiempo real para servidores Linux con interfaz web moderna.

## Características

- **Monitoreo en tiempo real** de recursos del sistema
- **CPU**: Porcentaje de uso, número de cores, frecuencia
- **Memoria RAM**: Uso, disponible, porcentaje
- **Disco**: Espacio usado, libre, porcentaje
- **Red**: Interfaz activa, bytes enviados/recibidos
- **Temperatura y ventiladores**: Monitoreo térmico (si está disponible)
- **Servicios del sistema**: Estado de servicios críticos (guardias, reportespiolis, dash)
- **Gráficos interactivos**: Histórico de CPU y distribución de recursos
- **Actualización automática**: Cada 3 segundos

## Requisitos

- Python 3.8+
- Nginx
- Linux (Debian/Ubuntu)
- Permisos de root para instalación

## Instalación

1. **Clonar o descargar el proyecto** en `/var/www/monitor-servidor`

2. **Ejecutar el script de instalación**:
   ```bash
   sudo chmod +x install.sh
   sudo ./install.sh
   ```

   El script realizará:
   - Instalación de dependencias
   - Creación de entorno virtual Python
   - Configuración de Nginx
   - Creación y activación del servicio systemd
   - Inicio automático del monitor

3. **Acceder al monitor**:
   ```
   http://10.10.9.252/monitor
   ```

## Instalación Manual

Si prefieres instalar manualmente:

### 1. Instalar dependencias del sistema
```bash
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv nginx
```

### 2. Crear entorno virtual e instalar dependencias Python
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Configurar Nginx
Agregar al archivo `/etc/nginx/sites-available/default`:
```nginx
location /monitor {
    rewrite ^/monitor$ /monitor/ permanent;
}

location /monitor/ {
    proxy_pass http://127.0.0.1:8000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Probar y recargar nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Instalar y configurar el servicio
```bash
sudo cp monitor-servidor.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable monitor-servidor.service
sudo systemctl start monitor-servidor.service
```

### 5. Configurar permisos
```bash
sudo chown -R www-data:www-data /var/www/monitor-servidor
```

## Comandos Útiles

### Gestión del servicio
```bash
# Ver estado
sudo systemctl status monitor-servidor

# Iniciar
sudo systemctl start monitor-servidor

# Detener
sudo systemctl stop monitor-servidor

# Reiniciar
sudo systemctl restart monitor-servidor

# Ver logs en tiempo real
sudo journalctl -u monitor-servidor -f

# Ver logs del archivo
tail -f logs/monitor.log
tail -f logs/monitor-error.log
```

### Verificar funcionamiento
```bash
# Probar la API directamente
curl http://localhost:8000/api/system
curl http://localhost:8000/api/services

# Probar a través de nginx
curl http://10.10.9.252/monitor/api/system
```

## Estructura del Proyecto

```
/var/www/monitor-servidor/
├── app/
│   ├── main.py                 # Backend FastAPI
│   ├── static/
│   │   ├── css/
│   │   │   └── style.css      # Estilos CSS
│   │   └── js/
│   │       └── app.js         # JavaScript frontend
│   └── templates/
│       └── index.html         # Plantilla HTML
├── logs/                       # Logs de la aplicación
├── venv/                       # Entorno virtual Python
├── requirements.txt            # Dependencias Python
├── monitor-servidor.service    # Servicio systemd
├── nginx-monitor.conf         # Configuración nginx
├── install.sh                 # Script de instalación
└── README.md                  # Este archivo
```

## Agregar Nuevos Servicios

Para monitorear servicios adicionales, editar `app/main.py:120`:

```python
services = ["guardias.service", "reportespiolis.service", "dash.service", "nuevo-servicio.service"]
```

Luego reiniciar el servicio:
```bash
sudo systemctl restart monitor-servidor
```

## Personalización

### Cambiar intervalo de actualización
Editar `app/static/js/app.js:13`:
```javascript
setInterval(updateData, 3000); // 3000ms = 3 segundos
```

### Cambiar puerto de la aplicación
Editar `monitor-servidor.service` y cambiar `--port 8000` al puerto deseado.

### Modificar estilos
Editar `app/static/css/style.css` para personalizar colores, fuentes y diseño.

## Troubleshooting

### El servicio no inicia
```bash
# Verificar logs
sudo journalctl -u monitor-servidor -n 50

# Verificar permisos
ls -la /var/www/monitor-servidor

# Verificar que el entorno virtual existe
ls -la /var/www/monitor-servidor/venv
```

### Error 502 en nginx
```bash
# Verificar que el servicio está corriendo
sudo systemctl status monitor-servidor

# Verificar que escucha en el puerto correcto
ss -tlnp | grep 8000

# Ver logs de nginx
sudo tail -f /var/log/nginx/error.log
```

### No se muestran temperaturas
Las temperaturas requieren sensores de hardware compatibles con `psutil`. En algunos sistemas no están disponibles.

## Tecnologías Utilizadas

- **Backend**: FastAPI, Uvicorn, psutil
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Gráficos**: Chart.js
- **Servidor Web**: Nginx (proxy inverso)
- **Sistema**: systemd

## Licencia

Proyecto interno para monitoreo de servidor.
