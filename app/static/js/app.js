// Variables globales para los gráficos
let cpuChart = null;
let ramChart = null;
let networkChart = null;
let cpuHistory = [];
let ramHistory = [];
let networkHistory = { sent: [], recv: [] };
const maxDataPoints = 30;
let updateCount = 0;
let updateInterval = null;
let chartsLoaded = {
    cpu: false,
    ram: false,
    network: false
};

// Configuración de umbrales (se carga del servidor)
let alertConfig = {
    thresholds: {
        cpu: { warning: 70, critical: 90 },
        memory: { warning: 50, critical: 80 },
        swap: { warning: 50, critical: 80 },
        disk: { warning: 70, critical: 90 }
    }
};

// Sistema de cooldown para alertas (evitar duplicados)
// Almacena el último timestamp de cada alerta por tipo y nivel
let alertCooldowns = {};

// Inicializar cuando carga la página
document.addEventListener('DOMContentLoaded', function() {
    // Inicializar tema
    initTheme();

    // Cargar configuración
    loadConfig();

    // Mostrar datos iniciales inmediatamente
    updateClock();
    initCharts();

    // Cargar datos del servidor inmediatamente
    updateData();

    // Actualización normal cada 5 segundos
    setInterval(updateData, 5000);

    // Actualizar reloj cada segundo
    setInterval(updateClock, 1000);
});

// Cargar configuración desde el servidor
async function loadConfig() {
    try {
        const response = await fetch('/monitor/api/config');
        const config = await response.json();
        alertConfig = config;
    } catch (error) {
        console.error('Error al cargar configuración:', error);
    }
}

// Inicializar gráficos con datos iniciales
function initCharts() {
    // Crear labels iniciales
    const initialLabels = [];
    const initialData = [];
    for (let i = 0; i < 10; i++) {
        initialLabels.push('');
        initialData.push(0);
    }

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 50,
        plugins: {
            legend: {
                display: false
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                max: 100,
                ticks: {
                    color: '#b0b0b0',
                    font: {
                        size: 11
                    },
                    callback: function(value) {
                        return value + '%';
                    }
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)',
                    drawBorder: false
                }
            },
            x: {
                ticks: {
                    color: '#b0b0b0',
                    font: {
                        size: 10
                    },
                    maxTicksLimit: 8
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)',
                    drawBorder: false
                }
            }
        }
    };

    // Gráfico de CPU
    const cpuCtx = document.getElementById('cpu-chart').getContext('2d');
    cpuChart = new Chart(cpuCtx, {
        type: 'line',
        data: {
            labels: [...initialLabels],
            datasets: [{
                label: 'CPU %',
                data: [...initialData],
                borderColor: '#4a9eff',
                backgroundColor: 'rgba(74, 158, 255, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 4
            }]
        },
        options: chartOptions
    });

    // Gráfico de RAM
    const ramCtx = document.getElementById('ram-chart').getContext('2d');
    ramChart = new Chart(ramCtx, {
        type: 'line',
        data: {
            labels: [...initialLabels],
            datasets: [{
                label: 'RAM %',
                data: [...initialData],
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 4
            }]
        },
        options: chartOptions
    });

    // Gráfico de Red
    const networkCtx = document.getElementById('network-chart').getContext('2d');
    networkChart = new Chart(networkCtx, {
        type: 'line',
        data: {
            labels: [...initialLabels],
            datasets: [
                {
                    label: 'Enviado',
                    data: [...initialData],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 4
                },
                {
                    label: 'Recibido',
                    data: [...initialData],
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            resizeDelay: 50,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#b0b0b0',
                        font: {
                            size: 10
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#b0b0b0',
                        font: {
                            size: 11
                        },
                        callback: function(value) {
                            if (value >= 1024) {
                                return (value / 1024).toFixed(2) + ' Mbps';
                            }
                            return value.toFixed(2) + ' kbps';
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    }
                },
                x: {
                    ticks: {
                        color: '#b0b0b0',
                        font: {
                            size: 10
                        },
                        maxTicksLimit: 8
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    }
                }
            }
        }
    });
}

