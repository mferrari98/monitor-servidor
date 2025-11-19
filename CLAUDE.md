# Monitor de Servidor - Development Guide

## Overview

This is a real-time server monitoring web application built with FastAPI, psutil, and Chart.js. It displays system metrics (CPU, RAM, Disk, Network), monitors systemd services, and shows system error logs.

**Access URL**: http://10.10.9.252/monitor/

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Browser   │ ───> │ Nginx Proxy  │ ───> │  FastAPI    │
│  (Client)   │      │ /monitor/    │      │ :8000       │
└─────────────┘      └──────────────┘      └─────────────┘
                                                   │
                                                   ▼
                                            ┌─────────────┐
                                            │   psutil    │
                                            │ (metrics)   │
                                            └─────────────┘
```

### Tech Stack
- **Backend**: FastAPI + uvicorn
- **System Metrics**: psutil library
- **Frontend**: Vanilla JavaScript + Chart.js
- **Templates**: Jinja2
- **Reverse Proxy**: nginx
- **Process Manager**: systemd

## File Structure

```
/var/www/monitor-servidor/
├── app/
│   ├── main.py                 # FastAPI backend with API endpoints
│   ├── static/
│   │   ├── css/
│   │   │   └── style.css       # Dark theme styling
│   │   └── js/
│   │       └── app.js          # Frontend logic, Chart.js graphs
│   └── templates/
│       └── index.html          # Main dashboard template
├── venv/                       # Python virtual environment
├── logs/
│   ├── monitor.log             # Application output
│   └── monitor-error.log       # Error logs
├── monitor-servidor.service    # systemd service definition
├── requirements.txt            # Python dependencies
├── install.sh                  # Installation script
└── README.md                   # User documentation
```

## How to Run

### Start/Stop/Restart Service
```bash
sudo systemctl start monitor-servidor
sudo systemctl stop monitor-servidor
sudo systemctl restart monitor-servidor
sudo systemctl status monitor-servidor
```

### View Logs
```bash
# Application logs
tail -f /var/www/monitor-servidor/logs/monitor.log

# Error logs
tail -f /var/www/monitor-servidor/logs/monitor-error.log

# Systemd journal
journalctl -u monitor-servidor -f
```

### Manual Run (Development)
```bash
cd /var/www/monitor-servidor
source venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

## Key Configuration Files

### 1. `/var/www/monitor-servidor/monitor-servidor.service`
- **Critical**: PATH must include system binaries (`/usr/sbin:/usr/bin:/sbin:/bin`)
- Runs as `www-data` user
- Logs to `/var/www/monitor-servidor/logs/`
- Auto-restart on failure (RestartSec=5)

### 2. `/etc/sudoers.d/monitor-services`
- Grants www-data NOPASSWD access to query specific systemd services
- Required for service status monitoring
- Services monitored: guardias.service, reportespiolis.service, dash.service

### 3. `/etc/nginx/sites-available/monitor-servidor`
- Reverse proxy configuration for `/monitor/` location
- Routes to `http://127.0.0.1:8000`
- Must preserve trailing slashes

## API Endpoints

### `GET /`
- Returns main dashboard HTML

### `GET /api/all` (Optimized - USE THIS)
- Returns all data in single call: system metrics + services + logs
- **Why**: Reduces HTTP overhead, prevents page hanging
- Response time: ~100-200ms

### `GET /api/system`
- CPU, RAM, Disk, Network metrics
- Uptime, hostname, OS info
- Temperature and fan speeds (if available)

### `GET /api/services`
- Status of monitored systemd services
- Uses `sudo systemctl is-active` commands

### `GET /api/logs`
- Last 10 critical/error logs from journalctl
- Uses `journalctl -p err -n 10`

### `GET /health`
- Health check endpoint

## Key Design Patterns

### 1. **Performance Optimization**
```javascript
// app.js - Fast initial loading, then normal intervals
updateInterval = setInterval(function() {
    updateData();
    updateCount++;
    if (updateCount >= 5) {
        clearInterval(updateInterval);
        setInterval(updateData, 5000);  // Switch to 5s
    }
}, 1000);  // First 5 updates every 1s
```

### 2. **Single API Call**
```javascript
// app.js - One HTTP request instead of three
const response = await fetch('/monitor/api/all');
const data = await response.json();
```

### 3. **Instant CPU Metrics**
```python
# main.py - No blocking interval
cpu_percent = psutil.cpu_percent(interval=None)
```

### 4. **Dummy Data for Graphs**
```javascript
// app.js - Initialize with zeros so charts render immediately
const initialLabels = [];
const initialData = [];
for (let i = 0; i < 10; i++) {
    initialLabels.push('');
    initialData.push(0);
}
```

### 5. **Sudo Service Checks**
```python
# main.py - www-data needs sudo
result = os.popen(f"sudo systemctl is-active {service}").read().strip()
```

## Common Issues & Solutions

### Issue: Services show "stopped" when actually running
**Cause**: www-data user lacks systemctl permissions
**Fix**: Verify `/etc/sudoers.d/monitor-services` exists and contains NOPASSWD entries

