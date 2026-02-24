# 🛡️ REPORTE DE AUDITORÍA TÉCNICA v2.0: FLUJO COMERCIAL Y OPERATIVO
**Fecha:** Marzo 2024
**Equipo Auditor:** Elite QA, Backend, DB Architect, Security & IAM Specialist (Jules AI)
**Estado:** 🔴 NO APTO PARA PRODUCCIÓN (Fallas Críticas de Seguridad y Concurrencia)

---

## 1. RESUMEN EJECUTIVO
Se ha realizado una auditoría profunda del sistema "Costpro", evaluando desde la jerarquía de inquilinos hasta la integridad transaccional bajo estrés. Aunque la arquitectura utiliza tecnologías modernas (Supabase, RLS, RPCs atómicos), se han detectado **vulnerabilidades estructurales** que permiten el bypass de roles (RBAC), riesgos de corrupción de datos por concurrencia y falta de mecanismos de idempotencia esenciales para operaciones de retail real.

---

## 2. ANÁLISIS POR FASES (HALLAZGOS)

### Fase 0: Jerarquía, Roles y Permisos (RBAC) 🔴 CRÍTICO
*   **Hallazgo:** Los RPCs transaccionales (`create_sale`, `register_reception`) carecen de verificación de roles específicos en la base de datos.
*   **Evidencia Técnica:**
    - En `create_sale` (Migración 20260305), solo se valida `public.has_store_access(p_store_id)`. Un usuario con rol 'Almacenero' puede ejecutar ventas.
    - En `register_reception` (register_reception_rpc.sql), no existe validación de `has_role('warehouse')`. Un 'Cajero' puede registrar entradas de mercancía.
    - La función `has_role` tiene una lógica de "mapeo laxo" que considera al rol genérico 'usuario' como 'clerk' y 'warehouse' simultáneamente, rompiendo la segregación de funciones (SoD).

### Fase 1 & 2: Flujo Estándar y Concurrencia 🔴 CRÍTICO
*   **Hallazgo:** Riesgo de **Deadlock** y **Race Conditions** en el cálculo del Costo Promedio (WAC).
*   **Evidencia Técnica:**
    - **Orden de Bloqueo Inconsistente:**
        - `create_sale`: Bloquea `inventory` -> Dispara Trigger -> Actualiza `products`.
        - `register_reception`: Inserta `receipt_items` -> Trigger `update_product_wac` -> Actualiza `products` -> Luego llama `register_stock_movement` -> Bloquea `inventory`.
        - Si una venta y una recepción ocurren al mismo tiempo para el mismo SKU, existe una alta probabilidad de Deadlock (Abrazo Mortal).
    - **WAC Corruptible:** La función `update_product_wac` lee `stock_current` y `cost_price` de la tabla `products` sin `FOR UPDATE`. Bajo concurrencia, dos recepciones pueden calcular costos promedios basados en datos obsoletos, corrompiendo la valoración contable.

### Fase 3: Idempotencia de API 🟠 ALTO
*   **Hallazgo:** Ausencia de llaves de idempotencia en flujos críticos.
*   **Evidencia Técnica:** El RPC `create_sale` no acepta un `idempotency_key` ni un ID de transacción pre-generado por el cliente. Si un cajero sufre un timeout de red y el frontend reintenta la petición, el sistema generará una segunda venta duplicada y descontará stock dos veces.

### Fase 4: Integridad Transaccional y DB 🟠 ALTO
*   **Hallazgo:** "Split-Brain" de Stock y Latencia de Triggers.
*   **Evidencia Técnica:** El stock se mantiene duplicado en `products.stock_current` y `inventory.quantity`. Aunque los triggers lo sincronizan, esto añade una carga innecesaria de locks por transacción (bloqueando dos tablas en lugar de una). En un escenario de 1,000 transacciones concurrentes, la tabla `products` se convierte en el cuello de botella global.

### Fase 5: Inmutabilidad y Auditoría 🟢 ACEPTABLE
*   **Hallazgo:** El Kardex (`stock_movements`) es protegido correctamente contra escrituras directas del cliente vía RLS.
*   **Observación:** Se recomienda endurecer la tabla `audit_logs`, que actualmente permite INSERTs directos desde cualquier usuario autenticado, permitiendo potencialmente la inyección de logs falsos.

---

## 3. REPORTE DE HALLAZGOS (MATRIZ DE RIESGO)

| Hallazgo | Severidad | Impacto | Estado |
| :--- | :--- | :--- | :--- |
| Bypass de RBAC en RPCs | 🔴 Crítico | Un Cajero puede alterar el costo de entrada | Pendiente |
| Deadlock Venta vs Recepción | 🔴 Crítico | Caída del sistema en picos de tráfico | Pendiente |
| Race Condition en WAC | 🟠 Alto | Inconsistencia financiera en inventario | Pendiente |
| Falta de Idempotencia | 🟠 Alto | Duplicidad de tickets por fallas de red | Pendiente |
| Cuello de botella en tabla Products | 🟡 Medio | Degradación de performance bajo carga | Pendiente |

---

## 4. RECOMENDACIONES DE MEJORA (ROADMAP)

1.  **Seguridad:** Implementar `IF NOT public.has_role('clerk') THEN RAISE EXCEPTION; END IF;` dentro de los RPCs.
2.  **Concurrencia:** Estandarizar el orden de bloqueo. Todas las funciones deben bloquear `products` ANTES que `inventory` (o viceversa), nunca de forma alterna.
3.  **WAC:** Añadir `FOR UPDATE` a la lectura de costos en `update_product_wac`.
4.  **Idempotencia:** Modificar `create_sale` para que acepte un `p_transaction_id` UUID generado por el cliente y usarlo como llave primaria.
5.  **Arquitectura:** Eliminar `products.stock_current` y centralizar toda la lógica de stock en la tabla `inventory`.

---

## 5. EVALUACIÓN FINAL

### **PUNTUACIÓN: 4.5 / 10**

**Veredicto:** El sistema tiene una interfaz y una lógica de negocio avanzada, pero **falla en las garantías fundamentales de una aplicación enterprise**. La facilidad con la que un usuario puede saltar roles y el riesgo de corrupción de datos por concurrencia impiden una calificación superior. No se recomienda el paso a producción sin antes aplicar las remediaciones de Fase 0, 1 y 2.

---
**Firmado:**
*Equipo de Auditoría Elite - Jules AI*
