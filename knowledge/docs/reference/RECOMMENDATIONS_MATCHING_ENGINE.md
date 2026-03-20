# Recomendaciones de Mejora: Motor de Matching IPV

Basado en la auditoría técnica realizada, se proponen las siguientes mejoras para garantizar la transparencia y auditabilidad del sistema.

## 1. Sistema de Registro de Reglas Activas (Rule Registry)

**Problema:** El motor realiza ajustes (Price Flex, Tolerance, Cash Fill) que el usuario no percibe en la interfaz de transacciones.

**Solución Propuesta:**
- **Esquema de Datos:** Añadir un campo `matching_logs` (Array de strings) y `applied_rules` (Array de IDs de reglas) a la interfaz `BankTransaction` en `src/lib/dexie.ts`.
- **Sincronización:** Modificar el `MatchingEngine` para que su `matchTransaction` devuelva siempre el array de logs. El worker y la lógica de persistencia en `IPVView.tsx` deben guardar estos logs en la transacción.
- **UI:** Crear un componente `MatchingTracePopover.tsx` que se abra al hacer click en el estado de la transacción, mostrando el paso a paso de por qué se cuadró o por qué falló.

## 2. Indicadores Visuales de Inteligencia (Action Badges)

**Problema:** No se sabe a simple vista qué transacciones requirieron "magia" del motor (descomposiciones o ajustes).

**Solución Propuesta:**
- En la `TransactionTable.tsx`, añadir una columna de "Indicadores":
    - 📦 **Descompuesto:** Se muestra si existe un `ProductMovement` vinculado a esta transacción.
    - ⚖️ **Precio Ajustado:** Se muestra si alguna línea tiene un `precio_unitario_cents` diferente al precio base del catálogo.
    - 🪙 **Cash Fill:** Se muestra si alguna línea tiene `origen_dato: 'CASH_FILLER'`.

## 3. Editor de Parámetros de Reglas (Meta-Config)

**Problema:** Las reglas `PRICE_FLEX` y `CASH_FILL` tienen parámetros internos (límites de variación, límites diarios) que no son editables por el usuario.

**Solución Propuesta:**
- Ampliar el `MatchingRulesEditor.tsx` para que, al expandir una regla, permita editar su objeto `meta`.
- Ejemplo para `PRICE_FLEX`: Input para "Variación Máxima (%)" y "Variación Máxima ($)".

## 4. Mejora en la Retroalimentación de Errores (Fail Reason Detail)

**Problema:** "FALTA STOCK VIRTUAL" es demasiado genérico.

**Solución Propuesta:**
- El motor debe identificar qué producto específico detuvo la combinación.
- Ejemplo: "FALTA STOCK VIRTUAL: No hay existencias de 'Refresco 330ml' ni de sus paquetes ancestros."

## 5. Implementación de "Explainable AI" en el Matching

**Solución Propuesta:**
- Al fallar un matching, mostrar un botón "Analizar Fallo" que ejecute una simulación rápida y explique: "Se intentó combinar con A y B, pero faltaron 5 unidades de B".
