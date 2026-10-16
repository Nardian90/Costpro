# MISIÓN ENCARGADO-SERVICIOS — Roles, creación de servicios y fecha de creación escogida

**Fecha:** 2026-10-17 · **Rama:** `fix/super-admin-tipos-servicio` (continúa en **PR #1413**) · **Estado: CORREGIDO Y VERIFICADO**

---

## 1. Órdenes del negocio (scope de esta misión)

1. **Rol encargado**: revisar que los usuarios con rol `encargado` puedan **crear servicios** desde `Inicio → OPERACIÓN → Almacén → Servicios Recibidos` (y gestionar los **tipos de servicio**).
2. **Fecha de creación**: al crear un servicio, el usuario debe poder **escoger la fecha** — el sistema NO la infiere.
3. **Reglas de la fecha**: NO puede ser **menor que la última fecha** de un servicio creado, NI **superar la fecha actual**.
4. **Restricción de pruebas**: NO usar las tiendas **ENERVIDA** ni **Puerto Padre** (ni ninguna tienda real).

## 2. Diagnóstico (auditoría end-to-end de la cadena, sin preselección de causa)

| # | Capa | Verificación | Resultado |
|---|------|--------------|-----------|
| 1 | Navegación | `navigation-definition.ts` → `received-services: roles ['admin','manager','encargado','warehouse']` | ✅ encargado ve la vista |
| 2 | Botón «Nuevo Servicio» | Sin gating de rol en la UI | ✅ visible |
| 3 | **Frontend → API** | **8 llamadas `fetch()` sin cabecera `Authorization`** (crear, activar, anular, recalcular, GET/POST/DELETE pagos) | ❌ **401 «Se requiere sesión activa» para CUALQUIER rol** — `getServerSession` (SEC-024) es fail-closed solo-Bearer |
| 4 | API `/api/received-services` POST | `canManageStore()` incluye `encargado` (membership activa) | ✅ autorizado por diseño |
| 5 | RPC `create_received_service_v2` | `has_store_access_as()`: admin global o **cualquier membresía activa** | ✅ autorizado |
| 6 | API `/api/service-types` POST/PATCH | Gate `role === 'admin'` exclusivamente | ❌ encargado global → 403 |
| 7 | Modal «Gestionar tipos» | UI oculta «Agregar nuevo tipo» salvo `role === 'admin'` | ❌ encargado global en modo lectura |
| 8 | Fecha del servicio | El formulario **no tenía campo de fecha**; el RPC infería `CURRENT_DATE` | ❌ no escogible |
| 9 | Validación de fecha en BD | `validate_operation_date`: ventana [hoy−6 meses, hoy+1] — más laxa que la regla del negocio | ⚠️ insuficiente para las reglas pedidas |

**Causa raíz del bloqueo del encargado (y de todos los roles):** la misma clase de defecto corregida en la misión anterior para el catálogo — `fetch()` crudo sin `Authorization: Bearer` contra una API fail-closed (SEC-024). El backend **ya autorizaba** al encargado; el navegador nunca llegó a demostrarlo (401 antes de la autorización). Los tests unitarios existentes mockeaban `fetch` sin validar la cabecera → 3.010 tests verdes y fallo 100% en navegador real.

## 3. Correcciones implementadas (mínimas, en el punto exacto del fallo)

### 3.1 FIX Authorization Bearer — `ReceivedServicesView.tsx` (frontend-only)
Patrón canónico de la app (idéntico al FIX SUPERADMIN-TIPOS del 2026-10-17): token del `useAuthStore` → `authHeaders()` con `Authorization: Bearer`. Aplicado a las **8** llamadas del módulo: crear servicio (POST), activación tras creación (PATCH), activar borrador (PATCH), anular (PATCH), recalcular distribución (POST), y las 3 de pagos en `ServiceDetailModal` (GET/POST/DELETE). Cero cambios de autorización backend en este punto (ya era correcta).

### 3.2 FECHA DE CREACIÓN escogida por el usuario
- **Módulo puro compartido** `src/lib/received-services/service-date-validation.ts`:
  - `validateServiceCreationDate(serviceDate, lastServiceDate, today)` — fuente ÚNICA de la regla, usada por cliente y servidor.
  - `todayHavanaISO()` — día de negocio Habana (`YYYY-MM-DD`), determinista.
  - Reglas: formato `YYYY-MM-DD`; **no posterior a hoy (Habana)**; **no anterior a la última fecha NO anulada de la tienda** (el **igual** se permite; los **anulados se excluyen** — decisión documentada: un documento anulado no condiciona operaciones nuevas).
- **UI** (`CreateServiceModal`): campo `Fecha del servicio` (`input type=date`) con `value` = hoy Habana (editable — no inferido), `min` = última fecha registrada de la tienda, `max` = hoy, ayuda visible con la regla, validación cliente antes de enviar y `service_date` incluido en el POST.
- **Servidor** (`POST /api/received-services`): valida server-side con la misma función — **400** con mensaje explícito si la fecha es futura o anterior a la última registrada (consulta `MAX(service_date)` de la tienda, `status != 'voided'`). El cliente service-role del handler se unificó (una sola creación, antes duplicada). El RPC conserva `validate_operation_date` (ventana 6 meses) como defensa en profundidad.

### 3.3 Rol GLOBAL encargado gestiona el catálogo de tipos
- `service-types/route.ts`: gate `isCatalogManager` = `role === 'admin' || role === 'encargado'` (POST/PATCH + `usage_count` en GET).
- **Doctrina preservada**: el gate es sobre `profiles.role` (cuenta de confianza global), **NUNCA** sobre membresías por tienda — un encargado/manager de TIENDA (membership store-scoped, p. ej. rol global `usuario` + membership `encargado`) sigue en 403. Un catálogo GLOBAL que afecta a todos los tenants no lo muta una tienda.
- UI alineada (`ServiceTypesManagerModal.tsx`): `canManageCatalog` muestra «Agregar nuevo tipo» + editar/desactivar al encargado global; clerk/warehouse/etc. siguen en modo lectura.

## 4. Verificación (post-verificación exigida)

### 4.1 Unitarias — **3.010 passed / 0 failed** (24 skipped preexistentes)
Nuevas (21 aserciones de contrato):
- `service-date-validation.test.ts` (13): sin fecha → ok (compatibilidad RPC), hoy ok, pasada sin historial ok, **futura rechazada**, **anterior a la última rechazada citándola**, **igual permitida**, posterior-permitida, formato inválido, normalización de espacios, última corrupta no bloquea, «hoy» interno corrupto → error interno, `todayHavanaISO` coherente con Habana.
- `catalog-manager-role.test.ts` (4): admin ✓, **encargado global ✓**, clerk/warehouse/manager/usuario/costo ✗, fail-closed.
- `service-types.test.ts` (+2): **ENC-SRV** encargado global → 201 con `store_id=null`; encargado SOLO por membership (rol global `usuario`) → **403** (doctrina global intacta).
- `service-types-manager.test.tsx` (+1, y SR-11 actualizado): encargado global ve modo gestión; clerk sigue en lectura («Solo un administrador o encargado puede modificarlo»).

### 4.2 E2E real (Playwright, interfaz real, proyecto `creation` aislado) — **1 passed**
`e2e/creation/service-encargado-creacion.spec.ts` — recorrido completo en **tienda piloto del run aislado** (`E2E PILOT A CostPro E2E-20261016-0536E7`) con usuario encargado E2E dedicado (rol global `encargado` + membership `encargado` en el piloto). **Cero toques a ENERVIDA, Puerto Padre o cualquier tienda real.**

| Paso | Resultado |
|------|-----------|
| Login UI real del encargado → OPERACIÓN → Almacén → Servicios Recibidos | ✅ navegación completa permitida |
| Modal Nuevo Servicio: campo «Fecha del servicio» existe, **propone HOY (10/16/2026 Habana)**, `max`=hoy | ✅ fecha escogible, no inferida |
| Crear servicio (Transporte, $50.25) → toast «Servicio creado correctamente», fila `SRV-20261016-00056` del 10/16 | ✅ **encargado CREA servicios (201)** |
| Persistencia: recarga completa → fila y fecha intactas (verificado también en BD) | ✅ |
| Reabrir modal: `min` = 10/16 (última fecha registrada); fecha 10/15 → **rangeUnderflow nativo, 0 filas nuevas** | ✅ regla «no menor que la última» |
| Fecha futura 10/17 → **rangeOverflow nativo, 0 filas nuevas** | ✅ regla «no superior a hoy» |
| **Server-side** (API con JWT del encargado): futura → **400** «no puede ser posterior al día actual»; anterior → **400** «no puede ser anterior a la última fecha registrada»; **igual a la última → 201** | ✅ la última barrera es el servidor |
| POST sin `Authorization` → **401** | ✅ el defecto de clase queda demostrado y cubierto |
| Encargado crea TIPO de servicio («QA Encargado E2E …») vía Gestionar tipos | ✅ **201, aparece en lista** |

Evidencias reales: `audit-evidence/20261017-encargado-servicios/` (9 capturas + `repro_log.json`).

### 4.3 Estado estático
- `tsc --noEmit` scoped (9 archivos del módulo + tests): **0 errores** (el tsc completo sigue OOM en este host — limitación preexistente documentada; gate en CI).
- `eslint` de los 6 archivos tocados: **0 errores** (19 avisos preexistentes de estilo del archivo).

### 4.4 Net-zero verificado en BD (solo lectura, service-role)
0 tiendas del run · 0 pilotos del run · 0 perfiles del usuario E2E · 0 tipos `QA Encargado E2E*` · 0 servicios residuales · catálogo activo intacto (10 tipos semilla). El teardown del run (hard-delete) + `afterAll` del spec eliminaron TODOS los recursos de prueba. La tienda y el usuario reales de negocio no fueron tocados.

## 5. Matriz de autorización resultante (módulo Servicios Recibidos)

| Operación | admin global | encargado global | encargado por membership (rol global menor) | clerk/warehouse/usuario |
|---|---|---|---|---|
| Ver vista + catálogo + servicios | ✅ | ✅ | ✅ (su tienda) | ✅ (su tienda) |
| Crear servicio | ✅ | ✅ | ✅ (su tienda) | ❌ 403 (canManageStore) |
| Crear/editar tipo de servicio | ✅ | ✅ | ❌ 403 | ❌ 403 |
| Sin sesión | ❌ 401 | ❌ 401 | ❌ 401 | ❌ 401 |

## 6. Decisiones de diseño documentadas

1. **Anulados excluidos del «última fecha»**: `MAX(service_date)` sobre `status != 'voided'`. Un documento anulado no es historia vigente; obligarlo a condicionar fechas nuevas impediría operar tras limpiar errores. El igual SÍ pasa (el requisito literal «no menor que»).
2. **Gate del catálogo por rol GLOBAL, no por membership**: coherente con la doctrina del propio route (recurso global) y con la jerarquía `roles.ts` (encargado global = cuenta interna de confianza, inmediatamente bajo manager/admin).
3. **Sin migraciones**: todas las reglas caben en la capa API/UI con funciones puras; el RPC mantiene su ventana de 6 meses intacta. Menor superficie de despliegue y reversión trivial.
4. **Compatibilidad**: `service_date` sigue siendo opcional en la API — clientes programáticos sin fecha conservan el comportamiento previo (el RPC usa el día actual).

## 7. Archivos modificados / añadidos

| Archivo | Cambio |
|---|---|
| `src/lib/received-services/service-date-validation.ts` | **NUEVO** — regla pura compartida + `todayHavanaISO()` |
| `src/app/api/received-services/route.ts` | Validación server-side de fecha (400) + unificación del cliente service-role |
| `src/components/views/terminal/views/received_services/ReceivedServicesView.tsx` | Bearer en 8 fetches + campo fecha (min/max/validación) + prop `lastServiceDate` |
| `src/components/views/terminal/views/received_services/ServiceTypesManagerModal.tsx` | `canManageCatalog` (admin/encargado global) en crear/editar/desactivar y textos |
| `src/app/api/service-types/route.ts` | `isCatalogManager` (admin \| encargado global) en POST/PATCH/usage_count |
| `src/__tests__/lib/service-date-validation.test.ts` | **NUEVO** — 13 tests |
| `src/__tests__/lib/catalog-manager-role.test.ts` | **NUEVO** — 4 tests |
| `src/__tests__/api/service-types.test.ts` | +2 ENC-SRV; doctrina actualizada |
| `src/__tests__/components/service-types-manager.test.tsx` | SR-11 texto nuevo + 1 ENC-SRV |
| `e2e/creation/service-encargado-creacion.spec.ts` | **NUEVO** — E2E integral net-zero |

## 8. Bloqueos / pendientes

- Ninguno nuevo. Preexistentes: tsc completo OOM local (gate en CI); aviso de contaminación E2E `users=4` del global-teardown (previo a esta misión, reproducido también en corridas anteriores).
- Nota: el usuario encargado REAL del negocio (belkis9999) solo tiene membresías activas en ENERVIDA y Puerto Padre — tiendas prohibidas para pruebas; por eso la verificación se realizó con un encargado E2E dedicado en tienda piloto aislada, replicando exactamente su configuración (rol global `encargado` + membership `encargado`).
