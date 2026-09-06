# W9.5 — B-10b-OBS-2-R2 · 01-baseline.md
# GATE 0 — BASELINE · PASS

Fecha de ejecución: 2026-09-06 (UTC). Sandbox re-verificado tras posible reinicio.

## Git

```text
HEAD        = 904502733f16b99c64b12f2120668fb610d406c8
origin/main = 904502733f16b99c64b12f2120668fb610d406c8
HEAD == origin/main == 90450273  →  PASS
worktree: clean ("nothing to commit, working tree clean")
```

`90450273` = commit R1 «audit(w9): execute orphan inventory reconciliation» (REPAIR EXECUTED — VERIFIED).

## Servicios

```text
PM2: costpro (online) · telegram-cron-poller (online) · whatsapp-cron-poller (online)  →  3/3
HTTP GET http://localhost:3000/  →  200
```

## Infraestructura de evidencia reutilizada

- SQL runner: `audit-evidence/20260905-w9-b10b/scripts/b10b_query.js` (Supabase Management API; ref `wthkddeleylijmonclxg`; HTTP 201 esperado).
- `SUPABASE_ACCESS_TOKEN` cargado desde `.env` a variables de sesión (nunca hardcodeado ni escrito en el pack).
- Actor de referencia: `051c6157-600b-425e-b8c0-72388bacf541` (admin@costpro.com).
- Tienda bajo prueba: `d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576` — TIENDA CENTRAL COSTPRO.
- Repair batch congelado: `B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW`.

## Veredicto GATE 0

```text
PASS — proceder a GATE 1
```
