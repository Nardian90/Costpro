# Inventario de Auditoría Documental — Ayuda de COSTPRO 4 Multitienda

**Fecha**: 2026-10-24
**Base de verificación**: `main` @ `1327feb3d` (incluye merge del PR #1463)
**Rama de trabajo**: `docs/auditoria-ayuda-integral-costpro`
**Método**: cada afirmación relevante de la ayuda se contrastó con el código real (vistas, APIs, RPCs, migraciones, navegación y tests). Fuente única de navegación: `src/config/navigation/navigation-definition.ts`.

---

## 1. Alcance cubierto

La ayuda del producto vive en dos focos:

1. **Centro de Ayuda in-app** (`/?view=help` y `/wiki`): sirve los Markdown de `knowledge/help/**` vía `/api/help-docs`, con búsqueda por alias (`search-keywords.json`) + contenido, y ayuda contextual por vista (`HELP_DOC_BY_VIEW` en `HelpLauncher.tsx`, botón «?» / `Ctrl+Shift+H`).
2. **Textos de ayuda contextual**: `src/config/navigation/view-tips.ts` (tips por vista en splash), tooltips/`title` en formularios, empty states, banners.

Inventario auditado: **68 documentos** en `knowledge/help/` (67 Markdown + `user_help.json`) más `search-keywords.json`, `view-tips.ts` y `HELP_DOC_BY_VIEW`.

**Herramientas**: auditoría de código dirigida por módulo (navegación, recepciones, transferencias, ajustes, vales, inventario físico, kardex, POS/checkout, pagos, caja/arqueo, comisiones, OC, OP, devoluciones, cotizaciones, ofertas, CxP/CxC, tasas, reportes, servicios recibidos, catálogo/exportaciones, usuarios/roles). Las 22 capturas referenciadas en `public/help/capturas/` fueron verificadas: ninguna ruta de imagen rota.

---

## 2. Clasificación final por documento

### 2.1 REESCRITAS por completo (10) — contradecían la implementación

| Documento | Problemas críticos detectados (evidencia) | Acción |
|-----------|-------------------------------------------|--------|
| `02-como-hacer/14-como-recibir-servicio.md` | Describía un módulo genérico de gastos (limpieza/plomería) con campos inexistentes (moneda, tasa, cuenta contable, garantía, fotos, subtotal/impuestos, «Guardar borrador», PDF, anulación 24 h, cuotas como registros separados). **Prioridad 1 de la misión** | Reescrita íntegra conforme a la implementación post-PR #1463: catálogo `service_types` (9 tipos semilla), estados Borrador→Activo→Anulado, pagos unpaid/partial/paid (PR #1462), distribución WAC opcional, CxP, arqueo v2.18.0, permisos, errores reales |
| `02-como-hacer/03-como-cerrar-caja.md` | «Multi-Tienda → Cierre de Caja» (sección inexistente), métodos Tarjeta/Mixto (no existen en arqueo), «Calcular diferencias», semáforo por montos, motivos-tipo, «arqueo parcial», cierre tardío, PDF automático — nada de eso existe | Reescrita: apertura con Fondo Inicial, Efectivo Contado/Transferencias Contadas, observaciones libres (≤1000), roles de cierre, Reporte Entrega, reapertura con motivo |
| `02-como-hacer/05-como-hacer-transferencia.md` | Estados En tránsito/Completada inexistentes; «descuenta en tránsito» FALSO (el stock se **reserva**); QR en PDF, responsable como campo, discrepancias tipificadas, guardar borrador — todo inexistente | Reescrita: PENDIENTE/CONFIRMADA/CANCELADA/REVERSADA, reserva de stock, confirmación atómica por destino, revertir/duplicar/exportar |
| `03-referencia/08-estados-transferencia.md` | Los 4 estados documentados no correspondían a los reales; diagrama y efectos de inventario erróneos | Reescrita con los estados reales y sus transiciones |
| `02-como-hacer/10-como-ajustar-inventario.md` | «Los 7 motivos» inexistentes (real: 4 causas + chips del ajuste rápido), umbral de autorización 50 und/1000 C$ sin evidencia, «Auditoría de Conteo» apuntaba al módulo equivocado | Reescrita: Ajustes Documentales (esperado/contado, En Proceso→Confirmar y Aplicar, revertir/duplicar) + ajuste rápido por producto |
| `03-referencia/07-causas-ajuste.md` | Catálogo de 7 causas con autorizaciones inventadas; el enum real es `STOCKTAKE_SHRINKAGE/SURPLUS, DAMAGED_GOODS, OTHER` + chips Merma/Error Conteo/Venta Omitida/Ajuste Manual | Reescrita |
| `02-como-hacer/12-como-usar-tasa-cambio.md` | Describía botones inexistentes («Aplicar tasa recomendada», «congelar», actualización 8:00); confundía Inteligencia Cambiaria (analítica) con las tasas operativas de tienda | Reescrita: tasas de tienda (`store_exchange_rates`) + confirmación diaria del día de negocio + Inteligencia Cambiaria como referencia |
| `02-como-hacer/13-como-pagar-comisiones.md` | Flujo paralelo inexistente (panel 2 pestañas, % simple, reporte PDF con firmas, casilla Excluir); el real es motor de 6 tipos de reglas + 4 pestañas + pago trazable integrado a Reporte Entrega y arqueo | Reescrita |
| `02-como-hacer/06-como-crear-orden-compra.md` | 8 estados ficticios, envío al proveedor/PDF/respuesta del proveedor inexistentes, campos moneda/tasa/IVA inexistentes | Reescrita: Borrador/Pendiente/Parcial/Recibida/Cancelada, recibir contra OC, Sugerir OC Inteligente (Premium) |
| `02-como-hacer/08-como-imprimir-etiqueta.md` | Opciones ficticias: elección EAN/Code128 (es automático), 1-4 etiquetas seleccionable (es fijo 4/carta), papel térmico, casillas de contenido, logo, moneda alternativa, límite 500 | Reescrita: modo repetición, cantidad por producto, límite 4 productos/lote, «Exportar a PDF» |

### 2.2 NUEVA (1) — módulo sin documentación

| Documento | Motivo |
|-----------|--------|
| `02-como-hacer/25-como-hacer-inventario-fisico.md` | El módulo **Inventario Físico** (PR #1456) no tenía ninguna ayuda. Nueva guía: corte, alcance, conteo ciego, 9 estados, conciliación, ajustes generados con badge IF-…, numeración IF-AAAA-NNNNN, roles — verificado contra `pi-types.ts`, `CreatePhysicalInventoryModal.tsx` y `PhysicalInventoryView.tsx` |

### 2.3 CORREGIDAS (25) — fixes verificables sin reescritura total

| Documento | Correcciones principales |
|-----------|--------------------------|
| `01-tutoriales/02-primera-venta.md` | Rutas Multi-Tienda→OPERACIÓN; banner de turno (rojo, no amarillo); métodos reales (Efectivo/Transferencia/Transf. Exterior/Mixto); `Alt+2`→`Ctrl+2`/`F9`; QR de verificación; **Deshacer 30 s**; devoluciones desde Ventas→Opciones |
| `01-tutoriales/03-primer-producto.md` | «Multi-Tienda→Catálogo Maestro»→«OPERACIÓN→Almacén→Inventario (tab Catálogo)»; «Terminal POS»→«Ventas→Vender» |
| `01-tutoriales/04-primer-reporte.md` | «Multi-Tienda→Generador de Reportes»→«ANÁLISIS→Reportes»; sin botón «Ayer»; sin filtros avanzados por categoría/cajero/método; columnas reales |
| `02-como-hacer/04-como-recibir-mercancia.md` | Rutas; sin campo Tienda ni wizard; botones reales (Guardar Pendiente/Confirmar Registro); sin Lote/Vencimiento; «Recibir contra OC»; FAQ catálogo (sí se puede «Agregar como nuevo»); sin ventana 24 h (reversión por rol); OCR/Excel/multimoneda documentados |
| `02-como-hacer/24-como-emitir-vale-salida.md` | Ya NO es solo toggle del POS: vista propia OPERACIÓN→Almacén→Vales de Salida con historial, filtros y **Devolver vale** (antes documentado como gap inexistente) |
| `03-inventario/gestion-inventario.md` | Sub-módulos reales (tabs Stock Actual/Catálogo/Trazabilidad); barcode automático sin selector de formato; Kardex con Costo Prom. (no «Valor Total» por movimiento); flujo de transferencias corregido; motivos reales; §7 sustituido por Inventario Físico; tabla de rutas actualizada |
| `03-inventario/catalogo-ventas.md` | Eliminada la semántica falsa «precios indexados IPV»; columnas reales (Cantidad/Descuento/Forma Pago editables); filtros reales; totales de venta (no de inventario); sin multi-selección Ctrl |
| `03-inventario/exportacion-catalogo.md` | Nombres reales de los 6 avatares (Ferretería, Tienda, Taller, Ofertas, Premium, Corporativo) |
| `02-como-hacer/09-como-exportar-catalogo.md` | Paso 4 reescrito: el modal real es plantilla+color+avatar (sin opciones por formato inventadas); datos Excel/PDF independientes |
| `03-inventario/flujo-punto-de-venta.md` | Métodos reales; «Poner en espera» eliminado; auditoría precio-bajo-costo es toast+log (no modal confirmatorio); Revertir (sin 24 h) + Deshacer 30 s; Ajuste de Impuestos post-venta; exportación solo Excel; tabla comparativa real |
| `02-como-hacer/07-como-aplicar-descuento.md` | Umbral real **15%** (`DISCOUNT_SUPERVISOR_THRESHOLD`); motivo texto libre solo con supervisor; sin niveles 20/50 ni configuración |
| `02-como-hacer/11-como-ver-historial-ventas.md` | Filtros reales (búsqueda única+estado+rango); Ref UUID truncado (no folio V-AAAA…); Revertir por rol (sin 24 h); exportación solo Excel; Duplicar/Ajuste de Impuestos/Resumen Consolidado |
| `02-como-hacer/19-como-procesar-devolucion.md` | El formulario no pide notas ni método de reembolso (default cash); documentada la limitación y la numeración NC |
| `02-como-hacer/20-como-crear-cotizacion.md` | Sin acciones de cambio de estado, sin PDF, sin conversión a venta automática |
| `02-como-hacer/16-como-crear-orden-produccion.md` | Ruta real (OPERACIÓN→Costo); tasa manual por pago (no «Tasa Inteligente»); anulación desde detalle |
| `03-referencia/09-estados-orden-produccion.md` | Añadido el estado `reversed` (V2.2) y sus transiciones |
| `03-referencia/06-metodos-pago.md` | «Zelle»→«Transf. Exterior» (label vigente); Mixto sigue existiendo como método explícito; USD/EUR solo en Transf. Exterior |
| `02-como-hacer/15-como-ver-uso-sistema.md` | Ruta real: SISTEMA→Monitoreo (admin) |
| `02-como-hacer/17-como-usar-paleta-comandos.md` | Sin botón de búsqueda en la barra superior (el acceso es ⌘K / pista del sidebar); la paleta no indexa fichas del usuario ni «crear producto»; sí cambia tiendas; ejemplos con «gasto/flete» |
| `02-como-hacer/01-como-cambiar-tienda.md` | El carrito con ítems pide confirmación (no se pierde en silencio) |
| `03-referencia/01-glosario.md` | «7 motivos»→motivos reales; «Auditoría de Conteo»→Inventario Físico |
| `03-referencia/02-roles-permisos.md` | Rol `almacen`→`warehouse` (nombre real) |
| `01-empezar/introduccion.md` | Selector de idioma no está montado en la barra superior (removida la referencia); composición real de la barra |
| `04-explicacion/08-seccion-en-desarrollo.md` | Alineada a CP-INFRA-002: solo IPV/Wiki/Marco Legal; retiro de Pick3/Billetera/Academia/Conciliación documentado |
| `05-referencia/pick3-workflow.md` | Marcado como **MÓDULO RETIRADO** (aviso en cabecera; contenido conservado como referencia histórica) |
| `04-explicacion/05-por-que-tasa-inteligente.md` · `02-gestion/procedimientos.md` · `02-gestion/crear-ficha-costo.md` · `04-configuracion/tienda-publica.md` | Rutas y nombres actualizados (ANÁLISIS→Inteligencia Cambiaria; OPERACIÓN→Gestión de Tiendas; COSTOS→OPERACIÓN→Costo; «Vender (POS)») |

### 2.4 VERIFICADAS SIN CAMBIOS (12)

`01-tutoriales/01-primer-inicio.md`, `02-como-hacer/02-como-cambiar-contrasena.md`, `02-como-hacer/18-como-usar-venta-por-conteo.md` (verificada a fondo: AL DÍA), `02-como-hacer/21-como-gestionar-clientes.md`, `02-como-hacer/22-como-crear-oferta.md` (AL DÍA, incluye ITBIS manual), `02-como-hacer/23-como-consultar-cuentas.md` (AL DÍA), `03-referencia/05-tipos-reportes.md` (AL DÍA: 11 tipos reales), `03-referencia/03-atajos-teclado.md`, `01-empezar/glosario.md` (resto), `01-empezar/primeros-pasos.md`, `04-explicacion/01-que-es-multi-tienda.md` (concepto de producto, vigente), `compliance/*` (fuera del alcance funcional).

### 2.5 PENDIENTES DE CONFIRMACIÓN (9) — sin discrepancias detectadas, verificación de detalle pendiente

Estos documentos se revisaron a nivel de rutas/afirmaciones evidentes sin encontrar errores, pero no recibieron verificación campo-a-campo por prioridad de criticidad:

`04-configuracion/administrar-tiendas.md`, `04-configuracion/herramientas-sistema.md`, `04-configuracion/redes-sociales.md`, `04-explicacion/02-que-es-ficha-costo.md`, `04-explicacion/03-que-es-ipv.md`, `04-explicacion/04-por-que-auditoria.md`, `04-explicacion/06-como-funciona-offline.md`, `04-explicacion/07-aislamiento-por-tienda.md`, `02-gestion/herramientas-globales.md` y `02-gestion/reportes.md` (rutas verificadas en lote; detalle pendiente). Se recomienda segunda pasada con el mismo método.

---

## 3. Cambios fuera de Markdown (justificados)

| Archivo | Cambio | Justificación |
|---------|--------|---------------|
| `knowledge/help/search-keywords.json` | 64→99 alias: servicios, gasto, flete, pago a proveedores, inventario físico, arqueo, Transf. Exterior, revertir venta, etc. Todas las rutas validadas | Sección 9 de la misión: descubribilidad por términos cotidianos |
| `src/config/navigation/view-tips.ts` | 3 tips desactualizados corregidos (`management-hub`: sin noticias; `sales-hub`: Caja ya es hub propio; `legal`: no es RGPD) | Son ayuda contextual vigente que contradecía la navegación real |
| `src/components/views/terminal/views/help/HelpLauncher.tsx` | `dashboard`→`01-primer-inicio.md`; añadidos `physical_inventory`→nueva guía y `vales_salida`→guía de vales | Ayuda contextual de vistas nuevas apuntaba al índice general o a un doc no relacionado |
| `src/components/views/terminal/views/received_services/ReceivedServicesView.tsx` | Label `Proveedor (opcional)` → `Proveedor *` | Contradicción ayuda-UX vs backend: el RPC exige proveedor (`ERR_SUPPLIER_REQUIRED`); el label inducía al error. Cambio de presentación, sin lógica |

**Sin cambios**: rutas, APIs, RPCs, tablas, políticas RLS, permisos, reglas de inventario/caja/ventas ni cálculos financieros.

---

## 4. Discrepancias transversales más importantes

1. **Topología de navegación**: 31 menciones a la sección «Multi-Tienda» (retirada en la reorganización GATE 1) repartidas en 19 documentos; todas corregidas a las secciones reales (OPERACIÓN/ANÁLISIS/SISTEMA/AYUDA/EN DESARROLLO).
2. **Estados documentados que no existen** (transferencias «En tránsito/Completada», OC «Enviada/Confirmada/Cerrada», ajustes con 7 motivos): riesgo alto de inducir operaciones incorrectas; corregidos con los enums/BD reales.
3. **Efectos financieros mal descritos**: la ayuda anterior sugería que registrar modificaba caja/inventario inmediatamente (servicios, transferencias). Corregido: registrar ≠ confirmar ≠ pagar, con la evidencia de RPCs y arqueo.
4. **Módulos sin ayuda**: Inventario Físico (documentado en este PR); vistas nuevas sin doc (`ingresos_egresos`, `work_dates`, `ipv_ventas`, `cash_report`) quedan pendientes como recomendación.
5. **Funcionalidades retiradas presentadas como activas**: Pick3/Billetera/Academia/Conciliación (CP-INFRA-002) — marcadas como retiradas.
6. **Limitación conocida documentada**: «Anular pago» en el historial de pagos de Servicios Recibidos falla contra BD (SQLSTATE PT007, sin flujo de reversión) — hallazgo funcional fuera del alcance de este PR, documentado en la ayuda con advertencia al usuario.

---

## 5. Resumen numérico

| Métrica | Valor |
|---------|-------|
| Documentos de ayuda inventariados | 68 (+ índice de búsqueda) |
| Verificados en profundidad contra código | 48 |
| Reescritos por completo | 10 |
| Nuevos | 1 |
| Corregidos (fixes dirigidos) | 25 |
| Verificados sin cambios | 12 |
| Pendientes de segunda pasada | 9 |
| Capturas referenciadas rotas | 0 |
| Cambios de lógica de negocio / BD / permisos | 0 |
