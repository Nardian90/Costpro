# Expediente — CP-NOMINA-SUPERADMIN-TRANSVERSAL (2026-11-21)

## Misión
La vista Inicio → RECURSOS HUMANOS → Trabajadores y Comisiones (tienda Ferrocarril,
`8eb56fa3-7e22-408e-a44b-8f14cdd7f52f`) rechazaba la creación de trabajadores con el
SuperAdmin de plataforma (`admin@demo.com`, rol `superadmin`, sin membresías de tienda
por diseño §6 de 20260826120000). Error visible en UI:

```
Error al crear trabajador: new row violates row-level security policy for table 'workers'
```

Objetivo del propietario: acceso transversal total («debo tener acceso a todo») y
nómina operable de principio a fin.

## Causa raíz (diagnóstico contra producción viva, 2026-11-21)
- El POST /api/workers usa el cliente autenticado del usuario
  (`getSupabaseForSession` → `getSupabaseAuthClient(token)` → RLS con el JWT real).
- Las 17 políticas `authenticated` del dominio trabajadores/comisiones creadas por
  20260626000003 (FIX C4) comparan estrictamente `profiles.role = 'admin'`
  (`p.role = 'admin'::user_role`) → el rol `superadmin` NO pasa el WITH CHECK del INSERT.
- Tablas afectadas: `workers` (4), `commission_rules` (4), `commission_payments` (4),
  `sales_transactions` (4), `commission_rule_versions` (SELECT), `commission_rule_products`
  (4, membership-only — sin bypass global, ni siquiera para admin global).
- El resto del sistema SÍ reconoce al superadmin (incoherencia residual):
  - `can_read_payroll_store()` abre con `IF is_superadmin() RETURN true` (20261114180000).
  - Escritura de nómina por RPCs SECURITY DEFINER con gates
    `can_manage_payroll_as` / `has_store_access_as` (incluyen superadmin desde 2026-10-26/27).
  - `commission_reception_links` vía `is_global_admin()`; `transactions` vía `is_admin()`.
  - Regla establecida CP-ORG-001 §16/§17 + 20261026160000: el superadmin es transversal.

## Solución
Migración idempotente `supabase/migrations/20261121240000_cp_nomina_superadmin_transversal.sql`:
- Recrea las 17 políticas por nombre (DROP POLICY IF EXISTS + CREATE POLICY).
- Sustituye la comparación estricta por `public.is_admin()` (cubre `admin`+`superadmin`;
  espejo canónico de `is_global_admin()` y del primer tramo de `can_read_payroll_store()`).
- Añade bypass global a `commission_rule_products` (membership-only).
- Cambio ADITIVO: el admin ordinario y los roles de tienda (manager/encargado/clerk/…)
  conservan EXACTAMENTE su alcance previo. La única ganancia nueva es del superadmin.

## Validación (REGLA DE ORO: aislado primero, producción una sola vez)
1. BD E2E aislada (CostproE2E `lguovmvrozxgssupkwpf`):
   - `verify-remote-e2e.mjs` → "Base aislada PREPARADA" (centinela OK).
   - Migración aplicada (re-ejecutada 2x — idempotente, sin daño).
   - Post-fix: 25 políticas `authenticated` del dominio revisadas, 0 estrictas restantes.
   - Test `supabase/tests/nomina_superadmin_rls_test.sql` (BEGIN/ROLLBACK): PASS.
     - superadmin: crear/editar trabajador, regla de comisión, producto de regla,
       tarifa salarial vía RPC `set_worker_salary_rate`, lecturas del dominio → OK.
     - manager: crea en su tienda; NO crea en tienda sin membresía; NO borra → OK.
     - clerk: NO crea trabajadores → OK.
   - Residuos tras tests: 0.
2. Producción (`wthkddeleylijmonclxg`) — aplicada UNA VEZ el 2026-11-21 (~13:45 UTC):
   - Verificación post-aplicación: 25 políticas revisadas, 0 estrictas restantes.
   - Migración server-side (sobrevive al sandbox; re-ejecución segura por guard SKIP).

## Verificación E2E real (camino completo de la app, contra producción)
Login real (Supabase password grant) como `admin@demo.com` → JWT usuario → servidor app:
- `GET /api/workers?store_id=Ferrocarril` → 200 (0 trabajadores antes).
- `POST /api/workers` (el EXACTO que fallaba en UI) → **201 CREADO**
  (Moises VitalIcons, CI 11111111111, id `7a6b6d1c-0034-4f81-a569-05e9d51ed1d7`).
- Cadena nómina con la misma sesión: workers+tarifa vigente (include_rate), reglas de
  comisión, resumen de comisiones y nóminas → **todos HTTP 200**.

## Notas de seguridad
- Sin secretos en el diff (escaneado: 0 coincidencias de patrones de credenciales).
- El bypass es solo para el rol de PLATAFORMA `superadmin` (resuelto server-side por
  `profiles.role`; nunca por entrada del cliente).
- Los DELETE siguen reservados a nivel admin (`is_admin()`); un DELETE bloqueado por RLS
  borra 0 filas sin excepción (aserción del test verifica permanencia de la fila).

## Lecciones registradas
- Un DELETE filtrado por RLS NO lanza excepción: el test debe asertar que la fila sigue.
- Las tablas de nómina son SELECT-only para `authenticated` (privacidad CP-SEC); el
  camino de escritura real es RPC — los tests deben ejercitar el RPC, no INSERT directo.
