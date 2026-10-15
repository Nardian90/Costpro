#!/usr/bin/env python3
"""
isolation_check.py — Verificación de aislamiento entre tiendas (SOLO LECTURA).

Protege y replica la evidencia ISO-01/ISO-02 del informe
`docs/audits/AUDITORIA_TRABAJADORES_COMISIONES_REPORTE_ENTREGA_2026-10-14.md` (§13):

    | Métrica ENERVIDA-VITALLCONS   | Antes | Después | Δ |
    | workers                       | 1     | 1       | 0 |
    | commission_rules              | 1     | 1       | 0 |
    | commission_payments           | 0     | 0       | 0 |
    | transactions del 14/10        | 3     | 3       | 0 |
    | inventario (Σ cantidad)       | 2.573 | 2.573   | 0 |
    | stock_movements               | 1.092 | 1.092   | 0 |
    | payment_transactions hoy      | 0     | 0       | 0 |

Uso:
    python3 scripts/ci-fix/isolation_check.py [--baseline baseline.json]

Sin --baseline, imprime el estado actual y sugiere guardarlo como baseline
(la primera ejecución tras un merge limpio define el "antes").
Con --baseline, compara y devuelve exit 1 si alguna métrica cambió.

⚠️  Esta herramienta NUNCA escribe en la base de datos: todas las sentencias
son SELECT. La tienda protegida ENERVIDA-VITALLCONS no debe recibir escrituras
de ninguna misión; este script es el guardián que lo demuestra.
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from db import sql  # noqa: E402

ENERVIDA_STORE_ID = "5e6fe821-5465-48b1-b3f1-3aa3182edc38"
COSTPRO_STORE_ID = "d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576"
OPERATIONAL_DATE = "2026-10-14"  # período auditado (corte de comparación)

# Métricas de la tienda protegida (ISO-01). Cada valor es una consulta SELECT.
ENERVIDA_METRICS = {
    "workers": f"select count(*)::int as v from workers where store_id = '{ENERVIDA_STORE_ID}'",
    "commission_rules": (
        f"select count(*)::int as v from commission_rules where store_id = '{ENERVIDA_STORE_ID}'"
    ),
    "commission_payments": (
        f"select count(*)::int as v from commission_payments where store_id = '{ENERVIDA_STORE_ID}'"
    ),
    # Esquema verificado en vivo: `transactions` (no sales_transactions) es la tabla
    # de ventas; el informe cuenta por día UTC (3 TX del 14/10). `inventory` es la
    # tabla de existencias (2573) y `stock_movements` tiene store_id propio (1092).
    "transactions_14_10": (
        f"select count(*)::int as v from transactions where store_id = '{ENERVIDA_STORE_ID}' "
        f"and created_at >= '{OPERATIONAL_DATE} 00:00:00+00' "
        f"and created_at < '2026-10-15 00:00:00+00'"
    ),
    "inventory_sum_qty": (
        f"select coalesce(sum(quantity),0)::float8 as v from inventory "
        f"where store_id = '{ENERVIDA_STORE_ID}'"
    ),
    "stock_movements_total": (
        f"select count(*)::int as v from stock_movements "
        f"where store_id = '{ENERVIDA_STORE_ID}'"
    ),
    "payment_transactions_today": (
        f"select count(*)::int as v from payment_transactions where store_id = '{ENERVIDA_STORE_ID}' "
        f"and created_at >= '2026-10-15 00:00:00+00'"
    ),
}

# Verificación ISO-02: ninguna transacción nueva fuera de las tiendas conocidas
# en la ventana de la misión (solo lectura, informativa).
OTHER_STORES_TX_QUERY = (
    "select store_id, count(*)::int as txs from transactions "
    "where created_at > '2026-10-15 00:00:00-04' and store_id not in "
    f"('{ENERVIDA_STORE_ID}', '{COSTPRO_STORE_ID}') group by store_id"
)


def collect() -> dict:
    snapshot = {"collected_at": datetime.now(timezone.utc).isoformat(), "enervida": {}, "other_stores_new_txs": None}
    for name, query in ENERVIDA_METRICS.items():
        status, rows = sql(query)
        if status != 201 or not rows:
            print(f"❌ {name}: query falló (HTTP {status})", file=sys.stderr)
            sys.exit(2)
        snapshot["enervida"][name] = rows[0]["v"]
        print(f"  ENERVIDA {name:<28} = {rows[0]['v']}")
    status, rows = sql(OTHER_STORES_TX_QUERY)
    snapshot["other_stores_new_txs"] = rows if status == 201 and rows else []
    flag = "⚠️ " if snapshot["other_stores_new_txs"] else "✓ "
    print(f"  {flag}Transacciones nuevas en otras tiendas (post-corte): {snapshot['other_stores_new_txs']}")
    return snapshot


def compare(baseline: dict, current: dict) -> int:
    failures = 0
    print("\n=== COMPARACIÓN ANTES → DESPUÉS (ENERVIDA-VITALLCONS) ===")
    for name, before in baseline.get("enervida", {}).items():
        after = current["enervida"].get(name)
        delta = None if after is None else (after - before) if isinstance(before, (int, float)) else "?"
        mark = "✓" if delta == 0 else "✗"
        if delta != 0:
            failures += 1
        print(f"  {mark} {name:<28} {before} → {after}  (Δ {delta})")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", help="JSON de baseline generado previamente")
    parser.add_argument("--save", help="Guardar el snapshot actual como baseline en esta ruta")
    args = parser.parse_args()

    print("=== SNAPSHOT DE AISLAMIENTO (solo lectura) ===")
    current = collect()

    if args.save:
        Path(args.save).write_text(json.dumps(current, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\n💾 Baseline guardado en {args.save}")

    if args.baseline:
        baseline = json.loads(Path(args.baseline).read_text(encoding="utf-8"))
        failures = compare(baseline, current)
        print(f"\nResultado: {'✅ SIN CAMBIOS (aislamiento preservado)' if failures == 0 else f'❌ {failures} métricas cambiaron'}")
        return 1 if failures else 0

    print("\nSugerencia: guarda este snapshot como baseline y re-ejecuta con --baseline tras la misión.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
