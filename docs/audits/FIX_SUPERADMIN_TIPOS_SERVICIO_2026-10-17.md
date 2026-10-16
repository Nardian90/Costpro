# FIX — Super Admin no podía gestionar tipos de servicio en Servicios Recibidos

**Proyecto:** COSTPRO 4 Multitienda · **Repositorio:** `Nardian90/Costpro`
**Fecha:** 2026-10-17 · **Rama:** `fix/super-admin-tipos-servicio`
**Módulo:** Inicio → OPERACIÓN → Almacén → Servicios Recibidos → **Gestionar tipos de servicio**
**Cuenta investigada:** `admin@demo.com` (identificada por el negocio como superadministradora)

---

## 1. Resumen ejecutivo

El negocio reportó que la cuenta superadministradora no podía crear tipos de servicio. La investigación de extremo a extremo demostró que **el backend autorizaba correctamente** al usuario (rol global `admin` verificado en base de datos, POST devolvía 409/400 — no 403 — al pasar por la autorización) pero **el frontend enviaba todas sus llamadas sin el token de sesión**: el hook `useServiceTypes` y el modal `ServiceTypesManagerModal` usaban `fetch()` crudo sin la cabecera `Authorization: Bearer`, mientras el servidor (`getServerSession`, endurecido por SEC-024) **solo autentica por Bearer y falla cerrado**. Resultado: `401 «Se requiere sesión activa»` en TODO el módulo — el catálogo aparecía «vacío» (el 401 del GET se mostraba como estado vacío) y la creación/edito/desactivación fallaban con «No autorizado», exactamente lo percibido por el usuario.

La corrección es mínima y frontend-only: inyectar `Authorization: Bearer <token>` del auth store (patrón canónico ya dominante en la app, p. ej. `useUsers`/`useOfertas`) en los 3 fetch del módulo, y mostrar el error de carga real en el modal para que un fallo de red/autenticación nunca vuelva a presentarse como «catálogo vacío». Verificado E2E en la interfaz real con la cuenta afectada: catálogo cargado (10 filas), creación 201, toast de éxito, persistencia tras recarga y desactivación del dato de prueba por el procedimiento permitido. Sin cambios en backend, RLS, roles, ni datos operativos.

**Estado: CORREGIDO Y VERIFICADO** (criterio de aceptación cumplido en interfaz real).

## 2. Causa raíz demostrada

**Categoría: Frontend** (discrepancia de contrato de autenticación entre el módulo nuevo y el servidor).

| Capa | Comprobación efectiva | Resultado |
|------|----------------------|-----------|
| Supabase Auth | `signInWithPassword` con la cuenta demo | **200** — sesión JWT válida, `user.id` coincide con `profiles.id` |
| `profiles.role` (fuente de verdad del rol) | consulta directa service-role (solo lectura) | **`admin`** — rol global correcto; 3 membresías activas `admin`; mismo tenant |
| `getServerSession` (SEC-024) | valida **exclusivamente** `Authorization: Bearer` contra Supabase; el fallback de cookie/decodificación sin firma fue eliminado por seguridad | sin Bearer → **null** → 401 fail-closed |
| `POST /api/service-types` (autorización) | `isAdmin(session)` → `session.user.role === 'admin'` | con Bearer de la cuenta: **409** en duplicado (pasó la autorización), **400** en inválido — nunca 403 |
| UI del módulo | `fetch('/api/service-types')` **sin cabecera Authorization** | GET y POST/PATCH → **401** desde el navegador |

El módulo de tipos de servicio se construyó en la misión 2026-10-15 con `fetch()` crudo — divergiendo del patrón canónico del resto de la app (todos los demás hooks/api envían `Bearer ${token}` del auth store) — y sus pruebas unitarias mockeaban `fetch` sin validar la cabecera, por lo que el defecto pasó la suite (2.944 tests) y solo se manifestaba en el navegador real. El GET fallido era además **silenciado**: el hook guardaba `error`, pero el modal no lo distinguía del estado «catálogo vacío», reforzando la percepción de que el catálogo no existía.

### Evidencia de la reproducción (antes del fix)

- Log textual del flujo real (Playwright, login por formulario con la cuenta demo):
  `click Crear tipo → API service-types: POST /api/service-types → 401 {"error":"No autorizado","message":"Se requiere sesión activa"}` — `toastExito:false` — `persisteTrasRecarga:false` (`audit-evidence/20261017-superadmin-tipos-servicio/repro_log_PREFIX.json`).