// Actualizar todos los datos
async function updateData() {
    try {
        // Obtener todos los datos en una sola llamada (más rápido)
        const response = await fetch('/monitor/api/all');
        const data = await response.json();

        // Actualizar UI
        updateSystemMetrics(data.system);
        updateServices(data.services);
        updateLogs(data.logs);
        updateCharts(data.system);

    } catch (error) {
        console.error('Error al obtener datos:', error);
    }
}

// Calcular color según porcentaje (verde -> naranja -> rojo)
function getColorFromPercentage(percent) {
    // 0% = verde (#22c55e)
    // 50% = naranja (#ff8c00)
    // 100% = rojo (#ef4444)

    let r, g, b;

    if (percent <= 50) {
        // Verde a Naranja (0-50%)
        const ratio = percent / 50;
        r = Math.round(34 + (255 - 34) * ratio);   // 34 -> 255
        g = Math.round(197 + (140 - 197) * ratio); // 197 -> 140
        b = Math.round(94 + (0 - 94) * ratio);     // 94 -> 0
    } else {
        // Naranja a Rojo (50-100%)
        const ratio = (percent - 50) / 50;
        r = Math.round(255 + (239 - 255) * ratio); // 255 -> 239
        g = Math.round(140 + (68 - 140) * ratio);  // 140 -> 68
        b = Math.round(0 + (68 - 0) * ratio);      // 0 -> 68
    }

    return `rgb(${r}, ${g}, ${b})`;
}

// Actualizar borde de tarjeta según uso
function updateCardBorder(cardId, percent) {
    const card = document.getElementById(cardId);
    if (card) {
        const color = getColorFromPercentage(percent);
        // Extraer valores RGB
        const rgbMatch = color.match(/rgb\((\d+), (\d+), (\d+)\)/);
        if (rgbMatch) {
            const [, r, g, b] = rgbMatch;
            card.style.borderColor = color;
            card.style.boxShadow = `0 4px 12px rgba(${r}, ${g}, ${b}, 0.2)`;
        }
    }
}

// Actualizar métricas del sistema
function updateSystemMetrics(data) {
    // CPU
    if (data.cpu) {
        document.getElementById('cpu-percent').textContent = data.cpu.percent.toFixed(1) + '%';
        document.getElementById('cpu-detail').textContent = `${data.cpu.count} cores @ ${data.cpu.frequency.toFixed(0)} MHz`;
        updateCardBorder('cpu-card', data.cpu.percent);
    }

    // RAM
    if (data.memory) {
        document.getElementById('memory-percent').textContent = data.memory.percent.toFixed(1) + '%';
        document.getElementById('memory-detail').textContent = `${data.memory.used} / ${data.memory.total}`;
        updateCardBorder('memory-card', data.memory.percent);
    }

    // SWAP
    if (data.swap) {
        document.getElementById('swap-percent').textContent = data.swap.percent.toFixed(1) + '%';
        document.getElementById('swap-detail').textContent = `${data.swap.used} / ${data.swap.total}`;
        updateCardBorder('swap-card', data.swap.percent);
    }

    // Disco
    if (data.disk) {
        document.getElementById('disk-percent').textContent = data.disk.percent.toFixed(1) + '%';
        document.getElementById('disk-detail').textContent = `${data.disk.used} / ${data.disk.total}`;
        updateCardBorder('disk-card', data.disk.percent);
    }

    // Uptime
    if (data.uptime) {
        const uptimeElement = document.getElementById('uptime-text');
        if (uptimeElement) {
            uptimeElement.textContent = `Uptime: ${data.uptime}`;
        }
    }

    // Verificar alertas
    checkAlerts(data);
}

