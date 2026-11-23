# Expediente CP-UX-NAVIGATION-POS-REPAIR-20261124

**Misión:** CP-UX-NAVIGATION-POS-REPAIR-001 — Auditoría y corrección integral de navegación lateral, panel de ventas y Cajero Express.
**Fecha:** 2026-11-24 · **Rama:** `fix/cp-ux-navigation-pos-repair-20261124` · **PR:** #1692
**Entorno de pruebas:** BD aislada CostproE2E (ref `lguovmvrozxgssupkwpf`, centinela verificada). Producción (`wthkddeleylijmonclxg`) solo consultas read-only.

---

## 1. Diagnóstico (previo a implementar)

### §1 Menú lateral — `Sidebar.tsx`, `Header.tsx`, `TerminalShell.tsx`, `store/index.ts`
**Funcionamiento actual (pre-fix):** un único toggle en el Header (fuera del menú) cicla `expanded → rail → closed → expanded`; en móvil el drawer NO se cerraba al navegar (decisión 2026-07-22).
**Errores:** control de contraer fuera del encabezado del menú; el ciclo podía dejar el menú desaparecido por completo (`closed`); navegación móvil a hoja funcional dejaba el drawer abierto tapando la vista; secciones raíz en rail sin indicador activo.
**Causa raíz:** tres estados con un toggle cíclico único + `handleNavClick` sin cierre móvil.
**Solución:** toggle PanelLeft integrado en el encabezado del sidebar (expanded↔rail, jamás closed); hamburger solo para abrir; cierre móvil en navegación a vista funcional concreta (hoja / Inicio / perfil / breadcrumb); `aria-current` en iconos rail vía `hasViewInModule`.

### §2 Panel derecho de Ventas — `POSView.tsx`, `POSCart.tsx`, `usePOSCheckout.ts`
**Causa raíz confirmada:** visibilidad `(showCart || lastSale)`; el X y Esc solo mutaban `showCart`. Tras confirmar una venta, `lastSale ≠ null` (seteado por `usePOSCheckout` tras el POST) mantenía el panel montado — «el botón X no consigue cerrarlo».
**Solución:** `handleCloseCart = setShowCart(false) + setLastSale(null)`; Esc usa el mismo handler. La venta ya confirmada en BD (create_sale_v2 idempotente) no se revierte ni reenvía; el carrito pendiente sin confirmar no se toca (su borrado sigue en confirmación o «Anular carrito» con modal).

### §3 Cajero Express — `POSExpressMode.tsx`, `POSAutocomplete.tsx`, `useProducts.ts`, RPC `get_products_for_pos`
**Auditoría de datos (read-only en producción):** RPC vigente (firma `(uuid,text,text,integer,integer)` con unión maestra y `source`), 4 productos «Alarma» activos con existencias (1–3) en PUERTO PADRE y ENERVIDA, 0 SKUs null en `products` y `master_products`, 0 desalineamientos `products.tenant_id ≠ stores.tenant_id` → **la capa de datos/RLS está sana**; el fallo reportado era de composición/UX.
**Hallazgos:** sin catálogo inicial bajo el buscador (solo «Frecuentes» que exige turno con ventas); resultados en vivo dependientes de un dropdown overlay que se cerraba con clic fuera sin dejar rastro; sin estados «sin coincidencias/cargando/error».
**Solución:** área dinámica bajo el buscador — catálogo inicial paginado (predicado compartido `isPosProductVisible`, agotados ocultos) ↔ resultados en vivo (nombre/SKU/barcode, minúsculas/espacios, parcial); Enter conserva semántica (SKU exacto/1 match añade; respaldo RPC con 0 locales); estados §3.3 completos incl. error con Reintentar (refetch de POSView); limpiar recupera catálogo; alta delegada en rutas del carrito.
**Defecto preexistente adicional (detectado en E2E):** Express tiene su propia instancia de `usePOSCheckout` (useState local) y la vista de éxito dependía del prop `lastSale` de la instancia de POSView → nunca aparecía tras cobrar en Express. Corregido con `effectiveLastSale = propia ?? prop` y «Nueva venta» limpia ambas.

