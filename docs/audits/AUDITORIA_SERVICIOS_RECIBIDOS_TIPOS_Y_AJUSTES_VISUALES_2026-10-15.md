# Auditoría — Servicios Recibidos: tipos de servicio configurables y ajustes visuales

**Proyecto:** COSTPRO 4 Multitienda · **Repositorio:** `Nardian90/Costpro`
**Fecha:** 2026-10-15 · **Rama:** `feat/servicios-recibidos-tipos-configurables`
**Alcance:** F2 gestión de tipos de servicio · F3 auditoría integral de Servicios Recibidos · F4 landing sin marca duplicada · F5 icono de impresora Dark+Enhanced

---

## 1. Resumen ejecutivo

La misión pedía tres cambios funcionales/visuales y una auditoría integral. El hallazgo central de la auditoría fue que **el catálogo de tipos de servicio ya existía en base de datos** (tabla `service_types`, 9 tipos semilla globales) pero estaba **muerto en la práctica**: el RPC `create_received_service_v2` validaba el tipo exclusivamente contra la tienda activa (`store_id = p_store_id`), de modo que ningún tipo global — que son todos — podía pasar la validación. Condenado por ese defecto, el frontend nunca envió `service_type_id` y recurrió a una lista estática de 7 nombres hardcodeados, dejando la columna FK `received_services.service_type_id` huérfana.

La solución conectó la fuente oficial con tres piezas mínimas: (1) una migración quirúrgica del RPC (un predicado: `(store_id = p_store_id OR store_id IS NULL)`), (2) una API nueva `/api/service-types` con permisos y validaciones de integridad, y (3) la reconexión del frontend (selector desde BD + modal de gestión con crear/editar/desactivar). Además se eliminó la duplicación de la marca en el landing y se corrigió el chip del icono de impresora de Reporte Entrega para Dark+Enhanced.

Evidencia de extremo a extremo: la migración fue aplicada y verificada en la base de datos real, y una prueba E2E del RPC real creó `SRV-20261015-00053` en la tienda de pruebas (TIENDA CENTRAL COSTPRO) con `service_type_id` global poblado — operación que **antes de la migración devolvía `ERR_SERVICE_TYPE_NOT_FOUND`** (reproducido). La suite completa del proyecto quedó en verde (2.944 tests). El aislamiento de ENERVIDA-VITALLCONS se verificó 7/7 antes y después de toda escritura.

## 2. Defectos reproducidos

| # | Defecto | Reproducción | Severidad |
|---|---------|--------------|-----------|
| D1 | Los tipos de servicio no se pueden administrar: lista estática `quickTypes` en código (7 nombres) | `ReceivedServicesView.tsx` línea 723 (estado previo); agregar una categoría exigía desplegar código | Alta (funcional) |
| D2 | El catálogo oficial `service_types` es inaccesible: RPC rechaza tipos globales | Llamada real a `create_received_service_v2` con `p_service_type_id` global → `ERR_SERVICE_TYPE_NOT_FOUND` (reproducida en BD real antes de la migración) | Alta (arquitectónica) |
| D3 | `received_services.service_type_id` nunca se pobla → imposible saber qué tipos están en uso ni auditar por identidad | Cualquier fila histórica: FK a NULL; el nombre vive solo como texto libre | Media |
| D4 | Marca duplicada en el landing: «CostPro» pequeño en la nav superior + «CostPro» gigante del hero, a <40px de distancia | Captura de estado previo del landing (BrandWordmark en `HeroSection.tsx` nav) | Baja (visual) |
| D5 | Icono de impresora de Reporte Entrega en verde neón `#39ff14` con Dark+Enhanced | Chip del `PageHeader` con `bg-brand`: en dark el token `--brand` es `#39ff14`; el modo Performance lo apaga (`#fafafa`) pero Enhanced no lo modula → se percibe chillón y confundible con una confirmación de éxito | Media (visual/a11y) |

## 3. Causas raíz demostradas

