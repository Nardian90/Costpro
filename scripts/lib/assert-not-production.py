#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GUARD DE PRODUCCIÓN — scripts/lib/assert-not-production.py  (CP-INFRA-019)
Variante Python del guard compartido. MISMO contrato que la versión .mjs
(Leer la documentación completa en scripts/lib/assert-not-production.mjs):

  · Producción (ref wthkddeleylijmonclxg) bloqueada SIEMPRE por defecto.
  · Lectura de producción: ALLOW_PROD=read-only.
  · Escritura de producción: además ALLOW_PROD_WRITE=I_UNDERSTAND.
  · Escritura con destino ausente/desconocido/no verificado: BLOQUEADA sin
    flags que la autoricen (fail-closed). Lectura sin destino identificado:
    exige ALLOW_PROD=read-only.
  · Pasan libre: E2E_KNOWN_REFS, localhost/127.0.0.1/::1/*.localhost.
  · project_ref= valida EXACTAMENTE ese identificador (refs hardcodeados de
    la Management API); url= valida la URL que el escritor usará.

Uso (import):
    from assert_not_production import assert_not_production
    url = assert_not_production(mode="write", url=SUPA_URL, context="mi-script")
    assert_not_production(mode="write", project_ref="lguov...", context="mi-script")

Uso (CLI):
    python3 scripts/lib/assert-not-production.py --mode write --url "$URL" --context mi-script
    python3 scripts/lib/assert-not-production.py --mode write --project-ref "$REF" --context mi-script
    → exit 0 si pasa; exit 1 con mensaje claro si bloquea.
"""
import argparse
import os
import re
import sys
from urllib.parse import urlparse

PROD_REF = "wthkddeleylijmonclxg"  # CostproBD (producción)
# Refs remotos NO productivos verificados (CostproE2E + rama efímera E2E).
E2E_KNOWN_REFS = ["lguovmvrozxgssupkwpf", "e2e-branch-ephemeral"]

_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}
_REF_RE = re.compile(r"^[a-z0-9]{18,22}$")


def classify_target(raw_url):
    """Clasifica el destino: ('supabase', ref) | ('local', None) |
    ('unknown', None) | ('none', None). Nunca asume: lo que no se identifica
    es 'unknown' (fail-closed)."""
    s = str(raw_url or "").strip()
    if not s:
        return ("none", None)
    # Connection string postgres: el ref puede venir del USUARIO del pooler
    # (postgres.<ref>:PASSWORD@...pooler.supabase.com, formato oficial) — la
    # regex tolera la contraseña tras el ref y exige el esquema al inicio
    # (CP-INFRA-019-FOLLOWUP fix C: `postgres.<ref>:<pw>@` no matcheaba).
    m_pg = re.match(r"postgres(?:ql)?://[^/@]*\.([a-z0-9]{18,22})(?::[^@]*)?@", s, re.IGNORECASE)
    if m_pg:
        return ("supabase", m_pg.group(1).lower())
    try:
        host = (urlparse(s).hostname or "").lower()
    except ValueError:
        return ("unknown", None)
    if not host:
        return ("unknown", None)
    if host in _LOCAL_HOSTS or host.endswith(".localhost"):
        return ("local", None)
    if host == "supabase.co" or host.endswith(".supabase.co"):
        parts = host.split(".")
        ref = None
        if len(parts) == 3 and parts[0] != "db":
            ref = parts[0]
        elif len(parts) == 4 and parts[0] == "db":
            ref = parts[1]
        if ref and _REF_RE.match(ref):
            return ("supabase", ref)
    return ("unknown", None)


def sanitize_target(raw_url) -> str:
    """Sanitiza un destino para mostrarlo en mensajes (fix B): devuelve
    ÚNICAMENTE esquema://host[:puerto] — sin usuario, contraseña, path, query
    ni fragment. Si no se puede analizar, descripción genérica: NUNCA el
    valor original (podría llevar credenciales embebidas). Solo afecta al
    mensaje; la clasificación usa el valor original."""
    s = str(raw_url or "").strip()
    if not s:
        return "(vacío)"
    try:
        p = urlparse(s)
        if not p.scheme or not p.hostname:
            return "(destino no identificable)"
        port = f":{p.port}" if p.port else ""
        return f"{p.scheme}://{p.hostname.lower()}{port}"
    except ValueError:
        return "(destino no identificable)"


def _prod_blocked(context: str, target: str) -> str:
    return (
        f"[{context}] BLOQUEADO: {target} es PRODUCCIÓN (CostproBD).\n"
        f"  Producción no es banco de pruebas (docs/OPERATIONS/REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS.md).\n"
        f"  · Para SOLO LECTURA:    export ALLOW_PROD=read-only\n"
        f"  · Para ESCRITURA:       export ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND\n"
        f"  · Alternativa correcta: apunta el script a CostproE2E (E2E_SUPABASE_URL) o a Supabase local."
    )


def _write_blocked(context: str, target: str, reason: str) -> str:
    return (
        f"[{context}] BLOQUEADO: operación de ESCRITURA sin destino verificado ({target}).\n"
        f"  {reason}\n"
        f"  Este bloqueo NO se puede autorizar con flags: un destino no identificado no puede\n"
        f"  aprobarse a ciegas (CP-INFRA-019). Identifica el destino real:\n"
        f"  · URL explícita https://<ref>.supabase.co (CostproE2E o local) en la llamada al guard,\n"
        f"  · o --project-ref/<project_ref> con el ref exacto si la operación es contra la Management API.\n"
        f"  · Producción NUNCA pasa como 'desconocida': si el destino es CostproBD se bloquea como producción."
    )


def assert_not_production(mode: str = "write", url: str = None, project_ref: str = None,
                          env_url: str = None, context: str = "script") -> str:
    """Levanta SystemExit si el destino es producción sin flags o una
    escritura sin destino identificado. Devuelve el destino validado.

    mode:        'read' (el script solo lee) o 'write' (escribe).
    url:         URL que el escritor USARÁ en su petición (fuente de verdad).
    project_ref: ref ya extraído por el escritor (Management API hardcodeada).
    env_url:     URL ambiental de respaldo — SOLO para modo lectura.
    """
    allow_read_only = os.environ.get("ALLOW_PROD") == "read-only"
    allow_write = os.environ.get("ALLOW_PROD_WRITE") == "I_UNDERSTAND"

    # 1. Identificar el destino REAL de la operación
    target = None
    if project_ref:
        ref = str(project_ref).strip().lower()
        if not _REF_RE.match(ref):
            raise SystemExit(_write_blocked(context, f"ref inválido '{ref}'",
                                            "El identificador de proyecto no tiene el formato de un ref de Supabase."))
        kind, cls_ref = "supabase", ref
        target = f"https://{ref}.supabase.co"
    else:
        target = url
        if not target and mode == "read":
            target = env_url if env_url is not None else (
                os.environ.get("E2E_SUPABASE_URL", "").strip()
                or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").strip()
                or os.environ.get("SUPABASE_URL", "").strip())
        kind, cls_ref = classify_target(target)

    # 2. Destino NO identificado
    if kind in ("none", "unknown"):
        # Se muestra SANITIZADO: sin credenciales, query ni path (fix B).
        shown = sanitize_target(target)
        if target and PROD_REF in str(target).lower():
            raise SystemExit(_prod_blocked(context, shown))
        if mode == "write":
            reason = ("No se pasó ninguna URL (ni project_ref) al guard." if kind == "none"
                      else "La URL no es un destino de Supabase identificable (se esperaba https://<ref>.supabase.co, postgres://... o localhost).")
            raise SystemExit(_write_blocked(context, shown, reason))
        if not allow_read_only:
            raise SystemExit(
                f"[{context}] BLOQUEADO: lectura con destino DESCONOCIDO ({shown}) sin ALLOW_PROD=read-only.\n"
                f"  Un destino no identificado podría ser producción: se exige el mismo permiso que la lectura de producción.\n"
                f"  export ALLOW_PROD=read-only  — o pasa una URL explícita al guard.")
        return target or ""

    # 3. Destino identificado
    if kind == "local":
        return target
    ref = cls_ref
    if ref == PROD_REF:
        # Mensaje con el destino SANITIZADO (fix B): la URL cruda podría
        # llevar credenciales. El ref de producción es público.
        shown_prod = f"https://{ref}.supabase.co" if project_ref else sanitize_target(target)
        if not allow_read_only:
            raise SystemExit(_prod_blocked(context, shown_prod))
        if mode == "write" and not allow_write:
            raise SystemExit(
                f"[{context}] BLOQUEADO: escritura contra PRODUCCIÓN ({shown_prod}) requiere el doble flag:\n"
                f"  export ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND\n"
                f"  Si esto es una operación productiva legítima, documéntala en docs/audits/ antes de ejecutarla.")
        if mode == "write" and allow_write:
            print(f"[{context}] AUTORIZADO (explícito): escritura contra producción {shown_prod} — "
                  f"ALLOW_PROD_WRITE=I_UNDERSTAND presente.", file=sys.stderr)
        return target
    if ref in E2E_KNOWN_REFS:
        return target
    if mode == "write":
        raise SystemExit(
            f"[{context}] BLOQUEADO: escritura contra ref NO VERIFICADO ({ref}).\n"
            f"  Solo pasan sin flags: CostproE2E ({' | '.join(E2E_KNOWN_REFS)}), localhost y producción autorizada con doble flag.\n"
            f"  Si este ref es un entorno legítimo, añádelo a E2E_KNOWN_REFS en scripts/lib/assert-not-production.py\n"
            f"  con su justificación, y deja constancia en docs/audits/ (CP-INFRA-019).")
    if not allow_read_only:
        raise SystemExit(
            f"[{context}] BLOQUEADO: lectura contra ref NO VERIFICADO ({ref}) sin ALLOW_PROD=read-only.\n"
            f"  export ALLOW_PROD=read-only — o usa un ref E2E conocido.")
    return target


def main() -> None:
    ap = argparse.ArgumentParser(description="Guard de producción compartido (CP-INFRA-019)")
    ap.add_argument("--mode", choices=["read", "write"], default="write")
    ap.add_argument("--url", default=None)
    ap.add_argument("--project-ref", default=None)
    ap.add_argument("--context", default="cli")
    a = ap.parse_args()
    if not a.url and not a.project_ref:
        print(f"[{a.context}] BLOQUEADO: falta --url o --project-ref (CP-INFRA-019: el guard debe recibir "
              f"el destino real de la operación).", file=sys.stderr)
        raise SystemExit(1)
    assert_not_production(mode=a.mode, url=a.url, project_ref=a.project_ref, context=a.context)


if __name__ == "__main__":
    main()
