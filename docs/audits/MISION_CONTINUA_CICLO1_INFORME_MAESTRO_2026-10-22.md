# MISIÓN CONTINUA DE RESOLUCIÓN DEL INVENTARIO — INFORME MAESTRO CICLO 1

**Proyecto:** COSTPRO 4 MULTITIENDA (`Nardian90/Costpro`)
**Fecha del ciclo:** 2026-10-21 → 2026-10-22 (UTC-5/Habana)
**Tipo:** implementación + verificación + PRs SIN fusionar (la fusión corresponde al propietario)
**SHA inicial:** `e6dfd885b` (main, fusionado con origin) · **Árbol inicial:** cambios preexistentes de Misiones B/C preservados intactos
**Inventario de trabajo:** `scripts/extracted/tareas.csv` (generado este ciclo — ver §1)

---

## 1. Génesis del inventario de trabajo

`scripts/extracted/tareas.csv` **no existía** en el repositorio ni en ninguna
rama remota (verificado: `git ls-tree origin/main`, `git log --all -- <path>`,
API de GitHub). Se generó extrayendo la tabla maestra de
`INVENTARIO_MAESTRO_TAREAS_COSTPRO_2026-10-16.md`: **101 tareas únicas, 0
duplicados, 16 columnas** (8 maestras preservadas + 8 de misión:
`estado_mision, fecha_verificacion, diagnostico_mision, solucion,
archivos_modificados, pruebas_resultado, pr, notas_residuales`). El extractor
vive en `/home/z/my-project/scripts/extract_tareas_csv.py` (fuera del repo;
parser con soporte de pipes embebidos en backticks). El CSV se actualizó fila
a fila durante el ciclo y su estado final concuerda con este informe.

## 2. Estado final del inventario (101 filas, todas clasificadas)

