# CP-ORG-003 — Expediente de auditoría: paridad `tenant_admin` entre escritorio y móvil

**Fecha:** 2026-10-26 · **Tipo:** AUDITORÍA Y DIAGNÓSTICO (solo lectura — sin cambios de código, sin migraciones, sin escrituras, sin merge)
**SHA auditado:** `48ffecfa1459a7f105d271e78644b0bd1fc68247` = `origin/main` (fusión del PR #1488, 2026-10-25T18:52:16Z) · **Rama base:** `main`
**Estado inicial verificado:** 0 PRs abiertos; CP-ORG-002 íntegro (fusión del PR #1486 presente en el SHA; 156/156 pruebas de navegación/caja/roles en verde re-ejecutadas para esta auditoría); producción (`costpro4.vercel.app`) sirviendo el mismo SHA (HTTP 200).

---

## 1. Alcance y método

Investigación de la diferencia de navegación escritorio↔móvil para `tenant_admin`. Trazabilidad completa del rol por análisis estático (61 ocurrencias en 19 archivos `src/` + 4 migraciones), verificación empírica mediante pruebas scratch locales (ejecutadas y eliminadas — sin commit; resultados en §5) y re-ejecución de las suites existentes relevantes. Cero escrituras productivas; cero overrides de rol; cero migraciones.

## 2. Trazabilidad del rol `tenant_admin` (mapa completo)

| Superficie | Archivo:línea | Tratamiento de `tenant_admin` |
|---|---|---|
| Enum DB `user_role` | `supabase/migrations/20260806000002_v2_15_2_user_role_tenant_admin.sql:11` (Iteración 13, N-C1) | Valor del enum; rol de NEGOCIO del tenant (no de plataforma: `20261026130000:28-32`) |
| Auto-provisionamiento signup | `20260806000004_v2_15_4_on_auth_user_created_tenant.sql:53-93` + `src/components/auth/RegisterForm.tsx:141-147` | Crea tenant (company_name) + perfil `tenant_admin` — **SIN tienda y SIN membresía** |
| Jerarquía declarada | `src/lib/roles.ts:50-53` | `tenant_admin: ['tenant_admin','manager','encargado','clerk','warehouse','usuario','costo']` — comentario: «Alcance operativo equivalente a encargado; el acceso transversal NO le corresponde» |
| `hasRole` | `src/lib/roles.ts:91-115` | Paso 4 (jerarquía) **SOLO** aplica a `admin`/`superadmin` (l.107-109) — la jerarquía de `tenant_admin` NO se expande. Paso 3 (l.101) considera **membresías activas** |
| `isAdminLevel` | `src/lib/roles.ts:79-81` | Excluido (`admin`‖`superadmin`); espejo EXACTO de `is_admin()` DB |
| `getAllowedRoles` | `src/lib/roles.ts:83-86`; único consumidor `useUsersView.ts:413` | Devuelve la jerarquía declarada — solo para el formulario de usuarios (vista no accesible a `tenant_admin`) |
| `can*` por tienda | `src/lib/roles.ts:137-257` | Sin bypass global: requieren membresía activa (verificado §5-D) |
| Catálogo desktop (fuente única) | `src/config/navigation/navigation-definition.ts` — 41 listas `roles:` | **`tenant_admin` NO aparece en NINGUNA lista** (ni secciones ni hojas) |
| Filtro sidebar desktop | `src/config/navigation/sidebar.structure.ts:78-96` (`filterModulesByRole`) + `src/hooks/ui/useFilteredNavigation.ts:19-29` + `Sidebar.tsx:105` | Estricto por ROL GLOBAL; ignora membresías; `effectiveNavRole('tenant_admin')='tenant_admin'` (l.66-70) |
| Guard de vistas (ambos superficies) | `sidebar.structure.ts:115-152` + `TerminalShell.tsx:454` | Estricto por catálogo: `tenant_admin` denegado en toda vista con `roles:` (verificado §5-G) |
| Filtro sheet móvil «Más» | `src/components/views/terminal/MobileTabBar.tsx:84` (`roleOk = hasRole`) | **Doctrina distinta**: jerárquico + membresías → diverge del desktop y del guard (§4) |
| Tabs fijos móviles | `navigation-definition.ts:1398-1403` (type sin campo `roles`), `1411-1451` (Vender/Recibir/Inventario/Caja), `MobileTabBar.tsx:375-412` | **SIN gate de rol**: visibles para cualquier sesión |
| Command Palette | `src/config/actions.ts:88` (`effectiveNavRole` desde CP-ORG-002) | Estricto por rol global — consistente con desktop/guard |
| Hubs/tabs (desktop) | `GroupHubView.tsx:85`, `SectionHubView.tsx:134`, `ManagementHubView.tsx:198,260` | Estricto (CP-ORG-002) — consistente con guard |
| Vista Caja (puertas UI) | `CashClosureView.tsx:231-237` | `['admin','superadmin','manager','encargado'(+clerk isAuthorized)]` por ROL GLOBAL — sin `tenant_admin` (ver §4-D6) |
| Sesión client | `src/contracts/user.ts:67-86` (`roles:[p.role]`) | `user.roles = ['tenant_admin']` |
| Sesión server | `src/lib/auth.ts:95`; enriquecimiento `auth-middleware.ts:237-284` | Perfil + **membresías reales** → `hasRole` server-side (l.261-275) |
| `/api/stores` | `src/app/api/stores/route.ts:54-153` (GET), `467` (POST `withRole('admin')`) | GET: solo tiendas con membresía activa (no-admin). POST: `withRole('admin')` vía `hasRole` con membresías |
| `/api/users` | `src/app/api/users/route.ts:91` | **403** para `tenant_admin` (solo admin/superadmin/encargado) |
| `/api/organizations` | `src/app/api/organizations/route.ts:85` (GET), `393` (POST `withRole('superadmin')`) | **403** para `tenant_admin` |
| RPC usuarios | `managed_update_user` `20261026130000:57-59` | Caller `NOT IN (admin, superadmin)` → error |
| RPC caja | `has_store_role_as` `20260807000002_v2_16_2:29-42` | Bypass plataforma (`admin`/`superadmin`) **o** membresía activa con rol del array `p_roles` |
| RPC bootstrap tienda | `create_store_with_membership` `20260806000005_v2_15_5:46-93` | Resuelve tenant del caller, crea tienda + **membresía admin del creador** (l.80-82). Único caller: `POST /api/stores` (`route.ts:238`) — gate `withRole('admin')` |
| RLS tiendas | `stores_tenant_select` `20261026120000:151-163` | `tenant_admin`: solo vía membresías (no `is_admin()`); aislamiento por tenant vía trigger de membresías |
| Pruebas existentes | `superadmin-navigation-regression.test.ts:166-171,345-353`; `roles-superadmin.test.ts:75-79`; `gate1-navigation.test.ts` | Ver §5 |

## 3. Matriz de permisos — 5 niveles NO equivalentes

Niveles diferenciados por la misión: (1) visible en menú, (2) accesible por navegación/URL directa, (3) acción permitida por la interfaz, (4) autorizada por el servidor, (5) permitida por RLS. **Verificación empírica** (pruebas scratch §5 + estático).

### 3.1 `tenant_admin` PURO (self-signup reciente: sin tienda, sin membresía — el estado que crea el trigger de Iteración 13)

| Superficie | Escritorio | Móvil | Backend/RLS | Evidencia |
|---|---|---|---|---|
| Menú y secciones | Sidebar = `['ayuda']` + INICIO fijo (síntoma idéntico al bug SuperAdmin de CP-ORG-002) | Sheet «Más» = INICIO + AYUDA **+ 4 tabs fijos visibles sin gate** | n/a | Scratch F/I + `filterModulesByRole` vs `roleOk` |
| Acceso a vistas (guard) | `pos/inventory/cash/reception_list/users/…` → **AccessDenied** | **Idéntico** (mismo guard en `TerminalShell:454`) | n/a | Scratch G |
| Gestión de usuarios | Oculta + guard niega + **API 403** | Oculta (sheet) + guard niega + API 403 | `route.ts:91` 403; RPC `managed_*` deniega | §3.1 líneas API |
| Gestión de tiendas (crear) | Oculta (`management-hub` roles `['admin','manager','encargado']`, l.499) + guard niega | Oculta en sheet + guard niega | **POST 403** (`withRole('admin')`: `hasRole` sin membresía admin = false) | `route.ts:467` |
| Cambio de tienda | Selector vacío (API devuelve `[]` sin membresías) | Idéntico (mismo `/api/stores` GET) | GET membership-scoped (`route.ts:138-152`) | API GET |
| Operaciones de caja | Vista negada por guard (antes de llegar a las puertas UI) | Idéntico + tab «Caja» visible → tap → AccessDenied | `close_cash_shift`: sin membresía → false | Scratch G + `has_store_role_as` |
| Otras organizaciones | Sin ruta | Sin ruta | `/api/organizations` 403; RLS `stores_tenant_select` niega transversal | `route.ts:85`, política 151-163 |

**Efecto neto:** el `tenant_admin` puro queda **varado** en INICIO+AYUDA en AMBAS superficies, sin ruta para crear su primera tienda pese a que el RPC `create_store_with_membership` fue diseñado exactamente para eso (§6-D4).

### 3.2 `tenant_admin` CON membresía `admin` activa en una tienda de su tenant (asignada por staff)

| Superficie | Escritorio | Móvil | Backend/RLS | Evidencia |
|---|---|---|---|---|
| Menú y secciones | **SIN CAMBIO**: sidebar `['ayuda']`+INICIO (el filtro desktop ignora membresías) | **Sheet «Más» muestra TODO**: OPERACIÓN, ANÁLISIS, **SISTEMA**, **EN DESARROLLO**, AUDITORÍA — porque `hasRole(user,'admin')=true` vía membresía (paso 3) y toda sección lista `'admin'` | n/a | Scratch I + dump matrix |
| Acceso a vistas (guard) | Deniega todo lo gated (igual que 3.1) | **Deniega al tap** las entradas extra visibles → **visible-denied** | n/a | Scratch G/I |
| Gestión de usuarios | Igual que 3.1 (403) | Igual (403) | Igual | `route.ts:91` |
| Gestión de tiendas (crear) | Oculta + guard niega | Oculta en sheet + guard niega | **POST AUTORIZA** (`withRole('admin')` via membresía admin) — sin camino UI | `route.ts:467` + `hasRole` paso 3 |
| Cambio de tienda | Sus tiendas con membresía (consistente) | Idéntico | GET membership-scoped | API |
| Operaciones de caja | Guard niega la vista `cash`; además puertas UI (rol global) negarían | Tab «Caja» → guard niega | **`close_cash_shift` AUTORIZA** con membresía admin en esa tienda — sin camino UI (asimetría inversa a la superficie 6 de CP-ORG-002) | `CashClosureView:231-237` vs `has_store_role_as` |
| Otras organizaciones | Sin ruta | Sin ruta | 403 + RLS niega | igual que 3.1 |

## 4. Discrepancias confirmadas (con evidencia)

- **D1 — Tres doctrinas de filtrado en una sola app.** Sheet móvil (`MobileTabBar.tsx:84`, `hasRole` con membresías) ≠ sidebar desktop (`sidebar.structure.ts:78-96`, rol global estricto) ≠ guard (`:115-152`, estricto). Efecto verificado: con membresía `admin`, el móvil muestra SISTEMA/EN DESARROLLO/AUDITORÍA que desktop oculta y el guard deniega al tap. **Clase general**: cualquier rol global bajo con membresía alta (p.ej. `clerk` global con membresía `admin`) ve SISTEMA en el sheet móvil — visible-denied.
- **D2 — Tabs fijos móviles sin gate.** `MobileMainTab` (type `navigation-definition.ts:1398-1403`) no tiene `roles`; `DefaultTabs` (`MobileTabBar.tsx:375-412`) renderiza incondicional. `tenant_admin` (y `costo`) ven Vender/Recibir/Inventario/Caja; tap → AccessDenied. Contradice el principio GATE 1 §8/§9 («cero destinos muertos por construcción») — los IDs muertos se eliminaron, pero los **visibles-denegados por rol** persisten.
- **D3 — Claim impreciso en CP-ORG-002 §6 y en comentarios de prueba.** «móvil, vía hasRole/jerarquía, sí le muestra el alcance operativo» es **FALSO para `tenant_admin` puro** (verificado: sheet = INICIO+AYUDA). La «jerarquía» de `ROLES_HIERARCHY['tenant_admin']` NO se consume en `hasRole` (paso 4 solo admin/superadmin — la declaración está muerta para `hasRole`). Con membresías el alcance aparece **por el paso 3**, no por jerarquía. Afecta a `CP_ORG_002_NAVEGACION_SUPERADMIN.md` §6 y a los comentarios de `superadmin-navigation-regression.test.ts:166-171,345-353` (las assertions en sí son correctas; los comentarios no).
- **D4 — Bootstrap de `tenant_admin` bloqueado pese al diseño de Iteración 13.** El trigger crea tenant+perfil SIN tienda/membresía; el RPC `create_store_with_membership` resuelve el tenant del caller, crea la tienda y auto-asigna membresía **admin** (diseñado como bootstrap self-service), pero su único caller (`POST /api/stores`) exige `withRole('admin')` → 403 para el `tenant_admin` puro; sin ruta UI alternativa (management-hub gated). El «admin auto-provisionado de SU tenant» no puede materializar su tenant.
- **D5 — Regresión no documentada de la Iteración 13 sobre self-signups.** Antes del cambio `costo`→`tenant_admin` (`RegisterForm.tsx:141`), el self-signup (`costo`) veía el módulo COSTO (`'costo'` SÍ está en las listas del catálogo) + AYUDA; ahora solo INICIO+AYUDA. Ningún expediente documenta esta pérdida como decisión.
- **D6 — Asimetrías UI↔RPC en caja (contexto, clase pre-existente).** Puertas UI por rol GLOBAL (`CashClosureView.tsx:231-237`): `tenant_admin`+membresía admin → UI niega / RPC autoriza; `encargado` GLOBAL sin membresía → UI muestra / RPC niega (requiere membresía). Misma familia que la superficie 6 de CP-ORG-002, con el caso `tenant_admin` en sentido inverso.
- **D7 — Hueco de pruebas.** No existe suite alguna de paridad del `MobileTabBar` (filtros del sheet/tabs por rol). La cobertura de navegación existente (gate1, superadmin-regression) solo ejercita desktop+guard.

## 5. Pruebas y evidencia de ejecución

| Prueba | Estado | Resultado |
|---|---|---|
| `gate1-navigation.test.ts` (109) | EJECUTADA | 109 ✓ (guard/catálogo/integridad fuente única) |
| `superadmin-navigation-regression.test.ts` (27) | EJECUTADA | 27 ✓ (incluye assertions `tenant_admin` sin SISTEMA transversal: correctas) |
| `caja-navigation.test.ts` (7) | EJECUTADA | 7 ✓ (puertas CashClosure) |
| `roles-superadmin.test.ts` (8) + `roles-is-admin-level.test.ts` (5) | EJECUTADA | 13 ✓ (isAdminLevel excluye tenant_admin; schema no degrada) |
| Scratch CP-ORG-003 A-I (9 assertions semántica `tenant_admin`) | EJECUTADA, luego ELIMINADA (sin commit) | 9/9 ✓ — hasRole puro/membresías, can* por tienda, desktop `['ayuda']`, guard, sheet móvil simulado con la lógica REAL de producción |
| Scratch matrix dump (volcado de visibilidad por superficie) | EJECUTADA, luego ELIMINADA | dump completo en §3 (réplica exacta de `filterModulesByRole` y del `roleOk` de `MobileTabBar`) |
| Suites LIVE-DB (`organizations-create-live-db`, `superadmin-store-access-live-db`, etc., 66 skips) | OMITIDA | Sin credenciales E2E en sandbox (política del repo) — comportamiento DB verificado por lectura estática de migraciones vigentes |
| Validación productiva con sesión `tenant_admin` | NO EJECUTADA | No existe cuenta `tenant_admin` autorizada para esta auditoría (crear una sería escritura productiva — prohibido). El comportamiento de navegación queda demostrado por las pruebas scratch con la lógica REAL importada del repo |

**Comportamientos comprobados por ejecución:** todos los de la matriz §3 (filtros, guard, hasRole, can*).
**Comportamientos inferidos por análisis estático:** RLS/RPC (migraciones vigentes, no ejecutadas contra DB productiva en esta auditoría).
**Áreas no verificadas:** sesión real `tenant_admin` en producción; conducta del sheet móvil en dispositivo físico (la simulación usa los módulos reales del repo, no un navegador móvil).

## 6. Validación de seguridad

- **Alcance:** `tenant_admin` es ORGANIZACIONAL (su tenant). Verificado CONSISTENTE en el nivel de autorización: `/api/users` 403 · `/api/organizations` 403 · RPC `managed_*` exige caller admin/superadmin · RLS `stores_tenant_select` niega transversal (no `is_admin()`) · membresías cross-tenant rechazadas por trigger (misión organizaciones). **Ninguna fuga de autorización detectada.** Todas las divergencias son de wayfinding (nivel menú), jamás de autorización efectiva.
- **Sin normalizaciones arriesgadas:** `effectiveNavRole` no toca `tenant_admin` (verificado); `isAdminLevel`/`is_admin()` lo excluyen; la asimetría jerárquica admin≠superadmin se conserva. CP-ORG-002 permanece ÍNTEGRO (156/156 pruebas relevantes en verde sobre el SHA auditado).
- **Única superficie server-side sensible (pre-existente, no específica del rol):** `withRole('admin')` satisface con CUALQUIER membresía `admin` activa sin acotar por tienda (paso 3 de `hasRole`) — p.ej. POST/DELETE `/api/stores`. Comportamiento de diseño del modelo de membresías; documentado aquí como contexto, sin modificación.
- **Restricciones de la misión respetadas:** cero escrituras, cero overrides de rol, cero migraciones, cero cambios de código (los archivos scratch se ejecutaron y eliminaron sin commit).

## 7. Conclusión

**Conclusión A + C (matizada):**

- **A — DEFECTO CONFIRMADO (inconsistencia funcional de wayfinding):** la diferencia escritorio↔móvil para `tenant_admin` es REAL y contradice reglas internas documentadas: (i) GATE 1 §8/§9 proclama «misma fuente única» pero los FILTROS difieren (D1) y producen entradas visibles-denegadas que esa regla prohíbe por construcción (D2); (ii) el claim del expediente CP-ORG-002 §6 («móvil muestra el alcance operativo vía jerarquía») queda **desmentido empíricamente** para el `tenant_admin` puro (D3); (iii) el bootstrap diseñado en Iteración 13 es inalcanzable (D4). **NO hay defecto de autorización**: servidor, guard, RLS y RPC niegan de forma coherente y restrictiva en ambas superficies.
- **C — EVIDENCIA INSUFICIENTE para la semántica objetivo:** qué DEBE ver/hacer `tenant_admin` (¿alcance operativo equivalente a encargado como sugiere `roles.ts:50-53`? ¿bootstrap self-service de primera tienda? ¿gestión de usuarios de su organización?) **no está definido con autoridad en ningún expediente, prueba o migración**. La única declaración de intención (el comentario de la jerarquía) está sin implementar y es ambigua para navegación. Por restricción explícita de esta misión («no ampliar permisos para conseguir paridad visual»), **no corresponde implementar alcance nuevo sin decisión del propietario**.

## 8. Propuesta mínima (Fase 1 — paridad segura, SIN ampliar permisos)

Restaurar la paridad **alineando el móvil con el guard canónico** (el más restrictivo), nunca al revés:

1. `src/components/views/terminal/MobileTabBar.tsx`: sustituir `roleOk = hasRole(...)` (l.84) por el filtro estricto canónico por ROL GLOBAL (reutilizar `effectiveNavRole` + listas del catálogo — la misma doctrina de `filterModulesByRole`), y derivar los grupos del sheet del MISMO árbol filtrado que desktop.
2. Tabs fijos: filtrar `MOBILE_MAIN_TABS` por `isViewAllowedForRole(tab.id, user.role)` — ocultar Vender/Recibir/Inventario/Caja a roles sin acceso (tenant_admin puro, costo).
3. Documentación: corregir `CP_ORG_002_NAVEGACION_SUPERADMIN.md` §6 y los comentarios de prueba (D3); documentar la regresión D5.
4. **Pruebas de regresión nuevas (Fase 1):** paridad sheet==sidebar==guard para `tenant_admin` puro/con membresía, `costo`, `clerk`+membresía admin (cero visible-denied); contrato del sheet = hojas del filtro desktop; tabs fijos respetando el guard.
5. **Riesgos:** BAJO — solo se OCULTAN entradas muertas (todo visible-denied); nadie puede usar hoy esas entradas (el guard las niega), luego no hay pérdida de capacidad. Riesgo residual: usuarios con membresías que hoy aprovechan el sheet para entradas permitidas por su ROL GLOBAL — esas se conservan por construcción (el filtro estricto las incluye). `useTerminalNavigation` queda como lookup de título (documentar su rol vestigial o alinearlo también).

**Fase 2 (NO implementar sin decisión):** habilitar el alcance del `tenant_admin` (navegación operativa encargado-nivel de sus tiendas con membresía, bootstrap de primera tienda vía `create_store_with_membership` con gate `tenant_admin`-para-su-tenant con cuota, gestión de usuarios de su org con scope `tenant_id`). Requiere diseño propio con pruebas de seguridad y PR separado.

## 9. Decisión requerida del propietario (antes de cualquier implementación)

1. **Navegación operativa:** ¿`tenant_admin` debe ver/usar OPERACIÓN y ANÁLISIS (alcance «equivalente a encargado» según `roles.ts:50-53`) en AMBAS superficies — hoy no ve ninguno — o el alcance solo se habilita mediante membresías asignadas por el staff de la plataforma?
2. **Bootstrap self-service:** ¿debe existir un flujo de primera tienda para `tenant_admin` que use el RPC ya diseñado (`create_store_with_membership`: tenant del caller + membresía admin automática + cuota por plan)? ¿Con qué límites?
3. **Gestión de usuarios de su org:** ¿debe `tenant_admin` gestionar usuarios de SU organización (hoy `/api/users` 403 y vista negada)? En tal caso, ¿con qué roles asignables y con qué scope estricto `tenant_id`?
4. **Paridad móvil (Fase 1):** ¿se aprueba alinear el sheet móvil y los tabs fijos al guard canónico (solo OCULTA entradas visibles-denegadas; no cambia autorización)? Nota: la clase afecta a todos los roles con membresías ≥ rol global, no solo `tenant_admin`.
5. **Regresión Iteración 13:** ¿el self-signup debía conservar el acceso al módulo COSTO que tenía con el rol `costo` anterior? (hoy solo ve INICIO+AYUDA).

---

*Auditoría de solo lectura sobre `main @ 48ffecfa1`. Sin modificaciones de código, datos, configuración productiva, migraciones, PR de implementación, fusiones ni despliegues. Los archivos scratch de verificación se ejecutaron contra los módulos reales del repositorio y se eliminaron sin commit; sus resultados están reproducidos en §3/§5.*
