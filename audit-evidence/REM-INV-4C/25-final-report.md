# REM-INV-4C — 25 Informe Final: SECURITY EXECUTE ACL Hardening

**Baseline:** `070bc9d9` (HEAD == origin/main, worktree clean — ver 00-baseline.txt)
**Fecha:** 2026-09-15 · **Producción:** Supabase project `wthkddeleylijmonclxg` (solo-lectura durante diagnóstico; única excepción: DCL autorizado tras completar gates de diagnóstico + staging + regresión + precondiciones)
**Objeto:** exposición EXECUTE de `has_store_role` (todas las overloads), `has_store_role_as` y `current_user_tenant_id` — residuales RES-4B-1/2 heredados del cierre de REM-INV-4B.

---

## 1. Respuesta directa al objetivo final

> **¿Tienen `has_store_role`, `has_store_role_as` y `current_user_tenant_id` —incluyendo todas sus overloads— un nivel de EXECUTE superior al estrictamente necesario para los callers legítimos de CostPro? Si es así, ¿puede reducirse ese privilegio sin romper ningún flujo legítimo y demostrando que la exposición no autorizada queda neutralizada?**

**SÍ existía exposición excesiva en 2 de los 4 overloads y SÍ pudo reducirse con DCL mínimo sin romper ningún flujo legítimo.** El censo LIVE (Gates B/C, `aclexplode` + `has_function_privilege`) encontró: `has_store_role(uuid,uuid,text[])` con **PUBLIC EXECUTE** (incluye anon) y `current_user_tenant_id()` con **PUBLIC + anon explícito**; el 2-arg y `has_store_role_as` ya estaban correctamente restringidos. El único caller legítimo de los dos overloads expuestos en contexto anon/PUBLIC es **nadie**: 0 policies, 0 funciones no-SECDEF, 0 llamadas app/browser. Tras 3 statements `REVOKE` aplicados en producción: `anon=false` y `public=false` en ambos (verificado en `pg_catalog` y en el borde HTTP con probes REST 42501), `authenticated`/`service_role`/`postgres` intactos, 49 policies RLS evaluando idénticas, security-contract 134/134, regresión con delta 0, zero-touch 15/15 PRE==POST y catálogo con EXPECTED CHANGES ONLY.

## 2. Censo forense (Gates B/C/E)

4 overloads objetivo (todas `SECURITY DEFINER`, owner `postgres`), capturadas con firma exacta, OID, proconfig, volatilidad, md5(prosrc), SHA256(pg_get_functiondef), proacl y `has_function_privilege` para public/anon/authenticated/service_role/postgres (evidencia 01/03/04). Correcta interpretación del ACL: la entrada `=X/postgres` es grant a **PUBLIC** (no un rol vacío); un `REVOKE … FROM anon` no la elimina — esa fue exactamente la causa raíz del residual: FIX H-7 (20260820000001) hizo `REVOKE FROM anon` (no-op) + `GRANT authenticated, service_role` sin revocar PUBLIC.

## 3. Callers y dependencias (Gates D/E)

- **49 RLS policies LIVE** referencian los objetivos — **todas `TO authenticated`**: `has_store_role` 2-arg ×20, `current_user_tenant_id` ×29, 3-arg ×0, `has_store_role_as` ×0 (parsing de paréntesis balanceados para arity exacto).
- 8 funciones SECDEF llaman `has_store_role(` (6× 2-arg, 2× 3-arg con subject = `v_caller_uid` propio) y 4 llaman `current_user_tenant_id` — todas ejecutan como owner `postgres`, sin dependencia de EXECUTE anon/authenticated.
- 0 vistas, 0 event triggers, 0 dependencias `pg_depend` anómalas, 0 llamadas `.rpc(` en `src/`, 0 callers en `scripts/` (solo allowlist documental).

## 4. Contrato legítimo fijado

