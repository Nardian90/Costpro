# FASE H1 — QA Regression Suite de `create_sale_v2` (TEST-FIRST)

Suite adversarial de regresión que traduce los contratos de hardening H1–H6 (y
superficies colaterales + retiro de V1) en pruebas ejecutables contra el
sistema REAL (Supabase LIVE + servidor Next.js local).

**Regla de la fase**: NO se modifica lógica de producción. Los FAIL actuales
son EVIDENCIA del estado pre-hardening: el implementador debe hacerlos pasar
SIN debilitar los tests.

**ENMIENDA H0-R-FINAL (2026-10-04)**: los tests `T-H5-005`/`T-H5-006`
(ex-BLOCKED — BUSINESS DECISION) fueron dotados de contrato determinista por
las decisiones aprobadas del dueño — **D-EXR-01** (staleness = 45 días, FAIL
CLOSED) y **D-EXR-02** (desviación cliente↔servidor NO es control de
autorización) — y re-ejecutados contra LIVE (`results/14-h5-rate.json`
regenerado). Los otros 4 ex-BLOCKED (`T-H3-004`, `T-TC-001`, `T-UTT-001`,
`T-UTT-006`) tienen contrato definido en
`audit-evidence/FASE-H0-R/CREATE-SALE-V2-HARDENING-SPEC-RECOVERED.md` y
permanecen congelados como evidencia H1. Veredicto contractual:
`READY FOR IMPLEMENTATION`.

## Ejecución

```bash
# 1) servidor local corriendo (PM2: costpro en :3000) con .env cargado
# 2) suite completa (fixtures + 16 suites)
node scripts/qa-h1/run-all.cjs

# variantes
node scripts/qa-h1/run-all.cjs --no-fixtures   # sin recrear fixtures
node scripts/qa-h1/00-fixtures.cjs             # solo fixtures (idempotente)
node scripts/qa-h1/00-fixtures.cjs restock     # repone stocks de QA
node scripts/qa-h1/00-fixtures.cjs cleanup     # elimina TODOS los fixtures
node scripts/qa-h1/10-h1-acl.cjs               # una suite suelta
node scripts/qa-h1/gen-matrix.cjs              # regenera la matriz .md
```

## Actores reales (nunca admin global para aislar)

| Actor | Email | Rol global | Membresía | Uso |
|-------|-------|-----------|-----------|-----|
| USER_A | qa.h1.a@costpro.test | usuario | STORE_A `clerk` | vendedor legítimo / atacante |
| USER_B | qa.h1.b@costpro.test | usuario | STORE_B `clerk` | contra-parte cross-store |
| SUPER_A | qa.h1.sup@costpro.test | usuario | STORE_A `manager` | supervisor propio (RC-1) |
| ENC_B | qa.h1.enc@costpro.test | **encargado** | STORE_B `clerk` | demostrar alcance global de update_transaction_taxes |

Fixtures: tiendas `QA-H1-A` / `QA-H1-B`, productos con WAC e inventario,
`store_exchange_rates` USD=400 en STORE_A. `service_role` SOLO para
preparación/limpieza/inspección (nunca para demostrar autorización).

## Suites

| Suite | Contratos |
|-------|-----------|
| `10-h1-acl` | H1.1–H1.3 + ACL LIVE (§16) |
| `11-h2-order` | H2 orden auth→idempotencia (runtime + post-hoc) |
| `12-h3-seller` | H3.1–H3.5 seller binding |
| `13-h4-tax` | H4.1–H4.4 autoridad tributaria |
| `14-h5-rate` | H5.1–H5.6 autoridad de tasa de cambio |
| `15-h6-idempotency` | §11 matriz completa + concurrencia |
| `16-financial` | §12 integridad financiera campo a campo |
| `17-cross-store` | §13 matriz A–F |
| `18-inventory` | §14 atomicidad + oversell + rollback |
| `20-collateral-taxcfg` | §8 C1–C4 |
| `21-collateral-utt` | §9 C5–C10 (+ `adjust_total_amount`) |
| `22-collateral-rates` | fuentes de tasa (store/global/anon) |
| `30-route-checkout` | §17 contrato de ruta `/api/pos/checkout` |
| `31-route-sync` | §17 contrato de ruta `/api/sync/batch` (H3.5) |
| `40-v1-retirement` | §15 gates de retiro V1 (PR-R1) |
| `41-anti-resurrection` | §16 anti-resurrección |

## Salida

- `audit-evidence/FASE-H1/results/<suite>.json` — resultado estructurado por test
  (id, spec, expected, current, status, evidence).
- `audit-evidence/FASE-H1/results/_consolidated.json` — consolidado.
- `audit-evidence/FASE-H1/CREATE-SALE-V2-QA-TEST-MATRIX.md` — matriz completa.
- `audit-evidence/FASE-H1/CREATE-SALE-V2-QA-BASELINE.md` — baseline + veredicto.

Estados permitidos: `PASS` · `FAIL` · `BLOCKED` · `NOT-OBSERVABLE`.
Prohibido: PASS con advertencias, EXPECTED FAIL, skips de conveniencia.
