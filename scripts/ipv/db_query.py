#!/usr/bin/env python3
"""Helper de consulta SQL (solo lectura) vía Management API de Supabase.

Uso: python3 scripts/ipv/db_query.py "SELECT ..."
Imprime el resultado como JSON. NUNCA ejecuta escrituras.

Seguridad (GitHub Push Protection 2026-10-16): el token NO vive en este
archivo — se lee de la variable de entorno SUPABASE_ACCESS_TOKEN o del .env
untracked de la raíz del repositorio.
"""
import json
import os
import sys
import urllib.request

REF = "wthkddeleylijmonclxg"
URL = f"https://api.supabase.com/v1/projects/{REF}/database/query"


def load_token() -> str:
    tok = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    if tok:
        return tok
    # fallback: .env untracked de la raíz (KEY=VALUE)
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
    try:
        with open(os.path.abspath(env_path), encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("SUPABASE_ACCESS_TOKEN="):
                    return line.strip().split("=", 1)[1]
    except OSError:
        pass
    print("Error: falta SUPABASE_ACCESS_TOKEN (env o .env del repo).", file=sys.stderr)
    sys.exit(2)


def query(sql: str, token: str):
    req = urllib.request.Request(
        URL,
        data=json.dumps({"query": sql}).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: db_query.py <sql>", file=sys.stderr)
        sys.exit(2)
    try:
        print(json.dumps(query(sys.argv[1], load_token()), ensure_ascii=False, indent=1, default=str))
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode()[:2000]}", file=sys.stderr)
        sys.exit(1)
