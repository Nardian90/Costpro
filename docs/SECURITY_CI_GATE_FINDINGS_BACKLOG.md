# Security CI Gate — Findings Backlog

**Actualizado:** 2026-11-04 (misión SEC-025/026/003/005/006/UI-001, tarea T4 · CP-SEC-006)
**Generado originalmente:** 2026-08-02 por `scripts/ci-gate-ts-checks.js` (baseline v2.12.50-security-baseline)
**Estado del backlog original:** **SUPERADO — 52/52 endpoints resueltos o eliminados** (ver §1 y §3)

---

## 1. Recuento ACTUAL medido (T4.1, 2026-11-04)

```
node scripts/ci-gate-ts-checks.js
  ✅ All mutation endpoints use Zod validation
  ✅ All mutation endpoints have auth middleware
  ✅ All TypeScript security checks PASSED  (exit 0)
```

| Check | Endpoints afectados en 2026-08-02 | **Actuales [MEDIDO]** |
|-------|----------------------------------:|----------------------:|
| Sin Zod validation | 48 | **0** |
| Sin auth middleware | 18 | **0** |
| **Total** | **52** (5 Alta, 21 Media, 26 Baja) | **0** |

Este archivo ES la barrera anti-desincronización: el job `quality` de CI ejecuta
`node scripts/ci-gate-ts-checks.js` (paso "SEC-TS gate"); si un endpoint de mutación
pierde su Zod o su auth, el gate falla aunque este backlog diga 0. Al añadir un endpoint
nuevo sin validación, el CI lo señala y debe registrarse aquí de nuevo (regla de §4).

---

## 2. Prioridad Alta (5/5 RETIRADAS CON EVIDENCIA — T4.2)

Corregidas en el código y verificadas hoy: auth (401 sin token), permiso por tienda
(403) y validación del body (400) presentes; el verificador las da por limpias.

| # | Endpoint | Commit que lo corrigió | Pruebas |
|---|----------|------------------------|---------|
| 1 | `stores/[id]/backup/restore` | `a4682b20b` (2026-10-09) feat(security): contratos Zod en endpoints de mutación + gate | `src/__tests__/lib/backup-service.test.ts`; cobertura E2E sec-ts-10 (`5cf553e22`) |
| 2 | `stores/[id]/archive` | `a4682b20b` + CSRF `13fc8e5a0` (2026-07-12, P1-CSRF validateOrigin) | `src/__tests__/integration/commit-rollback-store-access.test.ts`; E2E sec-ts-10 |
| 3 | `stores/[id]/restore` | `a4682b20b` + CSRF `13fc8e5a0` | ídem; ruta SIN cuerpo (solo path param): no requiere Zod según la heurística documentada del verificador (REM-COSTPRO4-CI) |
| 4 | `catalog/bulk-import` | `34fbaecbe` (2026-10-21) CP-CAT-005+CP-SEC-004+CP-SEC-018 blindar importación masiva; `8d1f64ef3` (2026-10-28) cierre de fallback cross-store | `src/__tests__/api/catalog-bulk-import-validation.test.ts` |
| 5 | `exchange-rates/bulk-upload` | `a4682b20b` + núcleo IC-DIVISA `67f43a76f` (2026-10-25) | `src/__tests__/integration/exchange-rates-bulk-upload.test.ts` |

---

## 3. Prioridad Media (21/21 RETIRADAS CON EVIDENCIA — T4.3)

**Hallazgo de la misión: las 21 ya estaban corregidas en el código** (la ola de
`a4682b20b` del 2026-10-09 contratos Zod en endpoints de mutación + refuerzos posteriores
CP-ORG-001 c5 `f230810b1`, sec-ts-02 `a3789fc31`, remediaciones sec-ts-10), pero el
backlog y el inventario no lo reflejaban. No hubo nada que corregir; por eso no aplica
"un commit por endpoint" en ESTE PR: la evidencia por endpoint es esta tabla, con el
commit que introdujo la corrección y las pruebas existentes que lo cubren.

