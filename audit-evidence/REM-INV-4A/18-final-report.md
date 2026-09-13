# REM-INV-4A — FINAL REPORT
## Authorization Spoofing (`has_store_role`) & `audit_logs` ACL Forensic Certification

| Campo | Valor |
|---|---|
| Gate | REM-INV-4A |
| Baseline | `5f927364ab81d90ffe07ab6a5d33b8f47d932807` (HEAD == origin/main, tracked tree clean — `00-baseline.txt`) |
| Producción | Supabase PG **17.6** — acceso **solo lectura** (Management API /database/query, guard SELECT-only client+server) |
| Staging | PostgreSQL **17.6** efímero local (puerto 5433) — cuerpos de función **verbatim** desde `pg_get_functiondef` LIVE + ACLs replicadas |
| Zero-touch | **PRE == POST** en 17 secciones / 15 tablas de negocio (`14-zero-touch-pre.json`, `15-zero-touch-post.json`) |
| Regresión | tsc 0 errores · vitest 2070 passed/24 skipped · lint 0 errores (1291 warnings pre-existentes) · security-contract 134/0 (`16-regression.txt`) |
| Secret scan | 33 archivos — 0 credenciales (`17-secret-scan.txt`) |
| Fecha | 2026-09-13 |

---

## F-04-A — Authorization / `has_store_role`

### Modelo LIVE de autorización (cadenas verificadas)

**Helpers inventariados** (`01`, `02`, `03`): `has_store_role(uuid,text[])` y `has_store_role(uuid,uuid,text[])`, `has_store_role_as(uuid,uuid,text[])`, `has_store_access(uuid)`, `has_store_access_as(uuid,uuid)`, `current_user_store_ids()`, `is_admin()`, `is_global_admin()`, `current_user_tenant_id()` — todos `SECURITY DEFINER` owner `postgres`.

**Clasificación de parámetros** (§8):

| Función | Parámetro | Clase | Participa en decisión de autorización |
|---|---|---|---|
| `has_store_role(uuid,text[])` | `p_store_id` | CLIENT_CONTROLLED | Sí — pero solo selecciona *sobre qué membership propia* se consulta |
| `has_store_role(uuid,text[])` | `p_roles` | CLIENT_CONTROLLED | Sí — pero filtrado contra memberships reales de `auth.uid()` |
| — | identidad | **SERVER_CONTROLLED** (`auth.uid()` ← JWT GUC firmado por plataforma) | Sí |
| `has_store_role(uuid,uuid,text[])` | `p_user_id` | CLIENT_CONTROLLED | **NO bajo authenticated** — cuerpo: `CASE WHEN auth.role()='service_role' THEN p_user_id ELSE auth.uid()` (H-7 aplicado, cuerpo LIVE == Git 20260820000001 **byte-idéntico**) |
| `create_sale_v2` | `p_supervisor_user_id` | CLIENT_CONTROLLED | **SÍ — SIN GATE** → F-04-A2 (P1) |
| `get_transferable_stores` | `p_user_id` | CLIENT_CONTROLLED | **SÍ — SIN GATE** → F-04-A3 (P2) |

**Verificación LIVE↔Git de la familia** (`raw/git-vs-live-body-hashes.json`, comparaciones normalizadas):
- `has_store_role` 2-arg: LIVE md5 `bf4b1761…` == Git final 20260627000001 → **idénticos** (el "Git final 20260820000001" del register F-04 de REM-INV-4 solo añadía la sobrecarga 3-arg; el 2-arg no fue modificado → atribución de versión de F-04 corregida en este gate: **no existe fix pendiente para el cuerpo 2-arg**).
- `has_store_role` 3-arg: LIVE == Git H-7 20260820000001 → **byte-idénticos** (el fix del cuerpo SÍ está desplegado; solo su cláusula ACL `REVOKE FROM anon` no se aplicó — ver A5).
- `has_store_role_as`: LIVE == Git 20260807000002 → idénticos. `has_store_access`: LIVE == Git 20260527094858 salvo 2 comentarios (semántica idéntica). `has_store_access_as`: idéntico.

### Respuestas F-04-A (§38)

