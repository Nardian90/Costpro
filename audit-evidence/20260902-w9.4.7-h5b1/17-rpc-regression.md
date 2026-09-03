# W9.4.7 — H5-B1 · FASES 21–22 — RPC regression y negative security tests

Fecha: 2026-09-03 · Raw: `probes-f21-f22-raw.json` (post) · `probes-f11-f12-raw.json` (pre)

## FASE 21 — Regresión de la ruta productiva

### Cadena productiva validada

1. `POST /api/reverse` local sin sesión → **401** (`withAuth` activo, ruta viva). No es posible persistir una reversión real sin JWT de usuario; se valida el dispatch por la vía determinística: tabla estática `RPC_MAP_V2` + flag ON + discriminador de error en vivo (abajo).
2. service_role → `rpc/reverse_transaction_v2` con UUID inexistente → **HTTP 400 `P0001 ERR_TRANSACTION_NOT_FOUND`** = respuesta de negocio esperada de V2 (pre-DROP idéntica, FASE 11). **La API resuelve a V2.**
3. service_role → `rpc/reverse_transaction` (V1) → **HTTP 404 `PGRST202` "Could not find the function public.reverse_transaction(p_reason, p_transaction_id, p_user_id) in the schema cache"** + hint de PostgREST: *"Perhaps you meant to call the function public.reverse_transaction_v2"*. **Ningún caller puede alcanzar V1.**

Conclusión: `API → service_role → reverse_transaction_v2 → respuesta de negocio esperada`; NO existe ruta a V1 (ni intento posible: la función ya no está en el schema cache). Sin fallback silencioso (R1 neutralizó el único entry; verificado por grep — FASE 15 C).