| Estado de misión | Cantidad | IDs |
|---|---|---|
| RESUELTA_VERIFICADA | **27** | 22 previas + 5 verificadas este ciclo: CP-POS-009, CP-UI-005, CP-SEC-007, CP-SEC-020, CP-SEC-018 |
| CORREGIDA_POR_ESTE_CICLO (en PR) | **8** | CP-CAT-005, CP-SEC-004, CP-INV-009, CP-CAT-003, CP-SEC-015, CP-INFRA-012, CP-SEC-003*, CP-INV-008 |
| EN_COLA_PROXIMO_CICLO (accionables) | **10** | ver §6 |
| BLOQUEADA_AUTORIZACION | **12** | CP-POS-010, CP-SEC-010/A7, CP-SEC-011, CP-IPV-001, CP-IPV-002, CP-DATA-003, CP-DATA-005, CP-DATA-006, CP-CAT-006, CP-INV-006, CP-INFRA-007, CP-INV-005(efecto) |
| BLOQUEADA_VENTANA_A2 (hasta 2026-11-04) | **5** | CP-SEC-005, CP-INFRA-001, CP-INFRA-003, CP-INFRA-004, CP-INFRA-016 |
| PENDIENTE_DE_VERIFICACION_DESPLIEGUE | **4** | CP-POS-003, CP-POS-007, CP-CAT-004, CP-SEC-019 (fixes M2 fusionados; verificación local rehecha 17/17) |
| PARCIAL | **3** | CP-POS-008 (consolidación hecha; UX pendiente de decisión), CP-UI-001 (ítem 2 preparado; 3-5 pendientes), CP-DATA-001 (vales RESUELTO; lotes de limpieza pendientes) |
| BLOQUEADA_DATOS | **3** | CP-INV-002, CP-INV-003, CP-INV-004 (sin estimaciones ni invención de valores) |
| OBSOLETA_O_DUPLICADA | **3** | CP-INV-007, CP-OBS-001, CP-OBS-002 |
| NO_APLICA / YA RESUELTA / POR DISEÑO | **3** | CP-POS-005 (superado por diseño INC-2026-10-19/#1432), CP-UI-004 (por diseño), CP-DATA-002 (resuelta previa contabilizada en 27) |
| Otras bloqueos específicos (entorno/credenciales/dependencia/decisión/versiones) | **23** | detalle fila a fila en el CSV |

\* CP-SEC-003 y CP-UI-001(2/5): **migraciones PREPARADAS, NO APLICADAS** (PR #1444) con guards fail-closed que se niegan a ejecutarse si las pre-condiciones no se cumplen.

## 3. PRs creados este ciclo (NINGUNO fusionado por el agente)

| PR | Ramas | Tareas | Contenido |
|---|---|---|---|
| **#1441** | `fix/api-seguridad-cp-cat-005-cp-sec-004-cp-sec-018` | CP-CAT-005 (P1), CP-SEC-004 (P1), CP-SEC-018 (P2) | Zod estricto por fila en bulk-import (rechaza propiedades desconocidas; 400 con detalle por fila), auditoría de ediciones de recepciones (logReceptionUpdated), contrato de email duplicado blindado. 19 tests nuevos; regresión api+hooks 413/413 |
| **#1442** | `fix/vales-kardex-cp-inv-009` | CP-INV-009 (P2) | Invalidar caches kardex/product-kardex al emitir/devolver vales (criterio de aceptación de la tarea). 2 tests que fallan sin el fix |
| **#1443** | `fix/quickwins-cp-cat-003-cp-sec-015-cp-pos-008-cp-infra-012` | CP-CAT-003, CP-SEC-015, CP-POS-008, CP-INFRA-012, CP-INV-008 | Categorías efímeras (doctrina F20/1379), rol canónico `superadmin` (el valor con guion bajo era código muerto), 12 literales 680 → `USD_CUP_RATE` con guardián, pool de concurrencia acotada en import-trm, comentario obsoleto. Regresión total 843/843 |
| **#1444** | `fix/migraciones-preparables-cp-sec-003-cp-ui-001` | CP-SEC-003 (P2), CP-UI-001 ítem 2/5 (P2 contable) | Migraciones PREPARADAS con guards fail-closed: consolidación de policies UPDATE de products (DROP de la última débil viva) + exclusion constraint contra periodos solapados de comisiones. Test de contrato 6/6 |
| **#1445** (docs) | `docs/mision-continua-ciclo1-inventario` | documental | Este informe + CSV + registro de decisión de vales + ejecutor preparado + docs preexistentes de Misiones B/C pendientes de commit + actualización documental del inventario maestro |

**Orden de revisión sugerido:** #1440 (del propietario, nulidad compuesta) →
#1441 → #1442 → #1443 → #1444 → #1445. Los 4 PRs de código no comparten
archivos entre sí; #1445 es docs-only.

## 4. Hallazgos clave del ciclo (contraste con el documento antiguo)

1. **El inventario maestro estaba desactualizado en al menos 5 filas** —
   exactamente el patrón que la misión ordenó no dar por abierto: CP-POS-009
   (resuelta por #1419/#1422/#1423), CP-UI-005 (plan de 7 commits ejecutado),
   CP-SEC-007 (#1428/#1433 + secret configurado), CP-SEC-020 (rem_inv_6 ya
   revocó EXECUTE anon/PUBLIC), y parcialmente CP-SEC-004 (transfers ya usa
   RPC auditable; solo recepciones-updates quedó vivo).
2. **CP-SEC-015 escondía un defecto funcional real**: `'super_admin'` nunca
   existió en la BD — un superadmin NO recibía el acceso ilimitado que
   `FIX-ADMIN-UNLIMITED` le prometía (comparación muerta en pick3/advisor y
   pick3/subscription).
3. **CP-SEC-003 persistía a través de otra policy**: no eran las
   `*_store_access` (dropeadas en v2.21.5) sino `products_update_rls`
   (20260619, membresía sin check de tenant, `WITH CHECK` vacío) la que
   OR-aneaba a la estricta `products_tenant_update` de F3-P0.
4. **El guardián de CP-POS-008 encontró 2 archivos más allá de la ficha**
   (`salesCatalogHelpers.ts` consolidado; `ExchangeIntelligenceView.tsx`
   eximido con justificación: su 680 es EUR del mercado informal).

## 5. Pruebas ejecutadas (todas reales; sin afirmar lo no ejecutado)

| Verificación | Resultado |
|---|---|
| Suites nuevas del ciclo (bulk-import 10, managed-create 4, recepciones-audit 5, vales 2, catálogo 3, roles 3, tasas 2, import-trm 3, migraciones 6) | **38 tests nuevos, 38/38 PASS** |
| Regresión `src/__tests__/api/` + `hooks/` + `components/` | **90 archivos: 843 passed | 6 skipped, 0 fallos** |
| Suites de verificación de ya-corregidos (M2 ×4, vales ×3, catálogo 1379) | 17/17 + 31/31 + 7/7 PASS |
| ESLint de todos los archivos tocados | 0 errores (warnings preexistentes de botones crudos documentados) |
| **NO ejecutado (limitaciones honestas):** suite completa (~3.5k tests, la corre el CI de cada PR — OOM local documentado CP-INFRA-002); E2E de navegador (sin servidor/credenciales); verificaciones en vivo de BD (sin `.env` en este sandbox); sonda de despliegue | — |

## 6. Cola priorizada del próximo ciclo (10 accionables)

1. **CP-SEC-006** — primer lote Zod: los 5 endpoints de prioridad Alta del backlog del Security CI Gate.
2. **CP-POS-001** — rutina programada read-only de reconciliación stock↔ledger (script + cron; sin escrituras).
3. **CP-DATA-004** — documentar los 29 componentes de review_queue.
4. **CP-POS-006** — test de integración del pro-rateo de comisiones.
5. **CP-INFRA-013** — reevaluación documental Vercel AI SDK (el plazo Q3 ya venció).
6. **CP-UI-006** — fix de sesión del FC MVP (leer fc-mvp docs primero).
7. **CP-INFRA-010** — CB5 (carrito con `Product` completos en localStorage) y CB3 (landing RSC); la parte de budget en CI queda tras la ventana A2.
8. **CP-INFRA-015** — warnings de deploy (stripe opcional + outputFileTracingIncludes).
9. **CP-CAT-002** — análisis + migración preparable de matching de confirm_transfer.
10. **CP-SEC-009 / CP-POS-002 / CP-IPV-005 / CP-UI-002** — análisis de diseño primero (sin código hasta tener el diseño).

## 7. Decisiones del propietario registradas este ciclo

- **VALES (instrucción directa 2026-10-21):** registro formal en
  `docs/decisions/2026-10-21-decision-propietario-vales.md`. Los 3 vales
  manuales (VS-000001-2026 y VS-000002-2026 en Puerto Padre; VS-000023-2026
  en Tienda Central) están **FUERA de Enervida** → confirmados como datos
  legítimos con exclusión permanente de limpieza; **cero escrituras de BD
  necesarias**. Regla permanente Enervida: anular vales no confirmados —
  ejecutor preparado `scripts/vales/enervida_vales_no_confirmados.py`
  (lectura por defecto; `--apply` solo con credenciales del propietario,
  triple confirmación, RPC oficial `reverse_vale_salida`). Al corte, todos
  los vales de Enervida documentados están confirmados por conciliación
  (VS-000185..188-2026, 179/179) — no se identificó operación pendiente.
- **Delimitación explícita aplicada:** «confirmes vales etc.» NO cubre
  borrados (tiendas D, usuarios D, residuos 9-oct) — siguen requiriendo
  autorización por lote con confirmación UUID por UUID.
- Token GitHub: usado exclusivamente para abrir/actualizar PRs; guardado
  fuera del repo y de la evidencia (`/home/z/my-project/.credentials/`).

## 8. Límites respetados (verificación de conformidad)

- **Cero fusiones**, cero push a `main`, cero cambios de reglas de protección.
- **Cero escrituras de producción**: sin migraciones aplicadas, sin RLS
  modificado en vivo, sin backfills, sin datos tocados. Las dos migraciones
  nuevas viven solo en el PR #1444 con guards fail-closed.
- **Ventana A2 respetada**: workflows, `scripts/ci-gate-*`, allowlist y
  evidencia A2 intactos hasta 2026-11-04 (las 5 filas afectadas quedaron
  BLOQUEADA_VENTANA_A2; el único cambio relacionado fue documentar
  `SECURITY_CI_GATE_DESIGN.md` §9 — un doc, no un objeto A2).
- **Decisiones ratificadas respetadas**: DT-03, B.1 (admin global), stock
  negativo, BUG-024→audit_logs (no reabiertas; BUG-013/017/022/024 intactos).
- **Cambios preexistentes preservados**: los documentos sin commit de las
  Misiones B/C viajan íntegros en el PR docs.
- **CP-SEC-027**: expediente separado; solo se citó evidencia suya (caso B
  del dictamen A2), sin extrapolación.

## 9. Resumen ejecutivo para el propietario

**27 tareas resueltas verificadas + 8 corregidas en PRs listos + 3 parciales
con su parte accionable hecha + 12 esperando SU autorización puntual + 5
congeladas por la ventana A2 + 4 esperando verificación desplegada + resto
bloqueado por datos/entorno/credenciales/diseño.** Cinco PRs abiertos
(#1441–#1445), ninguno fusionado. Las autorizaciones concretas que faltan
están en §6 del informe de conciliación de Misión C y en las notas fila a
fila del CSV: la más inmediata es decidir el commit/fusión de los PRs
documentales y, si quiere activar las migraciones preparadas, correr antes
las dos queries de verificación que viven en sus encabezados.

---

## ADENDA — CI de los 5 PRs (cierre del ciclo, 2026-10-22)

Los checks de los 5 PRs terminaron **todos en verde** (success/skip, cero
fallos). #1441 requirió 3 commits de corrección de CI, cada uno con causa
raíz identificada:

1. **TS2556** (TypeCheck de CI): `vi.fn(impl)` con implementación sin
   parámetros infiere firma `[]` y todo spread sobre ella es ilegal — fix:
   rest param en la implementación del mock. (tsc local no verificable por
   el OOM documentado CP-INFRA-002; CI es la autoridad de typecheck.)
2. **Fallo real de determinismo multi-entorno** (Unit & Integration): en CI
   existen env vars de Supabase → `getSupabaseAdminSafe()` devolvía un
   cliente y los inserts de auditoría del test iban por el camino admin (no
   capturados). Fix: mock del admin a `null` + reproducida la condición de
   CI localmente (env vars presentes → 413/413).
3. **Higiene de aislamiento**: la config de vitest no tiene `unstubEnvs`, por
   lo que los `vi.stubEnv` persisten en el `process.env` del worker y pueden
   contaminar archivos posteriores del mismo pool (el fallo transitorio de
   `ai-command-center` — componente ajeno al diff del PR — coincidió con el
   cambio de scheduling por la adición de archivos). Fix:
   `afterAll(() => vi.unstubAllEnvs())`. Los 3 tests del archivo de
   recepciones-audit que afirban CERO inserts ganaron además valor real con
   el fix 2 (antes pasaban de forma espuria en CI).

Estado final de checks por PR (heads): #1441 `ac02f4308` 6 ok + 2 skip ·
#1442 `5a2bbf957` · #1443 `484d936d3` · #1444 `128e9077e` · #1445 `110e23075`
— cero fallos. Ninguna fusión realizada (decisión del propietario).
