# MISIÓN — Conciliación Excel ↔ COSTPRO (Enervida-Vitallcons) y Comisiones por Producto

Estado: EN CURSO. Este documento se actualiza con el avance de cada fase; el informe
final de auditoría vivirá en `docs/audits/AUDITORIA_CONCILIACION_ENERVIDA_VITALLCONS.md`.

## Fases y estado

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Inspección inicial, modelo de datos, respaldo verificable | ✅ |
| 2 | Auditoría hoja «Operaciones» + caso SKU 127→137 | ✅ 837 conciliadas; f873 CORREGIDA (VS-000179); f854 pendiente de decisión |
| 3 | Conciliación de existencias + análisis Kardex | ✅ 160/161 (SKU 141 +10 = f854, explicado) |
| 4 | Informe de auditoría | ✅ |
| 5 | Comisiones por producto | ✅ 110 reglas importadas (idempotente) + fix UI ceros + 6 tests |
| 6 | Pruebas obligatorias (14 casos) | ✅ 14/14 (suite 2916 ×2, tsc, eslint) |
| 7 | Informe final + criterios de aceptación | ✅ (f854 queda como pendiente documentada) |

## Principios de la misión

- El Excel (`Costpro.xlsx`) es fuente de referencia; NO se modifica.
- Primero diagnosticar, después corregir solo lo evidenciable, con trazabilidad completa.
- Respaldo verificable de toda fila/registro afectado ANTES de cualquier corrección.
- Las correcciones se hacen en COSTPRO (aplicación/mecanismos de persistencia), nunca importando indiscriminadamente.
- No borrar historial de auditoría; no tocar tiendas/operaciones ajenas.
- Comisiones: integrarse con la arquitectura existente (`commission_rules`), sin sistemas paralelos; carga idempotente; cero explícito se conserva como cero.
- Cada corrección y regla debe sobrevivir a recargas y re-logins (persistencia real, no solo UI).

## Artefactos

- Excel fuente: `/home/z/my-project/upload/Costpro.xlsx` (no versionado).
- Scripts de conciliación (reproducibles, read-only salvo correcciones explícitas): `scripts/enervida-recon/`.
- Respaldo pre-corrección: `scripts/enervida-recon/backups/`.
- Informe final: `docs/audits/AUDITORIA_CONCILIACION_ENERVIDA_VITALLCONS.md`.