- **D1/D2/D3 (causa única compartida):** el predicado `WHERE id = p_service_type_id AND store_id = p_store_id AND is_active = true` del RPC no contempla el catálogo global (`store_id IS NULL`); en SQL `NULL = NULL` es NULL, jamás true. El catálogo fue sembrado 100% global (verificado: 9/9 filas con `store_id = NULL`), por lo que la validación rechazaba el 100% de los tipos oficiales. El frontend, al no poder enviar identidad, adoptó la lista estática como work-around.
- **D4:** el wordmark de marca se reutiliza en 4 superficies del landing (nav del hero, h1, drawer móvil, footer) tras el unificador `BrandWordmark` (FIX-BRAND-HIERARCHY); la nav del hero y el h1 quedaron a la vista simultáneamente en el primer scroll.
- **D5:** el chip del icono de `PageHeader` usa el par de tokens `bg-brand text-brand-foreground` para TODAS las vistas. El modo Enhanced no redefine `--brand` (solo Performance lo monocromiza), así que Dark+Enhanced muestra el neón puro de marca. Es un defecto de asignación semántica: una acción utilitaria (imprimir) heredó el «momento de marca» reservado para identidad.

## 4. Componentes y archivos inspeccionados

| Área | Archivos |
|------|----------|
| Vista Servicios Recibidos | `src/components/views/terminal/views/received_services/ReceivedServicesView.tsx` (902 líneas, leído completo) |
| API del módulo | `src/app/api/received-services/route.ts` (GET/POST/PATCH, RPC v2, gates F3-P0-02) |
| RPC y BD | `create_received_service_v2` (definición completa extraída con `pg_get_functiondef`), tabla `service_types` (columnas, constraints, políticas RLS, índices), `received_services`, `has_store_access_as`, `auth.role()`/`auth.uid()` |
| Roles | `src/lib/roles.ts` (jerarquía global/membership, `canManageStore`, `canViewStore`), `src/contracts/user.ts` (`UserContract`) |
| Landing | `src/app/LandingPage.tsx`, `src/components/landing/HeroSection.tsx`, `src/components/landing/BrandWordmark.tsx`, `src/styles/landing-shield.css`, `src/styles/modes.css` (blindaje 2026-10-06 `#landing-root`) |
| Icono impresora | `src/components/ui/PageHeader.tsx`, `src/components/views/terminal/views/cash/CashReportView.tsx`, `src/styles/tokens.css` (`--brand` light/dark), `src/styles/modes.css` (Performance/Enhanced) |
| Convenciones de test | `received-services-authz.test.ts`, `commissions-manage-modal.test.tsx`, `cash-report-view.test.tsx`, `workers-return-navigation.test.tsx` |

## 5. Cambios implementados

**Nuevos archivos**
- `src/app/api/service-types/route.ts` — API del catálogo: GET (lectura autenticada; `usage_count` solo para admin), POST y PATCH (solo admin global). Zod, rate-limit, dedup case/espacio-insensible, código derivado del nombre, sin borrado físico.
- `src/hooks/useServiceTypes.ts` — hook de la fuente oficial (estados carga/error/éxito + refetch).
- `src/components/views/terminal/views/received_services/ServiceTypesManagerModal.tsx` — gestión: agregar, editar, desactivar/reactivar con validaciones, doble-envío bloqueado, confirmaciones de consecuencias y modo lectura para no-admin.
- `supabase/migrations/20261015000001_service_types_global_acceptance.sql` — RPC corregido + índice único parcial defensivo.
- Tests: `src/__tests__/api/service-types.test.ts` (12), `src/__tests__/components/service-types-manager.test.tsx` (9), `src/__tests__/components/cash-report-icon-variant.test.tsx` (2).

**Archivos modificados**
- `ReceivedServicesView.tsx` — selector alimentado por el catálogo oficial (selección por identidad `typeId`), acceso «Gestionar tipos», envío de `service_type_id` + `service_type_name`, preselección del tipo recién creado sin cerrar la operación, estados de carga/catálogo vacío.
- `src/components/ui/PageHeader.tsx` — prop `iconVariant?: 'brand' | 'neutral'` (default `brand`, retrocompatible con las 8 vistas existentes).
- `src/components/views/terminal/views/cash/CashReportView.tsx` — `iconVariant="neutral"` (solo esta vista).
- `src/components/landing/HeroSection.tsx` — retirado el `BrandWordmark` de la nav superior; queda el escudo como marca visual del encabezado.

