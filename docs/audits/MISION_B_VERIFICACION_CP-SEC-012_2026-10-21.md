# MISIÓN B — VERIFICACIÓN P0 DE SEGURIDAD Y TRIAGE: CP-SEC-012 (BUG-013/017/022/024)

**Expediente:** COSTPRO 4 MULTITIENDA — Misión B del plan priorizado (`PLAN_PRIORIZADO_CORRECCIONES_COSTPRO_2026-10-16.md`, §Misión B)
**Fecha de auditoría:** 2026-10-21 (ventana 03:25–03:50 UTC)
**SHA auditado:** `e6dfd885b5d610005ccb53edb4b22f32e215e186` — `main` (fusión del PR #1439 por el propietario, 2026-10-20 23:25:50 −0400)
**Modo:** verificación pasiva, solo lectura. CERO cambios funcionales, CERO escrituras a producción/BD, CERO commits/push/PRs, CERO modificaciones a workflows, rulesets, scripts o evidencias de la observación A2.
**Alcance:** los 4 subcasos de CP-SEC-012 y sus dependencias directas (`src/app/api/legal/incidents/*`, `src/app/api/reports/*`, endpoint/componentes Academy de nombres de archivo, specs E2E citados). No se amplió a auditoría general.

---

## A. RESUMEN EJECUTIVO

### A.1 Estado del repositorio (fase previa, §2 del encargo)

| Elemento | Estado verificado |
|---|---|
| Rama / SHA | `main` @ `e6dfd885b5d610005ccb53edb4b22f32e215e186` |
| Árbol de trabajo | **Limpio** (`git status --porcelain` vacío); sin modificaciones ajenas que preservar |
| Clon | Fresco (2026-10-21 ~03:27 UTC). El sandbox anterior se perdió (reinicio de entorno); el registro durable sobrevive en el repo (PR #1439) |
| PRs relevantes | **#1439** docs-only, **fusionado por el propietario** (dictámenes A1/A2 + inventario). **#1431** «Cierre de decisiones Misión C (CP-SEC-027 F9)» **fusionado por el propietario** (`merged_by=Nardian90`, 2026-10-19T19:01:52Z) — contiene la reescritura F9.D del endpoint de incidentes. **#1440** único PR abierto (nulidad compuesta/cash_refun) — **sin relación** con los dominios auditados |
| Inventario maestro | La copia vigente es `docs/audits/INVENTARIO_MAESTRO_TAREAS_COSTPRO_2026-10-16.md` (actualizada por MISIÓN 2 el 2026-10-17). La copia `.docx` del 16/10 en `upload/` está **obsoleta** (no refleja la actualización M2) |
| CP-SEC-012 registrado al iniciar | **PARCIALMENTE RESUELTA (M2, 2026-10-17)**: BUG-013/017/022 corregidos con evidencia local; BUG-024 abierto (decisión de persistencia pendiente) |
| Misión A (estado registrado, sin re-auditoría) | 4 tareas **VALIDADAS** según conciliación del 21/10 (`CP-SEC-027_MISION_DECISION_INFORME_2026-10-21.md:48`: código presente + 25/25 pruebas en vivo + producción operativa desde el 18/10 vía PR #1421, fusionado por el propietario). No se re-implementaron ni se re-auditó |
| Observación A2 | Continúa en paralelo (cierre 2026-11-04). **No se tocó** ninguno de sus workflows, scripts, configuración ni evidencias |

Distinguimiento de evidencia (§2.5): **histórica** = curl local 401 de MISIÓN 2 (2026-10-17) y migración/verificación del bucket por E2E-PRODUCT-FIX-ROUND1 (2026-10-05); **actual** = todo lo ejecutado hoy en el SHA auditado (§B); **supuestos no verificados** = estado del despliegue vivo (inferido por fusión+auto-deploy, no sondeado) y flag vivo `public=false` del bucket (no re-verificado hoy).

### A.2 Resultado global de CP-SEC-012

**Ninguno de los 4 subcasos permanece activo en el código actual.** Los cuatro están corregidos con implementación vigente y pruebas adecuadas ejecutadas hoy (24/24 PASS, §B). Además, el supuesto original de esta misión («BUG-024 requiere decisión funcional pendiente») quedó **desfasado**: la decisión de persistencia **ya fue ratificada por el propietario** (Decisión D, Misión C, 2026-10-20) e implementada en el PR #1431, que el propio propietario fusionó el 19/10. Detalle y alternativas en §D.

| Subcaso | Estado asignado (§6 del encargo) |
|---|---|
| BUG-017 — `/api/legal/incidents` sin auth | **CORREGIDO VERIFICADO** (código + contrato 8/8 hoy + CI) |
| BUG-022 — URL de reportes pública | **CORREGIDO VERIFICADO** (código + regresión 16/16 hoy + CI + frontend) |
| BUG-013 — XSS almacenado en filename Academy | **CORREGIDO VERIFICADO** (código + demo aislada 9/9 hoy + CI) |
| BUG-024 — persistencia efímera | **CORREGIDO VERIFICADO EN CÓDIGO** (Decisión D ratificada por el propietario + contrato 8/8 hoy); residuales operativos documentados en §D |

### A.3 Riesgo residual y limitaciones

1. **Despliegue vivo no sondeado por HTTP.** No existe URL de producción en el expediente (`.env.example` apunta a `localhost:3000`), y el protocolo prohíbe POST de prueba (crearía un incidente real si el defecto viviera). El estado «desplegado» es **inferencia** (fusión en `main` + auto-deploy), no verificación directa. Es la única verificación pendiente de las cuatro fichas.
2. **BUG-013 tiene la malla de regresión más débil.** El spec E2E solo hace `console.warn` si el bug revive (`e2e/academy.spec.ts:70-72`), no existe test unitario propio del endpoint, y el spec está **desalineado** con el modelo actual: envía token de rol `user`, pero el endpoint es ahora admin-only (`withRole('admin')`, `academy/generate/route.ts:191`) → si se ejecutara con token `user` devolvería 403, código no contemplado en `[400,200,502,404]` (`academy.spec.ts:69`).
3. **BUG-024**: índice parcial `20261020000005` **sin aplicar** en BD (autorización A4 del expediente v5 pendiente — afecta solo rendimiento del GET, no la corrección); el spec E2E conserva un **skip permanente obsoleto** (`legal.spec.ts:80-82`); la persistencia viva no se ha ejercitado (legajo `legal_incident` = 0 filas al 21/10, verificación read-only del expediente v5).
4. **Criterio de aceptación «specs sin test.fail» aún NO cumplido**: los specs conservan `test.fail` condicional (auto-correcto: la rama solo se ejecuta si el bug revive) y el skip de BUG-024. Su actualización es un cambio de tests **prohibido por esta misión** (§7) — requiere autorización.
5. **Bucket `reports`**: el flag vivo `public=false` no se re-verificó hoy (sin credenciales Supabase en esta misión); la última evidencia es la migración `20261005120001_bug022_reports_private_bucket.sql` (E2E-PRODUCT-FIX-ROUND1) con su verificación documentada.
6. **Rate limiting in-memory** (CP-SEC-013, P1, fuera de alcance): los 401/403 verificados no dependen del rate limiter, pero la protección anti-abuso de estos endpoints sigue siendo por-instancia.

### A.4 Pruebas que NO se ejecutaron (identificadas, §8.B)

| Prueba omitida | Motivo |
|---|---|
| Suite E2E Playwright (los 4 specs citados) | Requiere app corriendo + `E2E_TEST_USER_TOKEN`; no disponible. En CI corren como **skipped** (2 check-runs E2E skipped en el SHA auditado) |
| Sonda HTTP contra el despliegue vivo (GET/POST sin token) | URL de producción ausente en el expediente; POST de prueba prohibido (§4/§7: no crear incidentes reales); no se sondean dominios a ciegas |
| Verificación viva del bucket `reports` (flag public) | Sin credenciales Supabase en esta misión (limitación documentada, se detiene ahí) |
| Ejercicio de persistencia viva (POST real → fila `audit_logs`) | Prohibido crear incidentes reales (§4) |
| Suite vitest completa (≈3 170 tests) en local | No duplicada: el check CI «Unit & Integration Tests» = **success** en el MISMO SHA auditado cubre ese resultado; localmente se ejecutaron los 2 ficheros específicos de estos bugs |

---

## B. MATRIZ DE EVIDENCIA

Todas las rutas:líneas corresponden al SHA auditado `e6d885`. Comandos completos en el Apéndice A; evidencia cruda en `docs/audits/evidence/20261021-mision-b/` (copia espejo en `download/mision-b-20261021/evidencia/` del entorno del agente).

| ID | Comportamiento esperado | Evidencia actual (código) | Prueba ejecutada | Resultado | Estado | Riesgo residual |
|---|---|---|---|---|---|---|
| **BUG-017** | POST `/api/legal/incidents` sin sesión → 401; nunca escritura sin auth | `legal/incidents/route.ts:54-58` (`getServerSession` → 401 «No autorizado»); export POST `:222`; GET = `withRole('admin')` `:223` con 401/403 (`auth-middleware.ts:202-208,247`); rate limit 5/min `:61-64`; Zod `:32-37,92-102` | 1) Contrato vitest HOY `legal-incidents-audit.test.ts`: POST sin sesión → 401 + **0 escrituras**; GET sin sesión → 401 con `withRole` REAL. 2) CI: «Unit & Integration Tests» success en `e6d885`. 3) Histórico M2: curl local 401 (2026-10-17) | 8/8 PASS hoy (2 de ellas cubren 401 sin escritura); CI verde; histórico coherente | **CORREGIDO VERIFICADO** | Despliegue vivo no sondeado (inferido por fusión) |
| **BUG-022** | La URL del reporte no es accesible sin autenticación | `download/[runId]/route.ts:23-25` (UUID estricto), `:33-47` (ownership ejecutor/admin), `:76-79` (`withAuth` → 401 `auth-middleware.ts:99-107`); `generate/route.ts:160-179` (URL = `/api/reports/download/<runId>`, sin `createSignedUrl`/`getPublicUrl`), export `withRole('manager')` `:188-191`; migración `20261005120001` (bucket privado + DROP política pública); frontend `useReportState.ts:304-315` (Bearer + blob, sin `window.open` directo) | 1) Regresión vitest HOY `e2e-product-fix-round1.test.ts`: 5 aserciones BUG-022 (app + bucket + migración + frontend). 2) CI verde en `e6d885`. 3) Histórico M2: curl local 401 en download | 16/16 PASS hoy (5 específicas de BUG-022); CI verde | **CORREGIDO VERIFICADO** | Bucket vivo no re-verificado hoy; despliegue no sondeado |
| **BUG-013** | Filename malicioso neutralizado antes de persistir; endpoint con auth | `academy/generate/route.ts:26-27` (401), `:44` (FIX-SEC-009: `path.basename` + whitelist `[^a-zA-Z0-9_\-]→'_'`), `:47-48` (404 si el manual sanitizado no existe), `:172` (solo `source: safeName` se persiste), `:191`/`:214` (`withRole('admin')`); schema `api-schemas.ts:125-130`; UI `AcademyView.tsx:209-221` (filename solo desde lista servida por el GET admin) | 1) Demo aislada HOY (script replicando byte-exact `route.ts:43-44`): 9 vectores XSS/traversal. 2) CI verde. 3) Histórico M2: curl local 401 | 9/9 neutralizados: `<script>alert(1)</script>.pdf` → `script_`; `../../etc/passwd.pdf` → `passwd`; sin `< > " ' / \ ..` en ningún output | **CORREGIDO VERIFICADO** | Malla de regresión débil y desalineada (§A.3.2); sin test unitario del endpoint; XSS no provocado en producción (prohibido) |
| **BUG-024** | Persistencia de incidentes duradera (no FS efímero) y legible con autorización | `legal/incidents/route.ts:111-142` (insert UNA fila `audit_logs` `action='legal_incident'`, cliente admin), header `:14-27` (`data/incidents.json` DEPRECADO, no se lee ni escribe), `:199-219` (GET admin paginado); `data/incidents.json` verificado hoy: `{"incidents": []}`; migración índice `20261020000005` presente en árbol, NO aplicada en BD (A4 pendiente) | 1) Contrato vitest HOY: 201 → exactamente 1 fila `audit_logs` con `metadata.deprecated_file`; fallback JSON no usado (el mock lanza si se invoca). 2) CI verde. 3) Expediente v5 (21/10): legajo 0 filas en BD, índice ausente — verificación read-only previa | 8/8 PASS hoy (persistencia a BD demostrada a nivel contrato) | **CORREGIDO VERIFICADO EN CÓDIGO** — decisión funcional YA ratificada por el propietario (§D) | Persistencia viva no ejercitada (0 filas); índice A4 sin aplicar (rendimiento); skip E2E obsoleto |

