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

app = FastAPI(title="Monitor de Servidor")

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

    # CPU (sin intervalo para respuesta inmediata)
    cpu_percent = psutil.cpu_percent(interval=None)
    cpu_count = psutil.cpu_count()
    cpu_freq = psutil.cpu_freq()

    # Memoria RAM
    memory = psutil.virtual_memory()

    # Disco
    disk = psutil.disk_usage('/')

    # Red
    net_io = psutil.net_io_counters()
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
        "disk": {
            "total": get_size(disk.total),
            "used": get_size(disk.used),
            "free": get_size(disk.free),
            "percent": disk.percent
        },
        "network": {
            "interface": main_interface,
            "bytes_sent": get_size(net_io.bytes_sent),
            "bytes_recv": get_size(net_io.bytes_recv),
            "packets_sent": net_io.packets_sent,
            "packets_recv": net_io.packets_recv
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
    """Obtener últimos 10 logs críticos del sistema"""
    try:
        # Obtener logs críticos y de error del sistema
        cmd = "journalctl -p err -n 10 --no-pager -o short-iso"
        result = os.popen(cmd).read()

        logs = []
        for line in result.strip().split('\n'):
            if line:
                logs.append(line)

        return {"logs": logs}
    except Exception as e:
        return {"logs": [f"Error al obtener logs: {str(e)}"]}


@app.get("/api/all")
async def get_all_data():
    """Obtener todos los datos en una sola llamada (optimizado)"""
    try:
        # Obtener métricas del sistema
        system_data = await get_system_metrics()

        # Obtener servicios
        services_data = await get_services_status()

        # Obtener logs
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


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}
