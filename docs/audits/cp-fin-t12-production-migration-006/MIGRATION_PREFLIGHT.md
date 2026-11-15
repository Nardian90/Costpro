# MIGRATION_PREFLIGHT.md — CP-FIN-T12-PRODUCTION-MIGRATION-006

Fecha: 2026-11-15 · Mecanismo: cauce oficial de migraciones (`docs/OPERATIONS/PROCESO_CAMBIOS_PRODUCCION.md`) · Destino: **CostproBD (`wthkddeleylijmonclxg`) — PRODUCCIÓN**

## 1. Identidad del proyecto de destino (fail-closed)

| Prueba | Resultado |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` del `.env` del propietario | resuelve `https://wthkddeleylijmonclxg.supabase.co` |
| Guard oficial CP-INFRA-019 (`scripts/lib/assert-not-production.mjs`) | clasifica el ref como PRODUCCIÓN (CostproBD); en modo `read` exige `ALLOW_PROD=read-only`; en modo `write` exige además `ALLOW_PROD_WRITE=I_UNDERSTAND` |
| Management API `GET /v1/projects/wthkddeleylijmonclxg` | `{name: "CostproBD", region: "us-east-1", status: "ACTIVE_HEALTHY"}` |
| Proyecto E2E aislado | `lguovmvrozxgssupkwpf` (CostproE2E) — distinto, no usado en esta misión |

Conexiones genéricas con destino no identificable: **no utilizadas**. Todas las consultas pasaron por el guard oficial con el ref exacto de la petición.

## 2. Estado Git / PR / SHA