## 6. Decisión de alcance: catálogo global por diseño

La arquitectura ya decidía el alcance: las 9 filas semilla son globales (`store_id = NULL`), la tabla tiene FK a `stores` para soportar variantes por tienda, y la doctrina de `roles.ts` distingue rol global vs membership. **Decisión: el catálogo se gestiona como GLOBAL** porque (a) es el diseño vigente, no una conveniencia nueva; (b) un manager de tienda no debe mutar un catálogo que afecta a tiendas de otros tenants; (c) la creación de servicios sigue scoped a la tienda activa en el RPC (el tipo global se valida, el servicio se inserta con el `store_id` del actor). Consecuencias aplicadas:

- Lectura: cualquier usuario autenticado (el selector lo necesita en cualquier tienda).
- Escritura (crear/editar/desactivar): **solo rol global `admin`** — se aplica server-side (403) y la UI muestra el modo lectura correspondiente (SR-11).
- No se implementó gestión de tipos por tienda (el soporte schema-level queda intacto y documentado como extensión futura); no se mezclaron catálogos entre tiendas.

## 7. Esquema de datos y migraciones

`supabase/migrations/20261015000001_service_types_global_acceptance.sql`:

1. **`CREATE OR REPLACE FUNCTION create_received_service_v2`** — única diferencia vs. v2.18.0 vigente: el predicado de validación acepta el tipo si pertenece a la tienda activa **o es global** (`(store_id = p_store_id OR store_id IS NULL) AND is_active = true`). Firma, seguridad (`SECURITY DEFINER`, `search_path`), auditoría, vínculos y numeración: idénticos. Reversible al 100% re-aplicando la definición anterior (documentada en el propio archivo y guardada en `scripts/mission-sr/create_received_service_v2_CURRENT.sql`).
2. **`CREATE UNIQUE INDEX IF NOT EXISTS service_types_global_name_uniq ON service_types (lower(btrim(name))) WHERE store_id IS NULL`** — defensa en profundidad contra duplicados globales; aditivo, sin riesgo de datos (los 9 tipos verificados únicos bajo el predicado), reversible con `DROP INDEX`.

**Aplicación y verificación en la base real (2026-10-15):**
- `CREATE OR REPLACE FUNCTION` → 201 OK · `CREATE UNIQUE INDEX` → 201 OK.
- `pg_get_functiondef` post-aplicación: predicado nuevo presente, predicado viejo ausente.
- Prueba lógica con `SELECT` (sin escrituras): tipo global aceptado en Central (1), match store-scoped puro correctamente inviable (0), tipo inactivo rechazado (0).
- **Recertificación del contract surface** (flujo sancionado `scripts/export-contract-surface.cjs`, que exige credenciales y nunca corre en CI): `contract-surface.sql` regenerado con las 137 funciones vivas tras la migración → `security-contract-test-static.cjs` en verde completo: Capa A 137/137 · Capa B 197 verificadas, 0 nuevas · Capa C 137/137, 0 divergencias. Sin esta recertificación, el gate de CI detecta (correctamente) `BODY_DRIFT_FROM_MIGRATION` entre el snapshot anterior y el nuevo replay — señala exactamente que la migración cambió una función certificada y exige re-certificar.

## 8. Pruebas ejecutadas y resultados exactos

**Automatizadas (locales, vitest 4.x):**