// Actualizar servicios
function updateServices(services) {
    const servicesList = document.getElementById('services-list');
    if (!servicesList) return;

    servicesList.innerHTML = '';

    if (!services || services.length === 0) {
        servicesList.innerHTML = '<div class="service-item">No hay servicios configurados</div>';
        return;
    }

    services.forEach(service => {
        const serviceItem = document.createElement('div');
        serviceItem.className = 'service-item';

        const serviceName = document.createElement('div');
        serviceName.className = 'service-name';
        serviceName.textContent = service.name;

        const serviceStatus = document.createElement('div');
        serviceStatus.className = 'service-status';

        const statusBadge = document.createElement('span');
        statusBadge.className = `status-badge ${service.status}`;
        statusBadge.textContent = service.status;

        serviceStatus.appendChild(statusBadge);
        serviceItem.appendChild(serviceName);
        serviceItem.appendChild(serviceStatus);
        servicesList.appendChild(serviceItem);
    });
}

// Actualizar logs del sistema
function updateLogs(logs) {
    const logsContainer = document.getElementById('logs-container');
    if (!logsContainer) return;

    logsContainer.innerHTML = '';

    if (!logs || logs.length === 0) {
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry log-info';
        logEntry.textContent = 'No hay eventos registrados';
        logsContainer.appendChild(logEntry);
        return;
    }

    logs.forEach(log => {
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';

        // Parsear y formatear el log
        const parts = log.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\] (.+)$/);
        if (parts) {
            const [, timestamp, level, message] = parts;

            // Determinar clase CSS según el nivel
            let levelClass = 'level-info';
            if (level === 'WARNING') {
                levelClass = 'level-warning';
            } else if (level === 'ALERT' || level === 'CRITICAL') {
                levelClass = 'level-alert';
            } else if (level === 'ERROR') {
                levelClass = 'level-error';
            }

            logEntry.innerHTML = `<span class="log-time">${timestamp}</span><span class="log-level ${levelClass}">[${level}]</span><span class="log-message">${message}</span>`;
        } else {
            logEntry.textContent = log;
        }

        logsContainer.appendChild(logEntry);
    });

    // Auto-scroll al final
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

// Actualizar gráficos
function updateCharts(data) {
    const now = new Date().toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    // Actualizar CPU
    cpuHistory.push({ time: now, value: data.cpu.percent });
    if (cpuHistory.length > maxDataPoints) {
        cpuHistory.shift();
    }
    cpuChart.data.labels = cpuHistory.map(h => h.time);
    cpuChart.data.datasets[0].data = cpuHistory.map(h => h.value);
    cpuChart.update('none');

    // Ocultar spinner cuando hay al menos 2 puntos de datos
    if (!chartsLoaded.cpu && cpuHistory.length >= 2) {
        document.getElementById('cpu-spinner').classList.add('hidden');
        chartsLoaded.cpu = true;
    }

    // Actualizar RAM
    ramHistory.push({ time: now, value: data.memory.percent });
    if (ramHistory.length > maxDataPoints) {
        ramHistory.shift();
    }
    ramChart.data.labels = ramHistory.map(h => h.time);
    ramChart.data.datasets[0].data = ramHistory.map(h => h.value);
    ramChart.update('none');

    // Ocultar spinner cuando hay al menos 2 puntos de datos
    if (!chartsLoaded.ram && ramHistory.length >= 2) {
        document.getElementById('ram-spinner').classList.add('hidden');
        chartsLoaded.ram = true;
    }

    // Actualizar Red (velocidad en bytes por segundo)
    const sentKbps = (data.network.bytes_sent_per_sec * 8) / 1024; // Convertir a kbps
    const recvKbps = (data.network.bytes_recv_per_sec * 8) / 1024;

    networkHistory.sent.push({ time: now, value: sentKbps });
    networkHistory.recv.push({ time: now, value: recvKbps });

    if (networkHistory.sent.length > maxDataPoints) {
        networkHistory.sent.shift();
        networkHistory.recv.shift();
    }

    networkChart.data.labels = networkHistory.sent.map(h => h.time);
    networkChart.data.datasets[0].data = networkHistory.sent.map(h => h.value);
    networkChart.data.datasets[1].data = networkHistory.recv.map(h => h.value);
    networkChart.update('none');

    // Ocultar spinner cuando hay al menos 2 puntos de datos
    if (!chartsLoaded.network && networkHistory.sent.length >= 2) {
        document.getElementById('network-spinner').classList.add('hidden');
        chartsLoaded.network = true;
    }
}

