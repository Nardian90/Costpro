# W9.5 — B-10b-OBS-2 · REPAIR DESIGN · 13-invariants.md
# Invariantes post-reparación (GATE 13) — exactas, no genéricas

Alcance: productos REPARADOS (R = 98 ids del pack 07-proposed-opening.csv), tienda
d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576. Cada invariante incluye su verificación SQL.
Todas deben cumplirse tras COMMIT (y ninguna puede fallar en la simulación — verificado).

## Invariantes de cantidad (núcleo)

**I1 — Tríada canónica por producto reparado**
```sql
-- para cada p ∈ R:
products.stock_current = inventory.quantity
inventory.quantity     = (SELECT COALESCE(SUM(quantity_change),0) FROM stock_movements
                          WHERE product_id=p.id AND store_id='d1c4ba0e…')
-- y en cada movimiento: balance_after = inventory.quantity tras él
```
Modelo vigente: el ledger inicia en la apertura (único movimiento por producto →
Σ = Q = inventory = stock_current). `has_movements` queda en true para los 98
(consistente con su significado operativo).

**I2 — Kardex ↔ stock_movements 1:1**
```sql
-- por p ∈ R: count(kardex_entries WHERE product_id=p) = count(stock_movements WHERE product_id=p) = 1
-- kardex.reference_id = stock_movements.id ; kardex.movement_type='in' ; kardex.quantity=Q
-- kardex.balance_quantity = products.stock_current (tras triggers) ; balance_unit_cost = WAC
```

**I3 — WAC congelado (bit a bit)**
```sql
-- checksum PRE vs POST de (id, cost_average) sobre las 124 filas de la tienda: IGUAL
-- (ningún cambio de cost_average en ningún producto de la tienda)
```

**I4 — wac_change_log neutro**
```sql
SELECT count(*) FROM wac_change_log WHERE store_id='d1c4ba0e…';  -- PRE=0 → POST=0
```

**I5 — Posición declarada estable (la apertura reconoce, no reescribe)**
```sql
-- checksum PRE vs POST de (id, stock_current) sobre las 124 filas: IGUAL
-- (stock_current ya era Q y permanece Q; solo updated_at cambia en las 98)
```

## Invariantes de trazabilidad

**I6 — Exclusiones intactas**: los 10 Test y los 16 stock=0: 0 filas nuevas en
inventory/stock_movements/kardex para sus ids; stock_current sin cambios.

**I7 — Aislamiento de tienda**: toda fila creada (movements/inventory/kardex/BE/audit)
tiene store_id='d1c4ba0e…'; counts globales de OTRAS tiendas sin delta; product_store
mismatch imposible (fn_sync_inventory_on_movement valida store match).

**I8 — Documentos financieros intactos**: counts PRE=POST de transactions (0 tienda),
payment_transactions, commission_payments, devolutions (13), devolution_items (13),
receipts (0), transfers (0). La apertura no crea ni altera documentos comerciales.

**I9 — Telemetría del pipeline**: business_events de la tienda += exactamente 98
(event_type='stock_movement', payload.new_qty=Q por producto).

**I10 — Auditoría del lote**: audit_logs += exactamente 1 fila action=
'STOCK_RECONCILIATION_OPENING' con metadata->>'batch_id' = batch ejecutado;
sin filas UPDATE_PRODUCT nuevas (WHEN del trigger lo excluye — F9.6).

**I11 — Referencia trazable end-to-end**: para cada movimiento:
`reference_doc = 'B10B-OBS2-RECON-OPENING:<batch>'` → mismo batch en
kardex.reference_description → batch_id en audit_logs.metadata → batch documentado en
SHA256SUMS del pack. Con un SELECT se recupera el lote completo:
```sql
SELECT m.*, k.id AS kardex_id FROM stock_movements m
LEFT JOIN kardex_entries k ON k.reference_id = m.id
WHERE m.reference_doc = 'B10B-OBS2-RECON-OPENING:<batch>' ORDER BY m.created_at;
```

## Invariantes de negocio adicionales

**I12 — Sellable**: tras la reparación, ventas canónicas de los 98 productos dejan de
chocar con `prevent_negative_inventory` (inventory.quantity = Q > 0 disponible).

**I13 — Detector permanente**: `iteration-17-b10b-obs2-orphan-ledger.test.ts` pasa de
reportar 108 ORPHAN_FULL a reportar 10 (solo Test, clasificados) + 16 stock-0; la
proyección de la reparación debe desaparecer del escaneo global de huérfanos vivos.

**I14 — Residuo declarado coherente**: tras reparar, declared_total (6.553) =
ledger_total (6.427) + test_residue (126). El residuo es EXPLÍCITO y clasificado, nunca
perdido ni invisibilizado.

## Verificación global post-ejecución (resumen exigible)

```text
[ ] I1  98/98 tríada canónica          [ ] I8  documentos financieros ±0
[ ] I2  98/98 kardex 1:1               [ ] I9  business_events +98
[ ] I3  checksum WAC 124/124 idéntico  [ ] I10 audit_logs +1 (lote)
[ ] I4  wac_change_log ±0              [ ] I11 referencia batch end-to-end
[ ] I5  checksum stock 124/124 idéntico[ ] I12 POS sellable (smoke opcional)
[ ] I6  exclusivos 26/26 intactos      [ ] I13 detector permanente actualizado
[ ] I7  aislamiento de tienda          [ ] I14 6.553 = 6.427 + 126
```