- Captura del error real: `10-tras-submit_PREFIX.png` — toast rojo «No autorizado», formulario con los datos conservados y error «No autorizado» bajo el campo, y bajo el formulario «El catálogo está vacío. Agrega el primer tipo de servicio.» con el usuario **Admin Demo (badge ADMIN)** en pantalla.
- Captura del estado engañoso inicial: `07-modal-gestionar-tipos-inicial_PREFIX.png` — catálogo mostrado como vacío pese a tener 9 tipos globales en BD.
- Verificación negativa de hipótesis descartadas: RLS no interviene (la API escribe con service-role tras autorizar); no es un problema de identidad (rol `admin` verificado en BD); no es CSRF/Origin (`CSRF_ALLOWED_DOMAINS` correcto para localhost); no es la migración `20261015000001` (esa afecta al RPC de crear *servicios*, no a la gestión del catálogo).

## 3. Corrección aplicada (mínima, frontend-only)

| Archivo | Cambio |
|---------|--------|
| `src/hooks/useServiceTypes.ts` | `GET /api/service-types` ahora envía `Authorization: Bearer ${token}` (token del auth store vía selector `useAuthStore((s) => s.token)`; dep del `useCallback` actualizada). Sin token no envía la cabecera (no explota). |
| `src/components/views/terminal/views/received_services/ServiceTypesManagerModal.tsx` | helper `authHeaders()` con Bearer aplicado a los 3 fetch (POST crear, PATCH editar, PATCH desactivar/reactivar). Nueva prop `loadError` opcional: si el GET falla, el modal muestra el mensaje de error real (role=alert) en lugar del falso «El catálogo está vacío». |
| `src/components/views/terminal/views/received_services/ReceivedServicesView.tsx` | pasa `typesError` del hook al modal como `loadError`. |

**No se tocó:** backend/API, políticas RLS, roles o membresías, la tabla `service_types` (esquema ni datos existentes), el RPC `create_received_service_v2`, ni ninguna otra tienda o módulo. La validación server-side (403 solo-admin, 409 duplicados, 400 Zod, rate-limit) queda **íntegra**: el fix no amplía permisos, solo permite que la autorización ya vigente llegue a ejecutarse con la identidad real del usuario.

## 4. Pruebas ejecutadas y resultados individuales

**Nuevas (regresión del fix):**
| Prueba | Resultado |
|--------|-----------|
| `src/__tests__/hooks/useServiceTypes.test.ts` — envía `Authorization: Bearer` con token del store | ✅ passed |
| — sin token: no envía Authorization y no lanza error de cliente | ✅ passed |
| — 401 del servidor se propaga como error legible (no catálogo vacío silencioso) | ✅ passed |
| — carga y filtra activos en 200 | ✅ passed (4/4) |

**Regresión completa del repositorio (vitest, 3 shards):**
| Bloque | Resultado |
|--------|-----------|
| api + contracts + help + hooks + lib | 676 passed · 1 skipped |
| integration + navigation + services + store + ui + unit + validation | 1.962 passed · 18 skipped |
| components | 326 passed · 5 skipped |
| **Total** | **2.964 passed · 24 skipped · 0 failed** (incluye los 21 previos del módulo: 12 API + 9 modal) |

**E2E automatizado nuevo:** `e2e/service-types-superadmin.spec.ts` (Playwright, proyecto core) — login UI real → navegación OPERACIÓN → Almacén → Servicios Recibidos → Gestionar tipos → catálogo cargado (≥9) → crear tipo determinista `QA Prueba SuperAdmin E2E` → toast + lista → recarga + persistencia → desactivación (procedimiento permitido) → badge «Inactivo» y ausencia en el selector de activos. **1 passed (28.6 s)**, re-runnable y net-zero (si el tipo existe de un run anterior no lo recrea; siempre queda desactivado).

**TypeScript/ESLint:** `tsc --noEmit` sin errores en los archivos del cambio; ESLint 0 errores (warnings preexistentes de estilo `<button>` crudo, dominantes en la vista).

## 5. Matriz de autorización (verificación de que el candado sigue puesto)

