#!/usr/bin/env bash
# GUARD DE PRODUCCIÓN — scripts/lib/assert-not-production.sh  (CP-INFRA-019)
# Variante shell del guard compartido. MISMO contrato que .mjs/.py (leer la
# documentación completa en scripts/lib/assert-not-production.mjs):
#   · Producción (ref wthkddeleylijmonclxg) bloqueada SIEMPRE por defecto.
#   · Lectura de producción: ALLOW_PROD=read-only.
#   · Escritura de producción: además ALLOW_PROD_WRITE=I_UNDERSTAND.
#   · Escritura con destino ausente/desconocido/no verificado: BLOQUEADA sin
#     flags (fail-closed). Lectura sin destino: exige ALLOW_PROD=read-only.
#   · Pasan libre: E2E_KNOWN_REFS, localhost/127.0.0.1/::1/*.localhost.
#
# Uso:
#   source scripts/lib/assert-not-production.sh
#   assert_not_production write "$SUPA_URL" "mi-script"            # por URL
#   assert_not_production write "" "mi-script" "$PROJECT_REF"      # por ref (Management API)
#   # o directo:
#   bash scripts/lib/assert-not-production.sh --mode write --url "$SUPA_URL" --context mi-script
#   bash scripts/lib/assert-not-production.sh --mode write --project-ref "$REF" --context mi-script
#
# Firma: assert_not_production <mode> <url> <context> [project_ref]
# (url y project_ref son alternativos; si hay project_ref se valida ESE ref.)

PROD_REF_SH="wthkddeleylijmonclxg"            # CostproBD (producción)
E2E_KNOWN_REFS_SH="lguovmvrozxgssupkwpf e2e-branch-ephemeral" # refs no productivos verificados

