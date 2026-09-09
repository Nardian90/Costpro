# 17 — REGRESSION (global + específica, directiva §24/§26)

**Metadata de ejecución:** `evidence/remf403-regression-command.txt`
PM2 detenido de forma controlada para la regresión pesada (PRE registrado:
3/3 online, 0 restarts, health 200) y restaurado al final.

## Regresión global

### Vitest (baseline obligatorio 2058/0/24)

```text
command:   NODE_OPTIONS=--max-old-space-size=2560 npx vitest run \
             --no-file-parallelism --maxWorkers 1 --pool=forks
start:     2026-09-09T04:12:03Z   duration: 210.18s
Test Files 96 passed | 1 skipped (97)
Tests      2058 passed | 24 skipped (2082)
```

**2058 / 0 / 24 == baseline EXACTO.** El cambio de la ruta y la migration no
rompieron ningún test existente. Desviación: ninguna.

### TSC

```text
command: NODE_OPTIONS=--max-old-space-size=3072 npx tsc --noEmit
exit 0, 0 errores (log vacío: evidence/remf403-tsc-run.log)
```

### Lint

```text
command: npm run lint (eslint .)
0 errors / 1291 warnings == baseline histórico exacto
(los warnings no se convirtieron en errores ni se eliminaron)
```

### Build

```text
exit_code: 137 (SIGKILL)
✓ Compiled successfully in 79s (Turbopack)
  Running TypeScript ... Killed
```

- Firma del kernel capturada (`remf403-build-oom-kernel-signature.txt`):
  `Out of memory: Killed process 14053 (next-build) anon-rss:2855476kB`
  — OOM del kernel en 3.9Gi sin swap, PM2 YA detenido.
- Clasificación: **INFRASTRUCTURE OOM** (no code fail) — idéntico al
  precedente REM-F4-04 y RECON. Criterio subyacente demostrado por vía
  independiente: TSC 0 errores. `next.config` NO tocado.
- La remediación F4-03 (route TS + migration SQL) compila: la fase de
  compilación que genera el bundle pasó exitosamente.

### PM2 / Health

```text
PM2:    3/3 online (costpro, telegram-cron-poller, whatsapp-cron-poller)
restarts: 0 (sin crash loop)
health: HTTP 200 {"status":"ok"}
```

## Regresión específica (directiva §24)

| Flujo | Resultado |
|---|---|
| **F4-04 no alterado** | PASS — P0 de la suite: `fn_recalc_wac` + `register_reception` presentes post-migration; la recepción HTTP real usada como seed de fixtures funcionó (WAC server-side exacto) |
| receipts → WAC | PASS (seeds de la suite por el camino canónico) |
| WAC | PASS (escritor único intacto; retiros no re-precifican) |
| production → withdraw → inventory → accounting | PASS (P1–P12 completos) |
| Vitest 2058/0/24 | PASS (incluye suites de production orders preexistentes) |

## Resumen

| Gate | Resultado | Baseline | Desviación |
|---|---|---|---|
| Vitest | 2058/0/24 | 2058/0/24 | NINGUNA |
| TSC | 0 | 0 | NINGUNA |
| Lint | 0/1291 | 0/1291 | NINGUNA |
| Build | INFRA OOM (compilación OK) | — | INFRA documentada (precedente) |
| PM2 | 3/3, 0 restarts | 3/3 | NINGUNA |
| Health | 200 | 200 | NINGUNA |
