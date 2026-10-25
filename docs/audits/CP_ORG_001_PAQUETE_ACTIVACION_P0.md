# CP-ORG-001 — Paquete de activación productiva y cierre del P0 (ciclo 6)

**Incidente:** P0 — SuperAdmin `admin@demo.com` sin acceso integral a tiendas tras
activación de plataforma (ciclo 4).
**Rama auditada:** `cp-org-001-ciclo4-activacion-superadmin`
**SHA auditado (head del PR #1484):** `e175e992183b1742061d3e20119c6c6e85c9ef3d`
**Fecha de la auditoría:** 2026-10-25 (UTC)
**Autor:** Agente de misión CP-ORG-001 (Z.ai)
**ALCANCE DE ESTE CICLO:** PREPARAR Y AUDITAR ÚNICAMENTE. Sin escrituras
productivas, sin migraciones, sin merge, sin despliegue, sin cambios de datos.
**Estado del incidente tras este ciclo:** CORREGIDO Y PROBADO en código y
entorno aislado; **PENDIENTE DE ACTIVACIÓN EN PRODUCCIÓN** — no declarar
recuperado en producción hasta ejecutar §3 y verificar §3.6/§3.7.

---

## §0. Resumen ejecutivo

1. El PR #1484 está ABIERTO y NO mergeado, con head `e175e9921`. Todos los
   controles obligatorios están VERDES en ese SHA **salvo uno**:
   `SQL DB Security Checks` (rojo por EXACTAMENTE 1 hallazgo real:
   `is_superadmin` con EXECUTE a PUBLIC/anon en producción). No es un defecto
   del código del PR: es un estado preexistente de producción que el gate
   audita EN VIVO y que se corrige aplicando la migración pendiente
   `20261026180000` — incluida en el propio PR.
2. Quedan EXACTAMENTE DOS migraciones pendientes para producción:
   `20261026170000` (trigger `validate_active_store` — capa final de la causa
   raíz RC3, hoy viva en su versión antigua que exige membresía también a
   admin/superadmin) y `20261026180000` (ACL de funciones de plataforma —
   apaga el hallazgo del gate). `20261026160000` y `20261026150000` YA ESTÁN
   VIVAS en producción (verificado read-only hoy; no se deben reaplicar).
3. La corrección del incidente está probada en el entorno aislado
   (`CostproE2E`, project `lguovmvrozxgssupkwpf`): suite LIVE 12/12 en el
   commit `2a9020451`, y el diff `2a9020451..e175e9921` es SOLO documentación
   (+49 líneas al expediente) — la evidencia sigue vigente para el head. Hoy
   se re-verificó read-only que el aislado mantiene el estado objetivo
   (grants correctos + cuerpo 170000 vivo).
4. Este paquete define el orden exacto de activación, el SQL íntegro con
   hashes SHA-256, las prevalidaciones de solo lectura, las verificaciones
   posteriores, las pruebas funcionales, los criterios de abortado y la
   contingencia SIN reversión destructiva. Todo queda pendiente de la
   autorización expresa del propietario (§7).

---

## §1. Estado real del PR #1484 (auditado hoy, GitHub API, solo lectura)

| Campo | Valor verificado |
|---|---|
| PR | #1484 — «fix(auth): CP-ORG-001 c5 — INCIDENTE P0 SuperAdmin: acceso integral a tiendas (admin@demo.com) + ciclo 4 docs» |
| Estado | `open`, NO mergeado (`merged=false`), no draft |
| Rama head | `cp-org-001-ciclo4-activacion-superadmin` |
| SHA head | `e175e992183b1742061d3e20119c6c6e85c9ef3d` |
| Base | `main` @ `f265fb692f297a6bc4be2615103baa66b3b131ad` |
| Mergeable | `true` / `mergeable_state=unstable` (por el check rojo) |
| Tamaño | 103 archivos, +1793/−192, 5 commits |
| Migraciones incluidas | `20261026160000_superadmin_store_access.sql`, `20261026170000_superadmin_active_store_trigger.sql`, `20261026180000_cp_org001_platform_acl_revoke.sql` |
| Docs incluidas | `docs/audits/CP_ORG_001_CIERRE_FINAL.md` (expediente §16–§17.8) |

### §1.1 Checks del SHA `e175e9921` (recuento verificado hoy)

| Check | Workflow/Run | Resultado |
|---|---|---|
| Vercel Preview Comments | Vercel | ✅ success |
| TypeCheck + Lint + Unit Tests + Build | CI (run 40199508053) | ✅ success |
| Unit & Integration Tests | Test Coverage (run 40199508094) | ✅ success |
| SQL Static Checks | SQL Security Gate (run 40199508136) | ✅ success |
| TypeScript Security Checks | Security CI Gate (run 40199508061) | ✅ success |
| Security Audit (Capa C) | Security CI Gate | ✅ success |
| Allowlist Review | Security CI Gate | ✅ success |
| E2E Tests (Playwright) | e2e-isolated | ⏭️ skipped ×2 (política del repo) |
| **SQL DB Security Checks** | SQL Security Gate | ❌ **failure — 1 hallazgo** |

**Ningún control verde de este listado corresponde a un SHA anterior**: todos
los runs citados ejecutaron sobre `e175e9921` y se verificaron hoy vía
GitHub API (check-runs + runs del head SHA).

### §1.2 Causa y alcance exactos del gate rojo

Log del job `SQL DB Security Checks` (job 121187471521, run 40199508136,
SHA `e175e9921`), verificado hoy:

```
✅ secdef_no_auth:       101 hallazgo(s), 101 en allowlist, 0 NO permitidos
❌ secdef_public_grant:    1 hallazgo(s),   0 en allowlist, 1 NO permitidos
     ❌ is_superadmin
✅ tables_no_rls:          0 hallazgo(s),   0 en allowlist, 0 NO permitidos
❌ Resultado: FALLO — ver hallazgos arriba
```

- El check `secdef_public_grant` audita **EN VIVO contra producción**
  (secret `DATABASE_URL`, solo lectura) las funciones SECURITY DEFINER con
  grants EXECUTE a `anon`/`PUBLIC`, excluyendo funciones disparadoras
  (paridad con Check 1, corrección del propio ciclo 5).
- **Hallazgo único y real:** `public.is_superadmin/0` conserva EXECUTE para
  `PUBLIC` (y por herencia `anon`) en producción. Estado PREEXISTENTE de la
  activación del ciclo 4: la migración que creó la función
  (`20261026120000`) solo revocó `assign_user_organization`.
- **NO es un defecto del código del PR ni se ocultó con allowlist:** el Check 2
  no tiene allowlist por diseño («hallazgo = fallo»), `is_superadmin` NO
  figura en `ci-gate-allowlist.json` (verificado hoy) y la corrección es la
  migración `20261026180000`, incluida en el PR. El hallazgo se apaga al
  aplicar esa migración a producción — dependencia documentada en §4.
- Riesgo práctico del estado intermedio: NULO en la práctica (`anon` obtiene
  `false`: `auth.uid() IS NULL` → no hay escalada), pero es higiene de
  defensa en profundidad y el gate debe quedar verde.
- `enforce_membership_tenant_consistency` ya NO es hallazgo: es función
  disparadora (grant directo inerte — Postgres prohíbe invocarla) y el Check 2
  la excluye desde la corrección de paridad del ciclo 5; su ACL se normaliza
  igualmente en `20261026180000`.

### §1.3 Advertencia sobre la interpretación del PR

Un PR «mergeable» (`mergeable=true`) solo significa que no hay conflictos con
`main`. **NO equivale a aprobado por todos los controles de seguridad**: el
gate SQL DB Security está rojo y seguirá rojo en cualquier re-ejecución contra
producción hasta que `20261026180000` esté aplicada. Ese estado es intencional
y documentado (§17.8 del expediente): enmascararlo contradiría la doctrina
fail-closed del repo.

---

## §2. Auditoría de las migraciones

### §2.1 Inventario aplicadas/pendientes (evidencia read-only de HOY)

Producción = Supabase `CostproBD` (project `wthkddeleylijmonclxg`). Todas las
consultas de esta tabla se ejecutaron hoy vía Management API (endpoint de
query), SOLO SELECT.

| Migración | Estado en producción | Evidencia verificada hoy (read-only) |
|---|---|---|
| `20261026120000` organizaciones/superadmin | **APLICADA** (ciclo 4) | `is_superadmin()`, `enforce_membership_tenant_consistency()` y trigger `trg_membership_tenant_consistency` (sobre `user_store_memberships`) VIVOS; cuerpo de `is_superadmin` = versión versionada. ACL parcial: solo `assign_user_organization` quedó revocada (postgres+service_role) — defecto que corrige 180000 |
| `20261026130000` platform role guards | **APLICADA** (ciclo 4) | Guardas de plataforma en las 4 `managed_*` vivas (Security Audit ✅ del SHA head sin divergencias bloqueantes; entradas `managed_*` del baseline quedan inertes) |
| `20261026140000` tenants RLS platform-only | **APLICADA** (ciclo 4) | 5 policies de `tenants` con `is_superadmin()` verificadas en `pg_policies` |
| `20261026150000` payment_tx_integrity | **APLICADA** (efecto vivo, ciclo 5; no revertir) | Tabla `payment_transactions_purga_20261026_archive` EXISTE con **33 filas** (SUM(amount)=685 400 en columna nativa; equivalente 4 730 400 CUP según §16); huérfanos con `store_id IS NULL` = **0**; FK `payment_transactions_store_id_fkey`→stores = **CASCADE** |
| `20261026160000` superadmin_store_access | **APLICADA** (SQL vivo; ciclo 5) | Policies `stores_tenant_select/update/delete` VIVAS con bypass `is_superadmin()` en ambas ramas del CASE — texto del qual coincide con la versión versionada; `current_user_store_ids()` VIVA (SECURITY DEFINER, search_path=public, SuperAdmin→todas las tiendas activas) |
| `20261026170000` superadmin_active_store_trigger | **PENDIENTE** | Cuerpo VIVO de `validate_active_store` = versión ANTIGUA (exige `FROM public.user_store_memberships` también para admin/superadmin) — RC3 sigue activo en producción. Causa directa del bloqueo de persistencia de `active_store_id` |
| `20261026180000` platform_acl_revoke | **PENDIENTE** | Grants VIVOS de `is_superadmin`: PUBLIC+postgres+anon+authenticated+service_role (hallazgo del gate). Objetivo: postgres+authenticated+service_role |

**Registro histórico (`supabase_migrations.schema_migrations`):** la versión
más alta registrada es `20260615000003` (`add_unique_index_product_cost_sheets`).
NINGUNA migración CP-ORG-001 (octubre) está registrada — en este proyecto las
migraciones se aplican manualmente vía SQL editor / Management API (doctrina de
`supabase/migrations/DEPLOY_INSTRUCTIONS.md`), no vía CLI. Consecuencia
operativa: **NO ejecutar `supabase db push` / `supabase migration repair`** —
reproduciría el backlog completo no registrado (docenas de migraciones ya
vivas). El historial del CLI NO es la fuente de verdad de este proyecto; lo es
el estado vivo auditado por el Security Audit (Capa C) contra los archivos
versionados.

### §2.2 Auditoría de `20261026170000_superadmin_active_store_trigger.sql`

SHA-256: `d41d974647251faa3b1ce883fa6f44fb1bf48db51dc5a8c306024c97b280ce83`
Tamaño: 6 123 bytes. Contenido íntegro: §3.3.

**Qué hace:** `CREATE OR REPLACE FUNCTION public.validate_active_store()`
(trigger function, plpgsql, **SECURITY DEFINER**, `SET search_path TO
'pg_catalog', 'public', 'pg_temp'`). El trigger existente
`trigger_validate_active_store` (BEFORE INSERT/UPDATE en `profiles`) sigue
apuntando a la misma función — sin cambios de trigger, sin DDL de tablas.

**Regla tras la migración:**
- Nivel administrativo (`admin` | `superadmin`, espejo exacto de
  `public.is_admin()`): `active_store_id` es OPCIONAL y, si se fija, la tienda
  debe EXISTIR y estar ACTIVA (`FROM public.stores WHERE id = NEW.active_store_id
  AND is_active = true`). **NO se exige membresía individual.** La cuenta de
  plataforma no lleva membresías por diseño (§6 de 20260826120000) y no debe
  necesitar membresías ficticias.
- Rol `costo`: semántica previa INTACTA (membresía activa obligatoria en
  UPDATE si se fija tienda).
- Roles operativos (`encargado`, `clerk`, `warehouse`, `manager`, `usuario`):
  semántica previa INTACTA — membresía activa obligatoria al cambiar
  `active_store_id`; roles tienda-requirente no pueden dejarlo NULL;
  INSERT permisivo (coherencia con `managed_create_user`, que inserta las
  memberships inmediatamente después).

**Confirmación exigida por el ciclo 6 — ¿usuarios ordinarios pueden quedar
seleccionando tiendas ajenas? NO.** Cadena de contención, capa por capa:

1. **Trigger (170000):** todo rol NO administrativo (`costo`, `encargado`,
   `clerk`, `warehouse`, `manager`, `usuario`) exige una fila
   `user_store_memberships (user_id, store_id, status='active')` EXACTA para
   ese usuario y esa tienda. Un empleado no puede fijar como activa una tienda
   en la que no tiene membresía: `ERR_INVALID_ACTIVE_STORE`.
2. **Listado (qué puede elegir):** `GET /api/stores` está acotado por RLS —
   empleado solo ve sus tiendas con membresía (`current_user_store_ids()`,
   rama ELSE); admin de organización solo ve las de su tenant; solo
   `superadmin` ve todas (bypass de plataforma de 160000).
3. **Acceso a datos (qué pasa aunque fije un id ajeno):** `active_store_id`
   es ESTADO DE UI del perfil; NO concede ningún privilegio de datos. El
   aislamiento real lo sostiene la RLS por tabla (tenant/membresía), no este
   campo. La suite LIVE S7/S8/S10 del aislado lo comprobó con JWT reales
   (empleado cross-store = 0 filas).
4. **Rol del admin de organización:** la excepción del trigger es para el
   NIVEL administrativo resuelto SERVER-SIDE (espejo de `is_admin()`), nunca
   para empleados. El app-layer (`userService.setActiveStore`) resuelve el
   rol de la sesión de confianza; el cliente NUNCA envía el rol como prueba
   (S9 anti-spoofing: el trigger rechaza cambios de rol de plataforma desde
   sesiones no autorizadas).
5. **Persistencia:** se autoriza solo escribir `active_store_id` del PROPIO
   perfil (`profiles_tenant_update`: `id = auth.uid() OR is_admin()`), nunca
   el ajeno sin nivel administrativo.

**Idempotencia:** sí — `CREATE OR REPLACE` con cuerpo determinista + bloque
`DO` de verificación no destructivo (exige que `trigger_validate_active_store`
exista). Re-ejecutar no cambia estado. Compatible con el esquema vigente
(los tipos/columnas referenciados existen y fueron verificados hoy: `stores`,
`user_store_memberships`, `user_role`, `active_store_id` en `profiles`).

**Efecto sobre Security Audit:** el cuerpo VIVO de producción pasa de «drift
frente al replay con 170000» (entrada `source_of_truth_baseline`
BODY_DRIFT_FROM_MIGRATION, expira 2026-11-30, §17.8 del expediente) a
**coincidir** con el replay → la entrada del baseline queda inerte y puede
retirarse tras re-exportar el surface certificado. No toca RLS ni ACL.

### §2.3 Auditoría de `20261026180000_cp_org001_platform_acl_revoke.sql`

SHA-256: `3fd5dc19cc248fe7918d81ca0ed8d34189bdd3a145d0f600b8e13d64b66167dd`
Tamaño: 2 979 bytes. Contenido íntegro: §3.3.

**Qué hace** (transaccional `BEGIN…COMMIT`, solo ACL — sin cambios de cuerpos,
sin DDL, sin RLS):

| Función | Antes (vivo hoy) | Después (objetivo) | Doctrina |
|---|---|---|---|
| `is_superadmin()` | PUBLIC + postgres + anon + authenticated + service_role | REVOKE ALL a PUBLIC y anon; GRANT EXECUTE a **authenticated + service_role** (+ owner postgres implícito) | Misma que `is_admin()`: las policies RLS la ejecutan con los privilegios del usuario que consulta → `authenticated` DEBE conservar EXECUTE |
| `enforce_membership_tenant_consistency()` | PUBLIC + postgres + anon + authenticated + service_role | REVOKE ALL a PUBLIC/anon/authenticated; GRANT EXECUTE a **service_role** (+ owner postgres) | Misma que `validate_active_store()` (trigger: la invoca el motor, no la sesión) |

**Verificaciones de seguridad exigidas por el ciclo 6:**

1. **REVOKE a PUBLIC/anon cuando no está justificado:** confirmado — para
   `is_superadmin`, `anon` no tiene superficie útil (`auth.uid() IS NULL` →
   siempre false) y `PUBLIC` es un grant residual del CREATE por defecto; para
   `enforce_membership_tenant_consistency`, la invocación directa está
   PROHIBIDA por Postgres (función de trigger) → cualquier grant de sesión es
   inerte y debe retirarse.
2. **Privilegios mínimos conservados para roles autorizados:** confirmado —
   `authenticated` conserva `is_superadmin` (5 policies de `tenants` + 3 de
   `stores_tenant_*` la invocan desde RLS; verificado hoy en `pg_policies`:
   8 policies dependen de ella). Sin ese grant, la RLS de usuarios autenticados
   rompería. La suite LIVE 12/12 re-ejecutada en el aislado TRAS aplicar
   180000 lo comprobó (policies operativas).
3. **RLS dependiente intacta:** confirmado — 170000/180000 no tocan policies;
   hoy se verificó que las 8 policies que usan `is_superadmin` y las
   `stores_tenant_*` siguen VIVAS con el qual de 160000, y que el aislado
   (post-180000) mantiene las grants objetivo (verificación read-only de HOY).
4. **SECURITY DEFINER conserva su configuración segura:** confirmado —
   180000 NO redefine funciones; los cuerpos/config quedan como están
   (verificado hoy en `pg_proc`): `is_superadmin` → SECURITY DEFINER, STABLE,
   `search_path=public`, owner postgres; `enforce_membership_tenant_consistency`
   → SECURITY DEFINER, `search_path=public`, owner postgres, función de
   trigger; `validate_active_store` → SECURITY DEFINER,
   `search_path=pg_catalog, public, pg_temp` (idéntico al que establece
   170000). Ningún cambio de `proconfig`/`prosecdef`/owner por la migración.
5. **¿Elimina el hallazgo real del gate o lo oculta?** LO ELIMINA de raíz —
   el Check 2 no tiene allowlist (verificado hoy en `ci-gate-sql-checks.js` y
   en el propio log del CI: «allowlist aplicada: 0 ítem(s)»), `is_superadmin`
   no está en `ci-gate-allowlist.json`, y tras el REVOKE el detector
   (`aclexplode(p.proacl)` buscando grants anon/PUBLIC en funciones
   SECURITY DEFINER no-disparadoras) encuentra 0 filas. No hay allowlist ni
   baseline que oculte nada.

**Idempotencia:** sí — REVOKE de un privilegio ausente es no-op en Postgres y
GRANT duplicado es no-op; re-ejecutar produce el mismo estado. **Dependencias:**
requiere que las funciones existan (creadas por 20261026120000, ya aplicada —
verificado hoy). **Orden:** por numeración va tras 170000; entre ambas NO hay
dependencia técnica (funciones distintas), pero el orden versionado es el
canónico.

### §2.4 Estado de `20261026160000` y registro histórico

Confirmado hoy, read-only: el SQL de `20261026160000` **ya está vivo** en
producción (policies `stores_tenant_*` con bypass `is_superadmin()` en ambas
ramas del CASE; `current_user_store_ids()` con rama SuperAdmin→todas las
tiendas activas) y coincide con el archivo versionado. No está registrada en
`supabase_migrations.schema_migrations` (registro detenido en
`20260615000003`) — igual que TODAS las migraciones de octubre, incluidas las
de otras misiones ya aplicadas. **NO se reaplica en este paquete**; el paquete
solo verifica su presencia como precondición (§3.4). Si algún día se adoptara
el CLI, la adopción requeriría un proyecto aparte de reconciliación del
historial — fuera del alcance de este P0.

---

## §3. Paquete productivo de activación

> **Regla de ejecución:** este paquete es reproducible. No se ejecuta NADA en
> producción sin la autorización expresa del propietario (§7). Todos los SQL de
> este paquete se ejecutan con un rol con permisos de owner (`postgres`) en el
> proyecto `CostproBD` (`wthkddeleylijmonclxg`). Nada de lo aquí incluido
> borra, altera ni revierte datos de negocio.

### §3.1 Inventario de migraciones (elemento 1)

Aplicadas: ver §2.1 (120000, 130000, 140000, 150000, 160000 — evidencia viva
de HOY). Pendientes: **170000 → 180000** (en este orden).

### §3.2 Orden exacto de ejecución (elemento 2)

```
P0. (precondiciones §3.4 verificadas — checklist firmado)
P1. Deploy de código:  merge PR #1484 → despliegue Vercel de main
P2. Migración 170000:  aplicar SQL íntegro (§3.3) a CostproBD, atómico
P3. Migración 180000:  aplicar SQL íntegro (§3.3) a CostproBD, atómico
P4. Verificaciones posteriores (§3.6) — solo lectura
P5. Pruebas funcionales (§3.7): SuperAdmin + usuario ordinario
P6. Re-ejecutar el SQL Security Gate en CI sobre el head; debe quedar VERDE
P7. Recopilar evidencia (§3.10), actualizar expediente y retirar la entrada
    inerte del baseline tras re-exportar el contract surface
```

**Secuenciación código↔migraciones (importante):**

- **P1 SIN P2 (código nuevo, trigger viejo):** la app permite seleccionar al
  nivel administrativo pero el trigger RC3 rechaza la persistencia con
  `ERR_INVALID_ACTIVE_STORE` → el incidente PERMANECE. Es el estado actual
  de producción y la razón de este paquete.
- **P2 SIN P1 (trigger nuevo, código de main):** el trigger permitiría, pero
  el app-layer de `main` (pre-c5) exige membresía para todos → el incidente
  también permanece.
- **Conclusión:** P1 y P2 deben ocurrir EN LA MISMA VENTANA de activación.
  El orden interno P1→P2 es el recomendado (así la verificación funcional P5
  se hace con el código definitivo). P3 es independiente del código y puede
  ir antes o después de P1, pero se mantiene en P3 por orden versionado; su
  efecto (gate verde) solo se certifica en P6.
- **Ventana sugerida:** aplicar P2+P3 inmediatamente tras el despliegue de
  P1, antes de anunciar el cierre. 170000 tarda <1 s (CREATE OR REPLACE);
  180000 es una transacción de dos sentencias REVOKE/GRANT + 2 GRANT.

### §3.3 SQL íntegro de las migraciones pendientes (elemento 3)

#### `supabase/migrations/20261026170000_superadmin_active_store_trigger.sql`
SHA-256: `d41d974647251faa3b1ce883fa6f44fb1bf48db51dc5a8c306024c97b280ce83` (6 123 bytes)

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- CP-ORG-001 ciclo 5 (2026-10-25) — validate_active_store: nivel administrativo
-- transversal (incidente P0 admin@demo.com)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTEXTO: la cuenta de plataforma superadmin NO lleva membresías de tienda
-- (§6 de 20260826120000; el SuperAdmin «debería poder ver todo, acceder a
-- todo» — directiva del propietario 2026-10-25). El trigger exigía membresía
-- activa para fijar active_store_id TAMBIÉN para 'admin' y 'superadmin', por
-- lo que la escritura fallaba con ERR_INVALID_ACTIVE_STORE aunque la app
-- (userService.setActiveStore, ciclo 4/5) y la RLS (profiles_tenant_update:
-- id = auth.uid() OR is_admin()) la autorizaran. El listado funcionaba pero
-- la SELECCIÓN de tienda quedaba bloqueada en la última capa.
--
-- REGLA: para el NIVEL ADMINISTRATIVO (admin|superadmin — espejo exacto de
-- public.is_admin()) se sustituye la exigencia de membresía por la validación
-- de que la tienda EXISTA y esté ACTIVA (mismo contrato server-side que la
-- app en userService.setActiveStore). El rol 'costo' y los roles operativos
-- (encargado/clerk/warehouse/manager/usuario) conservan la membresía activa
-- obligatoria — CERO cambios de aislamiento para ellos.
--
-- Idempotente: CREATE OR REPLACE del cuerpo de la función; el trigger
-- trigger_validate_active_store sigue apuntando a la misma función.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validate_active_store()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_role user_role;
BEGIN
    v_role := NEW.role;

    -- CP-ORG-001 ciclo 5: NIVEL ADMINISTRATIVO (admin|superadmin) transversal.
    -- active_store_id es opcional; si se fija, la tienda debe existir y estar
    -- activa. NO se exige membresía: la cuenta de plataforma no la lleva y
    -- no debe necesitar membresías ficticias (causa raíz del incidente).
    IF v_role = 'admin'::user_role
       OR v_role = 'superadmin'::user_role THEN
        IF TG_OP = 'INSERT' OR (OLD.active_store_id IS DISTINCT FROM NEW.active_store_id) THEN
            IF NEW.active_store_id IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.stores
                    WHERE id = NEW.active_store_id
                      AND is_active = true
                ) THEN
                    IF TG_OP = 'UPDATE' THEN
                        RAISE EXCEPTION 'ERR_INVALID_ACTIVE_STORE: la tienda no existe o no está activa.';
                    END IF;
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- rol 'costo': semántica PREVIA intacta (membresía activa obligatoria en UPDATE)
    IF v_role = 'costo'::user_role THEN
        IF TG_OP = 'INSERT' OR (OLD.active_store_id IS DISTINCT FROM NEW.active_store_id) THEN
            IF NEW.active_store_id IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.user_store_memberships
                    WHERE user_id = NEW.id
                      AND store_id = NEW.active_store_id
                      AND status = 'active'
                ) THEN
                    IF TG_OP = 'UPDATE' THEN
                        RAISE EXCEPTION 'ERR_INVALID_ACTIVE_STORE: El usuario no tiene membership activa en la tienda seleccionada.';
                    END IF;
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- Para roles operativos (encargado, clerk, warehouse, manager, usuario)
    IF TG_OP = 'INSERT' THEN
        -- En INSERT: ser permisivo. La función managed_create_user inserta
        -- memberships justo después. No validar nada aquí.
        RETURN NEW;
    ELSE
        -- UPDATE: solo validar si active_store_id cambió realmente
        -- (evita bloquear updates de otros campos en perfiles intermedios)
        IF OLD.active_store_id IS NOT DISTINCT FROM NEW.active_store_id THEN
            -- active_store_id no cambió → permitir el UPDATE sin validar
            RETURN NEW;
        END IF;

        -- active_store_id cambió → validar consistencia
        IF NEW.active_store_id IS NULL THEN
            IF v_role IN ('encargado'::user_role, 'clerk'::user_role, 'warehouse'::user_role) THEN
                RAISE EXCEPTION 'ERR_STORE_REQUIRED: El rol % requiere una tienda activa asignada.', v_role;
            END IF;
        ELSE
            IF NOT EXISTS (
                SELECT 1 FROM public.user_store_memberships
                WHERE user_id = NEW.id
                  AND store_id = NEW.active_store_id
                  AND status = 'active'
            ) THEN
                RAISE EXCEPTION 'ERR_INVALID_ACTIVE_STORE: El usuario no tiene membership activa en la tienda seleccionada.';
            END IF;
        END IF;
        RETURN NEW;
    END IF;
