# GATE 1.4 — 10 PERMISSIONS (GATE 13) · 11 DUPLICATION (GATE 14)

Fecha: 2026-09-21 · READ-ONLY: no se cambió ningún permiso, rol, RLS ni dato. Método: sidebar.structure.ts (isViewAllowedForRole), navigation-definition (roles), actions.ts (getActionsForUser), contracts/user.ts, auth-middleware.ts + verificación de visibilidad en browser (admin).

---

## 10 · PERMISOS

### Modelo real
- **UX visibility ≠ authorization** — está correcto y explícito: "la seguridad real vive en backend/RLS; el menú NO es el mecanismo de seguridad" (sidebar.structure.ts:79-83).
- Guard UI: `isViewAllowedForRole(viewId, role)` — herencia del ancestro con roles más cercano; **default-open** para vistas fuera del árbol (técnicas/contextuales) y sin roles.
- Palette: `getActionsForUser(role)` filtra por action.roles.
- RLS real: `activateTenantRLS(userId, activeStoreId)` en auth-middleware (por tienda activa).
- Secciones con roles: OPERACIÓN (todos los operativos), ANÁLISIS (admin/manager/encargado salvo Dashboard de Tiendas/Tablero Dinámico/ABC/Cambiaria = universal), SISTEMA y EN DESARROLLO (admin), AYUDA (universal), Ventas-hub cards (5 roles operativos), Vitrina/storefront-config (admin/manager/encargado), Reportes (admin/manager).

### Riesgos detectados (sin modificar nada)

| ID | Riesgo | Severidad | Evidencia |
|---|---|---|---|
| UX-008a | **Enlaces visibles sin permiso**: no se detectó — sidebar/palette filtran por rol heredado. Browser admin muestra todo por diseño. | OK | — |
| UX-008b | **Acciones ejecutables sin autorización**: fuera de alcance UX (backend). Nota: "Generar OC" premium y flujos de dinero (pagos CxP) dependen de backend; el guard de roles solo cosmético. | informativo | auth-middleware + comentarios |
| UX-008c | **Vistas huérfanas son default-open**: cualquier rol autenticado con el deep-link puede abrir customers/bank-reconciliation/ofertas/arena-fc (isViewAllowedForRole → true por estar fuera del árbol). Si en el futuro contienen datos sensibles, el "default-open" los expone por URL. | P2 (potencial) | sidebar.structure.ts:78-83 + browser deep-links |
| UX-008d | Diferencia desktop/mobile: ninguna — ambos derivan de la misma definición (roles heredados) y el sheet móvil filtra con el mismo roleOk. | OK | MobileTabBar derivación |
| UX-008e | Arquitectura propuesta (GATE 9): NO genera enlaces nuevos sin permiso si se conserva el principio de herencia; los cambios propuestos en 14 son de AGRUPACIÓN (roles se mantienen por entrada). La propuesta de exponer arena-fc/ofertas/customers DEBE definir roles explícitos en la definición (hoy sin roles = universal). | requisito Fase A | — |

---

## 11 · DUPLICACIÓN

| ID | Caso | ¿Duplicación real? | Evidencia | Clasificación |
|---|---|---|---|---|
| D-1 | **Vender / Nueva Venta / Terminal de Venta / POS / TPV** | NO — una implementación (POSView, viewId pos), un destino (1-click desde sidebar y desde card Ventas). "TPV" sobrevive como heading interno y "Terminal de Venta" como keyword. | TerminalShell case 'pos' único; VIEW_TO_HUB_MAP excluye pos explícitamente (GATE 1.3) | COHERENTE |
| D-2 | **Vitrina: tab hub + vista standalone (storefront-config)** | MISMO componente (StorefrontConfigView importado por ManagementHubView y por TerminalShell) — dos viewIds de entrada con dos nombres ("Vitrina" / "Vitrina Pública") y un breadcrumb roto en la 2ª | ManagementHubView.tsx:30,182 + TerminalShell:430 + ACTION_EXTENSIONS | DUPLICATED-entrada |
| D-3 | **Tablón: tab hub + vista standalone (news)** | MISMO componente NewsView en tab y en vista directa; breadcrumb correcto en ambas | ManagementHubView + TECHNICAL_DIRECT_ROUTES.news + VIEW_TO_HUB_MAP.news | DUPLICADA-entrada (menor, coherente) |
| D-4 | **Cuentas por Pagar: accounts_payable Y accounts-payable** (2 viewIds, 1 componente) | Duplicación de ID (underscore/guion) resuelta en el switch (2 cases → 1 vista) y en aliases; deuda técnica menor | TerminalShell:505-507 | DUPLICATED-viewId (P3) |
| D-5 | **Darian: ChatBotView global vs DarianEditor en ficha vs FAB vs sidebar rail** | 3 superficies, 1 vista global + 1 embebido contextual (ai-chat) — complementarios, no duplicados funcionales | TerminalShell case chat; CostSheetView:649 | COHERENTE (contexto correcto) |
| D-6 | **Caja: CashClosureView + cash_report modal + "Arqueo"** | 1 vista Caja; reporte de entrega como vista modal-elevada desde la card — diseño intencional FIX-CASH-REPORT | TerminalShell cases cash/cash_report | COHERENTE |
| D-7 | **Dashboards: Inicio (Tablero Consolidado) vs Dashboard de Tiendas vs Dashboard KPI avanzado vs Tablero Dinámico** | 4 conceptos distintos con vocabulario superpuesto (no duplicación de código, sí de TERMINOLOGÍA) — ver 13-findings UX-004 y 12-information-architecture | browser + definición | COLISIÓN-TÉRMINOS |
| D-8 | **Terminal cost-sheets vs /fc/FC.html (MVP)** | DOS superficies de Ficha de Costo: el módulo completo del terminal (editor/asistido/arena/analytics) y el MVP PWA standalone canónico (release 12.10.0, motor byte-exacto de repo fichascosto, SW propio). **Aclaración del usuario: el MVP es demo rápida, no la app** — la auditoría lo trata como superficie externa documentada, no como duplicado a eliminar. Riesgo de marca: el usuario que entra por "Continuar con Ficha de Costo" no ve el módulo completo del terminal. | public/fc/release-manifest.json + user statement | CONVIVENCIA-DOCUMENTADA |
| D-9 | Grupos duplicados de secciones (GroupHubView acepta ids legacy costos/tienda/ipv_module/otros/administracion/recursos) | Render de hubs para compatibilidad — inofensivo (no navegación visible) | TerminalShell:464-477 | LEGACY (P3) |

**Conclusión**: NO existe doble implementación funcional de ninguna capacidad del terminal. Existen: 1 duplicación de entrada con 2 nombres (Vitrina), 1 par de viewIds alias (CxP), y una colisión terminológica de dashboards. La reorganización no creó clones de pantallas.