---

## C. ANÁLISIS INDIVIDUAL

### C.1 BUG-017 — `/api/legal/incidents` aceptaba requests sin autenticación

- **Descripción original:** el POST creaba incidentes sin exigir sesión (`e2e/auth.spec.ts:46` documentaba el bug con `test.fail` condicional).
- **Causa raíz:** los endpoints del dominio legal quedaron fuera del hardening principal en la fase E2E-80; se decidió documentar el bug en vez de corregirlo (ficha original del inventario).
- **Evidencia actual (SHA `e6d885`):** `route.ts:54-58` exige `getServerSession` y devuelve 401 «No autorizado» sin sesión/token; el flujo continúa solo con rate limit (`:61-64`, 5/min por usuario), Zod estricto (`:32-37`) y validación de body (`:92-102`). El GET es `withRole('admin')` (`:223`): 401 sin sesión, 403 sin rol (`auth-middleware.ts:202-247`). El middleware `withRole` se ejecuta **realmente** en el contrato vitest (no mockeado).
- **Impacto de mantenerlo activo:** fuga de incidentes legales + escritura anónima de incidentes falsos en el legajo.
- **Prueba ejecutada hoy:** contrato `src/__tests__/api/legal-incidents-audit.test.ts` (8/8): «sin sesión → 401» con aserción de **cero escrituras**; «GET sin sesión → 401 (withRole real)»; «rol clerk → 403»; «admin → 200 paginado». CI «Unit & Integration Tests» success en el mismo SHA. Especs E2E de regresión presentes (`auth.spec.ts:35-50`, `legal.spec.ts:5-11`) aunque no ejecutables aquí (§A.4).
- **Alcance de corrección adicional:** ninguno requerido. La malla de regresión existente (contrato + specs E2E auto-correctos) es adecuada para este subcaso.