1. **¿`has_store_role` es spoofeable?** — **NO.** Las dos sobrecargas y `_as` (vía ACL) son no-spoofeables (matriz completa en `07`; staging `08`). El patrón vulnerable real se encontró **fuera** de `has_store_role`: en los *callers* que pasan parámetros de usuario crudos (`create_sale_v2`, `get_transferable_stores`, 4 RPCs de servicios).
2. **¿Qué parámetros son client-controlled?** — `p_store_id`, `p_roles` (2-arg); `p_user_id`, `p_store_id`, `p_roles` (3-arg); `p_supervisor_user_id` y `p_user_id` en `create_sale_v2`; `p_user_id` en `get_transferable_stores`. Bajo `authenticated`, los 3-arg ignoran `p_user_id` (rama gated).
3. **¿Puede alterarse `user_id`?** — En `has_store_role` 2-arg no existe; en 3-arg el parámetro se ignora bajo authenticated (S-A1: `false`; S-A3 fallback a `auth.uid()`); en `create_sale_v2` el `p_user_id` está gated (D8: atribución correcta al caller real); en `get_transferable_stores` y en `p_supervisor_user_id` **sí es alterable y SÍ influye** (E2/E3, D4/D5).
4. **¿Puede alterarse `store_id`?** — Pasarlo no otorga nada: solo consulta la membership del `auth.uid()` en esa tienda (S-B/S-H: DENIED). Cross-store write real bloqueado (D7: `ERR_UNAUTHORIZED`, §30 cumplido).
5. **¿Puede alterarse `role`?** — `p_roles` filtra roles que el usuario ya tiene (S-C/S-U: DENIED). El spoof efectivo de rol ocurre vía `p_supervisor_user_id` citando un admin (D4/D5).
6. **¿Dependencia insegura de JWT claims?** — **NO.** `auth.uid()`/`auth.role()` leen `request.jwt.claims`, GUC que PostgREST establece **tras verificar la firma criptográfica** del JWT (el cliente no puede fijarlo). F1 (simulación etiquetada) confirma que los helpers confían en el GUC: la frontera de confianza es la plataforma, no PostgreSQL.
7. **¿Existe SECURITY DEFINER?** — Sí, todos los helpers (owner `postgres`), como es estándar para helpers de RLS. Los 4 RPCs de servicios sin gate son SECDEF también (su riesgo es de atribución, no de escalación).
8. **¿Search_path inseguro?** — **NO.** Referencias 100% schema-qualified en todos los helpers auditados; `search_path` pinned (`public, pg_temp`); los dos con `public` solo (`current_user_store_ids`, `has_store_access_as`) usan calificación completa → sin superficie de hijack de objetos temporales.
9. **¿Autorización cross-store?** — **BLOQUEADA** en la función y en el caller gate (D7). Residuo cross-*tenant* en `has_store_role_as`: el admin-bypass es tenant-blind, pero solo alcanzable con EXECUTE service_role… **excepto** cuando el caller interno le pasa un parámetro client-controlled (caso D5: supervisor cross-tenant).
10. **¿Caller real desde la aplicación?** — `has_store_role`: 0 llamadas directas `.rpc()` en src/ (solo comentarios; 6 ref. documentales); se ejecuta **dentro** de la DB (168 policies RLS + RPCs). `create_sale_v2`: llamado por `POST /api/pos/checkout` y `/api/sync/batch` con service_role, y **invocable directamente por el browser** (anon key + JWT en `supabaseClient.ts`, EXECUTE=PUBLIC). `get_transferable_stores`: llamado desde `transfer-service.ts` **con el cliente browser**.
11. **¿Impacto financiero/inventario?** — **SÍ (F-04-A2)**: aprobación de descuentos ≥15% evadible → impacto financiero directo por descuentos no autorizados (control SOX-like de supervisión de pricing). Sin impacto de inventario demostrado.
12. **¿P0/P1/P2/P3?** — `has_store_role` en sí: **no explotable** (n/a). `create_sale_v2` supervisor gate: **P1**. `get_transferable_stores`: **P2**. 4 RPCs de servicios (atribución): **P2**. EXECUTE PUBLIC en 3-arg: **P3**.

### Cadena de explotación demostrada (P1 — reproducida en staging)

