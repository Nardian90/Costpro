# W9.4.9 — H5-B3 — GATES 3+4: ANÁLISIS DE LOCKING REAL

Fecha: 2026-09-04 | Baseline: git 3d03afbc | Fuente: definiciones LIVE (01-live-functions.txt)

## GATE 3.A — ¿reverse_transaction_v2 adquiere lock?

**SÍ — literal y como primera sentencia.** Cuerpo live (OID 138188):

```sql
SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND'; END IF;
IF v_tx.status = 'voided' THEN RETURN jsonb_build_object('status','idempotent',…); END IF;
IF v_tx.status <> 'completed' THEN RAISE EXCEPTION 'ERR_INVALID_STATUS: …'; END IF;
```

- El lock `FOR UPDATE` sobre la fila de `transactions` se adquiere **ANTES** de la validación
  de estado y antes de cualquier mutación → la ventana clásica de H5-B3 (read→validate→reverse
  sin lock) **no existe** en V2: read y validate ocurren BAJO lock.
- `FOR UPDATE` en PostgreSQL READ COMMITTED + EvalPlanQual: si otra sesión está modificando la
  fila, esta sentencia **bloquea**; al liberarse el lock, re-lee la versión YA-COMMITIDA más
  reciente de la fila y evalúa los checks contra ELLA (no contra el snapshot antiguo).

## GATE 3.B — Mecanismos de serialización adicionales (defense in depth)

| # | Mecanismo | Dónde | Efecto |
|---|---|---|---|
| 1 | `SELECT … FOR UPDATE` | 1ª sentencia del RPC (ambas rutas) | serializa reversores concurrentes sobre la MISMA transacción |
| 2 | Estado transaccional con re-check bajo lock | `status='voided' → idempotent` / `<>completed → error` | el perdedor del lock ve el estado post-commit del ganador |
| 3 | Trigger `trg_validate_tx_transition` | cada UPDATE de transactions | máquina de estados: `voided → []` terminal; `completed→voided` único camino |
| 4 | UPDATE inventory relativo (`quantity = quantity + Δ`) | trigger fn_sync_inventory_on_movement | serializa movimientos concurrentes del MISMO producto a nivel de fila de inventory |
| 5 | `FOR UPDATE` products | fn_recalc_wac (ruta receipts) | serializa WAC (no aplica a ruta de ventas, que no recalcula WAC) |
| 6 | UNIQUE / constraints | e.g. inventory UNIQUE(store,product) | integridad estructural |

**No se depende únicamente de la ausencia/presencia literal de `FOR UPDATE`:** aunque no
existiera, los mecanismos 2+3 impedirían el doble `voided` persistido (el 2º UPDATE
`WHERE id=…` re-leería bajo lock del UPDATE y el trigger 3 + re-check 2 lo bloquearían); con
el mecanismo 1, además, la sesión perdedora ni siquiera llega a validar contra datos viejos.

## GATE 4 — Secuencia temporal de locks (reversión de UNA transacción con N items)

```text
t0  BEGIN (implícito, PostgREST/supabase.rpc — READ COMMITTED)
t1  LOCK: transactions row (id=T) — ROW EXCLUSIVE, adquirido por SELECT…FOR UPDATE
    └─ cualquier otro reversor de T BLOQUEA aquí (void_transaction incluida: mismo lock)
t2  validaciones status/access (sin locks nuevos)
t3  POR CADA ITEM:
    t3.1 INSERT stock_movements
         ├─ BEFORE trigger: LOCK: inventory row (store,product) — UPDATE…RETURNING
         │    └─ movimientos concurrentes del MISMO producto serializan aquí
         ├─ AFTER trigger:  LOCK: products row — UPDATE stock_current
         └─ AFTER trigger:  INSERT kardex_entries (lock propio de fila insertada)
    t3.2 UPDATE products SET stock_current (LOCK products row — ya en poder de esta sesión)
t4  UPDATE transactions SET status='voided' (LOCK ya poseído desde t1)
t5  INSERT audit_logs (lock propio)
t6  COMMIT → TODOS los locks se liberan ATÓMICAMENTE aquí
```

Duración de los locks: desde adquisición hasta COMMIT/ROLLBACK (patrón short-transaction:
todo el RPC es una única transacción).

Intercalación imposible por diseño:
- Otro proceso NO puede insertarse entre `t1` y `t6` para el MISMO id T (requeriría el lock t1).
- Sí puede intercalarse para transacciones DISTINTAS que tocan el MISMO producto: se serializan
  en t3.1 (inventory) — efecto: sumas relativas correctas, balance_after consistente.

## Nota de deadlock (evaluada, no es vulnerabilidad de doble impacto)

Dos reversiones de transacciones DISTINTAS con items en orden inverso (A:[P1,P2], B:[P2,P1])
podrían formar dead-lock mutuo en t3; PostgreSQL lo detecta (deadlock_timeout) y aborta una sesión
completa con error → su transacción entera hace ROLLBACK → **sin impacto parcial ni doble
reversión**. Costo: un error visible para un caller, sin corrupción. No requiere fix.

## Conclusión GATES 3–4

La serialización necesaria para eliminar la ventana H5-B3 existe y es el mecanismo canónico
(`FOR UPDATE` temprano + re-validación bajo lock + máquina de estados en trigger). Pendiente
(GATES 5–7): demostrarlo empíricamente con dos sesiones reales concurrentes.
