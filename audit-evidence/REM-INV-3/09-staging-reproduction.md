# REM-INV-3 — FASE 13 — Reproducción en staging (PostgreSQL efímero aislado)

Infraestructura: pgserver (PostgreSQL embebido sin root, precedente REM-INV-2/2R).
Datadir efímero `scripts/rem-inv-3/pgdata` — DESTRUIDO al terminar (disposed).
Cero credenciales de producción, cero llamadas de red, cero touch a producción.

## 1. Fidelidad del entorno

Cuerpos aplicados VERBATIM (archivos en scripts/rem-inv-3/assets/, copiados a raw/):
- create_devolution_v2 — LIVE (pg_get_functiondef capturado por REM-INV-1, 2026-09-12)
- reverse_devolution + auto_kardex_on_stock_movement — migración B-10b 20260905120000 (= live desde 2026-09-05)
- next_document_number — vale_salida 20260817000001 (última en repo)
- register_stock_movement — qa_batch2 20260626000005 (última en repo)
- fn_sync_inventory_on_movement / fn_recalc_wac — LIVE (REM-INV-1)
- sync_product_stock / has_store_access_as / has_store_access / is_admin / can_reverse_document — migraciones verbatim

Sustituciones declaradas:
- auth.uid()/auth.role() → shims GUC (audit.uid/audit.role); roles authenticated/
  service_role/anon creados como NOLOGIN para satisfacer los GRANT de los cuerpos.
- trg_guard_wac_writer (products) NO instalado: su cláusula WHEN no es verificable
  sin acceso a producción y la interacción WAC pertenece a F-03/F4-04. No afecta a
  las superficies de F-02 (movimientos/efectos/guards).
- CHECK de devolutions.status: ('pending','completed','voided','reversed') según v2_2.

## 2. Fixture

Tiendas ST_A/ST_B; usuarios ADMIN(role=admin), MGR_A y MGR_B (encargado con
membresía activa solo en su tienda); producto P1 en ST_A (stock 5, cost 100);
ventas T1(2u)/T3(1u)/T4(1u)/T5(2u) en ST_A y T2(1u) en ST_B, todas con
cost_at_sale=90, precio 350.

## 3. Resultados (detalle completo en raw/staging-results.json)

| Caso | Descripción | Resultado |
|---|---|---|
| A | NC válida (venta original T1, qty 1 ≤ tope) | PASS — success; NC-000001-2026; mov 'return' +1 @cost_at_sale=90; inventory 5→6; products 6; kardex 'devolution_in'; cash 'out' 350; payment_transactions refund 350 (ref_type=devolution); audit DEVOLUTION_CREATED_V2 |
| B | NC completada | PASS — la creación es el estado completed (modelo de un paso); ver Caso A |
| C | NC completada dos veces | PASS — replay misma idempotency_key → status=idempotent, MISMO id, 0 efectos duplicados; key distinta excediendo tope → ERR_DEVOLUTION_CAP_EXCEEDED (vendido=2 devuelto=1 solicitado=2) |
| D | NC sobre documento inexistente | PASS — rechazada (la venta no existe → ERR_CROSS_STORE tras SELECT FOR UPDATE) |
| E | NC sobre doc de otra tienda | PASS — ERR_CROSS_STORE; usuario sin membresía → ERR_UNAUTHORIZED |
| F | NC qty > documento origen | PASS — ERR_DEVOLUTION_CAP_EXCEEDED (solicitado=5, vendido=2, devuelto=1) |
| G | reintento/concurrencia | PASS — ver 10-concurrency-idempotency.md |
| H | NC seguida de reversión | PASS — reverse_devolution B-10b: status 'reversed', mov 'devolution_reverse' −1, audit REVERSE_DEVOLUTION; doble reversión → ERR_ALREADY_REVERSED; reversión cross-store → ERR_UNAUTHORIZED |
| GHOST | réplica del patrón NC-000008: NC sin venta original | PASS — ERR_DEVOLUTION_NO_ORIGINAL ("tope acumulado exige venta original") |
| GHOST | réplica del patrón NC-000008: 999 u sobre venta de 1 u | PASS — ERR_DEVOLUTION_CAP_EXCEEDED (vendido=1, solicitado=999) |
| ATOMIC | fallo a mitad del loop de ítems (ítem 2 de otra tienda) | PASS — pre==post en 8 contadores (devolutions/items/movements/kardex/cash/payments/audit×2): ROLLBACK TOTAL |

Total: 22 PASS / 0 FAIL / 1 INFO (estado final del fixture).

## 4. Respuesta a la pregunta central del modelo

El patrón que produjo los 13 documentos fantasma (creación sin venta original,
cantidades libres, y bajo la era pre-DF-03 sin asiento financiero) es
IRREPRODUCIBLE con la función LIVE create_devolution_v2: la misma exige venta
original bajo lock, topa la cantidad acumulada por (venta, producto), valida
método y total, escribe el movimiento por el pipeline canónico y asienta el
efecto financiero ATÓMICAMENTE. El defecto de la era quedó cerrado por
v2_21_4 (Bug #3/#5, 2026-08-06 23:33Z) + consolidación W7 (DF-07/DF-03) +
hardening W9 (ACL service_role-only).
