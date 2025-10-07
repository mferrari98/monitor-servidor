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

// Inicializar cuando carga la página
document.addEventListener('DOMContentLoaded', function() {
    // Mostrar datos iniciales inmediatamente
    updateClock();
    initCharts();

    // Cargar datos del servidor inmediatamente
    updateData();

    // Primeras 5 actualizaciones rápidas cada 1 segundo para poblar gráficos
    updateInterval = setInterval(function() {
        updateData();
        updateCount++;

        // Después de 5 actualizaciones rápidas, cambiar a intervalo normal
        if (updateCount >= 5) {
            clearInterval(updateInterval);
            // Cambiar a actualización cada 5 segundos
            setInterval(updateData, 5000);
        }
    }, 1000);

    // Actualizar reloj cada segundo
    setInterval(updateClock, 1000);
});

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

// Actualizar métricas del sistema
function updateSystemMetrics(data) {
    // CPU
    document.getElementById('cpu-percent').textContent = data.cpu.percent.toFixed(1) + '%';
    document.getElementById('cpu-detail').textContent = `${data.cpu.count} cores @ ${data.cpu.frequency.toFixed(0)} MHz`;

    // RAM
    document.getElementById('memory-percent').textContent = data.memory.percent.toFixed(1) + '%';
    document.getElementById('memory-detail').textContent = `${data.memory.used} / ${data.memory.total}`;

    // Disco
    document.getElementById('disk-percent').textContent = data.disk.percent.toFixed(1) + '%';
    document.getElementById('disk-detail').textContent = `${data.disk.used} / ${data.disk.total}`;

    // Uptime en la primera fila (formatear en español con detalle de horas)
    document.getElementById('uptime-display').textContent = formatUptime(data.uptime);
    document.getElementById('hostname-display').textContent = formatUptimeDetail(data.uptime);
}

// Actualizar servicios
function updateServices(services) {
    const servicesList = document.getElementById('services-list');
    servicesList.innerHTML = '';

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
    logsContainer.innerHTML = '';

    if (logs.length === 0) {
        logsContainer.innerHTML = '<div class="log-entry">No hay logs de error recientes</div>';
        return;
    }

    logs.forEach(log => {
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        logEntry.textContent = log;
        logsContainer.appendChild(logEntry);
    });
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

    // Actualizar RAM
    ramHistory.push({ time: now, value: data.memory.percent });
    if (ramHistory.length > maxDataPoints) {
        ramHistory.shift();
    }
    ramChart.data.labels = ramHistory.map(h => h.time);
    ramChart.data.datasets[0].data = ramHistory.map(h => h.value);
    ramChart.update('none');

    // Actualizar Red (convertir bytes a MB/s aproximadamente)
    const sentMB = data.network.packets_sent / 1000; // Aproximación simple
    const recvMB = data.network.packets_recv / 1000;

    networkHistory.sent.push({ time: now, value: sentMB });
    networkHistory.recv.push({ time: now, value: recvMB });

    if (networkHistory.sent.length > maxDataPoints) {
        networkHistory.sent.shift();
        networkHistory.recv.shift();
    }

    networkChart.data.labels = networkHistory.sent.map(h => h.time);
    networkChart.data.datasets[0].data = networkHistory.sent.map(h => h.value);
    networkChart.data.datasets[1].data = networkHistory.recv.map(h => h.value);
    networkChart.update('none');
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