END;
$function$;

COMMENT ON FUNCTION public.validate_active_store() IS
  'CP-ORG-001 c5: nivel administrativo (admin|superadmin) fija active_store_id sin membresía (valida tienda existente+activa); costo y roles operativos conservan la membresía activa obligatoria.';

-- Verificación no destructiva: el trigger debe seguir activo sobre la función.
DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_validate_active_store'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'verify_20261026170000: trigger_validate_active_store ausente';
  END IF;
END
$verify$;
```

#### `supabase/migrations/20261026180000_cp_org001_platform_acl_revoke.sql`
SHA-256: `3fd5dc19cc248fe7918d81ca0ed8d34189bdd3a145d0f600b8e13d64b66167dd` (2 979 bytes)

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- 20261026180000_cp_org001_platform_acl_revoke.sql
-- CP-ORG-001 ciclo 5 (incidente P0 admin@demo.com) — ACL de las funciones de
-- plataforma creadas por 20261026120000/20261026130000.
--
-- DEFECTO detectado por el SQL Security Gate EN VIVO (check
-- secdef_public_grant) tras la activación productiva del ciclo 4: dos
-- funciones SECURITY DEFINER quedaron con EXECUTE para PUBLIC/anon porque la
-- migración que las creó solo revocó para assign_user_organization:
--   · is_superadmin/0 — llamada por las policies stores_tenant_*
--     (RLS, bypass de SuperAdmin). Las policies evalúan con los privilegios
--     del usuario → authenticated DEBE conservar EXECUTE (misma doctrina que
--     is_admin: postgres + authenticated + service_role). anon jamás:
--     auth.uid() IS NULL → false; sin superficie útil y sin exposición.
--   · enforce_membership_tenant_consistency/0 — función DISPARADORA (trigger
--     de empresa única, §6 de 20261026120000): las funciones de trigger NO
--     pueden invocarse directamente (Postgres lo prohíbe), por lo que su
--     grant EXECUTE a PUBLIC/anon es inerte; se normaliza a la doctrina de
--     validate_active_store: postgres + service_role only.
--
-- Sin cambios de cuerpos, sin DDL, sin RLS. Solo ACL (estilo 20261026100000).
--
-- APLICACIÓN A PRODUCCIÓN: junto con el despliegue del PR #1484 y la migración
-- 20261026170000 (pasos de activación del expediente §17.6). Hasta entonces,
-- el check secdef_public_grant del gate mantiene el hallazgo `is_superadmin`
-- con el estado live de producción — documentado expresamente en el PR; el
-- hallazgo de funciones disparadoras desaparece por el fix de paridad del
-- propio check (scripts/ci-gate-sql-checks.js, Check 2 alineado con Check 1).
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- 1) is_superadmin/0: helper de policies — authenticated + service_role, sin anon/PUBLIC
REVOKE ALL ON FUNCTION public.is_superadmin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_superadmin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated, service_role;

-- 2) enforce_membership_tenant_consistency/0: función de trigger — service_role only
REVOKE ALL ON FUNCTION public.enforce_membership_tenant_consistency() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_membership_tenant_consistency() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_membership_tenant_consistency() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_membership_tenant_consistency() TO service_role;

COMMIT;
```

