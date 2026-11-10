# VALIDACION_PR_1593_RELEASE — Liberación FASE 2 de Plantillas de Fichas de Costo

**Misión:** CP-PLANTILLAS-FASE2-RELEASE-001 · **Repositorio:** Nardian90/Costpro · **Fecha:** 2026-11-10
**PR:** [#1593](https://github.com/Nardian90/Costpro/pull/1593) · **Estado final:** MERGED en `main` @ `09a8ede`

---

## 1. Estado inicial del PR

| Campo | Valor al iniciar la misión |
|---|---|
| Título | feat: CP-PLANTILLAS-FASE2 — plantillas privadas persistentes en servidor (RLS + servicio + Explorador + editor) |
| Estado | open, no draft, `mergeable: true`, `mergeStateStatus: clean` |
| Rama | `feat/plantillas-privadas-servidor-20261110` → `main` |
| SHA head | `35d09da42f8b14a8b0150c21ab4c35705f9be15a` |
| Commits | 4 (migración RLS → servicio → store+i18n → Explorador/editor), +2400/−386 en 11 archivos |
| Check-runs | 7 publicados, todos success |
| Workflows | **CI = failure** y **Security CI Gate = failure** a nivel de workflow (incoherencia investigada en §4) |
| Revisión automática | Codex reportó `has_unresolved_findings` y después un límite de uso de revisiones (comment del connector) — limitación del servicio de revisión, no del código; no constituye un veredicto técnico |

Ningún commit se incorporó al branch después de la última revisión (el head 35d09da es el commit revisado y el último del PR).

## 2. Auditoría funcional (flujos)

Verificados en el código (rama del PR, worktree aislado) y ejecutados en la app integrada de producción (§6):

- **Tres operaciones claramente diferenciadas** en la barra del editor (`CostSheetView.tsx` + `CostSheetModuleNav.tsx`):
  1. **Guardar Ficha** → `handleSaveToSupabase` → tabla `cost_sheets` (⌘S mapeado a esta acción).
  2. **Guardar como Plantilla** → `CostSheetSaveAsTemplateDialog` → `cost_sheet_templates` (`type='private'`, `created_by=auth.uid()`, `store_id=NULL`).
  3. **Exportar JSON** → descarga de archivo local. Botones con `aria-label` independientes confirmados en la UI de producción.
- **Flujos ejecutados end-to-end en producción** (`costpro4.vercel.app`, usuario de prueba QA): crear plantilla privada → persistida en Supabase; recargar página (otra sesión) → recuperada desde «Mis plantillas guardadas en COSTPRO»; renombrar + modificar descripción (dos pasadas) → reflejado en BD; actualizar contenido (cargar plantilla al editor, modificar, «Actualizar plantilla existente» con confirmación) → `md5(data)` cambió en BD; eliminar → toast + 0 filas en BD.
- **Intactos:** las **13 plantillas de sistema** renderizadas en el tab SISTEMA (sys-reinicio, sys-lavar, sys-juice, sys-pizza, sys-pastry, sys-furniture, sys-industrial, sys-consultancy, sys-icecream, sys-repair, sys-shoes, sys-logistics, sys-ejemplo — son hardcoded en el frontend, no filas de BD) y la sección **MIS PLANTILLAS LOCALES (ARCHIVOS JSON)** con su carpeta local, junto a los botones Exportar/Importar JSON.
- **Aislamiento:** a nivel PostgreSQL en CostproE2E con identidades reales (§5) y en producción por igualdad exacta de expresiones RLS + comportamiento del tab PÚBLICAS para el usuario QA (0 filas ajenas).

## 3. Auditoría de arquitectura

- **Servicio** (`cost-sheet-template-service.ts`, 393 líneas): abstracción única de acceso a `cost_sheet_templates`; nunca envía `type/created_by/store_id` en updates de propietario; mapea errores PostgREST (`42501` → permiso, red → red) a mensajes accionables; los filtros cliente (`eq type/created_by`) son documentales — la RLS es la fuente de verdad.
- **Store** (`cost-sheet-store.ts`): nuevo `activeTemplateId` (origen de la ficha activa) que se limpia en cada `setSheet` y se establece al cargar plantilla — habilita «Actualizar plantilla existente» sin sobrescribir en silencio.
- **Diálogo de guardado:** destino PRIVADA por defecto; opción PÚBLICA solo para admins (`isAdminLevel`); confirmación explícita antes de sobrescribir.
- **Explorador** (`CostSheetTemplateExplorer.tsx`): listados privadas/públicas/sistema/locales separados; todas las operaciones pasan por el servicio con confirmación accesible (sin `confirm()` nativo) y bloqueo anti doble-click.
- **i18n:** claves nuevas `saveAsTemplate*`/`destination*`/`scope*` en `es.json` y `en.json` (sin claves sin usar — las aparentes claves ajenas del diff provenían de comparar contra un `main` local desactualizado).
- **Manifest E2E** (`e2e-migrations-manifest.json`): 139 → 140 incluidas; la migración en posición 140 con `sha256_original == sha256_generado` (sin transformaciones); test de replay actualizado con comentario de trazabilidad.
- **Alcance:** los 4 commits son exclusivamente CP-PLANTILLAS-FASE2. Sin cambios en `cost_sheets` ni `store_cost_templates`.

## 4. CI originales, causa raíz de los fallos y correcciones

| Workflow (SHA 35d09da) | Resultado inicial | Resultado tras reintento controlado |
|---|---|---|
| CI | **failure** (workflow) con su único job `TypeCheck + Lint + Unit Tests + Build` success | **success** (attempt 2), 2 jobs ejecutados |
| Security CI Gate | **failure** (workflow) con job `Allowlist Review` success | **success** (attempt 2), 2 jobs ejecutados |
| SQL Security Gate | success | success |
| E2E Aislado | success | success |
| Test Coverage | success | success |

**Causa raíz documentada con evidencia:** los dos workflows definen 2 jobs cada uno (`ci.yml`: `quality` + `security`/«Security Audit»; `security-gate.yml`: `ts-security-checks`/«TypeScript Security Checks» + `allowlist-review`). En el run del SHA 35d09da los segundos jobs **nunca llegaron a materializarse** (sin registro en el jobs API, sin check-run, sin log), y el run quedó como failure. Los runs vecinos (16:56/17:00 y 20:05 UTC del mismo día) ejecutaron sus 2 jobs con normalidad. La ventana coincide exactamente con el incidente crítico del proveedor **«Incident with Actions and Checks API»** (githubstatus.com), iniciado antes de las 18:29 UTC del 2026-11-09 y **resuelto a las 18:59:32 UTC**; el run afectado arrancó a las 18:29:05 UTC. Los logs descargados no contienen ni un `##[error]` — no hubo fallo de código ni de configuración. **El límite de uso de Codex es un problema del servicio de revisión automática, no de los workflows de GitHub Actions**; se documentó y no se confundió con el estado del CI.

**Remedio aplicado (sin debilitar controles):** reintento controlado de ambos runs vía API (`POST /actions/runs/{id}/rerun`), permitido por la misión para fallos externos/intermitentes. En el attempt 2 **ambos jobs perdidos ejecutaron y pasaron** («Security Audit» y «TypeScript Security Checks» = success), demostrando que el fallo era de infraestructura. Adicionalmente los 4 gates de los jobs afectados se ejecutaron en local con resultado limpio: `ci-gate-ts-checks.js` ✓, `bola-contract-test.cjs` 5/5 ✓, `security-contract-test-static.cjs` (contrato OK, 2 warnings MEDIUM/LOW semántica idéntica al LIVE) ✓, `check-writers.mjs` (122 escritores declarados) ✓. No se desactivó ningún workflow, ni se usó `continue-on-error`, ni se eliminó aserción alguna.

**Tablero final del PR (check-runs del head):** TypeCheck + Lint + Unit Tests + Build ✓ · Security Audit ✓ · TypeScript Security Checks ✓ · Allowlist Review ✓ · SQL Static Checks ✓ · SQL DB Security Checks ✓ · Unit & Integration Tests ✓ · E2E Aislado ✓ · Vercel Preview ✓ — **9/9 verdes, sin checks ausentes.**

## 5. Auditoría de seguridad — matriz de autorización a nivel PostgreSQL

Ejecutada en **CostproE2E** (mismo esquema que queda en producción tras la migración) mediante el endpoint oficial de Management API, con `SET LOCAL ROLE authenticated` + `request.jwt.claims` de usuarios E2E reales y captura de excepciones en una única transacción con `ROLLBACK` (residuo cero por construcción). Evidencia: `evidencias_pr1593/matriz_autorizacion_e2e.json`.

**24/24 comprobaciones PASS**, incluyendo:

| Operación | Usuario normal | Propietario | Administrador |
|---|---|---|---|
| Consultar privada propia / ajena | ✓ ve solo la suya | — | ve todo |
| Crear privada propia | ✓ | ✓ | ✓ |
| Crear pública directamente | DENEGADO 42501 | DENEGADO 42501 | según política admin |
| Cambiar private→public (autopublicar) | DENEGADO 42501 | DENEGADO 42501 | ✓ (publicar/retirar mismo registro) |
| Cambiar private→system | DENEGADO 42501 | DENEGADO 42501 | n/a |
| Transferir `created_by` | DENEGADO 42501 | DENEGADO 42501 | según política |
| Asignar `store_id` a privada propia | DENEGADO 42501 | DENEGADO 42501 | ✓ (facultad admin) |
| Modificar/eliminar privada propia | ✓ | ✓ | ✓ |
| Modificar/eliminar privada ajena | 0 filas (efectivo) | 0 filas | ✓ (gestión) |
| anon SELECT / INSERT | DENEGADO (42501) | — | — |
| `created_by=auth.uid()`, `type='private'`, `store_id IS NULL` en inserciones privadas | verificado en fila devuelta | | |
| `has_store_access`: pública store-scoped visible ⟺ membresía activa | verificado (usuario miembro de tienda en E2E) | | |
| Trigger `updated_at` (transacción separada) | `updated_at > created_at` tras UPDATE | | |

**Observación preexistente documentada (no regresión del PR):** en ambos proyectos, `is_admin()` y `has_store_access()` tienen EXECUTE para `authenticated` pero no para `anon`; con la política SELECT `TO public`, un `anon` recibe 42501 «permission denied for function is_admin» al consultar la tabla. Es la situación anterior a la migración (la SELECT ya era `TO public`), mantiene al `anon` sin ningún acceso y el módulo exige sesión; se recomienda una migración futura (GRANT EXECUTE a anon o `TO authenticated`) — no se alteró en esta liberación por quedar fuera del alcance versionado.

## 6. Prueba funcional final (aplicación integrada de producción)

Después del merge y del despliegue de Vercel (production deploy success para `09a8ede`), se ejecutó el flujo completo de la misión §13 sobre `https://costpro4.vercel.app` con un usuario QA (`tenant_admin`→`costo`, tienda QA propia):

1. Iniciar sesión con usuario normal ✓
2. Crear plantilla privada («Guardar como Plantilla», destino PRIVADA por defecto, sin opción pública para no-admin) ✓
3. Persistencia confirmada en Supabase (`type='private'`, `created_by=auth.uid()`, `store_id=NULL`, `data` completo) ✓
4. Actualizar la página ✓
5. Recuperar la plantilla tras recargar (otra sesión/dispositivo) ✓
6. Renombrar ✓ (dos pasadas, ambas reflejadas en BD)
7. Actualizar contenido (plantilla cargada al editor → cambio → actualizar existente con confirmación) ✓ (`md5(data)` cambió; `updated_at` avanzó)
8. Eliminar ✓ (toast + 0 filas)
9. Aislamiento respecto a plantillas de otros usuarios ✓ (tab PÚBLICAS vacío para el QA; equivalencia exacta de expresiones RLS con E2E)
10. Operaciones administrativas de publicación y retirada — **limitación documentada:** sin credenciales de admin de producción; validadas a nivel PostgreSQL en E2E (publicar/retirar/cambiar ámbito/eliminar ajena, PASS).
11. Plantillas de sistema intactas: 13 visibles en SISTEMA ✓
12. Archivos JSON locales intactos: sección «MIS PLANTILLAS LOCALES (ARCHIVOS JSON)» + botones Exportar/Importar JSON presentes ✓

**Observación de UX documentada (no defecto):** en «Actualizar plantilla existente» el diálogo también envía los campos nombre y descripción que muestra editables (prefill del editor); el comportamiento es coherente con el texto del diálogo y la confirmación explícita, y no implica riesgo de seguridad (RLS limita a privadas propias).

## 7. Integración

- **Merge:** autorizado expresamente por el propietario en la instrucción final de la misión («quiero cerrado… el merge al pd y aplicada las migraciones ciclo cerrado»); ejecutado con método merge-commit el 2026-11-10.
- **SHA resultante en `main`:** `09a8ede` («Merge pull request #1593…»), verificado por API y por fetch local.
- **Integridad:** el archivo `20261110120000_cp_plantillas_privadas_propietario.sql` en `main` conserva el hash SHA-256 `fbe9a0f17c43eeb534f8e51749524d9c13ba117a8c0b2fa72af7504d36d8e434` (14640 bytes), idéntico al auditado en el PR.
- CI post-merge en `main`: **7/7 check-runs success** (TypeCheck + Lint + Unit Tests + Build, Security Audit, TypeScript Security Checks, Allowlist Review, SQL Static Checks, SQL DB Security Checks, Unit & Integration Tests) y Vercel production deploy success para `09a8ede`.

## 8. Entregables relacionados

- `DESPLIEGUE_MIGRACION_1593_PRODUCCION.md` — aplicación y verificación de la migración en CostproBD.
- `AUDITORIA_POST_RELEASE_1593.md` — auditoría read-only de limpieza post-release (mision CP-PLANTILLAS-FASE2-PRODUCTION-CLEANUP-001): barrido de las 78 FK reales hacia `stores`, verificación del usuario QA, estado exacto de la tienda QA residual (`is_active=false` por `soft_delete_store`; `is_archived=false`/`archived_at=NULL` correctos por diseño), análisis de `archived_by` y clasificación de hallazgos con regularización propuesta pendiente de autorización.
- `evidencias_pr1593/` — estado fresco de ambos proyectos antes de aplicar, expresiones de políticas E2E, matriz de autorización (JSON), hash del SQL, verificación post-apply de producción, captura del tab PÚBLICAS, y las evidencias read-only del post-release (`cleanup_auditoria.json`, `cleanup_auditoria_fases_2_3.json`).
