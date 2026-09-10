# REM-F4-06c — DESIGN.md
## Reparación quirúrgica de OF-1 + OF-3 en Fiscal Close (repair gate)

Fecha: 2026-09-09/10 · Base: 5c6239e0fbd44b8e202482048c49b80de0bfee72 (REM-F4-06b CLOSED, HEAD==origin/main)

---

## OF-1 — Wiring ruta→RPC en `lock_fiscal_period`

### Causa raíz (cadena de eventos, demostrada en migraciones)
1. `20260726000002_v1_2` creó `lock_fiscal_period(p_store_id uuid, p_year int, p_month int)`
   RETURNS jsonb, SECDEF, con identidad del actor vía `auth.uid()` (check admin + `locked_by=auth.uid()`).
2. `20260902200923_w9_f06_c2_hardening.sql` revocó EXECUTE a `authenticated` y lo concedió
   SOLO a `service_role` (endurecimiento deliberado: los RPC fiscales solo se ejecutan desde
   código servidor). Efecto colateral: bajo service_role, `auth.uid()` es estructuralmente NULL,
   por lo que el check interno `v_role != 'admin'` fallaría SIEMPRE incluso con la firma correcta.
3. La ruta `src/app/api/fiscal-close/route.ts` (único consumidor runtime, línea 75-80) llama
   `{p_store_id, p_user_id, p_year, p_month}` (4 args) — la firma real tiene 3 params.
   PostgREST no resuelve la función → PGRST202 → HTTP 500.
   Reproducido en vivo (03_OF1_PRE_HTTP): `Could not find the function
   public.lock_fiscal_period(p_month, p_store_id, p_user_id, p_year) in the schema cache`.

### Contrato actual (PRE)
- RPC: `lock_fiscal_period(p_store_id uuid, p_year integer, p_month integer)` — sin identidad
  inyectable; dependía de `auth.uid()`, imposible bajo su único rol con EXECUTE (service_role).
- Ruta: envía `p_user_id: session.user.id` (identidad NextAuth server-side; el cliente NO
  controla este valor — zod `closeSchema` no lo acepta y las claves desconocidas se descartan).

### Contrato esperado (POST) — decisión §5/§10
El RPC SÍ necesita conocer al usuario (`locked_by` debe ser el admin real que bloquea).
`auth.uid()` no está disponible bajo service_role (ACL endurecido por w9_f06_c2 — NO se debilita).
El mecanismo server-side equivalente YA ES CANÓNICO en este dominio: el patrón anti-spoofing
`v2_12_9_spoofing_p_user_id.sql` (2026-07-27) lo estableció para `close_fiscal_period` y 30 RPCs más:
```
v_uid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END
```
La identidad pasa por parámetro SOLO desde código servidor (service_role), y el valor lo toma
la ruta de la sesión NextAuth (server-side), nunca del body del cliente.

### Modificación exacta (migración nueva — CERO cambios en src/)
`supabase/migrations/20260909000004_rem_f4_06c_fiscal_close_rpc_contract.sql`:
- `CREATE OR REPLACE FUNCTION lock_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid DEFAULT NULL)`:
  - añade `p_user_id DEFAULT NULL` (compatible con llamadas de 3 args);
  - resuelve `v_admin_id` con el patrón canónico v2_12_9;
  - check admin sobre `v_admin_id` (mismo error `ERR_ADMIN_ONLY`);
  - `locked_by = v_admin_id` (además corrige que locked_by quedara NULL bajo service_role);
  - PRESERVA: SECDEF, `search_path='public'`, owner `postgres`, ACL (solo postgres/service_role,
    intacta), RETURNS jsonb, precondición `status='closed'`, error `ERR_NOT_CLOSED`, mensajes.
- La ruta NO cambia: su llamada actual `{p_store_id, p_user_id, p_year, p_month}` pasa a resolver
  la firma de 4 args. Difer mínimo posible = 1 migración, 0 archivos src/.

### Seguridad de identidad (§10/§13)
- Cliente → ruta: `user_id` NO es parte del schema zod; un body con `user_id` arbitrario se
  descarta (strip de claves desconocidas) — probado en 12_SECURITY (user spoofing).
- Ruta → RPC: `p_user_id = session.user.id` (derivado del JWT de sesión en el servidor).
- Cliente → RPC directo: EXECUTE denegado a anon/authenticated (42501, heredado de w9_f06_c2,
  re-verificado POST). Solo postgres/service_role pueden llamar; ambos son código servidor.
- El RPC re-verifica rol admin del uid resuelto (defensa en profundidad independiente de la ruta).

### Consumidores afectados
- `src/app/api/fiscal-close/route.ts` (lock): resuelve de nuevo — SIN edición.
- No existe ningún otro llamador runtime (censo 06_SIBLING: único consumidor src/ de
  lock_fiscal_period = esa ruta; sin llamadas UI directas a PostgREST).

---

## OF-3 — `close_fiscal_period` escribe en tabla inexistente