> **Integridad:** antes de aplicar, re-verificar en la copia de trabajo:
> `sha256sum supabase/migrations/20261026170000_superadmin_active_store_trigger.sql
> supabase/migrations/20261026180000_cp_org001_platform_acl_revoke.sql`
> y comparar con los hashes de arriba. Si difieren → CONDICIÓN DE PARADA (§6).

### §3.4 Precondiciones (elemento 4)

Firmar TODAS antes de ejecutar. Cualquier «no» → NO PROCEDER (§6).

| # | Precondición | Verificación |
|---|---|---|
| P-01 | Rama/SHA: el head del PR #1484 sigue siendo `e175e9921` (o el cambio posterior está re-auditado con gates re-ejecutados) | GitHub API: PR head SHA + checks |
| P-02 | PR #1484 ABIERTO y sus checks: 8 verdes + E2E skipped; el único rojo documentado es `SQL DB Security Checks` (hallazgo `is_superadmin`) | §1.1 |
| P-03 | Hashes SHA-256 de 170000 y 180000 coinciden con §3.3 | `sha256sum` |
| P-04 | `20261026160000` VIVA (policies `stores_tenant_*` con bypass `is_superadmin()`) | §3.5/Q4 |
| P-05 | Cuerpo VIVO de `validate_active_store` = versión ANTIGUA (firma RC3: valida contra `user_store_memberships` para admin/superadmin) | §3.5/Q3 |
| P-06 | Grants VIVOS de `is_superadmin` incluyen PUBLIC/anon (hallazgo del gate presente — si ya no está, la migración 180000 ya fue aplicada: re-alinear el paquete) | §3.5/Q2 |
| P-07 | `supabase_migrations.schema_migrations` sigue detenido en `20260615000003` (sin registro de octubre). NO correr `supabase db push` | §3.5/Q1 |
| P-08 | Cuenta `admin@demo.com`: role=`superadmin`, tenant conservado, `active_store_id` NULL, NO baneada, 0 membresías (estado esperado pre-activación) | §3.5/Q7+Q8 |
| P-09 | 2 tiendas activas en producción (id/names conocidos: `ENERVIDA-VITALLCONS`, `Puerto Padre VITALLCONS`) | §3.5/Q9 |
| P-10 | Backup/estado previo capturado: cuerpos de función + ACL de las 3 funciones (salida íntegra de §3.5 Q2/Q3/Q5/Q6) archivada como evidencia pre-activación | guardar JSON |
| P-11 | Deploy de código (P1) listo para la MISMA ventana (merge aprobado por el propietario) | §7 |
| P-12 | Ninguna otra migración en curso ni otra persona aplicando cambios simultáneos en la BD | coordinación humana |

