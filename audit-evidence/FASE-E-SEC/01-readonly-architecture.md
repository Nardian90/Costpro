# FASE E-SEC — 01 READ-ONLY ARCHITECTURE (GATE E0)

## Fecha / HEAD
2026-09-26 · baseline 6ac52feb (pre-fix). Acceso DB: solo SELECT vía Management API
(`POST /v1/projects/{ref}/database/query`, token de acceso Supabase — jamás impreso).

## Comando
`scripts/esec-e0-readonly.py` (SELECTs a pg_proc, information_schema, role_routine_grants).

## Resultado

### Función LIVE
```text
create_sale_v2: 1 variante LIVE.
sha256(def LIVE)     = b1697b3b039caf86d79285b326a17aad3727f29b0282157ce7f9c40e477c7d14
migración 20260915000001 (REM-INV-4A-R RC-1/RC-2): IDÉNTICA normalizada
(única diferencia: ';' final) → DRIFT LIVE-vs-repo = 0.
```

### Validaciones de precio detectadas en el fuente LIVE
```text
ERR_INVALID_PRICE presente ................. FALSE
Rechazo de precio negativo ................. FALSE
Rechazo de no-finitos (NaN/Infinity) ....... FALSE
Gate de desvío item-vs-catálogo ............ FALSE
ERR_SUPERVISOR_REQUIRED (desc. GLOBAL) ..... TRUE  (umbral >=15)
ERR_TOTAL_MISMATCH ......................... TRUE  (auto-referencial)
ERR_INSUFFICIENT_STOCK ..................... TRUE
```

### Superficie de ejecución
```text
EXECUTE create_sale_v2 → PUBLIC, authenticated, postgres, service_role
  ⇒ cualquier usuario autenticado puede llamar el RPC DIRECTAMENTE por PostgREST,
    saltándose la validación Zod del route /api/pos/checkout.
```

### Modelo de datos (columnas de precio, LIVE)
```text
transaction_items: price_at_sale, price_at_sale_cup, price_currency, cost_at_sale,
  discount_type, discount_value, cash/transfer/zelle_discount_{type,value,currency}
transactions: subtotal, discount_type, discount_value, tax_amount, total_amount …
products: price, precio_empresa (NO participa en POS), price_currency, on_promotion …
⇒ NO existe columna snapshot de precio de catálogo en la línea de venta.
⇒ NO se agregaron columnas (E3): la auditoría reutiliza audit_logs.metadata (jsonb).
```

### Triggers relevantes
- `trg_protect_transactions_total_amount` (UPDATE de totals) — no aplica a INSERT.
- `fn_sync_inventory_on_movement` (stock_movements): exige fila `inventory`; rechaza
  salidas sin inventario (protección incidental, no de precio).
- Sin trigger que valide el precio de una línea de venta.

### RLS
```text
transactions / transaction_items / products: relrowsecurity = true
```

## Interpretación
La superficie LIVE confirma R-SEC-1 tal como la documentó FASE D: el servidor acepta
el `price_at_sale` del cliente sin ninguna comparación con un precio de referencia
propio del servidor, y el único gate (supervisor ≥15%) evalúa únicamente el descuento
GLOBAL. Además, EXECUTE a PUBLIC hace que la defensa de route sea eludible por
cualquier usuario autenticado → la corrección DEBE vivir en el RPC (principio E4).
