# W9.5 — B-10b-OBS-2-R2 · 03-fixtures.md
# GATE 2 — SELECCIÓN DE FIXTURES · PASS

Selección (`scripts/r2_gate2.sql` → `raw/r2_gate2.json`) sobre el universo reparado de 98 productos, con calificación del actor para el pipeline canónico.

## Fixtures seleccionados

| ID | product_id | SKU | Nombre | stock | WAC (cost_average) | price | Rol en R2 |
|---|---|---|---|---:|---:|---:|---|
| A | `e47421ea-f9aa-452b-b20b-4601ec12410f` | CAT-0001 | Abrazade metálica de 3/4 | 19 | 489,9999999999999700 | 350 | venta normal cash + zelle + void + reverse |
| B | `983e5726-a068-44b0-98b8-fef76ac481f1` | CAT-0087 | Cable Solar Negro 4mm | **95.5** | 2835 | 4.5 | venta decimal 1.5 → 94.0000 |
| B2 | `99885245-d370-46ea-99d9-176180574f77` | CAT-0088 | Cable Solar Rojo 4mm | 91.5 | 2835 | 4.5 | venta + forged-identity probe |
| C | `da1c4090-3e10-4120-a2bc-24da53cffe16` | CAT-0002 | Abrazade metálica de 1 pulgada | **966** | 11,919422583856775 | 350 | stock elevado + negative stock |
| D | `5bf782be-70c8-4870-9514-46bc2ae9db69` | CONC-1786067801 | Concurrent Recv Test | 15 | 4 | 100 | Test excluido — NO se vende (solo verificación) |

Fixture B cumple el criterio «preferentemente 95.5»; Fixture C es el producto sugerido `da1c4090` (966 unidades); Fixture D es uno de los 10 Test del set C de exclusión (`EXCLUDED_FROM_REPAIR`).

Los 4 fixtures del universo reparado presentan: inventory row (version=1), 1 movement `initial`, 1 kardex `in`, `has_movements=true`, `is_service=false`.

## Calificación del actor (pipeline canónico)

```text
profile 051c6157: role=admin · is_active=true · email=admin@costpro.com
has_store_access_as(actor, d1c4ba0e) = true   (perfil admin — alcance transversal)
can_admin_reverse_transaction(actor, store)   = true   → GATE 11 habilitado
can_pos_undo_transaction: exige seller_id == actor && created_at ≥ now()−30s
  → diseño de prueba: venta sintética con p_seller_id=actor y void inmediato in-tx
memberships del actor en d1c4ba0e: admin/REVOKED (el acceso proviene del perfil admin — estado vigente desde la fase OBS-2, documentado en R1 §4-§9)
```

## Veredicto GATE 2

```text
PASS — 4 fixtures operativos + 1 fixture Test de verificación pasiva
```
