# Security CI Gate — Findings Backlog

**Fecha:** 2026-08-02
**Generado por:** `scripts/ci-gate-ts-checks.js`
**Baseline:** v2.12.50-security-baseline

---

## Resumen

| Check | Endpoints afectados |
|-------|-------------------:|
| Sin Zod validation | 48 |
| Sin auth middleware | 18 |
| **Total endpoints con issues** | **52** (algunos tienen ambos) |

**Estos son issues pre-existentes** — no fueron introducidos por las Iteraciones 7-9. Los endpoints críticos (users, stores, bulk operations, backup) sí tienen Zod + auth. Los issues están en módulos secundarios.

---

## Prioridad Alta (5 endpoints)

Endpoints administrativos o destructivos que modifican datos sensibles.

| # | Endpoint | Issues | Acción recomendada |
|---|----------|--------|-------------------|
| 1 | `stores/[id]/backup/restore/route.ts` | sin Zod | Agregar schema validation — endpoint destructivo |
| 2 | `stores/[id]/archive/route.ts` | sin Zod | Agregar schema validation — modifica is_archived |
| 3 | `stores/[id]/restore/route.ts` | sin Zod | Agregar schema validation — reactiva tienda |
| 4 | `catalog/bulk-import/route.ts` | sin Zod | Agregar schema validation — bulk import de productos |
| 5 | `exchange-rates/bulk-upload/route.ts` | sin Zod | Agregar schema validation — bulk upload |

---

## Prioridad Media (21 endpoints)

Endpoints internos autenticados que modifican datos operacionales.

| # | Endpoint | Issues |
|---|----------|--------|
| 6 | `commissions/rules/route.ts` | sin Zod |
| 7 | `commissions/rules/[id]/route.ts` | sin Zod |
| 8 | `commissions/calculate/route.ts` | sin Zod |
| 9 | `commissions/payments/route.ts` | sin Zod |
| 10 | `cost-sheets/calculate/route.ts` | sin Zod |
| 11 | `cost-sheets/export-pdf/route.ts` | sin Zod |
| 12 | `cost-sheets/import-anexo/route.ts` | sin Zod |
| 13 | `cost-sheets/import-json/route.ts` | sin Zod |
| 14 | `inventory/ocr-receipt/route.ts` | sin Zod, sin auth |
| 15 | `inventory/receptions/[id]/route.ts` | sin Zod |
| 16 | `inventory/receptions/[id]/items/[itemId]/route.ts` | sin Zod |
| 17 | `payments/[id]/route.ts` | sin Zod |
| 18 | `production-orders/[id]/withdraw/route.ts` | sin Zod |
| 19 | `purchase-orders/route.ts` | sin Zod |
| 20 | `purchase-orders/[id]/route.ts` | sin Zod |
| 21 | `received-services/route.ts` | sin Zod |
| 22 | `received-services/distribute/route.ts` | sin Zod |
| 23 | `store-rates/route.ts` | sin Zod, sin auth |
| 24 | `storefront/revalidate/route.ts` | sin Zod |
| 25 | `workers/route.ts` | sin Zod |
| 26 | `workers/[id]/route.ts` | sin Zod |

---

## Prioridad Baja (26 endpoints)

Lecturas públicas controladas, webhooks, o módulos secundarios no críticos.

| # | Endpoint | Issues |
|---|----------|--------|
| 27 | `academy/generate/route.ts` | sin auth |
| 28 | `academy/review/[cardId]/route.ts` | sin auth |
| 29 | `ai/chat/route.ts` | sin Zod |
| 30 | `bot/chat/route.ts` | sin auth |
| 31 | `exchange-rates/route.ts` | sin Zod |
| 32 | `exchange-rates/refresh/route.ts` | sin Zod |
| 33 | `exchange-rates/scrape-historical/route.ts` | sin Zod |
| 34 | `exchange-rates/scrape-soluciones/route.ts` | sin Zod |
| 35 | `legal/incidents/route.ts` | sin auth |
| 36 | `logs/route.ts` | sin Zod, sin auth |
| 37-42 | `pick3/*` (6 endpoints) | sin Zod, sin auth |
| 43 | `telegram/invitations/import/route.ts` | sin Zod |
| 44 | `telegram/webhook/route.ts` | sin Zod, sin auth |
| 45 | `usage/alerts/route.ts` | sin Zod |
| 46 | `usage/flush/route.ts` | sin Zod |
| 47-50 | `wallet/*` (4 endpoints) | sin Zod, sin auth |
| 51 | `whatsapp/connect/route.ts` | sin Zod |
| 52 | `whatsapp/disconnect/route.ts` | sin Zod |

---

## Reglas

- **No corregir sin análisis individual** — algunos endpoints pueden tener validación alternativa (ej: webhooks con signature verification)
- **Prioridad Alta debe resolverse primero** — son endpoints destructivos sin validation
- **El CI Gate bloqueará nuevos endpoints** que no tengan Zod/auth — los existentes quedan como deuda
- **Progreso:** al corregir un endpoint, remover de este backlog y hacer commit
