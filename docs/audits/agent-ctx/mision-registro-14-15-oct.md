# MISIÓN OPERATIVA — REGISTRO DE MOVIMIENTOS 14–15/10/2026 + CONCILIACIÓN DE EXISTENCIAS

> **Estado:** EN EJECUCIÓN · **Rama:** `ops/registro-movimientos-2026-10-14-15`
> **Informe final obligatorio:** `docs/audits/REGISTRO_MOVIMIENTOS_2026-10-14_15_CONCILIACION_EXISTENCIAS.md` (se commit-ea al completar la misión)
> **Este documento es el plan operativo de trabajo, no el informe de resultados.**

## 1. Contexto y objetivo

Registrar en COSTPRO 4 Multitienda las **31 operaciones** del 14 y 15/10/2026
(11 ventas, 6 vales de salida, 14 entradas) mediante los **flujos oficiales de
negocio**, conciliar el stock resultante contra la tabla de existencia final
suministrada (178 SKUs incluidos 999 y 998) y documentar todo en el informe
final. **No se autoriza ajustar inventario para que cuadre.**

## 2. Parámetros fijos verificados

| Parámetro | Valor | Verificación |
|---|---|---|
| Tienda destino | **ENERVIDA-VITALLCONS** | UUID `5e6fe821-5465-48b1-b3f1-3aa3182edc38`, `is_active=true` (REST stores) |
| Operador | `admin@costpro.com` | id `051c6157-600b-425e-b8c0-72388bacf541`, rol `admin`, membresía `active` en la tienda, `profiles.active_store_id` = tienda destino |
| Autenticación | Supabase `signInWithPassword` | Contraseña restablecida por Admin API (equivalente al flujo nativo "Cambiar contraseña" del módulo Usuarios); sin `ENABLE_DEV_BYPASS` |
| Fechas económicas | 14/10 y 15/10/2026 | Dentro de la ventana `validate_operation_date` [hoy−6 meses, hoy+1 día], TZ `America/Havana` |

## 3. Flujos oficiales a utilizar (mapa de arquitectura)

| Tipo | Endpoint / RPC | Tablas escritas | Notas |
|---|---|---|---|
| **Venta** | `POST /api/pos/checkout` → `create_sale_v2` | `transactions`, `transaction_items`, `payment_transactions`, `stock_movements`, kardex, `idempotency_registry` | `operation_date` para fecha económica; descuenta stock con `ERR_INSUFFICIENT_STOCK` si no alcanza |
| **Vale de salida** | `POST /api/vale-salida` → `create_vale_salida` | `issue_slips` (nace `completed`), `stock_movements`, kardex | `notes` obligatorio (≤2000) — preserva `Belki`, `Tienda Pueblo`, `OT/Ferro`, `Cementerio/Belki` |
| **Entrada** | `register_reception` (RPC oficial de recepción) | `receipts` (`status='active'`), `receipt_items`, `stock_movements`, kardex, WAC | `p_supplier` y `p_invoice_number` obligatorios; cantidades decimales permitidas (1.20) |

Reglas innegociables: idempotencia por operación (claves únicas), verificación
anti-duplicado previa a cada escritura, comprobación de pertenencia de SKU a la
tienda, sin escritura directa a tablas de negocio, sin desactivar RLS/triggers.

## 4. Controles de riesgo especiales (del prompt de la misión)

- **SKU 139**: venta 1 + VS 8 el 14/10 — verificar saldo inicial y regla stock negativo.
- **SKU 141**: VS 1 y VS 2 el 14/10 + venta 1 el 15/10 (objetivo final 20).
- **SKU 15**: venta 1 + VS 3 el 14/10 + VS 6 el 15/10 (objetivo final 39).
- **SKU 17**: entrada 54 + venta 6 el 14/10, objetivo final 54 — el saldo inicial
  y la conversión a metros son decisivos (analizar unidad de medida/factor de
  conversión antes de dar entrada).
- **SKU 175**: entrada decimal 1.20 — no redondear.
- **SKU 11 y 63**: objetivo final 0 tras venta de 6 y 1 — verificar saldo previo.
- **SKU 142**: ventas 3 (14/10) y 2 (15/10), objetivo final 21.
- **Comisión**: valores `-` = ausencia de importe informado; no inventar comisiones.
  La venta n.º 1 (SKU 139) tiene importe USD 210 sin desglose efectivo/transferencia:
  verificar representación del sistema antes de registrar; si exige datos no
  deducibles, detener esa operación y documentar la incidencia.

## 5. Fases de ejecución

1. **FASE 1 — Auditoría previa y línea base** (read-only): catálogo por SKU en la
   tienda, stock actual, movimientos existentes del 14–15/10 (anti-duplicado),
   reconstrucción de saldos iniciales desde `stock_movements`/kardex.
2. **FASE 2 — Registro de operaciones** por flujos oficiales, en orden 1→31,
   con verificación inmediata de persistencia y efectos por operación.
3. **FASE 3 — Validación de integridad**: Kardex, ausencia de duplicados,
   aislamiento multitienda, conciliación independiente stock vs movimientos.
4. **FASE 4 — Conciliación completa** contra la tabla de existencia final
   (Diferencia = real − esperada; separar diferencias de la misión vs preexistentes).
5. **FASE 5 — Informe final** en la ruta obligatoria + commit en esta rama.

## 6. Registro de avance

- [x] Entorno: repo clonado (main b3ae40261), pm2 `costpro` online, `.env` con DATABASE_URL SQLite + Supabase real.
- [x] Tienda y operador verificados; login real OK.
- [ ] FASE 1 línea base.
- [ ] FASE 2 registro 31 operaciones.
- [ ] FASE 3 validación de integridad.
- [ ] FASE 4 conciliación.
- [ ] FASE 5 informe final.
