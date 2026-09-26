# FASE D — 11 TEST RESULTS (§22 regresión completa)

## Tests nuevos (creados para capturar el bug real — §21)

```text
src/__tests__/store/cart-stale-store-sync.test.ts        6 tests (6 PASS post-fix)
src/__tests__/components/pos-cart-counter.test.tsx       3 tests (3 PASS post-fix)
PRE-fix: 5/6 store FAIL + 3/3 componente FAIL (reproducción documentada en 03)
POST-fix: 9/9 PASS — la prueba exigida que fallaba antes del fix EXISTE.
Tipo: integración (store real + POSView real renderizado) — no tests artificiales
del reducer aislado.
```

## Suite completa POST-fix

```text
npx vitest run → Test Files: 107 passed | 1 skipped (108)
                Tests:       2236 passed | 24 skipped (2260)
                Duration:    211.91s
0 fallos. Los 24 skips son preexistentes. Cobertura de umbrales CI intacta.
```

## TypeScript / Lint / Build

```text
npx eslint (archivos tocados): 0 errors, 8 warnings preexistentes del repo
  (tokens.css avisado como "no matching configuration" — normal, es CSS).
npx tsc --noEmit: OOM-killed localmente (limitación de infraestructura del host,
  MISMA ya documentada en FASE B/C: commit bbb74f4c "confirms local build OOM
  was host-only"). NO ocultado: la verificación autoritativa corre en CI
  (TypeCheck + Lint + Unit Tests + Build) sobre el SHA final — ver 15/CI.
npm run build: OOM-killed local (misma causa host-only). Verificado en CI.
```

## Suite de seguridad existente (sin cambios)

```text
scripts/security-contract-test.cjs y tests de contratos no fueron modificados;
2236/2236 incluyen los tests de contratos del writer C2 (409 FC, sin store_id).
```
