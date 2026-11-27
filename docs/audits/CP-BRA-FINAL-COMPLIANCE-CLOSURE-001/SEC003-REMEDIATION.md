# SEC003-REMEDIATION — Autenticación fail-closed server-side (cierre de la regla crítica condicional)

**Misión:** CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 · **Fecha:** 2026-11-27 · **Rama:** `fix/sec003-route-auth-20261127`
**Regla:** SEC-003 (CRÍTICA — la única que permanecía CONDICIONAL en la certificación global) · **Criterio de aceptación vigente:** *sin wrapper = no merge*

---

## 1. Investigación forense (§4.1) — qué protege SEC-003 y qué faltaba

**Definición (catálogo, SIN CAMBIO DE SIGNificado):** `getServerSession` con verificación firmada (FIX-AUDIT-AUTH-1 eliminó la decodificación sin firma); wrappers únicos `withAuth/withRole/withStoreAccess`; service_role solo server-side. El estado CONDICIONAL se debía a **cobertura P− parcial** (las pruebas negativas del mecanismo no estaban automatizadas ni completas) y a que el criterio *sin wrapper = no merge* era un criterio de REVISIÓN MANUAL, sin puerta automatizada en CI.

**Clasificación forense completa (229 rutas bajo `src/app/api`, verificada con `scripts/audit-route-auth.cjs`):**

| Clase | # | Mecanismo |
|---|---|---|
| WRAPPER | 214 | `withAuth` / `withRole` / `withStoreAccess` (HOF canónica) |
| SESSION | 4 | `getServerSession` + 401 fail-closed (raíz `/api`, `/api/docs` — FIX-SEC-004 ya existente, `/api/diag-splash` — corregido en esta misión, +1) |
| CRON | 5 | JWT `x-vercel-signature` (Vercel Cron) o `Bearer CRON_SECRET`, rechazo 401 fail-closed |
| WEBHOOK | 2 | Stripe `verifyWebhookSignature` · Telegram `X-Telegram-Bot-Api-Secret-Token` |
| PUBLIC | 4 | allowlist documentada con `reason/added_by/expires` (health, help-docs, storefront/[slug], bot/chat + logs) |

**Hallazgos:**
1. **`/api/diag-splash`** — endpoint de diagnóstico HUÉRFANO (ningún llamador en el producto) sin auth ni rate-limit: único defecto técnico real del mecanismo de entrada. Expone presencia/URL de variables `NEXT_PUBLIC` (públicas por diseño) — riesgo bajo, pero viola fail-closed.
2. `/api/docs` estaba documentado en borradores previos como público — **corrección forense**: es SESSION (FIX-SEC-004) — la allowlist PUBLIC se ajustó (documentación más honesta, no ampliación).
3. Las brechas conocidas (~102 rutas sin zod, CSRF en 88, rate-limit en 107, dev bypass con doble guardia) **permanecen como R-22** — son puntos SEPARADOS del registro, NO criterios de aceptación de SEC-003. No se redujo el registro para certificar.

## 2. Remediación (§4.2)

1. **`scripts/audit-route-auth.cjs`** — control automatizado, determinista y re-ejecutable: clasifica TODAS las rutas (wrapper canónico / mecanismo propio verificable / allowlist PUBLIC con rationale + expiración); **falla el build** si una ruta nueva no pertenece a ninguna clase. Integrado al job **Security Audit** de CI (`ci.yml`, paso «Route auth coverage (SEC-003 — sin wrapper = no merge)»): el criterio de aceptación pasa de revisión manual a puerta automatizada.
2. **`/api/diag-splash`** → `getServerSession` + 401 (mecanismo SESSION de la raíz `/api` — patrón FIX-SEC-004/SEC-005).
3. **Allowlist PUBLIC** con 4 entradas documentadas (health / help-docs / storefront/[slug] / bot-chat + logs), cada una con razón, autor y expiración 2027-06-30; verificación de consistencia: las entradas con `rate_limit=true` DEBEN aplicar `rateLimit` en el código (el auditor lo comprueba).