| Escenario | Esperado | Evidencia |
|-----------|----------|-----------|
| Superadministrador autorizado (`admin@demo.com`, `profiles.role=admin`) crea tipo | Permitido | E2E real: POST **201** + toast + persistencia |
| Usuario sin rol de gestión (manager/clerk) | Rechazado | unitario API 403 «Solo un administrador puede gestionar el catálogo»; UI en modo lectura (SR-11) |
| No autenticado (sin Bearer) | Rechazado | probe real **401**; unitario 401; la corrección no introduce ninguna vía sin token |
| Duplicado (case/espacio-insensitive) | Rechazado | probe real **409**; unitario 409 + índice único parcial en BD |
| Datos inválidos (nombre vacío, >80, caracteres de control) | Rechazado | probe real **400** con detalles Zod; unitarios 400 |
| Alcance de tienda/tenant | El catálogo es GLOBAL por diseño documentado (misión 2026-10-15): lo muta solo el rol GLOBAL `admin`; la creación de servicios sigue scoped por tienda en el RPC. Sin cambios. | doctrina `src/lib/roles.ts` + informe 2026-10-15 |
| Lectura del catálogo | Sigue funcionando para cualquier usuario autenticado | unitarios + captura posterior con selector poblado |

## 6. Verificación posterior (interfaz real, cuenta afectada)

| Verificación | Resultado |
|--------------|-----------|
| Login `admin@demo.com` por formulario | ✅ dashboard operativo |
| Navegación OPERACIÓN → Almacén → Servicios Recibidos | ✅ vista accesible |
| Modal Gestionar tipos: catálogo cargado | ✅ 10 filas visibles con código/uso/descripción (`16-gestionar-tipos-catalogo-cargado.png`) |
| Formulario Nuevo Servicio: selector poblado | ✅ `15-formulario-tipos-cargados.png` |
| Crear tipo de prueba (nombre inequívoco) | ✅ POST **201** `QA Prueba SuperAdmin E2E` (id `796c309c-0fa6-44b0-bebb-c6a719c596cf`, code QAPRU) |
| Toast de éxito + tipo en lista | ✅ `10-tras-submit.png` |
| Persistencia tras recarga completa | ✅ `11-persistencia-tras-recarga.png` |
| BD final (service-role, solo lectura) | ✅ 10 filas: 9 activas originales + 1 de prueba **desactivada** |
| El permiso no es solo visual | ✅ la escritura real llega a BD (201) y la autorización server-side quedó íntegra (403/409/400/401 en matriz §5) |
| Sin permisos globales concedidos a usuarios comunes | ✅ cero cambios en `profiles`/`user_store_memberships` (solo lecturas) |

## 7. Datos de prueba y limpieza

El tipo de prueba `QA Prueba SuperAdmin E2E` fue creado **por el flujo real de la interfaz** y desactivado **por el procedimiento permitido** del propio módulo (desactivación `is_active=false`; el sistema no ofrece borrado físico por diseño — preserva el historial). No afecta al selector de nuevos servicios (solo muestra activos) y queda trazable por su nombre inequívoco y descripción. Si el negocio desea eliminar la fila, requiere decisión explícita (DELETE directo en BD), fuera del alcance autorizado de esta misión. **Cero escrituras** en datos operativos (servicios, movimientos, inventario, pagos).

## 8. Evidencia (audit-evidence/20261017-superadmin-tipos-servicio/)

- **ANTES (defecto):** `07-modal-gestionar-tipos-inicial_PREFIX.png` (catálogo «vacío») · `10-tras-submit_PREFIX.png` (toast/error «No autorizado») · `11-persistencia-tras-recarga_PREFIX.png` (no persiste) · `repro_log_PREFIX.json` (POST → 401)
- **DESPUÉS (corregido):** `16-gestionar-tipos-catalogo-cargado.png` (catálogo completo) · `15-formulario-tipos-cargados.png` (selector poblado) · `10-tras-submit.png` (POST 201 + toast éxito) · `11-persistencia-tras-recarga.png` (persiste) · `12-limpieza-desactivado.png` (toast «Tipo desactivado») · `repro_log.json` (POST → 201)
- Recorrido completo del login: `00`–`06`, `13`–`14` (dashboard, hubs, vista)

## 9. Bloqueos pendientes

1. **Harness E2E global-setup (preexistente):** requiere `E2E_ADMIN_PASS` vigente en el entorno para el login del runner (`admin@costpro.com`); el mensaje «E2E DATA CONTAMINATION — users=4» en teardown es el pendiente documentado en el ciclo anterior (Task 10), no introducido por esta misión. El spec nuevo se ejecutó correctamente con las credenciales del runner disponibles en el entorno.
2. **tsc completo del repo** sigue dependiendo del gate de CI (OOM local documentado desde Task 9); los archivos de este cambio verifican limpios.
3. La API admin de Supabase (`/auth/v1/admin/users`) devolvió 500 en este proyecto; la identidad se verificó por `profiles` + login real, sin necesidad de esa vía.
