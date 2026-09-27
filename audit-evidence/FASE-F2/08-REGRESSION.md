# FASE F2 — 08 REGRESSION (Gates A–D + smoke funcional)

**Fecha**: 2026-09-27 · Orden del mandato §12: A unit → B typecheck → C lint → D build (CI como autoridad por R-INFRA-1) + smoke relevante al árbol de build. Logs crudos: `scripts/f2-gateA-unit.log`, `f2-gateB-typecheck.log`, `f2-gateC-lint.log`, `f2-gateD-build.log` (fuera del repo).

## Gate A — Unit (suite completa, `CI=true bun run test`)

```text
exit=0
Test Files  110 passed | 1 skipped (111)
     Tests  2278 passed | 24 skipped (2302)
   Duration  212.97s
```

**0 fallos** — coincidencia exacta 1:1 con baseline F0/E-SEC-FINAL y con F1 (2278/0/24): cero regresiones, cero tests nuevos rotos, y la suite no cambió por ninguna razón no documentada.

## Gate B — Typecheck (`bunx tsc --noEmit`)

```text
exit=0 · 0 líneas de salida → 0 errors
```

## Gate C — Lint (`bun run lint`)

```text
exit=0
✖ 1294 problems (0 errors, 1294 warnings)
```

- **0 errores**; 1294 warnings = el mismo stock preexistente documentado desde F0/F1 (clase `<button>` crudo). F2 no modifica NINGÚN archivo fuente (.ts/.tsx/.js) → 0 warnings nuevos por construcción (ESLint no lintea package.json/lockfiles).

## Gate D — Build — R-INFRA-1 reproducido 1:1, CI queda como autoridad

### Intento local único, sin ningún ajuste de memoria (fidelidad total, nada silenciado)

```text
comando:   bun run build  (next build, Next.js 16.3.3 + Turbopack)
exit code: 137 (SIGKILL — OOM killer global del kernel) a los 61s
punto:     fase de compilación
dmesg:     oom-kill:constraint=CONSTRAINT_NONE … global_oom, task=next-build (v16)
           Out of memory: Killed process 16940 (next-build (v16))
           total-vm:40729916kB, anon-rss:2663872kB   [host: 4041 MB, swap 0]
```

- Firma **idéntica** a la documentada en F1 (exit 137, global OOM, `next-build (v16)`, techo físico 4041 MB/0 swap) → **R-INFRA-1 preexistente, no regresión de F2**.
- No se modificó `NODE_OPTIONS`, ci.yml ni ninguna configuración de memoria (mandato §12).
- Per mandato: **CI es la autoridad del Gate D** → el job `Build` del run CI de este commit es el veredicto (ver 09-CI.md). El build CI ejercita exactamente el árbol modificado (postcss/nanoid 3.3.18 en Turbopack/Tailwind).

## Smoke funcional relevante al cambio (mandato §12 — no se repite toda F1)

El cambio toca el árbol de build vía postcss (parents de nanoid: postcss 8.5.25 y next/postcss 8.5.23 → Tailwind/Turbopack/vite). Smoke ejecutado con el stack pm2 reconstruido sobre el árbol nuevo:

| Prueba | Resultado |
|---|---|
| Startup (pm2 restart all: costpro + telegram-cron + whatsapp-cron) | 3 apps **online**, 0 reinicios |
| Landing `http://localhost:3000/` | **HTTP 200** |
| Asset CSS de Tailwind/postcss (`/_next/static/chunks/…css`) | **HTTP 200** (667.065 bytes servidos) |
| Ruta API segura: `GET /api/stores` sin auth | **HTTP 401** (guard de autenticación intacto) |
| Suite vitest completa (Gate A) — ejercita vite/postcss/nanoid 3.3.18 | 2278/0/24 PASS |
| Flujos CSV/YAML/optimizer sharp | NO repetidos (F2 no toca csv-parse/js-yaml/sharp — cambio sin relación; estado F1 intacto) |

- Supabase real: solo el guard 401 sin credenciales (igual que F1); **cero mutaciones** (ver 11-ZERO-TOUCH.md).
