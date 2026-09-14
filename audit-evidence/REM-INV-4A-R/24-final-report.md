# REM-INV-4A-R — FINAL REPORT (§54)
## Supervisor Authorization Bypass & `audit_logs` ACL Hardening

| Campo | Valor |
|---|---|
| Gate | REM-INV-4A-R (remediación de REM-INV-4A) |
| Baseline | `751a5c01d618ff1dea540dd7d7a1e7ee3fbcb071` (HEAD == origin/main, worktree clean — `00-baseline.txt`) |
| Producción | Supabase PG 17.6 — solo lectura (audit) + DDL/DCL quirúrgico (RC-1/RC-2) vía Management API |
| Staging | PostgreSQL 17.6 efímero local (puerto 5433) — `create_sale_v2` + helpers verbatim LIVE; `audit_logs` con estructura/ACL/RLS réplica (`relacl` byte-idéntico, md5(prosrc) idéntico) |
| Secuencia | AUDIT → REPRODUCE → DESIGN → STAGING FIX → STAGING RE-ATTACK → REGRESSION → PROD PRECONDITIONS → PROD REMEDIATION → PROD RE-VERIFICATION → ZERO-TOUCH → EVIDENCE → COMMIT → PUSH → CLOSURE |
| Cambios | 2 objetos DB (create_sale_v2, audit_logs ACL) + 4 archivos src modificados + 3 archivos src nuevos + 1 migration |
| UNEXPECTED CHANGES | **0** (diff completo de catálogo: 484 funciones y 146 relacl, exactamente 2 diffs esperados — `14-production-post-catalog.txt`) |
| Zero-touch | **PRE == POST** en 14 tablas de negocio (`19-zero-touch-diff.txt`) |
| Regresión | tsc 0 errores · vitest **2070 passed / 24 skipped** (== baseline REM-INV-4A) · lint 0 errores (1291 warnings pre-existentes) · security-contract **134/0** post-fix (`20-full-regression.txt`) |
| Secret scan | 0 hits; `.env` gitignored y no trackeado (`22-secret-scan.txt`) |

---

## RC-1 — Supervisor authorization bypass (P1 → CLOSED)

1. **¿Cuál era exactamente el vector D4/D5?** — `create_sale_v2` §11 validaba el gate de descuento ≥15% con `has_store_role_as(p_supervisor_user_id, p_store_id, ARRAY['admin','manager'])` donde `p_supervisor_user_id` era CLIENT_CONTROLLED. Un clerk autenticado citaba el UUID de un admin (D4: mismo tenant; D5: **cross-tenant**) vía RPC directo (EXECUTE PUBLIC/authenticated) y la venta con descuento 20% se persistía. Reproducido en staging PRE-fix: D4/D5/D5b = `*** EXPLOITABLE — SPOOF SUCCESS ***` con deltas de 1 transaction + 1 stock_movement + 1 audit_log cada uno (`04-staging-prefixed-exploit.txt`).

2. **¿Por qué `has_store_role` no era el verdadero defecto?** — Los helpers verifican membresías reales contra identidad server-side (`auth.uid()`; el 3-arg ignora `p_user_id` bajo authenticated — patrón H-7). El defecto estaba en el **caller** que suministraba una identidad client-controlled a `_as`. REM-INV-4A ya lo había clasificado así; este gate lo confirma con el fix.

3. **¿Dónde estaba el trust boundary roto?** — En la frontera servidor/DB: el cliente decidía la identidad del supervisor y el RPC la aceptaba como prueba de autorización. La doctrina exige que la identidad provenga del JWT firmado por la plataforma (`auth.uid()`) o del canal server↔server (`service_role`).

4. **¿Qué parámetro era client-controlled?** — `p_supervisor_user_id` (y por la misma vía el route `/api/pos/checkout`, que reenviaba el UUID del cliente a través de service_role sin verificación).

5. **¿Cómo se cerró?** — Dos mitades coordinadas (03-rc1-design.md):
   - **DB**: bajo `authenticated`, solo se acepta el propio `auth.uid()` como supervisor (identidad criptográficamente verificable); cualquier UUID foráneo exige `auth.role()='service_role'`. El check `has_store_role_as` se conserva (rol real en la tienda).
   - **App**: `supervisor-check` emite token HMAC (liga supervisor+operador+tienda, TTL 300s); `checkout` verifica firma/expiración/binding con `timingSafeEqual` antes de reenviar el UUID; el POS transporta y consume la prueba (1 venta por autorización).

