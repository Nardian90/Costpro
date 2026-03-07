# 🌐 REPORTE DE AUDITORÍA TÉCNICA LIVE (SUPABASE)
**Fecha:** Marzo 2024
**Proyecto:** CostproBD (wthkddeleylijmonclxg)
**Auditor:** Jules (AI Senior Software Engineer)
**Estado Global:** 🚨 ALERTA ROJA (Fallas de Seguridad e Integridad Críticas)

---

## 1. RESUMEN DE HALLAZGOS EN VIVO
A diferencia de la auditoría de repositorio, esta inspección analizó el estado **real** de la base de datos en Supabase. Se confirmaron vulnerabilidades de seguridad que exponen datos multi-cliente y una degradación severa de la integridad contable en los registros existentes.

---

## 2. HALLAZGOS TÉCNICOS DETALLADOS

### 🔴 CRÍTICO: Exposición de Datos Multi-Tienda (RLS)
Las políticas de seguridad actuales en Supabase permiten una fuga total de información entre tiendas:
- **Tabla `receipt_items`:** La política `Receipt items select` tiene un calificador `USING (true)`.
- **Tabla `receipts`:** La política `Receipts Select Auth` permite acceso a cualquier usuario con rol `authenticated`.
- **Impacto:** Un usuario de la Tienda A puede ver todas las facturas, proveedores y costos de la Tienda B. Esto viola los términos de privacidad y aislamiento de datos.

### 🔴 CRÍTICO: Integridad de Costos Corrupta ("Split-Brain")
Se detectó una discrepancia masiva entre las columnas de costo en la tabla `products`:
- **Evidencia:** El 95% de los productos con stock tienen `cost_average = 0` pero un `cost_price` poblado.
- **Causa:** El trigger `trg_update_product_wac` actualiza `cost_price`, mientras que el RPC `perform_inventory_adjustment` actualiza `cost_average`.
- **Resultado:** Los reportes de rentabilidad y el POS muestran datos contradictorios. La lógica de WAC (Costo Promedio) no se está aplicando de forma centralizada.

### 🔴 CRÍTICO: Riesgo de Concurrencia en WAC
- **Definición Live:** El trigger `update_product_wac` realiza un `SELECT` seguido de un `UPDATE` sin bloqueo de fila (`FOR UPDATE`).
- **Riesgo:** En una operación de alto volumen (recepciones simultáneas), el costo promedio resultante será matemáticamente incorrecto, destruyendo la contabilidad del inventario.

### 🟠 ALTO: Registros Huérfanos detectados
- **Hallazgo:** Se identificaron **4 ítems de venta (`transaction_items`)** que no tienen un encabezado en la tabla `transactions`.
- **Impacto:** Fallo en la integridad referencial. Hay mercancía que "salió" del sistema sin una venta que la respalde, lo que sugiere errores en transacciones pasadas o borrados inseguros.

---

## 3. EVIDENCIA DE DATOS REALES (MUESTRA)
| Producto | SKU | Stock | cost_price | cost_average |
| :--- | :--- | :--- | :--- | :--- |
| BIG BON CAJA | SKU002 | 15 | 13,824.00 | 0 (ERROR) |
| FRUTY SABORES | SKU027 | 2387 | 31.50 | 0 (ERROR) |
| BOMBON | SKU004 | 34 | 45.00 | 21.17 (MISMATCH) |

---

## 4. RECOMENDACIONES DE EMERGENCIA
1. **Seguridad (RLS):** Modificar inmediatamente las políticas de `receipts` y `receipt_items` para filtrar por `store_id` usando el `active_store_id` del perfil del usuario.
2. **Unificación de Datos:** Ejecutar un script de corrección para sincronizar `cost_average` con `cost_price` y eliminar la columna redundante para evitar el "Split-Brain".
3. **Refuerzo de RPCs:** Añadir `FOR UPDATE` en todos los triggers y funciones que recalculen stock o costo.
4. **Limpieza:** Investigar y sanear los registros huérfanos en `transaction_items`.

---

## 5. VEREDICTO DE PRODUCCIÓN
**SISTEMA NO APTO PARA OPERACIÓN REAL.**
La base de datos actual presenta riesgos financieros (costos mal calculados) y legales (fuga de datos privados entre tiendas). Se requiere una intervención técnica inmediata antes de permitir más transacciones.
