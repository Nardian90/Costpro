# REM-INV-1 — 16 TEST RESULTS · 17 GIT DIFF · 18 INTEGRITY

## 16 Test Results (regresión obligatoria §21 — ejecutada 2026-09-12, env desde .env)

| Suite | Resultado | vs baseline REM-PO-1 |
|---|---|---|
| test:security (scripts/security-contract-test.cjs) | **134/134 PASS, 0 violaciones, exit 0** | IDÉNTICO |
| tsc --noEmit | **0 errores, exit 0** | IDÉNTICO |
| eslint . | **0 errors / 1291 warnings, exit 0** | IDÉNTICO |
| vitest run | **2058 passed / 0 failed / 24 skipped (2082), exit 0, 231s** | IDÉNTICO |
| build (next build) | **INFRASTRUCTURE BLOCKER — no ejecutado**: limitación documentada OOM exit 137 (~2.3GB RSS, host 4GB sin swap, dev server residente 1.8GB). Idéntico a gates REM-PO-1/REM-SEC-1. No se falsea PASS. No afecta certificación de este gate (código no modificado). |

## 17 Git Diff

**0 cambios de código.** El gate es de auditoría (§2: NO MODIFICAR durante fases 1–13; §19 STOP sin fixes). El único diff introducido es este evidence pack (audit-evidence/20260912-rem-inv-1/, archivos nuevos sin tocar src/ ni supabase/). Commit: `audit(rem-inv-1): …` — ver git log.

## 18 Integrity

- Zero-touch BEFORE/AFTER: sha256 idénticos `489aa0f8fca10f57f0149424b706d72550deff070c5daedc7b96b740ff70ae70` (fingerprint económico de las 3 tiendas de producción: inventory, movements, kardex, transactions, receipts, devolutions, production_orders, transfers, products).
- SHA256SUMS de este pack: `sha256sum -c SHA256SUMS.txt` → ALL OK (verificado pre-commit).
- SQL del reconciliador reproducible: 18-integrity/reconciler-sql/ (40 archivos + plantilla del helper). Credenciales JAMÁS incluidas.
