# 09-rc2-design.md — RC-2: Diseño del hardening ACL de `public.audit_logs`

## 1. Estado PRE (LIVE, verificado con aclexplode + has_table_privilege)

`relacl` = `{postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres,
costpro_transaction_adjuster=a/postgres, costpro_snapshot_restorer=a/postgres}`

Es decir: `anon` y `authenticated` poseían los 8 privilegios (a,r,w,d,D,x,t,m =
INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN).

RLS: `relrowsecurity = true`, `relforcerowsecurity = false`; 3 policies
(2×SELECT, 1×INSERT `WITH CHECK (user_id = auth.uid())`).

## 2. Defecto (REM-INV-4A, F-04-B, P1-latente)

RLS **no cubre TRUNCATE** (ni MAINTAIN). Con el GRANT presente, `authenticated`
puede ejecutar `TRUNCATE public.audit_logs` por SQL directo destruyendo el trail
completo (staging G7: 4 filas → 0). UPDATE/DELETE estaban bloqueados en la
práctica por RLS (sin policy → deny), pero el GRANT era excesivo y sostenía la
capacidad latente. Los 68 writers LIVE de audit_logs son INSERT-only; ningún
caller legítimo de anon/authenticated requiere DELETE/UPDATE/TRUNCATE/MAINTAIN
(censo REM-INV-4A 11-audit-logs-callers, re-verificado).

## 3. Cambio mínimo (§18/§35 — solo REVOKEs necesarios)

```sql
REVOKE DELETE, UPDATE, TRUNCATE, MAINTAIN ON public.audit_logs FROM anon;
REVOKE DELETE, UPDATE, TRUNCATE, MAINTAIN ON public.audit_logs FROM authenticated;
```

| Decisión | Justificación |
|---|---|
| Mantener SELECT | lectura del trail por UI/consultas (policy admin/manager) |
| Mantener INSERT | arquitectura de writers client-side (policy `audit_logs_insert_authenticated`); 68 writers no afectados (todos SECDEF owner=postgres, no dependen del grant a authenticated) |
| Mantener REFERENCES/TRIGGER | fuera del mínimo necesario para cerrar los P1; retirarlos sería expansión de alcance (§55) — registrado como residual P2 |
| No tocar service_role/postgres | backend de logging y mantenimientos legítimos (§22); `service_role` conserva arwdDxtm (B7 PASS: INSERT/SELECT/DELETE de limpieza intactos) |
| No usar CASCADE / REVOKE ALL | §35: privilegio exacto, rol exacto, objeto exacto |
| No modificar RLS/policies | §19: el ACL es el punto de control correcto; RLS queda intacta (B8) |

## 4. Efecto POST (verificado en staging B1-B8 y en catálogo LIVE)

- `anon`/`authenticated` = `arxt` (INSERT, SELECT, REFERENCES, TRIGGER).
- TRUNCATE/DELETE/UPDATE → `permission denied for table audit_logs` (ACL, no RLS).
- VACUUM (MAINTAIN) → PG17 emite `NOTICE: permission denied to vacuum
  "audit_logs", skipping it` — la operación NO se ejecuta (B6).
- service_role sin cambios; postgres (owner) sin cambios.
- Fingerprint ACL PRE: a382f7b0…  POST: 4c7d9c88… (44-hashes).
