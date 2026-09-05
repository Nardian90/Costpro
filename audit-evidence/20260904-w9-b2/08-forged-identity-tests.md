════════════════════════════════════════════════════════════════════
W9.5 — B-2 · 08-forged-identity-tests.md
GATE 6-Tests D/E — FORGED USER ID y PREVALENCIA DE CALLER IDENTITY
════════════════════════════════════════════════════════════════════

Base contractual (cuerpo live):
  v_caller_uid := CASE WHEN auth.role()='service_role'
                       THEN COALESCE(p_user_id, auth.uid())
                       ELSE auth.uid() END
  ⇒ p_user_id SOLO se considera con la clave service_role (servidor). Para
    authenticated/anon la identidad proviene EXCLUSIVAMENTE del JWT verificado.

## Test D1 — forger NO autorizado intenta robar identidad de un miembro válido

P3a_forged_puserid_by_unauthorized:
  caller: 037b50b2… (authenticated; SIN acceso a tienda A)
  envía:  p_user_id = 03524340… (miembro activo de tienda A — forjado)
  target: TX_A (tienda A)
  → EXCEPTION 'ERR_UNAUTHORIZED'
  ⇒ El id forjado NO confiere acceso: la validación usa auth.uid() real
     (037b50b2…), que no tiene membresía en tienda A. DENIED.

## Test D2/E — caller autorizado envía identidad de admin (escalada de atribución)

P3b'_forged_puserid_admin_by_member:
  caller: 03524340… (authenticated; miembro activo tienda A) · target: TX_A2 (tienda A)
  envía:  p_user_id = a1111111… (admin global — forjado)
  → SUCCESS {"status":"success","transaction_id":"b2c0ffee-…d4"}
  → audit_logs VOID_SALE user_id = 03524340… (¡NO el admin forjado!)
  → stock_movements.created_by = 03524340…
  ⇒ La operación se PERMITE (el caller ES miembro legítimo de la tienda) pero
     la ATRIBUCIÓN queda en el caller REAL. No hay suplantación posible:
     ni de acceso (D1) ni de atribución (D2).

## Test E — suplantación por parámetros vs JWT (PostgREST real)

En la ruta de producción PostgREST setea request.jwt.claims SOLO del JWT cuya
firma verificó (plataforma Supabase Auth). No existe parámetro RPC que altere
auth.uid(). El GUC no es seteable por clientes (la API de PostgREST no expone
settings arbitrarios). Probe P0 documenta el mecanismo y P5 (anon real) demuestra
que sin JWT de usuario la función deniega.

## service_role (ramo trusted) — no es bypass de usuario

P12: service_role SIN p_user_id → ERR_UNAUTHORIZED (exige identidad).
P6c: service_role + p_user_id de miembro válido → SUCCESS (uso legítimo, el
     mismo que hace /api/reverse con session.user.id de la sesión verificada
     en el middleware withAuth del servidor Next.js).
La clave service_role NUNCA está en el cliente (secreto de servidor), por lo
que la rama COALESCE(p_user_id, …) es inalcanzable desde el navegador.

## Conclusión

FORGED IDENTITY → DENIED (acceso) / INEFFECTIVE (atribución)
CALLER IDENTITY → SIEMPRE auth.uid() real para clientes; p_user_id ignorado.
