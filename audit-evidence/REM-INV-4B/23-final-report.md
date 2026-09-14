# REM-INV-4B — Informe Final: Residual Authorization Surface & Cross-Store Enumeration

**Baseline:** `e2e2a19e` (HEAD == origin/main, worktree clean — ver 00-baseline.txt)
**Fecha:** 2026-09-15 · **Producción:** Supabase project `wthkddeleylijmonclxg` (acceso solo-lectura durante diagnóstico; única excepción: remediación DDL autorizada tras gates)
**Objeto:** `get_transferable_stores` → uso de `has_store_access_as` con `p_user_id` controlable por el caller.

---

## 1. Respuesta directa al objetivo final

> **¿Puede un usuario autenticado manipular `p_user_id` de `get_transferable_stores` para enumerar tiendas, memberships o información de otro usuario/tenant, directa o indirectamente, y si existía esa posibilidad, quedó realmente neutralizada sin romper los flujos legítimos?**

**SÍ existía la posibilidad y SÍ quedó neutralizada.** En PRE, cualquier usuario `authenticated` podía llamar directamente al RPC con `p_user_id` arbitrario y obtener las filas completas de `public.stores` de CUALQUIER usuario — mismo tenant (E2), otro tenant (E3), o TODO el sistema con un solo UUID de admin (LEG-2) — incluyendo el caso sin conocimiento previo de UUIDs foráneos (LEG-1, vía rama legacy). Tras RC-3, los 11 vectores de ataque devuelven `P0001 ERR_TRANSFERABLE_STORES_UNAUTHORIZED`, el oráculo de membresía E8 quedó indistinguible (ERR vs ERR), y los flujos legítimos (E1a, E1b, E6c) permanecen byte-a-byte idénticos. Evidencia: 07 (PRE), 10 (POST), 15/19/20 (producción), 16/17/18 (zero-touch).

## 2. Censo forense (Gates B/E)

Las 8 funciones in-scope son `SECURITY DEFINER`, owner `postgres` (ver 01/02/03). Exposición EXECUTE LIVE PRE: `get_transferable_stores(uuid,uuid)` → `authenticated`+`service_role`; `has_store_access_as` y `has_store_role_as` → solo `service_role` (revocados de anon/authenticated por el hardening w9_f06 previo); `has_store_role(uuid,uuid,text[])` y `current_user_tenant_id()` conservan PUBLIC (residuales RES-4B-1/2, fuera de alcance). En LIVE **ninguna función SQL llama a `get_transferable_stores`** (0 callers prosrc): es una hoja expuesta solo al frontend.

## 3. Flujo real y respuestas C1–C8 (Gate C)

- **C1:** Sí — `p_user_id` y `p_current_store_id` llegan por parámetro RPC desde el cliente.
- **C2:** El parámetro representa al sujeto cuya autorización se evalúa; el caller puede ser otro.
- **C3:** NO — la función no compara `p_user_id = auth.uid()` (definición verbatim en 02).
- **C4:** Nada impedía que U1 consultara U2: el RPC es directamente alcanzable vía PostgREST con un JWT válido.
- **C5:** Sí — `has_store_access_as` confía ciegamente en su `p_user_id` (evalúa perfiles/memberships del sujeto dado, con bypass admin del **sujeto**).
- **C6:** Sí — `auth.uid()` está disponible y es el patrón del propio código (`is_store_member`, `current_user_store_ids`, y el gate RC-1 de `create_sale_v2`).
- **C7:** `SECURITY DEFINER` con `SET search_path TO 'public'` (header preservado intacto por el fix).
- **C8:** Demostrado, no asumido: como INVOKER, RLS de `stores` limita a USER_A a STORE_A1 (C8-rls-invoker); por la vía DEFINER la misma sesión ve tiendas ajenas (C8-definer-bypass, PRE). RLS **no** protege una función SECURITY DEFINER.

## 4. Ataques (Gate F, staging PG 17.6, fidelidad md5+ACL == LIVE)

| Caso | PRE | POST |
|------|-----|------|
| E1a/E1b (propio usuario) | ALLOW correcto | ALLOW (sin cambios) |
| E2/E2b (mismo tenant, otro usuario) | ALLOW → filas de USER_B | **DENY** |
| E3 (cross-tenant) | ALLOW → STORE_B2 | **DENY** |
| E4 (UUID inexistente) | ALLOW vacío silencioso | **DENY** |
| E5 (NULL) | ALLOW vacío silencioso | **DENY** |
| E6 (UUID admin global como sujeto) | ALLOW → tiendas foráneas | **DENY** (E6c admin-como-caller: PASS) |
| E7 (direct RPC sin capa app) | ALLOW | **DENY** |
| E8 (oráculo 1 vs 0 filas) | ORACLE PRESENTE | **NO DISCLOSURE** (ERR vs ERR) |
| LEG-1 (rama legacy, cross-tenant sin UUID previo) | ALLOW | **DENY** |
| LEG-2 (sujeto admin → TODAS las tiendas) | ALLOW | **DENY** |

Clasificación PRE: **P1** (§11: enumeración significativa cross-user/cross-tenant + bypass de autorización; `create_transfer` no es alcanzable por esta vía — la superficie es de lectura, lo que la hace P1 y no P0).

