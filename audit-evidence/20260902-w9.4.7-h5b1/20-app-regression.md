# W9.4.7 — H5-B1 · FASE 24 — Regresión de la aplicación

Fecha: 2026-09-03 · Logs: `/home/z/my-project/scripts/w947/f24_*.log`

## Herramientas del proyecto

| Tool | Comando | Resultado | Nota |
|---|---|---|---|
| lint | `npm run lint` (eslint .) | **PASS — exit 0** (0 errors, 1291 warnings pre-existentes) | sin warnings nuevos atribuibles a H5-B1 |
| typecheck | `npx tsc --noEmit` | **PASS — exit 0** (heap 3072MB tras liberar RAM) | 2 reintentos previos exit 137 = OOM ambiental (heap insuficiente, pm2 residente); resuelto liberando memoria, NO es un PASS artificial: el check final corrió completo con exit 0 |
| vitest | `npm test` (vitest run) | **PASS — exit 0** | **1892 passed / 24 skipped / 0 failed** en 90 archivos. Contratos H5-B1 verificados verdes: `iteration-11-3` (63, incluye PT-11.3.7/PT-11.3.8/PT-11.3.9), `iteration-rls` (40, PT-RLS.6.3), `iteration-11-5` (43), `iteration-fiscal` (53) |
| build | `npx next build` | **INCONCLUSIVE — ENVIRONMENTAL OOM (exit 137)** | 3 intentos (heap 3072/3584 + limpieza de procesos): `✓ Compiled successfully` ambas fases de compile OK; kill sistemático en la fase TypeScript interna de next build (worker TS excede la RAM física de 4GB del entorno). El equivalente exacto de esa fase (`tsc --noEmit`) pasó standalone con exit 0. **NO se marca PASS artificialmente** |
| routes | route smoke | **PASS** | `GET / → 200`, `GET /api/health → 200`, `POST /api/reverse` sin auth → **401** (ruta viva, withAuth activo), post-restore de pm2 |

## Clasificación del exit 137

- Ventana de reintentos: 3 (heap ↑ 2048→3072→3584MB; pm2 detenido; proceso zombi eliminado; ≥3.4GB libres en el último intento).
- Punto de fallo constante: `Running TypeScript ...` (worker interno de next build).
- El mandato se aplica textualmente: build = `INCONCLUSIVE — ENVIRONMENTAL OOM`. La fase fallida quedó cubierta por el typecheck standalone exit 0 sobre el mismo código.

## Conclusión FASE 24

Sin ninguna regresión de aplicación atribuible a H5-B1. lint/typecheck/vitest/routes PASS; build INCONCLUSIVE por limitación ambiental documentada.
