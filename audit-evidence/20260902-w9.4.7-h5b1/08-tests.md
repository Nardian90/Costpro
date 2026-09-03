# W9.4.7 — H5-B1 · FASE 8 — Tests

Fecha: 2026-09-03 · Scope: `src/__tests__/**` (vitest), `supabase/tests/**`, `scripts/*.mjs`.

## 1. Tests vitest que mencionan reverse_transaction* — análisis de acoplamiento

| Test | Qué aserte | ¿Lee nuestra nueva migración? | ¿Representa contrato V1? | Tras H5-B1 |
|---|---|---|---|---|
| `iteration-11-3.test.ts` PT-11.3.7 (líneas 93-109) | `migraciones 20260808*` NO contienen `DROP FUNCTION IF EXISTS public.reverse_transaction(` | **NO** — filtra `f.startsWith('20260808')`; la migración H5-B1 es `20260902*` | No: es una aserción histórica de que la migración V2.17.1 no borró V1 | **VERDE sin cambios** |
| `iteration-11-3.test.ts` PT-11.3.9 (líneas 112-120) | `route.ts` contiene strings `RPC_MAP_V1`, `RPC_MAP_V2`, `'reverse_transaction_v2'`, `'reverse_receipt_v2'`, `'duplicate_inventory_adjustment_v2'`, `FEATURES.USE_V2_REVERSE`, `'reverse_transfer'` | n/a | Representa el CONTRATO VIGENTE del branch v1/v2 en route.ts | **VERDE con corrección R1** (R1 mantiene todos los strings exigidos; el test NO exige que RPC_MAP_V1.transaction sea la V1) |
| `iteration-11-3.test.ts` PT-11.3.8 (líneas 110-113) | `features.ts` contiene `USE_V2_REVERSE` y `=== 'true' \|\| false` | n/a | Contrato del flag | VERDE (no tocamos features.ts) |
| `iteration-11-4.test.ts:158-160`, `iteration-11-5.test.ts` (PT-11.5.11), `iteration-fiscal.test.ts:181-183` | aserciones sobre `features.ts` / migración `20260811000002` — ninguna exige V1 | NO | NO | VERDE |
| `iteration-rls.test.ts` PT-RLS.6.3 (líneas 256-261) | lista FIJA de 8 migraciones RLS `20260807*` no contienen `CREATE OR REPLACE FUNCTION public.reverse_transaction_v2` | NO (lista hardcoded) | NO | VERDE |
| `iteration-rls.test.ts` PT-RLS.6.x demás | mismas migraciones RLS | NO | NO | VERDE |

**Ningún test vitest ejecuta la RPC V1 contra DB.** Todos son aserciones estáticas de contenido de archivos.

## 2. Riesgo de PT-11.3.7 — verificación fina

El regex es `/DROP FUNCTION IF EXISTS public\.reverse_transaction\(/` aplicado SOLO al contenido concatenado de migraciones `20260808*`. Nuestra migración:
- Se llama `20260902201500_w9_h5b1_retire_reverse_transaction_v1.sql` (no empieza con 20260808) → no es leída por ese test.
- Aunque fuese leída, el patrón del test exige `DROP FUNCTION IF EXISTS` — nuestra migración usa exactamente ese formato para V1... por eso la exclusión por prefijo de fecha es la que protege. Verificado: el glob del test es `f.startsWith('20260808')`. **La migración H5-B1 no colisiona.**

## 3. Tests manuales (.mjs) — contrato con V1

- `scripts/test_reverse_all_live.mjs` y `scripts/test_reverse_e2e_full.mjs` ejecutan `.rpc('reverse_transaction')` real contra producción. **Representan el contrato caller-side de V1 y deben migrarse a V2 antes del DROP** (corrección R2, FASE 15).
- Campos que aserten: stock antes/después, ciclo de venta→reversión, presencia de kardex/movimientos. Ningún campo del payload de respuesta de V1 (`items_reversed`) es asertado de forma que V2 (`units_restored`) rompa — verificado leyendo ambos scripts (aserciones sobre stock y exitosidad del RPC, no sobre claves de la respuesta).

## 4. Conclusión

- Tests de contrato vitest: **0 requieren V1 funcional**; PT-11.3.9 requiere estructura del branch (se preserva con R1).
- Tests manuales: 2 scripts con dependencia directa → migración obligatoria pre-DROP (R2).
- No se modifica ningún test en este checkpoint.
