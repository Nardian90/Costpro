# INFORME FINAL — MISIÓN COSTPRO-SALES-MODAL-INPUT-AND-TRANSFER-VALIDATION-001

Fecha: 2026-11-28 · Rama: `fix/pos-modal-focus-transfer-validation-20261128` · Base: `main` @ `dd3410214`

## 1. Causa raíz del salto de foco (FASE 1)

`POSPortalModal` (componente compartido por el «Confirmar Venta» de ambos
modos, «Configurar pago», desglose de efectivo e inventario) tenía su
`useEffect` de apertura con dependencias `[open, onClose]`. Todos los
consumidores pasan `onClose` **inline** (arrow function nueva en cada render
del padre). Cada tecla escrita en un campo controlado (p. ej. «Notas de la
venta») re-renderiza al padre → **nueva referencia de `onClose`** → el efecto
se re-ejecutaba con el modal ya abierto: su cleanup restauraba el foco al
elemento previo y su cuerpo volvía a enfocar el **primer focusable del
diálogo — la X «Cerrar»** (primer elemento del DOM del modal). Resultado
exacto del reporte: una sola letra escrita y el foco secuestrado al botón
Cerrar.

## 2. Componentes y archivos afectados

| Archivo | Cambio |
|---|---|
| `src/components/views/terminal/views/pos/POSPortalModal.tsx` | FIX raíz: patrón latest-ref (`onCloseRef`), efecto dependiente SOLO de `[open]`; auto-focus inicial al propio diálogo (no a la X destructiva) |
| `src/components/views/terminal/views/pos/TransferIdentityFields.tsx` | NUEVO: identidad del pagador compartida (nombre/CI/teléfono, mensajes junto a cada campo, a11y aria-required/invalid/describedby) |
| `src/components/views/terminal/views/pos/POSExpressMode.tsx` | Teléfono NUEVO + `transferDataOk` exige teléfono; nombre/CI migrados al componente compartido |
| `src/components/views/terminal/views/pos/POSCartCheckoutPanel.tsx` | El carrito AHORA recoge identidad en el modal Confirmar (antes no existía); `confirmBlocked` + title accionable; suscripción reactiva al store |
| `src/components/views/terminal/views/pos/usePOSCheckout.ts` | `customer_phone` viaja al payload del checkout |
| `src/store/cart.ts` | `customerPhone` + `setCustomerPhone` (trim, tope 20); reset en clearCart / cambio a vale / TTL — espejo de `customerCi`; nunca en localStorage |
| `src/lib/pos/transfer-identity.ts` | NUEVO: regla canónica pura y testeable (canal + faltantes) |
| `src/app/api/pos/checkout/route.ts` | Schema `customer_phone` + revalidación server-side (422 fail-closed) + `p_customer_phone` condicional (patrón CP-MONEY-002) |
| `supabase/migrations/20261128120000_cp_pos_transfer_identity_validation.sql` | create_sale_v2 re-emitido VERBATIM de 20261126150000 salvo: firma /36 (+p_customer_phone DEFAULT NULL; DROP explícito de la /35), puerta §4.bis `ERR_TRANSFER_IDENTITY_REQUIRED` antes de toda escritura, segmento en el hash de idempotencia, persistencia en `transactions.customer_phone` (columna existente desde 20260731000001), COMMENT + ACLs |
| `e2e/flows/pos-checkout.spec.ts` | Specs 011/012/013/014/017 al nuevo contrato + NUEVOS 019/019b |
| `scripts/e2e/csmv-transfer-identity-{apply,battery}-e2e.mjs` | Aplicación gobernada + batería funcional (8 sondas en ROLLBACK) |
| Tests (8 archivos, 86 casos nuevos/actualizados) | foco (8), helper (17), carrito (6), express (5), payload (2 extendidos), contratos previos ajustados |

## 3. Validación de transferencia (FASES 2/3) — los 4 datos obligatorios

· **UI (ambos modos, mismo componente compartido — FASE 3):** la venta con
transferencia exige Nombre + Carné + Teléfono (Espacios = vacío) y el N.º de
operación por fila (regla §5.1 previa). El botón Confirmar se deshabilita con
title accionable; los mensajes van junto a cada campo; los datos se conservan
(viven en el store; el modal no se cierra por validación fallida).
· **Route server-side:** 422 con detalle de faltantes ANTES del RPC — la
obligatoriedad no depende del frontend. Canal canónico (filas por línea o
componentes); el flujo legado del Catálogo (pools sin filas ni componentes)
NO se toca.
· **RPC (autoridad final):** `ERR_TRANSFER_IDENTITY_REQUIRED` fail-closed
antes de CUALQUIER escritura (incl. idempotency_registry); persistencia del
teléfono en `transactions.customer_phone`.

## 4. Confirmación de funcionamiento en ambos modos

