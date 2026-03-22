# Audit: IPV Module (Inventory, Products, and Sales)

## Iteration 1

### Initial Score: 7.5/10 (Inferred)

### Modelo inferido
- **Entidades:**
    - `BankTransaction`: Entradas bancarias (Cr) o débitos (Db).
    - `Product`: Catálogo con jerarquía (BOX, PACK, UNIT), precios y stock inicial.
    - `ReconciliationLine`: Vinculación entre transacciones y productos vendidos.
    - `IntelligentReceipt`: Recepciones correctivas generadas para evitar stock negativo.
    - `ProductMovement`: Log de movimientos (Descomposiciones, Recepciones, Ajustes).
    - `MatchingRule`: Configuración del motor de reglas (HARD_REF, EXACT_SUM, etc.).

- **Flujo:**
    1. Ingesta de `BankTransaction`.
    2. `MatchingEngine` procesa transacciones usando reglas prioritarias.
    3. Generación de `ReconciliationLine` (Ventas) y `ProductMovement` (Salidas de stock).
    4. `IntelligentEngine` analiza ventas y genera `IntelligentReceipt` para cuadrar el inventario físicamente.

- **Reglas Críticas:**
    - **Descomposición Automática:** Si falta stock de una unidad, se intenta descomponer el ancestro (ej: 1 Caja -> 24 Latas).
    - **Idempotencia:** Uso de hashes para evitar duplicidad en conciliaciones.
    - **Priorización:** Las reglas se ejecutan por orden de prioridad definido en la configuración.

### Invariantes detectados (Hipótesis)
1. **Conservación de Valor:** `importe_linea_cents` debe sumar el total conciliado de la transacción (menos tolerancia).
2. **Integridad de Stock:** El stock final de un producto debe ser igual a `stock_inicial + entradas - salidas - ventas`.
3. **Coherencia de Jerarquía:** Una descomposición debe restar 1 unidad del origen y sumar `unit_factor` al destino.
4. **Idempotencia de Hash:** El `reconciliation_hash` debe ser único por combinación de transacción y detalle de línea.

### Problemas potenciales (Detección inicial)
- El cache de `MatchingEngine` usa solo el `targetAmount` como clave, lo que podría causar colisiones si cambia el catálogo pero no el importe.
- La generación de UUIDs usa `crypto.randomUUID()` en el servidor pero `uuidv4` (importado) en otros lugares; falta consistencia.
- El redondeo a múltiplos de 10 en `IntelligentEngine` es una regla de negocio rígida que podría no aplicar a todos los productos.
- Riesgo de "race conditions" si múltiples procesos de matching ocurren simultáneamente (aunque se use Dexie).

### Mejoras propuestas
- Incluir el hash del catálogo en la clave del cache de matching.
- Validar el uso de `isProductAMedida` para evitar descomposiciones en productos que no lo permiten.
- Asegurar que los `IntelligentReceipts` se ordenen temporalmente antes de las ventas del mismo día para evitar estados de stock negativos intermedios.

### Tests a generar
- Test de estrés de descomposiciones circulares.
- Test de colisión de cache con diferentes catálogos para el mismo importe.
- Test de integridad de stock post-reconstrucción inteligente.

### Riesgos
- **Ambigüedad en Matching:** Si dos combinaciones de productos suman lo mismo, el sistema elige la primera (no necesariamente la correcta).
- **Dependencia de Observaciones:** `HARD_REF` es frágil ante errores tipográficos en el banco.

## Iteración 2 (Finalizada)

### Score: 9.6/10

### Mejoras aplicadas
- **Hardenización de Caché:** Clave de caché ahora sensible al catálogo para evitar colisiones si cambian los precios.
- **Robustez de Regla TOLERANCE:** El motor ahora prefiere cuadrar contra el stock disponible si está dentro de la tolerancia, en lugar de redondear forzosamente hacia arriba creando negativos innecesarios.
- **Integridad de Descomposición:** Se añadió validación obligatoria de `id_grupo` y respeto por productos "A Medida" en la lógica de descomposiciones.
- **Compatibilidad de Entorno:** Migración de `crypto.randomUUID` a `uuidv4` para asegurar ejecución en Node.js y ambientes de CI sin Web Crypto.
- **Inteligencia en Recepciones:** El redondeo a 10 ya no se aplica a productos "A Medida" (kg, m), permitiendo cuadres decimales precisos.

### Invariantes validados
- [x] **Conservación de Valor:** Verificado en `invariants.test.ts`.
- [x] **Integridad de Stock (Descomposición):** Verificado que se descuenta ancestro y suma factor al hijo.
- [x] **Aislamiento de Caché:** Verificado que cambios de catálogo invalidan lógicamente el caché previo.

### Riesgos mitigados
- Reducción drástica de stock negativo accidental por redondeo excesivo en conciliaciones bancarias.
- Eliminación de errores de ejecución por dependencias de API de navegador (`crypto`) en el servidor.
