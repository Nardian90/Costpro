# INFORME DE CIERRE — CP-RECEIPT-INTEGRITY-001

**Misión:** Ejecución y cierre con aprobación económica del propietario (2026-11-14).
**Alcance autorizado:** Merge de PR #1624 · Migración `20261114160000` a producción · Backfill de las 9 recepciones restantes · Corrección trazable de los movimientos históricos inequívocos · Conciliación posterior · Cierre del expediente.
**Canal de operaciones:** Management API Supabase (`/database/query`) + `NOTIFY pgrst 'reload schema'` — patrón canónico del repositorio (m002…m017).
**Actor:** propietario (`a1111111-1111-1111-1111-111111111111`), por delegación expresa de la misión.

---

## 1. Merge del PR #1624

| Elemento | Resultado |
|---|---|
| Fallos de CI originales | 5 errores TypeScript REALES que el sandbox local no detectaba: `tsc` agotaba la memoria (OOM exit 137) enmascarado por pipelines de shell |
| Corrección | Commit `e1b38938f` — embeds `receipts(...)` tipados como array (cliente sin genérico Database) → normalización `Array.isArray(...) ? [0] : valor` (convención existente de `costeo-dinamico`); mock `accessState.data` como `boolean|null`; llamada a PATCH con 1 argumento (firma real de `withAuth`) |
| Verificación local | `tsc --noEmit` completo EXIT=0 (con PM2 detenido para liberar RAM del sandbox de 4 GB) · ESLint 0 errores · vitest **6052 PASS / 0 fail** · 17/17 en los tests afectados |
| Checks del SHA final | **9/9 SUCCESS** (TypeCheck+Lint+Unit+Build · E2E Aislado · Unit & Integration · SQL Static · SQL DB Security · TypeScript Security · Security Audit · Allowlist · Vercel Preview) |
| Merge | Ejecutado 2026-11-14T14:59:25Z · `merged: true` · **SHA de `main`: `2e37270e031d0d3dd9c0cefc1566e8dfd5fe4ee9`** (verificado: `merged_at`, contenido de `main`, migración presente) |
| Secretos en el diff | 0 coincidencias (`github_pat_`, `sb_secret_`, `sbp_`, `sb_publishable_`, `eyJhbGciOi`, credenciales de BD) |

## 2. Migración `20261114160000` — aplicación a producción (M021)

Script: `scripts/m021-aplicar-migracion-receipt-items-immutable.mjs` (patrón m017: pre-vuelo read-only → lote único sin reintentos → verificación fail-closed → ledger).

| Paso | Resultado |
|---|---|
| Pre-vuelo | Trigger/función AUSENTES (no aplicada) · dependencias presentes (2 triggers previos) · RLS activa con 2 políticas denied |
| SHA-256 del archivo | `f3bbd5fb37241f7a94a4f6fd773d6c19e8e695e67ef2ccd5e16d806be41be2af` |
| Aplicación previa en BD aislada | Validada en CostproE2E (replay 161 migraciones + E2E 12/12 PASS del expediente del PR #1624) |
| Aplicación | HTTP 201 OK + `NOTIFY pgrst 'reload schema'` HTTP 201 OK — 2026-11-14 15:03:21 UTC |
| Contenido | DDL PURO (función trigger + trigger UPDATE-only): no modifica datos históricos — **DELTA 0** verificado en receipts/receipt_items/fin_entries/fin_movements/stock_movements/audit_logs/receipt_tasa_audit |
| Sonde de inmutabilidad | **A)** UPDATE (no-op, privilegiado) sobre línea de recepción ACTIVE → RECHAZADO con `ERR_RECEIPT_ITEM_IMMUTABLE` ✓ · **B)** escape hatch gobernado `SET LOCAL app.allow_receipt_item_edit='on'` → permitido y REVERTIDO (valor intacto) ✓ · **C)** recepción PENDING permite ediciones legítimas (sonda transaccional INSERT+UPDATE+ROLLBACK, 0 residuos) ✓ |
| RLS | Intacta tras la migración (mismas políticas denied, mismo estado) |
| Ledger | Fila `20261114160000` registrada en `production_migration_ledger` (management_api · applied · SHA verificado) |
| FAC-VITALLCONS-001 | **No se aplicó ninguna modificación a sus líneas** (sondas usaron PUERTO PADRE 646be7c5 y una sonda transaccional desechable) |

## 3. Nueve recepciones contabilizadas — una por una (M022)

Script: `scripts/m022-backfill-nueve-recepciones.mjs`. Por cada documento: pre-check de postabilidad (8 criterios) → ejecución idempotente → post-check (asiento, monto, balance, regla). Dry-run previo: 9/9 criterios OK, delta 0.

