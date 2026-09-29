# F6 — 01 JOURNEY-BASED UX QA (F6-A)

Método: agent-browser sobre dev server (HTTP 200), DOM real vía accessibility snapshot
+ `eval` de contenido. Superficies verificadas por render de H1/breadcrumb/controles,
no solo HTTP. Capturas en `shots/`.

## JOURNEY 1 — ENTRADA · PASS

Paso | Verificación | Resultado
---|---|---
Landing 1280×800 | título correcto; jerarquía H1 "CostPro" → H2 "¿Qué quieres hacer?"; nav Inicio/Cómo Funciona/Funciones/Precios/FAQ; skip-link "Saltar al contenido principal" | ✓
Comprensión | dos entradas diferenciadas: Ficha de Costo (gratis, invitado) vs Entrar a COSTPRO (cuenta); CTA demo | ✓
Login modal | campos required con label; toggle "Mostrar contraseña"; "Entrar al sistema" primario; Google OAuth; enlaces legales | ✓
Post-login | H1 "Inicio"; sidebar (nav "Barra lateral de navegación") con buscador, ⌘K, pin por vista; store switcher; notificaciones; theme toggle; ayuda contextual por vista | ✓
Estados | sin superposiciones tras cerrar cookie-consent; notificación de sistema con dismiss accesible | ✓

Shots: `f6-j1-landing-1280.png`, `f6-j1-login-modal.png`, `f6-j1-app-dashboard-1280.png`.

## JOURNEY 2 — VENDER · PASS

Paso | Verificación | Resultado
---|---|---
Entrada | deep-link `?view=pos` → H1 **"Vender"** (nomenclatura F4; sin "Terminal de Venta"); breadcrumb Inicio→OPERACIÓN→VENDER; botón "Volver a Ventas" | ✓
Toolbar | vista cuadrícula/lista; carrito con contador aria ("Abrir carrito (N productos)"); Cajero Express; Historial; refrescar caja | ✓
Estado operativo | banner honesto "NO TIENES TURNO ABIERTO" con CTA a Caja (comunicación de estado, no bloqueo) | ✓
Grilla productos | buscador con hint código de barras/SKU; scanner cámara; radios por categoría; toggle agotados; cada card con aria-label completo "Agregar X al carrito. Precio: $Y. Stock: Z" | ✓
Carrito | suma correcta; eliminar por ítem; anular carrito (destructivo etiquetado); CTA **"Cobrar 1 productos por $350.00"** con monto | ✓
Cobro | modal "💳 PAGO $350.00" con métodos; **Escape cierra** y el carrito se preserva (0 pérdida de estado) | ✓

Sin alteración de lógica de venta (no se confirmó ninguna venta). Shots: `f6-j2-pos-1280.png`, `f6-j2-cart-open.png`, `f6-j2-checkout-modal.png`.

## JOURNEY 3 — VENTAS ADMINISTRATIVAS · PASS

Vista | H1 | Breadcrumb | Nomenclatura F4
---|---|---|---
Hub `?view=sales-hub` | Ventas | — | tarjetas VENDER / CAJA / HISTORIAL DE VENTAS + OTRAS OPCIONES; ALERTAS OPERATIVAS ✓
`?view=sales` | Historial De Ventas | OPERACIÓN→VENTAS | ✓ sin "Terminal de Venta"; Exportar Excel etiquetado
`?view=cash` | Caja | Inicio→OPERACIÓN→VENTAS | ✓
`?view=devolutions` | Devoluciones | Inicio→OPERACIÓN→VENTAS | ✓
`?view=quotations` | Cotizaciones | Inicio→OPERACIÓN→VENTAS | ✓

Retorno por breadcrumb verificado en hub→Historial. Cobros/Exportar presentes en el
conjunto certificado F4 (palette/deep-link). Shots: `f6-j3-ventas-hub.png`,
`f6-j3-historial-ventas.png`, `f6-j3-caja.png`.

## JOURNEY 4 — INVENTARIO · PASS

Vista | Verificación | Resultado
---|---|---
`?view=inventory` | H1 Inventario; tabs internas **STOCK ACTUAL / CATÁLOGO / TRAZABILIDAD** (patrón F4 certificado); breadcrumb Inicio→OPERACIÓN→ALMACÉN→INVENTARIO | ✓
Catálogo búsqueda | filtro "ZZZNOEXISTE999" → **filtered-empty**: "Sin resultados / No se encontraron productos… / LIMPIAR FILTROS" (acción de recuperación) | ✓
Toolbar catálogo | FILTROS · Exportar · Importar · Incremento Precios · CREAR (jerarquía CTA correcta) | ✓
`?view=reception_list` | H1 **Recepciones** (nomenclatura F4) | ✓
`?view=inventory_count` | H1 Venta por Conteo; densidad de tabla estable | ✓

Shots: `f6-j4-inventario.png`, `f6-j4-catalog-filtered-empty.png`, `f6-j4-conteo.png`.

## JOURNEY 5 — ANÁLISIS · PASS

Vista | H1 | Breadcrumb | Resultado
---|---|---|---
`?view=dashboard` | Inicio / TABLERO CONSOLIDADO (multi-tienda) | Inicio | KPI por tienda con acciones aria completas ✓
`?view=reports` | Reportes | Inicio→ANÁLISIS→REPORTES | ✓
`?view=ipv` | IPV / Control IPV | Inicio→EN DESARROLLO→IPV | ✓ (sección experimental correcta)
`?view=cost-sheets` | Fichas De Costo | — | ✓

Gráficos/KPI sin ruido de decoración (herencia F5). Shots: `f6-j5-ficha-costo.png`.

## JOURNEY 6 — SISTEMA · PASS

Vista | Verificación | Resultado
---|---|---
`?view=settings` | H1 **Ajustes**; breadcrumb Inicio→SISTEMA→AJUSTES; formularios con labels; feedback presente | ✓
`?view=management-hub` | H1 Gestión De Tiendas; breadcrumb Inicio→OPERACIÓN→GESTIÓN DE TIENDAS; hub tiendas con KPIs | ✓
Ruta inexistente `?view=management` | fallback **"Módulo No Disponible"** honesto con breadcrumb real — sin rutas falsas (regla F4) | ✓ (comportamiento correcto)

Shots: `f6-j6-gestion-tiendas.png`.

## Veredicto journeys

```text
6/6 PASS · 16+ superficies con DOM real verificado · 0 regresiones funcionales
0 reintroducciones de nomenclatura legacy ("Terminal de Venta" ausente en todo el recorrido)
```
