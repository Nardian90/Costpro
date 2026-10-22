# RESOLUCIÓN DEL PROPIETARIO — MISIÓN C (DECISIONES DE POLÍTICA Y PREPARACIÓN D/E/F/G)

**Fecha de la resolución:** 2026-10-21
**Registrada por:** Agente de la Misión Continua de Resolución del Inventario (ciclo 2, 2026-10-22) — documentación de decisiones ya tomadas; el agente NO decide
**Fuente:** documento «Resolución del propietario — Misión C» entregado directamente por el propietario (mismo canal que la instrucción de vales del 2026-10-21, registrado en `2026-10-21-decision-propietario-vales.md`)
**Alcance:** respuestas del propietario a las 10 propuestas pendientes (PD-1…PD-10) de `2026-10-21-propuestas-pendientes.md` + límites de ejecución + próximos pasos
**Estado:** `RATIFICADA POR EL PROPIETARIO` (fuente: documento fechado entregado por él; el propio documento establece que las resoluciones se registran como decisiones del propietario una vez confirmadas por él — este registro documenta esa confirmación)

---

## 1. Texto de la resolución (literal, sin ediciones)

> ## Resolución del propietario — Misión C
>
> **Fecha:** 2026-10-21
> **Alcance:** decisiones pendientes de la Misión C y preparación de las Misiones D/E/F/G.
>
> ### A. Decisiones de política
>
> 1. **CP-DATA-001:** adoptar como política la limpieza por lotes con trazabilidad individual. No ejecutar borrados hasta presentar y obtener autorización expresa para cada lote L1/L2/L3. Mantener L4 intacto mientras no se confirme la titularidad de los tres vales.
> 2. **CP-SEC-010 / DT-03:** conservar la decisión ratificada. El modelo operativo actual es single-tenant, manteniendo la arquitectura multi-tenant y las relaciones de membresía. El residual A7 del backfill `david9999` solo podrá cerrarse cuando la evidencia existente demuestre que la asignación fue correcta. No asignar automáticamente los otros diez perfiles.
> 3. **CP-SEC-011 / DT-06:** adoptar como dirección de diseño la opción 2: detección automática y revisión/borrado humano. Preparar salvaguardas y pruebas piloto. Esta decisión no autoriza despliegues ni borrados de cuentas reales.
> 4. **CP-IPV-001:** adoptar la opción 1: clasificar las incidencias como históricas mediante anotaciones explícitas, sin crear movimientos ni alterar saldos históricos. Cualquier backfill futuro requerirá evidencia de apertura y autorización separada.
> 5. **CP-DATA-005:** cerrar documentalmente como no representable según el criterio vigente; no crear documentos artificiales.
> 6. **CP-DATA-006:** aceptar documentalmente las 20 filas de comisiones de julio. No reconstruirlas sin la escala histórica de tarifas.
> 7. **CP-CAT-006:** mantener intactos los registros históricos y formalizar la limitación de las métricas. No ejecutar backfill en esta fase.
>
> Estas resoluciones deben registrarse como decisiones del propietario solo después de que este documento haya sido confirmado por él. Hasta entonces, las recomendaciones del agente seguirán etiquetadas como propuestas.
>
> ### B. Datos comerciales ausentes
>
> Para CP-INV-002, CP-INV-003, CP-INV-004 y CP-IPV-002, no se aportarán documentos ni valores adicionales en esta fase. Mantener el estado pendiente de datos, no inventar valores, no alterar precios/costos y no ejecutar recálculos WAC basados en estimaciones.
>
> ### C. Límites de ejecución
>
> - No ejecutar SQL de escritura, migraciones, backfills, borrados, cambios de permisos, ajustes de inventario ni operaciones de producción sin autorización específica.
> - No fusionar PRs ni realizar push directo a `main`.
> - Se permite avanzar en documentación, análisis estático, pruebas locales, preparación de propuestas de migración y pruebas no destructivas.
> - No modificar la evidencia ni los entregables de A2 y de la Misión B que no formen parte del alcance autorizado.
> - No dejar que un bloqueo de datos o autorización detenga tareas independientes que puedan avanzar con seguridad.
>
> ### D. Próximos pasos
>
> 1. Actualizar el registro de decisiones y el inventario maestro con el estado correcto, preservando la trazabilidad de las decisiones previas.
> 2. Separar las tareas que ya pueden cerrarse documentalmente de las que siguen bloqueadas por datos o autorización.
> 3. Preparar para la Misión D el plan de limpieza L1/L2/L3, con inventarios exactos, precondiciones, verificación de titularidad, salvaguardas, reversión y criterios de éxito; no ejecutar borrados.
> 4. Preparar para la Misión E el diseño de DT-06 y el análisis de CP-SEC-025/026 sin modificar datos o permisos de producción.
> 5. Preparar para la Misión F/G las tareas documentales y de análisis que no dependan de los datos comerciales ausentes.
> 6. Informar de los cambios exactos, las pruebas realizadas, los bloqueos restantes y los PRs propuestos. No fusionar ninguno.
>
> **No inferir autorizaciones operativas a partir de estas decisiones de política.**

