# W9.5 — B-10b-OBS-2 · 16-regression.md
# Regresión completa (GATE 17)

Fecha: 2026-09-06 · Estado: PM2 3/3 online, HTTP 200 ×2

## Suite de tests (`vitest run` — runner oficial del repo)

Ejecución por chunks (documentado: el sandbox limita RAM a 4 GiB cgroup sin swap y el
dev server PM2 de costpro retiene ~0.7-1.5 GB; la corrida monolítica del suite muere
por OOM del runner — NO del código. Mismo alcance total: los 94 archivos
`src/**/*.test.{ts,tsx}` del include de vitest.config.ts).

| Chunk | Ámbito | Archivos | Resultado |
|---|---|---|---|
| 1 | unit + ui + contracts + store + validation + lib | 13 | **233 passed** |
| 2 | api + hooks | 15 | **114 passed** + 1 skipped |
| 3 | components | 11 | **120 passed** + 5 skipped |
| 4 | services | 11 | **249 passed** + 1 skipped |
| 5 | integration (1-22) | 22 | **716 passed** + 11 skipped |
| 6 | integration (23-44) | 22 | **557 passed** + 6 skipped |
| **TOTAL** | suite completa | **94** | **1.989 passed · 0 failed · 24 skipped** |

Incluye el test permanente nuevo: `src/__tests__/integration/iteration-17-b10b-obs2-orphan-ledger.test.ts`
(16 tests, 514 assertions, 16/16 PASS — detector global de huérfanos + congelación del pack).

## Lint

```text
bun run lint → exit 0 · 0 errors (1291 warnings pre-existentes, 0 añadidos por esta fase)
```

## TypeScript

```text
bunx tsc --noEmit → exit 0 · 0 errores
next build (fase Running TypeScript) → Finished TypeScript in 77s ✓
```

## Build

```text
bun run build → exit 0
  ✓ Compiled successfully in 43s
  ✓ Finished TypeScript in 77s
  ✓ Generating static pages (193/193)
```

Nota operativa: en este sandbox el build requiere `NODE_OPTIONS=--max-old-space-size=2048`
(cgroup 4 GiB sin swap; sin el cap, el tsc interno es OOM-killed por el cgroup —
comportamiento del entorno, no del código; el código no fue modificado).
Los primeros intentos dejaron un proceso tsc huérfano que fue eliminado (`pkill tsc`).

## Runtime

```text
pm2 status → 3/3 online (costpro · telegram-cron-poller · whatsapp-cron-poller), 0 errored
curl /            → HTTP 200
curl /api/health  → HTTP 200
```

(El proceso costpro fue detenido temporalmente SOLO para liberar RAM durante el build
y reiniciado inmediatamente después — estado final verificado 3/3 + HTTP 200 ×2.)

## Veredicto de regresión

```text
PASS — tests 1.989/0 fail · lint 0 errors · tsc 0 · build OK · PM2 3/3 · HTTP 200 ×2
```
