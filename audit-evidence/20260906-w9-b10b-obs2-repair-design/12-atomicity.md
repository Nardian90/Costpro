# W9.5 — B-10b-OBS-2 · REPAIR DESIGN · 12-atomicity.md
# Atomicidad del procedimiento (GATE 12) — diseño, sin implementar

## Principio

UNA SOLA transacción, UN solo script SQL simple-query, TODO o NADA. No existe estado
parcial: cualquier fallo (validación, trigger, constraint, desconexión) revierte el
completo. En el protocolo simple-query de PostgreSQL, un batch de sentencias enviado en
una sola consulta se ejecuta como transacción implícita única; con BEGIN/COMMIT explícitos
más el abort-on-error del runner, cualquier EXCEPTION produce ROLLBACK completo del batch.

## Esqueleto transaccional (plantilla canónica de ejecución futura)

```sql
BEGIN;

-- 1) LOCKS
SELECT pg_advisory_xact_lock(hashtextextended('b10b-obs2-recon:d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', 0));
-- Fija el universo en orden determinista (evita deadlocks con operación viva):
SELECT id, stock_current, cost_average FROM products
WHERE id IN (… 98 uuids del pack, ORDER BY id …)
FOR UPDATE;

-- 2) VALIDATE (verify universe / expected quantities / WAC / idempotencia)
DO $$
DECLARE v int; r record;
BEGIN
  -- 2.a universo exacto: 98 filas, cantidades y WAC = pack congelado
  FOR r IN SELECT product_id, opening_qty, opening_unit_cost FROM t_expected(98 ids) LOOP
     SELECT stock_current, cost_average INTO … FROM products WHERE id=r.product_id FOR UPDATE;
     IF stock_current <> r.opening_qty OR cost_average <> r.opening_unit_cost THEN
        RAISE EXCEPTION 'ERR_UNIVERSE_DRIFT: %', r.product_id;
     END IF;
  END LOOP;
  -- 2.b ledger vacío (0 inventory/movements/kardex/transacciones de la tienda)
  … (counts → mismatch ⇒ ERR_UNIVERSE_CHANGED)
  -- 2.c barreras de idempotencia B1 (11-idempotency.md)
  …
END $$;

-- 3) MUTATION (create opening movements — pipeline canónico)
SELECT register_stock_movement(…producto 1…);
…
SELECT register_stock_movement(…producto 98…);

-- 4) VERIFY post-inserción (invariantes I1–I11 de 13-invariants.md, SQL puro)
DO $$ … RAISE EXCEPTION 'ERR_INVARIANT: …' si algo falla … $$;

-- 5) AUDIT del lote
INSERT INTO audit_logs (user_id, action, table_name, record_id, new_data, metadata, store_id)
VALUES (:signer_user_id, 'STOCK_RECONCILIATION_OPENING', 'stock_movements', NULL,
        jsonb_build_object('batch_id',:batch,'movements',98,'units',6427,
                           'estimated_value',9932216.94),
        jsonb_build_object('pack','20260906-w9-b10b-obs2-repair-design',
                           'sha256sums',:pack_sha,'position_date','2026-08-16T22:01:13Z',
                           'backup_ts','2026-08-02T02:25:31Z'),
        'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576');

COMMIT;   -- o ROLLBACK automático por cualquier EXCEPTION previa
```

## Locks necesarios y alcance

| Lock | Objeto | Motivo | Duración |
|---|---|---|---|
| `pg_advisory_xact_lock` | clave store-scoped | serializa reparaciones concurrentes | transacción |
| `SELECT … FOR UPDATE` (ORDER BY id) | 98 filas products | congela el universo; bloquea ventas/ajustes de esos productos durante el batch | transacción |
| row locks implícitos | inventory (INSERT nuevos) / stock_movements | pipeline canónico | transacción |

Con los 98 products bloqueados, cualquier venta concurrente de esos productos espera o
falla por lock_timeout; por eso el checklist exige ventana de mantenimiento/POS cerrado
(18-execution-checklist.md). No se bloquean tablas enteras (otras tiendas siguen operando).

## Propiedades garantizadas

1. **Atomicidad**: BEGIN … COMMIT con asserts RAISE EXCEPTION → cualquier fallo aborta
   TODO (0 filas parciales). El runner (Management API) ejecuta el archivo como un único
   simple-query → la semántica de batch único se mantiene end-to-end.
2. **Consistencia**: validaciones PRE (universo, cantidades, WAC, ledger vacío,
   idempotencia) y POST (invariantes I1–I11) dentro de la MISMA transacción: nada puede
   cambiar entre validar y escribir.
3. **Aislamiento**: locks de fila + advisory lock; RLS no aplica (SECURITY DEFINER +
   rol de ejecución admin), pero el acceso se valida canónicamente en el RPC
   (`p_skip_access_check=false`).
4. **Durabilidad**: COMMIT único; tras él, el detector permanente y los checksums POST
   (20-zero-mutation.md section de ejecución) verifican el estado.

## Prohibido expresamente

- Ejecutar movimientos uno-a-uno en llamadas separadas (rompe atomicidad).
- Usar `app.restore_mode='true'` para «facilitar» la carga (bypassea TODOS los guards).
- Desactivar triggers, ALTER TABLE, o tocar las funciones congeladas.
- Correr en horario comercial de la tienda sin ventana acordada.
