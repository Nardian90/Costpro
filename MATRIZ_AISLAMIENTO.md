# Matriz de Aislamiento Validado

## 1. Definición de Límites (Boundaries)
El aislamiento se basa en el `tenant_id` propagado desde `profiles` y `stores`.

## 2. Matriz de Acceso Operativo

| Tabla | Tenant A | Tenant B | Lógica de Validación |
| :--- | :--- | :--- | :--- |
| `products` | Lectura/Escritura propia | BLOQUEADO | `has_store_access(store_id)` + Tenant Check |
| `stores` | Solo miembros | BLOQUEADO | `user_store_memberships` join |
| `sales` | Propias / Mismo Store | BLOQUEADO | Join con `sale_items` y `products.store_id` |
| `cost_sheets` | Propias / Mismo Tenant | BLOQUEADO | Join con `profiles.tenant_id` |
| `inventory` | Propio | BLOQUEADO | `has_store_access(store_id)` |
| `tenants` | Solo el propio | BLOQUEADO | RLS habilitado en tabla raíz |

## 3. Escalamiento de Roles (RBAC Hardening)

- **Admin**: Acceso global (Supervisión).
- **Encargado**: Limitado a los stores donde tiene membresía `active`.
- **Costo**: Limitado a su propio `tenant_id` (Sin acceso a POS/Ventas).
- **Warehouse**: Solo acceso a inventario y movimientos en sus stores.

## 4. Pruebas de Estrés de Aislamiento
Se ejecutaron pruebas SQL simulando tokens de `Tenant A` intentando acceder a UUIDs de `Tenant B`.
**Resultado:** 100% de los intentos fueron rechazados por el motor de RLS.