# Extrae el ref de una URL: <ref>.supabase.co | db.<ref>.supabase.co |
# postgres://...postgres.<ref>@... → stdout el ref; vacío si no es Supabase.
_guard_extract_ref() {
  local s="$1" host ref
  [[ -z "$s" ]] && return 0
  if [[ "$s" =~ postgres(q l)?://[^@]*\.([a-z0-9]{18,22})@ ]]; then
    echo "${BASH_REMATCH[2]}"; return 0
  fi
  # host = primer componente tras protocolo, sin path/puerto
  host="$(printf '%s' "$s" | sed -n 's#^[a-zA-Z][a-zA-Z0-9+.-]*://\([^/?#]*\).*#\1#p' | cut -d: -f1 | tr 'A-Z' 'a-z')"
  [[ -z "$host" ]] && return 0
  if [[ "$host" == localhost || "$host" == 127.0.0.1 || "$host" == ::1 || "$host" == 0.0.0.0 || "$host" == *.localhost ]]; then
    echo "__LOCAL__"; return 0
  fi
  if [[ "$host" == *.supabase.co ]]; then
    ref="${host%.supabase.co}"
    ref="${ref#db.}"
    if [[ "$ref" == *.* ]]; then return 0; fi # subdominio inesperado
    if [[ "$ref" =~ ^[a-z0-9]{18,22}$ ]]; then echo "$ref"; fi
  fi
  return 0
}

_guard_is_local() { [[ "$1" == "http://"* || "$1" == "https://"* || "$1" == "postgres://"* || "$1" == "postgresql://"* ]]; }

assert_not_production() {
  local mode="${1:-write}"
  local url="${2:-}"
  local context="${3:-script}"
  local project_ref="${4:-}"

  local allow_read_only="${ALLOW_PROD:-}"
  local allow_write="${ALLOW_PROD_WRITE:-}"

  local ref="" target
  if [ -n "$project_ref" ]; then
    # Validación EXACTA del identificador usado por la operación.
    ref="$(printf '%s' "$project_ref" | tr 'A-Z' 'a-z')"
    if ! [[ "$ref" =~ ^[a-z0-9]{18,22}$ ]]; then
      echo "[$context] BLOQUEADO: ref de proyecto inválido '$ref' (CP-INFRA-019)." >&2
      return 1
    fi
    target="https://${ref}.supabase.co"
  else
    target="$url"
    ref="$(_guard_extract_ref "$url")"
  fi

  # ── Destino no identificado ──────────────────────────────────────────────
  if [ -z "$ref" ]; then
    # ¿la "no-URL" menciona producción? → tratarla como producción
    if [ -n "$target" ] && [[ "${target,,}" == *"$PROD_REF_SH"* ]]; then
      echo "[$context] BLOQUEADO: ${target%%\?*} es PRODUCCIÓN (CostproBD)." >&2
      echo "  Producción no es banco de pruebas (docs/OPERATIONS/REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS.md)." >&2
      echo "  · Para SOLO LECTURA:    export ALLOW_PROD=read-only" >&2
      echo "  · Para ESCRITURA:       export ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND" >&2
      echo "  · Alternativa correcta: apunta el script a CostproE2E (E2E_SUPABASE_URL) o a Supabase local." >&2
      return 1
    fi
    if [ "$mode" = "write" ]; then
      local shown="${target%%\?*}"; [ -n "$shown" ] || shown="(vacío)"
      echo "[$context] BLOQUEADO: operación de ESCRITURA sin destino verificado ($shown)." >&2
      if [ -z "$target" ]; then
        echo "  No se pasó ninguna URL (ni project_ref) al guard." >&2
      else
        echo "  La URL no es un destino de Supabase identificable (se esperaba https://<ref>.supabase.co, postgres://... o localhost)." >&2
      fi
      echo "  Este bloqueo NO se puede autorizar con flags: un destino no identificado no puede" >&2
      echo "  aprobarse a ciegas (CP-INFRA-019). Identifica el destino real:" >&2
      echo "  · URL explícita https://<ref>.supabase.co (CostproE2E o local) en la llamada al guard," >&2
      echo "  · o el ref exacto como 4º argumento si la operación es contra la Management API." >&2
      return 1
    fi
    if [ "$allow_read_only" != "read-only" ]; then
      echo "[$context] BLOQUEADO: lectura con destino DESCONOCIDO sin ALLOW_PROD=read-only." >&2
      echo "  Un destino no identificado podría ser producción: se exige el mismo permiso que la lectura de producción." >&2
      echo "  export ALLOW_PROD=read-only  — o pasa una URL explícita al guard." >&2
      return 1
    fi
    return 0
  fi

  # ── Local: paso libre ────────────────────────────────────────────────────
  if [ "$ref" = "__LOCAL__" ]; then return 0; fi

  # ── Producción ───────────────────────────────────────────────────────────
  if [ "$ref" = "$PROD_REF_SH" ]; then
    if [ "$allow_read_only" != "read-only" ]; then
      echo "[$context] BLOQUEADO: $target es PRODUCCIÓN (CostproBD)." >&2
      echo "  Producción no es banco de pruebas (docs/OPERATIONS/REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS.md)." >&2
      echo "  · Para SOLO LECTURA:    export ALLOW_PROD=read-only" >&2
      echo "  · Para ESCRITURA:       export ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND" >&2
      echo "  · Alternativa correcta: apunta el script a CostproE2E (E2E_SUPABASE_URL) o a Supabase local." >&2
      return 1
    fi
    if [ "$mode" = "write" ] && [ "$allow_write" != "I_UNDERSTAND" ]; then
      echo "[$context] BLOQUEADO: escritura contra PRODUCCIÓN ($target) requiere el doble flag:" >&2
      echo "  export ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND" >&2
      echo "  Si esto es una operación productiva legítima, documéntala en docs/audits/ antes de ejecutarla." >&2
      return 1
    fi
    if [ "$mode" = "write" ]; then
      echo "[$context] AUTORIZADO (explícito): escritura contra producción $target — ALLOW_PROD_WRITE=I_UNDERSTAND presente." >&2
    fi
    return 0
  fi

  # ── Ref remoto NO verificado ─────────────────────────────────────────────
  local known=0
  for e2e in $E2E_KNOWN_REFS_SH; do
    if [ "$ref" = "$e2e" ]; then known=1; break; fi
  done
  if [ "$known" = "1" ]; then return 0; fi
  if [ "$mode" = "write" ]; then
    echo "[$context] BLOQUEADO: escritura contra ref NO VERIFICADO ($ref)." >&2
    echo "  Solo pasan sin flags: CostproE2E ($E2E_KNOWN_REFS_SH), localhost y producción autorizada con doble flag." >&2
    echo "  Si este ref es un entorno legítimo, añádelo a E2E_KNOWN_REFS_SH en scripts/lib/assert-not-production.sh" >&2
    echo "  con su justificación, y deja constancia en docs/audits/ (CP-INFRA-019)." >&2
    return 1
  fi
  if [ "$allow_read_only" != "read-only" ]; then
    echo "[$context] BLOQUEADO: lectura contra ref NO VERIFICADO ($ref) sin ALLOW_PROD=read-only." >&2
    echo "  export ALLOW_PROD=read-only — o usa un ref E2E conocido." >&2
    return 1
  fi
  return 0
}

# ── CLI directo ────────────────────────────────────────────────────────────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  MODE="write"; URL=""; CONTEXT="cli"; PROJECT_REF=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --mode) MODE="$2"; shift 2 ;;
      --url) URL="$2"; shift 2 ;;
      --context) CONTEXT="$2"; shift 2 ;;
      --project-ref) PROJECT_REF="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  if [ -z "$URL" ] && [ -z "$PROJECT_REF" ]; then
    echo "[$CONTEXT] BLOQUEADO: falta --url o --project-ref (CP-INFRA-019: el guard debe recibir el destino real de la operación)." >&2
    exit 1
  fi
  assert_not_production "$MODE" "$URL" "$CONTEXT" "$PROJECT_REF"
fi
