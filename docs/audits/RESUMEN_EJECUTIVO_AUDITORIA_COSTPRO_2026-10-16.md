# RESUMEN EJECUTIVO — AUDITORÍA GLOBAL DE TAREAS COSTPRO 4

**Fecha:** 2026-10-16 · **Repositorio:** `Nardian90/Costpro` · **Rama:** `main` · **Commit:** `13762b31f9a3e784b3e01c4b3a8b30006c03abb2` (PR #1414)
**Modalidad:** solo lectura (0 correcciones de código, 0 escrituras de datos, 0 migraciones)
**Documento fuente de los detalles:** `docs/audits/INVENTARIO_MAESTRO_TAREAS_COSTPRO_2026-10-16.md`
**Plan derivado:** `docs/audits/PLAN_PRIORIZADO_CORRECCIONES_COSTPRO_2026-10-16.md`

---

## 1. Cifras totales

| # | Métrica | Valor |
|---|---------|-------|
| 1 | Tareas únicas identificadas | **101** |
| 2 | PENDIENTE CONFIRMADA | **64** |
| 3 | PARCIALMENTE RESUELTA | **10** |
| 4 | RESUELTA VERIFICADA | **21** |
| 5 | NO VERIFICABLE | **3** |
| 6 | NO REPRODUCIDA | 0 |
| 7 | OBSOLETA O REEMPLAZADA | **3** |
| — | DUPLICADA (contabilizadas dentro de su tarea consolidada) | 0 filas propias |
| — | **Tareas abiertas (2+3+5+7)** | **80** |

**Cómo se contabilizan los duplicados:** los informes fuentes contienen ~150 hallazgos; los que describían el mismo problema se consolidaron en una única tarea conservando todas las referencias cruzadas en su ficha (p. ej. `f854`/`f873` aparecen en 4 informes y viven una sola vez en CP-RES-006). Por eso 0 filas tienen estado DUPLICADA: se sumaron a su tarea canónica y las cifras de arriba no están infladas.

**Coherencia con el inventario maestro:** los 101 estados y prioridades de este resumen son idénticos a la tabla maestra (101 filas) y a las 101 fichas de la sección 3. La distribución de prioridad de las 80 abiertas es: **P0=1 · P1=17 · P2=35 · P3=27**.

## 2. Distribución por prioridad y área (tareas abiertas)

| Área | Abiertas | P0 | P1 | P2 | P3 |
|------|----------|----|----|----|----|
| POS (ventas) | 18 | — | 4 | 9 | 5 |
| INV (inventario) | 10 | — | 1 | 5 | 4* |
| IPV | 7 | — | 1 | 2 | 4 |
| CAT (catálogo) | 8 | — | 2 | — | 6 |
| SEC (seguridad) | 19 | 1 | 5 | 12 | 1* |
| UI | 9 | — | — | 4 | 5 |
| DATA | 6 | — | — | 1 | 5 |
| INFRA | 19 | — | 4 | 6 | 9* |
| **Total** | **80+** | **1** | **17** | **35** | **27** |

\* incluye las 3 NO VERIFICABLES y las 3 OBSOLETAS (todas P3, salvo CP-SEC-017 que es P2). La suma por columnas es exacta contra el inventario.

## 3. Las diez tareas más importantes para revisar primero

| # | ID | Título | Prioridad | Por qué primero |
|---|----|--------|-----------|-----------------|
| 1 | CP-SEC-012 | Bugs de seguridad activos con `test.fail` (BUG-013/017/022/024) | **P0** | Acceso sin auth a reportes/incidentes + XSS almacenado; el patrón test.fail los enmascara. Único P0 vigente del inventario. |
| 2 | CP-SEC-019 | 35 rutas API con `z.string().uuid()` estricto | P1 | Verificado HOY (más de los 8+ documentados): cualquier módulo puede quedar «Ha ocurrido un error» con UUID sintético de Central, como ya ocurrió con el catálogo. Fix mecánico de alto valor. |
| 3 | CP-POS-003 | «Venta por Conteo» rota (fetch sin storeId) | P1 | Módulo operativo inutilizable; reproducido el 15/10 y confirmado HOY en código. Fix de 1 línea + test. |
| 4 | CP-POS-007 | Notas de venta del Catálogo de Ventas descartadas | P1 | Pérdida silenciosa de datos de negocio en ventas reales. Hallazgo nuevo de esta auditoría. |
| 5 | CP-CAT-004 | Alta de producto en recepción sin tenant_id → 403 | P1 | Bloquea operación diaria de tienda; código sin corregir verificado HOY. |
| 6 | CP-POS-002 | Offline sync sin reserva de stock ni resolución de conflictos | P1 | Riesgo de doble venta / venta fallida post-facto en modo offline (calificado CRITICAL por el audit_v3). |
| 7 | CP-INFRA-011 + CP-INFRA-001 | Supabase aislado para E2E + reactivar CI E2E | P1 | Llave de 4+ tareas: sin entorno aislado no hay red de seguridad automatizada (ya costó 2 cortes de deploy). |
| 8 | CP-INFRA-004 | Allowlist de seguridad expira 2026-12-31; replay reintroduce SQL vulnerable | P1 | Reloj: al vencer, el gate queda roto masivamente; el saneamiento de migraciones necesita semanas de margen. |
| 9 | CP-SEC-004 | audit_logs ausente en transfers directos y recepciones | P1 | Trazabilidad/compliance: operaciones sensibles sin rastro de actor. |
| 10 | CP-POS-010 | Reporte Entrega: migración `ref_type` sin aplicar a BD compartida | P1 | El reporte contable puede mostrar cifras incompletas hasta aplicar migración autorizada + deploy. |

## 4. Riesgos que merecen atención inmediata

1. **Fuga de datos / acceso no autorizado (CP-SEC-012):** BUG-022 (URL de reportes pública) y BUG-017 (legal/incidents sin auth) son, si siguen vigentes en el despliegue, el riesgo más alto del proyecto. Verificar en producción y corregir es lo primero.
2. **DR con esquema vulnerable (CP-INFRA-004 + CP-SEC-005):** los fixes de seguridad viven «out-of-band» en la BD LIVE; una restauración desde migraciones los perdería. Ventana hasta 2026-12-31.
3. **Integridad de ventas:** notas descartadas (CP-POS-007) + offline sin reserva (CP-POS-002) + tasas hardcodeadas (CP-POS-008) acumulan pequeñas divergencias entre lo cobrado, lo registrado y lo reportado.
4. **Datos maestros del catálogo:** precios obsoletos (CP-INV-004), productos sin precio/costo (CP-INV-002) y WAC inflados 680x (CP-IPV-003) distorsionan márgenes y eluden el gate de supervisor.
5. **Sin red de seguridad (CP-INFRA-001/011):** el ritmo actual es ~12 PRs/día con E2E de CI apagado y merges históricos con previews en ERROR (CP-INFRA-009): la probabilidad de un tercer corte de producción es alta.

## 5. Áreas sin evidencia suficiente

- **Estado LIVE de policies RLS y funciones RPC** (catálogo real de la BD compartida): solo lectura de migraciones; no se ejecutó consulta alguna.
- **Settings de GitHub** (branch protection, secrets): CP-INFRA-014 NO VERIFICABLE.
- **Supabase Admin API (500)**: causa externa, no diagnosticable desde el repo (CP-SEC-017).
- **Comportamiento en producción de BUG-017/022**: documentados activos el 2026-09-27; su vigencia HOY en el deploy de Vercel no se comprobó (sería lectura de endpoints públicos — se evitó para mantener la misión estrictamente pasiva sobre la app).
- **audit-evidence/** (~200 docs crudos de 100 MB): recorridos vía informes consolidados, no íntegros.

## 6. Limitaciones de acceso y cobertura

| Limitación | Efecto |
|---|---|
| BD de producción (Supabase) no consultada | Estados RESUELTA de RLS/SQL basados en migraciones del repo, no en catálogo LIVE |
| Servicios externos no invocados (Vercel, Supabase Auth API) | CP-SEC-017 y estados de deploy NO VERIFICABLES |
| Suites de tests no ejecutadas (coste/OOM) | Estados de tests tomados de informes + specs |
| `audit-evidence/` y `scripts/` por muestreo | Posibles hallazgos menores no registrados (poco probable: los informes consolidados sí se leyeron completos) |
| Sin credenciales de usuario final | Verificación funcional de UI delegada a E2E futuros |
| Solo `main` | Cientos de ramas remotas de agentes no revisadas (los PRs citados ya están mergeados a main) |

## 7. Recomendación de orden de ejecución para las próximas misiones

1. **MISIÓN 2 — Hotfixes de operación y seguridad puntual (1 día):** CP-POS-003 (storeId), CP-POS-007 (notes), CP-CAT-004 (tenant_id), CP-SEC-019 (uuidRegex) + verificación pasiva de BUG-017/022 en producción (curl) para confirmar CP-SEC-012. Todos son fixes pequeños, testables y sin migraciones destructivas.
2. **MISIÓN 3 — Decisiones del negocio (sesión, sin código):** bloquear decisiones: política stock negativo (CP-INV-005), limpieza de datos E2E/QA (CP-DATA-001), DT-03 tenant (CP-SEC-010), precios/costos faltantes (CP-INV-002/003/004), backfill de ledger IPV (CP-IPV-001). Sin estas decisiones, las misiones técnicas siguientes no pueden cerrar.
3. **MISIÓN 4 — Red de seguridad de calidad (2-3 días):** CP-INFRA-011 (provisionar Supabase aislado) → CP-INFRA-001 (reactivar E2E en CI bloqueante) → CP-INFRA-006 (fixtures P0 de recepción) → CP-INFRA-009 (política anti-merge-ERROR). Este es el multiplicador que protege todo lo demás.
4. **MISIÓN 5 — Campaña de endpoints y saneamiento SQL (semestre, por lotes):** CP-SEC-006 (5 endpoints Alta primero) + CP-SEC-005/CP-INFRA-004 (migración de saneamiento del histórico antes del 31/12) + CP-CAT-005 (bulk-import Zod).
5. **MISIÓN 6 — Contabilidad y datos maestros:** CP-IPV-003 (WAC 680x) → CP-IPV-002 (TAREA 3 COGS bajo política) → CP-INV-001 (4 productos Puerto Padre) → CP-POS-010 (migración ref_type + confirmación viva).
6. **MISIÓN 7 — Higiene y deuda menor (puedes intercalarla):** CP-POS-008/009/005, CP-INV-008, CP-CAT-003, CP-UI-005, CP-INFRA-007/008/015/016, CP-OBS-001/002.

El orden minimiza regresiones: primero los fixes pequeños verificables, después las decisiones que desbloquean, luego la red de seguridad, y solo entonces campañas largas que modifican muchas superficies a la vez.
