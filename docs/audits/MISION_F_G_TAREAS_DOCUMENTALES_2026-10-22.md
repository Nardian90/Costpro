# MISIÓN F/G — TAREAS DOCUMENTALES Y DE ANÁLISIS SIN DEPENDENCIA DE DATOS COMERCIALES (PREPARACIÓN)

**Proyecto:** COSTPRO 4 MULTITIENDA (`Nardian90/Costpro`)
**Fecha de preparación:** 2026-10-22 (ciclo 2 de la Misión Continua)
**Base de la decisión:** Resolución del propietario — Misión C (2026-10-21), ítems B y D.5; registrada en `docs/decisions/2026-10-21-resolucion-propietario-mision-c.md`
**Estado de este documento:** `PREPARACIÓN — sin ejecutar código nuevo, sin pedir autorizaciones nuevas`

> **Mandato literal del propietario:** «Preparar para la Misión F/G las tareas
> documentales y de análisis que no dependan de los datos comerciales
> ausentes.» Y de la sección C: «No dejar que un bloqueo de datos o autorización
> detenga tareas independientes que puedan avanzar con seguridad.» Este documento
> separa lo bloqueado de lo accionable y prepara la cola del próximo ciclo.

---

## 1. Exclusiones explícitas (con causa documentada)

### 1.1 Bloqueadas por datos comerciales ausentes (resolución §B — no se avanza)

| ID | Dato que falta |
|---|---|
| CP-INV-002 | Lista oficial de precios/costos/nombres por SKU (160–177 y otros «Incompleto») |
| CP-INV-003 | Costos reales de las 13 recepciones (facturas) |
| CP-INV-004 | Precios vigentes SKU 92/134/111 (y auditoría extendida de catálogo) |
| CP-IPV-002 | Facturas externas + política por clase de costo (re-costeo COGS) |
| CP-IPV-003 | Depende de CP-IPV-002 (4 WAC inflados 680x) |

**Regla aplicada (mandato §B):** no inventar valores, no alterar precios/costos,
no recalcular WAC con estimaciones.

### 1.2 Bloqueadas por autorización específica pendiente (fuera de F/G documental)

| ID | Autorización que falta | Parte preparable SIN autorización |
|---|---|---|
| CP-POS-010 (P1) | Aplicar migración `20261012000001` + verificación viva cash report | Ninguna nueva (todo preparado) — solo re-presentar el paso mínimo al propietario |
| CP-INV-006 | UPDATE opcional de `reception_date` de 54 recepciones | Ninguna (paquete ya documentado) |
| CP-INFRA-007 | Eliminación del cementerio de scripts (45 MB) | Inventario + plan de eliminación por lotes (documental) — ver §2.B-11 |
| CP-DATA-003 | Limpieza de histórico de pruebas en pilotos A/B | Se presenta junto con el plan L1/L2/L3 (Misión D) cuando el propietario decida lotes |
| CP-INV-005 (efecto) | Regularización de artefactos QA por lote | Ídem — lotes de ajuste con autorización por lote |
| CP-SEC-010/A7 | Ratificación a posteriori del backfill david9999 | **Memo de cierre basado en evidencia existente** — ver §2.A-1 |

### 1.3 Congeladas por la ventana A2 (hasta 2026-11-04 — intactas)

CP-SEC-005 · CP-INFRA-001 · CP-INFRA-003 · CP-INFRA-004 · CP-INFRA-016 y la parte
de budget de bundles en CI de CP-INFRA-010 (toca workflows). Ni documentación
adicional que modifique objetos A2; solo se citan.

## 2. Cola preparada para el próximo ciclo (sin dependencia de datos ausentes)

### A. Derivadas directas de la resolución de este ciclo (nuevas, documentales)

