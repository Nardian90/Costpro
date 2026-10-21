#!/usr/bin/env python3
"""Ejecutor PREPARADO — regla ENERVIDA de la decisión del propietario (2026-10-21).

DECISIÓN RATIFICADA (docs/decisions/2026-10-21-decision-propietario-vales.md):
  «si es en enervida anula los vales si no estan confirmados»

Este script NUNCA borra nada. Dos modos:

  (por defecto)         SOLO LECTURA vía Management API: lista los vales de
                        ENERVIDA y su estado de confirmación (cruce con los
                        vales verificados por conciliación).
  --apply               MODO ESCRITURA (solo en el entorno con credenciales
                        del propietario): reversión OFICIAL por RPC
                        reverse_vale_salida (devuelve stock + audit_logs +
                        restauración de OT). Exige --user-id (admin de
                        ENERVIDA), triple confirmación interactiva y reason
                        trazable. Cada vale se procesa individualmente; un
                        fallo NO aborta el resto.

Credenciales (ninguna vive en este archivo — GitHub Push Protection 2026-10-16):
  SUPABASE_ACCESS_TOKEN   (env) o .env untracked de la raíz del repo
  Ref del proyecto:       wthkddeleylijmonclxg (mismo que scripts/ipv/db_query.py)

Seguridad:
  - Alcance duro: SOLO issue_slips.store_id = 5e6fe821-5465-48b1-b3f1-3aa3182edc38
    (ENERVIDA-VITALLCONS, store protegida por e2e/config/protected-resources.json).
  - Solo status='completed' son candidatos a anulación (reversed/voided ya no
    descuentan stock — anularlos no tiene efecto contable).
  - Los vales VERIFICADOS por conciliación (VS-000185..188-2026 + los que el
    propietario añada a CONFIRMED_NUMBERS) quedan FUERA de toda ruta de anulación.
  - --apply usa SELECT public.reverse_vale_salida(...) — la MISMA RPC de la
    app (valida has_store_access_as, exige status='completed', advisory lock);
    nunca UPDATE/DELETE crudos sobre issue_slips.
"""
import argparse
import json
import os
import sys
import urllib.request

REF = "wthkddeleylijmonclxg"
ENERVIDA_STORE_ID = "5e6fe821-5465-48b1-b3f1-3aa3182edc38"

# Vales de ENERVIDA confirmados por conciliación documental (REGISTRO_OPERACIONES_2026-10-16_ENERVIDA
# + conciliación 179/179, CP-RES-006). El propietario puede añadir más aquí.
CONFIRMED_NUMBERS = {
    "VS-000185-2026",
    "VS-000186-2026",
    "VS-000187-2026",
    "VS-000188-2026",
}

REVERSE_REASON = "Anulado por no confirmación — instrucción del propietario 2026-10-21"


