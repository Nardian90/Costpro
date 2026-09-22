# FASE B — IMPLEMENTATION PLAN (gate §12, registrado ANTES de codificar)

## 1. TABLÓN

**Actual**: tab 1 DEFAULT del hub "Gestión de Tiendas" (`ManagementHubView`), con breadcrumb
apuntando a management-hub; item del hub con keyword `tablón` (pista indirecta); vista técnica
en `TECHNICAL_VIEW_IDS`/`TECHNICAL_DIRECT_ROUTES`.
**Nuevo destino**: hoja **"Tablón de Noticias"** (id `news`, sin route — id = ViewType) en la
sección **ANÁLISIS**, posición: inmediatamente después de "Inteligencia Cambiaria".
**Razón**: GATE 1.4P demostró modelo GLOBAL/TRANSVERSAL (lector RSS sin store_id; contenido
no cambia con la tienda activa; inteligencia de mercado MiPyme). ANÁLISIS es la única sección
global existente coherente (ver comparación §1.1). Sale del hub de tiendas y de las listas
técnicas (fuente única: el árbol de definición pasa a resolver su breadcrumb). El item
`management-hub` pierde la keyword `tablón` y la mención en su descripción; el hub queda con
tabs Gestión Tiendas (nuevo default, identidad del hub) + Vitrina. El nombre visible
"Tablón de Noticias" NO cambia. Deep-link `?view=news` intacto. Roles de la hoja = los roles
históricos del tab (todos) → deep-link universal y palette para roles operativos se
preservan; la visibilidad en menú sigue gobernada por el guard de la sección (admin/manager/
encargado) — la contradicción de roles se documenta como hallazgo B-adjunto heredado de
GATE 1.4P, SIN cambio de permisos.

### 1.1 Comparación de candidatos (mandato §3 — dos plausibles documentados)

| Candidato | A favor | En contra | Decisión |
|---|---|---|---|
| **ANÁLISIS** (existente) | Sección transversal (no de tienda); cluster semántico con "Inteligencia Cambiaria" (el Tablón detecta tasas BCC — mismo dominio de inteligencia); GATE 1.4P: "inteligencia de mercado"; roles de gestión correctos | Sus otras hojas son análisis de datos propio, el Tablón es lectura de fuentes externas | **ELEGIDO** |
| **SISTEMA** (existente, admin) | Ya contiene "Gestión RSS" (configuración de feeds) | Solo admin — contradice el uso orgánico transversal y la intención histórica "visible para todos"; confundiría lector con configuración | Rechazado |
| INICIO (fijo) | Máxima visibilidad | INICIO no es una sección (destino fijo dashboard) — requeriría inventar estructura | Rechazado |
| AYUDA | Contenido informativo | Es documentación de la app, no inteligencia de mercado | Rechazado |
| Nueva sección "GLOBAL" | Visualmente limpio | Prohibido por mandato §3: no crear secciones cuando existe una adecuada | Rechazado |

## 2. OFERTAS

**Actual**: cero navegación; breadcrumb falso "Módulo No Disponible"; disparador dashboard
"Crear oferta" (real); móvil la agrupa en el proceso Vender.
**Nuevo destino**: dominio **Ventas**, con el patrón existente del hub (tarjeta secundaria +
acción de palette `mobileHide` + breadcrumb), idéntico al patrón publicado de Devoluciones y
Cotizaciones. Sin hoja de sidebar de primer nivel (el dominio Ventas no publica sus sub-vistas
en el sidebar — patrón GATE 1.3). Cotizaciones NO se toca (coexisten; semánticas distintas).
**Razón**: GATE 1.4P clasificación B — stack completo y vigente cuyo único déficit es
discovery; el hub Ventas es su dominio propuesto y su IA existente. Copys honestos
(precedente "copy honesto" de Cotizaciones). Sin duplicación de implementación ni vistas nuevas.

## 3. CLIENTES CRM

**Actual**: cero navegación; breadcrumb falso; id `customers` pisado por `IPV_ROUTES`; dos
implementaciones (Supabase global parcial vs Dexie IPV contextual).
**Nuevo destino**: superficie canónica única = **CustomersView (Supabase)** bajo **Ventas**:
tarjeta secundaria honesta en el hub + acción de palette con id **`clientes`** → view
`customers` (id ≠ view — precedido por `accounts-payable`; el id `clientes` evita pisar
`IPV_ROUTES['customers']` y no crea tercera implementación) + breadcrumb
`VIEW_TO_HUB_MAP['customers'] → Ventas > Clientes`. La implementación contextual de IPV
permanece contextual (EN DESARROLLO, rail interno) — sin cambios. La consolidación técnica
del CRM y la brecha de CRUD (editar/eliminar/detalle) quedan documentadas como deuda para
fase posterior (mandato §6: solo destino navegacional).
**Razón**: GATE 1.4P — dominio propuesto Ventas; capacidad global real (aunque parcial) que
requiere un único destino global; el catálogo IPV es workflow local del dominio experimental.

## 4. CONCILIACIÓN BANCARIA

