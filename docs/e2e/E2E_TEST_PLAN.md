# CostPro — Plan de Pruebas End-to-End
## Fecha: 2026-07-12

## Estrategia

Las pruebas se ejecutan via la **API de Next.js** (no Supabase directa), ya que:
1. La API maneja autenticación correctamente (getSupabaseAuthClient con token del usuario)
2. La API aplica validaciones Zod antes de llegar a Supabase
3. RLS requiere el token del usuario autenticado

## Parámetros de Conexión

- **API Base:** `http://127.0.0.1:3000`
- **Auth:** `admin@demo.com` / `demo123` (rol admin)
- **Store:** TIENDA CENTRAL COSTPRO (`d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576`)
- **Supabase URL:** `https://wthkddeleylijmonclxg.supabase.co`

## Fases de Prueba

### FASE 1: Setup + Catálogo (10%)
1. Login → obtener token
2. Crear 4 productos de prueba (cemento, viga, bloque, arena)
3. Editar precio de un producto
4. Verificar productos en BD

### FASE 2: Recepciones (12%)
1. Recepcionar 100 cemento via API `/api/inventory/receptions`
2. Recepcionar 20 vigas
3. Recepcionar 500 bloques
4. Verificar stock actualizado en BD
5. Registrar pago a proveedor via `/api/payments`
6. Verificar payment_status en receipts

### FASE 3: POS (15%)
1. Venta simple: 2 cemento efectivo via `/api/sales`
2. Venta mixta: 1 viga + 5 bloques transferencia
3. Verificar stock bajó después de ventas
4. Verificar transacciones en BD

### FASE 4: Servicios Recibidos (8%)
1. Crear servicio "Transporte" $5,000 via `/api/received-services`
2. Pagar servicio via `/api/payments`
3. Verificar payment_status

### FASE 5: Órdenes de Producción (12%)
1. Crear orden de servicio (🔧) con anticipo
2. Crear orden de trabajo (📦) con anticipo
3. Crear orden de producción (🏭) con items presupuestados + anticipo
4. Verificar anticipos en payment_transactions
5. Cambiar estados: draft → approved → in_progress
6. (Producción) Dar salida a materiales
7. (Producción) Cerrar con output product
8. (Servicio) Cerrar → verificar venta creada

### FASE 6: Trabajadores y Comisiones (8%)
1. Crear trabajador
2. Crear regla de comisión
3. Crear pago de comisión (draft)
4. Aprobar comisión
5. Pagar comisión con método+moneda
6. Verificar amount_cup calculado

### FASE 7: Cuentas por Pagar (5%)
1. Query receipts con payment_status
2. Query received_services con payment_status
3. Verificar due_date calculado

### FASE 8: Reporte de Caja (10%)
1. Llamar get_cash_report RPC
2. Verificar ventas por método
3. Verificar pagos a proveedores
4. Verificar comisiones
5. Verificar producción
6. Verificar balance
7. Verificar desglose de billetes

### FASE 9-12: Verificación de Schema (20%)
- Calculadora: type-check ✅ (client-side only)
- Inventario: verificar stock_movements
- Costos: verificar tablas existen
- Multi-tienda: verificar stores + memberships

## Criterios de Aceptación

| Resultado | Significado |
|---|---|
| ✅ PASS | Operación exitosa (HTTP 200/201/204) |
| ❌ FAIL | Error HTTP o dato incorrecto |
| ⚠️ WARN | Funciona pero con limitaciones |

## Readiness Calculation

```
Readiness % = (tests_pass / total_tests) * 100
```

Cada fase pondera según su % del sistema:
- Fase 1 (10%): 4 tests → 10% del total
- Fase 2 (12%): 6 tests → 12%
- Fase 3 (15%): 4 tests → 15%
- etc.
