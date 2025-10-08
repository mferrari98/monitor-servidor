#!/bin/bash
# Script para reiniciar el servicio monitor-servidor

echo "Reiniciando servicio monitor-servidor..."
sudo systemctl restart monitor-servidor

echo "Verificando estado..."
sudo systemctl status monitor-servidor --no-pager
