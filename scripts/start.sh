#!/usr/bin/env bash
#
# Wrapper para arrancar Next.js + Socket.io (Costpro) bajo PM2 de forma robusta.
#
# Problema que resuelve:
#   `next dev` y `bun server.ts` lanzan varios procesos hijos (next-server,
#   postcss.js, etc.). Si PM2 mata solo el proceso padre (por ejemplo tras
#   un crash), los hijos sobreviven y siguen ocupando el puerto 3000,
#   provocando EADDRINUSE en el siguiente reinicio.
#
# Solución:
#   1. Antes de arrancar, mata cualquier proceso que siga ocupando el puerto 3000
#      (hijos huérfanos de una ejecución anterior).
#   2. Arranca el custom server (server.ts) con bun, que a su vez levanta
#      Next.js + Socket.io attached al mismo HTTP server.
#   3. Al recibir señales de PM2 (SIGTERM/SIGINT), mata a todos los procesos
#      next/postcss/bun del proyecto antes de salir, dejando el puerto libre.
#
# Resultado: reinicios limpios, sin EADDRINUSE, web + realtime siempre disponibles.
#
# FASE 5: Antes se usaba `next dev` directo. Ahora se usa `bun server.ts`
# (custom server) para que Socket.io esté disponible también en dev.
# El script `dev:turbo` (next dev --turbopack) queda como alternativa rápida
# sin realtime para iteración de UI pura.

set -euo pipefail

PROJECT_DIR="/home/z/my-project/Costpro"
PORT="${PORT:-3000}"

# Mata cualquier proceso next/postcss/bun huérfano del proyecto
kill_orphans() {
  pkill -9 -f "next/dist/bin/next" 2>/dev/null || true
  pkill -9 -f "next-server" 2>/dev/null || true
  pkill -9 -f "next/dev" 2>/dev/null || true
  pkill -9 -f "${PROJECT_DIR}/.next/dev/build/postcss" 2>/dev/null || true
  pkill -9 -f "bun server.ts" 2>/dev/null || true
  # Esperar brevemente a que el puerto se libere
  sleep 1
}

# Limpieza al salir (PM2 envía SIGTERM/SIGINT)
cleanup() {
  kill_orphans
}
trap cleanup EXIT INT TERM

cd "$PROJECT_DIR"

# Cargar .env explícitamente (bun no lo carga automáticamente)
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Limpiar huérfanos antes de arrancar (por si quedó algo de un reinicio anterior)
kill_orphans

# Arrancar custom server con bun (exec sustituye al shell, así este PID es
# el que PM2 gestiona). El custom server levanta Next.js + adjunta Socket.io.
exec bun server.ts
