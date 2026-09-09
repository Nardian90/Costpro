# 14 — REGRESSION (§23/§25/§26/§27/§28 de la directive)

**Entorno:** 3.9Gi RAM total / 0 swap. PM2 detenido de forma controlada
durante la regresión pesada (estado PRE registrado: 3/3 online, 0 restarts,
health 200 @ 03:05:39Z) y restaurado al final.

## §23 — VITEST (baseline obligatorio: 2058 PASS / 0 FAIL / 24 SKIP)

```text
command:   NODE_OPTIONS=--max-old-space-size=2560 npx vitest run \
             --no-file-parallelism --maxWorkers 1 --pool=forks
start:     2026-09-09T03:15:23Z
duration:  208.20s
Test Files 96 passed | 1 skipped (97)
Tests      2058 passed | 24 skipped (2082)
```

**2058 / 0 / 24 == baseline EXACTO.** Desviación: ninguna.

- Intento 1 (proceso desacoplado vía setsid): muerto por la infraestructura
  del sandbox a los ~2 min sin firma OOM (última línea del log = test PASS).
  Clasificado **INFRASTRUCTURE FAILURE** y reintentado (directive §23/§17).
  Raw preservado: `evidence/remf404-vitest-run.ATTEMPT1-INFRA-KILLED.log`.
- Ningún test fue modificado ni debilitado para reducir memoria
  (solo flags de ejecución: single worker, no file parallelism, heap cap).

## §25 — TYPESCRIPT

```text
command:   NODE_OPTIONS=--max-old-space-size=3072 npx tsc --noEmit
exit_code: 0
errors:    0
```

Raw: `evidence/remf404-tsc-run.log` (vacío = sin errores). Antecedente de OOM
de TSC en este entorno quedó resuelto con PM2 detenido; sin workaround
diferente al control de memoria documentado.

## §26 — LINT

```text
command:   npm run lint   (script oficial: eslint .)
exit_code: 0
resultado: ✖ 1291 problems (0 errors, 1291 warnings)
```

- **0 errors** == requerido.
- **1291 warnings == baseline histórico exacto** — no se convirtieron en
  errores ni se eliminaron (directive §26). Raw: `evidence/remf404-lint-run.log`.

## §27 — BUILD (oficial: `npm run build` → next build)

```text
exit_code: 137 (SIGKILL)
✓ Compiled successfully in 77s (Turbopack)
  Running TypeScript ... Killed
```

- **Firma del kernel (evidencia dura):** `oom-kill … task=next-build …
  Out of memory: Killed process 8973 (next-build) anon-rss:3176908kB`
  → OOM del kernel en un entorno de 3.9Gi sin swap, con PM2 YA detenido
  (memoria máxima disponible del entorno). Raw:
  `evidence/remf404-build-oom-kernel-signature.txt`,
  `evidence/remf404-build-run.log`, `evidence/remf404-build-command.txt`.
- **Distinguishing infra vs defecto (directive §27):**
  - La compilación (fase que genera el bundle) SÍ pasó: "Compiled successfully".
  - El type-checking que murió dentro del build es el MISMO chequeo que
    `tsc --noEmit` ejecuta de forma independiente → **exit 0, 0 errores**.
  - `next.config.ts` NO fue modificado para ocultar el OOM (prohibido).
  - Precedente idéntico documentado en RECON (worklog FASE4-E2E-1-RECON-01:
    "build oficial (OOM de infra ≠ fallo de código)").
- **Clasificación: BUILD = INFRASTRUCTURE OOM** (no CODE FAIL). No puede
  puntuar "Build PASS" literal; se documenta como bloqueo de infraestructura
  con el criterio subyacente (0 errores TS + compilación exitosa) demostrado
  por vías independientes. Ver 16_FINAL_VERDICT.md.

## §28 — PM2 / HEALTH (post-regresión)

```text
pm2 start ecosystem.config.js
PM2:      3/3 online (costpro, telegram-cron-poller, whatsapp-cron-poller)
restarts: 0 (sin crash loop)
health:   HTTP 200 {"status":"ok","service":"costpro-enterprise",...}
```

## Resumen de regresión

| Gate | Resultado | Baseline | Desviación |
|---|---|---|---|
| Vitest | 2058 PASS / 0 FAIL / 24 SKIP | 2058/0/24 | NINGUNA |
| TSC | 0 errores | 0 | NINGUNA |
| Lint | 0 errors / 1291 warnings | 0 / 1291 | NINGUNA |
| Build | Compilación OK; type-check interno OOM (kernel firma) | — | INFRA (documentada) |
| PM2 | 3/3, 0 restarts | 3/3 | NINGUNA |
| Health | 200 | 200 | NINGUNA |
