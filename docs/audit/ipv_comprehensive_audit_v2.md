# Informe de Auditoría Integral: Módulo IpV (Inventario por Ventas)
**Versión del Sistema:** CostPro v8.1 (JULES Scheduler v8.1)
**Fecha:** 2026-03-31
**Auditor:** Jules (Senior Software Engineer)
**Estado:** CRÍTICO / MEJORA REQUERIDA

---

## 1. Análisis de Arquitectura y Motor de Matching (`engine.ts`)

### 1.1. Rigidez del Pipeline de Ejecución
A pesar de que el constructor de `MatchingEngine` ordena las reglas por `prioridad`, el método `matchTransaction` ejecuta las reglas mediante bloques `if` secuenciales hardcodeados (PASS 0 a 6).
- **Crítica:** El orden de prioridad en la UI es parcialmente ilusorio. Si un usuario cambia la prioridad de `EXACT_SUM` por debajo de `PRICE_FLEX`, el código seguirá intentando `EXACT_SUM` primero debido a la estructura del método.
- **Riesgo:** Inflexibilidad ante nuevas reglas de negocio sin modificar el core del motor.

### 1.2. Eficiencia del Algoritmo de Backtracking (`findExactCombination`)
El motor utiliza una búsqueda recursiva para encontrar combinaciones exactas de productos que sumen el importe de la transferencia.
- **Puntos Positivos:** Implementa un límite de profundidad (`maxDepth: 5`) y una caché basada en hashes de catálogo y reglas para evitar re-cálculos costosos.
- **Crítica:** La recursión no está optimizada para catálogos masivos (>500 productos) si la caché falla. Podría beneficiarse de programación dinámica (problema del cambio de moneda).

### 1.3. Descomposición Recursiva (Big Bon Logic)
La capacidad de descomponer automáticamente Caja -> Paquete -> Unidad es la joya de la corona del módulo.
- **Crítica:** El registro de movimientos (`product_movements`) es consistente, pero la reversión de una transacción conciliada no siempre revierte limpiamente la descomposición si el stock ya fue usado por otra venta (Race condition en cliente).

---

## 2. Integridad de Datos y Persistencia (`dexie.ts`, `calculations.ts`)

### 2.1. Cálculo de Existencias (Stock)
El sistema calcula el stock "en vuelo" (`calculateCurrentStock`) sumando/restando transacciones, movimientos y ventas.
- **Crítica:** Existe una fragmentación de la lógica de cálculo entre `utils.ts`, `calculations.ts` y el propio `engine.ts`. Esto aumenta el riesgo de "drift" de inventario donde el reporte IPV muestra algo distinto a la vista de Catálogo.
- **Hallazgo:** El sistema depende pesadamente de que `reconciliation_lines` y `product_movements` estén perfectamente sincronizados. Un fallo en la persistencia de uno (ej. `DatabaseClosedError` detectado en logs) corrompe el cálculo de stock global.

### 2.2. Idempotencia y Hashing
Se utiliza SHA-256 para generar `ingestion_hash` y `reconciliation_hash`.
- **Evaluación:** Excelente. Previene duplicidad de transferencias incluso si el usuario sube el mismo TXT de BANDEC varias veces.

---

## 3. Ingestión y Parsing (`bandecParser.ts`, `identity/`)

### 3.1. Robustez del Parser BANDEC
El parser utiliza regex para detectar cabeceras de fecha y líneas de transacción.
- **Crítica:** El formato BANDEC es notoriamente inestable. El uso de `txLineRegex` asume espacios fijos que pueden variar entre sucursales bancarias. Falta un fallback basado en delimitadores más flexibles.
- **Manejo Numérico:** Correcto. La lógica de `replace(/\./g, '').replace(',', '.')` para manejar `1.000,00` es vital y está bien implementada.

### 3.2. Motor de Identidad
El `MappingRulesEngine` es extensible y separa la lógica de extracción (Regex) de la de resolución (`resolveIdentity`).
- **Crítica:** La resolución de identidad es 100% basada en el cliente (Browser). No hay una base de datos centralizada de clientes/CIs compartida entre usuarios, lo que obliga a cada usuario a "entrenar" su propio registro local.

---

## 4. Exportación MVT / Versat (`mvt/`)

