# W9.4.7 — H5-B1 · FASE 23 — Integridad de datos (PRE == POST)

Fecha: 2026-09-03 · Datos completos: `19-data-integrity.json` · Baseline: `11-pre-drop-baseline.json` (27 métricas, capturada pre-apply)

## Comparación de métricas relevantes (PRE vs POST-apply)

| Métrica | PRE | POST | Δ |
|---|---|---|---|
| transactions total / por status | 520 / {completed: 520} | idéntico | 0 |
| transaction_items | 555 | idéntico | 0 |
| products count / Σ stock_current | 323 / 12094.6289 | idéntico | 0 |
| product_lots Σ quantity_remaining | 0 | idéntico | 0 |
| kardex_entries | 702 | idéntico | 0 |
| stock_movements | 702 | idéntico | 0 |
| wac_change_log | 0 | idéntico | 0 |
| payment_transactions | 366 | idéntico | 0 |
| audit_logs total / REVERSE_TRANSACTION_V2 | 7375 / 10 | idéntico | 0 |
| V2 (def hash / ACL) | 6468aa64… / {postgres,service_role} | idéntico | 0 |

## Resultado

- **Todas las métricas de negocio idénticas PRE==POST**: transactions, stock, WAC, payments, audit — sin cambio.
- **Zero persistent test artifacts**: todos los probes usaron IDs inexistentes (las funciones fallan en el primer SELECT) o BEGIN/ROLLBACK explícitos; `audit_reverse_v2_total` sin incremento confirma que ningún probe persistió.
- Único cambio funcional en producción: `public.reverse_transaction` eliminada (FASE 20). Nota: `tx_by_status={completed:520}` y `audit_reverse_v2_total=10` (histórico pre-W9) son condiciones PRE-existentes capturadas idénticas en ambas ventanas.
