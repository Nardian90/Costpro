# W9.5 — B-10b-OBS-1 · 02-historical-function.md
# GATE 2 — Reconstrucción del algoritmo histórico que produjo el drift

## 1. Genealogía de reverse_devolution (producción)

| Versión | Fecha commit/migración | Cambio relevante para stock |
|---|---|---|
| v2.2 | `20260726000005_v2_2_accounting_flow_reversal.sql` | **NACE el drift**: `UPDATE products SET stock_current = GREATEST(0, stock_current - quantity)` + `INSERT kardex_entries ('out', unit_cost=0, ref_type='reversal')`. Sin stock_movements, sin inventory, sin audit. |
| v2.12.9 | `20260727000006` (spoofing p_user_id) | `v_uid := CASE WHEN auth.role()='service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END`. Núcleo de stock intacto. |
| v2.12.12 / F06 | 2026-07-27 / 2026-09-02 | Guardias/ACL. Núcleo de stock intacto. |
| B-10 | `20260905000002` (09-05) | Guard de estado (solo completed), can_reverse_document, audit REVERSE_DEVOLUTION («antes: cero rastro en audit_logs»). Núcleo de stock intacto. |
| **B-10b** | `20260905120000` | **Elimina el drift-productor**: pipeline register_stock_movement(-q,'devolution_reverse') → stock_movements → inventory → products → kardex. |

Cuerpo PRE capturado forensemente en vivo (B-10b, raw-gate1-live.json):
OID 136657, SHA256 `767d6fe43c11df0b953ffd8c4236416869fa63d20c11d26e260ca8caca899919`.
**Verificación hoy (raw-g5-functions-store.json): hash live = `bb8f3c09…` ≠ PRE → la
versión histórica ya NO está en producción** (reemplazada por B-10b, OID preservado).

## 2. Lado de CREACIÓN activo en agosto 2026 (crítico para el signo del drift)

Las 13 devoluciones reales (creadas 08-04→08-07) portan audit `DEVOLUTION_CREATED_V2`
con metadata `{reason, original_tx, devolution_number, item_count, v2_reverse:true}` —
**coincidencia exacta de claves** con el INSERT de audit del RPC
`create_devolution_v2` (commit `0c839657` 08-04, iteración 11.3 v2.17.1/2-staging):

```sql
-- create_devolution_v2 (v2.17.2, vigente en la ventana 08-04..08-07):
PERFORM public.register_stock_movement(... p_movement_type := 'return', ...);  -- NO UPDATE directo
INSERT INTO public.kardex_entries (..., 'devolution_in', ...);                  -- kardex explícito
INSERT INTO public.audit_logs (...) VALUES ('DEVOLUTION_CREATED_V2', ...);
```

Es decir: la creación del par SÍ pasó por el pipeline canónico
(+q → stock_movements → **inventory +q** → products +q → kardex devolution_in).

## 3. Efecto exacto del PAR sobre la devolución revertida 0b7213e9

| Paso | Instante (UTC) | products.stock_current | inventory.quantity | ledger |
|---|---|---|---|---|
| Pre | — | X | Y | — |
| create_devolution_v2 (+1, pipeline) | 08-06T23:27:41.661518 | X+1 | Y+1 (upsert del trigger fn_sync_inventory_on_movement) | movement 'return' +1, kardex devolution_in |
| reverse_devolution PRE-B-10 (−1, legacy) | 08-06T23:27:43.117368 | **GREATEST(0,(X+1)−1) = X** (aplicado COMPLETO, sin clamp: stock era X+1 ≥ 1) | **Y+1 (NO tocado — el cuerpo legacy no escribe inventory)** | SIN movement; kardex 'out' cost0; sin audit |

**Drift creado por el reverse histórico (Caso A): `inventory = products + 1`.**

Demostración de que el clamp NO destruyó información: entre creación y reversión media
1.455 s sin ninguna operación intermedia (audit sin eventos en el intervalo); tras la
creación el stock era X+1 ≥ 1, por lo que `GREATEST(0, (X+1) − 1) = X ≥ 0` — el descuento
de 1 unidad se aplicó íntegro. El efecto neto del par sobre products es **0**.

## 4. La suerte del drift: purga de tienda (evento separado)

Hoy (raw-g3/g4/g5): el producto da1c4090 tiene **0 movements, 0 kardex, 0
transaction_items, NI fila en inventory**; products.stock_current=966 con
updated_at=2026-08-16T22:01:13.103154 (== reversal del vale VS-000022-2026, audit g1).
La tienda d1c4ba0e completa: **124 productos (108 con stock≠0, Σ=6553 u), 0 inventory,
0 stock_movements, 0 transactions**. Las funciones `reset_store_data` (2 overloads)
existen live y su familia de migraciones borra por tienda
(`DELETE FROM kardex_entries WHERE store_id = target_store_id`, ídem
stock_movements/inventory/transactions). Conclusión: la tienda de pruebas fue
resetada entre el 08-07 y hoy, **borrando la fila de inventory que portaba el drift +1**
junto con el resto del ledger de la tienda.

## 5. Evidencia de ejecución histórica (GATE 1/GATE 10)

- 0 filas en kardex con reference a devoluciones; 0 kardex `out/reversal/cost0`
  supervivientes (purga). 0 movements 'return'/'devolution_reverse' (purga).
- 0 audit REVERSE_DEVOLUTION / ADMIN_REVERSE_DEVOLUTION (la reversión fue pre-B-10;
  B-10 introdujo el audit el 09-05, después del único reversal real 08-06).
- El actor de la reversión SÍ es conocido por la fila: `devolutions.reversed_by =
  a1111111-1111-1111-1111-111111111111` vía service_role+p_user_id (ruta
  `/api/reverse` → RPC, confirmado en `7dfe8ce2:src/app/api/reverse/route.ts`
  — mapa `devolution → reverse_devolution`). No se inventa identidad.
- Auditoría exhaustiva: 24 audit CREATE_DEVOLUTION huérfanos (devoluciones borradas de
  otra tienda, 43a4dabc, julio) — documentados, fuera de alcance OBS-1.
