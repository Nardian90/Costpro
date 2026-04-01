# Auditoría Técnica y Operativa — Flujo Comercial

**Fecha:** 2024-03-24
**Equipo:** Jules (Elite Audit Team)
**Estado:** Finalizado
**Puntuación Global:** 7.5/10

---

## 1. Resumen Ejecutivo
Se ha realizado una auditoría exhaustiva de los flujos comerciales (Ventas, Recepciones, Transferencias) y la jerarquía de identidad (Tenants, Stores, Roles). Si bien el sistema presenta una arquitectura sólida basada en RPCs de Supabase y RLS, se han detectado brechas críticas de seguridad y consistencia contable que requieren atención inmediata.

### Matriz de Riesgo
| Hallazgo | Severidad | Área | Impacto |
| :--- | :--- | :--- | :--- |
| Bypass de RBAC/Tenancy en `register_stock_movement` | **Crítica** | Seguridad | Acceso IDOR a inventario de cualquier tienda |
| Ausencia de actualización de Costo Promedio (WAC) en Recepciones | **Alta** | Integridad | Desviación contable masiva en valor de inventario |
| Posible rotura de RLS por dependencia de tabla eliminada | **Alta** | Disponibilidad | Fallo generalizado en acceso a datos protegidos |
| Falta de Idempotencia en Recepciones y Creación de Transferencias | **Media** | Operación | Duplicación de movimientos por reintentos de red |
| Falta de logs de auditoría en `register_reception` | **Baja** | Trazabilidad | Pérdida de histórico de autoría en compras |

---

## 2. Hallazgos Detallados

### 2.1 Identidad y Jerarquía
- **Lógica de Roles:** Correctamente implementada vía `public.has_role` y `public.is_admin`. El sistema distingue entre Admin, Encargado, Cajero y Almacenero.
- **Aislamiento de Tienda:** Se utiliza `has_store_access(p_store_id)` en los RPCs principales.
- **RIESGO:** Se detectó que `has_store_access` depende de la tabla `user_store_access`, la cual fue eliminada en la migración `20260223_unify_and_cleanup_memberships.sql`. Si no existe una redefinición no detectada, el sistema está en un estado de falla latente para nuevos despliegues.

### 2.2 RBAC y Seguridad (Fase 0)
- **VULNERABILIDAD CRÍTICA:** La función `public.register_stock_movement` es `SECURITY DEFINER` y está concedida (`GRANT EXECUTE`) al rol `authenticated`. Sin embargo, **no contiene validaciones internas de `p_store_id` contra el usuario actual**.
  - *Ataque:* Un usuario autenticado de la Tienda A puede llamar al RPC directamente con el UUID de la Tienda B y modificar stocks arbitrariamente.
  - *Mitigación:* Añadir `IF NOT public.has_store_access(p_store_id) THEN RAISE EXCEPTION ...` dentro de la función.

### 2.3 Flujo Estándar e Integridad (Fase 1 & 4)
- **Costo Promedio (WAC):** El cálculo de WAC (CPP) está presente en ajustes manuales y confirmación de transferencias, pero está **TOTALMENTE AUSENTE** en la función `register_reception`.
  - *Efecto:* Las compras de mercancía no actualizan el costo del catálogo, invalidando los reportes de rentabilidad y valoración.
- **Transaccionalidad:** El uso de `FOR UPDATE` y el bloqueo ordenado de productos (Phase 1: LOCK PRODUCTS) en ventas y recepciones es una práctica excelente para prevenir deadlocks.

### 2.4 Idempotencia (Fase 3)
- **Ventas:** Cumple con `p_transaction_id` y validación de existencia.
- **Recepciones y Transferencias:** No implementan claves de idempotencia en la creación, lo que vulnera el sistema ante fallos de conectividad en el cliente (POST duplicados).

### 2.5 Transferencias entre Almacenes (Fase 6)
- **Diseño:** Atómico mediante PL/pgSQL. Correcto uso de reserva en origen y commit en destino.
- **Hallazgo:** Falta bloqueo (`FOR UPDATE`) explícito del producto en el almacén de ORIGEN durante la confirmación, lo que permite una ventana de tiempo para sobre-vender stock que está siendo transferido.

---

## 3. Plan de Mitigación Priorizado

1. **Inmediato (P0):** Actualizar `register_stock_movement` para validar acceso a tienda.
2. **Inmediato (P0):** Redefinir `has_store_access` para usar `user_store_memberships`.
3. **Urgente (P1):** Implementar lógica de WAC en `register_reception`.
4. **Urgente (P1):** Añadir `p_transaction_id` a `register_reception` y `create_transfer`.
5. **Necesario (P2):** Añadir logs de auditoría a todos los mutativos faltantes.

---

## 4. Checklist de Aprobación

| Requisito | Estado | Nota |
| :--- | :--- | :--- |
| Aislamiento de Tenant/Store | ⚠️ Parcial | Vulnerable vía IDOR en `register_stock_movement` |
| Integridad de Inventario (Kardex vs Stock) | ✅ Pass | Lógica de triggers sólida |
| Integridad Contable (WAC) | ❌ Fallo | No se actualiza en compras |
| Idempotencia en Ventas | ✅ Pass | Implementado correctamente |
| Trazabilidad e Inmutabilidad | ⚠️ Parcial | Falta auditoría en recepciones |
| Rendimiento y Concurrencia | ✅ Pass | Bloqueo ordenado implementado |

**Score Final: 7.5/10**
*Justificación:* El sistema tiene una base técnica muy fuerte y segura en el flujo de ventas, pero descuida la seguridad en los helpers de bajo nivel y la integridad contable en el flujo de compras.
