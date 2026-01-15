# Manual de Operaciones y Control Interno: Módulo de Inventario

## 1. Introducción

Este manual establece los procedimientos operativos y de control interno para la gestión del inventario en Costpro. Su cumplimiento es obligatorio para garantizar la exactitud de los datos, prevenir pérdidas y asegurar la eficiencia operativa.

## 2. Procedimientos de Control

### 2.1. Control Diario
- **Responsable:** Jefe de Almacén
- **Acción:** Al final del día, realizar un conteo cíclico de 10 SKUs de alta rotación.
- **Verificación:** Comparar el conteo físico con el stock reportado en el sistema. Cualquier discrepancia debe ser investigada y ajustada inmediatamente, documentando la razón del ajuste (e.g., "Error de sistema", "Producto dañado").

### 2.2. Control Semanal
- **Responsable:** Administrador del Sistema
- **Acción:** Ejecutar el script de auditoría automática que compara el stock actual (`inventory.quantity`) con la suma de todos sus movimientos históricos (`stock_movements`).
- **Verificación:** El script generará un "Reporte de Consistencia de Inventario". Cualquier SKU con inconsistencias debe ser marcado para revisión manual inmediata.

### 2.3. Control Mensual
- **Responsable:** Gerente de Operaciones, Contador
- **Acción:** Realizar un inventario físico completo o un conteo cíclico a gran escala (25% de todos los SKUs).
- **Verificación:** Validar los resultados contra el sistema y generar el "Reporte de Exactitud de Inventario Mensual". Las discrepancias deben ser analizadas para identificar patrones o problemas sistémicos.

## 3. Auditoría Automática

El sistema incluye una función (`audit_inventory_consistency`) que se ejecuta semanalmente. Este proceso:
1.  Calcula el stock teórico para cada producto sumando todos sus `stock_movements` desde el inicio.
2.  Compara este cálculo con el valor actual en `inventory.quantity`.
3.  Registra cualquier discrepancia en la tabla `audit_logs` con la etiqueta `INVENTORY_MISMATCH`.
4.  Envía una alerta automática al Administrador del Sistema y al Gerente de Operaciones.

## 4. Manejo de Incidentes

### 4.1. Discrepancias de Inventario
1.  **Detección:** Identificada por conteo cíclico, auditoría automática o reporte de usuario.
2.  **Registro:** Se crea un ticket de incidente en el sistema de gestión interna, asignado al Jefe de Almacén.
3.  **Investigación:** Se revisan los `stock_movements` del producto, se verifica el video de seguridad (si aplica) y se entrevista al personal relevante.
4.  **Resolución:** Se realiza un ajuste de inventario (`ADJUSTMENT`) con una justificación detallada. El incidente se cierra.

### 4.2. Errores Humanos (e.g., Venta/Recepción Incorrecta)
1.  **Detección:** Reportado por personal de ventas o almacén.
2.  **Acción Inmediata:** Si una venta se procesó con el SKU incorrecto, se debe anular la transacción y crear una nueva. Si no es posible, se debe realizar un ajuste de inventario para ambos SKUs implicados.
3.  **Capacitación:** Se registra el error para identificar necesidades de re-capacitación.

### 4.3. Accesos Indebidos
1.  **Detección:** A través de la revisión de `audit_logs`, que registra todos los cambios con el ID de usuario.
2.  **Acción Inmediata:** El Administrador del Sistema debe revocar el acceso del usuario sospechoso.
3.  **Investigación:** Se realiza una auditoría completa de todas las acciones realizadas por ese usuario en las últimas 48 horas.
4.  **Resolución:** Se revierten los cambios no autorizados y se toman las medidas disciplinarias correspondientes.

## 5. KPIs Operativos y Financieros

### 5.1. KPIs Operativos
- **Exactitud del Inventario (ISA):** `(Número de SKUs correctos / Número total de SKUs contados) * 100`. **Objetivo: >98%**.
- **Rotación de Inventario:** `Costo de los bienes vendidos / Valor promedio del inventario`. **Objetivo: Optimizar por categoría**.
- **Tasa de Fill Rate:** `(Número de pedidos completos / Número total de pedidos) * 100`. **Objetivo: >99%**.

### 5.2. KPIs Financieros
- **Valor del Inventario:** Suma total del costo de todos los productos en stock.
- **Costo de Merma (Shrinkage):** `Valor de las pérdidas de inventario / Ventas totales`. **Objetivo: <1%**.
- **Días de Inventario (DOI):** `(Valor promedio del inventario / Costo de los bienes vendidos) * 365`.

## 6. Checklist Previo a Cierres Contables

- [ ] Confirmar que no hay discrepancias pendientes en el "Reporte de Consistencia de Inventario".
- [ ] Asegurar que todos los ajustes de inventario del mes están debidamente justificados y documentados.
- [ ] Verificar que el valor del inventario en el sistema coincide con el reporte financiero preliminar.
- [ ] Confirmar que no hay movimientos de stock sin procesar (e.g., recepciones pendientes de confirmar).
- [ ] Archivar el "Reporte de Exactitud de Inventario Mensual" firmado.

## 7. Responsabilidades por Rol

### 7.1. Personal de Almacén
- Realizar recepciones de mercancía en el sistema.
- Preparar y despachar pedidos de venta.
- Ejecutar conteos cíclicos diarios.
- Reportar inmediatamente cualquier producto dañado o discrepancia.

### 7.2. Personal de Ventas
- Registrar correctamente las transacciones de venta en el sistema (POS).
- Informar al cliente sobre la disponibilidad de stock basado en el sistema.
- Reportar cualquier discrepancia entre el stock físico y el del sistema que sea detectada en el piso de venta.

### 7.3. Administrador del Sistema
- Monitorear los `audit_logs` y las alertas automáticas.
- Gestionar los permisos de acceso de los usuarios al módulo de inventario.
- Asegurar la correcta ejecución de los procesos automáticos de auditoría.
- Investigar y resolver errores técnicos del sistema.