· **Unit (86 casos de la misión, 8 archivos):** foco (componente real sin
mock; 6/8 fallan contra la implementación antigua — reproduce el bug exacto),
helper puro, carrito, express (arnés real con `act()`), payload, contratos.
· **E2E `pos-checkout.spec.ts` contra la BD aislada MIGRADA: 23/23 PASS**
(incl. 011 referencia+ledger, 012 mixto, 013 multi, 014 persistencia de
nombre/CI/teléfono, 014b sin exigencia en efectivo, 017 §5.1, 019 route gate
sin efectos, 019b espacios).
· **Navegador real contra producción (100% solo lectura, jamás se confirmó
venta; carrito limpiado al final): 23/25 PASS** — evidencia en
`download/csmv-evidencia/` + `resultados-validacion.json`:
  - A1 foco inicial ≠ Cerrar; A2 frase de 64 caracteres con tildes/ñ/em-dash
    íntegra y foco permanecido en Notas (bug corregido EN VIVO);
  - A3-A6 pestaña «Datos de transferencia»: 3 mensajes junto a cada campo,
    Confirmar deshabilitado sin identidad (title accionable), habilitado con
    los 4 datos, datos conservados;
  - B1-B3 carrito: misma sección compartida, gate, foco en Notas;
  - D: cero errores de consola/pageerror.
  - 2 checks de arnés sin PASS (no son defectos de producto): el editor
    colapsado del carrito no fue alcanzable por el arnés (el MISMO
    PaymentRowsEditor queda validado en Express A3 + unit) y el flujo móvil
    390 no llegó a Express en el contexto nuevo (consentimiento/flujo de
    login del arnés; la conducta bajo prueba —foco e identidad en el modal
    compartido— es viewport-independiente y quedó validada en desktop +
    unit §1.4).

## 5. Resultado TypeScript / ESLint / tests / build

· `tsc --noEmit`: **EXIT 0** (con los specs e2e incluidos).
· ESLint archivos de la misión: **0 errores** (warnings preexistentes de
  estilo `<button>` crudo, sin cambios de severidad).
· Suite unitaria completa: **6952 PASS / 0 fallos / 95 skip** (517 archivos);
  incluye los 5 tests de posición del manifiesto INFRA-011 ajustados al
  stream de 225 migraciones y el test de firma final /36.
· Build local: `✓ Compiled successfully in 63s` — el paso TypeScript interno
  y la fase post-compilación no caben en el sandbox de 4 GB (OOM 137;
  limitación del entorno, no del código: tsc EXIT 0 independiente y el
  workflow «TypeCheck+Lint+Unit Tests+Build» del CI ejecuta el build
  completo en runners de 7 GB).

## 6. Migración aplicada (§11g — regla de oro)

1. **Aislada primero**: apply-e2e con guardas PRE/POST (firma 35→36, UNA
   sobrecarga, ACL, NOTIFY pgrst) + batería funcional 8/8 PASS en
   BEGIN…ROLLBACK (cero residuos; persistencia del teléfono verificada
   dentro de la transacción) + suite pos-checkout 23/23 contra la aislada
   migrada + PostgREST resuelve /36 (la puerta responde por REST; sin
   PGRST203/202) + data-hygiene net-zero PASS.
2. **Producción UNA sola vez** (gobernada): `scripts/apply-migration.mjs
   --target prod --confirm-prod` con el doble flag del guard CP-INFRA-019
   (`ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND`) — 2026-11-27
   ~19:56 UTC. POST-verify: 1 sobrecarga, firma /36, ACL
   authenticated/service_role. NOTIFY pgrst emitido. Sonda REST en producción
   devuelve `ERR_TRANSFER_IDENTITY_REQUIRED` (la puerta está viva; la sonda
   usaba store/producto inexistentes — sin efectos).
3. **Superficie re-certificada**: `contract-surface.sql` regenerado desde
   LIVE (233 funciones; 233/233 representadas; 0 divergencias bloqueantes).
   Checks locales: contract-static OK, BOLA 5/5, SEC-003 PASS,
   check-writers OK (escritores de la misión declarados).

## 7. Estado de los workflows / PR

· Rama con 8 commits por fases, push incremental (protocolo 11b).
· PR: **ver sección final del INFORME en el PR** (número y checks en la
  descripción; los workflows corren al abrir el PR: TypeCheck+Lint+Unit+Build,
  E2E Aislado —manual—, Security, SQL, Vercel).
· **El PR NO se fusiona sin autorización del propietario.**

## 8. Incidencias pendientes / notas

· **Fuera de alcance (no tocado):** el flujo del Catálogo de ventas crea
  ventas con `transfer_amount` SIN identidad (canal legado, pools sin filas
  ni componentes) — la puerta canónica deliberadamente no lo afecta;
  extenderlo exige recoger identidad en ESA vista (seguimiento sugerido).
· **Riesgo ventana idempotencia:** el hash creció con el segmento
  `customer_phone` (mismo tratamiento aceptado para `p_customer_ci` en
  20261125120000); una intención offline en vuelo durante el despliegue
  podría colisionar limpio (ERR_IDEMPOTENCY_KEY_REUSE — sin doble venta).
· **E2E humo completo:** la batería smoke total mostró la inestabilidad
  ambiental ya documentada (provisión run-env, rate-limit 429, colisiones de
  pilotos — CP-AP-001 §CI); el archivo que cubre el área de la misión
  (pos-checkout) pasó 23/23 dos veces.
· **Build local:** OOM del sandbox 4 GB en la fase TypeScript del build
  (compilación OK); el build completo es verificación del CI.