### C.2 BUG-022 — URL de reportes accesible sin autenticación

- **Descripción original:** `/api/reports/generate` devolvía URLs públicas (bucket `reports` público / signed URLs), de modo que el PDF quedaba accesible sin sesión (`e2e/reports.spec.ts:51`).
- **Causa raíz:** diseño original de reportes por URL compartible sin control de acceso al objeto.
- **Evidencia actual:** triple capa verificada. (1) **Generación**: `generate/route.ts:160-179` construye la URL como `/api/reports/download/<runId>`; el test estático de hoy confirma que el fichero ya no contiene `createSignedUrl` ni `getPublicUrl`; export `withRole('manager')` (`:188-191`). (2) **Descarga**: `download/[runId]/route.ts` exige sesión (`withAuth`, export `:76-79`; 401 en `auth-middleware.ts:99-107`), valida runId como UUID estricto (`:23-25`) y verifica **ownership** del run: ejecutor o admin (`:43-47`); el objeto se lee con service_role tras la privatización del bucket. (3) **Almacenamiento**: migración `20261005120001_bug022_reports_private_bucket.sql` (`UPDATE storage.buckets SET public = false` + `DROP POLICY "Public Access to Reports"`, sin política SELECT nueva). **Frontend**: `useReportState.ts:304-315` descarga con `Authorization: Bearer` + blob, sin abrir la URL directa.
- **Impacto de mantenerlo activo:** fuga P0 de datos de negocio (reportes PDF de cualquier tienda a quien tuviera el enlace).
- **Prueba ejecutada hoy:** `src/__tests__/integration/e2e-product-fix-round1.test.ts` (16/16), de las cuales 5 aserciones cubren BUG-022 (app, bucket, migración, frontend). CI verde. Histórico M2: curl sin token → 401 contra el download.
- **Riesgo residual específico:** el flag vivo del bucket no se re-verificó hoy (§A.3.5); una URL antigua firmada antes de la privatización (si existió, con 24 h de vida) estaría expirada desde 2026-10-06.

