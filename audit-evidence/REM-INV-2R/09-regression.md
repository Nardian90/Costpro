# 09 — REGRESSION (REM-INV-2R, fase 13)

Entorno: Node v24.19.0, bun 1.3.14, npm 11.17.0. Fecha: 2026-09-13 UTC.

| Suite | Comando | Resultado | Exit |
|---|---|---|---|
| Contract test (CI gate) | `npm run test:security` | **PASS** — 134 funciones SECURITY DEFINER con escritura verificadas, 0 violaciones + pin REM-INV-2R verde («receive_purchase(uuid) sigue ausente del catálogo») | 0 |
| TypeScript | `npx tsc --noEmit` | **0 errores** (salida vacía) | 0 |
| ESLint | `npm run lint` | **0 errores** · 1291 warnings (pre-existentes, sin variación introducida por este gate) | 0 |
| Vitest (suite completa) | `npx vitest run` | **2070 passed / 24 skipped / 0 failed** (99 archivos passed, 1 skipped) | 0 |

Delta de tests vs REM-INV-2 (2068): **+2** = los 2 casos del nuevo pin de ausencia
REM-INV-2R. Cero fallos nuevos, cero P0/P1/P2 introducidos.

## Build

| Suite | Comando | Resultado |
|---|---|---|
| next build | `npm run build` | **exit 137** — «Killed» durante «Creating an optimized production build» |

## Limitación de infraestructura (pre-existente, documentada, no oculta)

Idéntica a la establecida en REM-V2-3 y REM-INV-2:
- Memoria disponible en la corrida: total 4041 MB, used 1279 MB, **swap 0** (free -m registrado);
- El OOM ocurre durante la fase de optimización del build de producción;
- NO fue introducido ni agravado por este gate (este gate no modifica código funcional:
  solo un test pin + un contract pin + evidencia);
- No se modificó ningún código para ocultar el OOM;
- El servidor de aplicación no resultó afectado: PM2 `costpro` online ininterrumpido,
  HTTP 200 verificado tras el build.

## Criterios de fase 13

- contract PASS ✔ · TypeScript 0 ✔ · ESLint 0 errors ✔ · Vitest 0 failures ✔
- exit 137 documentado como la misma limitación previa ✔