## 5. Root cause (Gate G)

```
caller (authenticated, JWT → auth.uid()=U1)
  → PostgREST rpc get_transferable_stores(p_user_id=VÍCTIMA, p_current_store_id=X)
  → SECURITY DEFINER (postgres) → RLS de stores BYPASSED
  → tenant derivado de p_current_store_id suministrado (inexistente → rama legacy, sin filtro tenant)
  → has_store_access_as(p_user_id, s.id) evalúa al SUJETO suministrado
  → identidad del caller nunca vinculada al sujeto
  → enumeración cross-user / cross-tenant de filas completas
```
La identidad autoridad es la del JWT firmado por la plataforma; el código usaba la identidad provista por el cliente. La trust boundary se rompe en el borde del parámetro RPC. "La API valida" no aplica: no hay wrapper server-side, la base de datos debe proteger su propio contrato (E7).

## 6. Fix (Gates H/I — Opción C del §13)

Reutilización del patrón RC-1 validado en REM-INV-4A-R (mismo proyecto, misma doctrina): gate de identidad al inicio del body — bajo `authenticated`, `p_user_id IS DISTINCT FROM auth.uid()` → `RAISE EXCEPTION 'ERR_TRANSFERABLE_STORES_UNAUTHORIZED'`; `auth.role() = 'service_role'` (ruta confiable de servidor, con prueba de credenciales aguas arriba) exceptuado. Se verificó antes (§14) que NO existe caso legítimo admin→otro-usuario: el único caller de producción (`CreateTransferModal` → `useTransferableStores` → `transfer-service`) pasa siempre el `user.id` de sesión. Diferencia total del fix: **+10 líneas** (diff en prod-apply/15); firma, header, proacl, owner, search_path intactos. La Opción A (eliminar el parámetro) se descartó: rompería la firma PostgREST consumida por el frontend sin necesidad. Atomocidad §16: la función es de solo lectura; suite completa PRE/POST sin mutaciones (ATOMICITY ok).

## 7. Regresión (Gate J + §24/§25)

`tsc --noEmit` 0 errores · vitest 2070 passed/24 skipped (== baseline 4A-R) · lint 0 errores/1291 warnings pre-existentes · security-contract **134/134** PRE y POST-apply. Staging: md5 de las otras 7 funciones in-scope idéntico PRE/POST; helpers `has_store_role` 2-arg/3-arg, `current_user_store_ids`, `current_user_tenant_id`, `is_global_admin` sin drift (casos L-*). Cross-store/cross-tenant POST: denials uniformes con mensaje idéntico (sin diferencial informativo).

## 8. Producción (Gates M + §21/§22/§23)

Precondiciones: HEAD==origin/main==e2e2a19e; sin drift concurrente (censo 8 funciones == snapshot; md5 PRE == `bfd8a24b`); solo artefactos del gate en el worktree. Aplicación: migración `20260915000002` vía Management API, HTTP 201, pre-checks duros (1 CREATE OR REPLACE, cero DDL/DCL fuera del body). Verificación POST: **1 objeto cambiado** (el objetivo), **0 ACL**, **0 headers**, RLS/policies/triggers intactos (15/19/20). Re-verificación sin ataque destructivo: hash LIVE == hash staging probado (equivalencia de comportamiento por código byte-idéntico) + smoke positivo service_role HTTP 200. Zero-touch: **15/15 tablas** (rows + SUM + MAX(created_at)) PRE == POST → mutación de datos: **0**.

## 9. Secret scan (§26)

0 secretos reales en repo/evidencia/scripts (13). Clasificados: placeholders de test, auto-referencias de patrones, y un fragmento TRUNCADO no utilizable de un PAT en docs viejos (RES-4B-3, pre-existente, higiene futura).

## 10. Residuales documentados (regla de contención)

RES-4B-1 (`has_store_role` 3-arg PUBLIC EXECUTE), RES-4B-2 (`current_user_tenant_id` PUBLIC), RES-4B-4 (rama legacy con sujeto ya vinculado al caller, sin disclosure de terceros). Ninguno bloquea la certificación aislada de RC-3; recomendados para el próximo gate de ACL.

## 11. Cierre Git y veredicto

Commit único con migración + evidence pack; push a `origin/main`; HEAD == origin/main; worktree clean; `gate-closure-check.sh` → CLOSURE OK; PM2 online (0 restarts) y HTTP 200 verificados tras el push.

## VEREDICTO

**CERTIFIED — RESIDUAL AUTHORIZATION CLOSED**

Cadena demostrada: ATTACK BEFORE = EXPLOITABLE → ROOT CAUSE = IDENTIFIED → FIX = MINIMAL (+10 líneas, patrón ya validado) → ATTACK AFTER = DENIED (11/11) → LEGITIMATE FLOW = PASS → DIRECT RPC = PROTECTED → NO SIDE EFFECTS → REGRESSION = PASS → PRODUCTION CATALOG = EXPECTED ONLY (1 objeto) → ZERO-TOUCH = PASS (15/15) → EVIDENCE = HASH VERIFIED (24) → REMOTE = SYNCHRONIZED → WORKTREE = CLEAN → CLOSURE OK.
