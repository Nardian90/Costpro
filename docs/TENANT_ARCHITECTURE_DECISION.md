# Tenant Architecture Decision

**Fecha:** 2026-08-02
**Estado:** Decisión pendiente
**Deuda técnica:** DT-03

---

## 1. Contexto

El sistema tiene un campo `tenant_id` en `profiles`, `stores`, y 6+ tablas más, con RLS policies que lo usan para verificar aislamiento. Sin embargo:

- 17/18 profiles tienen `tenant_id = NULL`
- 16/16 stores tienen `tenant_id = NULL`
- Solo 1 profile tiene tenant asignado (WAC Test Tenant)
- Solo 2 tenants existen en la tabla `tenants`

Cuando `tenant_id` es NULL, `has_store_access()` skipea el check de tenant → el sistema opera en modo **single-tenant de facto**.

---

## 2. Opciones

### Opción A: Mantener single-tenant optimizado

**Qué significa:**
- Eliminar `tenant_id` de RLS policies (o tratar NULL como comportamiento correcto)
- Documentar que el sistema es single-tenant
- `user_store_memberships` es la única fuente de aislamiento

**Pros:**
- Simplifica el modelo mental
- Elimina campo muerto
- RLS más simple y predecible

**Contras:**
- Si se quiere multi-tenant en el futuro, hay que reintroducir el campo
- Pierde la infraestructura de tenant ya construida

### Opción B: Evolucionar a SaaS multi-tenant real

**Qué significa:**
- Asignar tenants a todas las stores existentes
- Asignar tenant a todos los profiles (heredado de su primera store)
- Modificar `managed_create_user` para heredar tenant_id del creator
- Activar el check de tenant en `has_store_access()` (no skipear si NULL)

**Pros:**
- Aislamiento real entre organizaciones
- Preparado para SaaS
- La infraestructura ya existe

**Contras:**
- Migration compleja (asignar tenants existentes)
- Riesgo de romper accesos si se asigna mal
- Requiere decisión de producto

### Opción C: Dejar como está (status quo)

**Qué significa:**
- `tenant_id` queda como campo opcional
- NULL = "sin restricción de tenant" (comportamiento actual)
- No se modifica nada

**Pros:**
- Cero riesgo
- No requiere trabajo

**Contras:**
- Deuda técnica persistente
- Confusión: el campo existe pero no se usa
- Si alguien setea tenant_id sin entender el modelo, puede romper accesos

---

## 3. Impacto estimado por opción

| Área | Opción A (single) | Opción B (multi) | Opción C (status quo) |
|------|:-:|:-:|:-:|
| RLS policies | Simplificar 6 | Activar checks | Sin cambios |
| memberships | Sin cambios | Sin cambios | Sin cambios |
| profiles | Eliminar tenant_id | Setear en todos | Sin cambios |
| stores | Eliminar tenant_id | Setear en todos | Sin cambios |
| Facturación | N/A | Separar por tenant | Sin cambios |
| managed_create_user | Sin cambios | Heredar tenant_id | Sin cambios |
| Esfuerzo | Medio | Alto | Cero |
| Riesgo | Medio | Alto | Cero |

---

## 4. Recomendación

**Opción C (status quo) a corto plazo.**

Mantener `tenant_id` como campo opcional con NULL = "sin restricción". Documentar claramente que:
1. El sistema opera en modo single-tenant de facto
2. `user_store_memberships` es la fuente de aislamiento
3. `tenant_id` existe para uso futuro si se decide multi-tenant
4. **NO setear `tenant_id` en nuevos profiles/stores hasta que se decida multi-tenant**

**Re-evaluar en el próximo trimestre** si hay requerimiento de multi-tenant.

---

## 5. Decisión

⏳ **Pendiente aprobación del producto.**

Este documento no debe implementarse hasta que se tome una decisión de producto sobre si CostPro será single-tenant o multi-tenant.
