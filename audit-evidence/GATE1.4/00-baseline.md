# GATE 1.4 — 00 BASELINE (estado real, no el declarado)

Fecha: 2026-09-21T11:15Z · Método: git + código + runtime + navegador real (agent-browser)

## Comandos ejecutados

```text
git status --short        → (vacío — 0 cambios)
git rev-parse HEAD        → 86d99d54b07bfd6ae2d7448b337b39af49b26d97
git rev-parse origin/main → 86d99d54b07bfd6ae2d7448b337b39af49b26d97
git log -5 --oneline      →
  86d99d54 (HEAD -> main, origin/main, origin/HEAD) fix: finalize sales navigation and runtime cache
  f614ba75  fix(gate1.3R): certification review — 2 defects blocked GATE 1.3 PASS
  1b894fa1  feat(navigation): GATE 1.3 — Vender (acción, 1 click) + Ventas (hub admin)
  b9b74172  fix(audit): GATE 1.2 — null-safe render in AuditRow
  67fd8ab3  fix(navigation): GATE 1.1 — ViewId contract enforcement
```

## Registro

| Campo | Valor |
|---|---|
| BASELINE_HEAD | `86d99d54b07bfd6ae2d7448b337b39af49b26d97` |
| BASELINE_ORIGIN | `86d99d54b07bfd6ae2d7448b337b39af49b26d97` (== HEAD) |
| WORKTREE_STATUS | CLEAN (0 archivos modificados al inicio; durante el gate solo se añade `audit-evidence/GATE1.4/`) |
| TIMESTAMP | 2026-09-21T11:15:04Z |
| Existencia de `86d99d54` | SÍ — commit en main y origin/main. Contiene: ServiceWorkerRegister.tsx, SalesHubView.tsx, view-tips.ts, modes.css, next.config.ts, evidencias GATE1.3R (42 archivos, +1883/-69) |
| Cambios posteriores | NINGUNO — es el HEAD actual |

## Runtime

- PM2: 3 procesos online (`costpro` bun server.ts, `telegram-cron-poller`, `whatsapp-cron-poller`), uptime estable.
- `GET /` → 200. Login real en navegador: `admin@demo.com` (admin global, tienda activa ENERVIDA-VITALLCONS).

## Alcance aclarado por el usuario (IMPORTANTE)

`/fc/FC.html` (MVP standalone de Ficha de Costo, release canónico 12.10.0 del repo `Nardian90/fichascosto` con SW propio `costpro-release-12.10.0-fc.4`) **NO forma parte del objeto de esta auditoría**: es un MVP de demostración rápida, no la aplicación. La auditoría se ejecuta sobre **COSTPRO terminal** (`/?view=...` + shell de navegación). El MVP se documenta únicamente como contexto (ver 11-duplication.md §FC-MVP).

## Regla de oro cumplida

Cero modificaciones de código de producción durante todo el gate. Único artefacto creado: `audit-evidence/GATE1.4/` (+ scripts temporales en `/home/z/my-project/scripts/`, FUERA del repo).