### C.3 BUG-013 — XSS almacenado en filename de Academy

- **Descripción original:** el filename enviado a `/api/academy/generate` se persistía sin sanitizar como `source` en `learning_cards`, permitiendo XSS almacenado (`e2e/academy.spec.ts:71`).
- **Causa raíz:** falta de normalización del nombre de archivo en el endpoint MVP.
- **Evidencia actual:** `academy/generate/route.ts:43-44` aplica FIX-SEC-009: `path.basename` (elimina traversal, p. ej. `../../etc/passwd.pdf` → `passwd`) + whitelist `[^a-zA-Z0-9_\-] → '_'` (elimina `< > " ' ( ) ; &` etc.). El único valor derivado del filename que se persiste es `source: safeName` (`:172`). Endurecimiento adicional: CSRF `validateOrigin` (`:24`), sesión obligatoria (`:26-27`, 401), rate limit 10/min (`:29-32`), Zod `academyGenerateSchema` (filename 1–200, `api-schemas.ts:125-130`), **rol admin obligatorio** en POST y GET (`:191`, `:214` — el endpoint es una vista EN DESARROLLO), y 404 si el manual sanitizado no existe (`:47-48`). En la UI, el filename no es texto libre: `AcademyView.tsx:209-221` alimenta el selector desde la lista que devuelve el GET (admin) del propio endpoint.
- **Prueba ejecutada hoy:** demo aislada (script del agente, replicación byte-exact de `route.ts:43-44`): 9/9 vectores neutralizados, incluidos los dos payloads literales de los specs E2E — `<script>alert(1)</script>.pdf` → `script_` (sin metacaracteres) y `../../etc/passwd.pdf` → `passwd`. NOTA de método: es una prueba de equivalencia de las expresiones puras, complementada con la inspección estática de que la ruta las aplica y persiste solo `safeName`; no se provocó XSS en producción (prohibido por protocolo).
- **Prueba de regresión necesaria (recomendada, NO implementada por prohibición §7):** (1) test unitario del endpoint que fije `safeName` y el 401/403 (hoy no existe); (2) realinear el spec E2E con el modelo admin-only (403 para rol `user`) y convertir el `console.warn` en `test.fail` real; (3) opcionalmente, aserción de que `learning_cards.source` resultante no contiene metacaracteres.
- **Riesgo residual específico:** la malla de regresión es débil (§A.3.2); mientras tanto, la defensa es la sanitización + rol admin + 404 (verificadas hoy).

