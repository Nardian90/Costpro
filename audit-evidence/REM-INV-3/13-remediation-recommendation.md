# REM-INV-3 — FASE 19 — Recomendación de remediación (NO ejecutar en este gate)

Este gate NO implementa cambios de datos ni de código (§2, §23, §34 del task
order). Lo que sigue es la recomendación para el gate de remediación separado,
sujeta a decisión humana (criterio contable/operativo), en coherencia con la
doctrina NO_DATA_REPAIR ya establecida por obs1 para estos mismos documentos.

## Opciones evaluadas

### Opción A — ANULAR (status='voided' con void_reason trazable)
Adecuada SI la decisión contable es que los documentos no deben contar como
créditos emitidos. Requiere: snapshot exacto PRE (IDs, números, items, totales),
operación atómica idempotente por IDs exactos (13/13), audit por documento,
verificación POST de "no other NC changed". El estado voided conserva la verdad
histórica y saca los documentos del universo activo.

### Opción B — ELIMINAR
NO recomendada: la trazabilidad de los documentos (incluido NC-000008 como caso
documentado del Bug #5) tiene valor de auditoría; la eliminación rompería la
cadena de evidencia consolidada en 3 evidence packs (REM-INV-1, obs1, REM-INV-3).

### Opción C — RECONSTRUIR efectos
NO procede: el efecto económico real es 0 (05/11); reconstruir movimientos o
pagos fabricaría evidencia contable falsa (§23 lo prohíbe expresamente).

### Opción D — MARCAR COMO TEST
Requiere un mecanismo OFICIAL de clasificación (p.ej. columna/tag auditado o
catálogo de razones de test). Si no existe, es preferible la Opción A con
void_reason normalizado (p.ej. 'hot-test-residue-2026-08 REM-INV-3').

### Opción E — NO TOCAR
Viable si el negocio decide que el valor documental no distorsiona reportes
criticos. Mientras tanto, los reportes que sumen devolutions completadas deben
documentar la exclusión de estos 13 IDs.

### Opción F — GATE CONTABLE ESPECIAL
El paso de 'completed' a 'voided' de documentos por 353,850 CUP nominales exige
criterio humano/contable (§19/§22). Este gate termina en esa espera deliberada.

## Recomendación consolidada

1. (Datos — decisión humana) ANULAR los 13 documentos vía mecanismo oficial con
   snapshot pre/post y audit — Opción A, u Opción D si se aprueba antes un
   mecanismo oficial de marcado. Retener NC-000008-2026 como caso documentado
   del Bug #5 (sin borrar nunca).
2. (Código/DB — hardening de 1 línea, gate separado con canal DDL) REVOKE
   EXECUTE ON FUNCTION public.create_devolution(uuid,uuid,uuid,text,uuid,text,
   uuid,text,text) FROM authenticated; — neutraliza el único reproductor
   potencial residual del patrón fantasma (v1), precedente F-01/REM-V2-3.
   Complemento: valorar DROP del v1 tras verificar 0 dependencias (mismo método
   REM-INV-2R, PROHIBIDO CASCADE).
3. (Proceso) Reducir la superficie de residuos: los hot-tests deben ejecutarse
   en tiendas de prueba, nunca en TIENDA CENTRAL; el reset_store_data debería
   dejar audit del evento (backlog ya registrado por obs1: "resets sin audit").
4. (Sistema) Si el negocio necesita créditos fiscales reales, la integración
   financiera DF-03 ya cubre las NC nuevas; los 13 documentos de la era no
   requieren retro-integración (impacto real 0).

## Requisitos de regresión para el gate de remediación

- Pin invariante: toda devolution 'completed' del universo ACTIVO debe tener
  ≥1 stock_movement 'return' vinculado (o marcado test/voided).
- Contract test: authenticated NO puede ejecutar create_devolution (v1) tras el
  REVOKE; create_devolution_v2 sigue service_role-only.
- Suite completa (tsc/eslint/vitest) 0 errores + zero-touch fingerprint
  bitwise de todas las tablas excepto las 13 filas autorizadas.
