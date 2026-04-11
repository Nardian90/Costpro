# Evaluación Técnica: Módulo IpV (Identificación de Productos y Ventas)

## 1. Resumen del Módulo
El módulo **IpV** es el núcleo de conciliación inteligente del sistema. Su objetivo principal es transformar estados de cuenta bancarios amorfos en registros contables estructurados, identificando productos, clientes y movimientos de inventario automáticamente mediante reglas de negocio y heurísticas avanzadas.

---

## 2. Arquitectura y Componentes Clave

### A. Matching Engine (`src/lib/ipv/engine.ts`)
Motor de reglas secuencial que procesa transacciones.
- **Estrategias:**
    - `HARD_REF`: Búsqueda de códigos exactos en observaciones.
    - `EXACT_SUM`: Algoritmo combinatorio (backtracking) para cuadrar importes exactos con múltiples productos.
    - `CASH_FILL` / `AUTO_SUPPLY`: Gestión de excedentes y ajustes de caja.
    - `DECOMPOSITION`: Lógica recursiva para desglosar productos "Padre" (cajas) en "Hijos" (unidades) según stock.
- **Invariante:** Enforzamiento de `STOCK_LIMIT` para evitar existencias negativas en productos críticos.

### B. Registro de Identidad (CIR) (`src/lib/ipv/identity/`)
Sistema de resolución de entidades (Clientes).
- **Normalización:** Limpieza de nombres, eliminación de acentos y caracteres especiales.
- **Fuzzy Matching:** Uso de algoritmos de similitud (>85%) para unificar identidades.
- **Propagación:** Capacidad de actualizar retroactivamente el historial de transacciones cuando se corrige un dato en el catálogo maestro.

### C. Motor de Exportación MVT (`src/lib/ipv/mvt/`)
Generador dinámico de archivos de intercambio para **Versat ERP**.
- **Templates:** Sistema basado en secciones (`[Ubicacion]`, `[Movimientos]`) con evaluación de expresiones dinámicas.
- **Compatibilidad:** Manejo estricto de CRLF y codificación para sistemas legados.

### D. Stock & Reports (`src/lib/ipv/StockService.ts` / `utils.ts`)
- Gestión centralizada de movimientos (`ProductMovement`).
- Recálculo de cadena de reportes (Saldos Iniciales -> Entradas -> Salidas -> Venta -> Saldo Final).

---

## 3. Evaluación de Deuda Técnica

1.  **Acoplamiento a Base de Datos:** El `MatchingEngine` tiene dependencias directas de `db` (Dexie), lo que dificulta las pruebas unitarias puras sin mocks complejos.
2.  **Tamaño de Componentes UI:** Vistas como `IPVView.tsx` y `TransactionTable.tsx` han crecido significativamente, manejando demasiados estados locales.
3.  **Carga en el Hilo Principal:** Aunque existe un `matching.worker.ts`, gran parte de la lógica de preparación de datos sigue siendo síncrona y pesada para lotes de >500 transacciones.

---

## 4. Estrategia de Micro-Refactorización (Paso Seguro)

Para mejorar la mantenibilidad sin romper el flujo crítico, se propone una estrategia de 4 fases:

### Fase 1: Extracción de Lógica Pura (Logic Decoupling)
- **Acción:** Mover las funciones de cálculo de `engine.ts` y `calculations.ts` a funciones puras que acepten datos (arrays) en lugar de realizar queries internas.
- **Objetivo:** Facilitar TDD y reducir el tiempo de ejecución en simulaciones.

### Fase 2: Modularización de Vistas (Component Splitting)
- **Acción:** Dividir `TransactionTable.tsx` en sub-componentes:
    - `TransactionRow`: Lógica de renderizado de fila.
    - `TransactionActions`: Botones y triggers de modales.
    - `MatchingStatusBadge`: Lógica visual del estado.
- **Objetivo:** Reducir re-renders innecesarios y mejorar la legibilidad.

### Fase 3: Estandarización de Tipos y DTOs
- **Acción:** Crear interfaces compartidas para "Líneas de Conciliación" que sean independientes de la tabla de la DB.
- **Objetivo:** Evitar la dispersión de campos como `importe_cents` vs `total_amount_cents` en diferentes partes del flujo.

### Fase 4: Optimización de Persistencia
- **Acción:** Implementar `bulkPut` en el `identity/registry.ts` y el `StockService`.
- **Objetivo:** Reducir los bloqueos de IndexedDB durante la ingesta masiva de estados de cuenta.

---

## 5. Próximos Pasos Recomendados
1.  **Shadow Testing:** Ejecutar el `MatchingEngine` en modo "Simulación" junto al modo real para verificar mejoras de precisión sin afectar datos reales.
2.  **Audit Trail Expansion:** Fortalecer el `catalog_audit` para rastrear quién y cuándo modificó los coeficientes de descomposición.
