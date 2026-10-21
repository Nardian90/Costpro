# Registro de Decisiones — COSTPRO 4 MULTITIENDA

> **Estado de este directorio:** PROPUESTA DE CONTENIDO preparada por el agente en la
> Misión C (2026-10-21). El propietario no ha ratificado ninguna decisión nueva en esta
> misión. Este directorio consolida (i) decisiones **ya ratificadas** por el propietario
> con anterioridad, registradas aquí con su fuente primaria verificable, y (ii)
> **propuestas pendientes** que requieren aprobación expresa del propietario.

## Convenciones de estado

| Estado | Significado |
|---|---|
| `RATIFICADA` | El propietario aprobó la decisión y existe evidencia documental verificable (documento fechado, PR fusionado por el propietario, o prompt de aprobación citado en informe). |
| `RATIFICADA — EFECTO PENDIENTE` | La decisión existe y está registrada; falta ejecutar o autorizar las tareas/controles que la traducen en efecto. |
| `PROPUESTA — PENDIENTE DEL PROPIETARIO` | Requiere una decisión nueva del propietario. Nada de lo aquí propuesto está autorizado para ejecución. |
| `PENDIENTE DE DATOS` | Requiere papeles, Excel, identificaciones comerciales, costes u otra evidencia que aún no está disponible. |

**Reglas del registro:**

1. Los identificadores `CP-*` son los originales del inventario maestro
   (`docs/audits/INVENTARIO_MAESTRO_TAREAS_COSTPRO_2026-10-16.md`). No se crean IDs
   nuevos para decisiones ya registradas.
2. Ninguna recomendación técnica del agente equivale a autorización de ejecución.
   La regla operativa del programa sigue vigente: **ninguna escritura a BD compartida
   sin autorización explícita por lote del propietario**.
3. Las decisiones del expediente CP-SEC-027 (v5) se citan por su relación con los IDs
   CP-* del inventario, sin extrapolar su alcance.

## Índice del registro

| Archivo | Decisión | Estado | IDs CP-* afectados |
|---|---|---|---|
| `2026-10-19-decision-B-dt03-multi-tenant.md` | DT-03: modelo operativo de tenant | `RATIFICADA` (2026-10-19) — efectos residuales pendientes | CP-SEC-010 (desbloquea); CP-SEC-025/026/027 (derivadas) |
| `2026-10-20-decision-A-stock-negativo.md` | Política de stock negativo | `RATIFICADA` (2026-10-20) | CP-INV-005 (desbloquea) |
| `2026-10-20-decision-B1-alcance-admin.md` | Alcance del rol admin (B.1) | `RATIFICADA` (2026-10-20) | CP-SEC-010/CP-SEC-025 (documenta estado operativo) |
| `2026-10-20-decision-D-persistencia-incidentes.md` | Persistencia de incidentes legales (BUG-024) | `RATIFICADA` (2026-10-20) | CP-SEC-012 (cierre del subcaso BUG-024) |
| `2026-10-21-propuestas-pendientes.md` | 7 decisiones pendientes + 1 ratificación a posteriori | `PROPUESTA` / `PENDIENTE DE DATOS` | CP-DATA-001 · CP-SEC-011 · CP-INV-002/003/004 · CP-IPV-001 · CP-DATA-005/006 · CP-CAT-006 |

## Fuente de este registro

Elaborado en la **Misión C** (2026-10-21) a partir de: inventario maestro vigente,
`docs/audits/DECISIONES_PENDIENTES_MISION_C_2026-10-18.md` (actualizado 2026-10-19),
`docs/audits/DECISION_A_STOCK_NEGATIVO_2026-10-20.md`,
`docs/audits/DECISION_B1_ADMIN_GLOBAL_2026-10-20.md`,
`docs/audits/evidence/20261020-mision-c-cierre/INFORME.md`,
`docs/audits/CP-SEC-027_v5_INFORME_DECISIONES_2026-10-21.md`,
`docs/audits/CP-SEC-027_MISION_DECISION_INFORME_2026-10-21.md` y los PRs fusionados
por el propietario #1421/#1422/#1424/#1431/#1433/#1437/#1438/#1439 (verificados en
`main` @ `e6dfd885b`). Informe de conciliación completo:
`docs/audits/MISION_C_CONCILIACION_DECISIONES_2026-10-21.md`.