### Causa raíz (arqueología §7, demostrada)
1. `20260726000002_v1_2` creó `fiscal_closings` (modelo canónico V2: status
   open→closed→locked, UNIQUE(store,year,month), closed_by/closed_at/locked_by/locked_at,
   RLS, FKs) y `close_fiscal_period` que ESCRIBÍA en `fiscal_closings`
   (UPDATE status='closed' o INSERT con totales; líneas 441-489).
2. `20260727000006_v2_12_9_spoofing_p_user_id.sql` reescribió `close_fiscal_period`
   (4 args, p_user_id DEFAULT NULL, patrón service-role) — SIGUIÓ escribiendo
   `fiscal_closings` y devolviendo `{status, closing_id, total_sales, total_devolutions,
   total_purchases, total_commissions}`. Esta es la última versión CANÓNICA del RPC.
3. `20260727000012_v2_12_18_fix_5_residual_is_not_null.sql` REEMPLAZÓ el cuerpo con una
   versión que escribe `fiscal_period_closures` (store_id, year, month, period_start,
   period_end, transaction_count, total_revenue, closed_by, closed_at) — tabla que NO TIENE
   ningún CREATE TABLE en toda la cadena de migraciones (censo: único archivo que la
   menciona = el cuerpo de esa misma función). REGRESIÓN introducida por v2_12_18.
4. Censo de relkinds (02_OF3_FORENSICS s05): `fiscal_period_closures` no existe como
   tabla (r), vista (v), vista materializada (m), secuencia (S), foránea (f) ni partición (p);
   tampoco como función. → todo `action='close'` = 42P01 → HTTP 500 (reproducido en vivo).
5. Prueba arquitectónica adicional: `lock_fiscal_period` exige `status='closed'` en
   `fiscal_closings`; con el RPC roto, NADA lleva esa fila a 'closed' vía negocio → el
   flujo OPEN→LOCK→CLOSE completo es inoperante. El modelo canónico es UNO: `fiscal_closings`.

### Decisión arquitectónica: OPCIÓN C (demostrada, no asumida)
- **Opción A descartada**: el RPC no es «obsoleto»; es la vía de negocio de la acción
  `close` de la ruta/UI actual (FiscalCloseView botón «Cerrar» → POST action='close').
- **Opción B descartada**: crear `fiscal_period_closures` duplicaría el modelo fiscal
  (§8: prohibido; violaría ONE canonical fiscal-period model) y dejaría el lock roto
  (nadie marcaría fiscal_closings.status='closed').
- **Opción C ELEGIDA**: el RPC quedó apuntando a un nombre incorrecto/inexistente tras la
  regresión v2_12_18; debe escribir la estructura existente y canónica `fiscal_closings`.
- **Opción D descartada**: no hay evidencia arquitectónica de coexistencia legítima:
  `fiscal_period_closures` jamás existió, no tiene FK/UI/queries/consumidores, y sus
  columnas (period_start/period_end/transaction_count/total_revenue) son derivables del
  modelo canónico.

### Modelo canónico (fuente de verdad)
`public.fiscal_closings` — creado en 20260726000002, protegido por:
- RLS (fiscal_closings_select/insert/update sobre authenticated);
- `prevent_fiscal_closing_edit()` trigger BEFORE UPDATE/DELETE (inmutabilidad de locked, v2_19_5);
- `trg_audit_fiscal_closings` AFTER INSERT/UPDATE → `audit_fiscal_closings_changes()`
  (integridad UUID reparada por REM-F4-06b: record_id = NEW.id uuid, sin ::text).
- UNIQUE(store_id, period_year, period_month) — base de idempotencia estructural.

### Modificación exacta
Misma migración `20260909000004`:
- `CREATE OR REPLACE FUNCTION close_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid DEFAULT NULL)`
  = **restauración del cuerpo canónico v2_12_9** (que escribía fiscal_closings), con:
  - resolución de identidad service-role-aware (patrón v2_12_9, idéntico a PRE);
  - autorización `has_store_access_as(v_uid, p_store_id)` → `ERR_UNAUTHORIZED` (idéntica);
  - fila existente → `UPDATE fiscal_closings SET status='closed', closed_by=v_uid,
    closed_at=now(), updated_at=now() WHERE id=... AND status='open'`; si no encontró
    (closed/locked) → `ERR_PERIOD_LOCKED` (idéntico);
  - fila inexistente → cálculo de totales (transactions/devolutions/receipts/commission_payments,
    idéntico) + `INSERT INTO fiscal_closings (... status='closed', total_*, total_cash_balance
    = sales - devolutions - commissions, closed_by=v_uid, closed_at=now())`;
  - retorno canónico v2_12_9: `{status:'success', closing_id, total_sales, total_devolutions,
    total_purchases, total_commissions}`;
  - PRESERVA: firma 4 args, SECDEF, search_path 'public,pg_temp' (valor actual del objeto),
    owner, ACL (solo postgres/service_role), RETURNS jsonb.
