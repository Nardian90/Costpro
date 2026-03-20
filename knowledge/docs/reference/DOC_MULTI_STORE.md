# Modelo Multi-Tienda y Roles - Lógica de Operación

## Introducción
Este documento describe el comportamiento esperado del sistema tras la implementación del modelo multi-tienda. El sistema ahora permite que un usuario esté asignado a múltiples tiendas y gestione una "tienda activa" para sus operaciones.

## Roles y Jerarquía
1. **admin**: Acceso total al sistema. Puede gestionar todos los usuarios, tiendas y límites.
2. **encargado**: Puede crear tiendas y usuarios (limitado por el admin). Gestiona los recursos que ha creado.
3. **usuario**: Rol operativo básico. Solo accede a las tiendas que le han sido asignadas.

## Flujo de Login
Al iniciar sesión satisfactoriamente:
1. El sistema consulta las tiendas asignadas al usuario en la tabla `user_store_access`.
2. **Caso 1: Una sola tienda asignada**
   - El sistema establece automáticamente esa tienda como `active_store_id` en el perfil del usuario.
   - El usuario es redirigido directamente al panel principal de esa tienda.
3. **Caso 2: Múltiples tiendas asignadas**
   - El sistema redirige al usuario a una vista de "Selección de Tienda".
   - El usuario debe elegir en cuál tienda desea operar.
   - Al elegir, se actualiza su `active_store_id` en la base de datos.
4. **Caso 3: Ninguna tienda asignada**
   - El usuario ve un mensaje informativo indicando que no tiene tiendas asignadas y debe contactar a un administrador.

## Tienda Activa
- Solo puede haber **UNA** tienda activa por usuario a la vez.
- Todas las operaciones de creación de datos (ventas, productos, movimientos) se filtran y asocian automáticamente a la `active_store_id` del usuario actual.
- Las políticas de seguridad (RLS) garantizan que el usuario solo vea y modifique datos pertenecientes a su tienda activa.

## Vista "Red de Tiendas"
Desde el panel principal, el usuario puede acceder a la "Red de Tiendas":
- **Visualización**: Solo se muestran las tiendas asignadas al usuario en `user_store_access`.
- **Cambio de Tienda**: El usuario puede seleccionar otra tienda de su lista para convertirla en la "tienda activa".
- **Efecto**: Al cambiar la tienda activa, el contexto de datos de toda la aplicación cambia para reflejar la nueva tienda seleccionada.

## Límites para Encargados
Los usuarios con rol `encargado` tienen límites definidos por el `admin`:
- **Máximo de Tiendas**: Límite de tiendas que el encargado puede crear.
- **Máximo de Usuarios**: Límite de usuarios que el encargado puede crear.
- Estos límites se validan a nivel de base de datos mediante triggers. Si un recurso (tienda o usuario) es eliminado, el conteo se actualiza automáticamente, permitiendo crear nuevos recursos dentro del límite.

## Seguridad (RLS)
- El acceso a los datos está doblemente protegido:
  1. El usuario debe tener la tienda en su lista de acceso (`user_store_access`).
  2. El usuario solo opera sobre la tienda marcada como `active_store_id`.
- El rol `admin` actúa como superusuario saltándose estas restricciones de filtrado pero respetando la integridad referencial.

## Auditoría
Se han implementado triggers automáticos para registrar:
- Cambios de tienda activa y roles en `audit_logs`.
- Asignaciones y remociones de acceso a tiendas en `audit_logs`.
- Eventos de creación de usuarios en `business_events`.

## Notas Técnicas sobre Creación de Usuarios
- La función `managed_create_user` es una implementación lógica que inserta registros en `public.profiles`.
- En un entorno real de Supabase, la creación de un usuario requiere un registro previo en `auth.users`. Esta operación suele realizarse a través del SDK de Supabase Auth (Admin API) desde un entorno seguro (Edge Function o Servidor) y no directamente desde SQL, debido a restricciones de seguridad y manejo de credenciales.
- Se ha implementado un trigger de restricción (`CONSTRAINT TRIGGER`) diferido para `validate_active_store`, lo que permite que la creación del perfil y la asignación de la tienda ocurran en la misma transacción sin conflictos de integridad circular.
