# TEXTO LITERAL — «RESOLUCIÓN DEL PROPIETARIO — MISIÓN C» (entregado por el propietario)

> **Evidencia del ciclo 2.** Texto íntegro del documento de resolución tal como
> fue entregado por el propietario el 2026-10-21 (mismo canal de instrucciones
> directas utilizado para la decisión de vales). Sin ediciones ni omisiones.
> No contiene secretos. El registro formal con interpretación y efectos vive en
> `docs/decisions/2026-10-21-resolucion-propietario-mision-c.md`.

**Fecha:** 2026-10-21
**Alcance:** decisiones pendientes de la Misión C y preparación de las Misiones D/E/F/G.

## A. Decisiones de política

1. **CP-DATA-001:** adoptar como política la limpieza por lotes con trazabilidad individual. No ejecutar borrados hasta presentar y obtener autorización expresa para cada lote L1/L2/L3. Mantener L4 intacto mientras no se confirme la titularidad de los tres vales.
2. **CP-SEC-010 / DT-03:** conservar la decisión ratificada. El modelo operativo actual es single-tenant, manteniendo la arquitectura multi-tenant y las relaciones de membresía. El residual A7 del backfill `david9999` solo podrá cerrarse cuando la evidencia existente demuestre que la asignación fue correcta. No asignar automáticamente los otros diez perfiles.
3. **CP-SEC-011 / DT-06:** adoptar como dirección de diseño la opción 2: detección automática y revisión/borrado humano. Preparar salvaguardas y pruebas piloto. Esta decisión no autoriza despliegues ni borrados de cuentas reales.
4. **CP-IPV-001:** adoptar la opción 1: clasificar las incidencias como históricas mediante anotaciones explícitas, sin crear movimientos ni alterar saldos históricos. Cualquier backfill futuro requerirá evidencia de apertura y autorización separada.
5. **CP-DATA-005:** cerrar documentalmente como no representable según el criterio vigente; no crear documentos artificiales.
6. **CP-DATA-006:** aceptar documentalmente las 20 filas de comisiones de julio. No reconstruirlas sin la escala histórica de tarifas.
7. **CP-CAT-006:** mantener intactos los registros históricos y formalizar la limitación de las métricas. No ejecutar backfill en esta fase.

Estas resoluciones deben registrarse como decisiones del propietario solo después de que este documento haya sido confirmado por él. Hasta entonces, las recomendaciones del agente seguirán etiquetadas como propuestas.

## B. Datos comerciales ausentes

Para CP-INV-002, CP-INV-003, CP-INV-004 y CP-IPV-002, no se aportarán documentos ni valores adicionales en esta fase. Mantener el estado pendiente de datos, no inventar valores, no alterar precios/costos y no ejecutar recálculos WAC basados en estimaciones.

## C. Límites de ejecución

- No ejecutar SQL de escritura, migraciones, backfills, borrados, cambios de permisos, ajustes de inventario ni operaciones de producción sin autorización específica.
- No fusionar PRs ni realizar push directo a `main`.
- Se permite avanzar en documentación, análisis estático, pruebas locales, preparación de propuestas de migración y pruebas no destructivas.
- No modificar la evidencia ni los entregables de A2 y de la Misión B que no formen parte del alcance autorizado.
- No dejar que un bloqueo de datos o autorización detenga tareas independientes que puedan avanzar con seguridad.

## D. Próximos pasos

1. Actualizar el registro de decisiones y el inventario maestro con el estado correcto, preservando la trazabilidad de las decisiones previas.
2. Separar las tareas que ya pueden cerrarse documentalmente de las que siguen bloqueadas por datos o autorización.
3. Preparar para la Misión D el plan de limpieza L1/L2/L3, con inventarios exactos, precondiciones, verificación de titularidad, salvaguardas, reversión y criterios de éxito; no ejecutar borrados.
4. Preparar para la Misión E el diseño de DT-06 y el análisis de CP-SEC-025/026 sin modificar datos o permisos de producción.
5. Preparar para la Misión F/G las tareas documentales y de análisis que no dependan de los datos comerciales ausentes.
6. Informar de los cambios exactos, las pruebas realizadas, los bloqueos restantes y los PRs propuestos. No fusionar ninguno.

**No inferir autorizaciones operativas a partir de estas decisiones de política.**
