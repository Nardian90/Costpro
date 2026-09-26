# FASE E-SEC — 07 SERVER VALIDATION (E4) + DATOS (E3) + AUDITORÍA (E6)

## Fecha / HEAD
2026-09-26 · fix aplicado en migración `supabase/migrations/20260926000001_esec_price_integrity.sql`
y verificada LIVE (nuevo sha256 de pg_get_functiondef: 59c90bf72becc5e9…; 4 marcas
E-SEC presentes: ERR_INVALID_PRICE, v_item_discount_pct, gate >=15 combinado, metadata).

## ROOT CAUSE (cierre de la cadena D0→fix)
```text
RC-ESEC-1 (seguridad): create_sale_v2 parseaba price_at_sale del JSONB del cliente y
  lo usaba como ÚNICA base de todos los totales; el gate de supervisor evaluaba solo
  el descuento global (p_discount_value), y ERR_TOTAL_MISMATCH recalculaba con el
  MISMO precio del cliente (auto-referencial). EXECUTE a PUBLIC hacía eludible el
  route. → el precio de venta no demostraba ser una modificación comercial válida,
  autorizada y auditable.
RC-ESEC-2 (funcional): la UI enviaba price crudo + total descontado → 422 en toda
  venta con descuento por ítem (capacidad comercial legítima ROTA).
RC-ES2 (funcional): el checkout del catálogo no enviaba Authorization → 401 universal.
```

## Corrección server-side (mínima, sin cambiar el modelo de datos)
Transformación verificada de la definición LIVE (script `esec-gen-migration.py`, 6 anclas):
1. **ERR_INVALID_PRICE** (1ª pasada): rechaza `NULL`, NaN (auto-desigualdad), ±Infinity
   (comparación explícita; numeric los acepta como literales) y negativos. El cero NO se
   rechaza: es desvío del 100% y cae al gate de supervisor (política, no prohibición).
2. **Precio de referencia server-side**: `product_variants.price` si el ítem es variante
   (el precio por modalidad es legítimo y NO computa desvío); si no, `products.price`
   (leído en la MISMA pasada bajo `FOR UPDATE`). Sin referencia (NULL/0) no hay desvío.
3. **Desvío comercial por ítem**: `v_item_discount_total = Σ max(0, ref−price)×qty`;
   `v_item_discount_pct = desvío / Σ ref×qty × 100` (AGREGADO — misma semántica que el
   descuento global existente).
4. **Gate extendido**: `IF v_effective_discount_pct >= 15 OR v_item_discount_pct >= 15`
   → el MISMO bloque de supervisor RC-1 (identidad verificable server-side, roles
   admin/manager de la tienda). Mensaje del RAISE ahora reporta `global_pct` e `item_pct`.
5. **Auditoría (E6)**: `audit_logs.metadata` (jsonb EXISTENTE) ampliado con
   `catalog_subtotal`, `item_discount_total`, `item_discount_pct` — sin columnas nuevas,
   sin sistema paralelo.
6. Compatibilidad: sin price en el payload → fallback al catálogo (desvío 0) — B10 = 200.

## Route (`/api/pos/checkout`)
- Zod: `price: z.number().min(0).finite()` (Infinity pasa `min(0)` pero no `finite()`).
- Nuevo mapping de error del RPC: `ERR_INVALID_PRICE` → **400 "Precio inválido"**.

## Principio server-side resultante (E4)
```text
browser → solicita precio final → servidor resuelve producto real, tienda real,
precio vigente (bajo lock), usuario real (JWT), rol real (membership), reglas
comerciales (umbral 15%) y autorización (token firmado) → valida → venta.
Nada del payload se acepta por fe: role/user_id/authorization/precio derivan del server.
```

## E3 — modelo de datos
La información de auditoría se obtiene REUTILIZANDO la estructura existente:
`transaction_items.price_at_sale` (precio final) + `audit_logs.metadata` (desvío y
subtotales de catálogo al momento de la venta) + `supervisor_id` ya registrado por RC-1.
**No se agregaron columnas ni migraciones de esquema** (solo CREATE OR REPLACE FUNCTION).
DECISIÓN DE NEGOCIO PENDIENTE: si el propietario quiere reconstruir
`catalog_price_at_sale` por línea sin depender del audit log, sería una migración de
columna (proposta explícitamente fuera del mínimo de esta fase).
