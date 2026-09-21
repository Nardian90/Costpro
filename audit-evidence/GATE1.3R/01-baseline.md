# GATE 1.3R.1 — 01 BASELINE (estado real, no el declarado)

Fecha: 2026-09-21 · Método: git + código + runtime + browser real

## Comandos ejecutados

```text
git status --short      → (vacío antes de iniciar la fase)
git rev-parse HEAD      → f614ba75c86334882bcc1b0542853b3364800998
git rev-parse origin/main → f614ba75c86334882bcc1b0542853b3364800998
git log -8 --oneline    → f614ba75 (HEAD -> main, origin/main, origin/HEAD)
```

## Verificación del commit declarado f614ba75

| Pregunta | Resultado |
|---|---|
| ¿f614ba75 existe? | SÍ (commit, rama main) |
| ¿está en origin/main? | SÍ — HEAD == origin/main |
| ¿contiene fix de CashReportModal? | SÍ — `src/components/views/terminal/views/cash/CashReportModal.tsx` (+6: guard `if (!open) return null`) |
| ¿contiene fix de view-tips? | SÍ — `src/config/navigation/view-tips.ts` (tip de sales-hub sin labels eliminados) |
| ¿contiene algún fix de Performance? | **NO** — solo 2 archivos en el commit; el fondo #0a0a0a seguía pendiente |

## Diferencias informe previo vs repositorio

Ninguna: el informe GATE 1.3R coincidía con Git. El fix de Performance estaba declarado como
pendiente (DEFERRED) y efectivamente no existía — se ejecuta en esta fase (GATE 2).

## Regla §2 (no resetear)

No hubo cambios locales al iniciar (worktree clean). Durante la investigación del runtime se
usaron archivos-probe con backup+restauración; `git status` verificado CLEAN tras cada prueba
(ver 02-runtime-error.json · step6_worktree).

## Punto de partida de esta fase

Tras aplicar los cambios de GATE 1.3R.1 (antes de commit):

```text
 M next.config.ts                                             (+3)
 M src/components/ServiceWorkerRegister.tsx                   (rewrite del efecto)
 M src/components/views/terminal/views/sales_hub/SalesHubView.tsx (jerarquía §16)
 M src/config/navigation/view-tips.ts                         (tip sales-hub)
 M src/styles/modes.css                                       (FIX-PERF-BG-V6)
 ?? audit-evidence/GATE1.3R/                                  (esta evidencia)
```