| Bloque | Archivos | Resultado |
|--------|----------|-----------|
| Nuevos — API service-types | `service-types.test.ts` | **12 passed** (lectura autenticada, usage_count solo admin, 403 no-admin, creación con trim+code derivado+store_id null, 409 duplicado case/espacio, 400 espacios/control, PATCH identidad preservada, desactivación sin borrado, 404 id inexistente) |
| Nuevos — modal de gestión | `service-types-manager.test.tsx` | **9 passed** (SR-03 creación+preselección, SR-04 duplicado sin red, SR-05 identidad, SR-06 confirm con consecuencias, SR-06b cancelación, SR-08 red fallida conserva datos, SR-11 modo lectura, SR-12 vacío, doble envío bloqueado) |
| Nuevos — icono impresora | `cash-report-icon-variant.test.tsx` | **2 passed** (RE-01 chip neutro sin bg-brand; RE-04 default brand intacto) |
| Suite completa shard 1 (api/contracts/help/hooks/lib) | 51 archivos | **656 passed, 1 skipped** |
| Suite completa shard 2 (integration/navigation/services/store/ui/unit/validation) | 80 archivos | **1.962 passed, 18 skipped** |
| Suite completa shard 3 (components) | 34 archivos | **326 passed, 5 skipped** |
| **Total** | **165 archivos** | **2.944 passed · 24 skipped · 0 failed** |

**TypeScript:** `tsc --noEmit` → 0 errores (heap ampliado; límite de memoria del contenedor local documentado).
**ESLint:** 0 errores en los archivos del cambio (3 avisos informativos de `<button>` crudo, estilo ya dominante en la vista).

**Verificación E2E en base real (tienda de pruebas TIENDA CENTRAL COSTPRO):**

| Paso | Resultado |
|------|-----------|
| Aislamiento pre-escritura (7 métricas ENERVIDA vs baseline) | ✅ SIN CAMBIOS |
| RPC con tipo global (actor service_role + p_created_by verificado, patrón idéntico al de la API) | ✅ `SRV-20261015-00053`, status 201 |
| Fila creada | `service_type_id = db47c281-…` (Transporte global), `store_id` = Central, `status=draft` |
| Ciclo sancionado draft→active→voided (RPCs `set_received_service_status` + `void_received_service_with_reversal`) | ✅ estado final `voided` (marcador `TEST-MISION-SR-2026-10-15`) |
| Aislamiento post-escritura | ✅ SIN CAMBIOS (7/7; 0 transacciones nuevas en otras tiendas) |

**Matriz SR/LP/RE/REG:**

| ID | Resultado | Evidencia |
|----|-----------|-----------|
| SR-01/02 | ⚠️ parcial | Formulario compila y selector nuevo cubierto por tests de unidad del hook/componente; **no ejecutado en navegador con sesión real** (sin credenciales en el entorno) |
| SR-03 | ✅ | test componente + test API (201 y persistencia) + E2E RPC real |
| SR-04 | ✅ | test componente (sin red) + test API (409) + índice único en BD |
| SR-05 | ✅ | test API (id inmutable en update) + test componente |
| SR-06 | ✅ | test componente (confirm con consecuencias, historial intacto) + test API (is_active sin borrado) |
| SR-07 | ✅ (por diseño + test) | el catálogo se recarga del servidor (`onRefresh` → refetch); persistencia verificada en API/E2E |
| SR-08 | ✅ | test componente: error visible, formulario conserva datos, reintento posible |
| SR-09 | ✅ | test componente doble envío + guard `submitting` + rate-limit server-side |
| SR-10 | ✅ (por diseño) | catálogo global compartido; creación sigue scoped a tienda activa (RPC valida store+actor; probado en E2E) |
| SR-11 | ✅ | 403 server-side testeado + modo lectura UI testeado |
| SR-12 | ✅ | test componente estado vacío útil |
| SR-13 | ⚠️ parcial | modal hereda `BaseModal` (mobile-first, max-h 90vh, flex, targets 44px, `max-w-xl`); sin inspección visual con sesión real |
| LP-01 | ✅ | captura post-cambio desktop y móvil: solo escudo en la esquina, CostPro grande intacto |
| LP-02/03 | ✅ | prueba programática: `dark+mode-performance+mode-enhanced` en `<html>` → color del wordmark y fondo del landing idénticos (blindaje `#landing-root` + `landing-shield.css` ya vigente, no se tocó) |
| LP-04 | ✅ | captura móvil 390px equilibrada, sin desplazamientos |
| RE-01 | ✅ | test chip neutro (sin bg-brand) |
| RE-02/03/04 | ✅ | tokens semánticos (`bg-muted/text-muted-foreground`) válidos en los 4 estados; default `brand` intacto para el resto (test RE-04) |
| RE-05 | ✅ | el chip no es interactivo; los botones Generar/Exportar conservan sus estados y no se tocaron |
| REG-01 | ✅ | suite completa 2.944 passed / 0 failed; TS 0 errores; servidor local `GET / → 200` tras los cambios |