### §3.5 Consultas de prevalidación — SOLO LECTURA (elemento 5)

Ejecutar íntegras ANTES de cada paso; guardar las salidas JSON como evidencia.
Son exactamente las ejecutadas en la auditoría de HOY (los «esperado» son los
valores verificados hoy).

```sql
-- Q1 Registro histórico (esperado: max = 20260615000003; NADA de octubre)
SELECT version, name FROM supabase_migrations.schema_migrations
ORDER BY version DESC LIMIT 12;

-- Q2 Grants VIVOS de is_superadmin (esperado hoy: PUBLIC, anon, authenticated,
--    service_role [+postgres owner] — el hallazgo del gate)
SELECT p.proname, r.rolname AS grantee
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
JOIN pg_roles r ON r.oid = a.grantee
WHERE n.nspname='public'
  AND p.proname IN ('is_superadmin','enforce_membership_tenant_consistency',
                    'validate_active_store','is_admin','assign_user_organization')
  AND a.privilege_type='EXECUTE'
ORDER BY 1,2;

-- Q3 Firma del cuerpo VIVO de validate_active_store
-- (esperado hoy: exige_membership=TRUE y valida_stores=FALSE → versión antigua/RC3)
SELECT position('FROM public.user_store_memberships' IN p.prosrc) > 0 AS exige_membership,
       position('FROM public.stores'            IN p.prosrc) > 0 AS valida_stores,
       p.prosecdef, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='validate_active_store';

-- Q4 160000 viva: policies stores_tenant_* con bypass SuperAdmin (esperado: 3 filas con is_superadmin())
SELECT policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename='stores'
  AND qual LIKE '%is_superadmin%';

-- Q5 8 policies dependen de is_superadmin (esperado: 5 tenants + 3 stores)
SELECT schemaname, tablename, policyname FROM pg_policies
WHERE qual LIKE '%is_superadmin%' OR with_check LIKE '%is_superadmin%';

-- Q6 Trigger vivo (esperado: trigger_validate_active_store entre los triggers de profiles)
SELECT t.tgname, pg_get_triggerdef(t.oid) AS def
FROM pg_trigger t
JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='profiles' AND NOT t.tgisinternal;

-- Q7 Cuenta afectada (esperado hoy: role=superadmin, active_store_id=NULL,
--    is_active=true, tenant_id=5364ccf8-e6cd-4c38-aea8-b167b3b5576f)
SELECT id, email, role, tenant_id, active_store_id, is_active
FROM public.profiles WHERE email='admin@demo.com';

-- Q7b auth.users (esperado: banned_until=NULL)
SELECT email, banned_until, last_sign_in_at
FROM auth.users WHERE email='admin@demo.com';

-- Q8 Membresías de la cuenta (esperado: 0 filas — por diseño, SIN crearlas)
SELECT m.store_id, m.status FROM public.user_store_memberships m
WHERE m.user_id = (SELECT id FROM public.profiles WHERE email='admin@demo.com');

-- Q9 Tiendas activas (esperado: 2 — ENERVIDA-VITALLCONS, Puerto Padre VITALLCONS)
SELECT id, name, tenant_id FROM public.stores WHERE is_active=true ORDER BY name;

-- Q10 RLS habilitada (esperado: 3 × true)
SELECT c.relname, c.relrowsecurity FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('stores','profiles','user_store_memberships');
```

