# FASE F3 — 02 PRE SECURITY AUDIT (reproducción PRE-FIX, sin modificar nada)

**Fecha**: 2026-09-27 · Ejecutado sobre HEAD c09366ed ANTES de editar cualquier archivo. Crudo: `scripts/f3-pre-security-contract.txt` (fuera del repo).

## Mecanismo exacto de CI

El job `Security Audit` de `.github/workflows/ci.yml` (línea 169–170) ejecuta:

```text
node scripts/security-contract-test-static.cjs
```

Reproducción local idéntica:

```text
$ node scripts/security-contract-test-static.cjs      → exit 1
── Capa A — surface LIVE certificado (contract-surface.sql sha256=9d2e3f537812…)
   Funciones verificadas: 141 · Funciones con violaciones: 0
   ✅ PIN REM-INV-2R: receive_purchase(uuid) ausente
── Capa B — stream de migraciones: 440 archivos, 189 funciones SECDEF-write
   Funciones verificadas: 189
   Violaciones históricas dentro del baseline revisado: 17
   Violaciones NUEVAS (bloqueantes): 9        ← las 9 del objetivo F3
── Capa C — reconciliación source-of-truth: 141 funciones
   Representadas: 141/141 · Divergencias (bloqueantes): 1
▸ [Capa C] create_sale_v2(public.create_sale_v2/21) — divergencia sin baseline
   🚨 [CRITICAL] BODY_DRIFT_FROM_MIGRATION
🚨 VIOLACIONES BLOQUEANTES: 1 — BUILD BLOQUEADO
```

## Las 9 funciones objetivo (1:1 con el mandato, extraídas del propio detector)

```text
▸ [Capa B] cleanup_old_aggregates(cleanup_old_aggregates/1)          🟡 [LOW] SEARCH_PATH_NOT_SET
▸ [Capa B] close_service_order_as_sale(close_service_order_as_sale/6) 🟡 [LOW] SEARCH_PATH_NOT_SET
▸ [Capa B] fn_audit_stock_reception(fn_audit_stock_reception/0)       🟡 [LOW] SEARCH_PATH_NOT_SET
▸ [Capa B] fn_audit_transaction_voiding(fn_audit_transaction_voiding/0) 🟡 [LOW] SEARCH_PATH_NOT_SET
▸ [Capa B] purge_old_reset_snapshots(purge_old_reset_snapshots/1)     🟡 [LOW] SEARCH_PATH_NOT_SET
▸ [Capa B] receive_production_output(receive_production_output/4)     🟡 [LOW] SEARCH_PATH_NOT_SET
▸ [Capa B] snapshot_commission_rule(snapshot_commission_rule/0)       🟡 [LOW] SEARCH_PATH_NOT_SET
▸ [Capa B] upsert_usage_aggregate(upsert_usage_aggregate/7)           🟡 [LOW] SEARCH_PATH_NOT_SET
▸ [Capa B] withdraw_production_item(withdraw_production_item/4)       🟡 [LOW] SEARCH_PATH_NOT_SET
```

**0 funciones nuevas** respecto a F1/F2/baseline → no procede STOP (Gate F3-1 criterio cumplido).

## Clasificación de cada hallazgo PRE (esquema §12: FIXED / PREEXISTING / FALSE POSITIVE / OUT OF SCOPE)

| # | Hallazgo | Clasificación PRE-F3 |
|---|---|---|
| 1–9 | Las 9 `SEARCH_PATH_NOT_SET` | Objetivo de F3 → remediadas → **FIXED** (ver 07) |
| 10 | Capa C `create_sale_v2/21 BODY_DRIFT_FROM_MIGRATION` [CRITICAL] | **PREEXISTING — OUT OF SCOPE** (no es una de las 9; idéntica en baseline 36285993203, F1 36287866995, F2 36292453246 y 36294432757; ver análisis en 07 §4) |

## El detector y su check 4 (mecanismo, no caja negra)

`scripts/security-contract-test-static.cjs` — check 4 (línea 121–124):

```js
if (!/SET search_path/i.test(def)) {
  issues.push({ severity: 'LOW', rule: 'SEARCH_PATH_NOT_SET', msg: 'Función SECURITY DEFINER sin SET search_path explícito (vulnerable a search_path injection)' });
}
```

- Se aplica a `writeFns` = funciones extraídas del stream `supabase/migrations/*.sql` (last-wins) que son `SECURITY DEFINER` (header+trailer) y con escritura (`INSERT INTO / UPDATE / DELETE FROM / TRUNCATE / MERGE INTO` sobre texto sin comentarios).
- `def` = statement completo de la definición (header + cuerpo + trailer) sin comentarios → la remediación debe dejar `SET search_path` en el texto de la **definición** (atributo real de PostgreSQL; un `ALTER FUNCTION` posterior NO lo limpia — comprobado: las 4 funciones con ALTER 20260902205210 seguían señaladas).
