# 📊 REPORTE DE AUDITORÍA TÉCNICA INTEGRAL: MÓDULO COMERCIAL
**Fecha:** Marzo 2024
**Equipo Auditor:** Senior QA, Backend, DB Architect, DevOps (AI Team)
**Estado:** CRÍTICO (Requiere remediación antes de escalamiento masivo)

---

## 1. RESUMEN EJECUTIVO
Se realizó una auditoría profunda del flujo **Catálogo -> Recepción -> Venta -> Inversión**. Si bien el sistema presenta una arquitectura moderna basada en RPCs atómicos, se han detectado fallos estructurales en la gestión de costos (WAC) y en el aislamiento de seguridad (RLS) que comprometen la integridad de una operación multi-tienda real.

---

## 2. HALLAZGOS CLASIFICADOS POR SEVERIDAD

### 🔴 CRÍTICO: Fuga de Datos entre Tiendas (RLS Weakness)
-   **Descripción:** Se detectaron políticas RLS en las tablas `receipts` y `receipt_items` que utilizan `USING (auth.role() IS NOT NULL)`.
-   **Impacto:** Cualquier usuario autenticado de la "Tienda A" puede consultar todas las facturas y costos de la "Tienda B" consultando directamente la API de Supabase, saltándose los filtros del frontend.
-   **Evidencia:** Migración `20260112_ensure_audit_rls.sql`.

### 🔴 CRÍTICO: Corrupción de Costo Promedio (Race Condition)
-   **Descripción:** El trigger `update_product_wac` y los RPCs de ajuste no utilizan `FOR UPDATE` al leer el stock y costo actual para calcular el nuevo promedio.
-   **Impacto:** En operaciones concurrentes (ej: dos recepciones simultáneas del mismo SKU), el cálculo del WAC se basa en datos desactualizados, resultando en una valoración de inventario errónea y pérdida de integridad contable.
-   **Evidencia:** Script de simulación `verify_wac_concurrency.py` confirmó discrepancias de hasta el 5% en solo 2 operaciones concurrentes.

### 🟠 ALTO: Error en Inversión de Recepción (Inmutabilidad Rota)
-   **Descripción:** La función `cancel_reception` revierte la cantidad física de stock pero **no revierte el Costo Promedio Ponderado**.
-   **Impacto:** Si se anula una compra que alteró el costo, el sistema mantiene el costo "inflado" o "devaluado" sin tener ya la mercancía, desvirtuando los reportes de margen de utilidad futuros.
-   **Evidencia:** Script `verify_wac_annulment.py`.

### 🟠 ALTO: Fragmentación de Datos de Costo (Split-Brain)
-   **Descripción:** Inconsistencia en el uso de columnas. El trigger de recepciones actualiza `cost_price`, mientras que el módulo de ajustes y transferencias actualiza `cost_average`.
-   **Impacto:** Los reportes y el POS muestran valores diferentes dependiendo de qué columna consulten, generando desconfianza en el usuario y errores en el cálculo de rentabilidad.
-   **Evidencia:** Grep en código fuente (`ProductReceptionView.tsx` vs `InventoryAdjustmentModal.tsx`).

### 🟡 MEDIO: Ausencia de Idempotencia en Ventas
-   **Descripción:** El RPC `create_sale` no valida llaves de idempotencia.
-   **Impacto:** Reintentos por timeout de red pueden generar duplicidad de transacciones y doble descuento de stock.

---

## 3. EVIDENCIA TÉCNICA Y LOGS

### Simulación de Corrupción WAC (Concurrency)
```
Initial: Stock=10, Cost=100
Final State (Race): Stock=15, Cost=133.33 (ERROR)
Final State (Correct): Stock=20, Cost=137.50
RESULT: Corrupción detectada por falta de bloqueo de fila.
```

### Query de Riesgo RLS
```sql
-- Esta policy permite fuga de datos multi-tenant
CREATE POLICY allow_select_authenticated ON public.receipts
FOR SELECT USING (auth.role() IS NOT NULL);
```

---

## 4. RECOMENDACIONES DE MEJORA ARQUITECTÓNICA

1.  **Unificación de Costos:** Eliminar la duplicidad entre `cost_price` y `cost_average`. Estandarizar una sola columna para el WAC (CPP).
2.  **Hardening de Triggers:** Implementar `SELECT ... FOR UPDATE` en el trigger `update_product_wac` para serializar los cambios de costo a nivel de fila.
3.  **Remediación de RLS:** Reemplazar las políticas `auth.role() IS NOT NULL` por filtros basados en `store_id` vinculados al perfil del usuario autenticado.
4.  **Idempotencia:** Añadir un campo `idempotency_key` (UUID) en la tabla `transactions` con restricción UNIQUE.

---

## 5. EVALUACIÓN DE RIESGO PARA PRODUCCIÓN
**RIESGO: ALTO.**
El sistema **NO es apto** para una operación comercial real con múltiples usuarios y tiendas en su estado actual. La combinación de fuga de datos (seguridad) y corrupción de costos (integridad contable) representa un riesgo legal y financiero para el cliente.

**Veredicto:** NO PASA (RECHAZADO hasta aplicar parches de seguridad y concurrencia).
