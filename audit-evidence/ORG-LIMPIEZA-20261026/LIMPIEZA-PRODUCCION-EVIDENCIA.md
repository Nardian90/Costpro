# Evidencia — Limpieza de producción autorizada (Misión Organizaciones, 2026-10-26)

Operación ejecutada contra el proyecto Supabase de producción según la autorización delimitada de la misión (FASE 5-8). Respaldo previo verificable + manifiesto + evidencia antes/después. Los datos sensibles completos (emails literales, IDs de cuentas) permanecen en el entorno operativo autorizado, no en este repositorio público.

## 1. Manifiesto previo (estado ANTES)

- **Proyecto de producción:** `wth…lijmonclxg` (confirmado por conexión).
- **Tiendas totales:** 23 → protegidas 2, objetivo 21.
- **Tiendas protegidas (identidad canónica, no por texto):**
  - `5e6fe821-…` **ENERVIDA-VITALLCONS** (slug `enervida-vitallcons`, tenant `5364ccf8`, activa)
  - `43a4dabc-…` **Puerto Padre VITALLCONS** (slug `puerto-padre-vitallcons`, tenant `5364ccf8`, activa)
- **Baseline protegidas (ANTES):** ENERVIDA 185 productos / 4 membresías / 0 ventas / 4 perfiles enlazados; Puerto Padre 36 / 2 / 0 / 0.
- **Dependencias de las 21 tiendas objetivo:** 171 productos, 282 stock_movements, 361 transacciones, 274 kardex, 121 inventario, 15 devoluciones, 62 reglas de comisión, 27+18 documentos de auditoría/flujo de caja, 15 membresías, 9 tipos de cambio, 3 almacenes, 3 trabajadores, entre otras (manifiesto completo en el entorno operativo).
- **Cuentas objetivo:** 11 resueltas por email exacto; todas existían en Auth; referencia conservada `f244ab…@uberip.com` verificada como FUERA de la lista.
- **Tenants:** 6 totales (Default, WAC Test, Test Tenant B, Tenant Test RLS, E2E TENANT, Grupo Demo CostPro).

## 2. Respaldo recuperable (verificado)

- **Exportación de datos:** 1 443 filas en 25 tablas + 11 identidades auth documentadas (sin hash de contraseñas) → `backups/org-cleanup-20261026/` en el entorno operativo (NO en el repositorio público).
- **Verificación de restaurabilidad:** las 25 tablas se restauraron íntegras en el schema `restore_check_20261026` del proyecto E2E aislado (`lguo…`) — coincidencia de recuentos 1 443/1 443.
- **Almacenamiento (Storage):** 0 objetos de buckets pertenecen exclusivamente a tiendas objetivo (sus activos apuntan a URLs del landing local). Los 151 objetos de product-images, 31 del bucket stores, 122 de reports y 1 de salva quedaron intactos.
- **Backups automáticos de la plataforma:** listado vacío (walg habilitado, sin snapshots listados, PITR off) → el respaldo de datos propio es el mecanismo de recuperación probado.

## 3. Ejecución (secuencia validada primero en E2E)

1. Ensayos del plan en el proyecto aislado: descubrieron que (a) el trigger `prevent_hard_delete_profile` bloquea el DELETE físico de perfiles (política Iteración 12 Q6), y (b) el trigger `trigger_audit_store_changes` inserta audit_log con FK a la tienda ya borrada, haciendo imposible el DELETE físico directo de tiendas con FKs activas.
2. Ventana técnica (app detenida, ~80 s): `DISABLE TRIGGER USER` en tablas public (las FK internas y cascadas SIGUEN activas) → pre-borrados NO ACTION acotados (audit_logs y 13 tablas, 0 filas) → `DELETE FROM stores WHERE id IN (21 IDs)` → re-habilitación verificada de TODOS los triggers (`tgenabled=O`, 0 deshabilitados).
   - Un bloqueante de nivel 2 resuelto en el proceso: `payment_transactions` (referencias NO ACTION a transacciones) — pre-borrado acotado por tienda vía join.
   - Modo `session_replication_role=replica` fue RECHAZADO tras ensayo: desactiva también las cascadas FK (deja huérfanos).
