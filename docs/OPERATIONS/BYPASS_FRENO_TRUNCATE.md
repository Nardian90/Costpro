# Bypass del freno de TRUNCATE (CP-INFRA-020) — procedimiento del propietario
**Estado: PREPARADO — el freno NO está aplicado a producción hasta la compuerta `AUTORIZO BREAKER PROD`.**

> **ACTUALIZACIÓN (2026-11-14, CP-SECURITY-AND-BACKLOG-CLOSURE-001):** la
> familia del freno ahora son DOS archivos. `20261110120000` (original) queda
> intacto por historia; `20261114180300_cp_infra_020_breaker_v2.sql` corrige
> sus dos defectos y ENDURECE el bypass:
>   1. La comprobación de tablas ausentes es FAIL-CLOSED (RAISE EXCEPTION con
>      la lista exacta; antes RAISE WARNING → protección parcial en silencio).
>   2. El bypass exige ADEMÁS que `current_user` NO sea `anon`/`authenticated`:
>      los roles de aplicación JAMÁS pueden eludir la protección, ni hoy ni si
>      un futuro RPC expusiera la GUC.
>   3. La instalación vive en la función testeable
>      `public.cp_infra_020_install_breaker(text[])` (idempotente).
> Batería de pruebas: `supabase/tests/infra020_breaker_v2_test.sql`
> (validada en CostproE2E: HTTP 201 — TRUNCATE bloqueado ordinario y en modo
> replica, bypass solo administrativo, GUC inútil a authenticated,
> instalador fail-closed, 34/34 triggers ENABLE ALWAYS).

## Cuándo usar el bypass
Solo para mantenimiento consciente que REQUIERA TRUNCATE (p. ej. reconstruir
una tabla de staging). Regla: producción NO es banco de pruebas — si el dato
se puede borrar con `DELETE WHERE` o en una BD desechable, no uses TRUNCATE.

El bypass SOLO funciona con un rol administrativo (`postgres`/`service_role`
o equivalente con conexión directa). Un JWT de aplicación (`anon`/
`authenticated`) con la GUC activada sigue SIN poder truncar.

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

## Aplicar el freno (compuerta G — actualizada a la familia v2)
1. Verificar identidad: proyecto `CostproBD` ref `wthkddeleylijmonclxg` (Management API o dashboard).
2. Respaldar (respaldo cifrado reciente; ver PROCESO_CAMBIOS_PRODUCCION).
3. Aplicar EN ORDEN y en UNA transacción cada archivo:
   a. `supabase/migrations/20261110120000_cp_infra_020_truncate_breaker.sql`
   b. `supabase/migrations/20261114180300_cp_infra_020_breaker_v2.sql` (corrige y endurece)
   (Si la base ya tuviera el original aplicado, basta el paso b.)
4. Verificar catálogo:
   ```sql
   select count(*) from pg_trigger where tgname='trg_cp_infra_020_block_truncate';  -- 34
   select count(*) from pg_trigger where tgname='trg_cp_infra_020_block_truncate' and tgenabled='A';  -- 34
   select count(*) from pg_constraint where conrelid='public.commission_payments'::regclass and contype='x'; -- (independiente: 1)
   ```
   Fall-closed adicional: probar en la MISMA transacción un TRUNCATE de
   prueba (esperado: ERR_TRUNCATE_BLOQUEADO) y revertir.
5. Registrar las filas en el ledger (una por archivo aplicado).
6. Publicar la frase de autorización usada y la fecha en el expediente.

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
drop function if exists public.cp_infra_020_install_breaker(text[]);
```
