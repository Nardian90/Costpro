# W9.5 — B-10b-OBS-1 · 15-regression.md
# GATE 18 — Regresión completa (2026-09-05, entorno local + PM2)

| Verificación | Comando | Resultado |
|---|---|---|
| Suite completa | `bun run test` | **1989 passed / 0 failed** (24 skipped pre-existentes; 93 files passed, 1 skipped) — incluye los 22 tests nuevos de iteration-16-b10b-obs1 |
| Lint | `bun run lint` | **0 errors** (1291 warnings, baseline pre-existente) |
| Tipos | `bunx tsc --noEmit` | **exit 0** |
| Build | `NODE_OPTIONS=--max-old-space-size=2560 bun run build` | **exit 0** |
| Secuencia PM2 durante build | `pm2 stop costpro` → build → `pm2 start costpro` | Documentada: **PM2 stopped → build → PM2 restored → health verified** (por OOM del host, igual que en B-10b) |
| PM2 post | `pm2 list` | **3/3 online**: costpro, telegram-cron-poller, whatsapp-cron-poller |
| HTTP / | `curl localhost:3000/` | **200** |
| HTTP /api/health | `curl localhost:3000/api/health` | **200** `{"status":"ok","service":"costpro-enterprise",…}` |

Notas:
- La suite creció de 1967 (B-10b) a 1989: +22 tests del paquete OBS-1.
- No se ejecutó DDL ni mutación de datos en toda la fase; la regresión cubre
  el test permanente nuevo y el estado intacto del resto del sistema.
