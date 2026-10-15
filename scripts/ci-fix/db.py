#!/usr/bin/env python3
"""
db.py — Helper de solo lectura para consultas SQL vía la Management API de Supabase.

PROTECCIÓN DE TRABAJO: este helper vivía solo en el entorno local y se perdió con
el reinicio del contenedor. Se protege en el repo porque el informe de auditoría
`docs/audits/AUDITORIA_TRABAJADORES_COMISIONES_REPORTE_ENTREGA_2026-10-14.md`
y `AUDITORIA_CONCILIACION_ENERVIDA_VITALLCONS.md` dependen de él para replicar
sus verificaciones.

Uso:
    from db import sql
    status, rows = sql("select 1 as x")
    # status: código HTTP (201 = éxito; la Management API devuelve 201, no 200)
    # rows:   lista de dicts (filas) o None si hubo error

Autenticación: lee el token de la variable de entorno SUPABASE_ACCESS_TOKEN
(o del archivo .env del repo si python-dotenv no está disponible se parsea
manualmente). NUNCA hardcodear el token en el código.

Solo ejecutar sentencias SELECT. Esta librería está pensada para auditorías
de solo lectura; no ofrece helpers de escritura a propósito.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_PROJECT_REF = "wthkddeleylijmonclxg"
MGMT_BASE = "https://api.supabase.com/v1/projects/{ref}/database/query"
TIMEOUT_SECONDS = 60


def _load_token_from_env_file() -> str | None:
    """Parsea SUPABASE_ACCESS_TOKEN del .env del repo (sin dependencias externas)."""
    candidates = [
        Path(__file__).resolve().parents[2] / ".env",  # <repo>/scripts/ci-fix/db.py
    ]
    for env_path in candidates:
        try:
            for line in env_path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line.startswith("SUPABASE_ACCESS_TOKEN="):
                    token = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if token:
                        return token
        except OSError:
            continue
    return None


def _get_token() -> str:
    token = os.environ.get("SUPABASE_ACCESS_TOKEN") or _load_token_from_env_file()
    if not token:
        raise RuntimeError(
            "SUPABASE_ACCESS_TOKEN no está definido. Exportarlo o colocar el .env "
            "en la raíz del repo. Nunca hardcodear el token en el código."
        )
    return token


def sql(query: str, project_ref: str = DEFAULT_PROJECT_REF, readonly_only: bool = True):
    """Ejecuta una consulta SQL contra el proyecto Supabase.

    Devuelve (status, rows). Con readonly_only=True (por defecto) rechaza
    cualquier sentencia que no empiece por SELECT/WITH como salvaguarda
    contra escrituras accidentales durante una auditoría.
    """
    if readonly_only:
        normalized = query.strip().lstrip("(").lstrip()
        head = normalized.split(None, 1)[0].upper() if normalized else ""
        if head not in ("SELECT", "WITH", "EXPLAIN", "SHOW"):
            raise ValueError(
                "db.py es de SOLO LECTURA: se rechaza la sentencia que no empieza "
                f"por SELECT/WITH/EXPLAIN/SHOW (recibido: {head or '<vacía>'!r})"
            )

    url = MGMT_BASE.format(ref=project_ref)
    payload = json.dumps({"query": query}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {_get_token()}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            body = resp.read().decode("utf-8")
            status = resp.status
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(f"[db] HTTP {exc.code} en query: {detail[:500]}", file=sys.stderr)
        return exc.code, None
    except urllib.error.URLError as exc:
        print(f"[db] Error de red: {exc}", file=sys.stderr)
        return 0, None

    try:
        rows = json.loads(body) if body else []
    except json.JSONDecodeError:
        rows = body  # respuesta no-JSON (p. ej. texto plano)
    return status, rows


if __name__ == "__main__":
    q = sys.argv[1] if len(sys.argv) > 1 else "select current_timestamp as now"
    st, rws = sql(q)
    print(f"status={st}")
    print(json.dumps(rws, indent=2, ensure_ascii=False, default=str)[:4000])
