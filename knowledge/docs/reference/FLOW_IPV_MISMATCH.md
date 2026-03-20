# Flujo de Mismatch IPV - Documentación Técnica

Este documento detalla el ciclo de vida de una transacción desde su ingesta hasta la resolución de un mismatch en el módulo IPV.

## 1. Fase de Ingesta (Ingestion)
Las transacciones bancarias se extraen de reportes (SMS o Banca en Línea) y se importan al sistema (`BankIngestion.tsx`).
- **Validación de Duplicados:** Se utiliza un hash basado en referencia, fecha e importe. Los conflictos se envían a `IngestionErrorsTable.tsx`.
- **Estado Inicial:** Las transacciones válidas entran con estado `PENDIENTE`.

## 2. Motor de Matching (Matching Engine)
Cuando se pulsa "Ejecutar Matching", el motor (`engine.ts`) procesa cada transacción `PENDIENTE` siguiendo una jerarquía de reglas (PASSES):

- **PASS 0 (Auto-complete):** Identifica débitos, comisiones o transacciones excluidas.
- **PASS 1 (Hard Ref):** Busca códigos de productos o descripciones literales en las observaciones de la transacción.
- **PASS 2 (Exact Sum):** Utiliza un algoritmo de backtracking para encontrar una combinación de productos que sume el importe neto exacto.
- **PASS 3 (Price Flex):** Si se permite, ajusta levemente el precio de un producto (según `variacion_permisible_percent`) para cuadrar el monto.
- **PASS 4 (Wildcards):** Utiliza productos marcados como "Comodines" para rellenar el monto.
- **PASS 5 (Tolerance):** Aplica un margen de descuadre (propina o descuento) si la diferencia es inferior a la `tolerancia_cents` configurada.
- **PASS 6 (Cash Fill):** Cubre el residuo faltante como "Efectivo", intentando justificarlo con productos comodín si es posible.

## 3. Detección y Registro de Mismatch
Si ningún "PASS" logra completar el matching (estado `COMPLETO`):
- **Estado Resultante:** La transacción queda como `PENDIENTE` (si no hubo ninguna línea) o `PARCIAL` (si se aplicaron algunas reglas pero no se cubrió el 100%).
- **Fail Reason:** El motor genera un `failReason` descriptivo (ej: "FALTA STOCK VIRTUAL").
- **Logs:** El motor genera un array de strings con el trazo de ejecución (ej: "Intentando PASS 2... fallo"). **Nota:** Actualmente estos logs solo se visualizan en la pantalla de Simulación.

## 4. Visualización en UI
- **Tabla de Transacciones:** Las filas muestran un badge de estado (`PENDIENTE`, `PARCIAL`).
- **Alerta de Error:** Si hay un `fail_reason`, se muestra un icono de advertencia con el mensaje (ej: "⚠️ FALTA STOCK VIRTUAL").
- **Stats:** El Dashboard actualiza los contadores de "En Proceso" y "Pendientes".

## 5. Resolución Manual
El usuario tiene tres vías para resolver un mismatch:
- **Conciliación Manual:** Abre `ManualReconciliationView.tsx` donde puede añadir/quitar productos y ajustar precios o cantidades manualmente hasta llegar a la diferencia 0.
- **Forzar Matching:** Selecciona un producto de la lista para asignar rápidamente la cantidad necesaria que cubra el monto (ignora reglas de stock si el usuario lo decide).
- **Ajuste Rápido:** Permite aplicar la diferencia pendiente como "Propina/Descuento" sobre una línea ya existente.

## 6. Persistencia y Efectos
Una vez resuelto (Auto o Manual):
- Se crean registros en `reconciliation_lines`.
- Si hubo descomposiciones de paquetes (ej: Caja -> Unidades), se registran en `product_movements` con tipo `DECOMPOSITION`.
- El estado de la transacción en `bank_statements` cambia a `COMPLETO`.
