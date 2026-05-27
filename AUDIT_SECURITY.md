# Informe de Auditoría de Seguridad - Base de Datos Supabase (CostproBD)
**Fecha:** $(date +%Y-%m-%d)
**Versión:** 1.0
**Estado:** CRÍTICO
**Referencia:** Estándares OWASP ASVS / Supabase Security Best Practices

## 1. Resumen Ejecutivo
Se ha realizado una auditoría técnica profunda de la configuración de seguridad y Row Level Security (RLS) en la instancia de Supabase `CostproBD`. El sistema está diseñado para ser multi-tienda (multi-tenant), lo que requiere un aislamiento estricto entre usuarios de diferentes organizaciones.

**Resultado:** La postura de seguridad actual es **CRÍTICA**. Se han detectado múltiples vectores de fuga de datos y vulnerabilidades de escalada de privilegios que permiten a usuarios de una tienda acceder y modificar datos de otras tiendas.

---

## 2. Hallazgos Críticos

### 2.1 Tablas con RLS Desactivado (Vulnerabilidad Crítica)
Se han identificado tablas críticas que no tienen activado Row Level Security. Esto significa que cualquier usuario con la `anon_key` puede leer y escribir en ellas sin restricciones.

- **`public.tenants`**: Contiene la definición de las organizaciones/inquilinos.
- **`public.user_usage`**: Contiene datos de consumo de usuarios.
- **`public.pick3_user_plays`**: Datos de juego de usuarios.

**Impacto:** Acceso total no autorizado a la estructura de clientes y datos de uso.

### 2.2 Políticas Globales en `products` (Fuga de Datos Masiva)
La tabla `products` tiene políticas que rompen completamente el aislamiento multi-tienda:

- **Política `public_read_products`**: Permite a **CUALQUIER** usuario (incluso anónimo) leer todos los productos de todas las tiendas (`USING (true)`).
- **Política `authenticated_users_can_manage_products`**: Permite a **CUALQUIER** usuario autenticado realizar `INSERT`, `UPDATE` y `DELETE` en cualquier producto de cualquier tienda.

**Impacto:** Un usuario malintencionado de la "Tienda A" puede borrar o modificar los precios y productos de la "Tienda B".

### 2.3 Error Lógico en Política de `stores` (Denegación de Servicio/Fallo de Acceso)
La política `stores_select_admin_or_member` contiene un error de sintaxis lógica:
- **Código actual:** `WHERE (m.store_id = m.id) ...`
- **Error:** Compara el ID de la tienda con el ID de la membresía en la misma fila.
- **Consecuencia:** Los usuarios no administradores no pueden ver sus propias tiendas (la condición casi nunca se cumple), mientras que el sistema queda expuesto si se malinterpreta.

---

## 3. Hallazgos de Aislamiento Multi-Inquilino (Multi-tenancy)

### 3.1 Uso Inconsistente de `tenant_id`
Aunque la función `has_store_access` intenta forzar el aislamiento por `tenant_id`, la mayoría de las filas en `profiles` y `stores` tienen este campo en `NULL`.

- **Observación:** Solo 1 de 8 perfiles tiene un `tenant_id` asignado.
- **Riesgo:** Si el `tenant_id` es NULL, la validación de "Tenant mismatch" se salta, dejando la seguridad dependiendo puramente de `user_store_memberships`, la cual ya presenta errores lógicos.

### 3.2 Acceso Cruzado en `cost_sheets` (Fichas de Costo)
La política `Admins and Costo role can view all cost sheets` permite que **cualquier usuario con el rol 'costo'** vea todas las fichas del sistema, sin importar a qué tienda pertenezca.

**Impacto:** Exposición de propiedad intelectual y secretos comerciales entre competidores que usen la misma plataforma.

---

## 4. Matriz de Riesgos

| ID | Hallazgo | Severidad | Probabilidad | Impacto |
|---|---|---|---|---|
| SEC-01 | RLS Desactivado | Crítica | Alta | Acceso Total |
| SEC-02 | Productos públicos/editables | Crítica | Alta | Integridad de Datos |
| SEC-03 | Error lógico en `stores` | Alta | Alta | Disponibilidad |
| SEC-04 | Fuga en `cost_sheets` | Alta | Media | Confidencialidad |

---

## 5. Recomendaciones de Remediación (Roadmap)

### Fase 1: Emergencia (Inmediata)
1. Activar RLS en todas las tablas:
   ```sql
   ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
   ALTER TABLE public.user_usage ENABLE ROW LEVEL SECURITY;
   ```
2. Eliminar políticas de acceso total en productos:
   ```sql
   DROP POLICY "public_read_products" ON public.products;
   DROP POLICY "authenticated_users_can_manage_products" ON public.products;
   ```

### Fase 2: Corrección de Lógica
1. Corregir la política de tiendas:
   ```sql
   -- Cambiar m.id por stores.id
   USING (is_admin() OR EXISTS (SELECT 1 FROM user_store_memberships m WHERE m.store_id = stores.id AND m.user_id = auth.uid() AND m.status = 'active'))
   ```
2. Refactorizar políticas de `cost_sheets` para incluir validación de `store_id` o `membership`.

### Fase 3: Hardening Multi-tenant
1. Asegurar que cada registro nuevo incluya obligatoriamente el `tenant_id` derivado del perfil del creador.
2. Implementar una auditoría automatizada de políticas RLS en el pipeline de CI/CD.

---
**Auditor:** Jules (AI Senior Software Engineer)
**Certificación:** ISO/IEC 27001 Compliance Framework (Simulated)
