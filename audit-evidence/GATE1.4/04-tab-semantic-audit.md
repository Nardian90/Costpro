# GATE 1.4 — 04 TAB SEMANTIC AUDIT (GATE 6)

Fecha: 2026-09-21 · Método: código (ManagementHubView, CostSheetView/UnifiedTabs, InventoryView, WhatsApp/TelegramHub, IPVView, POSView) + navegador.

## Tabla de auditoría de tabs

| Vista padre | Tab | ¿Mismo dominio? | Relación | Problema | Recomendación | Clasificación |
|---|---|---|---|---|---|---|
| Gestión de Tiendas | Tablón Noticias | NO (comunicación transversal vs admin tiendas) | vecina | Tab DEFAULT es un lector RSS en un hub de gestión de tiendas; fuerza el paso por noticias | Mover default a "Gestión Tiendas"; Tablón como tab secundaria o vista transversal | **MISPLACED (default) / DUDOSO** |
| Gestión de Tiendas | Vitrina | PARCIAL (canal de la tienda activa vs ciclo de vida) | vecina | Doble viewId (tab + storefront-config); entrada palette con breadcrumb roto (UX-002) | Unificar entrada | ACEPTABLE con fix |
| Gestión de Tiendas | Gestión Tiendas | SÍ | núcleo | — | — | COHERENTE |
| Fichas de Costo (module) | gen-easy | SÍ | entrada | — | — | COHERENTE |
| Fichas de Costo | main (editor) | SÍ | núcleo | — | — | COHERENTE |
| Fichas de Costo | templates | SÍ (herramienta del dominio) | soporte | Solo accesible desde ActionsPanel del editor; un usuario SIN ficha abierta no la encuentra | Accesible desde hub del módulo | HIDDEN → DEBE SER ACCESIBLE |
| Fichas de Costo | arena-fc | SÍ (experimentación del dominio) | paralela | **SIN NINGÚN acceso UI en src/ (orphan)** | Tarjeta/entrada propia | **HUÉRFANO → DEBE SER VISTA** |
| Fichas de Costo | cost-analytics | PARCIAL | analysis | Vive en ANÁLISIS y a la vez como tab (dual-dominio); nombre no dice "de fichas" | Mantener dual con nombre "Análisis de Fichas" | ACEPTABLE |
| Fichas de Costo | view-assisted / view-reading | SÍ pero NO SON TABS | modos del editor | Modelados como tabs técnicas (URL) + modos (panel) — doble realidad conceptual | Tratarlos como MODOS del editor (ya lo son); quitar la ilusión de tab | DEBE SER ACCIÓN (modo) |
| Fichas de Costo | massive-gen / steel-calculator | SÍ | herramientas | Solo ActionsPanel | Ídem templates | HIDDEN |
| Fichas de Costo | ai-chat | SÍ (Darian embebido) | asistente | Duplica capacidad global chat con contexto de ficha | Correcto como contexto | COHERENTE |
| Fichas de Costo | audit | SÍ | control | — | — | COHERENTE |
| Inventario | Stock / Catálogo / Trazabilidad | SÍ | núcleo | Catálogo y Trazabilidad son vistas técnicas (catalog, history) reutilizadas como tabs — coherente | — | COHERENTE |
| Inventario (familia) | Lotes (lots) | SÍ | profundización | igual patrón | — | COHERENTE |
| WhatsApp / Telegram hubs | Dashboard/Config/Conversaciones/Grupo/Invitaciones | SÍ | ciclo del bot | — | — | COHERENTE |
| IPV (experimental) | 23 tabs por rail interno | SÍ | banco de trabajo | Rail propio no estándar (intencional, GATE 0.1) | — | ACEPTABLE (experimental) |
| POS (Vender) | — | n/a | — | Modo Cajero Express + Vale de Salida dentro del flujo (no tabs) | — | COHERENTE |
| Dashboard tienda (overlay) | RESUMEN/PRODUCTOS/COMPORTAMIENTO | SÍ | análisis tienda | — | — | COHERENTE |

## Hallazgos del gate

1. **El patrón "hub con tabs" está bien aplicado** en Ventas (GATE 1.3), Inventario, WhatsApp/Telegram, IPV. La mezcla dañina está concentrada en **Gestión de Tiendas (default=Tablón)** y en el **modelo interno de cost-sheets** (tabs técnicas que en realidad son modos/herramientas/vistas huérfanas).
2. **Tabs que son funcionalidades independientes**: arena-fc (debe ser vista/tarjeta), templates+massive-gen+steel-calculator (herramientas que necesitan caminos sin ficha abierta).
3. **Tabs que mezclan dominios**: Tablón (comunicación) dentro de Gestión de Tiendas (admin de tiendas); warehouses (logística) con breadcrumb de Gestión de Tiendas.
4. **Tabs históricas**: `view-assisted`/`view-reading` como tabs técnicas de URL sobreviven de una arquitectura anterior en que eran secciones del sidebar; hoy son modos — la URL técnica es compatibilidad legítima, pero view-tips y navigation-map las siguen tratando como secciones (labels residuales).
5. **Sin mezcla administración/operación detectada** en OPERACIÓN (Vender/Ventas correctas tras GATE 1.3); SISTEMA contiene solo administración; AYUDA solo documentación.