```
ATTACKER: clerk autenticado legítimo, member activo de Store A
   ↓ ATTACKER CONTROL
p_supervisor_user_id = <cualquier UUID con profiles.role='admin'|'superadmin'> (cualquier tenant)
   ↓ INPUT / PARAMETER
POST /api/pos/checkout (el route pasa el UUID tal cual; zod solo valida formato)
   —o— PostgREST RPC create_sale_v2 directo (EXECUTE=PUBLIC, anon key + JWT del usuario)
   ↓ FUNCTION
create_sale_v2 §11 → has_store_role_as(p_supervisor_user_id, p_store_id, ['admin','manager'])
   → admin-bypass tenant-blind → TRUE (falso positivo de autorización)
   ↓ AUTHORIZATION DECISION
gate de descuento ≥15% → PASA sin credenciales de supervisor
   ↓ DATABASE OPERATION
venta persistida con discount_pct=20 (staging D4/D5; atribución del caller correcta — D8)
   ↓ BUSINESS IMPACT
Control financiero de aprobación de descuentos EVADIDO (P1)
```

---

## F-04-B — `audit_logs`

### ACL LIVE (catálogo, `09-audit-logs-acl.tsv`)

`relacl` = `{postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres, costpro_transaction_adjuster=a/postgres, costpro_snapshot_restorer=a/postgres}` — verificado además con `has_table_privilege` por rol (8 privilegios × 5 roles, incluye MAINTAIN PG17).

### Respuestas F-04-B (§38)

13. **SELECT**: anon ✓, authenticated ✓, service_role ✓, postgres ✓, PUBLIC ✗.
14. **INSERT**: anon ✓ (ACL; RLS lo bloquea — sin policy para anon), authenticated ✓ (policy `audit_logs_insert_authenticated`), service_role ✓, costpro_transaction_adjuster ✓ (solo insert), costpro_snapshot_restorer ✓ (solo insert).
15. **UPDATE**: anon ✓(ACL), authenticated ✓(ACL), service_role ✓, postgres ✓ — **efectividad vía RLS: bloqueado** (Q20).
16. **DELETE**: mismos grants de ACL — **efectividad vía RLS: bloqueado** (Q19).
17. **TRUNCATE**: anon ✓, authenticated ✓, service_role ✓ (ACL) — **RLS NO protege TRUNCATE** (Q21); el control efectivo es solo el GRANT.
18. **MAINTAIN (PG17)**: anon ✓, authenticated ✓, service_role ✓. Permite VACUUM/ANALYZE/CLUSTER/REINDEX/REFRESH MV sobre la tabla (probado: `VACUUM` como clerk → SUCCESS, fingerprint de datos inalterado). Es privilegio *existe* y *es ejecutable a nivel SQL* por authenticated — pero no altera integridad; impacto máximo: operaciones de mantenimiento (disponibilidad/rendimiento) y solo por ruta SQL directa. Sin necesidad legítima identificada para anon/authenticated → hardening.
19. **¿RLS protege DELETE?** — **SÍ.** Sin policy DELETE → deny-by-default → `DELETE 0` (staging G6, G10c). (En producción, ruta PostgREST idéntica semánticamente.)
20. **¿RLS protege UPDATE?** — **SÍ.** Sin policy UPDATE → `UPDATE 0` (staging G5).
21. **¿RLS protege TRUNCATE?** — **NO.** RLS no aplica a TRUNCATE; con el GRANT presente, authenticated ejecuta `TRUNCATE audit_logs` → SUCCESS y trail a 0 filas (staging G7). Control negativo G9: rol sin grant → `permission denied` ⇒ **el GRANT es el único punto de control**.
22. **¿Puede authenticated destruir el audit trail?** — **A nivel de autorización PostgreSQL: SÍ (demostrado en staging G7 — destrucción completa).** A nivel de superficie cliente real HOY: **NO alcanzable** — PostgREST no expone TRUNCATE, y 0/484 funciones públicas ejecutan TRUNCATE o DELETE sobre `audit_logs` (censo `11`); anon/authenticated no son login roles. Es una **capacidad latente P1** sostenida únicamente por el GRANT y la ausencia de superficie.
23. **¿Puede modificar el trail?** — Registros históricos: **NO** vía cliente (RLS bloquea UPDATE/DELETE). Puede **apendar entradas falsas**: INSERT con `user_id=auth.uid()` (policy) + **`store_id` de CUALQUIER tienda** (FK existe, sin membership check) + action/metadata arbitrarios (staging G4 = ALLOWED-DANGEROUS: *audit pollution*). user_id foráneo sí bloqueado (G3).
24. **¿Caller legítimo que requiera DELETE/UPDATE/TRUNCATE/MAINTAIN por authenticated?** — **NO.** Los 68 escritores LIVE de `audit_logs` son INSERT-only (censo client-side de 484 cuerpos); no existe ruta de mantenimiento authenticated; los roles dedicados `costpro_*` son INSERT-only. No asumido — verificado.
25. **¿Impacto?** — `audit_logs` alimenta: **SECURITY FORENSICS** (investigación de incidentes — REM-INV-*), **COMPLIANCE/FISCAL** (evidencia de operaciones de venta/pagos/anulaciones) y **BUSINESS AUDIT**. Destrucción total ⇒ pérdida de trazabilidad financiera y forense. Pollution ⇒ contaminación de evidencia (integridad de autenticidad).
26. **¿P0/P1/P2/P3?**
   - **P1 (latente, grant-level)**: TRUNCATE por anon/authenticated — "audit trail destruction" del §26 existe a nivel de autorización SQL (G7) pero la reachability por cliente NO está demostrada ⇒ **no P0** ("reachable by unprivileged attacker" no satisfecho); se clasifica **P1-latente** y requiere investigación/remediación inmediata (§27).
   - **P2**: (a) grants excesivos arwdDxtm anon+authenticated (insider/SQL-directo → consistente con F-05/F-14 de REM-INV-4); (b) audit pollution vía INSERT (G4); (c) `get_transferable_stores` info disclosure; (d) atribución falsificable en 4 RPCs de servicios.
   - **P3**: EXECUTE PUBLIC residual en 3-arg; observación RLS-SELECT de clerks (G1).

