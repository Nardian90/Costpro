# PRODUCTION_MIGRATION_EVIDENCE.md — CP-FIN-ULTIMATE-CLOSE-008

Fecha: 2026-11-16 · Modo: **read-only estricto** (m058/m058b: SELECT vía Management API contra `wthkddeleylijmonclxg`) · Reproducible: `node scripts/m058-migration-inventory.mjs` y `node scripts/m058b-check-operational-class.mjs`

## 1. Metodología

Comparación completa de las **584 migraciones `.sql`** de `supabase/migrations/` (main) contra dos registros de producción:

1. `public.production_migration_ledger` (63 filas: 62 `applied` + 1 marcador `baseline`) — emparejamiento por **ruta de archivo** con fallback por versión numérica (el `version` del ledger diverge del nombre de archivo en filas históricas).
2. `supabase_migrations.schema_migrations` (12 filas) — emparejamiento por versión numérica.

Clasificación por migración con verificación de **SHA-256** (sha del archivo repo vs sha registrado en el ledger).

## 2. Resultado global

| Categoría | N |
|---|---|
| Aplicada y checksum correcto | 54 |
| Aplicada con divergencia de checksum | 3 |
| Histórica — aplicada vía CLI (schema_migrations), mecanismo independiente | 12 |
| Histórica pre-ledger / pendiente ajena al ciclo | 515 |
| **Pendiente del ciclo CP-FIN** | **0** |
| Filas del ledger sin archivo (huérfanas) | 1 (marcador `BASELINE-2026-11-06`) |

**MIGRACIONES PENDIENTES DE ESTE CICLO: NO HAY.** Ninguna migración fue aplicada por esta misión; el ledger no fue modificado.

## 3. Ciclo CP-FIN — 4/4 aplicadas con checksum correcto

| Migración | Aplicada (UTC) | Por | Checksum |
|---|---|---|---|
| `20261115100000_cp_fin_t12_partial_reversal_guard` (T12) | 2026-11-15 12:26:09 | `agent` (misión 006) | ✅ |
| `20261115120000_cp_valuation_nominal_pp64` | 2026-11-15 13:02:36 | `agent-cp-valuation-nominal-activation-004` | ✅ |
| `20261115120100_cp_valuation_activation_nominal` | 2026-11-15 13:02:39 | `agent-cp-valuation-nominal-activation-004` | ✅ |
| `20261116120000_cp_fin_t12_privilege_hardening` | 2026-11-15 20:05:21 | `runbook-m056` (misión #1632) | ✅ |

**Prohibido y no realizado**: re-ejecución de T12 o del hardening (constan aplicadas una sola vez con el checksum del archivo aprobado).

## 4. Divergencias de checksum (3 — todas históricas pre-ciclo)

| Migración | Aplicación | Análisis |
|---|---|---|
| `20261022000001_cash_flow_documents_pgrst_cache` | 2026-11-08 17:59Z · `owner_manual` · `owner` | Archivo con un único commit en Git (nunca modificado tras su creación) → el SQL ejecutado en su día difirió del commit final. Divergencia histórica documentada; el estado vivo está certificado por los gates CI verdes y el contract-surface fresco idéntico al comprometido. |
| `20261113120300_cp_fin_triggers_diferidos` | 2026-11-13 15:12Z · `management_api` · `agent` | Mismo criterio. |
| `20261113120600_cp_fin_fix_audit_logs_check` | 2026-11-13 15:12Z · `management_api` · `agent` | Mismo criterio. |

Ninguna divergencia pertenece al ciclo; ninguna requiere acción de esta misión. Las 515 migraciones «históricas pre-ledger» corresponden a aplicaciones anteriores a la creación del ledger (2026-11-06) con su evidencia en `audit-evidence/` y expedientes — mecanismo de aprobación independiente; no son pendientes de aplicación.

## 5. Caso especial: `20261110090000_cp_operational_class_default_venta`

Única migración **posterior al ledger** sin registro en ledger ni en `schema_migrations` (misión ajena al ciclo CP-PRODUCT-COMMISSION-001). Verificación read-only de sus efectos vivos (m058b, `m058b-20261110090000-check.json`):

- `products.operational_class`: `DEFAULT 'venta'` + `NOT NULL` ✅
- Productos sin clasificar: **0** (backfill aplicado) ✅
- `create_master_product` / `activate_master_product` con default `'venta'` ✅

**Conclusión: aplicada en producción sin registro en el ledger** (drift de proceso histórico, ajena al ciclo). No se re-aplica; no se edita el ledger manualmente (prohibición explícita de la misión). Queda documentada como hallazgo de proceso para gobernanza futura.

## 6. Controles de deriva y sincronización

- **Drift de superficie**: census de SECURITY DEFINER estable (367 pre/post-ciclo) y contract-surface fresco idéntico al comprometido (ver `CONTRACT_SURFACE_FINAL.md`).
- **Ledger-sync**: ledger vs repo reconciliado por m058 (0 pendientes de ciclo; 1 marcador estructural); los controles de gates CI (SQL Security Gate + Security CI Gate) verdes en `main` constituyen la segunda capa de sincronización.
