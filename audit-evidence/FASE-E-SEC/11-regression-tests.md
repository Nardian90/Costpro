# FASE E-SEC — 11 REGRESSION TESTS (GATE E12)

## Fecha
2026-09-26 · post-fix, repo en 6ac52feb + cambios E-SEC (route, cart.ts, usePOSCheckout,
useSalesCatalog, migración, 2 archivos de test nuevos).

## Comandos (definidos por el repositorio — package.json)
```text
npx vitest run                        (suite completa)
npm run lint                          (eslint .)
npx tsc --noEmit                      (typecheck)
npx vitest run <2 archivos nuevos>    (target)
```

## Resultado
```text
VITEST (suite completa):  Test Files 109 passed | 1 skipped (110)
                          Tests      2254 passed | 24 skipped (2278)
                          Duration   214.59s
  → 0 fallos. (FASE D certificó 2236; la suite creció +42 con los tests de E-SEC
    y del ciclo continuo; los 24 skipped son skips preexistentes, p. ej. backup-schema.)

TESTS NUEVOS E-SEC (target): 18/18 PASS
  src/__tests__/api/pos-checkout-price-integrity.test.ts  (10 tests)
    · 500→490 por ítem llega al RPC como price_at_sale=490 (flexibilidad NO bloqueada)
    · descuento global legítimo reenvía discount_value
    · price Infinity / "NaN" / "abc" / -1 → 400 y el RPC NUNCA se llama
    · ERR_INVALID_PRICE → 400 "Precio inválido…"
    · ERR_SUPERVISOR_REQUIRED → 403 ; ERR_TOTAL_MISMATCH → 422
    · supervisor sin token → 403 y RPC no llamado (RC-1 intacto)
  src/__tests__/store/effective-unit-price.test.ts  (8 tests)
    · sin descuento → catálogo ; 2% → 490 ; 10% → 450
    · fijo por LÍNEA (500×2 con 10 → 495/u) ; clamp a 0 ; 100% → 0
    · invariante Σ price×qty == subtotal de línea (contrato del payload V2)

ESLINT (proyecto completo): 0 errors, 1294 warnings (warnings preexistentes del repo;
los 6 archivos tocados por E-SEC: 0 errors, 0 warnings nuevos).

TSC --noEmit (NODE_OPTIONS=--max-old-space-size=3500): EXIT 0 — sin errores de tipos
(la limitación OOM del host quedó mitigada con heap elevado; ver doc 12 para CI).
```

## Cobertura de regresión por área del mandato
| Área | Suite |
|---|---|
| POS / checkout / ventas | integration/iteration-11-*.test.ts, contracts/*, store/cart* — PASS |
| Inventarios | integration/iteration-19-b10b-obs2…, inventory suites — PASS |
| Autorización / RLS / RPC | integration/iteration-rls.test.ts, supervisor suites — PASS |
| Seguridad | REM-INV / REM-SEC suites heredadas — PASS |
| Idempotencia | integration/idempotency suites — PASS |

## Interpretación
Ninguna regresión: el flujo normal, el walk-in, la caja, el vale de salida, la
anulación y los contratos de seguridad existentes pasan intactos con la corrección.
