# TEST-EVIDENCE — Evidencia de pruebas de la misión

**Misión:** CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 · **Fecha:** 2026-11-27
**Principio:** primero DEMOSTRAR (replicar el defecto/comportamiento en aislada), luego corregir, desplegar con controles, y certificar con evidencia re-ejecutable.

---

## 1. Baterías E2E dedicadas (vía API REAL, BD aislada CostproE2E)

| Batería | Casos | Resultado | Notas |
|---|---|---|---|
| `cpbra-r03-ot-batch-battery-e2e.mjs` (R-03 §3.6) | 17 | **17/17 PASS** | runs 1-2 con defectos de TEST (acceso a `results` del response; expectativas acumuladas; partida doble) y un 429 de rate-limit — corregidos; run final verde |
| `cpbra-pay-commission-battery-e2e.mjs` (§5.4) | 15 | **15/15 PASS** | runs 1-2 con fixtures crasheados (índice único + exclusión NO OVERLAP) que saltaron el teardown → 18 usuarios residuales detectados por el guard y limpiados gobernadamente; batería robustecida (teardown garantizado + limpieza por FK) |
| `cpbra-sec003-failclosed-battery-e2e.mjs` (§4.3) | 22 | **22/22 PASS** | sin fixtures ni escrituras; run 1 con defectos de TEST (cron usa GET; ruta inexistente; docs clasificada mal) — corregidos |
| `cpbra-tp-regularization-e2e.mjs` (FASE 4) | 8 | **8/8 PASS** | run 1 con defectos de TEST (RAISE NOTICE no viaja por HTTP; G3 requiere trabajo pendiente) — corregidos |
| FIN-011 dedicada (misión precedente) | 16 | **16/16 PASS ×2** | regresión post-R-03 y regresión final post-fusión; net-zero cada vez |

**Guard de higiene (`data-hygiene-guard.cjs`):** ejecutado tras CADA batería — **PASS — net delta = 0** en todas las corridas finales (un incidente intermedio de 18 usuarios residuales fue detectado por el propio guard y limpiado con procedimiento gobernado).

## 2. Contratos estáticos (CI, sin BD)

| Suite | Casos | Estado |
|---|---|---|
| `cpbra-r03-ot-batch-migration.test.ts` | 13 | PASS (13) |
| `r03-ot-batch-route.test.ts` (contrato de la ruta parcial) | 8 | PASS (8) |
| `cpbra-pay-commission-migration.test.ts` | 11 | PASS (11) |
| `cpbra-tp-regularization-migration.test.ts` | 10 | PASS (10) |
| Pin R-25 convertido (`adn008-payments-batch.test.ts`) | — | PASS (UNA llamada al lote por orden) |
| Baselines de replay (r26/r03/pc/tp + replay-unblock) | — | PASS (total 224; R-26@220 · cpop@221 · R-03@222 · §0.2@223 · FASE4@224) |

## 3. Regresión integral post-fusión (main `a488a5255` + cierre)

- **Vitest por chunks** (el runner monolítico muere por OOM en el sandbox — defecto de entorno conocido, no de producto): api 632 · migrations 761 · e2e 101 · hooks 269(+1 skip) · lib 1,426 · integration 1,401(+85 skip) · components 1,235(+5 skip) · resto 1,053(+4 skip) → **≈6,877 PASS / 0 FAIL**. Detectó y forzó la corrección del registro `cpbra-r03-apply-prod.mjs` en el writers manifest (test FOLLOWUP E fail-closed funcionó).
- **ESLint:** 0 errores (1,658 warnings de estilo preexistentes).
- **ci-gate-business-rules:** PASS (36 reglas críticas, 36 seguimiento, 7 dominios).
- **security-contract-test-static:** OK con 0 divergencias (3 warnings preexistentes).
- **replay --check:** MATCH (digest `06380a62…`).
- **check-writers:** OK.
- **TypeScript:** 0 errores (heap 6 GB; OOM del monolítico sin él).
- **PM2 online + `/api/health` → HTTP 200** con el `.env` PRINCIPAL restaurado tras cada ventana E2E.

## 4. Auditoría automatizada nueva que queda instalada

- `scripts/audit-route-auth.cjs` (SEC-003) — paso permanente en el job Security Audit de CI: una ruta nueva sin wrapper canónico/mecanismo propio verificado/entrada PUBLIC documentada **bloquea el build**.

## 5. Lecciones registradas (defectos de TEST ≠ defectos de producto)

1. RAISE NOTICE no viaja en la respuesta HTTP de la Management API → verificación estructural.
2. El teardown DEBE ejecutarse aunque los fixtures fallen (try/finally desde el setup).
3. Las FK de las fixtures (approved_by/paid_by) bloquean `e2e_hard_delete_user` → borrar comisiones primero.
4. Verificar TypeScript SIEMPRE en el estado exacto de la rama (copia desfasada del árbol = falso verde local).
5. Los pipes (`| tail`) ocultan el código de salida — verificar el exit real antes de commit/push.
6. `\s` en un template JS llega como `s` a SQL — escapar `\\s`.
