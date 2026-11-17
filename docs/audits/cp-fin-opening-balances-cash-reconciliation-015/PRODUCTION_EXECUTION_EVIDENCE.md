# CP-FIN-OPENING-BALANCES-AND-CASH-RECONCILIATION-015 · EVIDENCIA DE EJECUCIÓN EN PRODUCCIÓN

**Script**: `scripts/m109-openbal015-execute.mjs` (lotes idempotentes, UUID determinista, guard CP-INFRA-019 con doble flag explícito `ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND`).
**Fecha**: 2026-11-18 · **BD**: CostproBD (wthkddeleylijmonclxg) · **Tienda**: ENERVIDA-VITALLCONS (5e6fe821-5465-48b1-b3f1-3aa3182edc38) · **Actor**: 051c6157 (admin@costpro.com, admin ENERVIDA).

## L1 — Infraestructura (PASS ×2: aplicación e idempotencia)

| Elemento | Antes | Después |
|---|---|---|
| Reglas VENTA/FLUJO_CAJA globales activas | v1 (2026-11-13) | **v2** (1 activa por tipo, 2 en total) |
| `fin_compute_metrics` | sin modelo físico ni diferencia de cobro | fallback físico (settlement → carve) + `cob_total_cup` / `diferencia_cobro_*` |
| `fin_apply_opening_balance` | no admite cero | admite declaración en cero (exige notas, audita `FIN_OPENING_APPLIED_ZERO`) |
| CHECK `fin_opening_balances.amount` | `> 0` | `>= 0` |
| Trigger inmutabilidad | inexistente | `fin_opening_applied_guard` (tgenabled O) |
| `fin_document_types` | 15 tipos | 16: `RECTIFICACION_FIN` (is_postable=false, module Sistema, sort 95) |

## L2–L5 — Rectificaciones (PASS; evento `ajuste_manual`, estado `posted`)

| Rect | Asiento (id corto) | Débito | Crédito | D−C |
|---|---|---|---|---|
| RECT-015-A (68e7464d, ref 52c43919) | 7ec9000f…0000000a | ACT_EFECTIVO_USD 120.750,00 | ACT_EFECTIVO_CUP 120.750,00 | 0,00 |
| RECT-015-B (23ccd04f, ref 6c7b76df) | 7ec9000f…0000000b | ACT_EFECTIVO_USD 5.600,00 | ACT_EFECTIVO_CUP 5.600,00 | 0,00 |
| RECT-015-C (28e94349, vía motor regla v2) | d9199cec… | USD 167.670,00 + CUP 2.000,00 + ING_DESCUENTOS 8.100,00 + COGS 2,30 | ING_VENTAS 177.770,00 + ACT_INVENTARIO 2,30 | 0,00 |
| RECT-015-D (IE-000001/0002-2026, refs 267ee6f5 + 8f1644bd) | 7ec9000f…0000000d | ACT_OTROS_CORR 8.729.279,98 | GAS_OTROS_OPER 8.729.279,98 | 0,00 |

Pre-checks ejecutados antes de cada escritura: asientos originales intactos (289.750 / 5.600), GAS_OTROS_OPER de entregas = 8.729.279,98, métricas de 28e94349 exactas (cob CUP 2.000 · cob USD 167.670 · diferencia 8.100) — el motor NO habría escrito nada ante cualquier desviación.

## L6 — Apertura en cero (PASS ×2)

`PAT_CAPITAL amount=0` al 2026-06-30 con notas de verificación (0 ventas/pagos/flujo/recepciones antes del 01-07; fuentes: extract.json S14 de la sesión 015 + certificaciones m011/m014) → `fin_apply_opening_balance` → asiento `01eebc0d`, event `apertura`, **sin movimientos**, audit `FIN_OPENING_APPLIED_ZERO`.

## Verificación final (--verify: 9/9 PASS)

| # | Verificación | Resultado |
|---|---|---|
| V1 | Saldos: USD **109.900,00** (=130 USD @845) · CUP caja **902.020,00** · ACT_OTROS_CORR **8.729.279,98** · GAS_OTROS_OPER **0,00** · ING_DESCUENTOS (D−C) **+8.100,00** · inventario **601.525,51** | PASS |
| V2 | Ecuación contable: activos 36.314.845,50 = pasivos+patrimonio 36.314.845,50 · **diferencia 0,00** | PASS |
| V3 | Completitud: sin_apertura=false · apertura_tardia=false · primera_apertura 2026-06-30 | PASS |
| V4 | **USD nunca negativo** (cierre diario): mín **420,00** (23-10, post-entrega) · máx 288.420,00 (19-10) · final 109.900,00 | PASS |
| V5 | RECT-015-C equilibrada (neto 0,00) | PASS |
| V6 | RECT-015-A/B/D equilibradas (neto 0,00 ×3) | PASS |
| V7 | Motor: fin_posting_errors sin resolver **0** · trigger apertura O · apertura cero aplicada · 4 auditorías | PASS |
| V8 | CXP 2.961.795,90 y bancos 25.972.120,01 intactos · 9 movimientos USD (6 originales + A + B + C) | PASS |
| V9 | Rectificaciones SOLO en ENERVIDA (otras tiendas: 0) | PASS |

## Idempotencia (--idem: 6/6 PASS)

Re-ejecución de L1–L6: catálogo/reglas/CHECK/trigger idempotentes, A/B/D con `ON CONFLICT DO NOTHING` (0 filas nuevas), C `YA_APLICADO` (entry preexistente, re-post → null), apertura `YA_APLICADO`. **0 cambios nuevos.**

## Alcance y notas de seguridad

- NO se anuló IE-000002-2026 (operación real confirmada): la corrección es por reclasificación trazable, con `ref` a los asientos originales en descripción y `traza`.
- Las reglas v2 son globales: VENTA v2 no altera ventas con cobros cuadrados (condiciones > 0); FLUJO_CAJA v2 reclasifica futuras `entrega_efectivo` en TODAS las tiendas (semántica correcta a nivel empresa). Las entregas históricas de otras tiendas (si las hubiera) quedan para una misión posterior — fuera de alcance.
- Doble flag CP-INFRA-019 registrado en cada llamada (`AUTORIZADO (explícito)`). Sin secretos en el diff.
