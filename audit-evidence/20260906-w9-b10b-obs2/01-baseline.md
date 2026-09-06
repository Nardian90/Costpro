# W9.5 — B-10b-OBS-2 · 01-baseline.md
# Verificación de baseline (GATE 0)

Fecha: 2026-09-06 · Fase: READ ONLY hasta veredicto

## Estado git verificado

```text
git status --short        → (vacío) worktree clean
git rev-parse HEAD        → 48f24c73c7b9190daf8c5037608925c90b4abc6c
git rev-parse origin/main → 48f24c73c7b9190daf8c5037608925c90b4abc6c
git log -1 --oneline      → 48f24c73 fix(w9): repair historical reverse_devolution inventory drift
```

Resultado: **HEAD == origin/main == 48f24c73 ✓** — coincide EXACTAMENTE con el baseline
declarado en el mandato (el spec de OBS-2 ya referencía el SHA post-OBS-1, sin
discrepancia que aclarar).

## Contexto de ejecución

- Sandbox reconstruido en esta sesión: PM2 reinstalado, repo re-clonado desde
  https://github.com/Nardian90/Costpro, dependencias vía `bun install` (1319 paquetes).
- Servicios PM2 3/3 online (costpro, telegram-cron-poller, whatsapp-cron-poller),
  HTTP 200 en `/` y `/api/health` — verificado antes de iniciar esta fase.
- Credenciales Supabase ROTADAS por el usuario (sb_publishable_/sb_secret_ +
  SUPABASE_ACCESS_TOKEN nuevo). Validadas en vivo por auto-publish de Telegram
  (HTTP 200, messageId 128) antes de iniciar.
- Runner SQL: `scripts/obs2_query.js` (copia de obs1_query.js de OBS-1) —
  Management API `POST /v1/projects/wthkddeleylijmonclxg/database/query`,
  token leído de env `SUPABASE_ACCESS_TOKEN`, éxito = HTTP 201.

## Regla de la fase (GATE 0 → veredicto)

```text
CERO MUTACIONES: sin UPDATE / INSERT / DELETE / ALTER / TRUNCATE / DROP,
sin reset_store_data, sin RPC de escritura. Todo el SQL emitido es SELECT.
```

## Hallazgo bajo investigación (input de OBS-1, 16-final-verdict.md)

```text
store_id = d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576
≈ 108 productos, ≈ 6.553 unidades:
  products.stock_current > 0
  inventory        → inexistente
  stock_movements  → inexistente
  transactions     → inexistente
OBS-1 lo clasificó SEPARATE_FINDING (no atribuible al reverse legacy).
Este pack debe demostrar: origen, temporalidad, naturaleza (¿stock real?),
alcance global, root cause y opción de reparación — sin mutar nada.
```
