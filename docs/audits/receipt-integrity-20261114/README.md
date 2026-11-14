# EXPEDIENTE CP-RECEIPT-INTEGRITY-001 — Integridad económica de recepciones

**Fecha:** 2026-11-14 · **Caso principal:** FAC-VITALLCONS-001 (recepción `fd9d6c88-5db8-49ea-b185-8bc96cc93e63`, ENERVIDA-VITALLCONS) · **Rama:** `fix/recepciones-integridad-20261114`

## Contenido

| Archivo | Qué contiene |
|---|---|
| `INFORME_FORENSE_RECEPCION_FAC-VITALLCONS-001.md` | Informe completo: 7 preguntas de la misión, diagnóstico 4 niveles (datos/cálculo/backend/frontend), matriz de permisos por estado, consecuencias inventario/WAC/CP-FIN, correcciones implementadas y propuestas con orden. |
| `MATRIZ_RECONCILIACION_RECEPCIONES.xlsx` | Matriz de las 98 recepciones de producción (recomputo independiente Σ(q·uc·tasa) por recepción, clasificación, trazabilidad de inventario, contabilización CP-FIN) + hoja del caso. |
| `EVIDENCIA_FAC-VITALLCONS-001.json` | Extracción read-only del caso con hashes SHA-256 por sección (cabecera, 101 líneas, productos, tasas oficiales, auditoría de tasas, WAC, fin_entries, pagos, audit_logs, backup PR-2) + veredicto estructurado. |
| `consultas_sql_independientes.sql` | Consultas SQL reproducibles (fases 1-6). Ejecutadas de forma equivalente vía REST+JS durante la auditoría (limitación de red IPv6/credenciales documentada). |
| `forensic-extract-fd9d6c88.mjs` | Script de extracción forense read-only (re-ejecutable; requiere `SUPABASE_SERVICE_ROLE_KEY` en el entorno). |
| `matriz-recepciones.mjs` | Script de la matriz global de 98 recepciones (re-ejecutable; ídem credenciales). |

## Veredicto en una línea

La diferencia 186.634.862,75 es **la conversión de divisa de las 22 líneas USD (274.867,25 USD × (680−1)) aplicada exactamente una vez** — no un defecto del motor (98/98 recepciones cuadran al céntimo; CP-FIN cuadra en las 89 contabilizadas). Los defectos reales: presentación con monedas mezcladas, mutabilidad de documentos confirmados (demostrada y corregida) y una tasa ad-hoc 680 pendiente de validación del propietario.

## Correcciones del código (en el PR)

1. `ReceptionDetailsModal.tsx` — moneda explícita por línea, «≈ CUP», resumen en CUP.
2. `PATCH /api/inventory/receptions/[id]/items/[itemId]` — delegación en `update_receipt_item_tasa` (guard de estado + recalculo + auditoría dual).
3. `POST /api/inventory/receptions/backfill-tasas` — solo `pending`, pre-check de acceso, recalculo por recepción.
4. `PATCH /api/inventory/receptions/[id]` — campos económicos solo en `pending` (solo `notes` siempre).
5. Migración `20261114160000_cp_receipt_items_immutable.sql` — trigger de inmutabilidad UPDATE con escape hatch gobernado (**aplicada y probada solo en la BD E2E aislada**; pendiente del procedimiento controlado del propietario para producción).
6. Pruebas: 43 unitarias/integración + E2E aislada 12/12 (13 escenarios de la misión) + hygiene guard net-zero PASS.

## Decisiones pendientes del propietario

1. Validar la tasa 680 de FAC-VITALLCONS-001 (ninguna serie oficial de la fecha la respalda).
2. Rectificación (si procede) por reversión/anulación controlada + correctiva — nunca edición silenciosa.
3. Conciliar el activo de inventario 192 M CUP con el stock físico.
4. Extender el backfill m020 a PUERTO PADRE y COSTPRO-Prueba (9 recepciones sin contabilizar).
