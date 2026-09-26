# FASE E-SEC-R — 09 REGRESSION RESULTS (FASE 9/10)

## Fecha / HEAD
2026-09-26 · dd1e6fb9. **Cambios de código en esta fase: CERO** → se ejecutó la
regresión E-SEC completa + typecheck + lint (FASE 10 del mandato: tests específicos,
regresión E-SEC, TypeScript, lint; build/CI según disponibilidad).

## Resultados

| Suite / Check | Resultado | Clasificación |
|---|---|---|
| `npx vitest run` (suite completa — incluye los 9 tests E-SEC de `pos-checkout-price-integrity.test.ts`, tests supervisor/RC-1 de iteración 11.x y 18 tests de autorización de precios de E-SEC) | **2254 passed / 0 failed / 24 skipped** (109 files passed, 1 skipped) — IDÉNTICO al baseline E-SEC (13-final-verdict: 2254 passed) | **PASS** |
| `npx tsc --noEmit` | exit 0 | **PASS** |
| `npm run lint` (eslint .) | exit 0 — **0 errors**, 1294 warnings (preexistentes, idénticos al estado E-SEC: "eslint 0 errors") | **PASS** (0 errors) |
| Build local (`next build`) | **NO EJECUTADO** — limitación OOM local preexistente y documentada (E-SEC 12: el build se verificó en CI sobre el MISMO árbol; sin cambios de código el artefacto no varía) | **NO EJECUTADO** (limitación de infraestructura conocida, no regresión) |
| CI remoto | sin push de código en esta fase (solo evidencia) → sin run nuevo; el último CI verde de código sigue siendo el de dd1e6fb9 | **NO EJECUTADO** (no aplica: cero cambios de código) |

## Matriz funcional FASE 9 (regresión de comportamiento — sin cambios que ejercitar,
se aporta el estado verificado en esta fase y en E-SEC sobre el MISMO código dd1e6fb9):

| Caso | Comportamiento vigente verificado | Fuente |
|---|---|---|
| 500→500 normal | 200, sin supervisor | E-SEC A1 (mismo código) |
| 500→490 (2%) | 200, sin supervisor | E-SEC A3/A21e + suite (test 500→490) |
| 500→425 (umbral 15% justo) | gate dispara en ≥15 (RPC `>= 15`) | RPC :241 + prueba numérica H |
| 500→424.99 (15.002%) | gate dispara | prueba numérica I |
| 500→300 (40%) sin autorización | 403 ERR_SUPERVISOR_REQUIRED | E-SEC A11 + suite |
| 500→0 / 500→1 | 403 (desvío 100% → gate) | E-SEC A5/A6/A7 |
| precio negativo | 400 (Zod) / 400 ERR_INVALID_PRICE (RPC) | E-SEC 06 + suite |
| NaN / ±Infinity | 400 (Zod finite) / 400 ERR_INVALID_PRICE | suite E-SEC (4 tests) |
| producto/variante incorrecto | 400 ERR_STORE_MISMATCH / ERR_PRODUCT_NOT_FOUND | E-SEC 06; route :192-194 |
| token falso | 403 (BAD_SIGNATURE) | R5 = 403 (esta fase) |
| token expirado | 403 (EXPIRED) | R4 = 403 (esta fase) |
| token válido | 200 según política RC-1 vigente (R1) | R1 = 200 (esta fase) |
| idempotencia | replay misma key = misma tx; key distinta con mismo payload = venta nueva permitida por diseño (la key la genera el cliente) | E-SEC 09 (mismo código) |
| inventario | 1 movimiento por venta, balance_after coherente | E-SEC 08 (mismo código) |
| auditoría | reconstruye catálogo/vendido/desvío (agregado)/usuario/autorizador (`supervisor_id`) — por línea solo según DECISIÓN 4 pendiente | R1-R3 AUDIT (esta fase) + RPC :425-445 |

## Aislamiento (zero-touch)
PRE y POST de la fase, las 3 tiendas protegidas sin ninguna actividad nueva
(`esecr-supervisor-matrix.json` y `esecr-cleanup-log.json` → `zero_touch`:
ENERVIDA última venta 2026-08-17; Puerto Padre 2026-07-11; CENTRAL sin ventas,
último producto 2026-09-06). Todas las mutaciones de prueba quedaron en el sandbox
sintético `ESEC TEST ESEC0926014201` y fueron limpiadas por el mecanismo oficial por
IDs (products/memberships/inventory/movements/items eliminados; profiles soft-delete;
transactions/audit_logs/store/auth.users bloqueados por gobernanza — registrado,
no improvisado).

## Interpretación
Sin cambios de código, la regresión confirma que el sistema permanece EXACTAMENTE
en el estado certificado por E-SEC (2254/0 + tsc 0 + lint 0 errors). No existe
ningún FAIL REGRESION ni FAIL PREEXISTENTE nuevo.
