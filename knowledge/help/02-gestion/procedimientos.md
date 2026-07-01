# Procedimientos Operativos

**Importante:** Esta sección describe los flujos operativos paso a paso para las tareas más comunes en CostPro. Cada procedimiento incluye los requisitos previos, los pasos detallados y el resultado esperado.

## Contenido

- [1. Conciliación Bancaria (IPV)](#1-conciliación-bancaria-ipv)
- [2. Gestión de Fichas de Costo](#2-gestión-de-fichas-de-costo)
- [3. Registro de Ventas en POS](#3-registro-de-ventas-en-pos)
- [4. Recepción de Inventario](#4-recepción-de-inventario)
- [5. Administración de Tiendas y Usuarios](#5-administración-de-tiendas-y-usuarios)
  - [Crear una Tienda](#crear-una-tienda)
  - [Crear un Usuario](#crear-un-usuario)
  - [Asignar Roles](#asignar-roles)
- [6. Transferencias entre Tiendas](#6-transferencias-entre-tiendas)
- [7. Exportación de Catálogo](#7-exportación-de-catálogo)
- [8. Ventas desde el Catálogo](#8-ventas-desde-el-catálogo)

---

## 1. Conciliación Bancaria (IPV)

**Requisitos previos:** Contar con acceso al módulo IPV (roles admin o manager) y tener extractos bancarios disponibles en formato compatible (CSV, JSON, texto plano). La conciliación sigue un flujo operativo estándar de 6 pasos (SOP) que garantiza la trazabilidad completa del proceso.

### Paso 1 — Ingesta de Extracto Bancario

1. Acceder al módulo **IPV** desde la barra lateral de navegación.
2. Navegar a la sección **Extracto Bancario** (dentro del grupo Ingesta).
3. Hacer clic en **Importar Extracto** y seleccionar el archivo bancario.
4. El sistema ejecuta automáticamente el **parser bancario** que identifica y clasifica cada transacción del extracto.
5. Al completar la ingesta, se genera un registro con el resumen de transacciones importadas.

> **Nota:** CostPro incluye un parser específico para extractos BANDEC. Si tu banco no está soportado, los extractos deben estar en formato CSV con las columnas estándar: fecha, descripción, monto, tipo (crédito/débito).

### Paso 2 — Catálogo de Transacciones

1. Tras la ingesta, navegar a **Gestión de Transacciones** para revisar las transacciones importadas.
2. Cada transacción muestra su estado: **Conciliada** (emparejada automáticamente), **Pendiente** (sin coincidencia) o **Rechazada** (coincidencia incorrecta).
3. Usa los filtros para ver solo transacciones pendientes.
4. Revisa las descripciones y montos de las transacciones que no se conciliaron automáticamente.

### Paso 3 — Configuración de Reglas de Matching

1. Si la tasa de conciliación automática es baja, navega a **Reglas de Negocio**.
2. Revisa y ajusta las reglas de matching que el motor utiliza para emparejar transacciones bancarias con registros internos.
3. Las reglas se configuran por campo: coincidencia por monto exacto, por rango de monto con tolerancia, por descripción parcial, por fecha.
4. Puedes definir **límites de tolerancia** para aceptar coincidencias con diferencias menores (ej. diferencias de hasta $0.50 por redondeo bancario).
5. Guarda las reglas actualizadas.

> **Tip:** Reglas bien configuradas pueden lograr tasas de conciliación automática superiores al 90%, reduciendo significativamente el trabajo manual.

### Paso 4 — Conciliación Manual

1. Vuelve a **Gestión de Transacciones** y filtra por **Pendientes**.
2. Para cada transacción pendiente, revisa la información del extracto bancario.
3. Haz clic en **Conciliar Manualmente** para buscar la coincidencia en los registros internos.
4. Selecciona la transacción coincidente del catálogo interno.
5. Confirma la conciliación. El estado cambia a **Conciliada**.

> **Importante:** Si una transacción del extracto bancario no tiene equivalente interno (ej. un cobro nuevo, un cargo bancario), puedes registrarla como transacción manual directamente desde esta vista.

### Paso 5 — Simulación y Análisis

1. Antes de cerrar el período, navega a **Simulación de Escenarios** para analizar el impacto de las transacciones no conciliadas.
2. El motor de simulación permite modelar cómo quedarían los balances si se aplican diferentes criterios de conciliación.
3. Revisa el **Desglose Operativo** para ver la separación entre ventas reales y conciliadas.
4. Consulta la **Trazabilidad de Flujo** para rastrear el origen de cada transacción.

### Paso 6 — Reportes y Auditoría

1. Genera el **Reporte de Auditoría** para documentar el proceso completo de conciliación.
2. Consulta el **Registro de Auditoría** para verificar que todas las transacciones tengan un estado final (conciliada, rechazada o registrada manualmente).
3. Verifica el **Balance de Comprobación** (vista pivot) para confirmar que los saldos del extracto bancario coincidan con los saldos internos.
4. Si hay diferencias residuales, investiga y documenta la causa antes de cerrar el período.
5. Genera el archivo de **Exportación MVT** si se requiere enviar los datos al sistema contable externo.

**Resultado esperado:** Extracto bancario completamente conciliado. Todas las transacciones con estado final documentado. Balance de comprobación cuadrado (diferencia cero o explicada). Reporte de auditoría generado y archivo MVT exportado (si aplica).

---

## 2. Gestión de Fichas de Costo

**Requisitos previos:** Tener creados al menos los productos base en el catálogo.

1. Acceder al módulo **Costos** y hacer clic en **Nueva Ficha de Costo**.
2. Completar el encabezado: código, nombre, fecha, cantidad objetivo, moneda y categoría.
3. Agregar secciones (filas padre) que representen los componentes del costo.
4. Dentro de cada sección, agregar filas hijas con los costos individuales (materia prima, mano de obra, etc.).
5. Seleccionar el **método de cálculo** para cada fila: FIJO, FÓRMULA, PRORRATEO, ANEXO o COEFICIENTE.
6. Para cálculos con variables, usar fórmulas de referencia: `ref(SECCIÓN.FILA)` para valores de otras celdas, `vh("Concepto")` para valores globales.
7. Configurar los **Anexos** (I a X) para documentación complementaria: imágenes, especificaciones, cotizaciones.
8. Ejecutar la **Auditoría Automática** para detectar errores: ciclos, referencias rotas, discrepancias semánticas.
9. Guardar la ficha y **exportar** en el formato deseado: PDF para presentación, Excel para análisis, JSON para respaldo.

**Resultado esperado:** Ficha de costo validada y exportada con precio final calculado.

---

## 3. Registro de Ventas en POS

**Requisitos previos:** Tener productos en el catálogo con stock disponible y la tienda activa seleccionada.

1. Acceder al módulo **POS** desde el panel de navegación.
2. Verificar que la **tienda activa** es la correcta usando el selector en la parte superior.
3. Buscar productos usando uno de estos métodos:
   - Escribir en el **buscador** por nombre del producto.
   - Escanear el **código de barras** con lector o cámara.
   - Navegar el **catálogo visual** por categorías.
4. Ajustar la **cantidad** de cada producto si es necesario.
5. Revisar el **carrito**: verificar productos, cantidades, subtotal y total.
6. Aplicar **descuento** si corresponde (porcentaje o monto fijo).
7. Seleccionar el **método de pago**: Efectivo, Tarjeta, Mixto o Transferencia.
8. Para pago en efectivo, ingresar el monto recibido para calcular el cambio.
9. Confirmar la venta. El sistema genera automáticamente el recibo y actualiza el inventario.
10. Al finalizar el día, realizar el **Arqueo de Caja** para cuadrar el efectivo.

**Resultado esperado:** Venta registrada, recibo generado e inventario actualizado.

---

## 4. Recepción de Inventario

**Requisitos previos:** Tener proveedores registrados y la orden de compra o nota de entrega.

1. Acceder al módulo **Inventario** y seleccionar **Recepciones**.
2. Hacer clic en **Nueva Recepción**.
3. Seleccionar el **proveedor** de la lista desplegable.
4. Agregar productos recibidos: buscar por nombre o SKU, indicar cantidad recibida.
5. Si la cantidad recibida difiere de la orden, registrar la discrepancia.
6. Verificar que los precios de costo coincidan con la cotización del proveedor.
7. Confirmar la recepción. El stock se actualiza automáticamente.
8. Consultar el **historial de trazabilidad de stock** para verificar que el movimiento quedó registrado correctamente.

**Resultado esperado:** Recepción registrada, stock actualizado e historial de movimientos generado.

---

## 5. Administración de Tiendas y Usuarios

**Requisitos previos:** Contar con rol de administrador o manager.

### Crear una Tienda
1. Acceder a **Multi-Tienda > Administrar Tiendas**.
2. Completar los datos: nombre, dirección, teléfono, correo y logo.
3. Guardar. La tienda queda disponible en el selector de tienda activa.

### Crear un Usuario
1. Acceder a **Configuración > Usuarios**.
2. Hacer clic en **Crear Usuario**.
3. Completar nombre, correo electrónico y contraseña provisional.
4. Asignar el **rol** adecuado según el nivel de permisos necesarios.
5. Asignar la **tienda** donde el usuario trabajará.
6. Guardar. El usuario recibirá acceso al sistema.

### Asignar Roles
Los roles son jerárquicos y acumulativos: Administrador (acceso total), Gerente (gestión de tiendas), Encargado (operaciones diarias), Cajero (ventas POS), Almacén (inventario), Usuario (solo lectura).

**Resultado esperado:** Tiendas y usuarios configurados con roles y permisos correctos.

---

## 6. Transferencias entre Tiendas

**Requisitos previos:** Tener al menos 2 tiendas creadas y productos con stock disponible en la tienda de origen.

1. Acceder a **Inventario > Transferencias**.
2. Hacer clic en **Nueva Transferencia**.
3. Seleccionar la **tienda de origen** (de donde sale el producto).
4. Seleccionar la **tienda de destino** (donde llega el producto).
5. Agregar los productos a transferir con las cantidades correspondientes.
6. Verificar que el stock disponible en origen sea suficiente.
7. Confirmar la transferencia. El stock de origen se decrementa.
8. El encargado de la tienda destino debe **confirmar la recepción**.
9. Si hay discrepancias entre lo enviado y lo recibido, registrarlas.
10. Generar el **reporte PDF con código QR** para verificación.

**Resultado esperado:** Transferencia completada con stock actualizado en ambas tiendas.

---

## 7. Exportación de Catálogo

**Requisitos previos:** Tener productos en el catálogo con imágenes y precios actualizados. Para instrucciones detalladas sobre cada plantilla, consulta la [Guía Completa de Exportación de Catálogos](../03-inventario/exportacion-catalogo.md).

1. Acceder al módulo **Ventas > Catálogo de Ventas**.
2. Aplicar **filtros** si desea exportar solo productos específicos (por categoría, nombre, stock).
3. Hacer clic en el botón **Exportar Catálogo** para abrir el modal de exportación.
4. Seleccionar la **plantilla** deseada:
   - **WhatsApp (JPG)** — Grilla de 12 productos para compartir por mensajería.
   - **Instagram (JPG)** — Diapositivas individuales para carruseles.
   - **Lista de Precios (PDF)** — Tabla densa profesional para B2B.
   - **Catálogo Elegante (PDF)** — Publicación tipo revista con portada profesional.
5. Personalizar: seleccionar **color de marca** (8 opciones), **avatar promocional** (6 opciones, solo Catálogo Elegante).
6. Verificar que los **datos de marca** (nombre, teléfono, email) sean correctos.
7. Hacer clic en **Exportar** y esperar la generación del archivo.
8. Descargar el archivo generado y distribuirlo por el canal correspondiente.

**Resultado esperado:** Catálogo profesional en el formato seleccionado, listo para distribución.

---

## 8. Ventas desde el Catálogo

**Requisitos previos:** Tener productos en el catálogo con stock disponible y precios indexados. Para instrucciones completas, consulta la [Guía del Catálogo de Ventas](../03-inventario/catalogo-ventas.md).

1. Acceder al módulo **Ventas > Catálogo de Ventas**.
2. Utilizar **filtros** (categoría, stock, búsqueda) para localizar los productos deseados.
3. Alternar entre **vista de tabla** (datos densos) y **vista de cuadrícula** (tarjetas visuales) según la necesidad.
4. Seleccionar el producto deseado y hacer clic en **venta rápida**.
5. Ajustar la **cantidad** en el modal de checkout.
6. Confirmar la venta. El sistema genera comprobante, actualiza inventario y registra la transacción.
7. Al finalizar, consultar el **resumen de totales** para revisar el valor del inventario mostrado.

**Resultado esperado:** Venta procesada directamente desde el catálogo con comprobante, inventario actualizado e historial registrado.
