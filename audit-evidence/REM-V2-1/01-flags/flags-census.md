# REM-V2-1 — 01 FLAGS: censo completo `NEXT_PUBLIC_USE_V2_*`

## 1. Definición y default (código)

`src/config/features.ts` (única fuente de verdad de flags):

```ts
USE_V2_CHECKOUT: process.env.NEXT_PUBLIC_USE_V2_CHECKOUT === 'true' || false,   // :23
USE_V2_REVERSE:  process.env.NEXT_PUBLIC_USE_V2_REVERSE  === 'true' || false,   // :46
V2_CHECKOUT_PILOT_STORES: (process.env.NEXT_PUBLIC_V2_CHECKOUT_PILOT_STORES || '').split(',').filter(Boolean),  // :32
shouldUseV2Checkout(storeId)  // :57 — false si flag OFF; si pilotos vacío → true para todas
```

- **Default efectivo: `false`** cuando la variable no está definida (`undefined === 'true'` → false).
- Semántica: string-exacta `'true'`; cualquier otro valor (`1`, `TRUE `, `yes`) ⇒ false. Configuración inequívoca (no hay truthy-spread).
- Pilotos: `V2_CHECKOUT_PILOT_STORES` puede restringir V2-checkout a tiendas específicas; vacío = todas.

## 2. Lugares donde se evalúan (runtime)

| Consumidor | Flag | Efecto |
|---|---|---|
| `src/components/views/terminal/views/pos/usePOSCheckout.ts:144` | `shouldUseV2Checkout(user.activeStoreId)` | true → `POST /api/pos/checkout`; false → `create_sale` RPC directo del navegador |
| `src/app/api/pos/checkout/route.ts` | (endpoint gated por el flag vía el hook) | envuelve `create_sale_v2` (service-side) |
| `src/app/api/reverse/route.ts:164` | `FEATURES.USE_V2_REVERSE ? RPC_MAP_V2 : RPC_MAP_V1` | mapa de RPCs por tipo de documento |
| `src/app/api/devolutions/route.ts:73,88` | `FEATURES.USE_V2_REVERSE` | `create_devolution_v2` vs `create_devolution`; v2 añade `p_idempotency_key` |
| `ecosystem.config.js:83-84` | passthrough pm2 | re-exporta las env al proceso; si no están en el entorno ⇒ `undefined` ⇒ default false |

## 3. Lugares donde el flag es IGNORADO (caminos V1/V2 independientes de la flag)

⚠️ Censo crítico — llamadas RPC directas del cliente que no pasan por ningún flag:

| Caller | RPC | Familia |
|---|---|---|
| `src/hooks/api/useTransactions.ts:119` (`useCreateSale`, usado por `useSalesCatalog.ts:377` → `SalesCatalogView`, vista activa `sales_catalog` en `TerminalShell.tsx:374`) | `create_sale` | CHECKOUT V1 — vivo e ignora flag |
| `src/app/api/sync/batch/route.ts:148` (sync offline) | `create_sale_v2` | CHECKOUT V2 fijo |
| `src/hooks/api/useDocumentActions.ts:74` (`useInvertDocument` tipo `sale`, usado por POS sales undo) | `void_transaction` | REVERSE (camino "Nivel 1 POS Undo" B-8) — ignora flag |
| `src/hooks/api/useDocumentActions.ts:93` (tipo `reception`) | `perform_inventory_adjustment` ×N + `UPDATE receipts SET status='voided'` directo | REVERSE legacy compuesto lado-cliente — ignora flag, no atómico |
| `src/hooks/api/useReceptions.ts:143,153` (`useVoidReception`) | `void_pending_reception` / `reverse_receipt_v2` | REVERSE — RPC directo del navegador (saltándose el boundary `/api/reverse`) |
| `src/app/api/production-orders/[id]/void/route.ts:75` | `void_closed_production_order` | REVERSE producción (sin variante V1/V2) |

## 4. `.env.example` y configuración

- **`.env.example` NO declara ninguna de las dos flags** (verificado 2026-09-12 sobre baseline `34f50a55`).
  GAP: un despliegue que copie la plantilla corre con defaults `false` (V1) en silencio.
- No existen `.env.local`/`.env.production` en repo; `vercel.json` sin overrides de flags
  (consistente con evidencia previa `20260902-w9.4.7-h5b1/06-feature-flags.md`).
- Histórico de producción (evidencia REM anterior + `.env` provisto por el operador en gates previos):
  `NEXT_PUBLIC_USE_V2_CHECKOUT=true`, `NEXT_PUBLIC_USE_V2_REVERSE=true` (líneas de `.env:15`).
  ⚠️ Tras el reset del workspace, el `.env` real no está disponible en este entorno; el estado
  del gate se evalúa a nivel repo/código, y el valor runtime de producción queda documentado
  como TRUE según la última evidencia disponible (w9.4.7 H5-B1 FASE 14 PASS).

## 5. Tests que fijan la política de flags

- `src/__tests__/integration/iteration-11-1.test.ts:349-350` — default `false` en código.
- `iteration-11-2.test.ts:188` — "USE_V2_CHECKOUT default false (activado via .env)".
- `iteration-11-3.test.ts:110-126` — selección por `FEATURES.USE_V2_REVERSE`.
- `iteration-12.test.ts:280-285`, `iteration-13.test.ts:163`, `iteration-fiscal.test.ts:177-183` — "flag sigue (en) false/activa" (aserciones de texto).

## 6. Nota de seguridad §4 del gate

`NEXT_PUBLIC_*` = expuesto al bundle cliente. Solo contienen booleanos/lista de UUIDs de
piloto — **sin secretos**. Correcto: no hay ninguna credencial en flags.

## Conclusión FASE 0

1. Valor actual en repo: **no definidas** (default `false`); producción documentada como `true`.
2. Default: `false` (V1) en ambas.
3. Fallback: el flag OFF restaura caminos V1 en `/api/reverse` (excepto `transaction`, que resuelve V2 en ambos mapas) y en devoluciones; en checkout el flag OFF activa el RPC V1 directo del navegador.
4. Evaluación: `features.ts` (2 flags + pilotos), consumida por 3 rutas API + 1 hook POS.
5. Lugares donde se ignoran: 5 vías listadas en §3 (4 activas desde UI, 1 server-side fija V2).
6. Rutas V1 aún alcanzables: `create_sale` (catálogo de ventas), `void_transaction` (POS undo), `perform_inventory_adjustment`+UPDATE (inversión de recepciones), `reverse_receipt`/`reverse_adjustment`/`create_devolution` vía flag OFF de los mapas API.