`authenticated` REQUIERE EXECUTE en 2-arg y `current_user_tenant_id` (las policies evalúan con los privilegios del rol de la sesión). Todo lo demás (PUBLIC/anon en los 4 overloads) no tiene caller legítimo demostrado.

## 5. Análisis individual y riesgo (Gates F/G)

- **F1 `has_store_role`**: 2 overloads. El 3-arg **liga identidad en el cuerpo** (`auth.role()<>'service_role'` → `user_id = auth.uid()`, parámetro ignorado) — probado en staging: H4 (subject=USER_B admin real de STORE_A2 → `false`) vs H4-control (`true` por membership propia), H6 (subject=GLOBAL_ADMIN no laundering). Bajo anon devuelve `false` constante (sin JWT) — **sin oráculo de membresía** (E8: par real vs aleatorio indistinguibles). → exposición PUBLIC objetivamente innecesaria, **P3** (regla §8: no elevar severidad solo por existir PUBLIC).
- **F2 `has_store_role_as`**: patrón `p_user_id`=sujeto (confía en el parámetro), pero ya restringida a service_role+postgres (42501 para anon/authenticated probado). → **NO MODIFICARLA**; documentada (RES-4C-4).
- **F3 `current_user_tenant_id`**: usa `auth.uid()` (identidad JWT), devuelve tenant UUID del propio caller; anon → NULL; 0 policies TO anon. → PUBLIC+anon innecesarios, **P3**.

## 6. Ataques de staging (Gates H/K — PG 17.6 efímero, fidelidad md5+proacl+RLS == LIVE)

Matriz de 36 casos (H1-H7, E4/E5/E8, service_role, probes SECDEF, regresión RLS) ejecutada PRE y POST con 5 contextos de rol vía `SET ROLE` + GUCs `request.jwt.claim.*` (equivalente PostgREST). **Deltas PRE→POST = exactamente 4**, todos neutralizaciones intencionales:

| Caso | PRE | POST |
|---|---|---|
| H2-hsr3-anon (anon ejecuta 3-arg) | ALLOW `false` | **DENY 42501** |
| H2-cuti-anon (anon ejecuta cuti) | ALLOW `NULL` | **DENY 42501** |
| E8-oracle-existing / random | ALLOW `false`/`false` | **DENY 42501 / DENY 42501** |

Los 32 casos restantes **byte-idénticos** PRE→POST: H1/H3 (self-check autenticado legítimo), H4/H5/H6 (binding de identidad intacto), SVC-* (ruta server_role confiable: trusted subject branch 200), SECDEF-probe (mecanismo managed_* preservado), RLS-* (49 policies: stores/memberships/products/product_cost_sheets/profiles visibilidad e inserciones idénticas, aislamiento cross-tenant intacto, anon default-deny sin error).

## 7. Root cause (Gate G)

```
default ACL de PostgreSQL (functions nacen con PUBLIC EXECUTE)
  → migración FIX H-7 (20260820000001) creó el 3-arg y "duró" contra anon
    con REVOKE … FROM anon (no-op: el grant era a PUBLIC, no a anon)
  → current_user_tenant_id: grants explícitos anon/authenticated añadidos en su día
    sin revocar nunca el PUBLIC heredado del default ACL
  → nadie volvió a auditar el ACL (los gates previos auditaron cuerpos/firmas)
  → anon PostgREST alcanzaba 2 helpers de autorización/tenant sin necesidad legítima
```

Trust boundary: el default-ACL del clúster, no el código. La doctrina del proyecto (RC-1/RC-3: binding de identidad en el cuerpo) ya protegía la *semántica*; este gate alinea el *ACL* con esa semántica.

## 8. Fix (Gates I/J — DCL only, 3 statements, 0 GRANTs)

```sql
REVOKE EXECUTE ON FUNCTION public.has_store_role(uuid, uuid, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_tenant_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_tenant_id() FROM anon;
```

