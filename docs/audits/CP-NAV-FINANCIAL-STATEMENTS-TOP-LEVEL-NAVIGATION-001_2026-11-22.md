# CP-NAV-FINANCIAL-STATEMENTS-TOP-LEVEL-NAVIGATION-001 — Expediente de misión

**Fecha**: 2026-11-22 · **Rama**: `feat/cp-nav-financial-statements-toplevel-20261122`
**PR**: #1686 · **Head**: 7564dda11 (+ commit de expediente) · **Base**: main (b0e791c12)

## 1. Objetivo

«Estados Financieros» deja de ser hoja del grupo **OPERACIÓN** y pasa a ser
**sección principal de primer nivel**, primera entrada del menú lateral, al
mismo nivel jerárquico que OPERACIÓN y RECURSOS HUMANOS.

## 2. Diagnóstico (fuente única GATE 1)

La navegación tiene UNA sola fuente de verdad:
`src/config/navigation/navigation-definition.ts` (documentado en su cabecera).
De ella derivan — sin listas paralelas — el sidebar (desktop + drawer móvil),
el sheet «Más» de la barra inferior móvil, la paleta de comandos, los
breadcrumbs, el título del header y el guard de roles
(`isViewAllowedForRole`). No existe configuración de menú en base de datos
(verificado: cero matches en `supabase/`). El menú NO es seguridad: el acceso
real lo gobiernan RLS/RPC server-side (sin cambios).

## 3. Decisión de diseño

Se eligió **sección de primer nivel de tipo `item`** (mismo patrón de acceso
directo que «Inicio») sobre la alternativa «grupo con una hoja»:

| Criterio (mandato §3) | Ítem directo (elegido) | Grupo con hoja |
| --- | --- | --- |
| Resaltado activo en el menú | Sí, siempre (renderNavItem) | Solo dentro del focus mode |
| Acceso directo con un clic | Sí | Sí (focus + default view) |
| Duplicación visual del nombre | No | Header + hoja con el mismo texto |
| Rail (contraído) con a11y | Icono + `aria-label` | Icono + `aria-label` |

## 4. Cambios (6 ficheros de código + 4 de tests)

1. `src/config/navigation/navigation-definition.ts` — la entrada se RETIRA de
   `operacion.children` y se declara como PRIMERA sección
   (`type: 'item'`, mismo icono/label/roles/keywords); `flattenNavigation()`
   emite ítems de primer nivel con categoría propia (walk incluye la sección
   misma: para grupos el flujo es idéntico al previo); VALID_VIEWS sin cambios
   de id.
2. `src/config/navigation/mobile-sheet.ts` — walk([section]) con la misma
   doctrina: el ítem de primer nivel aparece como grupo propio en el sheet
   «Más» (paridad móvil, patrón RECURSOS HUMANOS).
3. `src/components/views/terminal/Sidebar.tsx` — auto-focus del montaje salta
   los módulos type `item` (evita focus UI vacío); `aria-label` en botones
   rail de ítems de primer nivel (paridad a11y con módulos raíz).
4. `src/hooks/ui/useTerminalNavigation.ts` — categoría «Estados Financieros»
   válida para el título del header.
5. Tests de contrato: `gate1-navigation.test.ts` (lista de secciones con
   `financial-statements` primero), `fin-navigation.test.ts` (regresión
   top-level: primera sección, fuera de OPERACIÓN, una sola aparición,
   icono/roles intactos), `sidebar-hover-expand.test.tsx` (comportamiento de
   módulo raíz sobre el primer GRUPO + nueva cobertura F15.6-bis/F15.7-bis
   del ítem directo en rail).
6. E2E alineado: `cpfin-reconciliation-tab.spec.ts` (3), 
   `fin-statements-origin-traceability.spec.ts` (2 + UI1 que ahora prueba el
   ítem visible SIN abrir OPERACIÓN), `enervida-cash-bank-reconciliation.spec.ts`
   (1) — el patrón antiguo (OPERACIÓN → EF) desapareció del árbol.

## 5. Lo que NO cambió (mandato §5/§7 — verificado en el diff)

- **Rutas**: misma vista `ViewType 'financial-statements'`; misma URL
  `/?view=financial-statements`; mismo `case 'financial-statements'` en
  TerminalShell; favoritos y deep-links intactos.
- **Permisos**: mismos roles (`admin/manager/encargado`) en la misma entrada;
  guard `isViewAllowedForRole` y `filterModulesByRole` sin cambios de
  semántica (superadmin→admin intacto); clerk/usuario/warehouse siguen sin
  superficie financiera.
- **BD**: cero migraciones; sin RLS/RPC; sin lógica contable.

## 6. Pruebas y evidencia

### Unit (vitest)
- Suite de navegación + hover-expand + paridad móvil: **281/281 PASS**
  (15 ficheros) tras la corrección.
- Suite completa del repo: **6422 PASS / 3 FAIL** en la primera pasada — los 3
  fallos eran `sidebar-hover-expand` (F15.1/F15.6/F15.7) que anclaban el
  primer módulo a `SIDEBAR_STRUCTURE[0]` (antes OPERACIÓN, grupo); corregidos
  hacia la intención original + cobertura nueva; segunda pasada **0 FAIL**.

### E2E aislado (CI, proyecto CostproE2E)
- Primera pasada: 52 PASS / 3 FAIL (`cpfin-reconciliation-tab` — navegación
  por el menú antiguo). Corregido el patrón en los 3 specs; segunda pasada
  **CI COMPLETO: 5/5 SUCCESS** (incl. E2E Aislado, Unit & Integration,
  TypeCheck+Lint+Unit+Build, Security Audit).

### UI read-only (Playwright contra servidor local con .env principal)
`scripts/verificacion-ui-cp-nav-financial-statements-001.mjs` → **24/24 PASS**:
- Escritorio 1440×900: EF primera entrada (antes de OPERACIÓN y RH); focus de
  OPERACIÓN sin hoja EF (0 duplicaciones); clic directo → `?view=financial-
  statements` + `aria-current="page"`; resaltado se actualiza al navegar a
  OPERACIÓN→Vender y vuelve al regresar; deep-link + título del header.
- Rail (contraído): iconos sin etiquetas; accesible por `aria-label`.
- Móvil 375×812: drawer con EF primero; tap accede; sheet «Más» con grupo
  propio. Tableta 768×1024: resaltado correcto.
- 0 `pageerror` en toda la sesión. Capturas (8 escenas):
  `download/cp-nav-financial-statements-001/evidencia-ui/`
  (01 desktop expandido, 02 focus OPERACIÓN sin EF, 03 EF activo, 04 POS
  activo, 05 rail, 06 móvil drawer, 07 móvil sheet «Más», 08 tableta).

## 7. Entorno al cierre

- PM2 online con el .env PRINCIPAL, health 200 (sin swap E2E local: el E2E
  corrió en CI contra la BD aislada).
- Réplica `.env.txt`/`download/costpro-env.txt` consistente.
- Diff escaneado: 0 secretos.
