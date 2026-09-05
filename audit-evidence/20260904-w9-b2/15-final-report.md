════════════════════════════════════════════════════════════════════
W9.5 — B-2 · 15-final-report.md
§26 — Informe final obligatorio (10 preguntas) + veredicto
════════════════════════════════════════════════════════════════════

## VEREDICTO

    B-2 — CLOSED / NO ISSUE

(CASO A del GATE 12: autorización correctamente implementada a nivel
identidad+tienda, demostrada con probes live; sin fix requerido.)

## Las 10 preguntas

### 1. ¿Puede `authenticated` invocar directamente `void_transaction`?
SÍ — el ACL concede EXECUTE a authenticated (y por grant PUBLIC también es
alcanzable por anon). Es la ruta legacy activa (POS-undo, SalesHistory). Pero
"poder invocar" ≠ "poder anular": la autorización vive en el cuerpo (P1–P13).

### 2. ¿Puede un usuario autenticado anular una transacción de otra tienda?
NO. Probes P2 (B→A) y P7 (A→B): ERR_UNAUTHORIZED en ambas direcciones. El
store_id validado es el de la FILA objetivo (no parametrizable). Control
positivo: los mismos callers SÍ anulan en su propia tienda (P1).

### 3. ¿Puede falsificar `p_user_id` (existe)?
Existe (DEFAULT NULL) pero es IGNORADO para todo caller no-service_role.
- Forger sin acceso (P3a): ERR_UNAUTHORIZED — el id forjado no confiere acceso.
- Forger con acceso (P3b'): SUCCESS pero audit/movement atribuidos al UID REAL,
  no al forjado. No hay suplantación de acceso ni de atribución.
- La rama que honra p_user_id exige la clave service_role (secreto de servidor);
  sin p_user_id, service_role también es denegado (P12).

### 4. ¿La función utiliza `auth.uid()` real?
SÍ — `v_caller_uid := auth.uid()` para toda rama no-service_role. auth.uid()
lee request.jwt.claims que PostgREST setea SOLO desde el JWT verificado por
Supabase Auth (P0 documenta el mecanismo; P5 demuestra el rechazo sin JWT).

### 5. ¿La función valida membresía/permisos server-side?
SÍ — has_store_access_as(caller, store_id de la fila): admin global O membresía
ACTIVA en user_store_memberships. Evaluada ANTES de cualquier mutación, bajo
FOR UPDATE. Alcance: nivel TIENDA e IDENTIDAD. No valida ROL (manager/clerk)
ni PROPIEDAD (seller) ni ventana temporal ni status≠completed — esa es la
política server-side vigente de TODA la familia void/reverse incluida la ruta
canónica (ver 6, 9 y BACKLOG B-8/B-9).

### 6. ¿SECURITY DEFINER permite saltarse RLS?
TÉCNICAMENTE SÍ (owner=postgres sin FORCE en 11/12 tablas) — pero por diseño y
sin vector para el cliente: el bypass solo ejecuta la lógica interna, cuya
autorización fue probada. El patrón es idéntico en reverse_transaction_v2 y el
resto de la familia. stock_movements (FORCE) opera correctamente bajo policies.
Detalle: 09-rls-definer-analysis.md.

### 7. ¿void_transaction es funcionalmente equivalente a reverse_transaction_v2?
NO exactamente (10-vs-reverse-v2.md). Núcleo autorizacional idéntico; difiere
en: status-guard (V2 exige completed), idempotencia (excepción vs gracioso),
conversion_factor de variantes (solo void), void_reason/cancelled_at (solo void),
unidad de entrada (items con variant vs solo product), superficie (client-RPC vs
API-route). Es una implementación LEGÍTIMA DIFERENTE (opción A), no un bypass
(C) ni dead-code a retirar (D).

### 8. ¿Existe todavía una razón legítima para que el cliente invoque directamente void_transaction?
SÍ — POS "Deshacer" (toast 30s, MM-9) y SalesHistory "Invertir" la invocan vía
useInvertDocument. Es el flujo que permite a un vendedor anular su venta
inmediata sin rol manager. Ninguna API route la llama; el consumer es
exclusivamente client-side y depende de esta función.

### 9. ¿Debe mantenerse, endurecerse o retirarse?
MANTENERSE tal como está dentro del alcance B-2. Endurecer (rol/ownership/
ventana) es una decisión de POLÍTICA de producto que afecta por igual a la ruta
canónica (/api/reverse→V2) y rompería POS-undo si se aplica ingenuamente —
registrado como BACKLOG B-8 (+ B-9 por el status guard). Retirarse NO: hay 2
consumers activos y su autorización server-side es correcta.

### 10. ¿Cuál es el impacto real y cuál es el mínimo cambio necesario?
IMPACTO REAL: ninguno demostrado en el contrato actual — no existe bypass de
autorización (tienda/identidad) reproducible: cross-store, forged, anon y
service-sin-identidad son denegados; el historial no fue re-abierto (fuera de
alcance B-2, ya cerrado en H5-B3 §11 como NO EVIDENCE OF IMPACT).
MÍNIMO CAMBIO NECESARIO: NINGUNO en código (NO CODE CHANGE). Los gaps de
política (rol/ownership frontend-only, status≠completed) quedan registrados
como BACKLOG B-8/B-9 para decisión de producto con fix sistémico posterior.

## Criterio de PASS — cumplimiento

LIVE ACL (02) + LIVE FUNCTION (01) + CALLER IDENTITY (03/08) +
SERVER-SIDE AUTHORIZATION (03/05) + CROSS-STORE TEST (07) +
FORGED-ID TEST (08) + RLS/SECURITY-DEFINER ANALYSIS (09) +
DATA INTEGRITY (13) + REGRESSION (12) + SHA256 (SHA256SUMS) +
GIT VERIFICATION (14) → COMPLETO.
Rechazados como argumentos: botón por rol (§17), validación de usuario en
frontend, "authenticated tiene permiso porque la función es segura" sin pruebas.
