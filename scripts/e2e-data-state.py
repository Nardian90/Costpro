#!/usr/bin/env python3
"""
FASE 2/14/22 — Verificación de estado de datos E2E en Supabase (CostPro).

Cuenta:
  - stores totales + residuales E2E (por patrones documentados en
    docs/audits/E2E-DATA-HYGIENE.md y e2e/fixtures/run-env.ts)
  - usuarios auth totales + E2E (e2e-*@costpro.test)
  - entidades protegidas (3 tiendas + 8 usuarios) intactas

Uso: python3 scripts/e2e-data-state.py
Exit code 0 = higiene OK (0 residuales, protegidas intactas).
"""
import json
import os
import sys
import urllib.request
import urllib.error

ENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")

def load_env(path):
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip()
    return env

ENV = load_env(ENV_PATH)
SB_URL = ENV["NEXT_PUBLIC_SUPABASE_URL"]
SRK = ENV["SUPABASE_SERVICE_ROLE_KEY"]

def sb_get(table, query):
    url = f"{SB_URL}/rest/v1/{table}?{query}"
    req = urllib.request.Request(url, headers={
        "apikey": SRK,
        "Authorization": f"Bearer {SRK}",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code} en {table}: {e.read().decode()[:200]}")
        return None

def count(table, query):
    url = f"{SB_URL}/rest/v1/{table}?{query}"
    req = urllib.request.Request(url, headers={
        "apikey": SRK,
        "Authorization": f"Bearer {SRK}",
        "Prefer": "count=exact",
        "Range": "0-0",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        cr = r.headers.get("content-range", "0/0")
        return int(cr.split("/")[1])

def list_auth_users():
    """Pagina auth.users vía Admin API (schema auth no expuesto en REST)."""
    out, page, per = [], 1, 200
    while True:
        url = f"{SB_URL}/auth/v1/admin/users?page={page}&per_page={per}"
        req = urllib.request.Request(url, headers={
            "apikey": SRK,
            "Authorization": f"Bearer {SRK}",
        })
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode())
        users = data.get("users", [])
        out.extend(users)
        if len(users) < per:
            break
        page += 1
    return out

# Patrones residuales E2E (documentados) — ILIKE
E2E_STORE_PATTERNS = [
    "E2E80 *", "E2E %", "E2E-%", "E2E-%", "E2E_%", "E2E-CLEANUP-PROBE-%",
    "HOT %", "Updated Name E2E%", "TEST-%", "AUDIT %", "%Piloto E2E%",
    "%E2E ISOLATION%", "%RUN%",
]

print("=" * 64)
print("FASE 2 — ESTADO DE DATOS E2E (Supabase real)")
print("=" * 64)

total_stores = count("stores", "select=id")
total_profiles = count("profiles", "select=id")
print(f"stores totales        : {total_stores}")
print(f"profiles totales      : {total_profiles}")

residual_stores = 0
for p in E2E_STORE_PATTERNS:
    c = count("stores", f"select=id&name=ilike.{urllib.request.quote(p)}")
    if c:
        print(f"  residual pattern {p!r}: {c}")
    residual_stores += c

# Usuarios E2E vía profiles (schema public; auth.users no listable —
# Admin API /admin/users devuelve 500 'Database error finding users',
# documentado como ENVIRONMENT; GET/DELETE por ID sí funcionan).
residual_users = count("profiles", "select=id&email=ilike.e2e-%25")
probe_users = count("profiles", "select=id&email=ilike.%25%40costpro.test")

print("-" * 64)
print(f"E2E residual stores   : {residual_stores}   (esperado 0)")
print(f"E2E residual profiles : {residual_users}   (esperado 0)")
print(f"profiles *@costpro.test: {probe_users}   (esperado 0)")

# Protegidas — tiendas
PROTECTED_STORES = {
    "d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576": "TIENDA CENTRAL COSTPRO",
    "43a4dabc-b8b4-4b66-82b3-0c75335ca5d1": "Puerto Padre VITALLCONS",
    "5e6fe821-5465-48b1-b3f1-3aa3182edc38": "ENERVIDA-VITALLCONS",
}
print("-" * 64)
ok = True
for sid, name in PROTECTED_STORES.items():
    rows = sb_get("stores", f"select=id,name,is_active&id=eq.{sid}")
    present = bool(rows)
    status = "OK" if present else "MISSING"
    if not present:
        ok = False
    print(f"protegida [{status}] {name}")

# Protegidos — usuarios
PROTECTED_USERS = [
    "admin@costpro.com", "admin@demo.com", "adrianpompasantana@gmail.com",
    "almacen@demo.com", "belkis9999@gmail.com", "cajero@demo.com",
    "encargado@demo.com", "costo@demo.com",
]
for email in PROTECTED_USERS:
    rows = sb_get("profiles", f"select=id,email&email=eq.{urllib.request.quote(email)}")
    present = bool(rows)
    status = "OK" if present else "MISSING"
    if not present:
        ok = False
    print(f"protegido  [{status}] {email}")

print("=" * 64)
verdict = "HIGIENE OK" if (residual_stores == 0 and residual_users == 0 and ok) else "CONTAMINACION / FALTA ENTIDAD"
print(f"VEREDICTO: {verdict}")
sys.exit(0 if verdict == "HIGIENE OK" else 1)