| # | Tienda | Documento | Estado | Líneas | Total CUP | Asiento | Verificación |
|---|---|---|---|---|---|---|---|
| 1 | PUERTO PADRE | Recibido de JuanCarlos-184 (`0a133757`) | active | 1 | 4,00 | reconocimiento posted | OK |
| 2 | PUERTO PADRE | Almacen Lari (`2e393c20`) | active | 1 | 34,00 | reconocimiento posted | OK |
| 3 | PUERTO PADRE | S/N (`5e1b6b87`) | active | 13 | 515,00 | reconocimiento posted | OK |
| 4 | PUERTO PADRE | Recibido de JuanCarlos (`646be7c5`) | active | 13 | 680,00 | reconocimiento posted | OK |
| 5 | PUERTO PADRE | Conteo Inv1 (`351fa9fe`) | active | 28 | 383,50 | reconocimiento posted | OK |
| 6 | COSTPRO (Prueba) | REC-PP-001-2026 (`b7f5df9f`) | active | 33 | 5.044.463,67 | reconocimiento posted | OK |
| 7 | COSTPRO (Prueba) | IPV-REC-29-06-2026 (`6fb4548d`) | active | 6 | 7.213.500,00 | reconocimiento posted | OK |
| 8 | COSTPRO (Prueba) | FAC-VERIF-20261106 (`a57bd2c1`) | active | 1 | 200,00 | reconocimiento posted | OK |
| 9 | COSTPRO (Prueba) | FAC-TEST-CP001 (`a3fe3e76`) | **reversed** | 1 | 960,00 | reconocimiento + anulación enlazada | OK (neto 0) |

Todas: cabecera = Σ(q·uc·tasa) ±0,01 · moneda CUP · tasa 1 · movimientos de inventario = líneas · 0 asientos previos.

## 4. Asientos y movimientos generados

| Magnitud | Antes | Después | Δ |
|---|---|---|---|
| `fin_entries` | 1023 | 1033 | **+10** (autorizado) |
| `fin_entries` RECEPCION | 89 | 99 | **+10** |
| `fin_movements` | 3496 | 3516 | **+20** (2 por asiento: D ACT_INVENTARIO / C PAS_CXP_PROV) |
| `fin_posting_errors` | 0 | 0 | **0** |
| `stock_movements` | 1775 | 1775 | **0** (el backfill no toca inventario) |
| `receipt_items` | 309 | 309 | **0** |

Regla aplicada: `dd429aab-c74f-4815-8a50-a2d70b4cd254` v1 (GLOBAL, active). Todos los asientos D=C. Idempotencia verificada por re-publicación (NULL, 0 asientos nuevos).

## 5. Recepción revertida — ciclo canónico (FAC-TEST-CP001, `a3fe3e76`)

- No se contabilizó «como si permaneciera activa»: se reconstruyó el ciclo completo con los eventos canónicos.
- `fin_post_document('RECEPCION', …, 'reconocimiento')` → asiento `eb4f1a1f` (960 D/C).
- `fin_post_document_annulment('RECEPCION', …)` → asiento de **anulación enlazada** (`reversal_of = eb4f1a1f…`) con sentidos espejo (D PAS_CXP_PROV / C ACT_INVENTARIO) y estado del original a `reversed`.
- **Saldo neto de la recepción: 0,00** — fiel a su estado final; un único reconocimiento y una única reversión, sin duplicados.
- Su reversa de inventario preexistente (purchase_reverse −1 ud / −960 CUP) ya representaba la salida física: sin duplicación.

## 6. Conciliación CP-FIN (M023)

- 99 asientos RECEPCION (98 reconocimientos + 1 anulación) · 0 desbalanceados · 0 duplicados por `document_id+document_type+event+payment_ref` · 0 errores de contabilización.
- Neto contable por tienda (bruto / anulaciones / neto):
  - ENERVIDA-VITALLCONS: 194.995.370,40 / 0 / **194.995.370,40**
  - COSTPRO (Prueba): 12.259.123,67 / 960,00 / **12.258.163,67**
  - PUERTO PADRE: 1.616,50 / 0 / **1.616,50**
- COSTPRO (Prueba) queda dimensionado por `store_id` en todos los asientos — separado de los estados financieros de las tiendas operativas.

## 7. Conciliación de inventario y WAC

- 98/98 recepciones: total de cabecera = suma independiente de líneas (±0,01).
- Correspondencia recepción→movimiento→inventario: 101/101 líneas con movimiento (FVC) · 9/9 recepciones nuevas con movimientos = líneas · purchase_reverse de la revertida presente.
- **WAC NO recalculado** (restricción de la misión): los costos de 1 CUP / 1 USD se conservan como costos reales de adquisición (decisión expresa del propietario). Muestra de WAC conservado en la evidencia M023.

## 8. FAC-VITALLCONS-001 — valor aprobado conservado