### §3.6 Verificaciones posteriores (elemento 6)

Ejecutar tras P2 y P3 (SOLO LECTURA). Todas deben cumplir; si alguna falla → §3.8.

```sql
-- V1 Cuerpo 170000 vivo (esperado tras P2: valida_stores=TRUE,
--    prosecdef=TRUE, proconfig=search_path=pg_catalog, public, pg_temp)
SELECT position('FROM public.stores'            IN p.prosrc) > 0 AS valida_stores,
       position('FROM public.user_store_memberships' IN p.prosrc) > 0 AS branch_costo_membership,
       p.prosecdef, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='validate_active_store';

-- V2 Trigger sigue vivo y apunta a la función (esperado: 1 fila)
SELECT tgname, tgfoid::regprocedure FROM pg_trigger
WHERE tgname='trigger_validate_active_store' AND NOT tgisinternal;

-- V3 Grants objetivo tras P3 (esperado EXACTO):
--    is_superadmin → authenticated, postgres, service_role (SIN public/anon)
--    enforce_membership_tenant_consistency → postgres, service_role
--    validate_active_store → postgres, service_role (sin cambios)
SELECT p.proname, r.rolname AS grantee
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
JOIN pg_roles r ON r.oid = a.grantee
WHERE n.nspname='public'
  AND p.proname IN ('is_superadmin','enforce_membership_tenant_consistency','validate_active_store')
  AND a.privilege_type='EXECUTE'
ORDER BY 1,2;

-- V4 Equivalente exacto al detector del gate (esperado tras P3: 0 filas)
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.prosecdef = true
  AND NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgfoid = p.oid)
  AND EXISTS (
      SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE a.grantee IN (0, (SELECT oid FROM pg_roles WHERE rolname='anon'))
        AND a.privilege_type = 'EXECUTE'
  );

-- V5 RLS intacta: mismas 8 policies con is_superadmin (5 tenants + 3 stores)
SELECT schemaname, tablename, policyname, cmd FROM pg_policies
WHERE qual LIKE '%is_superadmin%' OR with_check LIKE '%is_superadmin%';

-- V6 Cuenta tras las pruebas funcionales (esperado: role=superadmin INTACTO,
--    active_store_id = tienda seleccionada en P5 y persiste entre sesiones;
--    0 membresías — la selección NO debe crear membresías)
SELECT role, active_store_id, tenant_id FROM public.profiles
WHERE email='admin@demo.com';
SELECT count(*) FROM public.user_store_memberships
WHERE user_id = (SELECT id FROM public.profiles WHERE email='admin@demo.com');
```

**Persistencia de `active_store_id` (comprobación funcional de V6):** el valor
escrito por la selección de tienda en P5 debe sobrevivir (a) recarga completa
del navegador y (b) logout/login. La relectura V6 tras (a) y (b) es la
evidencia de persistencia. Para DEShacer la selección de prueba: el propio
usuario puede fijar otra tienda o dejar NULL (nivel administrativo) — no se
requiere SQL manual.

### §3.7 Pruebas funcionales post-activación (elemento 7)

Ejecutar en producción SOLO tras autorización (§7), con la cuenta afectada y
con un empleado de prueba existente (sin crear datos nuevos).

**SuperAdmin (`admin@demo.com`):**

| # | Prueba | Éxito |
|---|---|---|
| F1 | Login y carga de sesión | Sin error; rol resuelto server-side (S9 aislado) |
| F2 | Selector de tienda del header | Lista las 2 tiendas activas (2/2) |
| F3 | Seleccionar una tienda SIN membresía individual | Selección aceptada; `active_store_id` persistido (V6) |
| F4 | Recarga completa del navegador y re-login | Tienda sigue seleccionada (V6 en ambos) |
| F5 | Cambiar a la segunda tienda y volver | Ambos cambios persisten; privilegios constantes |
| F6 | Módulos operativos dependientes de tienda activa: Ventas/POS, Caja, Inventario, Reportes, Compras, Traslados (según plan de la cuenta) | Cada módulo carga SIN «acceso denegado» y con datos de la tienda activa |
| F7 | Tienda inactiva/inexistente (si aplica prueba negativa) | Rechazada (S5/S5b aislado) |

**Usuario ordinario (empleado existente, p. ej. rol encargado/clerk):**

| # | Prueba | Éxito |
|---|---|---|
| G1 | Login y selector | Ve SOLO su tienda con membresía (1/1) |
| G2 | Intento de fijar tienda ajena por API (`PATCH`/`setActiveStore` con store_id de otra tienda) | Rechazado — `ERR_INVALID_ACTIVE_STORE` (S8 aislado) |
| G3 | Módulos operativos | Funcionan solo contra su tienda |
| G4 | Cross-store por API directa | 0 filas de la tienda ajena (S7/S10 aislado) |

**Aislamiento de admin de organización (regresión):** un `admin` de tenant sin
membresías de tienda ve 0 tiendas en el selector (S6 aislado) y NO puede
elevarse a `superadmin` (guardas de 130000: solo un superadmin gestiona
cuentas superadmin; trigger `trg_prevent_self_privilege_escalation` vivo —
verificado hoy en `pg_trigger`).

**Ninguna prueba crea datos de negocio**: son lecturas + selección de tienda
(estado de UI) + intentos negativos. Si P5 requiere deseleccionar al final,
el propio selector lo permite (NULL es válido para el nivel administrativo).

### §3.8 Criterios inequívocos de ABORTADO (elemento 8)

ABORTAR INMEDIATAMENTE (sin seguir pasos, sin «arreglar sobre la marcha») si
cualquiera de estas condiciones se materializa. El abortado es REVERSIBLE por
§3.9 y NO destruye datos (verificado: ambas migraciones son ACL/cuerpo de
función; ninguna toca filas de negocio).

| # | Condición de abortado | Detección |
|---|---|---|
| A-01 | La rama/SHA del PR no corresponde al código auditado (`e175e9921` o re-auditado expreso) | P-01 en cada re-ejecución |
| A-02 | El hash SHA-256 de cualquier archivo de migración difiere de §3.3 | P-03 / verificación pre-aplicación |
| A-03 | La migración aplicada no coincide con la versión esperada (salida de P2/P3 con errores parciales, objeto no creado, o cuerpo post-P2 ≠ firma V1) | V1–V3 |
| A-04 | Discrepancia de esquema o de historial (p. ej. `schema_migrations` cambió inesperadamente, se corrió `supabase db push`, aparecen migraciones de octubre registradas sin explicación) | Q1 |
| A-05 | Privilegios efectivos ≠ esperado tras P3 (V3/V4 fallan: queda cualquier grant anon/PUBLIC, o se perdió EXECUTE de `authenticated` en `is_superadmin`) | V3/V4 |
| A-06 | Una política RLS o un flujo operativo se rompe (V5 ≠ 8 policies; API de tiendas/membresías/usuarios da errores nuevos; módulos P5 con «acceso denegado» inesperado) | V5 + P5 |
| A-07 | No puede verificarse la integridad de la cuenta SuperAdmin (rol/baneo/estado de `admin@demo.com` inesperado durante la activación) | Q7/Q7b |
| A-08 | El gate detecta una vulnerabilidad REAL que permanece sin corregir (hallazgo nuevo distinto del documentado, o el hallazgo no desaparece tras P3) | P6 |
| A-09 | Cualquier error imprevisto en la aplicación de P2/P3 (sentencia SQL con error) — las migraciones son atómicas por diseño: BEGIN…COMMIT (180000) y CREATE OR REPLACE monolítico (170000); ante error, la transacción/failure NO deja estado parcial |

**Protocolo de abortado:** (1) NO continuar pasos posteriores; (2) ejecutar
§3.9 SOLO si hay un estado intermedio que deba revertirse; (3) documentar la
condición detectada con la salida exacta de la verificación que la detectó;
(4) reportar al propietario y esperar re-planificación. NO se realizan
«escrituras productivas de desbloqueo» improvisadas.

