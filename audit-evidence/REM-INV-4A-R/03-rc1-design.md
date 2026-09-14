# 03-rc1-design.md — RC-1: Diseño de la remediación del bypass de supervisor

## 1. Vector original (REM-INV-4A, F-04-A2, P1)

`create_sale_v2` §11 validaba la autorización del supervisor para descuentos ≥15% así:

```sql
IF v_effective_discount_pct >= 15 THEN
  IF p_supervisor_user_id IS NULL THEN
    RAISE EXCEPTION 'ERR_SUPERVISOR_REQUIRED: ...';
  END IF;
  IF NOT public.has_store_role_as(p_supervisor_user_id, p_store_id, ARRAY['admin','manager']) THEN
    RAISE EXCEPTION 'ERR_SUPERVISOR_UNAUTHORIZED';
  END IF;
END IF;
```

`p_supervisor_user_id` es **CLIENT_CONTROLLED**: PostgREST lo acepta de cualquier usuario
`authenticated` (EXECUTE=PUBLIC+authenticated), y `has_store_role_as` otorga bypass
tenant-blind a cualquier profile con rol `admin`/`superadmin`. Resultado: un clerk
autenticado satisfacía el requisito citando el UUID de cualquier administrador de
cualquier tenant, sin credenciales de supervisor (staging D4/D5 = EXPLOITABLE).

**Trust boundary rota**: el cliente decidía la identidad del supervisor; el RPC la
trataba como prueba de autorización. La decisión de autorización debe derivarse de
identidad server-side (JWT firmado por la plataforma) o de un canal server↔server
confiable (service_role), nunca de un UUID citado por el cliente.

## 2. ¿Por qué `has_store_role` no era el defecto?

Las 4 sobrecargas helpers (2-arg, 3-arg, `_as`, `has_store_access*`) verifican
memberships reales contra `auth.uid()` (o contra `p_user_id` solo bajo service_role
— patrón H-7). El defecto estaba en el **caller** (`create_sale_v2`), que le pasaba
un parámetro client-controlled como identidad. Modificar `has_store_role_as` no era
necesario ni suficiente (§1 alcance).

## 3. Análisis del flujo legítimo (§6/§8 — no asumido)

Censo de callers LIVE verificado:

| Caller | Cliente Supabase | `auth.role()` en el RPC | ¿Envía supervisor? |
|---|---|---|---|
| `POST /api/pos/checkout` | `getSupabaseAdmin()` = service_role | `service_role` | reenviaba el UUID del cliente sin verificarlo |
| `POST /api/sync/batch` (offline replay) | JWT del usuario | `authenticated` | `op.payload.p_supervisor_user_id` (en la práctica NULL: la UI nunca lo encola) |
| Browser → RPC directo | anon key + JWT | `authenticated` | vector de ataque (0 usos legítimos en src/) |

Hallazgo de UX forense: `SupervisorAuthModal` valida credenciales server-side vía
`/api/auth/supervisor-check` (`signInWithPassword` + verificación de rol/membership),
pero **descartaba la prueba**: los consumidores llaman `confirmAuthorization()` y el
payload de checkout nunca incluía `supervisor_user_id`. El flujo v2 con descuento
≥15% era fail-closed end-to-end (el RPC devolvía `ERR_SUPERVISOR_REQUIRED`).

## 4. Opción elegida — §9-A (reutilizar el mecanismo existente) + cierre en frontera DB

**RC-1 tiene dos mitades, ambas estrictamente necesarias:**

### Mitad DB (frontera servidor/DB — §13/§46)

`create_sale_v2` §11 queda:

```sql
IF v_effective_discount_pct >= 15 THEN
  IF p_supervisor_user_id IS NULL THEN
    RAISE EXCEPTION 'ERR_SUPERVISOR_REQUIRED: ...';
  END IF;
  -- RC-1 (REM-INV-4A-R): client-supplied UUID ≠ prueba de autorización
  IF auth.role() <> 'service_role'
     AND p_supervisor_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'ERR_SUPERVISOR_UNAUTHORIZED';
  END IF;
  IF NOT public.has_store_role_as(p_supervisor_user_id, p_store_id, ARRAY['admin','manager']) THEN
    RAISE EXCEPTION 'ERR_SUPERVISOR_UNAUTHORIZED';
  END IF;
END IF;
```

