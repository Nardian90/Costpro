# FASE F3 — 07 POST SECURITY AUDIT (detector POST-FIX + clasificación final §12)

**Fecha**: 2026-09-27 · Crudo: `scripts/f3-post-security-contract.txt` (fuera del repo).

```text
$ node scripts/security-contract-test-static.cjs      → exit 1
── Capa A — surface LIVE certificado (contract-surface.sql sha256=9d2e3f537812…)
   Funciones verificadas: 141 · Funciones con violaciones: 0        (intacta, como PRE)
── Capa B — stream de migraciones: 440 archivos, 189 funciones SECDEF-write
   Funciones verificadas: 189
   Violaciones históricas dentro del baseline revisado: 17          (idéntico al PRE)
   Violaciones NUEVAS (bloqueantes): 0                              ← PRE: 9 → POST: 0
── Capa C — reconciliación source-of-truth: 141 funciones
   Representadas: 141/141 · Divergencias (bloqueantes): 1
▸ [Capa C] create_sale_v2(public.create_sale_v2/21) — divergencia sin baseline
   🚨 [CRITICAL] BODY_DRIFT_FROM_MIGRATION
🚨 VIOLACIONES BLOQUEANTES: 1 (PRE: 1 — la misma)
```

## Gate F3-7 — SEARCH_PATH_NOT_SET = 0 ✅

Las 9 funciones desaparecen del output del detector: **9/9 FIXED**.

## Clasificación final de TODOS los hallazgos (esquema mandato §12)

| Hallazgo | PRE | POST | Clasificación |
|---|---|---|---|
| 9 × `[LOW] SEARCH_PATH_NOT_SET` (cleanup_old_aggregates/1, close_service_order_as_sale/6, fn_audit_stock_reception/0, fn_audit_transaction_voiding/0, purge_old_reset_snapshots/1, receive_production_output/4, snapshot_commission_rule/0, upsert_usage_aggregate/7, withdraw_production_item/4) | 9 | **0** | **FIXED** (9/9, con explicación objetiva: causa raíz en 05, cambio mínimo en 06, prueba aislada en 08) |
| 17 × baseline histórico (allowlist `security_contract_static_baseline`: create_sale ×3, register_stock_movement ×3, managed_create_user ×2, etc.) | 17 | 17 | **PREEXISTING** — dentro del baseline revisado (allowlist intocado; no son las 9; OUT OF SCOPE) |
| Capa C `create_sale_v2/21 BODY_DRIFT_FROM_MIGRATION` [CRITICAL] | 1 | 1 | **PREEXISTING — OUT OF SCOPE** (ver §4 abajo) |

## 4. Análisis objetivo de la condición Capa C restante (create_sale_v2/21)

- **No es una de las 9** del mandato F3 (es `create_sale_v2/21`; las 9 no incluyen ninguna create_sale_v2).
- **Preexistente y cuantificada**: idéntica en los logs CI del baseline 1272a32f (run 36285993203), F1 9423aa1d (36287866995), F2 53e3d655 (36292453246) y c09366ed (36294432757): `Divergencias source-of-truth (bloqueantes): 1` + mismo mensaje.
- **Causa raíz documentada**: `supabase/security-contract/contract-surface.sql` se exportó de LIVE el 2026-09-15 (último commit sobre el archivo: `eeedc5b9`, re-certificación 141 funciones); `create_sale_v2` fue redefinida por `20260926000001_esec_price_integrity.sql` (commit 3e5758bd, 2026-09-26, R-SEC-1) y aplicada a LIVE durante E-SEC. El surface está desactualizado respecto a la migración → `cuerpo LIVE (snapshot) ≠ replay de migraciones`. Es decir: las MIGRACIONES son la versión E-SEC más reciente; el SNAPSHOT es el anterior.
- **Por qué F3 NO lo remedia** (cada vía prohibida por el mandato):
  1. Re-exportar el surface requiere `SUPABASE_ACCESS_TOKEN` contra LIVE (§22 producción READ ONLY; el export «nunca en CI») y re-certificar el surface = reabrir E-SEC-FINAL (§0 FUERA DE ALCANCE).
  2. Editar la migración `20260926000001` para igualar el snapshot alteraría lógica E-SEC de precio (§11 PROHIBIDO: lógica de negocio, funciones fuera de las 9).
  3. Añadir `create_sale_v2` a `source_of_truth_baseline` (allowlist) escondería una divergencia CRITICAL real — prohibido por disciplina §24 y decisión reservada al owner (F2 12-FINAL-VERDICT NEXT ACTION).
- **Impacto en el objetivo F3**: el mandato exige que no queden «las 9» sin explicación (§12) — quedan 0. La divergencia es una condición de CI preexistente no relacionada con las 9 (encaja en §23 CONDITIONAL).

## Estado de capas

```text
Capa A — dependency audit:  SUCCESS (bun audit = 0; sin cambios de dependencias — 16)
Capa B — security contract: las 9 violaciones objetivo = FIXED (0 restantes)
                            el step CI mantiene exit 1 SOLO por la divergencia Capa C
                            preexistente create_sale_v2/21 (idéntica al baseline; condición externa)
```