---

## 2. Registro de las decisiones de política (A.1–A.7) y su efecto

| # | IDs afectados | Decisión del propietario | Efecto operativo inmediato | Qué NO autoriza |
|---|---|---|---|---|
| A.1 | CP-DATA-001 (PD-1) | Limpieza por lotes con trazabilidad individual como política | Preparación del plan L1/L2/L3 (Misión D) con inventarios exactos y salvaguardas; presentación al propietario lote a lote | **Ningún borrado**: cada lote requiere presentación + autorización expresa individual. L4 intacto mientras no se confirme la titularidad de los 3 vales |
| A.2 | CP-SEC-010 (PD-10) | Conservar DT-03 ratificada; A7 solo cierra con demostración de evidencia; no auto-asignar los otros 10 perfiles | Criterio vigente reconfirmado; preparación documental de memo de cierre A7 con la evidencia existente (dossier + matriz DT-03) para su ratificación | Asignación automática de tenant_id a los 10 perfiles sin evidencia individual; cierre de A7 sin demostración |
| A.3 | CP-SEC-011 (PD-2) | Dirección de diseño = opción 2 (detección automática + revisión/borrado humano) | Diseño, salvaguardas y plan de pruebas piloto preparados (Misión E, este ciclo) | Despliegues (migración aplicada, cron vivo) y borrados de cuentas reales — requieren autorización posterior |
| A.4 | CP-IPV-001 (PD-6) | Opción 1: clasificación histórica con anotaciones explícitas | Anotación de clasificación histórica añadida a la documentación IPV (cero escrituras de BD) | Crear movimientos, alterar saldos históricos; cualquier backfill futuro (evidencia de apertura + autorización separada) |
| A.5 | CP-DATA-005 (PD-7) | Cierre documental como «no representable» | Cierre de la tarea sin escrituras; el papel queda como referencia de 2–3 líneas sin espejo en COSTPRO | Crear documentos artificiales en Kardex/ventas |
| A.6 | CP-DATA-006 (PD-8) | Aceptar documentalmente las 20 filas de julio | Cierre de la tarea sin escrituras; distorsión menor documentada como aceptada | Reconstruir tarifas históricas sin la escala de julio (si algún día se aporta, exige autorización separada) |
| A.7 | CP-CAT-006 (PD-9) | Históricos intactos + formalizar limitación de métricas | Cierre de la tarea; limitación del contador de uso formalizada en el registro y en la anotación del documento de auditoría | Ejecutar backfill de `service_type_id` en esta fase |

## 3. Datos comerciales ausentes (B) — efecto sobre las tareas

Para **CP-INV-002, CP-INV-003, CP-INV-004 y CP-IPV-002**: se mantiene el estado
`PENDIENTE DE DATOS` / `BLOQUEADA_DATOS`. No se aportan documentos ni valores en
esta fase. Prohibiciones reconfirmadas: no inventar valores, no alterar
precios/costos, no ejecutar recálculos WAC basados en estimaciones. Estas tareas
no avanzan hasta que el negocio aporte la lista oficial (CP-INV-002/004), los
costos reales por recepción (CP-INV-003) o las facturas externas + política por
clase de costo (CP-IPV-002).

## 4. Límites de ejecución (C) — conformidad de este ciclo

Este registro y todos los entregables del ciclo 2 se produjeron bajo los límites
de la sección C, verificados en §8 del informe maestro del ciclo
(`docs/audits/MISION_CONTINUA_CICLO2_RESOLUCION_PROPIETARIO_2026-10-22.md`):
cero SQL de escritura, cero migraciones aplicadas, cero backfills, cero borrados,
cero cambios de permisos, cero fusiones, cero push a `main`, evidencia de
A2/Misión B intacta. La regla del propio documento — «No inferir autorizaciones
operativas a partir de estas decisiones de política» — se aplicó literalmente:
las decisiones de política NO se tradujeron en ninguna operación de datos.

## 5. Efecto sobre el inventario maestro (`scripts/extracted/tareas.csv`)