**Actual**: cero navegación; breadcrumb falso; UI esqueleto 39 LOC cuyo estado vacío remite a
un POST de API.
**Decisión**: **SIN exposición en navegación principal** (sin sidebar, sin palette, sin
tarjeta de hub) + breadcrumb honesto **standalone** "Conciliación Bancaria" (rama explícita
en `getBreadcrumbForView`, precedente `calculator`/`chat`) que elimina "Módulo No Disponible"
sin atribuir un hub falso. Deep-link `?view=bank-reconciliation` sigue funcionando.
**Razón**: GATE 1.4P clasificación C — los flujos esenciales (importar, conciliar,
discrepancias) no tienen UI; promoverla a menú/palette/tarjeta induciría a error (mandato §7:
no convertir una API parcial en funcionalidad aparentemente productiva). La asignación de
domino (Finanzas/ANÁLISIS) queda condicionada a que Producto decida completarla.

## 5. BREADCRUMB

- `VIEW_TO_HUB_MAP`: **+** `ofertas → sales-hub ("Ofertas")`; **+** `customers → sales-hub
  ("Clientes")`; **−** `news → management-hub` (pasa a resolverse por el árbol de definición —
  fuente única, sin mapas duplicados).
- `getBreadcrumbForView`: rama standalone para `bank-reconciliation` ("Conciliación Bancaria").
- Resultado: las 4 capacidades afectadas sin "Módulo No Disponible"; relación
  View → Hub → Section coherente; una única fuente canónica por vista.

## 6. COMMAND PALETTE

- Derivada de la definición (sin comandos nuevos a mano): **Tablón de Noticias** (hoja
  ANÁLISIS, keywords `tablón/noticias/noticias económicas/información/rss/tasas`), **Ofertas**
  y **Clientes** (extensiones del hub Ventas). **Conciliación Bancaria sin comando público**.
- El item `management-hub` pierde la keyword `tablón` (elimina la pista indirecta).
- **Corrección de dispatch** (§9 — sin pistas falsas): `CommandPalette.handleSelect` usará
  `route.view` para direct-routes en lugar del id crudo; corrige la pista falsa preexistente
  de `accounts-receivable` (id ≠ view) y habilita `clientes → customers`.

## 7. MOBILE

- Sheet "Más" es derivado: ANÁLISIS incorpora "Tablón de Noticias" (misma IA que desktop,
  sin navegación paralela ni duplicación). Verificación de grid/overflow a 390/375.
- `MOBILE_MAIN_TABS` pos.activeViews: **+** `customers` (cluster Vender, igual que
  `quotations`/`ofertas` ya presentes). Extensiones de Ventas `mobileHide` (patrón existente).
- `ManagementHubView`: 2 tabs (Gestión Tiendas default + Vitrina) — sin overflow.
- Palette accesible en móvil vía buscador del drawer (mecanismo existente).

## 8. Archivos a modificar (mínimos)

1. `src/config/navigation/navigation-definition.ts` — hoja news en ANÁLISIS; descripción ANÁLISIS; keywords/descripción management-hub; extensiones Ofertas/Clientes; pos.activeViews +customers.
2. `src/config/navigation/navigation-map.ts` — VIEW_TO_HUB_MAP (±), rama standalone bank-reconciliation, limpieza de `news` en TECHNICAL_DIRECT_ROUTES.
3. `src/components/views/terminal/views/management_hub/ManagementHubView.tsx` — tab news fuera; default `stores`; tabs reordenadas.
4. `src/components/views/terminal/views/sales_hub/SalesHubView.tsx` — tarjetas Ofertas + Clientes (copys honestos).
5. `src/components/ui/CommandPalette.tsx` — dispatch direct-route por `route.view`.
6. `src/__tests__/navigation/gate1-navigation.test.ts` — bloque FASE B (contratos nuevos).

**Prohibido en este gate**: tocar Fichas de Costo/Hub Fichas/Experto/Mis Fichas/Modo
Asistido/Reporte/Generación Masiva/Arena FC, lógica de costos, motor normativo, APIs de
fichas, modelo cost_sheets, contabilidad, lógica de negocio de Ofertas/Clientes/Conciliación,
permisos/RLS, base de datos, storefront-config (A-resto), vocabulario UX-004/006 (fuera de
alcance declarado en 00-baseline §4).

## 9. Criterios de aceptación (verificación funcional §15)

1. Tablón visible en ANÁLISIS (desktop) y en sheet "Más" (móvil); abre; breadcrumb
   "ANÁLISIS > Tablón de Noticias"; regreso al hub correcto.
2. `?view=news` funciona para admin y para roles operativos (deep-link universal preservado).
3. Ofertas: palette la encuentra; tarjeta en hub Ventas; breadcrumb "OPERACIÓN > Ventas > Ofertas".
4. Clientes: palette "clientes" aterriza en CustomersView; tarjeta en hub Ventas; breadcrumb "OPERACIÓN > Ventas > Clientes".
5. Conciliación: sin comandos públicos; `?view=bank-reconciliation` con breadcrumb "Conciliación Bancaria" (sin módulo falso).
6. Palette: "Tablón/Noticias" → Tablón; "caja" sigue resolviendo UNA acción (sin contaminación de keywords).
7. Gestión de Tiendas: hub con 2 tabs, default Gestión Tiendas, sin regreso a "Tablón".
8. Cero regresiones en suite completa (≥2.164 tests), TypeScript, ESLint.
