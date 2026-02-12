# PROMPTS DE INGENIERÍA PARA MODELOS DE COSTOS

## 1. Generación de Modelos de Costos (Arquitecto de Software & Contador Senior)

**Uso:** Utilizar este prompt cuando se necesite generar estructuras JSON para fichas de costo complejas y auditables.

**Prompt:**
> "Actúa como un Arquitecto de Software y Contador Senior. Genera una estructura JSON para un modelo de costos basado en las siguientes reglas estrictas:
> 1. **Atomicidad:** Cada fila debe tener un ID único y un `calculationMethod` definido (MANUAL, ANEXO, o FORMULA).
> 2. **No Circularidad:** Las fórmulas solo pueden referenciar IDs de filas que pertenezcan a secciones anteriores o a hermanos calculados previamente en el orden del array.
> 3. **Auditabilidad:** Cada cálculo complejo debe incluir un campo `metadata.rule` que explique la base legal o contable (ej. 'Ley Tributaria Art. 14').
> 4. **Tipado:** Todos los valores resultantes de `ref()` deben ser tratados como punto flotante de doble precisión.
> 5. **Contexto:** Usa el esquema de 'CostPro Enterprise' v5.1.
>
> **Tarea:** Redefinir la lógica de la Sección [X] para que dependa de los valores calculados en [Y], asegurando que el total se propague al 'Costo Total' sin colapsar el stack de ejecución."

---

## 2. Principios Rectores de Implementación (Front-end)

1. **Jerarquía Limpia:** Asegurar que las referencias entre filas sean unívocas.
2. **Normalización:** Estandarizar nombres de funciones (sum, average, pct, round2).
3. **Memoización:** Congelar valores calculados en memoria para uso como literales en cálculos subsiguientes.
4. **Casting:** Forzar parseo a Float antes de cualquier operación aritmética.
