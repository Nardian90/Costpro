# CP-ORG-002 — Expediente: restauración de la navegación completa del SuperAdmin

**Fecha:** 2026-10-26 · **Rama:** `fix/cp-org-002-navegacion-superadmin-20261026` · **Base:** `main` @ `acc699cee`
**Incidente reportado por el propietario:** tras las correcciones de CP-ORG-001 (PR #1484 mergeado, migraciones 20261026170000/20261026180000 aplicadas), el SuperAdmin (`admin@demo.com`) ya puede acceder y seleccionar tiendas, pero el menú lateral solo muestra **Inicio** y **Ayuda** — no es posible navegar al resto de los módulos.

---

## 1. Causa raíz confirmada (con evidencia de código)

**RC única, frontend.** El constructor del menú lateral filtra el catálogo con comparación
estricta de rol:

```ts
// src/config/navigation/sidebar.structure.ts (ANTES, línea 64)
return mod.allowedRoles.includes(role);   // rol crudo: 'superadmin'
```

El catálogo canónico (`src/config/navigation/navigation-definition.ts`, fuente única GATE 1)
declara TODAS las listas `roles:` con `'admin'` pero **ninguna** incluye `'superadmin'`
(el rol de plataforma se creó con la misión organizaciones y se activó en la cuenta
designada en CP-ORG-001, ciclo 4). Con `user.role === 'superadmin'`, cada sección con
`roles` declaradas (OPERACIÓN, ANÁLISIS, SISTEMA, EN DESARROLLO) resultaba filtrada y solo
sobrevivían los elementos de acceso universal: **INICIO** (ítem fijo sin roles) y **AYUDA**
(sección sin roles) — exactamente el síntoma reportado.

La normalización `superadmin → admin` **ya existía** pero SOLO en el guard de vistas
(`isViewAllowedForRole`, línea 104 de la misión organizaciones 2026-10-26): las rutas y el
móvil funcionaban, pero el sidebar (y las superficies derivadas con el mismo patrón) nunca
la recibieron. La asimetría se materializó al promover la cuenta de `admin` a `superadmin`.

**Superficies afectadas por el mismo defecto de clase** (`reconoce 'admin' pero no
'superadmin'`):

| # | Superficie | Archivo:línea (antes) | Efecto en SuperAdmin |
|---|---|---|---|
| 1 | Sidebar desktop (constructor del menú) | `sidebar.structure.ts:64` | Menú = Inicio + Ayuda (síntoma) |
| 2 | Command Palette ⌘K | `config/actions.ts:86` | Acciones administrativas filtradas |
| 3 | GroupHubView (tarjetas de hub raíz) | `GroupHubView.tsx:83` | Tarjetas con roles ocultas |
| 4 | SectionHubView (tarjetas de sub-hub) | `SectionHubView.tsx:132` | Ídem |
| 5 | ManagementHubView (tabs del hub Gestión de Tiendas) | `ManagementHubView.tsx:196,255` | Tabs con roles ocultos |
| 6 | CashClosureView (vista Caja) | `CashClosureView.tsx:227,232` | **AccessDenied** al módulo completo pese a que el servidor lo autoriza |

**Verificación server-side del punto 6:** el RPC `close_cash_shift` autoriza vía
`has_store_role_as(v_caller_uid, store, ARRAY['admin','manager','encargado'])`, cuya
definición (migración `20260807000002`) incluye el bypass de plataforma
`profiles.role IN ('admin','superadmin') → true`. La UI negaba con `AccessDenied` un módulo
que la DB autoriza — defecto de la misma clase, corregido como espejo exacto del bypass
server-side existente (sin tocar la DB ni ampliar a roles operativos).

**Descartado explícito:** no hay defecto en la DB ni en las migraciones productivas
(los 12/12 LIVE E2E de CP-ORG-001 c5 siguen vigentes; RLS/trigger intactos). El flujo de
sesión entrega `role='superadmin'` limpio (`mapProfileToContract` → `useAuthStore`), sin
dependencia de membresías — la cuenta de plataforma no lleva membresías por diseño (§6 de
la activación).

## 2. Corrección — regla centralizada, no excepciones por componente

La MISMA regla que `isViewAllowedForRole` aplicaba inline se extrajo a función canónica
exportada y se aplicó en todos los filtros de navegación:

```ts
// src/config/navigation/sidebar.structure.ts (DESPUÉS)
export function effectiveNavRole(role: string): string;
export function effectiveNavRole(role: string | null | undefined): string | null | undefined;
export function effectiveNavRole(role: string | null | undefined): string | null | undefined {
  return role === 'superadmin' ? 'admin' : role;
}
```

Aplicada en: `filterModulesByRole` (sidebar), `isViewAllowedForRole` (guard, ahora delega
en la canónica), `getActionsForUser` (palette), `GroupHubView`/`SectionHubView` (tarjetas),
`ManagementHubView` (tabs), y `CashClosureView` (`'superadmin'` en las puertas UI, espejo
del bypass DB documentado). **Cero cambios** en el catálogo, en las rutas, en las políticas
RLS, en las migraciones y en las autorizaciones server-side. La jerarquía de seguridad no
se degrada: el menú es wayfinding; la autorización efectiva sigue en backend/RLS.

## 3. Pruebas (38 nuevas, todas ejecutadas y en verde)

- `src/__tests__/navigation/superadmin-navigation-regression.test.ts` (27): reproducción
  exacta del fallo (menú ≠ ['ayuda']), paridad superadmin==admin por hojas, catálogo↔rutas
  (cero enlaces rotos/duplicados/ficticios), guard de URL directa (clerk/costo/tenant_admin
  sin SISTEMA; sin sesión → deny), palette (superadmin == admin; clerk sin acciones admin),
  `useFilteredNavigation` con renderHook: carga optimista (menú nunca vacío), sesión sin rol,
  login→sesión (sin colapso), **cambio de tienda sin mezcla de contexto**, clerk restringido.
- `src/__tests__/components/sidebar-superadmin-navigation.test.tsx` (6): **el Sidebar REAL
  montado** — SuperAdmin ve INICIO+OPERACIÓN+ANÁLISIS+SISTEMA+AYUDA+EN DESARROLLO (con y sin
  tienda activa, sin membresías); admin idéntico; clerk/costo restringidos; cambio de tienda
  estable.
- `src/__tests__/components/group-hub-superadmin.test.tsx` (5): hub SISTEMA real montado —
  SuperAdmin ve las 8 tarjetas (Ajustes…Cierre Fiscal), idéntico a admin; guard contra roles
  operativos verificado por el mecanismo real (`isViewAllowedForRole`).

**Batería final del head:** `tsc --noEmit` 0 errores · `eslint` 0 errores (warnings
preexistentes sin cambios) · `vitest run` **4093 passed / 0 failed / 66 skipped** (skips =
suites LIVE-DB sin credenciales E2E, política del repo; baseline CP-ORG-001: 4055 → +38).

## 4. Validación visual y funcional (navegador real, sandbox local aislado)

Instancia `next dev` en puerto 3001 con entorno SIN Supabase (dev-bypass documentado del
repo) y override LOCAL temporal de rol del usuario dev (revertido tras la validación;
NO incluido en el diff). Sin escrituras: cero contacto con producción.

| Evidencia (download/cp-org-002-evidencia/) | Resultado |
|---|---|
| `01-sidebar-superadmin-completo.png` | Menú lateral: INICIO·OPERACIÓN·ANÁLISIS·SISTEMA·AYUDA·EN DESARROLLO |
| `02-sistema-focos-superadmin.png` | SISTEMA en foco: 8 entradas (Ajustes→Cierre Fiscal) |
| `03-usuarios-carga.png` | Vista Usuarios carga (`?view=users`) |
| `04-operacion-items.png` | OPERACIÓN completo: Caja·Almacén·Logística·Costo·Trabajadores·Gestión de Tiendas·Redes |
| `05/06/07-palette-*.png` | Command Palette abre; busca «Usuarios» → acción administrativa visible |
| `08-regresion-clerk-restringido.png` | clerk: SOLO Inicio·Operación·Ayuda (SISTEMA/ANÁLISIS/DESARROLLO ausentes) |

Consola del navegador: sin errores de autorización ni de red relevantes al navegar los
módulos del menú (los fetch de datos fallan únicamente por el entorno sin backend, según
lo esperado del dev-bypass).

## 5. Invariantes de seguridad conservados (verificados por tests de regresión)

- `admin` NO satisface chequeos de `superadmin` (asimetría de jerarquía intacta).
- Roles operativos (clerk/costo/warehouse/usuario) SIN SISTEMA ni acciones admin.
- `tenant_admin` SIN SISTEMA transversal (doctrina FASE 3).
- RLS, triggers, políticas y migraciones productivas: **INTACTAS** (cero cambios SQL).
- Cero escrituras en producción durante toda la misión (solo navegación en sandbox).

## 6. Hallazgo separado (fuera de alcance, reportado para decisión del propietario)

El filtro estricto del catálogo desktop tampoco incluye `tenant_admin` en las listas
`roles:` (pre-existente). **Corrección (CP-ORG-003, 2026-10-26):** el paréntesis original
decía que «móvil, vía `hasRole`/jerarquía, sí le muestra el alcance operativo» — la
auditoría CP-ORG-003 (§4-D3) lo **desmintió empíricamente**: para el `tenant_admin` puro
el sheet móvil era INICIO+AYUDA (la jerarquía declarada NO se consume en `hasRole` para
este rol), y con membresías de tienda el paso 3 de `hasRole` introducía entradas
**visibles-denegadas** (p.ej. un clerk con membresía admin veía SISTEMA en el sheet que
el guard negaba al tap). CP-ORG-003 Fase 1 alineó el sheet y los tabs móviles a la
doctrina canónica estricta (`mobile-sheet.ts`), y su Fase 2 recuperó el bootstrap de la
primera tienda. Ver `docs/audits/CP_ORG_003_TENANT_ADMIN_PARIDAD.md` §10. **Incidencia
resuelta por CP-ORG-003** (PRs de esa misión); no bloqueó en su momento la verificación
productiva del SuperAdmin.

---

## 7. Validación final, fusión y verificación productiva (2026-10-26)

### 7.1 Estado real de GitHub (verificado, no repetida la implementación)

- **PR #1486** (`fix/cp-org-002-navegacion-superadmin-20261026`, head `c7127c8839a7cf3e...`)
  fusionado por el propietario (`Nardian90`) el **2026-10-25T18:14:21Z** con commit de
  fusión **`fd1d417e3fabb5414deea9350e2e1de0b47031ae`** — `origin/main` verificado en
  ese SHA exacto. 1 commit, 10 archivos, +831/−17.
- **Checks del head `c7127c8839`** (GitHub check-runs + combined status = `success`):
  `TypeCheck + Lint + Unit Tests + Build` ✓ · `Unit & Integration Tests` ✓ ·
  `Security Audit` ✓ · `Vercel Preview Comments` ✓ · `E2E Tests (Playwright)` skipped
  (política del repo: suite aislada dedicada). El código probado en CI ES el commit
  fusionado.
- **Coherencia expediente ↔ código fusionado** (lectura directa de `main @ fd1d417e3`):
  las 6 superficies declaradas usan la regla canónica — `sidebar.structure.ts:66-123`
  (`effectiveNavRole` + `filterModulesByRole` + `isViewAllowedForRole` delegada),
  `actions.ts:88` (palette), `GroupHubView.tsx:85` y `SectionHubView.tsx:134` (tarjetas),
  `ManagementHubView.tsx:198,260` (tabs), `CashClosureView.tsx:232,237` (puertas UI) —
  y el espejo server-side afirmado existe: `has_store_role_as` en
  `supabase/migrations/20260807000002_v2_16_2_has_store_role_as.sql:30`
  (`profiles.role IN ('admin', 'superadmin')`). Los 3 archivos de pruebas declarados
  (38 pruebas) están presentes en `main`.
- **Batería local re-ejecutada sobre el main fusionado** (sandbox, misma base que CI):
  `tsc --noEmit` 0 errores · `eslint` 0 errores (warnings preexistentes) ·
  `vitest run` **4122 passed / 0 failed / 66 skipped** (286 archivos; incluye las
  **38/38** pruebas nuevas de esta misión en verde; los +29 tests respecto a las 4093
  del head corresponden al PR #1487 fusionado en paralelo, ajeno a este alcance).

### 7.2 Despliegue de producción (Vercel)

- GitHub Deployments: entorno **Production** para `fd1d417e3` creado
  2026-10-25T18:15:33Z → estado **`success`** ("Deployment has completed").
- Dominio productivo `https://costpro4.vercel.app` → **HTTP 200**; `/api/health`
  `{"status":"ok","service":"costpro-enterprise"}`. La URL de deployment del proyecto
  (`costpro-…-nardian90s-projects.vercel.app`) queda tras Vercel Authentication
  (protección documentada), por lo que la validación funcional se realizó contra el
  dominio público.

### 7.3 Comprobación funcional productiva (navegación REAL autenticada)

Sesión de solo lectura con la cuenta autorizada (`admin@demo.com`, SuperAdmin) contra
`costpro4.vercel.app`. **Cero escrituras** (sin ventas, sin turnos, sin cambios de datos,
sin overrides de rol, sin migraciones). Evidencia: 10 capturas en
`download/cp-org-002-verificacion-produccion/`.

| # | Verificación productiva | Método | Resultado |
|---|---|---|---|
| 1 | Menú muestra las 6 secciones INICIO·OPERACIÓN·ANÁLISIS·SISTEMA·AYUDA·EN DESARROLLO | Navegación real SuperAdmin | ✓ (capturas 01/06/10) |
| 2 | SISTEMA abre con sus 8 entradas (Ajustes→Cierre Fiscal) | Navegación real | ✓ (captura 02) |
| 3 | OPERACIÓN abre completo (11 entradas, Dashboard→Redes) | Navegación real | ✓ (captura 06 contexto) |
| 4 | ANÁLISIS abre (Análisis de Datos·Inteligencia Cambiaria·Tablón·Reportes·ABC) | Navegación real | ✓ (captura 07) |
| 5 | EN DESARROLLO abre (IPV·Wiki·Marco Legal) | Navegación real | ✓ (captura 09) |
| 6 | Módulos principales cargan: Usuarios (columna Empresa/Organización + badge SUPERADMIN), Organizaciones (Vitallcons, 2 tiendas activas, alcance SuperAdmin visible) | Navegación real | ✓ (capturas 03/04) |
| 7 | **Caja sin AccessDenied** para SuperAdmin (superficie 6; vista Vender carga con catálogo real) | Navegación real | ✓ (captura 05) |
| 8 | **Command Palette** expone la acción administrativa «Usuarios» (superficie 2) | Navegación real | ✓ (captura 08) |
| 9 | **Cambio de tienda** ENERVIDA-VITALLCONS → PUERTO PADRE VITALLCONS: el menú NO desaparece (6 secciones íntegras) y los datos cambian al alcance de la tienda (productos distintos) | Navegación real | ✓ (captura 06) |
| 10 | URL directa `?view=users` carga para SuperAdmin; sin sesión el guard niega (pruebas de regresión CI) | Navegación real + CI | ✓ |
| 11 | Autorización del servidor intacta: `/api/intelligence`, `/api/users`, `/api/organizations` → **401** sin sesión (gates `withRole`) | HTTP anónimo | ✓ |
| 12 | Aislamiento entre tiendas: catálogo/panel cambian con la tienda activa; selector solo ofrece las tiendas autorizadas | Navegación real | ✓ |
| 13 | Roles operativos SIN permisos nuevos: `clerk`/`costo`/`warehouse` sin SISTEMA/ANÁLISIS/desarrollo, admin NO satisface chequeos de superadmin, sin sesión → deny (27 pruebas de regresión CI en verde) | CI `c7127c8839` + re-ejecución local | ✓ |

### 7.4 Distinción explícita de estados (cierre)

| Estado | Evidencia |
|---|---|
| Pruebas locales (sandbox) | 38/38 nuevas + suite 4122/0 en `main @ fd1d417e3` |
| Fusión | PR #1486 merged por el propietario → `fd1d417e3` (2026-10-25T18:14:21Z) |
| Despliegue | Vercel Production `fd1d417e3` = `success`; `costpro4.vercel.app` 200 |
| **Validación productiva real** | **Ejecutada** — matriz §7.3 completa (13/13 ✓) con sesión de solo lectura |

**Veredicto: CP-ORG-002 CERRADO** — menú del SuperAdmin restaurado en producción
(6 secciones), módulos navegables, cambio de tienda estable, autorización server-side
y aislamiento por tienda intactos, roles operativos sin permisos adicionales. La
incidencia separada de `tenant_admin` (§6) queda abierta para decisión de producto.
