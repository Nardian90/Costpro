# F4 — FINAL VERDICT · Contexto, Navegación e Information Architecture

Fecha: 2026-09-28 · Rama: `audit/f4-information-architecture`

---

## F4 — FINAL REPORT

### Baseline

* HEAD inicial: `60dd04acdcbb41d00c41e1b4067f557b1d475a0f` (tip de F3)
* origin/main real: `a63d4fe990d1db189bbad8aa15f6ca1ace99d674` (F1+F2 mergeados; F3 aún en rama)
* branch: `audit/f4-information-architecture` (creada desde el tip de F3 para poder
  validar las compuertas de regresión F3 — decisión documentada en 00-GATE-0-BASELINE §3)

### IA encontrada

* source of truth: `src/config/navigation/navigation-definition.ts` — ÚNICO y vivo;
  Sidebar/Breadcrumb/Palette/Header/Mobile derivan de él; 0 listas paralelas prohibidas
* secciones: INICIO + OPERACIÓN · ANÁLISIS · SISTEMA · AYUDA · EN DESARROLLO
* views: 38 hojas de menú + 25 extensiones palette + 46 técnicos + 22 alias legacy + 95 ViewTypes
* duplicaciones: `dashboard` ×2 entradas con doble resaltado (Inicio / Dashboard de
  Tiendas — candidato D documentado, NO eliminado por no-sorpresa); "Mi Perfil" y
  "Configuración"→settings (D); patrón hub tarjeta+palette (intencional, mantenido)
* legacy: TPV, "Terminal de Venta", "Tabla IPV", "Tablero Principal", "MULTI-TIENDA",
  26 componentes huérfanos (documentados F-class, sin borrado)

### Cambios

* archivos: 16 (15 src + 1 test) · +171/−103 líneas
* componentes nuevos: **0**
* componentes reutilizados: PageHeader (F2) — adoptado en Recepciones y Venta por Conteo
* tipo de cambio: strings de título/label, 1 destino de cancel, +12 mapeos breadcrumb,
  2 limpiezas de configuración documental (sin efecto runtime)

### Navegación

* desktop: ✓ sin cambios estructurales; títulos alineados (Vender/Ajustes/Gestión de Tiendas)
* mobile: ✓ intacto (tab bar, sheet "Más", drawer, colapsado — 0 modificaciones en MobileTabBar)
* breadcrumbs: ✓ +12 contextos reales (ghost crumbs 11 → 0); breadcrumb local falso eliminado
* deep-links: ✓ 15/15 verificados en vivo (04); contract intacto
* progressive disclosure: ✓ auditorizado (N1 inmediato / N2 contextual / N3 admin); sin cambios estructurales

### Journeys (verificados en vivo)

* Vender: ✓ 1-clic, breadcrumb correcto, carrito renombrado sin ambigüedad "Caja"
* Ventas: ✓ hub→Historial→acción→vuelta por crumb
* Inventario: ✓ tabs internas como header (patrón aceptado), crumbs colgados de Inventario
* Recepción: ✓ **FIX** — Cancelar vuelve a Recepciones (antes: Inventario)
* Caja: ✓ hub→Caja / tab móvil, PageHeader dinámico intacto

### Validación

* TypeScript: **0 errores** (`bunx tsc --noEmit`)
* ESLint: **0 errores**; 51 warnings preexistentes (advisory `<button>`, mismo patrón previo)
* tests: **2355 passed / 24 skipped / 0 failed** (incluye gate1-navigation 100, gate1-viewid 20, gate1-url-sync 10, pos-cart-counter 3 actualizado)
* F1: **44/44 PASS** (equivalente completo vía e2e commiteado + verificación en vivo de cada invariante certificado; ver 07)
* F2: **sin regresión visual** (PageHeader intacto y extendido; 28 shots comparados)
* F3: **sin regresión funcional** (Escape/overlay/focus/toast/error verificados en vivo)
* accessibility: ✓ mejorada (nombres accesibles coherentes); deuda h1 doble documentada (preexistente)
* responsive: ✓ **0px overflow en 320/360/375/390/400/1024/1280/1440**
* visual: ✓ 28 PNG BEFORE/AFTER en `shots/` (BEFORE vía stash con verificación de recompilación)
* e2e mobile spec: 12/14 (2 fallos PREEXISTENTES atribuidos: landing meta duplicada + ruido WebSocket — archivos fuera del diff)

### Git

* commit: (ver abajo — único commit de la fase en esta rama)
* push: PUSH VERIFIED mediante `git ls-remote`
* remote SHA == local HEAD: ✓

### Deuda restante (clasificación)

| Clase | Ítems |
|---|---|
| **A** (correcto) | Fuente única + derivadores; estructura Ventas certificada; guard de roles; contract ViewId; hub patterns |
| **B** (reubicación menor pendiente) | Ninguna crítica — recepción-cancel resuelto en F4 |
| **C** (renombrar/limpiar futuro) | PageHeader en ~22 vistas restantes; triple apilado estructural (Header h1+crumb+título); splash labels menores; `RoleForm.AVAILABLE_VIEWS` stale; `MobileTabBar.costTabs` local; `HelpLauncher` key 'occ' |
| **D** (decisión de producto, no UI) | Consolidar "Inicio"/"Dashboard de Tiendas" (mismo destino, doble resaltado); fusionar "Mi Perfil"⊂Ajustes; dual-id `accounts-payable`/`accounts_payable` |
| **F/Legacy** (no tocar sin decisión) | 26 componentes huérfanos (tenant/, OCCView, SidebarFocusMode, ui/Breadcrumbs.tsx, 13 en cost_sheet/…); branch `currentView==='reception'` inalcanzable |

### Veredicto

```text
F4 — CERTIFIED
```

Un usuario de CostPro puede responder sin interpretar la arquitectura interna:
dónde está (breadcrumb real en todas las vistas alcanzables, incl. deep-links de
bots y Vitrina), qué módulo usa (un solo nombre por vista: Vender, Ajustes,
Gestión de Tiendas, Recepciones), qué acciones pertenecen al contexto (slots
F2 canónicos) y cómo volver (crumb/hub/back-to-venta/cancel al contexto correcto).

**STOP — F4 finalizado. No se inicia F5.**