// Formatear uptime - valor principal (días)
function formatUptime(uptime) {
    // uptime viene en formato "X days, HH:MM:SS" o "HH:MM:SS"
    const parts = uptime.split(',');

    if (parts.length === 1) {
        // Solo horas (menos de 1 día)
        return '0 días';
    }

    const daysPart = parts[0].trim();
    const daysMatch = daysPart.match(/(\d+)/);

    if (daysMatch) {
        const days = parseInt(daysMatch[1]);
        return days === 1 ? '1 día' : `${days} días`;
    }

    return uptime;
}

// Formatear detalle de uptime (horas y minutos)
function formatUptimeDetail(uptime) {
    // uptime viene en formato "X days, HH:MM:SS" o "HH:MM:SS"
    const parts = uptime.split(',');

    let timePart;
    if (parts.length === 1) {
        // Solo horas
        timePart = uptime.trim();
    } else {
        timePart = parts[1].trim();
    }

    const timeMatch = timePart.match(/(\d+):(\d+):(\d+)/);
    if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        return `${hours}h ${minutes}m`;
    }

    return timePart;
}

// Formatear bytes a unidades legibles
function formatNetworkSpeed(packets) {
    // Convertir packets a una estimación de velocidad
    const kbps = packets / 100; // Aproximación

    if (kbps < 1) {
        return `${(kbps * 1000).toFixed(0)} bps`;
    } else if (kbps < 1000) {
        return `${kbps.toFixed(1)} Kbps`;
    } else if (kbps < 1000000) {
        return `${(kbps / 1000).toFixed(2)} Mbps`;
    } else {
        return `${(kbps / 1000000).toFixed(2)} Gbps`;
    }
}

// Actualizar reloj
function updateClock() {
    const now = new Date();
    const timeString = now.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('current-time').textContent = timeString;
}

// Verificar alertas del sistema
function checkAlerts(data) {
    const alerts = [];
    const thresholds = alertConfig.thresholds;

    // Verificar CPU
    if (data.cpu.percent >= thresholds.cpu.critical) {
        alerts.push({
            type: 'CPU',
            level: 'ALERT',
            message: 'Uso de CPU critico',
            value: data.cpu.percent.toFixed(1) + '%',
            threshold: thresholds.cpu.critical + '%'
        });
    } else if (data.cpu.percent >= thresholds.cpu.warning) {
        alerts.push({
            type: 'CPU',
            level: 'WARNING',
            message: 'Uso de CPU elevado',
            value: data.cpu.percent.toFixed(1) + '%',
            threshold: thresholds.cpu.warning + '%'
        });
    }

    // Verificar RAM
    if (data.memory.percent >= thresholds.memory.critical) {
        alerts.push({
            type: 'MEMORY',
            level: 'ALERT',
            message: 'Uso de RAM critico',
            value: data.memory.percent.toFixed(1) + '%',
            threshold: thresholds.memory.critical + '%'
        });
    } else if (data.memory.percent >= thresholds.memory.warning) {
        alerts.push({
            type: 'MEMORY',
            level: 'WARNING',
            message: 'Uso de RAM elevado',
            value: data.memory.percent.toFixed(1) + '%',
            threshold: thresholds.memory.warning + '%'
        });
    }

    // Verificar SWAP
    if (data.swap.percent >= thresholds.swap.critical) {
        alerts.push({
            type: 'SWAP',
            level: 'ALERT',
            message: 'Uso de SWAP critico',
            value: data.swap.percent.toFixed(1) + '%',
            threshold: thresholds.swap.critical + '%'
        });
    } else if (data.swap.percent >= thresholds.swap.warning) {
        alerts.push({
            type: 'SWAP',
            level: 'WARNING',
            message: 'Uso de SWAP elevado',
            value: data.swap.percent.toFixed(1) + '%',
            threshold: thresholds.swap.warning + '%'
        });
    }

    // Verificar Disco
    if (data.disk.percent >= thresholds.disk.critical) {
        alerts.push({
            type: 'DISK',
            level: 'ALERT',
            message: 'Uso de disco critico',
            value: data.disk.percent.toFixed(1) + '%',
            threshold: thresholds.disk.critical + '%'
        });
    } else if (data.disk.percent >= thresholds.disk.warning) {
        alerts.push({
            type: 'DISK',
            level: 'WARNING',
            message: 'Uso de disco elevado',
            value: data.disk.percent.toFixed(1) + '%',
            threshold: thresholds.disk.warning + '%'
        });
    }

    // Enviar alertas al backend para logging (solo si hay alertas)
    if (alerts.length > 0) {
        logAlerts(alerts);
    }
}

