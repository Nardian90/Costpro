#!/usr/bin/env bash
#
# Instala el servicio systemd de PM2 para que arranque automáticamente
# al reiniciar el sistema.
#
# Uso (debes ejecutarlo como root o con sudo):
#   sudo bash deploy/install-pm2-service.sh
#
# Qué hace:
#   1. Copia el archivo .service a /etc/systemd/system/
#   2. Recarga la configuración de systemd
#   3. Habilita el servicio para arranque automático
#   4. (Opcional) Arranca el servicio si PM2 no está corriendo
#
# Requisitos:
#   - El sistema debe arrancar con systemd (verifica con: ps -p 1 -o comm=)
#   - Debes ejecutar este script como root o con sudo
#   - PM2 debe estar instalado globalmente en /home/z/.npm-global/bin/pm2
#   - El usuario 'z' debe existir

set -euo pipefail

# --- Verificaciones iniciales ---
if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: este script debe ejecutarse como root o con sudo."
  echo "       Prueba con: sudo bash $0"
  exit 1
fi

if [ "$(ps -p 1 -o comm=)" != "systemd" ]; then
  echo "ERROR: este sistema no arranca con systemd como PID 1."
  echo "       No se puede registrar el servicio de auto-arranque."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_SRC="${SCRIPT_DIR}/pm2-z.service"
SERVICE_DST="/etc/systemd/system/pm2-z.service"
PM2_BIN="/home/z/.npm-global/lib/node_modules/pm2/bin/pm2"

if [ ! -f "$SERVICE_SRC" ]; then
  echo "ERROR: no se encontró $SERVICE_SRC"
  exit 1
fi

if [ ! -f "$PM2_BIN" ]; then
  echo "ERROR: PM2 no está instalado en $PM2_BIN"
  echo "       Instálalo con: sudo npm install -g pm2"
  exit 1
fi

# --- Instalación ---
echo "[1/4] Copiando servicio a $SERVICE_DST ..."
cp "$SERVICE_SRC" "$SERVICE_DST"
chown root:root "$SERVICE_DST"
chmod 644 "$SERVICE_DST"

echo "[2/4] Recargando configuración de systemd ..."
systemctl daemon-reload

echo "[3/4] Habilitando arranque automático ..."
systemctl enable pm2-z.service

echo "[4/4] Estado del servicio:"
systemctl status pm2-z.service --no-pager 2>&1 | head -10 || true

echo ""
echo "✓ Instalación completada."
echo ""
echo "Comandos útiles:"
echo "  sudo systemctl start pm2-z      # arrancar ahora"
echo "  sudo systemctl stop pm2-z       # detener"
echo "  sudo systemctl restart pm2-z    # reiniciar"
echo "  sudo systemctl status pm2-z     # ver estado"
echo "  sudo systemctl disable pm2-z    # desactivar auto-arranque"
echo ""
echo "Nota: PM2 arrancará con la lista de procesos guardada en /home/z/.pm2/dump.pm2"
echo "      (actualízala con 'pm2 save' después de cualquier cambio)."