No se inventó política nueva: la remediación aplica el criterio de aceptación ya definido para SEC-003.

## 3. Pruebas (§4.3) — batería P− 22/22 vía HTTP real

`scripts/e2e/cpbra-sec003-failclosed-battery-e2e.mjs` (sin fixtures, sin escrituras de datos):

| Clase | Casos | Resultado |
|---|---|---|
| W — WRAPPER | 9 rutas protegidas sin token → 401 (payments, ot-batch, multi, bulk-pay, commissions PATCH, production-orders payments, production-orders GET, accounts-payable GET, docs) | ✓ 9/9 |
| W — anti-spoofing | Bearer token falsificado → 401 (verificación de firma — FIX-AUDIT-AUD-1) | ✓ |
| S — SESSION | raíz `/api` → 401 · `/api/diag-splash` → 401 | ✓ 2/2 |
| C — CRON | 5 rutas sin secreto → 401 · CRON_SECRET INCORRECTO → 401 (comparación estricta, no solo presencia) | ✓ 6/6 |
| H — WEBHOOK | Telegram sin secret token → rechazo · Stripe sin firma → rechazo | ✓ 2/2 |
| P — PUBLIC | health → 200 ok · help-docs → 200 (accesos positivos documentados) | ✓ 2/2 |

**Aislamiento entre tiendas y autorización por rol** (componentes server-side de la regla): demostrados por las baterías de dominio re-ejecutables — R-25 16/16 (clerk/usuario 403, otra tienda 404/403), R-03 17/17 (clerk 403, no-auth 401, otra tienda sin fuga), pay_commission 15/15 (clerk/usuario 403, otra tienda, spoofing de actor rechazado), FIN-011 16/16.

**Historial de la batería:** run 1 con 3 defectos de TEST (cron usa GET no POST → 405; ruta inexistente; docs clasificada mal como pública) — corregidos; run final **22/22**.

## 4. Reglas de negocio afectadas (CP-BRA-001)

`SEC-003` (esta misión — cierre) · `SEC-002` (sin cambio: allowlist SD intacta) · `SYS-002` (manifiesto writers: entradas de dominio §0.2 consolidadas en su rama correspondiente — corrección de alcance documentada).

## 5. Estado resultante

- Cobertura de autenticación: **completa y automatizada** (229/229 clasificadas; auditor PASS; CI bloquea rutas nuevas sin clase).
- P−: batería dedicada 22/22 + baterías de dominio (71 casos negativos/positivos combinados re-ejecutables).
- SEC-003 → **CERTIFICADA** (criterios: regla inequívoca ✓ · invariante ✓ · protección server-side ✓ · RLS N/A por regla (es la regla de entrada) ✓ · aislamiento por tienda ✓ (baterías de dominio) · writers/readers ✓ · P+/P− ✓ · evidencia de producción: la superficie de rutas en producción corresponde a los mismos artefactos versionados ✓ · auditoría en writers críticos ✓ · riesgo residual: R-22 documentado, no bloqueante).
- R-22 permanece ABIERTO como riesgo separado (zod/CSRF/rate-limit) con su propio plan.

## 6. Riesgos residuales

1. **R-22** (entrada sin zod en ~102 rutas, CSRF 88, rate-limit 107): riesgo MEDIOS/P3 independiente — el rechazo fail-closed de la capa de auth es independiente de la validación de payload.
2. Las entradas PUBLIC de la allowlist expiran 2027-06-30 (rotación forzada de justificación — patrón allowlist v2).
3. El auditor clasifica por texto del archivo: un wrapper comentado no cuenta como uso real (el patrón `withAuth\s*\(` exige invocación) — límite estático documentado; el E2E P− cubre el comportamiento real.
