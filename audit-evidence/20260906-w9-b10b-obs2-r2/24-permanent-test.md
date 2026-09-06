# W9.5 — B-10b-OBS-2-R2 · 24-permanent-test.md
# GATE 24 — PERMANENT TEST · PASS

`src/__tests__/integration/iteration-19-b10b-obs2-post-repair-operational-integrity.test.ts` — 29 tests, reproducible (sin conexión a DB: congela y valida el pack de evidencia committeado).

## Cobertura del mandato

### Repair (A)
- batch congelado: 98 products / 6427 units / 98 initial / 98 inventory / 98 kardex / 98 BE / 1 audit; created_by = actor
- valor exacto 9.932.216,938816005 (kardex 2dp 9.932.216,94)
- triada canónica sin mismatches; WAC bit a bit; 98 fingerprints PRE→POST

### Operational (B)
- 23/23 pasos del master test PASS
- venta cash: stock 19−2=17 == inventory == ledger; movement sale trazable
- kardex out/2/490/980 balance 17, referencia 'Venta POS v2'
- WAC preservado; wac_change_log=0
- invariante de pago SUM(amount_cup)=700 == total; zelle USD sin doble conversión
- POS void (VOID_SALE / POS_UNDO) y admin reverse (REVERSE_TRANSACTION_V2 / ADMIN_REVERSE) con restauración exacta

### Safety (C)
- negative stock: ERR_INSUFFICIENT_STOCK con before==after
- concurrencia: Race A (lock timeout, exactly one writer), Race A2 (serialización sin leak), Races B/C (ERR_TX_NOT_FOUND / ERR_TRANSACTION_NOT_FOUND — sin compensación fantasma)
- idempotencia: 2º void ERR_ALREADY_VOIDED; reverse-on-voided idempotent; void-on-reversed rechazado
- cross-store: inventory_other=141, movements_other=702, kardex_other=702 (PRE==POST)
- Test exclusion: 10/10 fuera del batch, Σ 126 u, SKUs congelados

### Financial (D)
- 24/24 métricas idénticas tras master y tras races (cero mutación histórica)
- histórico congelado: 520 tx / 366 payments / 0 commissions / 555 items / 14 wac_log
- reconciliación: Σ 6.553; 10 mismatches == 10 Test (residuo clasificado)
- ACL congeladas del pipeline (reverse solo postgres/service_role)
- SHA256 anti-drift de los 4 raw críticos + cross-check contra SHA256SUMS (cuando existe)

## Ejecución

```text
npx vitest run src/__tests__/integration/iteration-19-b10b-obs2-post-repair-operational-integrity.test.ts
→ Test Files 1 passed (1) · Tests 29 passed (29)
Suite completa (GATE 26): 2.058 passed · 0 failed · 24 skipped
```

## Veredicto GATE 24

```text
PASS — test permanente reproducible integrado a la suite regular
```
