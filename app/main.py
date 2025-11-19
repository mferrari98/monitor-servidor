#!/usr/bin/env python3
"""
Monitor de Recursos del Servidor
FastAPI backend para métricas del sistema
"""
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import psutil
import platform
from datetime import datetime
from typing import Dict, List
import os
import time
import json
import asyncio
from collections import deque
from threading import Lock

app = FastAPI(title="Monitor de Servidor")

# Variables globales para calcular velocidad de red
last_net_io = None
last_net_time = None

# Sistema de caché con promedios
class MetricsCache:
    def __init__(self, window_size=5):
        """
        Sistema de caché con ventana deslizante para promedios.
        window_size: cantidad de muestras para el promedio (segundos)
        """
        self.window_size = window_size
        self.cpu_samples = deque(maxlen=window_size)
        self.memory_samples = deque(maxlen=window_size)
        self.swap_samples = deque(maxlen=window_size)
        self.disk_samples = deque(maxlen=window_size)
        self.lock = Lock()
        self.cached_data = None
        self.last_update = 0
        self.snapshot_generation_time = None
        self.total_snapshots = 0

    def add_sample(self, cpu, memory, swap, disk):
        """Agregar nueva muestra a las colas"""
        with self.lock:
            self.cpu_samples.append(cpu)
            self.memory_samples.append(memory)
            self.swap_samples.append(swap)
            self.disk_samples.append(disk)

    def get_averages(self):
        """Obtener promedios de las ventanas"""
        with self.lock:
            if not self.cpu_samples:
                return None

            return {
                'cpu': sum(self.cpu_samples) / len(self.cpu_samples),
                'memory': sum(self.memory_samples) / len(self.memory_samples),
                'swap': sum(self.swap_samples) / len(self.swap_samples),
                'disk': sum(self.disk_samples) / len(self.disk_samples)
            }

    def update_cache(self, data):
        """Actualizar caché con datos completos"""
        with self.lock:
            self.cached_data = data
            self.last_update = time.time()
            self.snapshot_generation_time = datetime.now()
            self.total_snapshots += 1

    def get_cache(self):
        """Obtener datos cacheados con metadata"""
        with self.lock:
            if self.cached_data is None:
                return None

            # Agregar metadata sobre el caché
            cache_age = time.time() - self.last_update if self.last_update > 0 else 0

            return {
                **self.cached_data,
                "cache_metadata": {
                    "generated_at": self.snapshot_generation_time.isoformat() if self.snapshot_generation_time else None,
                    "age_seconds": round(cache_age, 2),
                    "total_snapshots": self.total_snapshots,
                    "update_interval": 5
                }
            }

# Instancia global del caché
metrics_cache = MetricsCache(window_size=5)

# Montar archivos estáticos y templates
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")


