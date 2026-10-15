#!/usr/bin/env bash
#
# restore_local_env.sh — Restauración automática del entorno local de Costpro.
#
# Protege el trabajo ante un reinicio del entorno local (el contenedor se
# borra, el repo persiste en GitHub): reconstruye todo lo que NO vive en git
# a partir del clon fresco.
#
# Qué hace (idempotente — se puede ejecutar las veces que haga falta):
#   1. Valida que exista .env (lo crea desde .env.example si falta, para que
#      el operador solo tenga que rellenar los secretos)
#   2. Valida secretos obligatorios SIN imprimirlos
#   3. Instala PM2 si falta (npm i -g pm2)
#   4. bun install (dependencias)
#   5. Garantiza db/custom.db (DATABASE_URL de Prisma) y logs/
#   6. pm2 start ecosystem.config.js (o restart si ya existe)
#   7. Espera a que http://localhost:3000 responda y verifica /api/health
#
# Uso:
#   bash scripts/local-env/restore_local_env.sh            # restauración completa
#   bash scripts/local-env/restore_local_env.sh --skip-deps  # solo PM2/health
#
# Ver docs/OPERACION_ENTORNO_LOCAL.md para el procedimiento completo.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_DIR"
SKIP_DEPS=0
[[ "${1:-}" == "--skip-deps" ]] && SKIP_DEPS=1

log()  { echo "➡️  $*"; }
ok()   { echo "✅ $*"; }
fail() { echo "❌ $*"; exit 1; }

# ── 1. .env ──────────────────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  log ".env no existe (reinicio de entorno). Creando desde .env.example…"
  cp .env.example .env
  echo "⚠️  Rellena los secretos en .env (Supabase, NextAuth) y re-ejecuta." >&2
  echo "    Las claves se obtienen del dashboard de Supabase del proyecto." >&2
  fail ".env recién creado necesita secretos"
fi
ok ".env presente"

# ── 2. Secretos obligatorios (validación sin eco de valores) ────────────────
MISSING=()
while IFS= read -r var; do
  val="$(grep -E "^${var}=" .env | tail -1 | cut -d= -f2- | tr -d '\"' || true)"
  [[ -z "$val" || "$val" == *TU_* || "$val" == *YOUR_* || "$val" == *"_HERE" ]] && MISSING+=("$var")
done <<'VARS'
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXTAUTH_SECRET
VARS
if [[ ${#MISSING[@]} -gt 0 ]]; then
  fail "Variables sin valor real en .env: ${MISSING[*]}"
fi
ok "Secretos obligatorios presentes en .env"

# ── 3. PM2 global ────────────────────────────────────────────────────────────
if ! command -v pm2 >/dev/null 2>&1; then
  log "PM2 no instalado; instalando globalmente…"
  npm install -g pm2 >/dev/null 2>&1 || fail "No se pudo instalar PM2"
fi
ok "PM2 $(pm2 --version 2>/dev/null | head -1)"

# ── 4. Dependencias ──────────────────────────────────────────────────────────
if [[ $SKIP_DEPS -eq 0 ]]; then
  log "bun install (puede tardar en el primer arranque)…"
  bun install || fail "bun install falló"
  ok "Dependencias instaladas"
else
  log "--skip-deps: se omite bun install"
fi

# ── 5. Directorios y ficheros locales necesarios ─────────────────────────────
mkdir -p logs
DB_FILE="$(grep -E '^DATABASE_URL=' .env | tail -1 | cut -d= -f2- | tr -d '\"' | sed 's|^file:||')"
if [[ -n "$DB_FILE" ]]; then
  mkdir -p "$(dirname "$DB_FILE")"
  [[ -f "$DB_FILE" ]] || { touch "$DB_FILE"; log "Creado $DB_FILE (vacío; Prisma lo gestiona)"; }
fi
ok "logs/ y $DB_FILE listos"

# ── 6. Arranque PM2 ──────────────────────────────────────────────────────────
if pm2 describe costpro >/dev/null 2>&1; then
  log "costpro ya está en PM2; reiniciando con la config del repo…"
  pm2 delete costpro >/dev/null 2>&1 || true
fi
pm2 start ecosystem.config.js >/dev/null
pm2 save >/dev/null
ok "PM2 arrancó costpro (+ pollers de Telegram/WhatsApp del ecosystem)"

# ── 7. Health check ──────────────────────────────────────────────────────────
log "Esperando a que Next.js compile y responda (hasta 180 s en el primer arranque)…"
for i in $(seq 1 36); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 http://localhost:3000/ || true)"
  if [[ "$CODE" == "200" || "$CODE" == "307" || "$CODE" == "302" ]]; then
    ok "GET / → HTTP $CODE"
    HCODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 http://localhost:3000/api/health || true)"
    ok "GET /api/health → HTTP $HCODE"
    echo ""
    echo "🎉 Entorno local restaurado. Logs: pm2 logs costpro"
    exit 0
  fi
  sleep 5
done

pm2 logs costpro --lines 30 --nostream
fail "El servidor no respondió en 180 s. Revisa los logs de arriba."