- **Total de cabecera: 192.039.436,00 CUP** (intacto antes, durante y después de todas las operaciones) · estado `active` · 101 líneas (79 CUP + 22 USD) · **tasa 680 congelada única** en las 22 líneas USD · Σ(q·uc·tasa) = total (dif 0,00) · 1 asiento CP-FIN (reconocimiento, m020 del 2026-11-14 01:51Z) — sin re-contabilización.
- Modal corregido (PR #1624, en `main`): subtotales por línea en moneda original + «≈ CUP» con la tasa congelada + desglose «Líneas por moneda» (5.129.706 CUP + 274.867,25 USD) + Subtotal (CUP) = 186.909.730 + 5.129.706 + Total (CUP) 192.039.436. La presentación impide confundir la suma de dos monedas con el total convertido.
- Salidas posteriores ENERVIDA representadas sin duplicación: 708 ventas + 2 devoluciones + 232 vales (contabilizados por sus propios eventos en m020).

## 9. Trazabilidad de los movimientos históricos (M024 + M025)

- Análisis M024 (producto + cantidad + costo CUP convertido + fecha): **101 movimientos con asociación UNÍVOCA 1:1** a las 101 líneas de la recepción (0 ambiguos, 0 líneas sin movimiento, 0 líneas con ≥2 movimientos). Los otros 9 candidatos de las fechas del caso pertenecen inequívocamente a líneas de OTRAS 3 recepciones → **excepción documentada, sin cambios** (el conteo forense previo «105» incluía 4 de ellos por atribución conservadora por fecha; fuera del alcance autorizado).
- Corrección M025 (solo para los 101 inequívocos): `reference_id = fd9d6c88…` con guard `WHERE reference_id IS NULL` (idempotente — re-ejecución = 0 filas) · **cantidades, fechas económicas, monedas y costos CONSERVADOS** (verificación byte a byte) · triggers de la tabla son INSERT-only → sin recalculos colaterales.
- Auditoría: **101 filas `TRACEABILITY_BACKFILL`** en `audit_logs` (usuario, fecha, motivo, old_data/new_data, línea asociada, procedimiento reversible por movimiento).
- Procedimiento de inversión documentado: `UPDATE stock_movements SET reference_id=NULL WHERE id=<registro> AND reference_id='<FVC>'`.

## 10. Gates finales del SHA `e1b38938f` (PR #1624)

TypeCheck + Lint + Unit Tests + Build **SUCCESS** · E2E Aislado (CostproE2E) **SUCCESS** · Unit & Integration Tests **SUCCESS** · SQL Static Checks **SUCCESS** · SQL DB Security Checks **SUCCESS** · TypeScript Security Checks **SUCCESS** · Security Audit **SUCCESS** · Allowlist Review **SUCCESS** · Vercel Preview Comments **SUCCESS** — **9/9**.

## 11. Estado del servidor

- Health `GET /api/health` → **HTTP 200** `{"status":"ok","service":"costpro-enterprise"}`.
- PM2 `costpro` **online** (fork mode).
- `.env` PRINCIPAL activo (proyecto `wthkddeleylijmonclxg`) · réplicas `.env.txt` / `download/costpro-env.txt` consistentes.
- `main` sincronizado (`2e37270e0`) · worklog actualizado por etapas · migración registrada en `production_migration_ledger`.
- Secretos en Git/artefactos/expediente: **0**.

## 12. Excepciones que requieren decisión adicional (si el propietario desea actuar)

1. **9 movimientos de otras recepciones** (fechas del caso, reference_id NULL): pertenecen inequívocamente a otras recepciones ENERVIDA; fuera del alcance de esta autorización.
2. **208 movimientos de compra sin reference_id** de otras recepciones históricas (análisis M024/M023): mismo tratamiento posible (asociación unívoca + auditoría) si el propietario lo autoriza expresamente.
3. La misión paralela CP-SECURITY-AND-BACKLOG-CLOSURE-001 aplicó migraciones `20261114180000–180500` hoy (14:50 UTC) — sin interacción con este expediente.

---

## Evidencia de este cierre

| Archivo | Contenido |
|---|---|
| `m021-aplicar-migracion-receipt-items-immutable.mjs` (script) | Aplicación canónica de la migración + sondeos A/B/C + ledger |
| `m022-backfill-nueve-recepciones.json` | Backfill de las 9: pre-checks, ejecución, post-checks, deltas, idempotencia, FVC intacta |
| `m023-reconciliacion-posterior.json` | Conciliación A/B/C/D completa con resumen booleano |
| `m024-trazabilidad-105-movimientos.json` | Análisis de asociación unívoca de los movimientos históricos |
| `m025-corrige-trazabilidad.json` + `m025b-auditoria-trazabilidad.mjs` | Corrección trazable ejecutada + auditoría por movimiento |

**CIERRE: CP-RECEIPT-INTEGRITY-001 COMPLETADO** — código corregido en `main`, migración aplicada, 9 recepciones contabilizadas según su estado real, conciliación posterior validada, trazabilidad histórica reparada con autorización expresa y evidencia de producción.