### C.4 BUG-024 — persistencia efímera de incidentes

Ver tratamiento especial completo en §D. Resumen de estado: **CORREGIDO VERIFICADO EN CÓDIGO** — la decisión funcional ya fue tomada por el propietario (Decisión D, 2026-10-20) e implementada en PR #1431 (fusionado por el propietario); residuales operativos: índice A4, skip E2E obsoleto, ejercicio vivo de persistencia.

---

## D. BUG-024 — DECISIÓN DE PERSISTENCIA (tratamiento especial, §5 del encargo)

### D.1 La decisión funcional YA NO PENDÍA: fue ratificada por el propietario

Esta misión partía del supuesto de que la decisión seguía abierta. La evidencia demuestra lo contrario y no procede reabrirla:

| Hito | Fecha | Evidencia |
|---|---|---|
| Registro original (skip permanente, «deuda de arquitectura») | 2026-09-27 | `e2e/legal.spec.ts:80-82` + ficha E2E-80 |
| Propuesta técnica M2 («migrar a tabla `legal_incidents` con RLS») | 2026-10-17 | `MISION_2_...2026-10-17.md:134` |
| **Decisión D ratificada** (Misión C): persistencia en `audit_logs` con `action='legal_incident'` | 2026-10-20 | `evidence/20261020-mision-c-cierre/INFORME.md` §D; comentario de cabecera `incidents/route.ts:12` («F9.D — Decisión D ratificada, 2026-10-20») |
| Implementación fusionada (endpoint reescrito + contrato 8/8 + migración índice) | 2026-10-19/20 | Commit `e79d21bbc`; **PR #1431 `merged_by=Nardian90`** (2026-10-19T19:01:52Z, verificado hoy vía API) |
| Estado pendiente restante | 2026-10-21 | Expediente v5 §3 + `PAQUETE_D_LEGAL_INCIDENTS.md`: índice NO aplicado (autorización **A4** pendiente); legajo 0 filas (verificación read-only del 21/10) |

### D.2 Comportamiento implementado vs. comportamiento que esperan los tests