def get_size(bytes, suffix="B"):
    """Convertir bytes a formato legible"""
    factor = 1024
    for unit in ["", "K", "M", "G", "T", "P"]:
        if bytes < factor:
            return f"{bytes:.2f}{unit}{suffix}"
        bytes /= factor


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Renderizar página principal"""
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/system")
async def get_system_metrics():
    """Obtener métricas del sistema"""
    global last_net_io, last_net_time

    # CPU (sin intervalo para respuesta inmediata)
    cpu_percent = psutil.cpu_percent(interval=None)
    cpu_count = psutil.cpu_count()
    cpu_freq = psutil.cpu_freq()

    # Memoria RAM
    memory = psutil.virtual_memory()

    # Memoria SWAP
    swap = psutil.swap_memory()

    # Disco
    disk = psutil.disk_usage('/')

    # Red - calcular velocidad actual
    current_net_io = psutil.net_io_counters()
    current_time = time.time()

    # Calcular velocidad de red (bytes por segundo)
    bytes_sent_per_sec = 0
    bytes_recv_per_sec = 0

    if last_net_io is not None and last_net_time is not None:
        time_delta = current_time - last_net_time
        if time_delta > 0:
            bytes_sent_per_sec = (current_net_io.bytes_sent - last_net_io.bytes_sent) / time_delta
            bytes_recv_per_sec = (current_net_io.bytes_recv - last_net_io.bytes_recv) / time_delta

    # Actualizar valores anteriores
    last_net_io = current_net_io
    last_net_time = current_time

    net_interfaces = psutil.net_if_addrs()

    # Obtener nombre de interfaz principal (excluyendo loopback)
    main_interface = "N/A"
    for interface_name, interface_addresses in net_interfaces.items():
        if interface_name != 'lo' and not interface_name.startswith('docker'):
            main_interface = interface_name
            break

    # Temperatura (si está disponible)
    temps = {}
    try:
        temps_data = psutil.sensors_temperatures()
        if temps_data:
            for name, entries in temps_data.items():
                if entries:
                    temps[name] = entries[0].current
    except:
        pass

    # Ventiladores (si está disponible)
    fans = {}
    try:
        fans_data = psutil.sensors_fans()
        if fans_data:
            for name, entries in fans_data.items():
                if entries:
                    fans[name] = entries[0].current
    except:
        pass

    # Uptime
    boot_time = datetime.fromtimestamp(psutil.boot_time())
    uptime = datetime.now() - boot_time

    return {
        "cpu": {
            "percent": cpu_percent,
            "count": cpu_count,
            "frequency": cpu_freq.current if cpu_freq else 0
        },
        "memory": {
            "total": get_size(memory.total),
            "used": get_size(memory.used),
            "available": get_size(memory.available),
            "percent": memory.percent
        },
        "swap": {
            "total": get_size(swap.total),
            "used": get_size(swap.used),
            "free": get_size(swap.free),
            "percent": swap.percent
        },
        "disk": {
            "total": get_size(disk.total),
            "used": get_size(disk.used),
            "free": get_size(disk.free),
            "percent": disk.percent
        },
        "network": {
            "interface": main_interface,
            "bytes_sent": get_size(current_net_io.bytes_sent),
            "bytes_recv": get_size(current_net_io.bytes_recv),
            "bytes_sent_per_sec": bytes_sent_per_sec,
            "bytes_recv_per_sec": bytes_recv_per_sec
        },
        "temperature": temps,
        "fans": fans,
        "uptime": str(uptime).split('.')[0],
        "hostname": platform.node(),
        "os": f"{platform.system()} {platform.release()}"
    }


@app.get("/api/services")
async def get_services_status():
    """Obtener estado de servicios importantes"""
    services = ["guardias.service", "reportespiolis.service", "dash.service"]
    services_status = []

    for service in services:
        try:
            # Verificar si el servicio existe (usar sudo)
            result = os.popen(f"sudo systemctl is-active {service}").read().strip()
            is_running = result == "active"

            # Obtener información adicional
            status_result = os.popen(f"sudo systemctl status {service} 2>/dev/null | grep 'Active:' || echo 'inactive'").read().strip()

            services_status.append({
                "name": service,
                "status": "running" if is_running else "stopped",
                "active": is_running,
                "info": status_result if status_result else "N/A"
            })
        except Exception as e:
            services_status.append({
                "name": service,
                "status": "unknown",
                "active": False,
                "info": str(e)
            })

    return {"services": services_status}


@app.get("/api/logs")
async def get_system_logs():
    """Obtener logs de alertas del archivo"""
    try:
        log_file = "/var/www/monitor-servidor/logs/alerts.log"
        logs = []

        if os.path.exists(log_file):
            with open(log_file, 'r') as f:
                # Leer últimas 50 líneas
                lines = f.readlines()
                # Invertir para mostrar más recientes primero
                for line in reversed(lines[-50:]):
                    if line.strip():
                        logs.append(line.strip())

        # Si no hay logs, mostrar mensaje genérico sin timestamp
        if not logs:
            logs.append("[INFO] SYSTEM - Sin eventos registrados")

        return {"logs": logs}
    except Exception as e:
        return {"logs": [f"[ERROR] SYSTEM - Error al obtener logs: {str(e)}"]}


@app.get("/api/all")
async def get_all_data():
    """
    Obtener todos los datos en una sola llamada (optimizado con caché).
    Usa datos pre-calculados del caché para reducir carga del servidor.
    """
    try:
        # Obtener métricas del caché (pre-calculadas con promedios)
        system_data = metrics_cache.get_cache()

        # Si el caché no está listo, usar método tradicional
        if system_data is None:
            system_data = await get_system_metrics()

        # Obtener servicios (solo se consultan cuando se piden)
        services_data = await get_services_status()

        # Obtener logs (solo se leen cuando se piden)
        logs_data = await get_system_logs()

        return {
            "system": system_data,
            "services": services_data["services"],
            "logs": logs_data["logs"]
        }
    except Exception as e:
        return {
            "system": {},
            "services": [],
            "logs": [f"Error: {str(e)}"]
        }


def rotate_log_if_needed(log_file, max_size_mb=5):
    """
    Rotar el archivo de log si supera el tamaño máximo.
    Mantiene solo las últimas 100 líneas.
    """
    try:
        if os.path.exists(log_file):
            # Verificar tamaño del archivo
            size_mb = os.path.getsize(log_file) / (1024 * 1024)
            if size_mb > max_size_mb:
                # Leer últimas 100 líneas
                with open(log_file, 'r') as f:
                    lines = f.readlines()
                    last_lines = lines[-100:] if len(lines) > 100 else lines

                # Escribir de nuevo con solo las últimas líneas
                with open(log_file, 'w') as f:
                    f.writelines(last_lines)
                    f.write(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} [INFO] SYSTEM - Log rotado automáticamente (tamaño: {size_mb:.2f}MB)\n")
    except Exception as e:
        print(f"Error al rotar log: {e}")


@app.post("/api/log-alerts")
async def log_alerts(request: Request):
    """Registrar alertas en archivo de log"""
    try:
        data = await request.json()
        alerts = data.get("alerts", [])

        if not alerts:
            return {"status": "no alerts"}

        # Crear directorio de logs si no existe
        log_dir = "/var/www/monitor-servidor/logs"
        os.makedirs(log_dir, exist_ok=True)

        # Archivo de log de alertas
        log_file = os.path.join(log_dir, "alerts.log")

        # Rotar log si es necesario (máximo 5MB)
        rotate_log_if_needed(log_file, max_size_mb=5)

        # Leer alertas existentes de la última hora para evitar spam
        now = datetime.now()
        one_hour_ago = now.replace(minute=now.minute-1 if now.minute > 0 else 59)
        recent_alerts = {}

        if os.path.exists(log_file):
            # Leer últimas 50 líneas para verificar duplicados recientes
            with open(log_file, 'r') as f:
                lines = f.readlines()
                for line in lines[-50:]:
                    # Extraer tipo y nivel de alerta
                    parts = line.strip().split()
                    if len(parts) >= 4:
                        alert_key = f"{parts[2]}{parts[3]}"  # [LEVEL] TYPE
                        recent_alerts[alert_key] = line.strip()

        # Escribir nuevas alertas si no existen en la última hora
        with open(log_file, 'a') as f:
            for alert in alerts:
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                level = alert.get('level', 'INFO')
                alert_type = alert.get('type', 'SYSTEM')
                message = alert.get('message', '')
                value = alert.get('value', '')
                threshold = alert.get('threshold', '')

                log_entry = f"{timestamp} [{level}] {alert_type} - {message}: {value} (umbral: {threshold})"
                alert_key = f"[{level}]{alert_type}"

                # Solo escribir si no está en los recientes (evitar duplicados)
                if alert_key not in recent_alerts:
                    f.write(log_entry + "\n")
                    f.flush()  # Asegurar que se escriba inmediatamente

        return {"status": "ok", "logged": len(alerts)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/config")
async def get_config():
    """Obtener configuración de umbrales"""
    try:
        config_file = "/var/www/monitor-servidor/config/alerts.json"
        with open(config_file, 'r') as f:
            config = json.load(f)
        return config
    except Exception as e:
        # Valores por defecto si no se puede leer el archivo
        return {
            "thresholds": {
                "cpu": {"warning": 70, "critical": 90},
                "memory": {"warning": 50, "critical": 80},
                "swap": {"warning": 50, "critical": 80},
                "disk": {"warning": 70, "critical": 90}
            }
        }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


# ============================================
# SISTEMA DE RECOPILACIÓN DE MÉTRICAS EN SEGUNDO PLANO
# ============================================

async def collect_metrics_background():
    """
    Tarea en segundo plano que recopila métricas y genera snapshots cada 5 segundos.
    Los clientes SOLO leen estos datos pre-calculados, no generan nada.
    """
    global last_net_io, last_net_time

    # Inicializar psutil.cpu_percent() para que funcione correctamente
    psutil.cpu_percent(interval=None)
    await asyncio.sleep(0.5)

    # Contador para saber cuándo generar snapshot completo
    snapshot_counter = 0

    while True:
        try:
            # Recopilar métricas instantáneas SIEMPRE (cada 1 segundo)
            cpu_percent = psutil.cpu_percent(interval=None)
            memory = psutil.virtual_memory()
            swap = psutil.swap_memory()
            disk = psutil.disk_usage('/')

            # Agregar muestras al caché para promedios
            metrics_cache.add_sample(
                cpu=cpu_percent,
                memory=memory.percent,
                swap=swap.percent,
                disk=disk.percent
            )

            snapshot_counter += 1

            # Generar snapshot completo cada 5 segundos
            if snapshot_counter >= 5:
                snapshot_counter = 0
                averages = metrics_cache.get_averages()

                if averages:
                    # Calcular velocidad de red
                    current_net_io = psutil.net_io_counters()
                    current_time = time.time()

                    bytes_sent_per_sec = 0
                    bytes_recv_per_sec = 0

                    if last_net_io and last_net_time:
                        time_delta = current_time - last_net_time
                        if time_delta > 0:
                            bytes_sent_per_sec = (current_net_io.bytes_sent - last_net_io.bytes_sent) / time_delta
                            bytes_recv_per_sec = (current_net_io.bytes_recv - last_net_io.bytes_recv) / time_delta

                    last_net_io = current_net_io
                    last_net_time = current_time

                    # CPU info (solo una vez, no cambia)
                    cpu_freq = psutil.cpu_freq()
                    cpu_count = psutil.cpu_count()

                    # Información del sistema
                    uptime = datetime.now() - datetime.fromtimestamp(psutil.boot_time())

                    # Construir snapshot con datos promediados
                    cached_data = {
                        "cpu": {
                            "percent": round(averages['cpu'], 1),
                            "count": cpu_count,
                            "frequency": cpu_freq.current if cpu_freq else 0
                        },
                        "memory": {
                            "percent": round(averages['memory'], 1),
                            "total": get_size(memory.total),
                            "available": get_size(memory.available),
                            "used": get_size(memory.used)
                        },
                        "swap": {
                            "percent": round(averages['swap'], 1),
                            "total": get_size(swap.total),
                            "used": get_size(swap.used),
                            "free": get_size(swap.free)
                        },
                        "disk": {
                            "percent": round(averages['disk'], 1),
                            "total": get_size(disk.total),
                            "used": get_size(disk.used),
                            "free": get_size(disk.free)
                        },
                        "network": {
                            "bytes_sent_per_sec": round(bytes_sent_per_sec, 2),
                            "bytes_recv_per_sec": round(bytes_recv_per_sec, 2)
                        },
                        "uptime": str(uptime).split('.')[0],
                        "hostname": platform.node(),
                        "os": f"{platform.system()} {platform.release()}",
                        "timestamp": datetime.now().isoformat()
                    }

                    # Actualizar caché con timestamp
                    metrics_cache.update_cache(cached_data)
                    # Log reducido - solo cada 60 segundos (cada 12 snapshots)
                    if metrics_cache.total_snapshots % 12 == 0:
                        print(f"[{datetime.now().strftime('%H:%M:%S')}] Monitor activo - CPU: {averages['cpu']:.1f}%, MEM: {averages['memory']:.1f}%")

        except Exception as e:
            print(f"Error en recopilación de métricas: {e}")

        # Esperar 1 segundo antes de la siguiente recopilación
        await asyncio.sleep(1)


@app.on_event("startup")
async def startup_event():
    """Iniciar tarea en segundo plano al arrancar la aplicación"""
    # Escribir mensaje de inicio en el log de alertas (una sola vez)
    try:
        log_dir = "/var/www/monitor-servidor/logs"
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, "alerts.log")

        # Escribir mensaje con la hora de inicio
        startup_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        with open(log_file, 'a') as f:
            f.write(f"{startup_time} [INFO] SYSTEM - Monitor iniciado correctamente\n")
    except Exception as e:
        print(f"Error al escribir mensaje de inicio: {e}")

    asyncio.create_task(collect_metrics_background())
