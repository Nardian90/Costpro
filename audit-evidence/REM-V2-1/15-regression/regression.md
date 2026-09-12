# REM-V2-1 — 15 REGRESIÓN (§21) — ejecutada sobre el estado del gate

Entorno: clon fresco baseline `34f50a55` + cambios del gate (`.env.example` flags documentadas,
`scripts/v2-only-contract-test.cjs` nuevo). node_modules reinstallado (bun, 1319 paquetes).

| Comando | Resultado | Evidencia |
|---|---|---|
| `bunx tsc --noEmit` | **EXIT 0** — 0 errores de tipos | /tmp/tsc.log |
| `bun run lint` | **EXIT 0** — 0 errores (1291 warnings pre-existentes, baseline) | /tmp/eslint.log |
| `bunx vitest run` | **EXIT 0 — 2049 passed / 33 skipped / 0 failed** (97 archivos; baseline REM-PO-1 era 2058/0/24: delta = skips móviles de entorno, 0 failures) | /tmp/vitest.log |
| `node scripts/v2-only-contract-test.cjs` (NUEVO, FASE 14) | **EXIT 0 — PASS** (9 aserciones: drop H5-B1 intacto, RPC_MAP_V1.transaction→V2, allow-list callers create_sale, gating de flags en /api/reverse y /api/devolutions, sync offline V2) | salida en 18-verdict |
| `node scripts/security-contract-test.cjs` | **EXIT 2 — NOT EXECUTABLE**: requiere `SUPABASE_ACCESS_TOKEN` (credenciales live perdidas con reset del workspace). NO falseado. | /tmp/sec.log |
| `bun run build` (NODE_OPTIONS=2048MB) | **EXIT 137 — INFRASTRUCTURE BLOCKER (OOM SIGKILL)**. Compila OK ("Compiled successfully in 77s"); muere en fase TypeScript/generación por límite de memoria del host 4GB. Idéntico a OBS-2 de REM-INV-1. La verificación de tipos está cubierta por `tsc --noEmit` EXIT 0. NO convertido en PASS. | /tmp/build.log |

## Tests V2 específicos solicitados por §21

| Test | Estado |
|---|---|
| V2 checkout E2E | NO EJECUTADO — sin entorno seguro mutativo (§3) ni credenciales live; paridad por contrato de código (12-parity) |
| V2 reverse E2E | NO EJECUTADO — ídem |
| V2 idempotencia | DEMOSTRADA POR INVARIANTE DB (índice único compartido; ver 10-idempotency) + UNKNOWN ejecutiva |
| V2 concurrencia | DEMOSTRADA POR DISEÑO (FOR UPDATE + single-writer WAC) + UNKNOWN ejecutiva |
| V2 multi-store isolation | DEMOSTRADA POR CÓDIGO (has_store_access_as auth-pinned no-null en todas las RPCs V2; boundary API can_*_document) + UNKNOWN ejecutiva |

## Conclusión

Regresión estática completa: **PASS** (tsc/eslint/vitest/contract-V2-only).
Bloqueos documentados, no ocultos: build OOM (infra), test:security exit 2 (sin credenciales).
E2E mutativos: NO EJECUTADOS por §3/§00-baseline — no se falsea.