| ID | estado_mision antes | estado_mision después | Tipo de avance |
|---|---|---|---|
| CP-DATA-001 | PARCIAL | PARCIAL | Política ratificada (A.1); lotes siguen pendientes de autorización expresa |
| CP-SEC-010 | BLOQUEADA_AUTORIZACION | BLOQUEADA_AUTORIZACION | Criterio reconfirmado (A.2); A7 pendiente de demostración por evidencia |
| CP-SEC-011 | BLOQUEADA_AUTORIZACION | PARCIAL | Dirección de diseño aprobada (A.3); diseño + salvaguardas + piloto preparados; implementación pendiente de autorización |
| CP-INV-002 | BLOQUEADA_DATOS | BLOQUEADA_DATOS | Sin cambio de estado; reconfirmado §B |
| CP-INV-003 | BLOQUEADA_DATOS | BLOQUEADA_DATOS | Ídem |
| CP-INV-004 | BLOQUEADA_DATOS | BLOQUEADA_DATOS | Ídem |
| CP-IPV-001 | BLOQUEADA_AUTORIZACION | PARCIAL | Opción 1 adoptada (A.4); anotación histórica añadida; residual PRICE_ANOMALY en origen (CP-INV-004) |
| CP-IPV-002 | BLOQUEADA_AUTORIZACION | BLOQUEADA_DATOS | Mantenido pendiente de datos (§B); además requiere autorización específica |
| CP-DATA-005 | BLOQUEADA_AUTORIZACION | RESUELTA_VERIFICADA | Cierre documental (A.5) |
| CP-DATA-006 | BLOQUEADA_AUTORIZACION | RESUELTA_VERIFICADA | Cierre documental (A.6) |
| CP-CAT-006 | BLOQUEADA_AUTORIZACION | RESUELTA_VERIFICADA | Cierre documental (A.7) |

## 6. Nota sobre L4 y la decisión de vales del 2026-10-21 (delimitación honesta)

La resolución A.1 ordena: «Mantener L4 intacto mientras no se confirme la
titularidad de los tres vales». La decisión registrada el 2026-10-21
(`2026-10-21-decision-propietario-vales.md`) interpretó la instrucción
«me da igual q confirmes vales etc» como confirmación de los 3 vales como
propios (VS-000001-2026 y VS-000002-2026 en Puerto Padre, VS-000023-2026 en
Tienda Central — ninguno en ENERVIDA). **Ambas lecturas producen el mismo
estado operativo**: los 3 vales quedan intactos y excluidos de toda ruta de
limpieza (la regla de oro ya los excluía de borrado pendiente de confirmación).
Ninguna operación de datos se ejecutó sobre ellos. Si el propietario desea
cerrar formalmente la titularidad, le basta con ratificar la decisión de vales
existente; si no, L4 permanece intacto indefinidamente — en ningún caso entran
en L1/L2/L3 ni en ningún borrado.

## 7. Qué NO autoriza esta resolución (delimitación expresa)

1. Ningún borrado de datos (L1/L2/L3 requieren presentación + autorización expresa POR LOTE; L4 intacto).
2. Ningún despliegue de DT-06 ni borrado de cuentas reales (solo preparación de diseño/salvaguardas/piloto).
3. Ningún movimiento contable ni backfill de ledger (CP-IPV-001 opción 1 = anotaciones; backfill futuro exige evidencia de apertura + autorización separada).
4. Ningún backfill de `service_type_id` (CP-CAT-006 cerrado con históricos intactos).
5. Ninguna asignación automática de `tenant_id` a los 10 perfiles NULL (A.2).
6. Ninguna fusión de PRs ni push a `main` (sección C, reconfirmada).
7. Ninguna operación de producción sin autorización específica (sección C).

## 8. Trazabilidad

- Propuestas resueltas: PD-1…PD-10 de `docs/decisions/2026-10-21-propuestas-pendientes.md` (Misión C).
- Evidencia de la fuente: documento fechado 2026-10-21 entregado directamente por el propietario; copia verificable en `docs/audits/evidence/20261022-ciclo2-resolucion/RESOLUCION_PROPIETARIO_MISION_C_TEXTO.md`.
- Decisiones previas respetadas y no reabiertas: DT-03 (2026-10-19), stock negativo (2026-10-20), B.1 admin (2026-10-20), BUG-024 persistencia (2026-10-20), vales (2026-10-21).
- Expediente CP-SEC-027: citado solo por relación (A7/david9999); sin extrapolar su alcance.
- Ningún dato fue escrito, borrado ni modificado al registrar esta resolución.
