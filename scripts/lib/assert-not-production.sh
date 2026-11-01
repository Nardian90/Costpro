#!/usr/bin/env bash
# GUARD DE PRODUCCIÓN — scripts/lib/assert-not-production.sh
# Variante shell del guard compartido (mismo contrato que .mjs/.py).
#
# Uso:
#   source scripts/lib/assert-not-production.sh
#   assert_not_production write "$SUPA_URL" "mi-script"   # aborta (exit 1) si bloquea
#   # o directo:
#   bash scripts/lib/assert-not-production.sh --mode write --url "$SUPA_URL" --context mi-script
#
# Entorno: ALLOW_PROD=read-only habilita solo lectura contra producción;
# ALLOW_PROD_WRITE=I_UNDERSTAND habilita además la escritura (doble flag).

PROD_REFS_SH="wthkddeleylijmonclxg" # CostproBD (producción)

assert_not_production() {
  local mode="${1:-write}"
  local url="${2:-}"
  local context="${3:-script}"

  # deducir URL del entorno si no se pasa (mismo orden que .mjs/.py)
  if [ -z "$url" ]; then
    url="${E2E_SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-${SUPABASE_URL:-}}}"
  fi

  if [ -z "$url" ] || [[ "$url" != *"$PROD_REFS_SH"* ]]; then
    return 0
  fi

  local masked="${url%%\?*}" # sin query string (nunca imprimir keys)

  if [ "${ALLOW_PROD:-}" != "read-only" ]; then
    echo "[$context] BLOQUEADO: $masked es PRODUCCIÓN (CostproBD)." >&2
    echo "  Producción no es banco de pruebas (docs/OPERATIONS/REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS.md)." >&2
    echo "  · Para SOLO LECTURA:    export ALLOW_PROD=read-only" >&2
    echo "  · Para ESCRITURA:       export ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND" >&2
    echo "  · Alternativa correcta: apunta el script a CostproE2E (E2E_SUPABASE_URL) o a Supabase local." >&2
    return 1
  fi

  if [ "$mode" = "write" ] && [ "${ALLOW_PROD_WRITE:-}" != "I_UNDERSTAND" ]; then
    echo "[$context] BLOQUEADO: escritura contra PRODUCCIÓN ($masked) requiere el doble flag:" >&2
    echo "  export ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND" >&2
    echo "  Si esto es una operación productiva legítima, documéntala en docs/audits/ antes de ejecutarla." >&2
    return 1
  fi

  if [ "$mode" = "write" ]; then
    echo "[$context] AUTORIZADO (explícito): escritura contra producción $masked — ALLOW_PROD_WRITE=I_UNDERSTAND presente." >&2
  fi
  return 0
}

# ── CLI directo ────────────────────────────────────────────────────────────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  MODE="write"; URL=""; CONTEXT="cli"
  while [ $# -gt 0 ]; do
    case "$1" in
      --mode) MODE="$2"; shift 2 ;;
      --url) URL="$2"; shift 2 ;;
      --context) CONTEXT="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  assert_not_production "$MODE" "$URL" "$CONTEXT"
fi
