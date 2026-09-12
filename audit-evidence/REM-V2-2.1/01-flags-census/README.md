# 01 — INVENTARIO DE FLAGS (FASE 1)

Censo de `NEXT_PUBLIC_USE_V2_CHECKOUT` / `NEXT_PUBLIC_USE_V2_REVERSE` (archivo vivo; audit-evidence histórico excluido):

| # | Archivo | Línea | Rol |
|---|---|---|---|
| 1 | `src/config/features.ts` | 23 | `USE_V2_CHECKOUT: process.env.NEXT_PUBLIC_USE_V2_CHECKOUT === 'true' || false` — definición, **default fail-closed** |
| 2 | `src/config/features.ts` | 46 | `USE_V2_REVERSE: process.env.NEXT_PUBLIC_USE_V2_REVERSE === 'true' || false` — definición, **default fail-closed** |
| 3 | `src/config/features.ts` | 57-61 | `shouldUseV2Checkout(storeId)` — gate POS (pilot stores vacío = todas) |
| 4 | `ecosystem.config.js` | 83-84 | passthrough pm2 del entorno al proceso |
| 5 | `.env.example` | flags | documentadas con `true` (desde remediación REM-V2-1) |
| 6 | `src/app/api/reverse/route.ts` | 164 | `rpcMap = FEATURES.USE_V2_REVERSE ? RPC_MAP_V2 : RPC_MAP_V1` (receipt→reverse_receipt_v2) |
| 7 | `src/app/api/devolutions/route.ts` | 73, 88 | selección create_devolution_v2 por flag |
| 8 | `src/__tests__/integration/iteration-11-1.test.ts` | 350 | **fija expresión fuente** `=== 'true' \|\| false` |
| 9 | `src/__tests__/integration/iteration-11-2.test.ts` | 139, 190 | **"default false en código (activado via .env)"** — 2 aserciones |
| 10 | `src/__tests__/integration/iteration-12.test.ts` | 285 | fija expresión fuente |
| 11 | `src/__tests__/integration/iteration-13.test.ts` | 166 | "features.ts no se modificó" — fija expresión |
| 12 | `vercel.json` | — | SIN overrides de flags (solo crons/functions) |
| 13 | `.env.local`, `.env.production` | — | NO existen |
| 14 | `next.config.ts` | — | sin manipulación de flags |

## Matriz

| Flag | Default (código) | Fuente efectiva runtime | Runtime actual (local dev server) | Callers afectados |
|---|---|---|---|---|
| CHECKOUT | `false` (fail-closed, fijado por 4 tests) | `.env` (15 vars operador) → inlining build/dev-time Turbopack | `true` | usePOSCheckout (gated), SalesCatalogView/useSalesCatalog → /api/pos/checkout (V2 incondicional desde P-2) |
| REVERSE | `false` (fail-closed, fijado por 4 tests) | `.env` → inlining | `true` | /api/reverse (route.ts:164), /api/devolutions (73,88) |

## ¿`false` es solo default de desarrollo?

NO existe ningún entorno donde `false` continúe efectivo para el objetivo del producto: el valor `false` es el **default de seguridad en código** (fail-closed) exigido por contrato por 4 archivos de test (5 aserciones). La activación se realiza EXCLUSIVAMENTE por entorno (`.env` local / plataforma de deploy), tal como define la remediación P-1 de REM-V2-1 («P-1: Fijar flags true en el entorno (.env del operador / plataforma) — el .env real vive fuera del repo») y el propio nombre del test de iteration-11-2: *«USE_V2_CHECKOUT default false en código (activado via .env)»*.

**Conclusión de diseño:** cambiar el default en `features.ts` rompería 5 aserciones de contrato → STOP por FASE 10. El mecanismo real del proyecto es el entorno. P-1 = acción de entorno + registro en evidence. Cambio de código: **NINGUNO**.

Generado: 2026-09-12T07:20:43Z