### Issue: "sudo: not found" or "journalctl: not found" in error logs
**Cause**: systemd service PATH doesn't include system binaries
**Fix**: Ensure `monitor-servidor.service` has:
```ini
Environment="PATH=/var/www/monitor-servidor/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
```

### Issue: Slow page loading or hanging
**Cause**: Multiple concurrent API calls or blocking cpu_percent()
**Fix**: Use `/api/all` endpoint and `cpu_percent(interval=None)`

### Issue: Graphs appear empty initially
**Cause**: No data until first update
**Fix**: Initialize charts with dummy data (already implemented)

### Issue: Favicon not appearing
**Cause**: Browser cache
**Fix**: Hard refresh (Ctrl+Shift+R) or restart service

## Dependencies

See `requirements.txt`:
- fastapi
- uvicorn[standard]
- psutil
- jinja2
- python-multipart

Frontend dependencies (CDN):
- Chart.js 4.4.0

## Styling

- **Theme**: Dark gradient background (`#1a1a1a` → `#2d2d2d`)
- **Layout**: Responsive grid (4 metrics → 3 graphs → services+logs)
- **Fonts**: System fonts for UI, monospace (Consolas/Monaco) for logs
- **Charts**: Line graphs with smooth tension, transparent fill
- **Colors**:
  - CPU: `#4a9eff` (blue)
  - RAM: `#f59e0b` (orange)
  - Network Sent: `#10b981` (green)
  - Network Recv: `#8b5cf6` (purple)
  - Status Running: `#4ade80` (green)
  - Status Stopped: `#f87171` (red)

## Integration with Main Portal

The monitor is linked from `/var/www/html/index.html`:
```html
<a href="/monitor/" class="service-card">
    <div class="service-header">
        <span class="service-icon">🖥️</span>
        <h3 class="service-name">Monitor</h3>
    </div>
    <p class="service-desc">Monitor de recursos del servidor</p>
</a>
```

## Making Changes

### Add New Service to Monitor
1. Edit `/etc/sudoers.d/monitor-services`:
```
www-data ALL=(ALL) NOPASSWD: /bin/systemctl is-active newservice.service
www-data ALL=(ALL) NOPASSWD: /bin/systemctl status newservice.service
```
2. Edit `app/main.py`, add to services list:
```python
services = ["guardias.service", "reportespiolis.service", "dash.service", "newservice.service"]
```
3. Restart: `sudo systemctl restart monitor-servidor`

### Change Update Interval
Edit `app/static/js/app.js`:
```javascript
setInterval(updateData, 5000);  // Change 5000 to desired milliseconds
```

### Add New Metric
1. Backend (`app/main.py`):
```python
@app.get("/api/system")
async def get_system_metrics():
    # Add new metric collection
    new_metric = psutil.some_metric()
    return {
        # ... existing metrics
        "new_metric": new_metric
    }
```
2. Frontend (`app/static/js/app.js`):
```javascript
function updateSystemMetrics(data) {
    document.getElementById('new-metric-display').textContent = data.new_metric;
}
```
3. Template (`app/templates/index.html`):
```html
<div class="metric-card">
    <div class="metric-value" id="new-metric-display">-</div>
</div>
```

## Testing

```bash
# Check if service is running
systemctl status monitor-servidor

# Test API endpoints
curl http://127.0.0.1:8000/api/all
curl http://127.0.0.1:8000/health

# Check nginx proxy
curl http://10.10.9.252/monitor/

# Verify permissions
sudo -u www-data sudo systemctl is-active guardias.service
```

## Maintenance

### View Active Connections
```bash
ss -tlnp | grep 8000
```

### Check Disk Usage
```bash
du -sh /var/www/monitor-servidor/logs/
```

### Rotate Logs (if needed)
```bash
# Manually truncate logs
> /var/www/monitor-servidor/logs/monitor.log
> /var/www/monitor-servidor/logs/monitor-error.log
```

### Update Dependencies
```bash
cd /var/www/monitor-servidor
source venv/bin/activate
pip install --upgrade -r requirements.txt
sudo systemctl restart monitor-servidor
```

## Security Notes

- Service runs as unprivileged `www-data` user
- Sudo access is limited to specific read-only systemctl commands
- No authentication (internal network only)
- Logs may contain sensitive system information
- Port 8000 only listens on localhost (not exposed externally)

## Development Workflow

1. Make changes to code
2. Test manually if needed: `uvicorn app.main:app --reload`
3. Restart service: `sudo systemctl restart monitor-servidor`
4. Check logs: `tail -f /var/www/monitor-servidor/logs/monitor-error.log`
5. Test in browser: http://10.10.9.252/monitor/
6. Hard refresh browser cache (Ctrl+Shift+R) if needed

## Performance Characteristics

- **Page load time**: 200-500ms
- **Update interval**: 5 seconds (after initial 5×1s burst)
- **API response time**: ~100-200ms
- **Memory usage**: ~50-80MB (FastAPI + uvicorn)
- **CPU usage**: <1% idle, <5% during updates
- **Max data points**: 30 per graph (2.5 minutes of history)

---

**Last Updated**: 2025-10-07
**Version**: 1.0
**Maintainer**: Telecomunicaciones y Automatismos