### §3.9 Contingencia y recuperación (elemento 9) — SIN reversión destructiva

**Principio:** ninguna de las dos migraciones toca datos de negocio. La
recuperación es puramente funcional (re-crear un cuerpo de función o
re-establecer grants) y siempre recuperable; lo peor de la reversión es
volver al estado PRE-incidente, no perder información.

**C-1 — Contingencia de `20261026170000` (restaurar el trigger previo).**
Aplicar solo bajo un criterio de abortado (A-03/A-06) y con el cuerpo exacto
capturado READ-ONLY de producción el 2026-10-25 (pre-activación), guardado
como evidencia P-10:

```sql
-- RESTAURACIÓN FUNCIONAL del cuerpo PRE-170000 (capturado de pg_proc el
-- 2026-10-25; re-introduce RC3 — el incidente P0 vuelve a su estado original).
CREATE OR REPLACE FUNCTION public.validate_active_store()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_role user_role;
BEGIN
    v_role := NEW.role;

    -- Si role es 'costo' o 'admin' o 'superadmin', active_store_id es opcional
    IF v_role = 'costo'::user_role
       OR v_role = 'admin'::user_role
       OR v_role = 'superadmin'::user_role THEN
        -- Solo validar si active_store_id cambió o es INSERT
        IF TG_OP = 'INSERT' OR (OLD.active_store_id IS DISTINCT FROM NEW.active_store_id) THEN
            IF NEW.active_store_id IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.user_store_memberships
                    WHERE user_id = NEW.id
                      AND store_id = NEW.active_store_id
                      AND status = 'active'
                ) THEN
                    IF TG_OP = 'UPDATE' THEN
                        RAISE EXCEPTION 'ERR_INVALID_ACTIVE_STORE: El usuario no tiene membership activa en la tienda seleccionada.';
                    END IF;
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- Para roles operativos (encargado, clerk, warehouse, manager, usuario)
    IF TG_OP = 'INSERT' THEN
        -- En INSERT: ser permisivo. La función managed_create_user inserta
        -- memberships justo después. No validar nada aquí.
        RETURN NEW;
    ELSE
        -- UPDATE: solo validar si active_store_id cambió realmente
        -- (evita bloquear updates de otros campos en perfiles intermedios)
        IF OLD.active_store_id IS NOT DISTINCT FROM NEW.active_store_id THEN
            -- active_store_id no cambió → permitir el UPDATE sin validar
            RETURN NEW;
        END IF;

        -- active_store_id cambió → validar consistencia
        IF NEW.active_store_id IS NULL THEN
            IF v_role IN ('encargado'::user_role, 'clerk'::user_role, 'warehouse'::user_role) THEN
                RAISE EXCEPTION 'ERR_STORE_REQUIRED: El rol % requiere una tienda activa asignada.', v_role;
            END IF;
        ELSE
            IF NOT EXISTS (
                SELECT 1 FROM public.user_store_memberships
                WHERE user_id = NEW.id
                  AND store_id = NEW.active_store_id
                  AND status = 'active'
            ) THEN
                RAISE EXCEPTION 'ERR_INVALID_ACTIVE_STORE: El usuario no tiene membership activa en la tienda seleccionada.';
            END IF;
        END IF;
        RETURN NEW;
    END IF;
END;
$function$;
```

> El `active_store_id` que haya fijado el SuperAdmin en las pruebas P5 queda
> como estado de UI inofensivo si se restaura el trigger (o se pone a NULL
> desde el propio selector). NO es necesaria ninguna reversión de datos.

**C-2 — Contingencia de `20261026180000` (restaurar la ACL previa).**
Aplicar solo bajo A-05/A-06 con evidencia de que la dependencia rota es
atribuible a 180000, y como ÚLTIMO recurso (la suite LIVE 12/12 demostró en el
aislado que `authenticated` sigue operativo con la nueva ACL):

```sql
-- RESTAURACIÓN de la ACL PRE-180000 (re-abre la higiene del gate: estado
-- pre-migración; el gate volverá a ROJO con el hallazgo is_superadmin).
BEGIN;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_membership_tenant_consistency() TO PUBLIC, anon, authenticated, service_role;
COMMIT;
```

> Esta restauración re-abre el hallazgo de seguridad documentado (riesgo
> práctico nulo pero higiene pendiente). Cualquier restauración de C-2 debe
> quedar documentada con el defecto de dependencia que la motivó y la
> migración 180000 re-planificada antes de cerrar el incidente.

**C-3 — Recuperación de `active_store_id` de prueba.** Si las pruebas P5
dejaron seleccionada una tienda y el propietario prefiere NULL: el propio
SuperAdmin lo hace desde el selector (nivel administrativo admite NULL), o
como caso extremo, un UPDATE del propio campo sobre SU perfil. No toca
ninguna otra fila, tabla o dato de negocio.

**C-4 — Nada más requiere contingencia.** Las migraciones no crean ni borran
tablas/columnas/trigger/policies; las 5 migraciones anteriores (120000–160000)
quedan intactas por este paquete (precondición P-04) y NO se revierten bajo
ningún criterio de abortado (tampoco la 150000 ni sus 33 filas archivadas).

### §3.10 Evidencia a recopilar tras cada paso (elemento 10)

| Paso | Evidencia obligatoria |
|---|---|
| P0 | Checklist §3.4 firmado con fecha/hora y autor; salidas JSON de §3.5 (Q1–Q10) — equivalen al estado PRE |
| P1 | SHA del merge commit en `main`; URL del deploy de Vercel y estado «Ready» |
| P2 | Salida completa del SQL de 170000 (sin errores); V1+V2 ejecutados INMEDIATAMENTE con sus salidas |
| P3 | Salida completa del SQL de 180000 (sin errores); V3+V4 ejecutados INMEDIATAMENTE con sus salidas |
| P4 | Salidas de V1–V6 completas (JSON/psql) |
| P5 | Por cada prueba F1–F7/G1–G4: captura del selector/módulo con fecha visible; respuestas HTTP relevantes; V6 tras F4 (recarga) y tras re-login |
| P6 | URL del run del SQL Security Gate re-ejecutado + su conclusión (debe ser success/0 hallazgos); captura del log del evaluador (`secdef_public_grant: 0 hallazgo(s)`) |
| P7 | Hashes SHA-256 re-verificados post-activación; expediente actualizado (§18 del CIERRE_FINAL); PR/comentario de cierre del incidente |

---

## §4. Hallazgo del gate de seguridad (`is_superadmin`) — tabla de estados

| Dimensión | Estado | Detalle / evidencia |
|---|---|---|
| **Producción ACTUAL** (verificado hoy, read-only) | 🔴 Hallazgo REAL vivo | `is_superadmin()` EXECUTE para PUBLIC, postgres, anon, authenticated, service_role (`aclexplode(proacl)` — mismo mecanismo del gate). `enforce_membership_tenant_consistency()` igual (trigger, grant inerte). 8 policies dependen de `is_superadmin`. Fuente: auditoría §2.1/§3.5-Q2 de HOY |
| **Esperado TRAS aplicar 170000+180000** | 🟢 Objetivo | `is_superadmin` → postgres+authenticated+service_role (sin PUBLIC/anon); `enforce_membership_tenant_consistency` → postgres+service_role; cuerpos y search_path SIN cambios; policies intactas (V3/V4/V5 de §3.6) |
| **Resultado COMPROBADO en entorno aislado** (CostproE2E, re-verificado HOY read-only) | 🟢 Objetivo ALCANZADO | 180000 aplicada al aislado en c5; HOY se verificó: `is_superadmin` → postgres+authenticated+service_role (SIN public/anon); `enforce_membership` → postgres+service_role; cuerpo 170000 vivo (`FROM public.stores`). Suite LIVE re-ejecutada 12/12 TRAS la aplicación (policies operativas para `authenticated`) |
| **Resultado esperado del gate SQL tras activación** | 🟢 VERDE | `secdef_public_grant` = 0 hallazgos (V4 devuelve 0 filas; el detector no encuentra grants anon/PUBLIC en funciones SECURITY DEFINER no disparadoras); `secdef_no_auth` y `tables_no_rls` ya en verde (101/101 y 0). El canario de ejecución completa se mantiene |
| **Evidencia que FALTA para certificar** | ⏳ PENDIENTE | (1) Aplicación de 180000 a PRODUCCIÓN (P3) con salida V3/V4 real; (2) re-ejecución del SQL Security Gate contra producción (P6) con conclusión success; (3) Security Audit post-170000 sin BODY_DRIFT de `validate_active_store` (la entrada baseline queda inerte; retirarla tras re-exportar el contract surface) |

**Dependencia documentada (exigida por el ciclo 6):** el gate SQL DB Security
**solo pasa tras aplicar `20261026180000` a producción**, porque el check
corre EN VIVO contra el estado real. Ningún check verde anterior certifica
este hallazgo; ninguna allowlist lo oculta (Check 2 sin allowlist por
diseño). **El control de seguridad NO se declara aprobado anticipadamente**:
permanece rojo en CI hasta P3+P6 ejecutados por el propietario, y ese estado
es intencional y documentado en el PR (§17.8 del expediente).

