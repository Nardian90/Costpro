# DARK PERFORMANCE MONOCHROME — 00 Baseline

Fecha: 2026-09-29 (UTC-5)
Workspace: /home/z/my-project/Costpro

## Estado de origen

| Ítem | Valor |
|---|---|
| Rama base | `origin/main` @ `5ac500a4` (Merge PR #1337 ← audit/f6-transversal-ux-qa) |
| F6 | CERTIFIED (`a9ae5b01` en main vía PR #1337) |
| F1–F5 | CERTIFIED (ancestry verificado en F6) |
| Working tree al inicio | limpio |
| Servidor | pm2: costpro + 2 cron-pollers, modo development, HTTP 200 |

## Verificaciones previas (sin modificar archivos)

1. `git status` → limpio; rama `audit/f6-transversal-ux-qa` en `a9ae5b01`.
2. `git fetch` → `origin/main` avanzó a `5ac500a4` (F6 mergeado).
3. `git merge-base --is-ancestor a9ae5b01 origin/main` → YES.
4. Localización F5: `mode-performance` aplicada por `IntelligentThemeHandler.tsx`
   (`.mode-performance` / `.mode-enhanced` en `<html>`, persistida en
   `localStorage['costpro-mode']` + `costpro-mode-manual-override`).
5. `perf-hide-decor` / `perf-hide-gradient` / `perf-hide-status-dot`: definidos en
   `modes.css` (display:none !important), usados por CyberShell/Header/avatar.
6. Sistema de tokens: `src/styles/tokens.css` (light/dark) + `@theme inline`
   en `globals.css` mapea utilidades Tailwind → vars CSS.
7. Selector reutilizable existente: `.mode-performance` en `<html>` (reutilizado,
   NO se inventó ningún mecanismo nuevo).

## Decisión de alcance

- Cambio 100 % centralizado en `src/styles/modes.css` (capa de tokens + barrido).
- Cero modificaciones en componentes, lógica, APIs, Supabase, CI o tests.
- Semántica preservada: `--success/--warning/--danger/--destructive` intactos.
