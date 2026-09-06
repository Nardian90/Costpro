# W9.5 — B-10b-OBS-2-R2 · 27-final-verdict.md
# VEREDICTO FINAL

## POST-REPAIR OPERATIONAL INTEGRITY — VERIFIED

Fecha: 2026-09-06 · Store `d1c4ba0e` TIENDA CENTRAL COSTPRO · Repair batch `B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW` · Commit de partida `90450273`.

### Checklist del veredicto (criterios del mandato)

| # | Condición | Evidencia | Resultado |
|---|---|---|---|
| 1 | reparación íntegra | 02-repair-verification.md (98/6427/98/98/98/1; valor exacto) | PASS |
| 2 | venta funciona | 05-sale-test.md (create_sale_v2, 5 ventas sintéticas) | PASS |
| 3 | stock decrementa correctamente | 06-stock-integrity.md (17 = 19−2; tres fuentes) | PASS |
| 4 | inventory sincronizado | 06/21/22 (triada 98/98; version++ auditables) | PASS |
| 5 | kardex coherente | 07-kardex.md (1:1; balance post-movimiento) | PASS |
| 6 | WAC coherente | 08-wac.md (bit a bit; wac_log 0) | PASS |
| 7 | payment coherente | 09-payment-integrity.md (I1b 700==700) | PASS |
| 8 | POS void correcto | 10-pos-void.md (Modelo C N1; netting 0) | PASS |
| 9 | admin reverse correcto | 11-admin-reverse.md (Modelo C N2; +1 exacto) | PASS |
| 10 | no doble compensación | 12-void-vs-reverse.md (4 barreras) | PASS |
| 11 | concurrencia segura | 13-concurrency.md (Races A/A2/B/C, 2 conexiones) | PASS |
| 12 | negative stock rechazado | 14-negative-stock.md (0 mutación) | PASS |
| 13 | decimal stock correcto | 15-decimal-stock.md (94.0000 exacto) | PASS |
| 14 | stock elevado sin anomalías | 16-high-stock.md (966→965→966) | PASS |
| 15 | genealogía initial→sale→void | 17-repair-genealogy.md (98/98 fingerprints) | PASS |
| 16 | Test excluidos | 18-test-products.md (10/10 fuera; 126 u) | PASS |
| 17 | cross-store limpio | 19-cross-store.md (141/702/702 ×3) | PASS |
| 18 | financial integrity | 20-financial-integrity.md (520/366/0) | PASS |
| 19 | full reconciliation | 21-full-reconciliation.md (Σ 6.553; Δ=0) | PASS |
| 20 | ledger consistency | 22-ledger-consistency.md | PASS |
| 21 | zero residue | 23-zero-residue.md (24/24 ×2) | PASS |
| 22 | zero mutation final | 25-zero-mutation.md (solo diferencias R1) | PASS |
| 23 | permanent test | 24-permanent-test.md (iteration-19 29/29) | PASS |
| 24 | regression PASS | 26-regression.md (lint/tsc/vitest/build/PM2/HTTP) | PASS |
| 25 | SHA PASS | SHA256SUMS (78/78 SHA OK) | PASS |
| 26 | Git limpio | commit + push; HEAD == origin/main; worktree clean | PASS |

### Resumen ejecutivo

El inventario reparado en R1 (98 productos / 6.427 unidades / valor 9.932.216,938816005) **atravesó el ciclo operativo completo de CostPro** — `INITIAL → PRODUCTO → POS → VENTA → STOCK MOVEMENT → INVENTORY → STOCK_CURRENT → WAC → KARDEX → PAYMENT → VOID / REVERSE → invariantes restauradas` — mediante el pipeline canónico real (`create_sale_v2`, `void_transaction`, `reverse_transaction_v2`), sin romper inventory, WAC, kardex, payments, caja, audit, concurrencia ni aislamiento de tiendas. Toda la fase se ejecutó bajo Modelo A (BEGIN/ROLLBACK) y el patrón de 2 conexiones para concurrencia: **0 mutación permanente derivada de las pruebas** (24/24 métricas idénticas, verificadas dos veces).

### Hallazgo registrado para backlog (REGLA SUPREMA: descubrir, no corregir)

```text
F-1 (no bloqueante) · auto_kardex_on_stock_movement clasifica 'sale_void' como 'out'
     en kardex_movement_type, pese a que el movement RESTAURA stock (+ABS(q)).
     Impacto: semántica de lectura del kardex; sin efecto sobre stock/inventory/WAC/
     payments/trazabilidad. Preexistente a R2. BACKLOG — sin hotfix.
```

### Condiciones y límites de esta verificación

- Las pruebas dinámicas usaron la conexión privilegiada (Management API) con JWT claims del actor — desviación documentada en R1 (ACL de reverse_transaction_v2 y wac_change_log); los access checks internos del pipeline SÍ se ejercitaron con la identidad del actor, incluida la prueba de identidad forjada (P14b).
- La exclusión estricta por stock entre dos ventas concurrentes requiriente-commit quedó cubierta de forma equivalente (lock-exclusión + guard de stock) para preservar el mandato de cero residuo (13-concurrency.md).
- Los 10 productos Test siguen pendientes de una fase independiente de regularización.

## Veredicto

```text
POST-REPAIR OPERATIONAL INTEGRITY — VERIFIED
```
