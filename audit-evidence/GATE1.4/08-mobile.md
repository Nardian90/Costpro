# GATE 1.4 — 08 MOBILE (GATE 11)

Fecha: 2026-09-21 · Método: agent-browser viewport 375×720 (+ evaluación estructural 390/768/1024/1280/1440 por derivación de la misma fuente única MOBILE_MAIN_TABS). Capturas: mobile-375-inicio.png, mobile-375-inicio2.png, mobile-375-mas-sheet.png, mobile-375-pos.png.

## Estructura móvil (derivada, browser verificado)

- **Tab bar fija 4+1**: VENDER · RECIBIR · INVENTARIO · CAJA · **MÁS** (+ control OCULTAR). Estado activo por PROCESO (MOBILE_MAIN_TABS.activeViews) — verificado: en POS el tab VENDER activo; con breadcrumb /INICIO/ANÁLISIS el drawer muestra el trail.
- **Sheet "Más Opciones"** (browser ✓ enumerado): selector de tienda (10 tiendas) + Inicio + [OPERACIÓN: Ventas, Servicios Recibidos, Ajustes Documentales, Etiquetas y Códigos, Órdenes de Compra, Transferencia Stock, Fichas de Costo, Estructura de Costo, Costeo Dinámico, Órdenes de Producción, Trabajadores, Gestión de Tiendas, WhatsApp, Telegram] + [ANÁLISIS: Dashboard de Tiendas, Tablero Dinámico, Inteligencia Cambiaria, Reportes, Análisis ABC] + [SISTEMA: Ajustes…Cierre Fiscal] + [AYUDA: Centro…Marco Legal] + [EN DESARROLLO: IPV, Pick3, Billetera] + [Extensiones: Nueva Recepción, Chat con Darian (IA), Vitrina Pública].
- mobileHide aplicado correctamente: sales/cash/inventory_count/devolutions/quotations/accounts-* NO están en el sheet (alcanzables por Ventas hub); calculator NO está (widget del shell).
- **Drawer lateral** (hamburger): mismo árbol del sidebar con búsqueda + trail (/INICIO/ANÁLISIS) + Chat con Darian prominente. Browser: se abrió solo al cargar (persistencia de estado del sidebar de la sesión desktop) — comportamiento a pulir en móvil (debería iniciar cerrado).

## Hallazgos móviles

| ID | Hallazgo | Severidad | Evidencia |
|---|---|---|---|
| UX-007a | Labels truncados en tab bar a 375: "VEND…", "RECIB…", "INVE…" (labels fijos de 4+1 no se acortan bien) | P3 | mobile-375-inicio2.png |
| UX-007b | Tab bar contiene MÁS y OCULTAR — "Ocultar" la propia barra es un control raro para novato (¿y cómo vuelvo a mostrarla?) | P3 | mobile-375-inicio2.png |
| UX-007c | Drawer abierto al cargar por estado persistido del desktop | P2 | mobile-375-inicio.png |
| UX-007d | Sheet MÁS: lista plana larga (~35 ítems) agrupada por secciones sin plegado — en 375 requiere mucho scroll; Fichas de Costo está enterrada en el grupo Operación (sin sección "Costo" visible como grupo con sus hijos colapsados) | P2 | mobile-375-mas-sheet.png |
| UX-007e | Capacidades ocultas del dominio Costo (asistido/reading/arena/templates/tools) TAMBIÉN son invisibles en móvil (no hay canal alternativo) — una vista no se considera recuperada si solo funciona en desktop: aquí ni desktop ni mobile la exponen | P1 (agrava P0/P1 de 02/05) | cruce con 05-orphan-inventory |
| UX-007f | POS móvil OK (turno alerta, carrito, escáner) — paridad desktop ✓ | OK | mobile-375-pos.png |
| UX-007g | Overflow horizontal 375: NO detectado (scrollWidth==375) en Inicio | OK | eval |

## Veredicto de canales (GATE 22 aplicado a móvil)

- Ventas, Caja, Historial, Inventario, Recepciones, Gestión de Tiendas, Vitrina, Noticias, Ajustes: **DIRECTLY DISCOVERABLE en móvil** (tab/sheet/palette-móvil).
- Arena FC, Ofertas, Clientes, Conciliación, Asistido, Informe (como entrada independiente), Plantillas, Masiva, Estructural: **ORPHAN también en móvil** (profundidad de navegación infinita — no hay camino).
- La palette móvil existe dentro del shell (⌘K/Ctrl+K + botón "Abrir centro de comando" en drawer).
- Breadcrumbs móviles: drawer muestra trail compacto (/INICIO/ANÁLISIS) ✓; en vistas no hay breadcrumb visible en 375 (el header muestra título) — aceptable con back correcto del tab bar.
