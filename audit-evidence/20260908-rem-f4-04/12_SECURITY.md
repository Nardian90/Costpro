# 12 — SECURITY (aislamiento multitienda, anon, RLS, guard)

## Ejecución (suite F4-04 P7)

| Prueba | Resultado |
|---|---|
| **Anon** POST recepción (sin sesión) | PASS — DENIED, HTTP **401** |
| **Anon** checkout (sin sesión) | PASS — DENIED, HTTP **401** |
| **Non-member** `register_reception` sobre STORE B (usuario sin membresía en esa tienda) | PASS — DENIED, HTTP 400 `P0001: Unauthorized store access` (RAISE del propio RPC) |

## Nota documentada sobre admin cross-store

`admin@demo.com` tiene rol global `admin` → acceso cross-store **por diseño**
(decisión D6 documentada en audits previos; NO es defecto y NO forma parte de
F4-04). El DENY estricto aplica a usuarios no-miembros sin rol global.

## Guard de escritor único (defensa en profundidad)

- `trg_guard_wac_writer BEFORE UPDATE OF cost_average ON products`
  → `w62_guard_wac_writer()` rechaza cualquier escritura de `cost_average`
  cuyo contexto no sea `fn_recalc_wac` (verificado §A5/A6 BEFORE y §B3 AFTER).
- La remediación no añadió grants EXECUTE nuevos ni cambió ACLs (§B4:
  `proacl` idéntico pre/post).
- No se creó bypass RLS: `register_reception` mantiene su verificación
  `has_store_access_as(v_caller_uid, p_store_id)` como PRIMERA sentencia del
  cuerpo (visible en §B1).

## Sin reconstrucción del mecanismo muerto

`trg_update_product_wac` sigue ausente (§B2) — la remediación no "revive"
triggers históricos ni amplía superficie de ataque.

## Veredicto

**SECURITY = PASS** — anon DENY, non-member DENY, guard intacto, ACLs
intactas, sin bypass.
