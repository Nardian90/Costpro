# FASE F1 — 08 TESTS (Gates A–D)

**Fecha**: 2026-09-27 · Orden del mandato: A unit → B typecheck → C lint → D build. Logs crudos: `scripts/gateA-unit.log`, `gateB-typecheck.log`, `gateC-lint.log`, `gateD-build.log`, `gateD-build-4096.log` (fuera del repo).

## Gate A — Unit (suite completa, `CI=true bun run test`)

```text
exit=0
Test Files  110 passed | 1 skipped (111)
     Tests  2278 passed | 24 skipped (2302)
   Duration  218.51s
```

- **0 fallos.** Baseline F0/E-SEC-FINAL = 2278 passed / 0 failed / 24 skipped → **coincidencia exacta 1:1: cero regresiones y cero tests nuevos rotos.**
- Incluye smoke E-SEC: `supervisor-token.test.ts (7)` + `effective-unit-price.test.ts (15)` = 22/22 ✓.

## Gate B — Typecheck (`bunx tsc --noEmit`)

```text
exit=0 · 0 líneas de salida → 0 errors
```

## Gate C — Lint (`bun run lint`)

```text
exit=0
✖ 1294 problems (0 errors, 1294 warnings)
```

- **0 errores.** Los 1294 warnings son la clase preexistente "V2.12.25 <button> crudo — refactor incremental recomendado" (mismo stock documentado en fases previas).
- F1 no modificó NINGÚN archivo fuente (.ts/.tsx/.js) → **0 warnings nuevos por construcción** (ESLint no lintea package.json/lockfiles).

## Gate D — Build (`bun run build`) — R-INFRA-1 reproducido y documentado, NO silenciado

### Intento 1 — sin ajustes (fidelidad total)

```text
comando:   bun run build  (next build, Next.js 16.3.3 + Turbopack)
exit code: 137 (SIGKILL — OOM killer del kernel)
punto:     "Creating an optimized production build ..." (fase de compilación)
memoria:   free -m → total 4041 MB, swap 0
dmesg:     oom-kill:constraint=CONSTRAINT_NONE … global_oom, task=next-build (v16)
           Out of memory: Killed process 10456 (next-build (v16)) total-vm:41859136kB, anon-rss:3268880kB
```

### Intento 2 — con el flag OFICIAL ya existente de CI (NO workaround silencioso)

`NODE_OPTIONS="--max-old-space-size=4096"` es la configuración que `ci.yml` (job quality, línea 56; job e2e, línea 97) **ya tenía antes de F1** — se replicó por paridad, y se documenta explícitamente:

```text
comando:   NODE_OPTIONS="--max-old-space-size=4096" bun run build
exit code: 137 (SIGKILL — global OOM del host, techo físico 4041 MB / 0 swap)
punto:     ✓ Compiled successfully in 75s → ✓ runAfterProductionCompile → "Running TypeScript ..." → killed
```

### Determinación: ¿idéntico al baseline?

**SÍ — R-INFRA-1 preexistente, no regresión de F1:**
1. R-INFRA-1 fue documentado por F0 en el baseline (next 16.3.0) con esta misma firma (OOM local en `next build`).
2. El propio `ci.yml` del repo llevaba `NODE_OPTIONS=4096` **antes** de F1 — prueba de que el build baseline ya requería memoria extra.
3. Con next 16.3.3 el build local llegó MÁS LEJOS que nunca (compilación completa en 75 s) y murió en fase TypeScript por techo físico (3.27 GB RSS anon sobre 4.04 GB totales, sin swap) — **cero errores de compilación o de tipos atribuibles a F1**.
4. Per mandato §10: **"La validación CI será autoridad si el build local no puede completarse por el límite conocido"** → el gate D queda validado por el job Build de CI (ver 09-CI.md). No se cambió ninguna configuración de memoria del repo.
