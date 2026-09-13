# 04 — PRE-DDL ACL (REM-INV-2R)

## receive_purchase(uuid) — ACL PRE medido (no asumido)

Fuente 1 — `pg_proc.proacl`:
```text
{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
```

Fuente 2 — `information_schema.routine_privileges`:
```text
authenticated | EXECUTE
postgres      | EXECUTE
service_role  | EXECUTE
```

## Roles de interés (verificados)

| rol | rolsuper | rolbypassrls |
|---|---|---|
| postgres | t | t |
| authenticated | f | f |
| anon | f | f |
| service_role | f | t |
| authenticator | f | f |

## Decisiones de REVOKE derivadas del ACL PRE (mandato fase 7)

1. `REVOKE EXECUTE ... FROM authenticated` — CORRESPONDE (grant explícito presente) → EJECUTADO.
2. `REVOKE EXECUTE ... FROM anon` — sin grant explícito; ejecutado como defensa en
   profundidad idempotente (no-op seguro, línea de `assets/deferred-db-remediation.sql`).
3. `REVOKE EXECUTE ... FROM public` — NO CORRESPONDE: `proacl` es no-NULL y NO contiene
   grant PUBLIC ⇒ PUBLIC nunca tuvo EXECUTE implícito ni explícito. Documentado, no ejecutado.
4. `service_role`/`postgres` — NO se revocaron (backend/admin de confianza; la función se
   elimina íntegramente en fase 8, con lo cual toda ACL desaparece con el objeto).

## ACL POST-REVOKE (medido, previo al DROP)

```text
authenticated → false   (has_function_privilege)
anon          → false   (has_function_privilege)
service_role  → true    (única superficie backend restante, eliminada en fase 8)
postgres      → true    (owner/superuser)
```

Raw: `assets/ddl-runner-execute.json` (sección POST-REVOKE privileges).

## ACL POST-DROP

El objeto no existe ⇒ ninguna ACL ⇒ **NONE / 0 EXECUTE residual**
(`has_function_privilege` devuelve 42883 "does not exist" — prueba positiva).
Ver `10-security.md` y `assets/phase14-security.json`.
