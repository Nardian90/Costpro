# DIAGNÓSTICO — MISIÓN CP-SIDEBAR-RESTORATION-001
## Restauración y simplificación definitiva del menú lateral de COSTPRO

Fecha: 2026-11-24 · Rama: `fix/sidebar-dos-estados-20261124` · Estado al diagnosticar: `main` = 52298645c (incluye PR #1700)

---

## 1. Estado del arte previo (qué encontró la auditoría)

La cadena de commits sobre el menú lateral dejó TRES mecanismos superpuestos:

| Commit | Mecánica introducida | Problema |
|---|---|---|
| `441d0f5d2` (CP-UX-POLISH-002) | Segunda dimensión `sidebarPinned` + Estados A/B/C (fijo expandido / fijo contraído / **temporal overlay**) | Un pin que cambia el COMPORTAMIENTO del layout; el Estado C superpone el menú al contenido con backdrop |
| `7ef1ed5d8` | Hover-expand del rail (`useSidebarHoverExpand`) con timers de 100/180 ms | Expansión automática al pasar el puntero — PROHIBIDA por la misión §4 |
| `7c11d9a35` (PR #1700, CP-UX-SINGLE-TOGGLE) | Botón ÚNICO de **mostrar/ocultar** en la barra superior (Header) + elevación z-50 del header sobre el panel | El control vive FUERA del menú; el estado `closed` sigue existiendo en desktop; el header hospeda el cierre |

Resultado observable (capturas del propietario, 10:09–10:10 del 24-11): **dos botones visibles**, overlay en escritorio, expansión por hover y tres estados reales (expandido / rail / cerrado) cuando la especificación exige **dos estados y un solo botón integrado en el menú**.

## 2. Inventario técnico exacto (archivos, estados, listeners)

### 2.1 Store — `src/store/index.ts`
- `SidebarState = 'expanded' | 'rail' | 'closed'` — el estado `closed` es alcanzable en ESCRITORIO (toggle del Header, Esc, backdrop), violando el ESTADO B (el menú debe continuar visible).
- `sidebarPinned: boolean` + `setSidebarPinned` — eje FIJO/TEMPORAL completo (persistido).
- `toggleSidebar()` — cerrar/abrir puro (`closed ↔ expanded`), sin relación con los dos estados pedidos.

### 2.2 Sidebar — `src/components/views/terminal/Sidebar.tsx`
- `useSidebarHoverExpand({ collapsed: sidebarState === 'rail' })` → `hoverExpanded` + `hoverProps` spread sobre el `<aside>`: **listeners mouseenter/mouseleave que mutan el ancho** con timers (§4 prohibido).
- `displayState = hoverExpanded && rail ? 'expanded' : sidebarState` — cuarto estado derivado.
- `isTemporary = isMobile || !sidebarPinned` — Estado C en escritorio: overlay sobre el contenido.
- Botón **Pin/PinOff** (fijar/desfijar) en el encabezado del menú + botón **PanelLeftClose** → DOS controles visibles simultáneos (§3 prohibido).
- Handler de **Escape** que cierra el panel temporal (heredado de `39333d01a`).
- `<aside className="fixed inset-y-0 left-0 z-40 …">` — **posicionamiento fixed fuera del flujo**; el espacio se compensa con padding del `<main>` (§5 prohibido).
- Cierre automático del menú temporal al navegar (`if (isTemporary) setSidebarState('closed')` en 5 sitios).
- `handleRailModuleClick` EXPANDE el menú al hacer clic en un icono raíz (expansión no autorizada por el botón único).

### 2.3 TerminalShell — `src/components/views/TerminalShell.tsx`
- `contentPaddingClass = !isMobile && sidebarPinned ? sidebarWidths[sidebarState] : undefined` — **doble fuente de verdad del ancho** (aside fixed w-64/20 + padding compensatorio pl-64/pl-20/pl-0 en main).
- Backdrop **en escritorio** cuando `!sidebarPinned` (overlay del Estado C).
- `sidebarOverlaysHeader` — gimnasia de z-index (main z-auto ↔ z-10, header z-50) para mantener el toggle de la barra accesible sobre el panel.

### 2.4 Header — `src/components/views/terminal/Header.tsx`
- Botón `closed ↔ visible` (Menu/X) **siempre visible** (desktop y móvil): es el SEGUNDO control y el único capaz de ocultar el menú por completo en escritorio.

### 2.5 Hook y superficies dependientes
- `src/hooks/ui/useSidebarHoverExpand.ts` — timers de hover (raíz del §4).
- `src/components/views/terminal/views/help/HelpLayout.tsx` — el mismo hook produce el *flyout* por hover de la Biblioteca de Ayuda.
- `src/components/views/terminal/views/dashboard/StoreDashboardView.tsx` — SU PROPIO botón PanelLeft que llama `toggleSidebar` (control redundante adicional) + cálculo `sidebarInset`.
- `src/components/views/terminal/views/pos/POSExpressMode.tsx` y `…/inventory/ReceptionExpressMode.tsx` — `setSidebarState('closed')` al montar: en escritorio desaparece el menú por completo.
- `src/hooks/ui/useKeyboardShortcuts.ts` — Ctrl+B usa `toggleSidebar` (cerrar/abrir).
- Tests con los contratos antiguos: `cp-ux-sidebar-behavior.test.tsx` (Estados A/B/C), `header-single-toggle.test.tsx` (toggle de barra), `sidebar-hover-expand.test.tsx` y `useSidebarHoverExpand.test.tsx` (hover), `sidebar-superadmin-navigation.test.tsx` (mock sin pin — neutro).

## 3. Causa raíz

No hay un único modelo de estado: coexisten **tres ejes** (visibilidad `closed↔visible`, ancho `expanded↔rail` y fijación `pinned↔temporal`) repartidos entre store, Header, Sidebar y TerminalShell. Cada misión anterior parcheó un eje distinto (hover, pin, toggle de barra) sin eliminar los demás, produciendo controles redundantes, overlay en escritorio y expansión por hover.

## 4. Diseño de reemplazo (sin capas nuevas)

**Un solo eje, dos estados, en desktop:**

| | ESTADO A — EXPANDIDO | ESTADO B — CONTRAÍDO (rail) |
|---|---|---|
| Ancho | `w-64 lg:w-72` | `w-20` |
| Iconos + etiquetas | Sí | Solo iconos (+ tooltips discretos) |
| Jerarquía | Secciones y focus mode actuales | Iconos de secciones/hojas de 1er nivel + indicador activo |
| Layout | Ítem EN FLUJO (flex row); el contenido empieza después del menú | Ítem EN FLUJO; el contenido recupera el espacio con transición de ancho |
| Superposición | Ninguna | Ninguna |

- **UN botón** integrado en el encabezado del menú (`#sidebar-logo-container`): `PanelLeftClose` «Contraer menú lateral» ↔ `PanelLeftOpen` «Expandir menú lateral»; presente y accesible TAMBIÉN en la barra compacta; tooltip = acción siguiente; área táctil 11×11 (p-2 en icono 16px ⇒ 40px), `aria-label`, `aria-pressed`, focus-visible.
- **CERO expansión automática**: el hook de hover y sus listeners se ELIMINAN (archivo completo); los tooltips (`title` + Radix Tooltip en rail) no alteran ancho ni estado.
- **Layout**: `relative h-full shrink-0` dentro del flex-row raíz; transición `transition-[width]`; el `<main>` pierde TODO padding compensatorio; z-index plano (header 30, contenido 10).
- **Móvil (<768px, §7)**: drawer temporal intacto — apertura por el control de navegación del Header (visible SOLO en móvil), sección raíz NO cierra, hoja funcional SÍ cierra, backdrop, sin hover; el botón único del panel actúa de cierre dentro del drawer.
- **Persistencia (§6)**: `sidebarState` ya persiste en `costpro-ui-storage`; en desktop `'closed'` persistido se SANEa a `'expanded'`; en móvil se fuerza `'closed'` al rehidratar (comportamiento vigente). `sidebarPinned` sale del store y del persist.
- **Consumidores alineados**: Ctrl+B pasa a alternar expanded↔rail (desktop) / cerrar↔abrir (móvil); Express modes contraen a `rail` en desktop en vez de cerrar; el botón duplicado de StoreDashboardView se elimina (el único control sigue alcanzable en el rail).
- **Rail estricto (§4)**: clic en icono raíz NAVEGA a la vista por defecto SIN expandir; la única expansión posible es el botón único.

## 5. Eliminaciones (§8 — limpieza real, no CSS)

- `sidebarPinned` / `setSidebarPinned` (store + Sidebar + TerminalShell + tests).
- `useSidebarHoverExpand.ts` (archivo) y su uso en Sidebar y HelpLayout (flyout hover de la Biblioteca).
- Botón Pin/PinOff del encabezado; botón PanelLeft duplicado de StoreDashboardView; toggle mostrar/ocultar del Header en desktop (queda solo como control de navegación móvil).
- `contentPaddingClass`, `sidebarWidths`, backdrop desktop, `sidebarOverlaysHeader`, handler Esc en desktop, posición `fixed` en desktop.
- Tests de los contratos muertos, reescritos al contrato nuevo (dos estados / un control / cero hover).

**Se conserva íntegro**: estructura de navegación por rol (`SIDEBAR_STRUCTURE`, `useFilteredNavigation`), focus mode, indicadores activos, badges, sección FIJADOS por usuario (`usePinnedNav` — accesos rápidos, ajena al pin de layout), búsqueda, Ctrl+K, rutas, permisos y móvil.
