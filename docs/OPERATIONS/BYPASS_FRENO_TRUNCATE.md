# Bypass del freno de TRUNCATE (CP-INFRA-020) — procedimiento del propietario
**Estado: PREPARADO — el freno NO está aplicado a producción hasta la compuerta `AUTORIZO BREAKER PROD`.**

## Cuándo usar el bypass
Solo para mantenimiento consciente que REQUIERA TRUNCATE (p. ej. reconstruir
una tabla de staging). Regla: producción NO es banco de pruebas — si el dato
se puede borrar con `DELETE WHERE` o en una BD desechable, no uses TRUNCATE.

## Cómo (una transacción, sin dejar el bypass activo)
```sql
BEGIN;
SET LOCAL costpro.allow_truncate = 'on';
TRUNCATE public.<tabla>;   -- nunca varias tablas "por si acaso"
COMMIT;
```
`SET LOCAL` muere con la transacción: la siguiente sentencia vuelve a estar
bloqueada (verificado en PG17 local, caso 3b de D4.4).

## Registro obligatorio
Cada bypass queda como fila en `public.production_migration_ledger`
(`status='applied'`, `evidence` con motivo y tablas) o, si no aplica al ledger,
en un acta fechada en `docs/OPERATIONS/`. El registro es parte del
procedimiento, no opcional.

## Aplicar el freno (compuerta G)
1. Verificar identidad: proyecto `CostproBD` ref `wthkddeleylijmonclxg` (Management API o dashboard).
2. Respaldar (respaldo cifrado reciente; ver PROCESO_CAMBIOS_PRODUCCION).
3. Aplicar `supabase/migrations/20261110120000_cp_infra_020_truncate_breaker.sql` en UNA transacción desde el SQL Editor.
4. Verificar catálogo:
   ```sql
   select count(*) from pg_trigger where tgname='trg_cp_infra_020_block_truncate';  -- 33
   select distinct tgenabled from pg_trigger where tgname='trg_cp_infra_020_block_truncate';  -- 'A'
   ```
5. Registrar la fila en el ledger.

## Rollback
```sql
do $$
declare r record;
begin
  for r in select event_object_table as t from information_schema.triggers
           where trigger_name = 'trg_cp_infra_020_block_truncate'
  loop
    execute format('drop trigger if exists trg_cp_infra_020_block_truncate on public.%I;', r.t);
  end loop;
end $$;
drop function if exists public.block_truncate();
```