### 4.1. Compatibilidad ERP
- **Cumplimiento:** **ALTO**. El uso de CRLF (`\r\n`) y la estructura de secciones (`[Cabecera]`, `[Ubicacion]`, `[Movimiento]`) cumple estrictamente con los requerimientos de importación de Versat/Sais.
- **Crítica:** El motor de expresiones (`evaluator.ts`) utiliza `new Function()` para evaluaciones aritméticas. Aunque el input está filtrado por regex (`/^[0-9+\-*/().]+$/`), sigue siendo un riesgo potencial de seguridad si se inyectan plantillas maliciosas.

---

## 5. UI/UX: El Problema del "Motor Mudo"

### 5.1. Transparencia de Matching
El motor realiza acciones complejas como `PRICE_FLEX` (ajustar precios) o `CASH_FILL` (completar con efectivo), pero la tabla de transacciones solo muestra el estado (COMPLETO/PENDIENTE).
- **Crítica:** El usuario no sabe *por qué* se cuadró una venta. ¿Se usó el precio real o el motor "perdonó" 10 centavos? ¿Se descompuso una caja de refrescos?
- **Recomendación:** Integrar el `MatchingTrace` (que ya existe en el objeto `MatchingResult`) directamente en un Popover de la UI para que el usuario audite la decisión de la IA.

### 5.2. Seguridad Administrativa
Las operaciones destructivas (Borrar Catálogo, Vaciar Reportes) usan `window.confirm` o `askConfirmation`.
- **Crítica:** Falta un "Undo" o un sistema de versiones/Snapshots antes de ejecuciones masivas de matching.

---

## 6. Conclusiones y Recomendaciones Estratégicas

### Puntuación de Salud del Módulo: 7.8 / 10

| Categoría | Nota | Estado |
| :--- | :--- | :--- |
| Lógica de Matching | 9/10 | Robusta y resiliente. |
| Integridad Contable | 8/10 | Bien estructurada pero dependiente de sincronía local. |
| Transparencia (UX) | 4/10 | **CRÍTICO**. El motor es inteligente pero no comunica sus razones. |
| Rendimiento (MVT) | 10/10 | Excelente manejo de grandes volúmenes y compresión ZIP. |

### Recomendaciones Inmediatas:
1. **Refactor de `engine.ts`:** Migrar de `if` secuenciales a un bucle sobre `this.rules` que cumpla una interfaz `MatchingRuleProcessor`.
2. **Visibilidad del Trace:** Añadir indicadores visuales en `TransactionTable` para:
   - 📦 Descomposición automática.
   - ⚖️ Ajuste de precio dinámico.
   - 🪙 Completado con efectivo.
3. **Consolidación de Stock:** Centralizar el cálculo de existencia en un `StockService` único para evitar discrepancias entre vistas.
4. **Audit Log Persistence:** Asegurar que el `persistLog` no falle silenciosamente si la base de datos está ocupada (implementar cola de reintento).

---
*Informe generado automáticamente por Jules Scheduler v8.1 en el contexto de auditoría integral del módulo IpV.*

---
## 7. Hallazgos en el Entorno de Desarrollo y Pruebas

### 7.1. Fallos en el Pipeline de Testing
Durante la ejecución de `bun test`, se detectaron errores críticos de resolución de dependencias (`uuid`, `fake-indexeddb`).
- **Impacto:** La incapacidad de ejecutar tests unitarios de forma local rompe la cadena de confianza en el desarrollo de nuevas reglas para el motor.
- **Recomendación:** Sincronizar `package.json` y asegurar que `fake-indexeddb` esté disponible para las pruebas del motor que dependen de Dexie.

*Última actualización de hallazgos: 2026-03-31*

---
## 8. Informe de Incidencia de Despliegue (Render)

### 8.1. Fallo de Construcción Detectado
**Causa Raíz:** Mismatch entre la configuración del Dashboard de Render (Overrides) y los requerimientos del proyecto. El comando de construcción previo no incluía la generación de Prisma (`npx prisma generate`), lo que provocaba fallos en rutas dinámicas.

### 8.2. Resolución Aplicada
1. **Sincronización de Comandos:** Se actualizó `render.yaml` y `AGENTS.md` para forzar el uso de `bun install && bun x prisma generate && bun run build`.
2. **Runtime de Producción:** Se fijó el `startCommand` a `bun .next/standalone/server.js` para aprovechar el modo standalone de Next.js.
3. **Variables de Entorno:** Se añadió un `DATABASE_URL` dummy en la configuración de construcción para evitar errores de validación de Prisma durante el build.

*Estado Final:* Despliegue estabilizado y validado localmente en modo producción.
