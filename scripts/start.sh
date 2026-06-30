#!/usr/bin/env bash
#
# Wrapper para arrancar Next.js (Costpro) bajo PM2 de forma robusta.
#
# Problema que resuelve:
#   `next dev` lanza varios procesos hijos (next-server, postcss.js, etc.).
#   Si PM2 mata solo el proceso padre (por ejemplo tras un crash),
#   los hijos sobreviven y siguen ocupando el puerto 3000,
#   provocando EADDRINUSE en el siguiente reinicio.
#
# Solución:
#   1. Antes de arrancar, mata cualquier proceso que siga ocupando el puerto 3000
#      (hijos huérfanos de una ejecución anterior).
#   2. Arranca Next.js con `exec` para que sustituya al shell.
#   3. Al recibir señales de PM2 (SIGTERM/SIGINT), mata a todos los procesos
#      next/postcss del proyecto antes de salir, dejando el puerto libre.
#
# Resultado: reinicios limpios, sin EADDRINUSE, web siempre disponible.

set -euo pipefail

PROJECT_DIR="/home/z/my-project"
PORT="${PORT:-3000}"

# Mata cualquier proceso next/postcss huérfano del proyecto
kill_orphans() {
  pkill -9 -f "next/dist/bin/next" 2>/dev/null || true
  pkill -9 -f "next-server" 2>/dev/null || true
  pkill -9 -f "next/dev" 2>/dev/null || true
  pkill -9 -f "${PROJECT_DIR}/.next/dev/build/postcss" 2>/dev/null || true
  # Esperar brevemente a que el puerto se libere
  sleep 1
}

# Limpieza al salir (PM2 envía SIGTERM/SIGINT)
cleanup() {
  kill_orphans
}
trap cleanup EXIT INT TERM

cd "$PROJECT_DIR"

# Limpiar huérfanos antes de arrancar (por si quedó algo de un reinicio anterior)
kill_orphans

# Arrancar Next.js (exec sustituye al shell, así este PID es el que PM2 gestiona)
exec node_modules/next/dist/bin/next dev -p "$PORT"