- **Código actual:** POST autenticado → UNA fila atómica en `audit_logs` (`route.ts:111-142`) con `action='legal_incident'`, id legible `INC-YYYYMMDD-XXXXXXXX` (randomUUID, `:42-50`), y `metadata.deprecated_file='data/incidents.json'`. GET admin paginado (≤100/página) del legajo (`:199-219`). `data/incidents.json` queda deprecado: no se lee ni escribe (verificado hoy: contenido `{"incidents": []}`).
- **Tests de contrato (vitest, ejecutados hoy, 8/8 PASS):** fijan exactamente ese contrato — 201 → 1 fila con `action`/`table_name`/`user_id`/`record_id` UUID/`incidentId`/`metadata`; el mock del cliente de respaldo **lanza error** si se usa, demostrando que no se escribe archivo; 401/403/400/429 cubiertos.
- **Tests E2E:** el spec de BUG-024 (`legal.spec.ts:80-82`) es un `test.skip(true)` permanente — quedó **obsoleto**: saltaba «Architecture issue, data/incidents.json is ephemeral in serverless», pero la arquitectura ya no usa ese archivo. Los otros tests de incidentes del spec E2E (validaciones 400, 401, concurrencia BUG-018) siguen siendo válidos como expectativas.

### D.3 Alternativas de persistencia y consecuencias (registro del espacio de decisión)

| Alternativa | Consecuencias | Veredicto |
|---|---|---|
| **A. FS local `data/incidents.json`** (estado original) | Efímero en serverless (cada instancia su FS), sin lectura posible del legajo, sin aislamiento, sin auditoría transaccional; pierde incidentes en re-despliegues | Descartada — era exactamente el defecto BUG-024 |
| **B. `audit_logs` con `action='legal_incident'`** (**ELEGIDA — Decisión D**) | Durabilidad y transaccionalidad inmediatas reutilizando la tabla de auditoría existente (patrón audit-service con cliente admin); legajo consultable/paginable por action + índice parcial barato; sin tabla/policies nuevas que mantener. Contrapartidas: el legajo convive con la auditoría general (separación solo por `action`), escritura vía service_role (bypass RLS, coherente con el patrón de auditoría del proyecto) y el índice A4 aún sin aplicar | **Implementada y fusionada**; contratada por 8/8 tests |
| **C. Tabla propia `legal_incidents` con RLS** (propuesta M2) | Tipado y aislamiento limpios, lectura multi-tenant natural con policies, semántica propia (estados, acciones, resolución como columnas). Contrapartidas: migración nueva, policies RLS nuevas, servicio y tests propios — mayor costo y superficie de riesgo; el volumen actual del legajo (0 filas) no lo justifica | Vía futura razonable si el legajo crece o necesita workflow propio; hoy no necesaria |
| **D. Supabase Storage (objeto JSON por incidente)** | Simple de escribir. Contrapartidas: sin consultas ni paginación efícientes, coste por objeto, control de acceso por objeto — inadecuado para un legajo consultable | No recomendada |

### D.4 Recomendación razonada (no decisión: la decisión ya es del propietario y está tomada)

Mantener la **Decisión D** (alternativa B): corrige el defecto con el menor costo y riesgo, está cubierta por contrato, y fue ratificada y fusionada por el propietario. Acciones complementarias que **sí** penden del propietario (ninguna ejecutada por esta misión):

1. **Autorizar A4** (aplicar el índice parcial `20261020000005`, paquete D del expediente v5: idempotente, ~0 filas hoy, reversible sin pérdida — solo rendimiento del GET admin).
2. **Autorizar la actualización de los tests**: sustituir el skip obsoleto de `legal.spec.ts:80-82` por una prueba de persistencia real (contrato ya existe en vitest; la prueba E2E viva requiere el entorno aislado de la Misión D).
3. **Facilitar la URL del despliegue + autorizar sondas GET sin token** (401 esperado) para cerrar la verificación de despliegue de BUG-017/022 pendiente desde M2.

**No** se recomienda reabrir la decisión ni migrar ahora a la alternativa C: no hay evidencia de necesidad (legajo vacío) y la reescritura introduciría riesgo sin beneficio actual. Si el dominio legal evoluciona a workflow propio (estados, asignaciones, resoluciones), la alternativa C es la ruta de evolución natural — como decisión separada y futura.

---

## E. INVENTARIO MAESTRO — CAMBIOS DE ESTADO

### E.1 Cambios propuestos (y aplicados documentalmente)

