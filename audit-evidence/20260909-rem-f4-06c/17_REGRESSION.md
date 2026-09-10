# 17_REGRESSION — §21/§22 (raw: build_out.txt)

## §22 E2E existente relevantes (ejecutados ANTES del suite completo)
- src/__tests__/integration/iteration-fiscal.test.ts → 53 tests ✓
- src/__tests__/integration/iteration-11-4.test.ts → 62 tests ✓
- src/__tests__/components/multi-tienda-views.test.tsx → incluido
- Total: 3 files passed, 120 passed / 2 skipped.
(Espec cubren: contratos migraciones fiscales, inmutabilidad locked, validación de
fechas contra fiscal_closings, vistas multi-tienda. E2E-2 NO ejecutado — §30 STOP.)

## §21 Suite completa vs baseline
| Check     | Baseline              | Este gate            | Estado |
|-----------|-----------------------|----------------------|--------|
| Vitest    | 2058 PASS / 0 / 24 SK | 2058 PASS / 0 / 24 SK (96 files + 1 skip) | IDÉNTICO |
| TSC       | 0 errores             | 0 errores (exit 0)   | IDÉNTICO |
| Lint      | 0 errors / 1291 warn  | 0 errors / 1291 warn (exit 0) | IDÉNTICO |
| Build     | exit 137 INFRA OOM    | exit 137 INFRA OOM   | ver abajo |
| PM2       | 3/3 online, 0 restarts| 3/3 online, 0 restarts, uptime 2h+ | IDÉNTICO |
| Health    | 200                   | 200 (/ y /api/health)| IDÉNTICO |

## Build — clasificación INFRASTRUCTURE OOM (5 condiciones)
1. Compilación: en ESTE gate el diff de src/ es VACÍO (git diff vacío; único cambio =
   migración SQL nueva + evidencia) → el camino de compilación es byte-idéntico al
   baseline; el precedente F4-06b demostró compilación completada antes del OOM en este
   mismo entorno/config. (Esta corrida el kernel mató el proceso a los 48s, en fase de
   build, sin error de código en el log.)
2. TSC independiente: exit 0 (sin errores).
3. exit code: 137 (SIGKILL).
4. dmesg: «Out of memory: Killed process 14211 (next-build (v16)) … global_oom …
   anon-rss:2445160kB» (~2.4 GB RSS, total-vm ~40 GB).
5. Memoria insuficiente: host 4 GB totales (PM2 costpro residente ~700 MB), swap 0;
   config sin modificar (next.config.ts intacto, sin flags para ocultar el OOM).
→ INFRASTRUCTURE OOM clasificado bajo los mismos criterios estrictos de F4-03/04/06/06b.