| # | Tarea | Tipo | Entregable propuesto | Origen |
|---|---|---|---|---|
| A-1 | **Memo de cierre A7 (CP-SEC-010)**: analizar si la evidencia existente (dossier `BACKFILL_DAVID9999_DOSSIER.md` + matriz DT-03 `raw/14` + membership activa ENERVIDA) demuestra que la asignación david9999→Default Tenant fue correcta; presentar conclusión al propietario para ratificación a posteriori (o remediación §6 del expediente) | Documental/evidencia | Memo con veredicto por criterio + acta de ratificación lista para firmar | Resolución A.2 |
| A-2 | **CP-SEC-025 F1**: inventario completo de las 56 políticas RLS vivas (por tabla: capa legado vs tenant-gated, gate, roles, USING/WITH CHECK, solapamientos OR) | Documental/read-only | Informe F1 + clasificación por capa | Misión E §8 |
| A-3 | **CP-SEC-025 F2**: propuesta canónica por tabla + borrador de texto de migración con tests de aislamiento (SOLO borrador; la migración PR con guards va con autorización) | Documental/diseño | Documento F2 por tabla (10 tablas) | Misión E §8 |

### B. Cola priorizada heredada del ciclo 1 (verificado: ninguna depende de datos ausentes)

| # | ID | Tarea | Tipo | Nota de preparación |
|---|---|---|---|---|
| B-1 | CP-SEC-006 (P1) | Primer lote Zod: 5 endpoints Alta del backlog del Security CI Gate | Código local | PR por lote cuando corra el ciclo de implementación; no requiere datos de negocio |
| B-2 | CP-POS-001 (P2) | Rutina programada read-only de reconciliación stock↔ledger | Diseño + código read-only | Diseño documental primero; el script es SELECT/WITH-only (patrón `db.py`); cron solo con despliegue autorizado |
| B-3 | CP-DATA-004 (P3) | Documentar los 29 componentes de `review_queue` | Documental | Puro |
| B-4 | CP-POS-006 (P2) | Test de integración del pro-rateo de comisiones | Prueba local | Sin datos de negocio (fixtures sintéticos) |
| B-5 | CP-INFRA-013 (P3) | Reevaluación documental Vercel AI SDK (plazo Q3 vencido) | Documental | Puro |
| B-6 | CP-UI-006 (P2) | Fix de sesión FC MVP (`useSessionManager` + cuentas hardcodeadas) | Código local | Leer primero docs fc-mvp |
| B-7 | CP-INFRA-010 (P2) | CB5 carrito `Product` completos + CB3 landing RSC | Código local | La parte de budget en CI queda tras ventana A2 |
| B-8 | CP-INFRA-015 (P3) | Warnings de deploy (stripe opcional + tracing 11k) | Código/config menor | — |
| B-9 | CP-CAT-002 (P3) | Análisis + migración preparable de matching `confirm_transfer` (unidad/tenant) | Análisis + migración PREPARADA | Patrón #1444 (guards fail-closed, NO aplicada) |
| B-10 | CP-SEC-009 (P2) | Análisis de diseño del modelo de autorización (H-09-AUTH-01..04) | Análisis | «Sin código hasta tener el diseño» |
| B-11 | CP-INFRA-007 (P3, parte documental) | Inventario + plan de eliminación del cementerio de scripts | Documental | La eliminación misma sigue BLOQUEADA_AUTORIZACION |
| B-12 | CP-IPV-005 (P3) | Paquete de decisión de alcance del refactor IPV (4 fases) | Análisis/decisión | Presentar opciones de alcance/riesgo al propietario |
| B-13 | CP-UI-002 (P3) | Paquete de decisiones de diseño para fases C/D/E (checklists vacíos) | Análisis/decisión | Presentar decisiones de producto al propietario |
| B-14 | CP-POS-002 (P1) | Investigación de diseño: offline sync con reserva de stock/resolución de conflictos | Análisis profundo | «Sin solución segura sin análisis profundo» — análisis primero |

### C. Paquetes de decisión de negocio preparables (documentales, para presentarse al propietario)