| Ítem | Estado anterior | Estado propuesto → aplicado | Base |
|---|---|---|---|
| CP-SEC-012 (global) | PARCIALMENTE RESUELTA (M2, 2026-10-17) | **RESUELTA EN CÓDIGO — VERIFICADA (MB, 2026-10-21)**; cierre formal pendiente de: sonda de despliegue + índice A4 + actualización de specs | 24/24 tests hoy + CI verde en `e6d885` + PR #1431 fusionado por el propietario |
| BUG-017 | Corregido (evidencia local M2) | **CORREGIDO VERIFICADO** (contrato hoy + CI) | §C.1 |
| BUG-022 | Corregido (evidencia local M2) | **CORREGIDO VERIFICADO** (regresión hoy + CI + frontend) | §C.2 |
| BUG-013 | Corregido (evidencia local M2) | **CORREGIDO VERIFICADO** (demo aislada hoy + CI); deuda de malla de regresión registrada | §C.3 |
| BUG-024 | Abierto (decisión pendiente) | **CORREGIDO VERIFICADO EN CÓDIGO — Decisión D ya ratificada por el propietario e implementada**; residuales: A4 + skip E2E obsoleto + ejercicio vivo | §D |

### E.2 Aplicación efectuada (estrictamente documental)

- **Archivo:** `docs/audits/INVENTARIO_MAESTRO_TAREAS_COSTPRO_2026-10-16.md` — (1) fila resumen de CP-SEC-012 y (2) bloque «VERIFICACIÓN MISIÓN B (2026-10-21)» añadido a la ficha, siguiendo el precedente formal del bloque M2.
- **Forma:** ediciones locales en el árbol de trabajo, **sin commit, sin push** (prohibidos por §7). El árbol estaba limpio antes de esta misión; los únicos cambios son los archivos documentales de esta misión (informe + evidencia + inventario), todos revisables con `git status`.
- **Salvaguardas respetadas:** ningún caso marcado como resuelto sin demostración (BUG-024 conserva sus residuales explícitos); el criterio de aceptación «specs sin test.fail» queda documentado como NO cumplido aún; no se sobrescribió trabajo ajeno (bloque añadido, no reemplazado).

---

## F. DICTAMEN FINAL

## **MISIÓN B CERRADA: CORRECCIONES VERIFICADAS O SIN DEFECTOS ACTIVOS CONFIRMADOS**

**Justificación:**

