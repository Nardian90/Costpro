# METODOLOGÍA Y REPRODUCCIÓN

## Canal y garantías
- **Solo lectura** (investigación): `prod-readonly-query.mjs` (Management API; guard fail-closed SELECT/WITH).
- **Escritura en producción**: `prod-apply-migration.mjs` (guard doble `--authorize` + `ALLOW_PROD_WRITE=I_UNDERSTAND`; lote único atómico; NOTIFY pgrst; libro `production_migration_ledger`) y ejecución de rectificaciones vía el mismo canal — SIEMPRE con escritores canónicos (`fin_reclassify_sale_payment_currency`, `fin_post_document`), nunca UPDATE directo de saldos ni INSERT de asientos arbitrarios.
- **Aislada E2E**: CostproE2E (lguovmvrozxgssupkwpf), guard `assert-isolated-db`; suite `e2e/enervida-cash-bank-reconciliation.spec.ts` (21/21) + `data-hygiene-guard.cjs` (net delta 0).

## Reproducción paso a paso
1. Extract read-only: `cpfin002-extract.mjs` → `scripts/cpfin002-data/*.json` (192 ventas, 677 pagos, 1,056 asientos, 3,598 movimientos).
2. Conciliación: `cpfin002-conciliacion.py` → `out_conciliacion_ventas.json` (estados §5), `out_caja_usd_conjunto.json`, `out_bancos_conjunto.json`, `out_rectificaciones_plan.json`, `out_balance_situacion.json`.
3. Descomposición del desequilibrio: `cpfin002-fase1c-partes.sql` (fórmula v1 vs identidad completa — LIVE).
4. Migración: `supabase/migrations/20261119150000_cp_fin002_cash_bank_reclassification.sql` (aplicada a aislada con `scripts/e2e/cpfin002-apply-e2e.mjs`, luego a producción).
5. Rectificaciones: `RECTIFICACIONES-A-EJECUTAR.sql` (idempotente; re-ejecutar devuelve YA_APLICADO/NULL).
6. Verificación: `cpfin002-postverificacion.sql` + `cpfin002-caja-usd-view.sql` + `fin_get_dashboard` LIVE.
7. Matriz XLSX: `cpfin002-matriz-xlsx.py` (12 hojas).

## Hashes y SHAs
- Migración aplicada: sha256 `0593c2a3307eedc531b2082f7f7cf81d85bbd0c5e55cc1b0c8c892b37d2cb2dc` (applied_at 2026-11-19T15:04:14.533Z).
- PR #1659 head `ff7a99878` → merge `1f75164a73c151a14313a2623a362e1aef1bbe13` (CI 9/9).
- PR #1660 → merge `73ba7876b51b` (CI 5/5) · PR #1661 → `dbbaa1c1b578` · PR #1662 → `2459bebb6361`.
- Surface 212 funciones: sha256 `5694d810fa267054d83cd06575932e747fb51815f5fc762b8ad6069c11ba29b4`.

## CI y E2E
- PR #1659: CI · Test Coverage · E2E Aislado · Security CI Gate · SQL Security Gate — 9/9 success. Escaneo de secretos del diff: 0 coincidencias (github_pat_, sb_secret_, sbp_, sb_publishable_, eyJhbGciOi, clave BD).
- E2E aislada 21/21 PASS (expected=21 unexpected=0) + guardrail net delta 0.
- Gates locales: destructive OK · BOLA 5/5 · check-writers OK · SQL checks OK · contrato estático OK · replay MATCH (183).
- Deployment: Vercel Production `1f75164a7` completed success; `dbbaa1c1b` completed success; health 200 (costpro4.vercel.app).