// Enviar alertas al backend para registrar en archivo de log
async function logAlerts(alerts) {
    const now = Date.now();
    const cooldownPeriod = 60000; // 60 segundos de cooldown
    const alertsToSend = [];

    // Filtrar alertas basándose en cooldown
    for (const alert of alerts) {
        const alertKey = `${alert.type}_${alert.level}`;
        const lastAlertTime = alertCooldowns[alertKey] || 0;

        // Solo enviar si han pasado más de 60 segundos desde la última alerta del mismo tipo/nivel
        if (now - lastAlertTime >= cooldownPeriod) {
            alertsToSend.push(alert);
            alertCooldowns[alertKey] = now;
        }
    }

    // Solo hacer la petición si hay alertas para enviar
    if (alertsToSend.length > 0) {
        try {
            await fetch('/monitor/api/log-alerts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ alerts: alertsToSend })
            });
        } catch (error) {
            console.error('Error al registrar alertas:', error);
        }
    }
}

// ============================================
// TEMA DARK/LIGHT (heredado de guardias)
// ============================================
function initTheme() {
    const themeCheckbox = document.getElementById('theme-checkbox');
    const html = document.documentElement;

    // Cargar tema guardado o usar dark por defecto
    const savedTheme = localStorage.getItem('theme') || 'dark';
    html.setAttribute('data-theme', savedTheme);

    // Sincronizar checkbox con el tema
    if (savedTheme === 'light') {
        themeCheckbox.checked = false;
    } else {
        themeCheckbox.checked = true;
    }

    // Listener para cambios
    if (themeCheckbox) {
        themeCheckbox.addEventListener('change', function() {
            const newTheme = this.checked ? 'dark' : 'light';
            html.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);

            // Actualizar colores de los gráficos según el tema
            updateChartsTheme(newTheme);
        });
    }
}

// Actualizar colores de los gráficos cuando cambia el tema
function updateChartsTheme(theme) {
    const textColor = theme === 'dark' ? '#b0b0b0' : '#6c757d';
    const gridColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.1)';

    // Actualizar opciones de todos los gráficos
    const charts = [cpuChart, ramChart, networkChart];
    charts.forEach(chart => {
        if (chart) {
            // Actualizar colores de ejes
            chart.options.scales.y.ticks.color = textColor;
            chart.options.scales.y.grid.color = gridColor;
            chart.options.scales.x.ticks.color = textColor;
            chart.options.scales.x.grid.color = gridColor;

            // Actualizar leyenda si existe
            if (chart.options.plugins.legend && chart.options.plugins.legend.labels) {
                chart.options.plugins.legend.labels.color = textColor;
            }

            chart.update('none');
        }
    });
}
