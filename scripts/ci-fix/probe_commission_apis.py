#!/usr/bin/env python3
"""
probe_commission_apis.py — Sonda de contrato de las APIs de comisiones (solo lectura).

Protege y replica la evidencia del §2.1 del informe
`docs/audits/AUDITORIA_TRABAJADORES_COMISIONES_REPORTE_ENTREGA_2026-10-14.md`.

El defecto original («Gestionar comisiones → no se muestra nada») era una cadena
de 4 fallas: POST /api/commissions/calculate sin store_id (→ 400), GET
/api/commissions/payments?store_id=me casteado a UUID (→ 500), errores tragados
con catch(()=>null) y POST de confirmación sin store_id. El fix (PR #1406)
añadió store_id obligatorio en el cliente y validación UUID fail-closed en el
servidor. Este script verifica que ese contrato SIGUE en pie (guarda de
regresión):

    P1  POST /api/commissions/calculate sin store_id      → 400 "Campos requeridos: store_id…"
    P2  GET  /api/commissions/payments?store_id=me        → 400 "store_id inválido"  (antes del fix: 500)
    P3  POST /api/commissions/calculate CON store_id y sin sesión → 401 (auth antes de negocio)

Sin credenciales: solo ejecuta P1-P3 sin sesión (capa fail-closed) y termina
con exit 0 informando SKIP de las pruebas autenticadas.

Uso (con sesión — flujo oficial de Supabase grant_type=password):
    COSTPRO_PROBE_EMAIL=admin@demo.com COSTPRO_PROBE_PASSWORD=*** \
        python3 scripts/ci-fix/probe_commission_apis.py [--base http://localhost:3000]

Variables opcionales:
    COSTPRO_PROBE_STORE_ID  UUID de tienda para la prueba autenticada P4
                            (default: TIENDA CENTRAL COSTPRO, la tienda de pruebas).
    COSTPRO_PROBE_ALLOW_REMOTE=1  permitir apuntar a un host que no sea localhost
                            (protección contra tocar producción por accidente).

⚠️  Esta sonda NO confirma pagos ni crea datos: nunca llama al POST de
confirmación; solo endpoints de cálculo/lectura con payloads inválidos o vacíos.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_STORE_ID = "d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576"  # TIENDA CENTRAL COSTPRO


def load_env(path: Path) -> dict:
    env = {}
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    return env


def request(method: str, url: str, *, token: str | None = None, body: dict | None = None,
            apikey: str | None = None, timeout: int = 30):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if apikey:
        headers["apikey"] = apikey
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode(errors="replace")
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, {"raw": raw[:300]}
    except urllib.error.URLError as exc:
        return 0, {"error": f"red: {exc}"}


def supabase_login(env: dict, email: str, password: str):
    base = env.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    anon = env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    if not base or not anon:
        return None
    status, data = request(
        "POST",
        f"{base}/auth/v1/token?grant_type=password",
        body={"email": email, "password": password},
        apikey=anon,
    )
    if status == 200 and data.get("access_token"):
        return data["access_token"]
    print(f"  ⚠️ login Supabase falló (HTTP {status}); se omiten pruebas autenticadas", file=sys.stderr)
    return None


def check(label: str, got: int, body: dict, expect_codes: tuple, must_contain: str | None = None) -> bool:
    ok_code = got in expect_codes
    ok_body = must_contain is None or must_contain.lower() in json.dumps(body, ensure_ascii=False).lower()
    mark = "✅" if (ok_code and ok_body) else "❌"
    print(f"  {mark} {label}: HTTP {got} {json.dumps(body, ensure_ascii=False)[:140]}")
    if must_contain and not ok_body:
        print(f"      (esperaba que el cuerpo contuviera {must_contain!r})")
    return ok_code and ok_body


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="http://localhost:3000")
    args = parser.parse_args()

    if "localhost" not in args.base and "127.0.0.1" not in args.base:
        if os.environ.get("COSTPRO_PROBE_ALLOW_REMOTE") != "1":
            print("⛔ --base apunta a un host remoto y COSTPRO_PROBE_ALLOW_REMOTE!=1: abortado "
                  "para evitar tocar producción. Solo lectura de todas formas, pero la sonda "
                  "está pensada para el entorno local.")
            return 2

    env = load_env(REPO_ROOT / ".env")
    results = []
    print(f"=== Sonda de contrato de comisiones → {args.base} ===")

    # P1 — calculate sin store_id, sin sesión: la capa de auth debe ir primero (401)
    st, body = request("POST", f"{args.base}/api/commissions/calculate",
                       body={"date_from": "2026-10-14", "date_to": "2026-10-14", "mode": "rules"})
    results.append(check("P1a calculate sin store_id (sin sesión) → 401", st, body, (401,)))

    # P2 — payments con sentinela 'me', sin sesión: 401 y NUNCA 500 ni texto SQL
    st, body = request("GET", f"{args.base}/api/commissions/payments?store_id=me&date_from=2026-10-14&date_to=2026-10-14")
    results.append(check("P2a payments store_id=me (sin sesión) → 401", st, body, (401,)))
    leak = "sql" not in json.dumps(body, ensure_ascii=False).lower() and "uuid" not in json.dumps(body, ensure_ascii=False).lower()
    print(f"  {'✅' if leak else '❌'} P2b sin fuga de detalle interno (sin texto SQL/UUID en el cuerpo)")
    results.append(leak)

    # Con credenciales: contrato completo post-fix
    email = os.environ.get("COSTPRO_PROBE_EMAIL") or env.get("COSTPRO_PROBE_EMAIL")
    password = os.environ.get("COSTPRO_PROBE_PASSWORD") or env.get("COSTPRO_PROBE_PASSWORD")
    if email and password:
        token = supabase_login(env, email, password)
        if token:
            # P3 — calculate sin store_id CON sesión → 400 fail-closed (causa raíz 1)
            st, body = request("POST", f"{args.base}/api/commissions/calculate", token=token,
                               body={"date_from": "2026-10-14", "date_to": "2026-10-14", "mode": "rules"})
            results.append(check("P3 calculate sin store_id (con sesión) → 400", st, body, (400,), "store_id"))

            # P4 — payments store_id=me CON sesión → 400 limpio (causa raíz 2; antes: 500 + fuga SQL)
            st, body = request("GET", f"{args.base}/api/commissions/payments?store_id=me&date_from=2026-10-14&date_to=2026-10-14", token=token)
            results.append(check("P4 payments store_id=me (con sesión) → 400", st, body, (400,), "inv"))
        else:
            print("  ⏭️ SKIP P3/P4 (login falló)")
    else:
        print("  ⏭️ SKIP P3/P4 (sin COSTPRO_PROBE_EMAIL/COSTPRO_PROBE_PASSWORD — pruebas autenticadas omitidas)")

    passed = sum(1 for r in results if r)
    total = len(results)
    print(f"\nResultado: {passed}/{total} verificaciones OK")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
