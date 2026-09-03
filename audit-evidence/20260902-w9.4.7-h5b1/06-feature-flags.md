# W9.4.7 — H5-B1 · FASE 6 — Configuración y feature flags

Fecha: 2026-09-03

## Estado del flag

| Fuente | Valor |
|---|---|
| `.env` línea 15 | `NEXT_PUBLIC_USE_V2_REVERSE=true` |
| `ecosystem.config.js:84` | pasa `NEXT_PUBLIC_USE_V2_REVERSE` del entorno al proceso pm2 (`costpro`) |
| `vercel.json` | sin referencias a reverse ni al flag |
| `src/config/features.ts:46` | `USE_V2_REVERSE: process.env.NEXT_PUBLIC_USE_V2_REVERSE === 'true' \|\| false` → **true en producción** |

`NEXT_PUBLIC_USE_V2_REVERSE` aparece en exactamente 13 archivos del árbol (ver run A de FASE 4): definición (features.ts), consumo runtime (route.ts:78, devolutions/route.ts:73+88), passthrough pm2 (ecosystem.config.js), y 8 tests de aserción. **Ningún otro mecanismo de configuración** (.env.local, .env.production, vercel.json, config/) define el flag.

## Análisis del fallback (route.ts:78)

```ts
const rpcMap = FEATURES.USE_V2_REVERSE ? RPC_MAP_V2 : RPC_MAP_V1;
```

- Con el flag `true` (producción actual), `RPC_MAP_V1` **nunca se selecciona** → V1 no es alcanzable desde runtime.
- El fallback es **código real**, no muerto: si el flag se apagara, `type=transaction` llamaría `reverse_transaction` (V1). Es la única rama viva que puede llegar a V1.
- Los otros tipos del fallback (`receipt→reverse_receipt`, `adjustment→reverse_adjustment`, etc.) son RPC v1 de OTROS objetos (fuera de scope H5-B1: reverse_receipt es deuda H5-B2; las demás ni siquiera están en la lista de deudas H5).

## Decisión

Fallback real existe → condición de GO exige neutralizarlo **para el tipo `transaction`**. La corrección autorizada (FASE 15, corrección R1) es mínima y de un solo sentido:

```ts
// RPC_MAP_V1.transaction: { rpc: 'reverse_transaction', ... }  →
transaction: { rpc: 'reverse_transaction_v2', idParam: 'p_transaction_id' }, // H5-B1: V1 retirada (W9.4.7) — el fallback ya no puede llegar a V1
```

- Mantiene el nombre `RPC_MAP_V1` y la línea `FEATURES.USE_V2_REVERSE` (requisitos de los tests de contrato PT-11.3.9 → sin cambios en tests).
- No altera el comportamiento de `receipt`/`adjustment`/`transfer`/`devolution`/`production_order` (fuera de scope).
- Resultado: **ningún camino de ejecución posible puede llegar a V1**, con el flag en cualquier estado. Tras el DROP, apagar el flag no rompería `/api/reverse` (type=transaction iría a V2; el resto de tipos no cambia).
- Los tests PT-11.3.9 no exigen que RPC_MAP_V1.transaction sea `'reverse_transaction'` (solo que el string `RPC_MAP_V1` y `FEATURES.USE_V2_REVERSE` existan) → verificado verde tras el cambio.

Los 2 scripts manuales que llaman V1 directamente se tratan en FASE 7.