Cada REVOKE responde §33: los callers legítimos demostrados (policies authenticated, SECDEF como postgres, service_role server-side) conservan grant explícito propio. Alternativa considerada y descartada (revocar `authenticated` en el 3-arg para converger al patrón service_role-only de `has_store_role_as`): sin reducción de riesgo medible (cuerpo ya fail-safe) y contraría el grant explícito de FIX H-7 — documentada en 10-remediation-design.md como decisión futura. **No se tocó**: cuerpos, firmas, headers, tablas, RLS, policies, datos.

## 9. Regresión (§15/16/17)

- Callers legítimos: 32/32 casos PRESERVADOS en staging (evidencia 12) + smoke LIVE service_role 200 + app 200.
- security-contract: **134/134 PRE y POST** (evidencia 14).
- `tsc --noEmit` 0 errores · vitest **2070 passed / 24 skipped** (== baseline 4B) · lint **0 errores / 1291 warnings** pre-existentes (== baseline) · delta 0 en los tres (evidencia 13). Build de producción no ejecutado: limitación conocida de infraestructura (4GB OOM/exit 137, heredada); este gate no modifica código, fuera de la superficie de riesgo.

## 10. Producción (Gates M + §20-23)

Precondiciones: re-censo == snapshot (drift 0), git HEAD==origin/main==070bc9d9, worktree limpio. Fingerprint PRE: 484 funciones, 146 tablas, zero-touch 15 tablas. Aplicación: 1 llamada Management API (transacción única), **HTTP 201**. POST: **cambios = 2 ACL** (los REVOKE exactos), 0 md5, 0 headers, 0 otras funciones, 0 tablas/RLS/policies → **EXPECTED CHANGES ONLY**. Zero-touch: **15/15 PRE==POST** (rows+SUM+MAX(created_at)) → mutación de datos: **0**. Smoke no destructivo: service_role `current_user_tenant_id` → 200 `null`; service_role 3-arg → 200 `false` (trusted branch); anon ×4 probes → **401/42501 DENY**; `GET /` → 200; PM2 costpro **online, 0 restarts**.

## 11. Secret scan (§24)

1 hit en repo (`token: 'test-access-token-123'` en test) → PLACEHOLDER/TEST-REFERENCE; 0 hits en el evidence pack. 0 secretos activos. El precedente RES-4B-3 (fragmento PAT truncado no utilizable) permanece como higiene documental, sin secretos activos.

## 12. Residuales y contención

RES-4B-3 (PAT truncado, higiene documental) y RES-4B-4 (rama legacy con sujeto ligado al caller, P3) quedan heredados sin cambio — ninguno afecta la cadena de autorización de este gate. Ningún finding nuevo fuera de alcance.

## 13. Git y veredicto

Commit único con evidence pack; push a origin/main; HEAD == origin/main; worktree clean; `gate-closure-check.sh` → CLOSURE OK; staging efímero destruido.

## VEREDICTO

**CERTIFIED — EXECUTE ACL HARDENED**

Cadena demostrada: LIVE ACL (4 overloads) → COMPLETE CALLER CENSUS (49 policies + 8 SECDEF + 0 app/browser) → LEGITIMATE CONTRACT IDENTIFIED (authenticated requerido solo donde policies lo exigen) → UNAUTHORIZED EXPOSURE REPRODUCED (anon=true PRE en 2 overloads; 36 casos) → MINIMAL ACL FIX (3 REVOKE, 0 GRANT, DCL-only) → ATTACK DENIED (4/4 deltas = neutralizaciones; 42501 en catálogo y borde HTTP) → LEGITIMATE CALLERS PASS (32/32 idénticos) → SECURITY CONTRACT PASS (134/134 ×2) → PRODUCTION EXPECTED-CHANGE-ONLY (2 ACL, 0 resto) → ZERO-TOUCH PASS (15/15) → EVIDENCE HASH VERIFIED (MANIFEST) → REMOTE SYNCHRONIZED → WORKTREE CLEAN → CLOSURE OK.