## 2. Archivos modificados
| Archivo | Cambio |
|---|---|
| `src/components/views/terminal/Sidebar.tsx` | toggle interno en encabezado, cierre móvil selectivo, indicador activo rail |
| `src/components/views/terminal/Header.tsx` | hamburger solo como apertura (sin duplicar) |
| `src/components/views/TerminalShell.tsx` | contrato de cierre documentado |
| `src/components/views/terminal/views/pos/POSView.tsx` | cierre real del panel (§2) + props de estado catálogo a Express |
| `src/components/views/terminal/views/pos/POSExpressMode.tsx` | catálogo inicial, búsqueda en vivo, estados §3.3, fix vista de éxito (§3) |
| `src/__tests__/components/cp-ux-sidebar-behavior.test.tsx` | NUEVO — 9 pruebas §1 |
| `src/__tests__/components/cp-ux-navigation-pos-repair.test.tsx` | NUEVO — 9 pruebas §2/§3 |
| `src/__tests__/components/pos-express-parity.test.tsx` | 24 pruebas actualizadas al nuevo contrato de resultados |

## 3. Correcciones realizadas (commits)
1. `d1568f4e0` fix(navegación): control integrado + cierre móvil selectivo + indicador rail (§1)
2. `6aefd3748` fix(pos): cierre real del panel tras venta confirmada (§2)
3. `dcec414c1` fix(pos-express): catálogo inicial y búsqueda en vivo con estados (§3)
4. `eff7d7973` fix(pos-express): vista de éxito tras cobrar en Express (§3.4)

## 4. Pruebas ejecutadas y resultados
- **Unitarias (vitest):** 480 archivos / **6.530 tests PASS**, 0 fallos.
- **TypeScript:** `tsc --noEmit` → **0 errores**.
- **ESLint** (archivos tocados): **0 errores**; warnings preexistentes de estilo (`<button>` crudo) no bloqueantes.
- **Build:** compilación Turbopack OK (64s). La fase TS final del `next build` excede la RAM del sandbox (4 GB, sin swap); la valida el CI del PR.
- **E2E navegador (agent-browser) sobre BD aislada** — evidencia en `evidencia/`:
  - `01-rail-contraido.png` — contraer → barra compacta con iconos (no desaparece)
  - `02-rail-indicador-activo.png` — OPERACIÓN resaltada (aria-current) con vista pos
  - `03-express-catalogo-inicial.png` — catálogo inicial «5 productos» sin escribir
  - `04-express-busqueda-alarma.png` — «alarma» → 2 resultados en vivo con stock/precio
  - `05–09` — confirmación, venta, éxito, «Nueva venta» → catálogo
  - `10-carrito-exito-antes-x.png` / `11-carrito-panel-cerrado-tras-x.png` — X cierra el panel tras venta confirmada
  - `12–14` — móvil 390×844: drawer abierto → OPERACIÓN mantiene abierto con secundarias → «Vender» cierra y abre la vista
- **Integridad de venta (BD aislada):** 3 transacciones `completed` (15.00 / 2200.00 / 240.00); existencias descontadas: Alarma 8→6, Ventilador 5→4.
- **Aislamiento multitienda:** todas las lecturas vía RPC `get_products_for_pos(p_store_id=tienda activa)` con `has_store_access` + RLS; sin consultas globales, sin mocks, sin debilitar políticas. Guard fail-closed `assert-isolated-db` activo durante todo el run.
- **Residuos:** net delta = 0 (tienda, usuario y 4 tenants del run eliminados con helpers `hard-cleanup` con guardas contra protegidos).

## 5. Restricción productiva
Ninguna escritura en producción: diagnósticos exclusivamente SELECT; ventas y pruebas solo en la BD aislada; `.env` principal restaurado al cierre (health 200).
