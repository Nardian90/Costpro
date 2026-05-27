# Zero Trust Assumptions Violated (Resolved)

Este documento lista las asunciones de seguridad que fueron violadas en versiones anteriores y cómo se resolvieron para alcanzar un estado de "Zero Trust".

## 1. Confianza en el Cliente (Client-Side Trust)
- **Violación:** El frontend enviaba `user_id` y el backend lo aceptaba sin verificar si correspondía al usuario autenticado.
- **Resolución:** Todas las funciones `SECURITY DEFINER` ahora ejecutan `IF auth.uid() != p_user_id THEN RAISE EXCEPTION`.

## 2. RLS por Omisión (RLS by Default)
- **Violación:** Tablas nuevas (`user_usage`) se creaban sin RLS, confiando en que no se expondrían rutas.
- **Resolución:** Auditoría forzosa. Toda tabla debe tener RLS habilitado o será inaccesible por los roles `authenticated` / `anon`.

## 3. Aislamiento Implícito de Stores
- **Violación:** Se asumía que si conocías el `store_id`, tenías permiso de acceso.
- **Resolución:** Implementación de `has_store_access(uuid)` como guardia mandatoria en todas las políticas y funciones críticas.

## 4. Funciones de Desarrollo en Producción
- **Violación:** Existencia de funciones `stress_test` que permitían bypass de seguridad para pruebas de carga.
- **Resolución:** Eliminación total de estas funciones. Las pruebas de carga deben usar credenciales reales con permisos adecuados.

## 5. Fugas de Metadatos
- **Violación:** La tabla `tenants` permitía selección global, permitiendo a un atacante listar todos los clientes del sistema.
- **Resolución:** Política restrictiva en `tenants` que solo permite ver el propio tenant asociado al perfil.
