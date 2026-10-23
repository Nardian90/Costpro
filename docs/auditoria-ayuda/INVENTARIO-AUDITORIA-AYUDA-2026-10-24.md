# Inventario de Auditoría Documental — Ayuda de COSTPRO 4 Multitienda

**Fecha**: 2026-10-24 (actualizado con misión complementaria de cierre de cobertura)
**Base de verificación**: `main` @ `1327feb3d` (incluye merge del PR #1463) · rama de trabajo `docs/auditoria-ayuda-integral-costpro`
**Método**: cada afirmación relevante de la ayuda se contrastó con el código real (vistas, APIs, RPCs, migraciones, navegación y tests). Fuente única de navegación: `src/config/navigation/navigation-definition.ts`.
**Actualización**: segunda pasada completa sobre los documentos pendientes (§2.5) y ayudas nuevas para las 4 vistas sin documentación (§4.4). Ver §6.

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

### 2.5 PENDIENTES DE SEGUNDA PASADA → RESUELTOS (10 documentos)

Estos documentos se revisaron a nivel de rutas/afirmaciones evidentes sin encontrar errores en la primera pasada, pero sin verificación campo-a-campo. **La segunda pasada (misión complementaria) los verificó contra la implementación y TODOS presentaban defectos demostrables; fueron corregidos con fixes dirigidos.** Nota de conteo: la primera pasada etiquetó «9» pero listaba 10 archivos; el conteo correcto es 10.

| Documento | Veredicto | Correcciones aplicadas |
|-----------|-----------|------------------------|
| `04-configuracion/administrar-tiendas.md` | **CORREGIDO** | Rutas fantasma «CONFIGURACIÓN > Administrativa» → reales (OPERACIÓN > Gestión de Tiendas; SISTEMA > Usuarios/Roles); flujo de creación de tienda real (**Nueva Sucursal** → modal con Nombre + URL pública → **Crear Tienda**, detalles después en Configuración de Tienda); **Nuevo Usuario** con «Asignar Contraseña (Opcional)»; restablecer contraseña = **Enviar correo de recuperación** (enlace, no contraseña temporal) + Cambiar contraseña; añadido rol **costo**; Costo accesible a manager/encargado; cierres de caja = admin/manager/**encargado**; eliminación de usuario = soft delete bloqueado por **membresías activas**; logo en recibos matizado (recibo térmico lleva nombre de tienda) |
| `04-configuracion/herramientas-sistema.md` | **CORREGIDO** | El Tablón de Noticias (Análisis) NO es admin-only: intro separa herramientas de Sistema (admin) del Tablón (todos los roles); Cierre Fiscal: **cerrar ≠ bloquear** (Bloquear Periodo es acción aparte de admin, posterior al cierre) |
| `04-configuracion/redes-sociales.md` | **CORREGIDO** | Pestañas reales: **Conexión y Config** (WhatsApp) / **Bot y Config** (Telegram); **Grupo de Ventas** (no «Grupo») |
| `04-explicacion/02-que-es-ficha-costo.md` | **CORREGIDO** | FAQ de indexación por IPV eliminada (no existe; lo real es **Costeo Dinámico**); «6 métodos de costeo» → esquema real de **costeo absorbente** + Costeo Dinámico; modos reales (Resumen/Completo/Asistido/Informe/Vistazo/Auditoría — no «5 modos» con nombres inventados); `ref()` referencia filas de la misma ficha (no otras fichas); «firmas digitales» → bloques de **Firmas** («Elaborado por»/«Aprobado por», campos obligatorios); typo «Quando» |
| `04-explicacion/03-que-es-ipv.md` | **CORREGIDO** | **Desambiguación explícita de los 3 sentidos de IPV** (aviso en cabecera: vista activa `ipv_ventas` «IPV — Ingresos por Ventas» vs módulo experimental EN DESARROLLO vs «Tabla IPV» histórica); estado experimental/admin-only alineado con CP-INFRA-002; reglas de matching corregidas contra el motor real (`engine.ts`: HARD_REF busca código de producto, CASH_FILL = Inyección de Efectivo, AUTO_SUPPLY = Auto-Suplencia; GOAL_WITH_TOLERANCE/PRICE_FLEX sin implementar); eliminada la promesa de comparación con índices oficiales (ONEI/Banco Central) y reportes fiscales «en el formato que piden»; enlace roto a «Cómo usar el IPV» (no existe) sustituido por la guía nueva de ipv_ventas |
| `04-explicacion/04-por-que-auditoria.md` | **CORREGIDO** | **Solo admin accede a la vista de Auditoría** (roles:['admin']; manager/encargado NO); filtros reales (evento, fechas, tienda, búsqueda — sin monto/severidad/usuario); exportación = **CSV** (no PDF/Excel); sin dirección IP (no existe en audit_logs ni UI); retención: sin política fija para auditoría (tablas fiscales 7–10 años documentales); «quién audita al auditor» corregido (no se registran lecturas); tabla Auditoría vs Monitoreo corregida (Monitoreo = consumo infra Vercel+Supabase, admin-only, 30 días); logins no se escriben en auditoría global |
| `04-explicacion/06-como-funciona-offline.md` | **CORREGIDO** | Tabla offline realista: cerrar caja/reportes/historial/crear productos NO funcionan offline; la venta offline queda **en cola local** y el inventario/caja se actualizan **al sincronizar** (no localmente); transferencias SÍ se pueden crear offline (la confirmación en destino requiere conexión); eliminada la «nube tachada» en historial; sin cifrado local (IndexedDB en claro — protección = dispositivo con sesión); «Centro de Errores» (no existe) → indicador offline POS/Recepción + modal de conflictos; ventana «24h» eliminada (control por rol); límites de cola (10.000 ventas, tiempos) y consumo «1-2 MB/h» sin base en el código — retirados o matizados |
| `04-explicacion/07-aislamiento-por-tienda.md` | **CORREGIDO** | El catálogo **NO es compartido** (products.store_id, SKU único por tienda); clientes por tienda; proveedores no son entidad compartida; sin URLs `/tienda-b` (el bloqueo real es backend RLS+canViewStore); el consolidado real es el tablero de **Gestión de Tiendas** (no «Todas las tiendas» en Reportes); intentos de acceso rechazados van a logs del servidor (no a la Auditoría de la interfaz) |
| `02-gestion/herramientas-globales.md` | **CORREGIDO** | Rutas «CONFIGURACIÓN > Ajustes» → **SISTEMA > Ajustes**; proveedor **z.ai (GLM-4)** por defecto (sin API key) añadido a la tabla; «Configuración de Darian AI» + botón **Agregar**; notificaciones reales: 2 (Alertas de Stock Bajo, Confirmación de Ventas) — retiradas «Recepción de transferencia» y «Recordatorio de cierre»; impuestos = Gestión de Impuestos (listar/activar-desactivar, sin edición de tipo/valor/umbral); conectividad = **4G Rápido / 3G Ahorro**; offline: las ventas se encolan y sincronizan (no «solo lectura»); calculadora en la **barra lateral**; «encriptadas» → aviso de no exposición tras registro |
| `02-gestion/reportes.md` | **CORREGIDO** | Acceso real: **solo admin y manager** (manager limitado a sus membresías); formato **Legal eliminado** (solo A4/Carta); atajos reales (Hoy/Semana/Mes/Mes anterior) y campos **Desde/Hasta**; vista previa = **borrador HTML con 5 registros** (no PDF embebido); PDF final se abre en **pestaña nueva** + exportación **Excel** añadida; PDF sin logo/encabezado/pie inventados; «Registro de Auditoría» con acción `report_generated` inexistente → **Historial** (tabla report_runs); Kardex/Auditoría con aviso **Implementación Parcial** (PDF puede venir vacío) y Kardex exige producto; dirección IP retirada de las métricas de Auditoría |

**Correcciones replicadas por verificación cruzada** (mismos defectos hallados en otros documentos, corregidos en esta pasada):

| Documento | Corrección |
|-----------|-----------|
| `03-referencia/02-roles-permisos.md` | Tabla de permisos: Ver auditoría → **solo admin**; Ver monitoreo → **solo admin**; Generador de Reportes → admin/manager (warehouse/clerk/encargado fuera); ventana «24h» eliminada (Anular ventas según rol, coherente con MODELO C); descuentos: umbral real **15%** con PIN de supervisor (sin niveles 20/50); secciones por rol alineadas; FAQ del contador sin «auditoría» para manager |
| `04-explicacion/01-que-es-multi-tienda.md` | «El catálogo maestro es compartido» → **catálogo por tienda** (SKU/precio/stock por tienda); «Lo que NO cambia»: retirados catálogo compartido y clientes/proveedores compartidos |
| `02-como-hacer/01-como-cambiar-tienda.md` | «Lo que NO cambia»: catálogo/clientes compartidos → por tienda (coherente con products.store_id y customers.store_id) |

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
4. **Módulos sin ayuda**: Inventario Físico (documentado en este PR); las vistas `ingresos_egresos`, `work_dates`, `ipv_ventas` y `cash_report` **documentadas en la misión complementaria** (ver §6) — todas existían en la navegación activa y recibieron guía propia, mapeo contextual y alias de búsqueda.
5. **Funcionalidades retiradas presentadas como activas**: Pick3/Billetera/Academia/Conciliación (CP-INFRA-002) — marcadas como retiradas.
6. **Limitación conocida documentada**: «Anular pago» en el historial de pagos de Servicios Recibidos falla contra BD (SQLSTATE PT007, sin flujo de reversión) — hallazgo funcional fuera del alcance de este PR, documentado en la ayuda con advertencia al usuario.

---

## 5. Resumen numérico

| Métrica | Valor |
|---------|-------|
| Documentos de ayuda inventariados | 72 (+ índice de búsqueda) |
| Verificados en profundidad contra código | 62 (48 primera pasada + 14 segunda pasada y replicados) |
| Reescritos por completo | 10 |
| Nuevos | 5 (25 inventario físico + 26/27/28/29 misión complementaria) |
| Corregidos (fixes dirigidos) | 28 (25 primera pasada + 10 segunda pasada − 3 solapados + 3 replicados) |
| Verificados sin cambios | 12 |
| Capturas referenciadas rotas | 0 |
| Cambios de lógica de negocio / BD / permisos | 0 |

> Detalle del recálculo: los 10 documentos de la §2.5 pasaron de «pendientes» a «corregidos»; se añadieron 3 correcciones replicadas (02-roles-permisos, 01-que-es-multi-tienda, 01-como-cambiar-tienda); las 4 vistas nuevas se suman como documentos nuevos. La métrica «corregidos» cuenta documentos únicos tocados con fixes dirigidos.

---

## 6. Misión complementaria — cierre de cobertura y validación contextual (2026-10-24)

### 6.1 Ayudas nuevas para las 4 vistas sin documentación

Todas las vistas **existen en la navegación activa** (no están en EN DESARROLLO) y fueron auditadas contra el código con evidencia archivo:línea antes de escribir una sola línea:

| Documento nuevo | Vista | Ubicación real en menú | Contenido verificado |
|----------------|-------|------------------------|---------------------|
| `02-como-hacer/26-como-registrar-ingresos-egresos.md` | `ingresos_egresos` «Ingresos/Egresos» | OPERACIÓN → Caja | Tabla `cash_flow_documents` + RPCs (migración 20261021000001): 2 tipos × 6 conceptos (constitución/reposición/devolución total-parcial del fondo de cambio, otro ingreso/egreso), numeración IE-AAAA-NNNNN, estados Confirmado/Anulado (sin borrador ni edición), monedas CUP/USD (sin EUR), tasa resuelta por el servidor (tienda → BCC → elToque), 6 KPIs, comprobante PDF, efectos en arqueo v2.21.0 y Reporte Entrega, anulación con fila contraria y turno vigente, permisos (registrar +clerk; anular admin/manager/encargado). Diferencia explícita con Reporte Entrega (entrega de dinero), CxP, comisiones y Servicios Recibidos |
| `02-como-hacer/27-como-usar-fechas-trabajo.md` | `work_dates` «Fechas de trabajo» | OPERACIÓN → Control operativo | Preferencia personal por usuario+tienda+tipo (localStorage, sin entidad BD); 12 tipos de movimiento de `movement-types.ts` con estados Configurable/Fija/Informativa; matriz de 8 columnas; forward-only (mín = MAX de la tienda), máx = hoy Habana, piso 6 meses; convención NOW()/mediodía; NO confunde jornada con turno de caja (advertencia explícita); no hay totales monetarios; desambigua la preferencia caducada |
| `02-como-hacer/28-como-consultar-ipv-ventas.md` | `ipv_ventas` «IPV — Ingresos por Ventas» | OPERACIÓN → Ventas | IPV = **Ingresos por Ventas** (desambiguación de los 3 sentidos del acrónimo); informe de solo lectura bajo demanda («Generar informe»), 12 columnas verificadas contra tabla/PDF/Excel, identidad Ef = Ei + EN + DV − V − VS + AJ + TR; devoluciones con columna propia de cantidades Y resta del importe; incidencias informativas («Reportado, no ajustado»); límite 366 días; por tienda; PDF (nota metodológica) y Excel (3 hojas) |
| `02-como-hacer/29-como-generar-reporte-entrega.md` | `cash_report` «Reporte Entrega» | OPERACIÓN → Ventas (+ accesos desde Caja, POS y Trabajadores) | «Reporte de Caja — Entrega»: cuadre esperado vs contado por denominaciones (cuadrado/sobrante/faltante), CUP/USD **nunca se suman**, métodos Efectivo/Transferencia/Zelle (+ «Ventas mixtas sin desglosar»), Resumen del Día con fórmula del efectivo esperado, atribución por día de negocio (ventas por registro; ajustes/pagos por payment_date; comisiones por paid_at), ajustes extraordinarios **deshabilitados** (flag off, 503), 3 plantillas PDF con firmas configurables, Excel 4 hojas |

**Regla respetada**: no se inventó ningún tipo de movimiento, moneda ni automatización; las diferencias informativas de conciliación (IPV) y las limitaciones (ajustes 503) se documentaron como tales, no como órdenes de acción.

### 6.2 Integración contextual verificada

| Mecanismo | Cambio | Verificación |
|-----------|--------|--------------|
| `HelpLauncher.tsx` (`HELP_DOC_BY_VIEW`) | +4 mapeos: `ingresos_egresos`, `work_dates`, `ipv_ventas`, `cash_report` → sus guías | El botón «?» del Header y el botón flotante usan este mapa globalmente: ayuda correcta desde cada vista, sin tocar pantallas |
| `search-keywords.json` | 100 → **132 alias** (33 términos nuevos + 8 rutas ampliadas; integridad validada: ninguna clave/ruta perdida vs HEAD) | `/api/help-docs?search=…` en vivo: «fondo de cambio»→26, «fechas de trabajo»→27, «retro-fechar»→27, «ingresos por ventas»→28, «entrega de dinero»→29, «desglose de billetes»→29, «jornada»→27+caja, «ipv ventas»→28 |
| `view-tips.ts` | +4 tips para las vistas nuevas (con labels coherentes con la UI) | Tips mostrados en el splash de cada vista |
| Listado del Centro de Ayuda | Los 4 docs aparecen en la sección «Cómo Hacer» (29 docs) | `/api/help-docs` estructura: 200 OK para los 4 `path` |

No se añadió ningún botón de ayuda a pantallas concretas ni un segundo sistema de documentación: se reutilizó el mecanismo existente (HELP_DOC_BY_VIEW + búsqueda por alias).

### 6.3 Limitaciones funcionales documentadas (sin corregir, fuera de alcance)

| Hallazgo | Tratamiento documental |
|----------|----------------------|
| **Anular pago** en Servicios Recibidos falla contra BD (SQLSTATE PT007, sin flujo de reversión) | Mantenida la advertencia en la guía de Servicios Recibidos (misión anterior); no se sugiere procedimiento alternativo no soportado |
| **Ajustes extraordinarios del Reporte Entrega deshabilitados** (flag `cashReportExtraordinaryAdjustment:false`, backend 503 «Función temporalmente desactivada») | Documentado en la guía 29 como estado actual (histórico visible, registros nuevos bloqueados) |
| **Kardex/Auditoría del Generador de Reportes devuelven PDF con datos vacíos** (aviso «Implementación Parcial» en la UI) | Documentado en reportes.md con la advertencia literal de la interfaz |
| **Cierre Fiscal**: existe texto de código «Solo un admin puede desbloquearlo» sin acción de desbloqueo | Incidencia funcional anotada aquí (no corregible en misión documental); la ayuda documenta cerrar ≠ bloquear y que el bloqueado no se reabre desde la interfaz |
| **3 sentidos de «IPV» conviviendo en el producto** (vista activa / módulo experimental / nombre histórico) | Desambiguación documental explícita en 03-que-es-ipv.md y en la guía 28 |
| `viewRegistry.ts` no registra `ipv_ventas`, `work_dates`, `cash_report` (registro parcial legacy; navegación resuelve por navigation-map/VALID_VIEWS) | Observación técnica anotada; no afecta navegación (cubierta por tests) ni la ayuda contextual (que usa HELP_DOC_BY_VIEW) |

### 6.4 Segunda pasada — método

Cada uno de los 10 documentos pendientes fue leído completo y verificado contra: navegación real (labels exactos de `navigation-definition.ts`), componentes de las vistas descritas, APIs/RPCs, permisos declarados, capturas referenciadas (public/help/capturas/), enlaces internos y contradicciones con los documentos reescritos en la primera pasada. Solo se corrigieron defectos demostrables (contradicción literal con el código); no hubo reescrituras estilísticas. Tres puntos quedan como PENDIENTE DE CONFIRMACIÓN (no demostrables por código estático): protección contra borrado de roles admin/manager, cifrado en reposo de claves API, columna de IP en el RPC de auditoría.