6. **¿El RPC directo quedó protegido?** — SÍ (§13/§46): staging POST-fix ejecuta exactamente `authenticated → create_sale_v2 → arbitrary p_supervisor_user_id` → `ERR_SUPERVISOR_UNAUTHORIZED` (A4/A5/A6/A7/A9; D4/D5 re-ejecutados quedan DENY).

7. **¿Cross-tenant quedó bloqueado?** — SÍ: A7 (UUID admin T2 en venta T1) → DENY; §26 inverso (UUID admin T1 en venta T2) → `ERR_SUPERVISOR_UNAUTHORIZED`. El token además está ligado a la tienda (STORE_MISMATCH). Caso documentado: un global admin autenticado con SU PROPIA identidad puede auto-autorizarse (admin-bypass tenant-blind es semántica pre-existente de `has_store_role_as`, identidad server-verificada, fuera de alcance — registrado x5).

8. **¿El flujo legítimo de supervisor continúa funcionando?** — SÍ, y quedó REPARADO: A8a (manager self-authorized) PASS; A8b (route service_role + operator≠supervisor con prueba válida) PASS. Antes del gate el flujo UI ≥15% era fail-closed (el modal descartaba el UUID); ahora la prueba viaja ligada a la venta.

9. **¿Se preservó la atomicidad?** — SÍ (A10): cada DENY (A3-A7, A9) dejó 0 deltas en transactions/transaction_items/payment_transactions/stock_movements/audit_logs y stock de producto intacto; la excepción PL/pgSQL aborta la transacción completa.

10. **¿Se introdujo alguna nueva superficie de confianza?** — Mínima y evaluada: el token HMAC reutiliza `NEXTAUTH_SECRET` (sin nuevos secretos ni objetos DB); firma sobre payload acotado, verificación constant-time. Residuales documentados (P3): replay del token por el mismo operador/tienda dentro del TTL (modelo estándar de caché de aprobación POS); `sync/batch` con UUID foráneo offline → fail-closed. Nada de esto reabre el vector remediado.

---

## RC-2 — `audit_logs` ACL (P1-latente → CLOSED)

11. **¿Qué ACL tenía `audit_logs`?** — `postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm, costpro_transaction_adjuster=a, costpro_snapshot_restorer=a` (8 privilegios para anon/authenticated; `07-pre-rc2-acl.tsv`).

12. **¿Qué privilegios fueron revocados?** — `DELETE, UPDATE, TRUNCATE, MAINTAIN` de `anon` y `authenticated` (exactamente 2 statements REVOKE, sin CASCADE, sin REVOKE ALL).

13. **¿Por qué esos privilegios no eran necesarios?** — Los 68 writers LIVE son INSERT-only (censo REM-INV-4A re-verificado); no existe ruta legítima authenticated/anon de mantenimiento o borrado del trail; UPDATE/DELETE ya eran inoperantes por RLS; TRUNCATE no es invocable por ninguna función (0/484). El GRANT solo sostenía la capacidad destructiva latente.

14. **¿RLS permaneció intacto?** — SÍ (§19): `relrowsecurity=true`, `relforcerowsecurity=false`, 3 policies idénticas (B8; catálogo POST).

15. **¿TRUNCATE quedó bloqueado?** — SÍ: staging B5 `permission denied for table audit_logs` (ACL, el punto de control correcto); LIVE verificado por catálogo (`arxt`, sin D) — sin ejecutar TRUNCATE en producción (§39).

16. **¿DELETE quedó bloqueado?** — SÍ: B4 `permission denied` (antes `DELETE 0` solo por RLS).

17. **¿UPDATE quedó bloqueado?** — SÍ: B3 `permission denied` (antes `UPDATE 0` solo por RLS).

18. **¿INSERT legítimo continúa funcionando?** — SÍ: B2 INSERT 1 con `user_id = auth.uid()` (policy intacta); el INSERT de `create_sale_v2` (SECDEF postgres) sin cambio; 68 writers preservados.

19. **¿service_role continúa funcionando?** — SÍ: B7 INSERT/SELECT/DELETE (limpieza G11) sin cambios; su `arwdDxtm` intacto; postgres (owner) intacto.

---

## Integridad