---

## Veredicto (§39)

> ### **NOT READY — P1 SECURITY FINDING**

Justificación: se demostró explotación real por usuario no privilegiado (authenticated) en staging con cadena completa del §40:
1. **F-04-A2 (P1)** — bypass del gate de supervisión de descuentos en `create_sale_v2` (financial control): D4/D5 SPOOF SUCCESS, D8 atribución íntegra (efecto parcial no observado, §29).
2. **F-04-B3 (P1-latente)** — `authenticated` puede `TRUNCATE audit_logs` a nivel SQL (G7); RLS no es protección para TRUNCATE (G9); la única barrera hoy es que ninguna superficie cliente lo expone.

Los controles actuales **NO son suficientes** para certificar F-04 como no-explotable: el vector P1 de aplicación está vivo en producción (cuerpo LIVE verificado) y el grant destructivo sobre el audit trail persiste.

## REMEDIATION CANDIDATES (§42 — NO reparar en este gate; gate futuro REM-INV-4A-R)

| RC | Objeto exacto | Fix mínimo | Proof requerido en staging | Requisitos zero-touch |
|---|---|---|---|---|
| RC-1 (P1) | `public.create_sale_v2(uuid,…,p_supervisor_user_id,p_user_id)` §11 | Aplicar patrón canónico v2_12_9 al supervisor: solo `auth.role()='service_role'` puede inyectar `p_supervisor_user_id` (los routes server usan service_role); bajo authenticated el gate debe fallar si se pasa cualquier UUID (o verificar supervisor con firma server-side). Opción alternativa: mover el gate a un token de uso único emitido por `/api/auth/supervisor-check`. | Re-ejecutar harness D2–D6: D4/D5 deben → `ERR_SUPERVISOR_UNAUTHORIZED`; D1/D3 semántica intacta; flujo legítimo checkout vía API debe seguir funcionando (supervisor-check → checkout service_role). | CREATE OR REPLACE función + pin de hash; sin DDL de datos; fingerprint PRE/POST igual; rollback = versión anterior pinned |
| RC-2 (P1-lat) | `GRANT arwdDxtm` en `public.audit_logs` para `anon`+`authenticated` | `REVOKE DELETE, UPDATE, TRUNCATE, MAINTAIN ON public.audit_logs FROM anon, authenticated;` (mantener INSERT para writers; mantener service_role/postgres; idempotente con F-05/F-14 R2/R3) | Re-ejecutar G5–G9: TRUNCATE/DELETE/UPDATE/VACUUM como authenticated → permission denied; G2 (INSERT legítimo) → sigue OK; security-contract 134/0 | Solo DCL; sin cambios de datos; verificar 68 writers (todos SECDEF owner=postgres, no dependen del grant a authenticated); fingerprint PRE/POST |
| RC-3 (P2) | `public.get_transferable_stores(uuid,uuid)` | Igualar identidad a `auth.uid()` (o gate service_role para `p_user_id`, como `_as` canon) y ajustar caller `transfer-service.ts` | E2/E3 deben dejar de filtrar tiendas ajenas; E1 sin regresión | CREATE OR REPLACE + revisión del caller (única referencia src/) |
| RC-4 (P2) | `distribute_service_cost_v2`, `link_receipts_to_service`, `set_received_service_status`, `void_received_service_with_reversal` | Gate `CASE WHEN auth.role()='service_role'` para `p_user_id` (patrón H-7/v2_12_9) — solo atribución de auditoría | Falsificación de autoría debe DENY para authenticated; autorización (has_store_access) sin cambio | CREATE OR REPLACE ×4 + pin hashes |
| RC-5 (P2) | Policy `audit_logs_insert_authenticated` | `WITH CHECK (user_id = auth.uid() AND (store_id IS NULL OR public.has_store_role(store_id, ARRAY['admin','manager','encargado']) OR EXISTS membership activa del caller))` — o migrar escritura REST a rutas server | G4 debe → BLOCKED BY RLS; G2 (writer legítimo de la tienda) → OK | CREATE OR REPLACE POLICY (DDL de policy); writers SECDEF no afectados |
| RC-6 (P3) | Overload 3-arg `has_store_role(uuid,uuid,text[])` | Completar la mitad ACL del fix H-7: `REVOKE EXECUTE … FROM PUBLIC; GRANT … TO authenticated, service_role` | S-A4 ya seguro; re-verificar matriz EXECUTE = Git | Solo DCL |

