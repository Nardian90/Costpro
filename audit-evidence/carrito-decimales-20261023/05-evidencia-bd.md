# Evidencia BD — Misión Carrito Decimales (2026-10-23)

Entorno: Supabase demo (wthkddeleylijmonclxg) · Tienda: ENERVIDA-VITALLCONS
Producto: SKU 157 «Royal Cole» (unit_of_measure: "unidad") · Precio: $2,500.00 CUP
Venta de prueba: 1.5 × $2,500 = $3,750.00 CUP (efectivo $4,000, vuelto $250)

## 1. transaction_items (registro de la operación)
- id: d113b9ba-f9f5-46d6-a274-5bcc732eaacd
- transaction_id: 8951bc3e-ef17-4bf9-a509-666bc1317045
- **quantity: 1.5** (NUMERIC — precisión completa, sin truncamiento)
- price_at_sale: 2500.0 · cash_paid: **3750** (1.5 × 2500 ✓)
- created_at: 2026-10-22T20:20:04.003451+00:00

## 2. stock_movements (integridad de inventario)
| movimiento | quantity_change | hora |
|---|---|---|
| sale | **-1.5000** | 20:20:04 |
| sale_void (Deshacer 30s) | **+1.5000** | 20:20:18 |

→ La anulación restauró EXACTAMENTE la fracción vendida.

## 3. products.stock_current tras anular
- Royal Cole (SKU 157): **71.0000** (idéntico al pre-test: 71) ✓

## 4. Estado de la transacción
Anulada por la propia UI (Deshacer) — registro conservado como auditoría,
sin reescritura de datos históricos.

## Flujo verificado end-to-end
input decimal (1.5) → carrito (zustand) → POST /api/pos/checkout (zod 4dp)
→ RPC create_sale_v2 (NUMERIC) → transaction_items.quantity=1.5
→ stock_movements −1.5 → void_transaction +1.5 → stock restaurado 71.