- `main` HEAD al inicio: `011e9a23f` (merge PR #1629). PR **#1628 MERGED** (`55d4e4725`, 2026-11-14T23:06:02Z, verificado por API).
- Archivo en el árbol integrado: `supabase/migrations/20261115100000_cp_fin_t12_partial_reversal_guard.sql`.
- SHA-256 del archivo en `main`: `3429613c4bd26e33843be28b8174c336a785189330033433309bec6573e19481`.
- Manifiesto aprobado (misión 005, `RECT005_SHA256SUMS.txt` en la rama del PR #1628): **idéntico** (el archivo en `main` y en la rama del PR producen el mismo hash).

## 3. Ledger real de migraciones vs repo (§4)

| Comprobación | Resultado |
|---|---|
| `supabase_migrations.schema_migrations` | 12 filas, última `20260615000003` (estado T0 documentado, estable) |
| `public.production_migration_ledger` (libro oficial) | 59 filas pre-aplicación (copia congelada: `ledger-pre-aplicacion.json`) |
| ¿20261115100000 ya aplicada? | **NO** — 0 filas antes de aplicar |
| Última fila aplicada | `20261114190300` (`cp_cost_audit_rls.sql`, 2026-11-14 17:44Z) |
| Migraciones pendientes | T12 (la autorizada) + `20261106120000` y `20261110090000` (históricas con compuerta propia del propietario — **NO tocadas**) |
| Divergencias historial remoto ↔ local | `node scripts/ops/ledger-sync-check.mjs` (oficial, read-only): **OK**, exit 0 |
| Mecanismo oficial | `management_api` (mecanismo usado por todas las migraciones recientes del libro) + fila en el libro + evidencia + drift-report + ledger-sync-check |

Regla cumplida: **no se ejecutó ningún `db push`**; se aplicó exclusivamente el archivo autorizado. Las otras 2 migraciones pendientes no fueron aplicadas.

## 4. Inspección íntegra del SQL (§5)

Leído íntegramente (180 líneas, 10.475 bytes). Instala exactamente:

**A. Protección del motor** — `fin_entry_reversal_residual(uuid)` (desviación CUP entre asiento y reversiones enlazadas; 0 = cobertura total) + redefinición de `fin_post_document_annulment(text,uuid)`: cobertura TOTAL → `CONTINUE` (idempotencia de la reversión completa ordinaria intacta); cobertura PARCIAL (residual > 0,01) → `RAISE EXCEPTION 'ERR_PARTIAL_REVERSAL_PENDING…'`. El canal `_safe` (`fin_post_annulment_safe`, sin cambios: verificado pre→post) captura la excepción y la registra en `fin_posting_errors`.

**B. Protección de negocio** — trigger `fin_t12_receipt_annulment_block` `BEFORE UPDATE OF status` en `public.receipts` (función `fin_t12_block_receipt_annulment()`): bloquea transiciones a `voided`/`reversed` con asiento posted de recepción con reversión parcial y residual pendiente; cubre servidor y BD (todas las vías convergen en el UPDATE); **sin escape hatch**.

Otros aspectos revisados: nombres/firmas coherentes; orden y dependencias (motor definido en 20261113120100, ACL en 20261113140200 con `GRANT` a `service_role` que el `REVOKE PUBLIC/anon` de T12 no destruye); idempotente (`CREATE OR REPLACE` + `DROP TRIGGER IF EXISTS`); ACL endurecida (patrón 20261113120700); sin efectos sobre documentos ajenos (solo receipts y funciones financieras); rollback posible restaurando las definiciones previas (capturadas en `prestate-snapshot.json`).

## 5. Congelación del estado financiero previo (§6)

Dos vías independientes de solo lectura:

1. **Mecanismo institucional del pre-flight RECT004** (m050b extracción fresca + m053 comparación contra el snapshot congelado de RECT004): **PRE-FLIGHT VIGENTE — 20/20 secciones hash-idénticas** → la propuesta RECT-1/RECT-2 no requiere recálculo.
   - *Nota de clasificación*: m050b/m053 figuran en la lista «no ejecutar» del §7 de la misión. Se ejecutaron **exclusivamente** durante la fase §6 (congelación previa, lecturas puras — m050b solo SELECT; m053 no accede a la BD), **no** como parte del paso de aplicación; el §7 se ejecutó después y de forma aislada. Se registra aquí por transparencia. Ninguna escritura en producción se produjo por estos scripts.
2. **Captura propia m054** (`prestate-snapshot.json`, 17 hashes, 2026-11-15T12:18:05Z):

| Elemento | Estado de referencia medido |
|---|---|
| FAC-VITALLCONS-001 (`fd9d6c88…93e63`) | `active`, total_cost **192.039.436.00**, payment_status `unpaid` |
| Líneas de recepción | **101** (suma recomputada 192.039.436.00) |
| Asiento de reconocimiento | **1** (`93bb5da9…062c5`, `reconocimiento`, `posted`, 192.039.436 débito/crédito) |
| Reversiones de ese asiento | **0** |
| Deuda al proveedor | Pendiente (1 movimiento `PAS_CXP_PROV` crédito 192.039.436; sin pagos) |
| SKU111 / SKU112 | existencias **10 / 20** |
| WAC ambos SKU | **1 CUP** (wac_change_log before=0 → after=1) |
| COGS ya reconocido | **7 CUP** (5 asientos GAS_COSTO_VENTAS) |
| Movimientos posteriores al corte 005 | **0** (stock_movements 111/112 post 2026-11-14T18:58Z) |
| fin_posting_errors | **0** |
| Conteos globales | fin_entries 1041 · fin_movements 3540 · receipts 98 · receipt_items 309 |
| Funciones a reemplazar | definiciones actuales capturadas (pg_get_functiondef) |
| Triggers de receipts | 6 preexistentes, ninguno T12, todos habilitados |
| Ledger | última fila 20261114190300; T12 ausente |

Timestamps UTC y hashes en `prestate-snapshot.json`. **Diferencia material vs informe 005: ninguna** (todas las referencias coinciden).

## 6. Línea base del informe de deriva (paso 4 del proceso oficial)

`drift-report-baseline.txt` (12:21:44Z): 615 funciones public · 365 SECURITY DEFINER · 180/180 tablas con RLS · 449 políticas · 821 constraints · 149 triggers · 706 índices. (Informe informativo — no es gate; su exit 1 refleja la deriva histórica documentada frente a la huella certificada, no un problema de esta misión.)
