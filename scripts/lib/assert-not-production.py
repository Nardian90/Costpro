#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GUARD DE PRODUCCIÓN — scripts/lib/assert-not-production.py
Variante Python del guard compartido (mismo contrato que la versión .mjs).

Uso (import):
    from assert_not_production import assert_not_production
    url = assert_not_production(mode="write", url=os.environ["NEXT_PUBLIC_SUPABASE_URL"],
                                context="mi-script")

Uso (CLI):
    python3 scripts/lib/assert-not-production.py --mode write --url "$URL" --context mi-script
    → exit 0 si pasa; exit 1 con mensaje claro si bloquea.
"""
import argparse
import os
import sys

PROD_REFS = ["wthkddeleylijmonclxg"]  # CostproBD (producción)


def _is_production(url: str) -> bool:
    return bool(url) and any(ref in str(url) for ref in PROD_REFS)


def _mask(url: str) -> str:
    s = str(url)
    if "://" in s:
        host = s.split("://", 1)[1].split("/")[0]
        return "https://" + host
    return s.split("?")[0]


def assert_not_production(mode: str = "write", url: str = None, context: str = "script") -> str:
    """Levanta SystemExit si la URL es producción y faltan los flags.

    mode: 'read' (el script solo lee) o 'write' (escribe).
    url:  si es None se deduce de E2E_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL /
          SUPABASE_URL (mismo orden que la versión .mjs).
    Devuelve la URL validada.
    """
    if url is None:
        url = (os.environ.get("E2E_SUPABASE_URL", "").strip()
               or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").strip()
               or os.environ.get("SUPABASE_URL", "").strip())

    if not _is_production(url):
        return url

    allow_read_only = os.environ.get("ALLOW_PROD") == "read-only"
    allow_write = os.environ.get("ALLOW_PROD_WRITE") == "I_UNDERSTAND"

    if not allow_read_only:
        raise SystemExit(
            f"[{context}] BLOQUEADO: {_mask(url)} es PRODUCCIÓN (CostproBD).\n"
            f"  Producción no es banco de pruebas (docs/OPERATIONS/REGLA_PRODUCCION_NO_ES_BANCO_DE_PRUEBAS.md).\n"
            f"  · Para SOLO LECTURA:    export ALLOW_PROD=read-only\n"
            f"  · Para ESCRITURA:       export ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND\n"
            f"  · Alternativa correcta: apunta el script a CostproE2E (E2E_SUPABASE_URL) o a Supabase local."
        )

    if mode == "write" and not allow_write:
        raise SystemExit(
            f"[{context}] BLOQUEADO: escritura contra PRODUCCIÓN ({_mask(url)}) requiere el doble flag:\n"
            f"  export ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND\n"
            f"  Si esto es una operación productiva legítima, documéntala en docs/audits/ antes de ejecutarla."
        )

    if mode == "write" and allow_write:
        print(f"[{context}] AUTORIZADO (explícito): escritura contra producción {_mask(url)} — "
              f"ALLOW_PROD_WRITE=I_UNDERSTAND presente.", file=sys.stderr)
    return url


def main() -> None:
    ap = argparse.ArgumentParser(description="Guard de producción compartido")
    ap.add_argument("--mode", choices=["read", "write"], default="write")
    ap.add_argument("--url", default=None)
    ap.add_argument("--context", default="cli")
    a = ap.parse_args()
    assert_not_production(mode=a.mode, url=a.url, context=a.context)


if __name__ == "__main__":
    main()
