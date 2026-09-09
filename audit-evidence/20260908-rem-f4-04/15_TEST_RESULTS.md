# 15 — TEST RESULTS (suite funcional F4-04, 54 PASS / 0 FAIL)

## Comando de ejecución de la regresión (esta corrida, cierre §23–§28)

| Gate | Comando | Resultado | Duración |
|---|---|---|---|
| Vitest | `NODE_OPTIONS=--max-old-space-size=2560 npx vitest run --no-file-parallelism --maxWorkers 1 --pool=forks` | **2058 PASS / 0 FAIL / 24 SKIP** | 208.20s |
| TSC | `NODE_OPTIONS=--max-old-space-size=3072 npx tsc --noEmit` | exit 0, 0 errores | — |
| Lint | `npm run lint` (eslint .) | 0 errors / 1291 warnings | — |
| Build | `NEXT_TELEMETRY_DISABLED=1 npm run build` | Compiled OK; type-check interno OOM infra (137) | ~80s |
| PM2 | `pm2 start ecosystem.config.js` + `curl /api/health` | 3/3 online, 0 restarts, health 200 | — |

## Suite funcional F4-04 (ejecutada tras el apply, 2026-09-09T02:08–02:10Z)

Fuente: `evidence/remf404-test-suite-results.json` + `remf404-test-suite-output.txt`
(+ 20 líneas del harness en `tests/f4_04_tests.mjs`).

```text
PASS: 54
FAIL: 0
exit_clean: true
```

Desglose por bloque:

| Bloque | Alcance | PASS |
|---|---|---|
| P0 | Preconditions (login, guard presente, trigger ausente por diseño) | 3 |
| P1 | **F4-04.1** Path A HTTP real: receipt → movement → WAC (0→100) | 10 |
| P2 | **F4-04.2** Oráculo exacto (99×800 + 1×1000)/100 == **802** | 6 |
| P3 | **F4-04.3** stock>0 ⇒ WAC válido (fixtures + censo global, deuda F-08 separada) | 1 (+censo informativo) |
| P4 | **F4-04.4** Camino canónico confirm_pending_reception == 802, sin doble update | 7 |
| P5 | **F4-04.5** Venta: COGS == qty × WAC == 1800 server-side | 7 |
| P6 | **F4-04.6** Reversa: stock/WAC/ledger restaurados, tx voided | 5 |
| P7 | **F4-04.7** Seguridad: anon DENY ×2, non-member DENY | 3 |
| P8 | **F4-04.8** Idempotencia: retry → unique constraint, 0 efectos duplicados | 6 |
| P9 | **§19** Multimoneda: USD@120 → 1200 CUP, normalización única | 5 |
| | **TOTAL** | **54** |

## Clasificación de incidencias de infraestructura durante la regresión

| Incidencia | Clasificación | Acción |
|---|---|---|
| Caída del workspace en §23 (corrida anterior) | INFRASTRUCTURE FAILURE | PM2 restaurado al inicio de esta corrida (estado registrado) |
| Intento 1 Vitest desacoplado muerto a ~2 min (sin OOM) | INFRASTRUCTURE FAILURE | Reintento en foreground → PASS completo |
| Build: OOM kernel en "Running TypeScript" | INFRASTRUCTURE OOM (firma dmesg capturada) | TSC independiente exit 0 demostrado; config de producción intacta |

## Conclusión

**Regresión completa == baseline en todos los gates medibles.** Los dos
incidentes de infraestructura (kill de sandbox, OOM kernel) están
clasificados como INFRA, preservados como raw, y NO son fallos de código
(directive §17); tampoco se convirtieron en PASS implícito: el gate Build se
declara INFRA BLOCKED en 16_FINAL_VERDICT.md con el criterio subyacente
demostrado por vía independiente.