## Resultado reconstruible (§43)

```
BASELINE 5f927364 OK (00)
   ↓ LIVE AUTH MODEL — censo 9 helpers, defs verbatim, hashes, Git↔LIVE (01,02,03,raw/git-vs-live-body-hashes.json)
   ↓ CALLERS — 168 policies RLS + 61 RPCs internos + src/ (04,06,11, raw/census-vuln-pattern.json)
   ↓ GRANTS/ACL — EXECUTE por rol + audit_logs arwdDxtm (05,09)
   ↓ SPOOFING ATTEMPTS — matriz adaptada a firmas reales (07)
   ↓ STAGING RESULTS — PG17.6 efímero, cuerpos verbatim: S-A..S-I DENY;
     D4/D5 SPOOF (P1), E2/E3 leak (P2), G7 TRUNCATE SUCCESS (P1-lat) (08,12)
   ↓ LIVE audit_logs ACL + RLS — 2×SELECT + 1×INSERT; sin DELETE/UPDATE policy (10)
   ↓ IMPACT — financial control bypass; forensics/compliance del trail (13)
   ↓ SEVERITY — P1 (supervisor bypass) + P1-latente (TRUNCATE) + P2×4 + P3×2 (13)
   ↓ VERDICT — NOT READY — P1 SECURITY FINDING (este documento)
   ↓ NEXT GATE — REM-INV-4A-R (RC-1..RC-6, con proofs de staging exigidos)
```

**Respuesta final a la pregunta del §43:** No es "solo hardening". Existe **una vulnerabilidad P1 real y reproducida** (bypass de supervisión de descuentos vía `p_supervisor_user_id` client-controlled sobre `has_store_role_as`) y una **capacidad P1-latente de destrucción del audit trail** sostenida por el GRANT TRUNCATE/DELETE/UPDATE/MAINTAIN a `anon`/`authenticated`. `has_store_role` en sí mismo **no es spoofeable**. Se requiere REM-INV-4A-R.
