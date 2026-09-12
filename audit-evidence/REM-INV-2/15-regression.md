# REM-INV-2 — 15: REGRESSION

Comandos ejecutados sobre el árbol del gate (únicos cambios: test pin permanente + evidence pack). Comparación contra baseline REM-V2-3 (commit `90dce25f`): contract 16/16 (archivo de contratos reverse) → suite contracts completa; vitest 2064/24/0.

| Suite | Comando | Resultado | Baseline | Delta |
|---|---|---|---|---|
| Contract tests | `npx vitest run src/__tests__/contracts/` | **29/29 PASS** | (familia: 16/16 en 90dce25f) | sin regresiones |
| TypeScript | `npx tsc --noEmit` | **exit 0 — 0 errores** (assets/tsc.log) | 0 | = |
| ESLint | `npx eslint .` | **exit 0 — 0 errors** (1291 warnings pre-existentes) | 0 errors | = |
| Vitest completo | `npx vitest run` | **2068 passed / 24 skipped / 0 failed** (assets/vitest.log) | 2064/24/0 | **+4 = exactamente los 4 tests del pin dinámico de este gate** (98 passed, 1 skipped files) |
| Build producción | `npx next build` | **exit 137 (OOM Kill)** (assets/build-exit.txt) | exit 137 en REM-V2-2.1/REM-V2-3 | = limitación infraestructura pre-existente |

## Build OOM — documentación exigida (no ocultar)

```text
free -m (post-build): total 4041 MB | used 1372 MB | available 2669 MB | Swap: 0 MB (AUSENTE)
Salida del build: "Creating an optimized production build ..." → "Killed" (SIGKILL del kernel por OOM)
Identificación: fallo de infraestructura de memoria del entorno (4 GB sin swap), idéntico al
comportamiento ya documentado y aceptado en REM-V2-2.1 y REM-V2-3 (mismo exit 137, mismo punto).
No es un fallo de compilación TypeScript/ESLint (ambos limpian en 0) ni de tests (2068/0).
```

## Veredicto de regresión

**PASS.** Sin nuevos P0/P1; sin P2 introducidos por el gate (el +4 de vitest es el instrumento permanente añadido). El build OOM es la limitación documentada de infraestructura, no un cambio del gate — consistente con el cierre CONDITIONAL de REM-V2-3.

## Remediación ejecutada por este gate (PHASE 16, resumen)

| Acción del protocolo | Estado | Justificación |
|---|---|---|
| Migrar callers V1 | N/A — **0 callers existen** (04) | nada que migrar |
| Retirar fallbacks | N/A — no hay fallbacks de recepción | no existen ramas V1 |
| Retirar referencias V1 | N/A — **0 referencias** en código | no hay referencias |
| Actualizar RPC maps | N/A — `receive_purchase` no está en ningún map | verificado (04 §S5) |
| Offline/replay correcto | ✅ demostrado dinámicamente (W2: replay → `register_reception`) | 05 |
| Revocar EXECUTE V1 | **DEFERIDO** (guard SQL preparado: assets/deferred-db-remediation.sql) | zero-touch / sin canal DDL autorizado — limitación externa idéntica al precedente REM-V2-3 |
| Instrumento permanente | ✅ `src/__tests__/integration/rem-inv-2-dynamic-reachability.test.ts` (4 pins) | congela el contrato dinámico de recepción |