1. **Sin defectos activos confirmados.** Ninguno de los 4 subcasos de CP-SEC-012 se reprodujo en el código actual; en los cuatro existe implementación correctiva vigente en el SHA auditado.
2. **Correcciones verificadas con evidencia reproducible de hoy:** contrato F9.D 8/8 + regresión BUG-022 16/16 ejecutados localmente en el SHA `e6d885` (24/24 PASS), demo de sanitización BUG-013 9/9 vectores neutralizados, CI verde en el mismo SHA (TypeCheck+Lint+Unit+Build success; Unit & Integration success; Security Audit success), y cadena documental completa de las correcciones (M2 2026-10-17 → round1 bucket 2026-10-05 → F9.D 2026-10-20, con el PR #1431 fusionado por el propietario).
3. **La única decisión funcional asociada (persistencia de BUG-024) ya fue tomada por el propietario** (Decisión D) — esta misión la documenta con su cadena de ratificación y NO toma ninguna decisión en su nombre.
4. **El dictamen está acotado al nivel alcanzable de verificación:** código + contrato + CI. La sonda HTTP contra el despliegue vivo no se ejecutó por limitación real documentada (URL de producción ausente en el expediente + prohibición de POST de prueba) — se registra como verificación residual opcional que requiere URL/autorización del propietario, no como evidencia insuficiente: los estados asignados a los 4 subcasos se sustentan en pruebas adecuadas ejecutadas.
5. **No corresponde** `DEFECTOS ACTIVOS CONFIRMADOS` (nada que hotfixear de CP-SEC-012), ni `PARCIAL: EVIDENCIA INSUFICIENTE` (los 4 subcasos fueron clasificables con evidencia reproducible), ni `DETENIDA: REQUIERE AUTORIZACIÓN` (ninguna verificación del alcance quedó bloqueada por autorización faltante; lo pendiente —A4, specs, sonda— son acciones posteriores, no verificaciones de esta misión).

**Pasos siguientes que corresponden al propietario (ninguno ejecutado):** autorizar A4 (índice); autorizar actualización de specs (skip BUG-024 obsoleto + realinear spec academy al admin-only + endurecer BUG-013 a `test.fail` real); facilitar URL de despliegue y autorizar sondas GET para la verificación de despliegue; decidir el commit de los archivos documentales de esta misión.

---

## Apéndice A — Comandos ejecutados y resultados reales

```text
# Estado del repositorio
git clone https://github.com/Nardian90/Costpro.git          # clon fresco (sandbox reiniciado)
git log -3 --format='%H | %ci | %s'
  → e6dfd885… | 2026-10-20 23:25:50 -0400 | Merge pull request #1439 …
  → 0eca8137… | 2026-10-21 01:59:23 +0000 | docs(misión-decisión)…
  → 2d77b73f… | 2026-10-20 21:46:18 -0400 | Merge pull request #1438 …
git status --porcelain=v1 -b                                # → limpio (solo cabecera de rama)

# CI en el SHA auditado (API GitHub, solo lectura)
GET /repos/Nardian90/Costpro/commits/e6dfd885…/check-runs
  → Unit & Integration Tests: success (03:25:55→03:31:31Z)
  → TypeCheck + Lint + Unit Tests + Build: success (03:25:55→03:33:26Z)
  → Security Audit: success (03:25:56→03:26:17Z)
  → E2E Tests (Playwright) ×2: skipped
GET /repos/Nardian90/Costpro/pulls/1431
  → state=closed, merged=True, merged_at=2026-10-19T19:01:52Z, merged_by=Nardian90
GET /repos/Nardian90/Costpro/pulls?state=open
  → 1 PR abierto: #1440 (fix(auditoría): nulidad compuesta…) — sin relación con CP-SEC-012

# Pruebas de contrato en entorno local aislado (hoy)
bun install --frozen-lockfile --ignore-scripts               # → 1318 paquetes, 7.49s
CI=true bunx vitest run src/__tests__/api/legal-incidents-audit.test.ts \
                      src/__tests__/integration/e2e-product-fix-round1.test.ts
  → Test Files 2 passed (2) · Tests 24 passed (24) · Duration 1.63s
  # (vitest v4.1.11; el contrato ejecuta el withRole real de auth-middleware.ts)

# Demo aislada de sanitización BUG-013 (replicación byte-exact route.ts:43-44)
node /home/z/my-project/scripts/b_bug013_sanitizacion_demo.mjs
  → 9/9 vectores neutralizados; '<script>alert(1)</script>.pdf' → 'script_';
    '../../etc/passwd.pdf' → 'passwd'; EXIT=0

# Inspección estática (grep/sed sobre el árbol, extractos citados con ruta:línea en §B/§C)
cat data/incidents.json     # → {"incidents": []} (deprecado, vacío, trackeado)
```

## Apéndice B — Trazabilidad de evidencia

- **Evidencia cruda de hoy** (copiada a `docs/audits/evidence/20261021-mision-b/` y espejo en `download/mision-b-20261021/evidencia/` del entorno del agente): `vitest_24tests_20261021.txt`, `sanitizacion_bug013_demo_20261021.txt`, `checkruns_main_e6dfd885_20261021.json`, `pr1431_estado_20261021.json`, `git_log_main_20261021.txt`, `git_status_20261021.txt`.
- **Documentos del repo citados:** `INVENTARIO_MAESTRO_TAREAS_COSTPRO_2026-10-16.md` (ficha CP-SEC-012, línea 920 ss.), `MISION_2_HOTFIXES_OPERATIVOS_SEGURIDAD_2026-10-17.md` (§3.5), `CP-SEC-027_v5_INFORME_DECISIONES_2026-10-21.md`, `PAQUETE_D_LEGAL_INCIDENTS.md`, `evidence/20261020-mision-c-cierre/INFORME.md`, `CP-SEC-027_MISION_DECISION_INFORME_2026-10-21.md:48` (conciliación Misión A).
- **Reglas de veracidad aplicadas:** ningún check ausente contado como éxito (E2E skipped queda registrado como no ejecutado); ninguna ausencia de prueba interpretada como evidencia de seguridad; el estado del despliegue vivo queda explícitamente marcado como inferencia, no verificación.