## §5. Verificación del incidente en el entorno aislado

**Decisión del ciclo 6 (conservar, no repetir):** la suite LIVE
`superadmin-store-access-live-db` (12/12) se ejecutó en el aislado contra el
commit de código `2a9020451`. El head auditado `e175e9921` difiere de
`2a9020451` SOLO en documentación (`git diff 2a9020451..e175e9921 --stat` = 1
archivo docs, +49 líneas) — el CÓDIGO es idéntico, por lo que la evidencia
sigue siendo válida para el head. Adicionalmente se re-verificó HOY (read-only)
que el aislado conserva el estado objetivo (§4). No se re-provisionó nada.

**Mapa de las capacidades exigidas por el ciclo 6 → pruebas de la suite:**

| Capacidad exigida | Prueba aislada (12/12 PASS, JWT reales, handler/RPC reales) |
|---|---|
| SuperAdmin enumera las tiendas autorizadas | S1/S1b: lista TODAS las tiendas activas, multi-tenant (bypass plataforma 160000) |
| Selecciona una tienda SIN membresía individual | S2: `userService.setActiveStore` REAL con 0 membresías — ruta EXACTA del incidente; finaliza con 0 membresías (sin crear ninguna) |
| La selección persiste tras recargar o re-login | S3: persiste entre sesiones independientes (re-lectura del perfil) |
| Accede a los módulos operativos autorizados | S4 + suite de contrato LIVE 153/153 (módulos por RLS); c5: verificación de módulos dependientes de tienda activa |
| Un empleado sigue limitado a su tienda | S7: empleado ve 1/1 tienda con membresía; S10: RLS cross-user bloqueada |
| Un admin de organización no puede elevarse a SuperAdmin | S9 anti-spoofing + guardas de 130000 (solo un superadmin gestiona cuentas superadmin; trigger `trg_prevent_self_privilege_escalation` — verificado hoy VIVO en producción); S6: tenant_admin sin membresías ve 0 tiendas |
| Los intentos de acceso cruzado siguen bloqueados | S7 (cross-store 0 filas), S8 (empleado no fija tienda ajena), S5/S5b (tienda inactiva/inexistente rechazadas), S9 (rol desde cliente no aceptado como prueba) |

**Cuenta afectada (`admin@demo.com`) — verificación read-only de HOY (sin
tocar identidad, contraseña, rol ni estado):**

- `profiles`: id `a1111111-1111-1111-1111-111111111111`, `role=superadmin`,
  `tenant_id=5364ccf8-e6cd-4c38-aea8-b167b3b5576f` (Vitallcons conservado),
  `active_store_id=NULL` (síntoma del P0: esperado mientras 170000 no esté
  aplicada), `is_active=true`.
- `auth.users`: `banned_until=NULL` (NO baneada), email confirmado, último
  login 2026-10-25 13:56 UTC.
- Membresías: **0 filas** (por diseño de cuenta de plataforma — sin cambios).

**Estado del incidente:** EN PRODUCCIÓN SIGUE ABIERTO por diseño hasta la
activación (§3): el código correcto está en el PR (sin merge) y el trigger
correcto está pendiente (170000). No se declara recuperado en producción.

## §6. Condiciones de parada (advertencia general)

**NO proceder con la activación si:** (A-01) la rama o el SHA no corresponden
al código auditado; (A-02/A-03) la migración a aplicar en producción no
coincide con la versión esperada (hashes de §3.3); (A-04) existe una
discrepancia de esquema o de historial de migraciones; (A-05) los privilegios
efectivos difieren de lo esperado (V3/V4); (A-06) se rompe una política RLS o
un flujo operativo; (A-07) no puede verificarse la integridad de la cuenta
SuperAdmin; (A-08) el gate detecta una vulnerabilidad real que permanece sin
corregir. En cualquiera de estos casos: detenerse, documentar la salida exacta
de la verificación que lo detectó y NO ejecutar ninguna acción productiva
para «despejar» el bloqueo. La reanudación requiere re-auditoría explícita.

## §7. Pasos que REQUIEREN autorización posterior del propietario

Nada de lo listado abajo fue ejecutado en este ciclo. El paquete queda listo
para que el propietario decida:

1. **Merge del PR #1484** (P1) — decisión exclusiva del propietario.
2. **Despliegue de `main` en Vercel** (P1) — canal del propietario.
3. **Aplicación de `20261026170000` y `20261026180000` a producción** (P2/P3)
   — ejecución por el propietario (SQL editor / Management API / psql) o
   autorización escrita para que el agente las ejecute.
4. **Pruebas funcionales con `admin@demo.com` y un empleado** (P5) —
   involucra sesiones productivas; requiere visto bueno.
5. **Re-ejecución del SQL Security Gate** (P6) y retiro de la entrada
   `validate_active_store` del `source_of_truth_baseline` tras re-exportar el
   contract surface (P7) — cambio al repo que requiere commit/PR adicional.
6. **Cierre formal del incidente** — solo tras P1–P6 verificados.

## §8. Garantía de no-ejecución de este ciclo (preparar y auditar)

Acciones realizadas en el ciclo 6 — TODAS de solo lectura:

- GitHub API (GET): estado del PR #1484, check-runs y runs del head SHA
  `e175e9921`, descarga de logs del job fallido (SQL Security Gate, run
  40199508136). Sin comentarios, sin reviews, sin merges, sin cierres.
- Git local: `fetch`, `ls-remote`, `diff`, `log` — sin push de este ciclo
  (salvo el commit del propio paquete, que es cambio de DOCUMENTACIÓN en la
  rama del PR), sin tocar `main`.
- Supabase Management API: EXCLUSIVAMENTE consultas `SELECT` contra
  `CostproBD` (producción) y `CostproE2E` (aislado). Cero escrituras, cero
  migraciones aplicadas, cero reinicios, cero cambios de credenciales o keys.
- `admin@demo.com`: solo lectura de su perfil/estado; contraseña, rol,
  baneo y membresías INTACTOS.
- PM2 (sandbox del agente): sin reinicios; no es producción.
- `supabase db push` / CLI: NO ejecutado (y advertido contra su uso, §2.1).

Producción queda EXACTAMENTE como estaba al inicio del ciclo: código de
`main` en Vercel (pre-PR), trigger RC3 vivo, ACL con el hallazgo del gate, PR
#1484 abierto, incidente pendiente de activación.

---

## §9. EJECUCIÓN DE LA ACTIVACIÓN — CICLO 7 (cierre definitivo P0)

> **Autorización:** orden del propietario (2026-10-25, misión «CIERRE
> DEFINITIVO P0»): corregir íntegramente, obtener los controles de seguridad
> verdes mediante correcciones legítimas, «completar el merge del PR #1484 y
> desplegar las migraciones productivas que realmente estén pendientes»,
> verificar después del despliegue y entregar el informe final. Modo
> autónomo. Esta sección EJECUTA el paquete §0–§8 (la §8 documenta la
> garantía de no-ejecución del ciclo 6, que este ciclo levanta expresamente
> bajo la autorización anterior).

### §9.1 Reinspección del estado real (antes de tocar nada, 2026-10-25 ~14:45–15:00 UTC)

- **Rama:** `cp-org-001-ciclo4-activacion-superadmin` @ `f8c2fe0d9`
  (sincronizada con origin; 6 commits por delante de `main` @ `f265fb692`,
  0 detrás → base vigente, sin conflictos). Árbol limpio.
- **PR #1484:** open, `mergeable=true`, estado `unstable` (check NO
  requerido en fallo; rama `main` SIN protección de rama configurada), 104
  archivos, +2761/−192, sin revisores solicitados.
- **Checks del head `f8c2fe0d9` (recuento propio vía API):** 8 SUCCESS
  (TypeCheck+Lint+Unit+Build, Unit&Integration, SQL Static, Security Audit,
  TypeScript Security, Allowlist Review, Vercel Preview Comments), E2E
  skipped (política del repo), **SQL DB Security Checks FAILURE** con
  EXACTAMENTE 1 hallazgo: `secdef_public_grant → is_superadmin` (log del job
  121197610480 descargado y conservado). `secdef_no_auth` 101/101 en
  allowlist; `tables_no_rls` 0.
- **Producción (read-only, Management API):** registro de migraciones
  detenido en `20260615000003` (doctrina manual — re-verificado, sin
  sorpresas); `validate_active_store` cuerpo ANTIGUO RC3 (exige membresía a
  admin/superadmin); `is_superadmin` con EXECUTE para PUBLIC(0)+anon+postgres+
  authenticated+service_role (hallazgo del gate REAL);
  `enforce_membership_tenant_consistency` igual (función DISPARADORA, grant
  inerte); 8 policies dependen de `is_superadmin` (3 `stores_tenant_*` +
  5 `tenants`); trigger `trigger_validate_active_store` vivo sobre
  `public.profiles`; `admin@demo.com` = superadmin, `active_store_id` NULL,
  activo, no baneado (auth.users `banned_until` NULL), 0 membresías, tenant
  5364ccf8 conservado; 2 tiendas activas (ENERVIDA-VITALLCONS, Puerto Padre
  VITALLCONS); integridad contable: `payment_transactions` 799 (todas con
  tienda viva, Σ`amount_cup` 65 743 380.97), `transactions` 894, archivo de la
  purga 33 filas (685 400 nativo, 33 huérfanas por diseño — tiendas
  eliminadas), membresías 4, tenants 2; último movimiento contable
  2026-10-23 22:15:24 UTC (SIN cambios desde antes del incidente).

