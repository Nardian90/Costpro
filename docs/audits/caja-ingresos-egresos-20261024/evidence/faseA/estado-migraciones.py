#!/usr/bin/env python3
"""Comparación verbatim: cuerpos VIVOS de producción vs cada versión de migración.

Determina el estado de aplicación real de la cadena de caja:
  20261024180000, 20261024220000, 20261024230000, 20261024400000
Para cada función redefinida en cada archivo, compara el cuerpo vivo
(normalizado en espacios) contra el cuerpo del archivo.
"""
import json
import re
import urllib.request

ENV_PATH = "/home/z/costpro/.env"
MIG_DIR = "/home/z/costpro/supabase/migrations"

MIGRATIONS = [
    "20261024180000_auditoria_caja_idempotencia_determinista.sql",
    "20261024220000_saldo_fisico_egresos_multimoneda.sql",
    "20261024230000_devoluciones_reembolso_fisico_moneda.sql",
    "20261024400000_devoluciones_recuperacion_reversa.sql",
]


def load_env():
    env = {}
    with open(ENV_PATH) as f:
        for line in f:
            m = re.match(r"^([A-Z_][A-Z0-9_]*)=(.*)$", line.strip())
            if m:
                env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env


def live_query(sql):
    env = load_env()
    url = env["NEXT_PUBLIC_SUPABASE_URL"]
    token = env["SUPABASE_ACCESS_TOKEN"]
    ref = re.match(r"https://([a-z0-9]+)\.supabase\.co", url).group(1)
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode())


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def extract_fn_versions(src, fn_name):
    """Extrae cada bloque CREATE OR REPLACE FUNCTION <fn_name> ... $function$;"""
    versions = []
    pattern = re.compile(
        r"CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?" + re.escape(fn_name) + r"\s*\(.*?AS\s+\$function\$.*?\$function\$",
        re.DOTALL | re.IGNORECASE,
    )
    for m in pattern.finditer(src):
        versions.append(m.group(0))
    return versions


def main():
    # 1. Recolectar funciones y versiones por migración
    plan = {}  # fn -> list of (migration, index, body)
    for mig in MIGRATIONS:
        src = open(f"{MIG_DIR}/{mig}").read()
        for fn in re.findall(
            r"CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?([a-z0-9_]+)\s*\(", src, re.IGNORECASE
        ):
            plan.setdefault(fn, [])
            versions = extract_fn_versions(src, fn)
            for idx, v in enumerate(versions):
                plan[fn].append((mig, idx, v))

    fns = sorted(plan.keys())
    print(f"Funciones redefinidas en la cadena: {len(fns)}")
    print(", ".join(fns))

    # 2. Cuerpos vivos
    in_list = ", ".join("'" + f.replace("'", "''") + "'" for f in fns)
    rows = live_query(
        "SELECT p.proname, pg_get_functiondef(p.oid) AS def "
        "FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
        "WHERE n.nspname='public' AND p.proname IN (" + in_list + ")"
    )
    live = {}
    for r in rows:
        live.setdefault(r["proname"], []).append(r["def"])

    # 3. Comparar
    print("\n=== COMPARACIÓN VERBATIM (normalizado espacios) ===")
    results = {}
    for fn in fns:
        versions = plan[fn]
        mig, idx, body = versions[-1]
        live_defs = live.get(fn, [])
        match = any(norm(ld) == norm(body) for ld in live_defs)
        applied_ver = None
        for (m2, i2, b2) in versions:
            if any(norm(ld) == norm(b2) for ld in live_defs):
                applied_ver = (m2, i2)
                break
        state = "MATCH-LAST" if match else (
            f"MATCH-OLDER({applied_ver[0][:17]}#{applied_ver[1]})" if applied_ver else "NO-MATCH"
        )
        results[fn] = {"last": mig[:17], "applied": state}
        print(f"{fn:45s} última={mig[:17]} vivo={state}")

    print("\n=== RESUMEN ===")
    for mig in MIGRATIONS:
        tag = mig[:17]
        fns_in = [f for f in fns if plan[f][-1][0] == mig]
        if not fns_in:
            continue
        states = [results[f]["applied"] for f in fns_in]
        full = all(s == "MATCH-LAST" for s in states)
        none = all(s == "NO-MATCH" for s in states)
        print(f"{mig}")
        if full:
            print("   ✅ APLICADA (todas las funciones coinciden)")
        elif none:
            print("   ❌ NO APLICADA")
        else:
            print("   ⚠️ PARCIAL/INCONSISTENTE: " + ", ".join(f"{f}:{s}" for f, s in zip(fns_in, states)))

    json.dump(results, open("/home/z/my-project/scripts/mision-integral/estado-migraciones-vivo.json", "w"), indent=2)


if __name__ == "__main__":
    main()
