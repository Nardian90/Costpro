# W9.5 — B-10b-OBS-2 · REPAIR DESIGN · 20-zero-mutation.md
# Verificación de mutación cero (GATE 21)

## Método

Mismo script idéntico PRE y POST (`scripts/g21_pre.sql`, heredado del pack OBS-2): 34
métricas de las 9 tablas auditadas + checksums MD5 de contenido (products de la tienda,
inventory global, stock_movements global) ejecutado vía Management API (solo SELECT).

- PRE capturado **antes** de cualquier análisis: `raw/g21_pre.json` (18:21:25Z)
- POST intermedio (tras todas las consultas de universo/funciones/actor): `raw/g21_post_mid.json`
- POST final (tras construir CSVs, simulación, test y regresión): `raw/g21_post_final.json`
- POST sellado (tras la SUITE COMPLETA de regresión, 2.029 tests): `raw/g21_post_final2.json`
  — 34/34 métricas idénticas, 0 diferencias (19:07Z y 19:11Z; ts es la única clave que cambia)

## Resultado

```text
MÉTRICAS COMPARADAS:      34
DIFERENCIAS PRE↔POST:     0   (POST intermedio)  ·  0   (POST final)

products identical:          YES (124/124 filas, checksum 6c900fcfcbf2c78870d42cd4a3b0b9ef)
inventory identical:         YES (checksum 007fec6b6c0968bfd3ae2c765fb86fa7)
stock_movements identical:   YES (checksum 39ba7edf0ec53f7a65c2f287b5ed2961)
kardex identical:            YES (kardex_store=0, kardex_all=702)
transactions identical:      YES (transactions_store=0, transactions_all=520)
receipts identical:          YES (receipts_store=0, receipts_all=6)
payments identical:          YES (payments_store_tx=0, payments_all=366)
devolutions identical:       YES (devolutions_store=13, devolution_items_all=13)
audit_logs identical:        YES (audit_logs_store=365, audit_logs_all=7376)
commissions identical:       YES (0)
transfers identical:         YES (0)
restore/reset sessions:      YES (53 / 0)
wac_change_log identical:    YES (store 0, all 14)
products_store_stock:        6.553 (constante)
```

Conteo detallado PRE/POST (idéntico): products_all 323 · products_store 124 ·
products_store_cost 6.132.624,960555917 · inventory_all 141 · inventory_sum 4.978,6289 ·
stock_movements_all 702 · stock_movements_sum 4.978,6289 · transaction_items_all 555 ·
devolutions_all 13 · transfers_all 0 · z/residuos sin cambios.

## Escrituras de esta fase

```text
UPDATE:        0
INSERT:        0
DELETE:        0
ALTER/DDL:     0
TRUNCATE/DROP: 0
RPC de escritura: 0 (register_stock_movement jamás invocado; solo definiciones leídas)
reset_store_data: 0
```

Toda la interacción con la DB fue SELECT (Management API /database/query). La simulación
de la reparación fue 100% en memoria (scripts/simulate_repair.js + test). Los únicos
archivos creados viven en el pack de evidencia y en src/__tests__ (test sin DB).