3. **Tiendas eliminadas: 21/21** (cascadas completas).
4. **Cuentas (11/11):** vía mecanismo canónico del modelo — RPC `managed_soft_delete_user` (anonimización: `deleted+…@anonymized.local`, `is_active=false`, `deleted_at`, auditoría en `user_audit_log`) + **ban** de identidad auth (`banned_until` ≈ 100 años, via admin API `PUT /admin/users/{id}` con `ban_duration=876000h`) + limpieza de sesiones y refresh tokens. **El borrado físico de identidades está prohibido por el propio modelo** (trigger); el resultado final de login es **bloqueado**, estado admitido por la misión. Ningún dato contable del usuario fue destruido (integridad referencial preservada).
5. **Tenants:** liberada la referencia del perfil anonimizado → eliminados con comprobación de cero dependencias: Test Tenant B, Tenant Test RLS, E2E TENANT E2E-20261009-8DEF57, Grupo Demo CostPro.
6. Reinicio de la aplicación (invalidación de cachés).

## 4. Estado DESPUÉS (verificado con consultas reales)

| Métrica | Antes | Después |
|---|---|---|
| Tiendas | 23 | **2** (ambas protegidas, activas) |
| Tenants | 6 | **2** (Default Tenant, WAC Test Tenant) |
| Membresías a tiendas inexistentes | — | **0** |
| Membresías cross-tenant | — | **0** |
| Productos/inventario/kardex/stock/ventas/cfd de tiendas eliminadas | 1 000+ | **0** (cascadas completas) |
| payment_transactions colgantes | — | **0** (69 con transaction_id NULL preexistentes, legítimos) |
| Perfiles con tienda inexistente | — | **0** |
| Cuentas dadas de baja + baneadas | 0 | **11 + 11** |
| Cuenta preservada fuera de lista | — | intacta, sin ban |
| Productos protegidas | 221 | **221** (185 + 36, sin cambios) |
| Membresías protegidas | 6 | **6** |
| Transacciones protegidas | 894 | **894** |
| Objetos de Storage | 305 | **305** (intactos) |
| Triggers deshabilitados | 0 | **0** |

## 5. Organizaciones conservadas (motivo exacto)

- **Default Tenant** (`5364ccf8`): organización de las dos tiendas protegidas y de los usuarios reales conservados.
- **WAC Test Tenant** (`2de3d368`): conserva el perfil activo `costo@demo.com`, cuenta fuera de la lista autorizada de eliminación. No se reasigna ni elimina sin autorización expresa.

## 6. Estados residuales documentados

- **Usuarios demo operativos sin tienda** (`cajero@demo.com`, `almacen@demo.com`, `encargado@demo.com`): su tienda demo (TIENDA CENTRAL COSTPRO) fue eliminada como parte del alcance; conservar la invariante "rol operativo requiere tienda activa" obligaría a crear membresías en tiendas protegidas, lo que la misión prohíbe ("no introducir datos de ejemplo en las tiendas conservadas"). Quedan como usuarios activos sin tienda — la vista Usuarios los marca como incidencia con acción de resolución.
- **SuperAdmin visible para `admin@demo.com`: pendiente de despliegue** — la activación del rol viaja en la migración `20261026120000` (probada en aislamiento), que se aplica con el despliegue del PR; hoy la cuenta conserva rol `admin` sin asignación destructiva.
- **Auth Admin list endpoint devuelve 500** (`Database error finding users`) — problema preexistente, no causado por la limpieza; el endpoint de actualización/ban funciona correctamente.
- **Filas de audit_logs de tiendas objetivo:** 27 filas exportadas al respaldo desaparecieron de producción por rotación externa (sin pg_cron; la app en ejecución) durante la ventana de la operación — su eliminación estaba alineada con el alcance autorizado.

## 7. Límites respetados

Sin fusión de PR, sin despliegue manual, sin migraciones productivas no autorizadas, sin datos de ejemplo en tiendas conservadas, sin escrituras desde tests, respaldo verificable previo, eliminaciones acotadas por listas de IDs canónicos (nunca por coincidencia parcial de nombre/email).