| # | ID | Paquete |
|---|---|---|
| C-1 | CP-INV-001 | Paquete de decisión «Modelo A documentado» para los 4 productos de Puerto Padre con `inventory ≠ Σ movimientos`: opciones de remediación con costes/riesgos, sin ejecutar nada |
| C-2 | CP-POS-010 | Re-presentación del PASO MÍNIMO: aplicar `20261012000001` + verificación viva del cash report (autorización existente pendiente desde antes de la resolución) |
| C-3 | Plan L1/L2/L3 | Presentación de lotes para autorización expresa (Misión D, ya preparado: `MISION_D_PLAN_LIMPIEZA_L1_L2_L3_2026-10-22.md`) |

## 3. Orden de ejecución propuesto para el próximo ciclo

1. **Documentales puros primero** (cero riesgo): A-1, A-2, A-3, B-3, B-5, B-11, B-12, B-13, C-1.
2. **Análisis de diseño** (cero escrituras): B-10, B-14, B-2 (diseño).
3. **Código local + pruebas** (PRs por dominio, sin fusión): B-1, B-4, B-6, B-7, B-8, B-9.
4. **Presentaciones al propietario** (decisiones/autorizaciones): C-2, C-3, A-1 (acta), y las decisiones de B-12/B-13.
5. En paralelo cuando el propietario autorice: migraciones PREPARADAS pendientes de
   aplicación (#1444: CP-SEC-003 consolidación policies UPDATE + CP-UI-001 ítem 2)
   y CP-SEC-027 fase de despliegue (`20261019000001`) — **cada una con sus queries
   de verificación previas que viven en sus encabezados**.

## 4. Cobertura frente al plan de correcciones original

- **Misión F original (contabilidad/catálogo/datos maestros):** su núcleo
  (CP-IPV-003 → CP-IPV-002, CP-INV-001, CP-POS-010) sigue bloqueado por
  datos/autorización — F/G prepara aquí solo los paquetes de decisión (C-1, C-2)
  y ningún backfill. La escritura histórica de Misión F requiere «decisiones
  firmadas» + «autorización explícita por lote» (condiciones del plan original,
  reconfirmadas por la resolución §C).
- **Misión G original (UX/higiene/deuda menor):** su parte accionable coincide
  con la cola B (CP-POS-006/008-*, CP-INV-008/009 ya fusionados, CP-CAT-002/003,
  CP-UI-001 ítems 2-5, CP-INFRA-010/015) — avanza por PRs pequeños sin depender
  de Misión D/E.
- **Misión D original (red E2E aislada):** desbloqueada en su prerrequisito de
  residuos cuando L1/L2/L3 se autorice y ejecute (ver plan §9); el resto
  (proyecto de pruebas, guards) ya tiene el tooling del 9-oct (modo legacy,
  `E2E_ISOLATION` opt-in, specs de creación deshabilitados).

## 5. Conformidad

- Ninguna tarea de §2 requiere datos comerciales ausentes (criterio D.5).
- Ninguna requiere SQL de escritura, migraciones aplicadas, borrados ni cambios
  de permisos en producción (criterio §C); los PRs de código propuestos son
  locales y sin fusión.
- Las tareas A2/Misión B no se tocan; las 5+1 filas congeladas por la ventana
  A2 permanecen intactas hasta 2026-11-04.
- Este documento no ejecuta ninguna de las tareas listadas: las prepara y
  prioriza para el próximo ciclo de la Misión Continua.

## 6. Trazabilidad

- `docs/audits/MISION_CONTINUA_CICLO1_INFORME_MAESTRO_2026-10-22.md` §6 (cola heredada).
- `scripts/extracted/tareas.csv` (estado fila a fila de todos los IDs citados, verificado este ciclo).
- `docs/audits/MISION_D_PLAN_LIMPIEZA_L1_L2_L3_2026-10-22.md` (lotes).
- `docs/audits/MISION_E_DISENO_DT06_CP-SEC-025_026_2026-10-22.md` (A-2/A-3, B-9/B-10 origen).
- Plan de correcciones original (2026-10-16): definiciones de Misiones F y G.