Propiedades demostradas en staging:
- `authenticated` + UUID arbitrario/foráneo/cross-tenant → **DENY** (A4-A7, D4/D5 POST).
- `authenticated` + UUID propio: identidad server-verificada (auth.uid() del JWT
  firmado por la plataforma); el acceso a admin/manager se sigue verificando contra
  `has_store_role_as` → solo un manager/admin real puede auto-autorizarse (A8a PASS,
  A9 self-clerk DENY).
- `service_role` (routes server) puede inyectar cualquier UUID: el route es el
  responsable de la prueba de credenciales — verificado por la mitad app.

Preservado verbatim: firma (21 args), `SECURITY DEFINER`, `SET search_path TO
'public','pg_temp'`, proacl, guard anti-spoofing v_uid (contrato de seguridad), todo
el resto del cuerpo (md5 diff = solo §11).

### Mitad app (vinculación de la prueba al punto de consumo — §7/§10)

1. `supervisor-check` emite `supervisor_token` = HMAC-SHA256(NEXTAUTH_SECRET) sobre
   `{v, sup, opr, st, iat, exp, jti}`, TTL 300s, ligado a (supervisor, operador,
   tienda). Stateless, sin nuevos objetos DB.
2. `checkout` verifica firma (timingSafeEqual), expiración y binding exacto
   (sup===supervisor_user_id, opr===session.user.id, st===store_id) antes de
   reenviar el UUID al RPC; sin token o inválido → 403.
3. `SupervisorAuthModal` almacena la prueba (supervisor-auth-store) y
   `usePOSCheckout` la envía en el payload; se consume tras venta exitosa
   (1 venta por autorización). Esto además **repara** el flujo legítimo ≥15% de la
   UI (antes fail-closed), cumpliendo A8.

Vínculo exigido por §10: SUPERVISOR ID (validado por password server-side) +
AUTHENTICATED SESSION (operador del JWT) + VALID SUPERVISOR AUTHORIZATION (rol
verificado en supervisor-check) — unido criptográficamente por el token.

## 5. Boundary de tenant (§11)

- UUID client-supplied cross-tenant → imposible (gate DB + token).
- Token cross-tenant: el token está ligado a `st` (tienda de la venta); un token de
  la tienda A no autoriza la tienda B (STORE_MISMATCH).
- Global admin auto-autorizándose con su propia sesión: permitido por diseño
  pre-existente (`has_store_role_as` admin-bypass es tenant-blind por semántica del
  producto, fuera del alcance RC-1; la identidad es server-verificada, no citada).
  Registrado como comportamiento observado (§26, x5) para gates futuros.

## 6. Residuales documentados (no reparados en este gate, §55)

- Replay del token por el MISMO operador en la MISMA tienda dentro del TTL (modelo
  de caché de aprobación de manager estándar POS; P3).
- `sync/batch` con UUID foráneo encolado offline → DENY fail-closed (la UI nunca
  encola supervisor UUID; operación permanece en cola, no se pierde data).
- RC-3..RC-6 (get_transferable_stores, 4 RPCs de servicios, audit pollution, EXECUTE
  PUBLIC 3-arg) permanecen registrados de REM-INV-4A.

## 7. Objetos modificados (§1 alcance estricto)

| Objeto | Cambio |
|---|---|
| `supabase/migrations/20260915000001_rem_inv_4a_r_rc1_rc2_supervisor_gate_audit_acl.sql` | nuevo (CREATE OR REPLACE create_sale_v2 + REVOKEs RC-2) |
| `public.create_sale_v2` (LIVE) | §11 gate (mitad DB) |
| `src/lib/supervisor-token.ts` | nuevo (HMAC issue/verify, server) |
| `src/app/api/auth/supervisor-check/route.ts` | emisión del token |
| `src/app/api/pos/checkout/route.ts` | verificación del token antes del RPC |
| `src/components/views/terminal/views/pos/supervisor-auth-store.ts` | nuevo (almacén cliente del token) |
| `src/components/views/terminal/views/pos/SupervisorAuthModal.tsx` | almacena la prueba |
| `src/components/views/terminal/views/pos/usePOSCheckout.ts` | envía y consume la prueba |

Ningún otro RPC, función de autorización, tabla, policy, grant, trigger, checkout V1,
`void_transaction` ni `get_transferable_stores` fue modificado (probado en §36/§45).
