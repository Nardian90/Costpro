# REM-INV-4C — 10 Remediation Design (Gates G/I/J)

## Pregunta del gate

> ¿Qué funciones de autorización/tenant tienen EXECUTE excesivo y cuáles pueden ser restringidas sin romper ningún caller legítimo?

## Respuesta (matriz de decisión Gate I)

| Function | PUBLIC | anon | authenticated | service_role | Caller legítimo demostrado | Necesita browser RPC | Riesgo | Acción |
|---|---:|---:|---:|---:|---|---|---|---|
| `has_store_role(uuid,text[])` | no | no | sí | sí | 20 policies RLS `TO authenticated` + 6 SECDEF internos (como postgres) | No (las policies evalúan en DB con la sesión autenticada) | P3 (ya restringido) | **KEEP** |
| `has_store_role(uuid,uuid,text[])` | **sí** | **sí (vía PUBLIC)** | sí | sí | 0 policies; 2 SECDEF internos (`managed_revoke_membership`, `managed_update_membership`, ejecutan como postgres; subject = `v_caller_uid` del propio caller) | No | **P3** — exposición innecesaria sin disclosure material (anon obtiene `false` constante, sin oráculo E8 — probado en PRE) | **REVOKE PUBLIC** |
| `has_store_role_as(uuid,uuid,text[])` | no | no | no | sí | 2 SECDEF internos (`create_sale_v2`, `reopen_cash_shift`) como postgres/service_role | No | ya restringido (42501 para anon/authenticated — probado) | **KEEP** (solo documentar, §7-F2) |
| `current_user_tenant_id()` | **sí** | **sí** | sí | sí | 29 policies RLS `TO authenticated` + 3 SECDEF internos (`current_user_store_ids`, `is_admin_with_access`, `is_tenant_member`) | No (mismo patrón) | **P3** — anon obtiene `NULL` (sin JWT → `auth.uid()` NULL); exposición objetivamente innecesaria | **REVOKE PUBLIC + REVOKE anon** |

## Clasificación de riesgo (Gate G)

- **Ningún hallazgo es P0/P1/P2**: no hay impersonación posible (el 3-arg liga identidad a `auth.uid()` en el cuerpo — probado con H4/H4-control/H6), no hay oráculo de membresía (E8: par real vs aleatorio indistinguibles bajo anon), no hay disclosure cross-tenant, y `current_user_tenant_id` solo devuelve el tenant del propio caller (NULL para anon). Por la regla §8 («no elevar severidad únicamente por existir PUBLIC EXECUTE») ambos residuales son **P3**: exposición objetivamente innecesaria que contradice la intención declarada del propio FIX H-7 (20260820000001 hizo `REVOKE … FROM anon`, un no-op contra PUBLIC — el grant PUBLIC nunca fue revocado).
- La exposición existe **hoy** (PRE: `anon EXECUTE=true` para 3-arg y `current_user_tenant_id` vía `has_function_privilege`), es cerrable sin romper nada, y por tanto el gate procede a remediar.

## Fix mínimo (Gate J) — DCL only, 3 statements

```sql
REVOKE EXECUTE ON FUNCTION public.has_store_role(uuid, uuid, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_tenant_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_tenant_id() FROM anon;
```

- **0 GRANTs necesarios**: `authenticated`, `service_role` y `postgres` ya poseen grants explícitos (registrados en proacl LIVE y replicados en staging). Tras el REVOKE: `anon EXECUTE=false` en ambas; `public=false`; `authenticated/service_role/postgres=true`.
- **Alternativa considerada y descartada**: revocar también `authenticated` en el 3-arg (patrón `has_store_role_as`: service_role-only). Descartada porque (a) FIX H-7 concedió `authenticated` explícitamente y su cuerpo es fail-safe bajo authenticated (solo self-check), (b) no reduciría ningún riesgo medible, (c) §33 prohíbe cambios por estética sin caller demostrado. Queda documentada como decisión arquitectónica futura si el patrón del proyecto converge a service_role-only.
- **No se toca**: cuerpos de funciones (0 CREATE OR REPLACE), firmas, headers (SECDEF/search_path/owner), tablas, RLS, policies, datos.
- **Presupuesto de riesgo del cambio**: las 49 policies `TO authenticated` dependen de `has_store_role` 2-arg y `current_user_tenant_id`, ambas con EXECUTE `authenticated` preservado → regresión RLS obligatoria en staging (12) y smoke en producción (23).

## Cada REVOKE responde (§33)

- `REVOKE … has_store_role(uuid,uuid,text[]) FROM PUBLIC` → caller legítimo que NO lo necesita: todos los demostrados (policies: 0; SECDEF: corren como postgres; app/browser: 0). El grant PUBLIC es un residuo del default ACL que FIX H-7 intentó neutralizar.
- `REVOKE … current_user_tenant_id() FROM PUBLIC / FROM anon` → caller legítimo que NO lo necesita: anon (0 policies `TO anon`, resultado NULL sin JWT); los roles legítimos conservan grant explícito.
