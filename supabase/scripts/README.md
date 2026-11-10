# supabase/scripts/ — Scripts SQL operativos

> **Regla CP-INFRA-020 (2026-11-10): todo script destructivo de este directorio
> lleva un guard DENTRO del SQL que lo bloquea fuera de una BD desechable.**
> El guard aborta la transacción completa (fail-closed) antes de tocar una
> sola fila si la BD no está marcada como desechable.

## Qué hay aquí

| Script | Qué hace | Estado |
| --- | --- | --- |
| `reset_demo_data_pro.sql` (v5.7.13-guard.1) | Reset de demo con catálogo enriquecido: TRUNCATE de ~31 tablas de negocio, `DELETE FROM auth.users`, re-siembra de 2 tiendas, 4 usuarios (demo123), 8+ productos, ventas, ajustes y transferencias | **ÚNICO mantenido** — solo en BD desechable |
| `deprecated/DEMO_RESET_SCRIPT.sql` (v5.7.25) | Reset demo con roles RBAC | OBSOLETO — NO EJECUTAR (guard igualmente activo) |
| `deprecated/DEMO_RESET_SCRIPT_V2.sql` (v5.8.3) | Reset demo selectivo + `GRANT ALL` masivos | OBSOLETO — NO EJECUTAR |
| `deprecated/DEMO_RESET_SCRIPT_V3.sql` (v3.0) | Reset demo mínimo | OBSOLETO — NO EJECUTAR |
| `deprecated/fixed_reset_demo_data.sql` (v5.5.0) | Reset demo con ALTER TYPE fuera de bloque | OBSOLETO — NO EJECUTAR |
| `deprecated/reset_demo_data.sql` (5.7.10) | Reset multi-tienda con `DROP FUNCTION ... CASCADE` | OBSOLETO — NO EJECUTAR |
| `deprecated/reset_demo_data_fixed.sql` | Reset demo antiguo sin versión | OBSOLETO — NO EJECUTAR |
| `register_reception_rpc.sql` | Registra RPC de recepciones (no destructivo) | Operativo |
| `security_guardrail.py` | Auditoría estática de RLS/policies (no toca datos) | Operativo |
| `sql_checks.sql` / `ci-security-gate.sh` | Checks de CI (solo lectura) | Operativo |

Historia: los seis scripts de `deprecated/` fueron retirados por CP-INFRA-020
(riesgos R5/R6 de `docs/audits/DATA-INTEGRITY-REMEDIATION-001`) porque podían
ejecutarse contra cualquier BD pegándolos en el SQL Editor de Supabase — así
ocurrió el borrado masivo de producción aún sin responsable identificado.

## ⚠️ SOLO se ejecutan en una BD DESECHABLE

`reset_demo_data_pro.sql` **borra todos los datos** de la BD donde corre: las
~31 tablas de negocio (con CASCADE), los usuarios de `auth.users` y vuelve a
sembrar datos de demo. **Nunca en producción (CostproBD) ni en CostproE2E.**

El guard embebido (bloque `DO $guard$` al inicio) comprueba dos cerraduras y
aborta sin tocar nada si:

1. No existe `public.e2e_is_isolated_db()` → la BD no está marcada como
   desechable → **ABORTA** (producción no la tiene; la crea la sección
   centinela de `supabase/e2e-bootstrap.sql`).
2. `public.e2e_is_isolated_db()` no devuelve `true` → **ABORTA**.
3. Existe `public.production_migration_ledger` → la BD es producción →
   **ABORTA** (esa tabla solo existe en CostproBD).

CostproE2E tiene **ambas** (centinela + ledger): el guard la bloquea a propósito
— no es una BD de demos. La misión del guard es que solo pase una BD
explícitamente preparada como desechable.

Todo el script corre en UNA transacción (`BEGIN; ... COMMIT;`): si el guard
falla, nada posterior se ejecuta, aunque el cliente siga enviando comandos sin
`ON_ERROR_STOP` (verificado empíricamente en T1.1, `audit-evidence/CP-INFRA-020/`).

## Cómo preparar una BD desechable para demos

Opción A — Supabase local (`supabase start`):

```bash
supabase start          # levanta un stack local desechable
# luego aplica SOLO la sección centinela de supabase/e2e-bootstrap.sql:
psql "$LOCAL_DB_URL" -f -  # pegar la SECCIÓN C de supabase/e2e-bootstrap.sql
```

Opción B — un proyecto Supabase aparte, creado solo para demos (el free tier
alcanza) y destruido al terminar. Ejecutar en su SQL Editor la sección
centinela (SECCIÓN C) de `supabase/e2e-bootstrap.sql`:

```sql
create or replace function public.e2e_is_isolated_db()
returns boolean language sql stable security invoker
set search_path to 'public', 'pg_temp'
as $$ select true $$;
```

### Prueba previa OBLIGATORIA (antes de pegar cualquier reset)

```sql
select public.e2e_is_isolated_db();         -- debe devolver true
select to_regclass('public.production_migration_ledger');  -- debe devolver NULL
```

Si la primera no da `true` o la segunda no da `NULL`, **NO ejecutes el reset**:
estás apuntando a una BD que no es desechable.

## Para el CI

`scripts/ci/check-destructive-guard.cjs` (T2) exige este guard en cualquier
archivo versionado con sentencias destructivas (TRUNCATE, `DELETE FROM
auth.users`, DROP SCHEMA, `session_replication_role`, ...). Sin marcador
`-- COSTPRO-GUARD-DESTRUCTIVO v1` + bloque DO verificado al inicio, el CI
falla. Ver `scripts/ci/destructive-allowlist.json` para excepciones temporales
justificadas.