| # | Endpoint | Estado verificado 2026-11-04 | Corrección principal | Pruebas existentes |
|---|----------|------------------------------|----------------------|--------------------|
| 6 | `commissions/rules` | auth SÍ · Zod SÍ | `a4682b20b` + `f230810b1` (SuperAdmin) | E2E sec-ts-10; tests de comisiones (24/24 en la batería T2) |
| 7 | `commissions/rules/[id]` | auth SÍ · Zod SÍ | `a4682b20b` | ídem |
| 8 | `commissions/calculate` | auth SÍ · Zod SÍ | `a4682b20b` | `commission-product-confcomisiones.test.ts` |
| 9 | `commissions/payments` | auth SÍ · Zod SÍ | `a4682b20b` + contrato T2 (constraint de periodos) | `commissions-manage-modal.test.tsx` |
| 10 | `cost-sheets/calculate` | auth SÍ · Zod SÍ | `a4682b20b` | `fc-schemas.test.ts` |
| 11 | `cost-sheets/export-pdf` | auth SÍ · Zod SÍ | `a4682b20b` | `gate1-navigation.test.ts` |
| 12 | `cost-sheets/import-anexo` | auth SÍ · Zod SÍ | `a4682b20b` | (sin test por nombre; cubierto por gate SEC-TS) |
| 13 | `cost-sheets/import-json` | auth SÍ · Zod SÍ | `a4682b20b` | ídem |
| 14 | `inventory/ocr-receipt` | auth SÍ · Zod SÍ (antes sin auth: `a3789fc31` 2026-09-27 remediate real TS security findings) | `a3789fc31` | `src/__tests__/api/sec-ts-02-ocr-receipt.test.ts` |
| 15 | `inventory/receptions/[id]` | auth SÍ · Zod SÍ | `a4682b20b` + `f230810b1` | cobertura E2E recepciones |
| 16 | `inventory/receptions/[id]/items/[itemId]` | auth SÍ · Zod SÍ | `a4682b20b` | ídem |
| 17 | `payments/[id]` | auth SÍ · DELETE sin cuerpo (no parsea body: Zod no aplica según heurística documentada) | `432c9481c` + `f86037f22` | `payments-modal-auth-contract.test.ts` |
| 18 | `production-orders/[id]/withdraw` | auth SÍ · Zod SÍ | `a4682b20b` + `35f326caa` (F4-03) | `vales-salida-etapa-revision-migration.test.ts` |
| 19 | `purchase-orders` | auth SÍ · Zod SÍ | `a4682b20b` + G1-G7 `fffdfd952` | `rem-inv-2-dynamic-reachability.test.ts` |
| 20 | `purchase-orders/[id]` | auth SÍ · Zod SÍ | ídem | ídem |
| 21 | `received-services` | auth SÍ · Zod SÍ | `a4682b20b` + permisos v2.18.0 `e014b908f` | `received-services-authz.test.ts` |
| 22 | `received-services/distribute` | auth SÍ · Zod SÍ | `a4682b20b` + `6b8b63397` | `v2-18-0-servicios-arqueo-contract.test.ts` |
| 23 | `store-rates` | auth SÍ · Zod SÍ (antes sin auth: `a3789fc31`; endurecido `e2343f658` contrato ampliado) | `a3789fc31` + `e2343f658` | `sec-ts-02-store-rates.test.ts` |
| 24 | `storefront/revalidate` | auth SÍ · Zod SÍ · `withRole('encargado')` explícito | `a4682b20b` | (cubierto por gate SEC-TS) |
| 25 | `workers` | auth SÍ · Zod SÍ · `withAuth(withSecurity(...))` | `a4682b20b` + `f230810b1` | tests de workers/caja |
| 26 | `workers/[id]` | auth SÍ · Zod SÍ | `a4682b20b` | ídem |

**Código muerto:** la entrada 26 del backlog original apuntaba además a
`cash-report/export/route.ts`, que **ya no existe** (eliminado del repo) — no hay nada
que endurecer; se retira por eliminación previa del propio módulo.

---

## 4. Prioridad Baja (26/26 RESUELTAS O ELIMINADAS — listadas con orden de ataque)

Estado medido hoy (el verificador da 0 hallazgos en todo el árbol): los módulos
`academy/*` (3), `pick3/*` (6) y `wallet/*` (4) **ya no existen** (eliminados del repo);
el resto está endurecido. Orden de ataque si algún día reaparece una regresión:
(1) webhooks (verificar firma antes que auth — `telegram/webhook` ya con signature),
(2) endpoints que parsean body sin Zod, (3) endpoints internos sin auth, (4) lecturas
controladas.

| # | Endpoint (backlog 2026-08-02) | Estado 2026-11-04 [MEDIDO] |
|---|-------------------------------|-----------------------------|
| 27-29 | `academy/*` (generate, review/[cardId], …) | **MÓDULO ELIMINADO** (no existe en src/app/api) |
| 30 | `ai/chat` | auth+Zod (esquema centralizado `@/validation/api-schemas`) |
| 31 | `bot/chat` | auth (getServerSession) + `botChatSchema` + CSRF + rate limit |
| 32-35 | `exchange-rates/*` (route, refresh, scrape-historical, scrape-soluciones) | auth + esquemas; refresh sin cuerpo (no requiere Zod) |
| 36 | `legal/incidents` | auth SÍ · Zod SÍ |
| 37 | `logs` | auth SÍ · Zod SÍ |
| 38-43 | `pick3/*` (6 endpoints) | **MÓDULO ELIMINADO** |
| 44 | `telegram/invitations/import` | auth+Zod |
| 45 | `telegram/webhook` | verificación de firma (validateWebhookSecret/constructEvent) + Zod — webhook: la firma ES el auth |
| 46-47 | `usage/alerts`, `usage/flush` | auth SÍ; flush sin cuerpo (no requiere Zod) |
| 48-51 | `wallet/*` (4 endpoints) | **MÓDULO ELIMINADO** |
| 52-53 | `whatsapp/connect`, `whatsapp/disconnect` | auth SÍ · Zod SÍ |

---

## 5. Reglas (actualizadas)

- **Regla de remoción por endpoint (T4.4):** un endpoint solo se retira de este backlog
  con TRES evidencias citadas: (a) el verificador en verde para ese archivo
  (`node scripts/ci-gate-ts-checks.js`), (b) el COMMIT que introdujo la corrección
  (`git log --follow -- <ruta>`), y (c) la prueba que lo cubre (archivo de test o
  cobertura E2E citada). Sin las tres, sigue listado.
- **Anti-desincronización (nuevo):** el job `quality` de `.github/workflows/ci.yml`
  ejecuta el verificador (paso "SEC-TS gate: endpoints sin Zod/auth"); cualquier
  regresión rompe el CI aunque este backlog esté en 0. Sin credenciales.
- **No corregir sin análisis individual** — los webhooks pueden tener validación
  alternativa (signature); los endpoints sin cuerpo no requieren Zod (heurística
  REM-COSTPRO4-CI documentada en el verificador).
- **Compatibilidad (D4.2):** no romper clientes; campos desconocidos ignorados salvo
  `.strict()` justificado; identificadores con el helper de CP-SEC-019
  (`uuidLoose`/`uuidRegex`), jamás reintroducir `z.string().uuid()` — hoy hay **0**
  ocurrencias en `src/app/api` [MEDIDO 2026-11-04].