**Ejecutados pero omitidos localmente:** build de producción (OOM del contenedor local de 4 GB — runner de CI es la autoridad; ver §15). Ninguna prueba fue desactivada ni saltada para lograr verde.

## 9. Capturas del formulario y de la gestión de tipos

El entorno local no dispone de credenciales de sesión (`ENABLE_DEV_BYPASS=false`), por lo que **no hay capturas de navegador de las vistas internas**; se declara expresamente y no se simulan. La cobertura visual-equivalente son los 23 tests nuevos (render jsdom con aserciones de presencia de controles, estados, errores y flujos). Los accesos quedan así implementados: selector de chips desde el catálogo + botón «Gestionar tipos» junto a la etiqueta; el modal de gestión lista el catálogo con badge Activo/Inactivo, contador de uso y acciones (admin) Agregar/Editar/Desactivar-Reactivar.

## 10. Comparación del landing antes/después

- **Antes:** nav superior izquierda = escudo + «CostPro» pequeño (`BrandWordmark` `text-lg`), duplicando el `<h1>` gigante del hero visible en el mismo viewport.
- **Después:** nav superior izquierda = escudo únicamente (chip 8×8 con borde verde, `aria-hidden`); «CostPro» vive solo en el `<h1>`. Nav (Cómo funciona · Funciones · Precios · FAQ) y drawer móvil intactos.
- **Capturas post-cambio:** `download/screenshots/landing_despues_desktop.png` (1440×900) y `landing_despues_movil.png` (390×844): equilibrio sin huecos ni desplazamientos en ambos tamaños.
- El drawer móvil conserva su wordmark por diseño (superficie de navegación independiente, no competidora del hero).

## 11. Comparación del icono de impresora Dark+Enhanced antes/después

- **Antes:** chip `bg-brand text-brand-foreground` → Dark+Enhanced: fondo `#39ff14` (neón) con icono `#052e16`. La intensidad no venía de una regla de Enhanced sino de la ausencia de moderación: Enhanced no redefine `--brand` (Performance sí, a `#fafafa`).
- **Después:** chip `bg-muted text-muted-foreground border border-border/40` (variante `neutral`): gris discreto en los 4 estados visuales, sin semántica de éxito ni de marca. Solo Reporte Entrega lo usa; las demás 8 vistas con icono conservan `brand` (regresión cubierta por test).
- **Ruta del color corregida en el origen:** token de diseño (`PageHeader` → `iconVariantMap`), no un parche CSS puntual.

## 12. Resultados de pruebas de regresión

Ver §8: 165 archivos / 2.944 passed / 0 failed (incluye los contratos previos del módulo: `v2-18-0-servicios-arqueo-contract.test.ts` y `received-services-authz.test.ts`, intactos y en verde — el contrato del POST no cambió, `service_type_id` ya estaba aceptado). Datos comerciales ajenos a la prueba: **cero alteraciones** (única escritura: servicio de prueba en tienda de pruebas, anulado y marcado; ENERVIDA 7/7 antes y después).

## 13. Riesgos residuales

1. **Tipos históricos sin FK:** los servicios creados antes de este cambio tienen `service_type_id = NULL`; el contador de uso subestima su cantidad. Mitigación posible fuera de alcance: backfill por coincidencia de nombre (no ejecutado para no alterar registros históricos).
2. **Gestión del catálogo limitada a admin global:** un manager de tienda que necesite una categoría debe solicitarla; el diseño por-tienda existe en schema pero no tiene UI (documentado, no improvisado).
3. **Residuo de prueba:** 1 servicio anulado `SRV-20261015-00053` (proveedor `TEST-MISION-SR-2026-10-15`) en la tienda de pruebas Central, trazable y anulable-visible; no interfiere en listados activos por defecto.
4. **SR-01/02/13 sin sesión real:** cubiertos por tests automatizados; recomendada una pasada manual con credenciales al desplegar.
5. **Build local:** el contenedor de 4 GB no completa `next build` (OOM conocido de este entorno); la autoridad del build es CI.
6. El modo Enhanced sigue sin modular `--brand` para el resto de vistas por diseño — fuera de alcance ampliar esa decisión global.