20. **¿Cuántos objetos cambiaron?** — **EXACTAMENTE 2 en DB**: `public.create_sale_v2` (solo §11 del cuerpo; firma/SECDEF/search_path/proacl byte-preserve — md5 `7edb09b6…`→`3f6953a5…`, `44-hashes.json`) y `public.audit_logs` relacl (`arwdDxtm`→`arxt` para anon/authenticated). Diff de catálogo completo (484 funciones × md5/secdef/proacl + 146 relacl): 2 diffs, 0 inesperados. En repo: 1 migration nueva + 4 archivos modificados + 3 nuevos (07/03-rc1-design).

21. **¿Cuántos datos productivos cambiaron?** — **0**: zero-touch PRE == POST en las 14 tablas de negocio (LIVE no tiene tabla `payments` separada; el footprint de pagos es `payment_transactions`; `19-zero-touch-diff.txt`). Las únicas filas escritas durante el gate fueron en staging.

22. **¿Hubo algún cambio fuera de alcance?** — NO (§45): el diff de catálogo demuestra que RC-3..RC-6 y el resto de objetos permanecen idénticos; los residuales quedan registrados, no reparados (§55).

23. **¿Tests?** — `npx tsc --noEmit` 0 errores; `npm test` 2070 passed / 24 skipped (idéntico al baseline REM-INV-4A — 0 fallos nuevos); `npm run lint` 0 errores / 1291 warnings pre-existentes. Los tests que escanean migraciones históricas (PT-RLS.6.1, PT-11.5.11) quedan intactos porque solo examinan migraciones específicas anteriores.

24. **¿Security contract?** — **134 funciones verificadas / 0 violaciones** post-fix (el nuevo cuerpo de `create_sale_v2` conserva el guard anti-spoofing `auth.role()='service_role'`, `SET search_path`, y no otorga EXECUTE a anon — `21-security-contract.txt`).

25. **¿Secret scan?** — 0 hits sobre los 8 archivos a commitear; sin tokens/PATs/keys en evidence; `.env` gitignored y no trackeado (`22-secret-scan.txt`).

26. **¿Git closure?** — Commit único descriptivo `fix(security): close supervisor authorization bypass and audit_logs ACL hardening (REM-INV-4A-R RC-1+RC-2)`; push a origin/main; `HEAD == origin/main`, `WORKTREE CLEAN`; `scripts/gate-closure-check.sh` → `CLOSURE OK`; PM2 ONLINE, HTTP 200, `.env` intacto, reset survival PASS (§52/§53).

27. **¿Verdict final?** —

> ## **CERTIFIED — P1 REMEDIATED**
>
> - D4/D5 (exploit original) reprodujeron ALLOW en staging PRE-fix y quedaron **DENY** POST-fix.
> - La prueba definitiva del §55 se cumple: `arbitrary supervisor UUID → create_sale_v2 ≥15% → DENY` (directo RPC **y** vía API sin prueba) y `authenticated → TRUNCATE audit_logs → DENY`.
> - El flujo legítimo (venta normal, <15%, supervisor con prueba válida, service_role logging) sigue funcionando; la integridad productiva demostró zero-touch; la remediación es mínima y verificable por catálogo.

---

## Prueba definitiva (§55)

```
ANTES (staging PRE, reproducido)
attacker (authenticated clerk)
  ↓ p_supervisor_user_id = UUID admin (cualquier tenant)
create_sale_v2 §11 → has_store_role_as → admin-bypass → TRUE
  ↓
DISCOUNT 20% → ALLOW  (venta persistida: tx+stock+audit)   [D4/D5 EXPLOITABLE]
authenticated → TRUNCATE audit_logs → SUCCESS (4 filas → 0) [G7 CATASTROPHIC]

DESPUÉS (staging POST + catálogo LIVE)
attacker (authenticated clerk)
  ↓ p_supervisor_user_id = UUID admin (cualquier tenant)
create_sale_v2 §11 → auth.role()<>'service_role' AND uuid≠auth.uid()
  ↓
ERR_SUPERVISOR_UNAUTHORIZED → DENY (transacción abortada, 0 efectos)  [A4-A7, A9, §26]
authenticated → TRUNCATE audit_logs → permission denied (ACL)          [B5]
authenticated → DELETE / UPDATE → permission denied (ACL)              [B4/B3]
authenticated → VACUUM → permission denied (PG17 NOTICE, no ejecutado) [B6]
```
