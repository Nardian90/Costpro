# 🛡️ REPORTE DE AUDITORÍA TÉCNICA v2.0: FLUJO COMERCIAL END-TO-END
**Fecha:** Marzo 2024
**Equipo Auditor:** Elite QA, Backend, DB Architect, Security & IAM Specialist (Jules AI)
**Estado:** 🔴 CRÍTICO (Fallas Graves de Seguridad y Concurrencia)

---

## 1. RESUMEN EJECUTIVO
Se ha completado una auditoría integral del flujo jerárquico y transaccional. Si bien el sistema presenta una base sólida con RPCs atómicos y aislamiento por tienda mediante RLS, se han detectado vulnerabilidades críticas en la capa de autorización (RBAC) y race conditions en el cálculo del costo promedio (WAC) que impiden su despliegue seguro en producción.

---

## 2. HALLAZGOS CLASIFICADOS POR SEVERIDAD

### 🔴 CRÍTICO: Omisión de Roles en Capa Transaccional (RBAC Failure)
- **Descripción:** Los procedimientos almacenados críticos (`register_reception`, `perform_inventory_adjustment`, `confirm_transfer`) carecen de validación de roles.
- **Impacto:** Un usuario con rol "Cajero" (Clerk) puede ejecutar una recepción de mercancía o un ajuste manual de stock invocando directamente el RPC, saltándose las restricciones del frontend.
- **Evidencia:** Función `public.register_reception` solo verifica `auth.uid() IS NOT NULL`. No utiliza `has_role()` ni `is_admin()`.

### 🔴 CRÍTICO: Vulnerabilidad de Ajuste de Stock Sin Control (Security)
- **Descripción:** La función `perform_inventory_adjustment` es `SECURITY DEFINER` y NO verifica pertenencia a la tienda ni roles del usuario ejecutor.
- **Impacto:** Cualquier usuario autenticado puede alterar el stock y el costo de CUALQUIER producto de CUALQUIER tienda conociendo el `product_id`.
- **Evidencia:** Definición de `public.perform_inventory_adjustment` en pg_proc.

### 🔴 CRÍTICO: Race Condition en WAC de Transferencias (Data Integrity)
- **Descripción:** La función `confirm_transfer` calcula el nuevo costo promedio del almacén destino sin bloquear las filas mediante `FOR UPDATE`.
- **Impacto:** Operaciones concurrentes en la tienda destino resultarán en un cálculo de costo promedio corrupto.
- **Evidencia:** Falta de cláusula `FOR UPDATE` en el bloque de lógica WAC de la función `confirm_transfer`.

### 🟠 ALTO: Idempotencia DB Incompleta
- **Descripción:** Solo las ventas (`create_sale`) implementan una llave de idempotencia a nivel de base de datos. Las recepciones y ajustes carecen de este control.
- **Impacto:** Reintentos de red en el proceso de recepción duplicarán la entrada de mercancía y el impacto contable.
- **Evidencia:** Esquema de la tabla `receipts` y lógica de `register_reception`.

### 🟠 ALTO: Split-Brain de Stock (Architectural Risk)
- **Descripción:** El stock se almacena de forma redundante en `products.stock_current` y `inventory.quantity`.
- **Impacto:** Aunque existen triggers de sincronización, la existencia de dos fuentes de verdad aumenta la latencia y el riesgo de inconsistencia si un trigger falla o se deshabilita temporalmente.
- **Evidencia:** Triggers `tr_sync_inventory_after_movement` y `trg_sync_products_stock_current`.

---

## 3. REPORTE DE CUMPLIMIENTO (KPIs)
- **Aislamiento de Inquilinos (Tenant Isolation):** ✅ APROBADO (Vía RLS en Profiles/Stores).
- **Seguridad RBAC:** ❌ REPROBADO (RPCs vulnerables).
- **Integridad Transaccional:** ✅ APROBADO (Uso de PL/pgSQL Atómico).
- **Control de Concurrencia:** ❌ REPROBADO (Faltan locks en Transferencias).
- **Idempotencia:** ⚠️ PARCIAL (Solo en Ventas y Capa API).

---

## 4. RECOMENDACIONES DE MEJORA (REMEDIACIÓN)

1. **Endurecimiento de RPCs (Hardening):**
   - Implementar `IF NOT public.has_role('warehouse') THEN RAISE EXCEPTION 'Unauthorized'; END IF;` en `register_reception`.
   - Implementar validación de `has_store_access(p_store_id)` en todos los RPCs `SECURITY DEFINER`.

2. **Unificación de Fuentes de Verdad:**
   - Deprecar `products.stock_current` y utilizar únicamente la tabla `inventory` como fuente de verdad para el stock, dejando `products` solo para el catálogo maestro.

3. **Cierre de Race Conditions:**
   - Añadir `FOR UPDATE` a todas las lecturas de stock/costo en `confirm_transfer`.

4. **Auditoría Extendida:**
   - Modificar `log_transaction_changes` para que también capture eventos `INSERT` y no solo `UPDATE` de estados.

---

**Firma:**
Jules AI - Senior Software Engineer & Security Auditor
CostPro Project Team