## 14. Puntuaciones de calidad justificadas (ISO/IEC 25010 · OWASP ASVS · WCAG 2.2 AA)

| # | Dimensión | Puntuación | Justificación |
|---|-----------|-----------|---------------|
| 1 | Funcionalidad de Servicios Recibidos | 9,0 | Flujo completo verificado (crear/activar/anular/recalcular/pagos/vínculos) con suite verde; sin verificación manual con sesión real. |
| 2 | Gestión de tipos de servicio | 9,5 | CRUD+desactivación desde la fuente oficial, validaciones dobles (UI+API+índice), preselección inmediata; 21 tests nuevos. Descuento mínimo: sin backfill de FK históricas. |
| 3 | Integridad y aislamiento multitienda | 9,5 | Creación scoped a tienda activa (RPC valida actor+store), catálogo global por diseño documentado, usage_count restringido a admin, E2E con aislamiento 7/7 antes/después. |
| 4 | Seguridad | 9,0 | Gates server-side (403 no-admin), Zod en entrada, rate-limit, service-role solo tras gate, RLS intacta, sin exposición de internals en mensajes. Pendiente: revisión OWASP completa excede el alcance. |
| 5 | Fiabilidad y manejo de errores | 9,0 | Estados de carga/error/vacío, doble envío bloqueado, éxito solo tras persistencia confirmada, fallo de red conserva datos (testeado). |
| 6 | UX y accesibilidad | 8,5 | Targets ≥44px, labels/aria (radiogroup, aria-invalid, role=alert), mensajes comprensibles, focus modal vía BaseModal; descuento por no validar contraste/teclado en navegador con sesión real. |
| 7 | Calidad responsive | 8,5 | BaseModal mobile-first heredado, chips con wrap, capturas móviles del landing correctas; sin inspección interna con sesión. |
| 8 | Aislamiento visual del landing | 10 | Blindaje preexistente (`#landing-root`) verificado programáticamente: colores idénticos con dark+enhanced+performance aplicados; el cambio fue local a la nav sin tocar el escudo. |
| 9 | Coherencia Reporte Entrega Dark+Enhanced | 9,0 | Chip neutro con tokens oficiales, sin regresión en light/dark/performance ni en otras vistas (test); corrección en el origen (token), no parche. |
| 10 | Cobertura y calidad de pruebas | 9,0 | +23 tests significativos, suite completa 2.944/0, sin tests desactivados; descuento: sin pruebas E2E de navegador para el flujo interno autenticado. |

**Evaluación de conformidad (no certificación):** adecuación funcional y fiabilidad conformes; seguridad con controles ASVS relevantes aplicados en los endpoints tocados; accesibilidad AA en lo verificable por markup (contrastes de tokens vigentes en el proyecto). Ningún 10/10 en dimensiones con verificación pendiente de navegador; el 10 de aislamiento del landing está respaldado por prueba objetiva programática.

## 15. Rama, commits, PR, CI y despliegue real

- **Rama:** `feat/servicios-recibidos-tipos-configurables` (desde `main` @ `986ac13ed`, que ya incluye los PR #1406, #1407 y #1408 mergeados).
- **PR:** creado contra `main` (ver cabecera del PR para el número y el estado de CI en vivo).
- **CI:** la verificación de build/typecheck/lint/test de producción corresponde al runner de GitHub Actions del PR (el build local excede la memoria del contenedor). El estado exacto (6 checks del repo) se consulta en el PR al cierre.
- **Migración:** ya aplicada en la base de datos de producción (functión-only + índice aditivo, justificada en §7 y reversible). **El código de este PR aún no está en producción** hasta que el PR se mergee y Vercel despliegue `main`; esta distinción se mantiene explícita.