def load_token() -> str:
    tok = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    if tok:
        return tok
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".env")
    try:
        with open(os.path.abspath(env_path), encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("SUPABASE_ACCESS_TOKEN="):
                    return line.strip().split("=", 1)[1]
    except FileNotFoundError:
        pass
    print("ERROR: se requiere SUPABASE_ACCESS_TOKEN (env o .env de la raíz del repo).",
          file=sys.stderr)
    sys.exit(2)


def sql(query: str, token: str, timeout: int = 180):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/database/query",
        data=json.dumps({"query": query}).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, json.loads(r.read())


LIST_SQL = """
SELECT id, slip_number, status, notes, created_at, total_cost,
       (SELECT count(*) FROM issue_slip_items i WHERE i.issue_slip_id = issue_slips.id) AS items
FROM public.issue_slips
WHERE store_id = '%s'
ORDER BY created_at DESC;
""" % ENERVIDA_STORE_ID


def classify(row):
    """Estado de confirmación documental de un vale de ENERVIDA."""
    num = row.get("slip_number") or ""
    if num in CONFIRMED_NUMBERS:
        return "CONFIRMADO (conciliación documental)"
    if row.get("status") == "completed":
        return "NO CONFIRMADO — candidato a anulación según la regla"
    return "no accionable (status=%s) — ya no descuenta stock" % row.get("status")


def main():
    ap = argparse.ArgumentParser(description="Regla ENERVIDA de vales no confirmados (decisión del propietario 2026-10-21)")
    ap.add_argument("--apply", action="store_true",
                    help="MODO ESCRITURA: reversión oficial por RPC (requiere --user-id).")
    ap.add_argument("--user-id",
                    help="UUID del admin de ENERVIDA para p_user_id de la RPC (auditoría).")
    args = ap.parse_args()

    token = load_token()

    if not args.apply:
        status, rows = sql(LIST_SQL, token)
        print("== VALES DE ENERVIDA (lectura) — HTTP %s ==" % status)
        candidates = 0
        for r in rows:
            cls = classify(r)
            print("\n%s  [%s]  %s" % (r.get("slip_number"), r.get("status"), str(r.get("created_at"))[:19]))
            print("  id:        %s" % r.get("id"))
            print("  items:     %s  total_cost: %s" % (r.get("items"), r.get("total_cost")))
            print("  nota:      %s" % r.get("notes"))
            print("  clase:     %s" % cls)
            if cls.startswith("NO CONFIRMADO"):
                candidates += 1
        print("\n== Resumen: %d vales en ENERVIDA; %d candidato(s) a anulación ==" % (len(rows), candidates))
        if candidates:
            print("Para anular (entorno con credenciales del propietario):")
            print("  python3 %s --apply --user-id <UUID-admin-ENERVIDA>" % sys.argv[0])
            print("  (o vía UI: Vales de Salida → Devolver, con el motivo oficial)")
        return

    # ── MODO APPLY (escritura, entorno del propietario) ──
    if not args.user_id:
        print("ERROR: --apply requiere --user-id (UUID del admin para p_user_id).", file=sys.stderr)
        sys.exit(2)

    status, rows = sql(LIST_SQL, token)
    targets = [r for r in rows
               if classify(r).startswith("NO CONFIRMADO") and r.get("status") == "completed"]
    if not targets:
        print("No hay vales no confirmados en ENERVIDA. Nada que anular.")
        return

    print("Se van a ANULAR (reversión oficial) %d vale(s) de ENERVIDA:" % len(targets))
    for r in targets:
        print("  - %s  nota: %s  (%s items)" % (r["slip_number"], r.get("notes"), r.get("items")))
    print("\nRPC: reverse_vale_salida(p_slip_id, p_reason='%s', p_user_id=%s)" % (REVERSE_REASON, args.user_id))
    print("Esta operación devuelve stock, restaura OT y escribe audit_logs. Es IRREVERSIBLE por diseño contable.")
    for i in range(3):
        resp = input("\nConfirmación %d/3 — escribir ANULAR para continuar: " % (i + 1)).strip()
        if resp != "ANULAR":
            print("Abortado por el operador. Cero escrituras.")
            return

    for r in targets:
        q = ("SELECT public.reverse_vale_salida("
             "p_slip_id := '%s', "
             "p_reason := '%s', "
             "p_user_id := '%s') AS result;"
             % (r["id"], REVERSE_REASON.replace("'", "''"), args.user_id))
        try:
            st, res = sql(q, token)
            print("[OK] %s → HTTP %d: %s" % (r["slip_number"], st, json.dumps(res)[:160]))
        except Exception as e:  # noqa: BLE001 — reporte por vale, sin abortar el lote
            print("[ERROR] %s: %s" % (r["slip_number"], e))

    print("\nVerificación posterior sugerida (lectura):")
    print("  SELECT slip_number, status FROM public.issue_slips WHERE store_id='%s' ORDER BY created_at DESC;" % ENERVIDA_STORE_ID)


if __name__ == "__main__":
    main()