- **Auditoría (impacto)**: la versión rota insertaba manualmente en audit_logs una fila
  ('CLOSE_FISCAL_PERIOD', 'fiscal_period_closures', record_id=closure_id_fantasma). La
  versión restaurada NO inserta auditoría manual: el UPDATE/INSERT sobre fiscal_closings
  dispara `trg_audit_fiscal_closings` → UNA fila de auditoría por operación con
  `record_id = fiscal_closings.id` (uuid real, contrato F4-06b). Elimina la doble
  auditoría potencial y audita el registro canónico (§19). Los códigos de auditoría
  automáticos son FISCAL_CLOSING_UPDATED / FISCAL_CLOSING_CREATED.
  **Puente de actor (§19)**: el trigger audit usa `auth.uid()`, que es NULL en la vía
  HTTP service_role. Canónico sistémico del codebase: la auditoría HTTP lleva actor real
  (CREATE_SALE_V2: 4.846/4.846 filas con user_id). Ambos RPCs remediados establecen
  `set_config('request.jwt.claims', {sub: actor_resuelto, role:'authenticated'}, true)`
  (local a la transacción) con la identidad 100% server-side ya resuelta y autorizada,
  de modo que el trigger audite al ACTOR real. El trigger F4-06b permanece intacto.
  Sin p_user_id (y sin claims) → GUC no se establece → comportamiento previo inalterado.
- **Idempotencia (impacto)**: contrato canónico verbatim — close sobre periodo ya
  closed/locked → `ERR_PERIOD_LOCKED` (0 duplicados, 0 doble auditoría, 0 doble efecto);
  lock sobre periodo no-closed → `ERR_NOT_CLOSED`; retry de lock sobre locked →
  `ERR_NOT_CLOSED`. Idempotencia estructural garantizada por UNIQUE(store,year,month) +
  cláusulas `status='open'`/`status='closed'` en los WHERE. No se inventa idempotencia nueva.
- **Rollback**: DDL transaccional (CREATE OR REPLACE). Reversión = migración nueva con los
  cuerpos PRE documentados en raw/pre_function_defs.txt (no se edita historia). El fallo de
  cualquier guard POST hace rollback TOTAL de la migración.

---

## Scope — lo que NO se modificará
- ENERVIDA y PUERTO PADRE (READ ONLY absoluto; snapshot PRE/POST §20).
- Migraciones históricas (20260726000002, 20260727000006, 20260727000012, 20260909000003, …).
- `fiscal_closings`: esquema, RLS, policies, constraints, triggers, tipos.
- `audit_logs`: esquema/tipos (record_id sigue uuid); triggers de auditoría (F4-06b intacto).
- `audit_commission_payments_changes` (F4-06) y `audit_cash_closures_changes` (referencia).
- ACL de ambos RPCs (solo postgres/service_role — endurecimiento w9_f06_c2 intacto).
- `src/` — CERO cambios (la ruta ya construye la llamada conforme al contrato restaurado).
- Componentes no relacionados con Fiscal Close; roles.ts; auth-middleware; CSRF; rate-limit.
- RLS de otras tablas; tipos TypeScript compartidos (el contrato de la ruta no cambia).
- F4-03/F4-04/F4-06/F4-06b y sus objetos reparados.

## Hallazgos nuevos descubiertos en este gate (§29 — DOCUMENTAR, NO CORREGIR)
- **NF-1 (P1)**: POST `/api/fiscal-close` con `action='status'` cae al default
  `rpcName='close_fiscal_period'` (route.ts línea 68) → una «consulta de estado» por POST
  CERRARÍA el periodo (efecto destructivo en acción de lectura). Mitigado por: la UI solo
  usa GET para status (FiscalCloseView) y el default de zod es 'status'. Evidencia: 02/06.
  Recomendación: gate futuro — mapear action='status' a solo-lectura o rechazarlo en POST.
- **NF-2 (P3)**: `locked_by` de las filas fixture quedaron NULL en F4-06b (los UPDATE de
  prueba no seteaban locked_by vía RPC). Con este fix, el lock HTTP siempre estampa
  `locked_by = admin real`. No acción requerida.

## Principio rector — cadena verificada POST-fix
AUTHENTICATED USER (NextAuth session, server-side)
→ STORE AUTHORIZATION (canManageStore en ruta + has_store_access_as + role admin en RPC)
→ CORRECT RPC CONTRACT (lock 4-args-compatible, close escribe modelo canónico)
→ CANONICAL FISCAL MODEL (UNO: fiscal_closings, sin duplicados)
→ ATOMIC DB TRANSACTION (RPC + trigger en una transacción; fallo ⇒ rollback total)
→ AUDIT UUID INTEGRITY (record_id = fiscal_closings.id uuid — herencia F4-06b)
→ IDEMPOTENT RESULT (UNIQUE + precondiciones status; errores canónicos)
→ MULTISTORE SAFE (RLS intacta; store_id siempre del recurso; cross-store DENY)