### §9.2 P0 — Prevalidación §3.5 del paquete (solo lectura)

Ejecutadas las consultas Q1–Q10+Q7b EXACTAS del paquete contra CostproBD a
las **14:58:29 UTC** (evidencia `download/c7_prevalidacion.json`):
**ALL_MATCH = True** — los 13 esperados coinciden (Q1 registro histórico; Q2
hallazgo gate PRESENTE como estado pre-deploy + `validate_active_store`
postgres+service_role; Q3 firma del cuerpo antiguo RC3; Q4 3 policies
stores_tenant_*; Q5 8 dependientes; Q6 trigger vivo; Q7/Q7b/Q8/Q9/Q10
cuenta/autenticación/membresías/tiendas/RLS). NOTA técnica: `PUBLIC` es
pseudo-rol (OID 0) ausente de `pg_roles`; su verificación usa el OID.

### §9.3 Batería local sobre el head `f8c2fe0d9`

| Control | Comando | Resultado | Salida |
|---|---|---|---|
| TypeCheck | `npx tsc --noEmit` | PASS | exit 0 |
| Lint | `npx eslint .` | PASS | 0 errores (1385 warnings preexistentes) |
| Suite | `npx vitest run` | PASS | 4055 passed / 66 skipped (live sin credenciales) / **0 failed**; 282 archivos |
| Contrato de seguridad | `node scripts/security-contract-test.cjs` | PASS | 153/153 funciones sin violaciones; PIN REM-INV-2R OK |
| Gate SQL (generación) | `node scripts/ci-gate-sql-checks.js` | PASS | checks generados íntegros |

### §9.4 P2+P3 — Aplicación productiva controlada (2026-10-25 15:07:11–15:07:54 UTC)

Script `scripts` del agente (persistido): guards programáticos de los
criterios de abortado §3.8 ANTES de aplicar; captura de contingencia C-1
(cuerpo pre-170000, 2611 chars) y C-2 (10 grants previos) ANTES de aplicar;
un archivo = UNA query Management API (atómica, como en el ciclo 4);
verificación inmediata tras cada archivo. Evidencia:
`download/c7_aplicacion_prod.json` (pasos con timestamp UTC).

1. **Guards (6/6 OK):** cuerpo RC3 antiguo vivo · hallazgo gate presente
   (PUBLIC+anon) · cuenta superadmin intacta · trigger vivo · 8 policies ·
   baseline contable capturado (799/894/4/33).
2. **P2 — `20261026170000` (15:07:35 UTC):** aplicada sin error (1 query
   atómica). **V1:** cuerpo nuevo VIVO — `valida_stores=true` (rama
   `FROM public.stores`), `branch_costo=true` (rama membresía conservada),
   `prosecdef=true`, `search_path=pg_catalog, public, pg_temp`. **V2:**
   `trigger_validate_active_store` vivo → `validate_active_store()`.
3. **P3 — `20261026180000` (15:07:41 UTC):** aplicada sin error (1 query
   transaccional BEGIN…COMMIT). **V3 grants objetivo EXACTOS:**
   `is_superadmin` → authenticated+postgres+service_role (SIN PUBLIC/anon);
   `enforce_membership_tenant_consistency` → postgres+service_role;
   `validate_active_store` → postgres+service_role (sin cambios).
   **V4 (detector equivalente del gate):** 0 hallazgos.
4. **Verificaciones posteriores §3.6:** V5 8 policies dependientes intactas ·
   V6 cuenta intacta (superadmin, 0 membresías — la corrección NO crea
   membresías) · integridad contable SIN cambios (payment_tx 799, tx 894,
   membresías 4, archivo 33) · RLS 3×true (stores/profiles/
   user_store_memberships).

### §9.5 Re-ejecución del gate REAL contra producción (P6 anticipado, 15:09:51 UTC)

Reproducción exacta del job `sql-db-security-checks`: el SQL generado por
`scripts/ci-gate-sql-checks.js` del propio repo ejecutado contra CostproBD
(vía Management API, solo lectura), salida formateada idéntica a
`psql -t -A -F '|'`, evaluada por el **evaluador real**
`scripts/ci-gate-evaluate.js` (canario incluido: solo se emite si las 4
consultas se ejecutaron completas — equivalente ON_ERROR_STOP=1).

```
✅ secdef_no_auth: 101 hallazgo(s), 101 en allowlist, 0 NO permitidos
✅ secdef_public_grant: 0 hallazgo(s), 0 en allowlist, 0 NO permitidos
✅ tables_no_rls: 0 hallazgo(s), 0 en allowlist, 0 NO permitidos
✅ Resultado: TODO PASS — 3 checks ejecutados completos, 0 hallazgos fuera de allowlist
EVALUATOR_EXIT = 0
```

El hallazgo `is_superadmin` quedó ELIMINADO DE RAÍZ (REVOKE legítimo en
producción por la migración del propio PR — sin allowlist, sin exclusiones,
sin debilitar el check). Evidencia: `download/c7_gate_prod.json` +
`tool-results/c7_gate_results.txt`.

### §9.6 Matriz de migraciones (estado tras P2+P3, verificado)

| Migración | Estado en BD | ¿Registrada en `supabase_migrations`? | Acción c7 | Verificación |
|---|---|---|---|---|
| 20260826120000 | VIVA (ciclo 4) | NO (doctrina manual) | NO reaplicar | auditoría §16 |
| 20261026130000 | VIVA (ciclo 4) | NO (doctrina manual) | NO reaplicar | auditoría §16 |
| 20261026140000 | VIVA (ciclo 4) | NO (doctrina manual) | NO reaplicar | auditoría §16 |
| 20261026150000 | VIVA (efecto verificado: archivo 33 filas + 0 colgantes) | NO (doctrina manual) | NO reaplicar | §2.1 paquete |
| 20261026160000 | VIVA (policies `is_superadmin()` exactas) | NO (doctrina manual) | NO reaplicar | Q4/Q5 |
| **20261026170000** | **VIVA desde 15:07:35 UTC** | NO (doctrina manual) | **APLICADA (P2)** | V1+V2+V5 |
| **20261026180000** | **VIVA desde 15:07:41 UTC** | NO (doctrina manual) | **APLICADA (P3)** | V3+V4+gate real 0 hallazgos |

Nota: el registro `supabase_migrations` sigue detenido en `20260615000003`
porque la doctrina del proyecto aplica las migraciones de activación por
Management API controlada (ciclo 4) y NO mediante `supabase db push`
(advertencia §2.1). Ninguna migración quedó pendiente para la recuperación
del incidente.

### §9.7 SHA definitivo, orden de activación y estado esperado del CI

- **SHA definitivo del PR #1484:** el commit de esta actualización del
  expediente (docs-only; el tree de CÓDIGO es idéntico al validado en
  `f8c2fe0d9` — 8 checks verdes + hallazgo único de producción). El CI
  completo corre sobre él tras el push; su resultado y el del merge se
  registran en §9.8.
- **Orden de activación ejecutado:** P2+P3 (este ciclo, 15:07 UTC) → push del
  expediente → CI del SHA definitivo (se espera TODO VERDE, incluido SQL DB
  Security — el hallazgo ya no existe en producción) → **merge P1** →
  despliegue Vercel de `main` → verificación post-despliegue §3.6/§3.7 →
  §9.8. El paquete §3.2 sanciona este orden: «P3 es independiente del código
  y puede ir antes o después de P1»; «P2 SIN P1» deja el incidente tal cual
  (la app antigua sigue exigiendo membresía app-side) — CERO regresión
  durante la ventana de despliegue.
- **Ventana de estados intermedios:** entre P2/P3 y el despliegue de código,
  la BD admite selección admin-level pero la app en producción (pre-merge)
  sigue aplicando su propio guard — exactamente el estado pre-misión, sin
  nueva exposición (RLS de datos sin cambios; policies intactas; grants
  endurecidos).
- **Post-despliegue (P5) — capacidad verificable sin sesión del dueño:**
  verificación de la cadena completa con transacciones ROLLBACK (no
  destructivas) sobre la cuenta real + verificación del despliegue del
  código. La confirmación interactiva final (login del dueño con
  admin@demo.com: selector 2/2 tiendas → seleccionar → recargar → persiste →
  módulos operativos) queda explícitamente indicada como ÚLTIMA evidencia del
  dueño; el agente NO posee credenciales de la cuenta ni puede crearlas
  (prohibido crear membresías/superadmins con service_role).
