# CP-OFFERS-PUERTOPADRE-002 — CERTIFICACIÓN INDEPENDIENTE DEL PR #1531

**Fecha:** 2026-10-31 · **Tipo:** Auditoría de aceptación, seguridad, integridad funcional y certificación técnica
**Objeto:** PR [#1531](https://github.com/Nardian90/Costpro/pull/1531) — `fix(ofertas): CP-OFFERS-PUERTOPADRE-001`
**Auditor:** Agente independiente (no el autor del PR) · **Método:** reproducción propia de TODAS las afirmaciones en CostproE2E

---

## 1. Resumen ejecutivo

| Aspecto | Resultado |
|---|---|
| Afirmaciones del PR #1531 sobre sí mismo | **TODAS verificadas PASS** de forma independiente (causa raíz, validación, persistencia, RLS clerk, aislamiento, 24+14 pruebas, fix de caja, regresión) |
| Hallazgo bloqueante | **H-1 (P1)**: PATCH permite cambiar `store_id` de una oferta (mueve el registro a otra tienda) — **preexistente en main, NO introducido por el PR, y el PR redujo su superficie** |
| Hallazgo de control | **H-2 (P2)**: el contador de residuos del guardrail era fail-open → el «net delta = 0» impreso por las corridas no medía las tiendas |
| Aislamiento de producción | **Demostrado** (17/17 escenarios del guard + proyecto independiente por Management API + centinela en vivo) |
| Escrituras en producción durante esta certificación | **CERO** |
| Decisión | **NO CERTIFICADO** (por H-1, conforme a las reglas de la misión) — con recomendación explícita de integrar #1531 junto con el PR de corrección que cierra H-1/H-2 (ver §13-14) |

El PR #1531 hace exactamente lo que declara y lo hace bien. La certificación no puede emitirse porque la auditoría exigía comprobar «cambio de `store_id` en el payload → no permite escalamiento» y ese control **falla** — no por el PR, sino por un defecto preexistente que el PR dejó intacto (y que, de hecho, acotó: antes un clerk podía explotarlo, ahora solo roles de escritura).

---

## 2. Commit exacto auditado

| Elemento | Valor verificado (GitHub API + git) |
|---|---|
| PR | #1531, estado `open`, `mergeable=true`, `mergeable_state=clean`, NO fusionado |
| Rama origen | `fix/ofertas-validacion-especifica-persistencia-20261031` |
| Base | `main` @ `422655eae` — **sin movimientos** durante la auditoría (HEAD de main = base del PR en todo momento) |
| Head auditado | **`f04919c3f8d33727d0c0877c61573fe31c2e0414`** |
| Commits | `282182551` (fix ofertas, 13:35:13Z) + `f04919c3f` (fix time-bomb caja, 13:44:48Z), ambos de «Z.ai Agent» |
| Diff | 14 archivos, +1381/−59 — corresponde EXACTAMENTE a los entregables declarados (informe, 2 specs de prueba, 2 scripts, 3 rutas API, 3 componentes, contrato, hook, test de caja) |
| Migraciones | **Ninguna** (diff de `supabase/migrations` vacío — RLS y esquema intactos) |
| Checks CI al head | TypeCheck+Lint+Unit+Build **SUCCESS** · Unit & Integration **SUCCESS** · Security Audit **SUCCESS** · TypeScript Security **SUCCESS** · Allowlist Review **SUCCESS** · Vercel Preview Comments **SUCCESS** · E2E Playwright **SKIPPED** (esperado: no autorizada en CI) |
| Contexto | Otro PR abierto (#1532, catálogo — módulo distinto, sin solapamiento); ningún cambio en main que invalide la revisión |

---

## 3. Matriz de afirmaciones y evidencias

| # | Afirmación del informe 001 | Evidencia exigida | Evidencia real (esta auditoría) | Resultado |
|---|---|---|---|---|
| 1 | Causa raíz identificada (`precio_unitario` nace en 0, se renderiza vacío; toast genérico + 9px + sin asterisco + sin foco; `details` backend descartados) | Código y reproducción | Código verificado (fábrica `precio_unitario: 0`; `value={x \|\| ''}` muestra 0 como VACÍO — línea intacta; D1-D6 del informe todos presentes en el diff pre/post). Reproducción propia: escenario del defecto E2E + casos 0/negativo/corrección (spec propio, 2/2) | **PASS** |
| 2 | Validación específica por campo | Código y pruebas | `validateOfertaForm` compartida; mensajes que nombran campo y producto; resumen `role=alert`; foco vía `data-field`; asteriscos; 11px; E2E del PR 14/14 (ejecución propia) + pruebas de borde propias (0 → error, −5 → error, corregir → crea conservando el resto) | **PASS** |
| 3 | Persistencia PostgreSQL | Consulta directa en E2E | POST 201 → consulta por id vía REST service-role: `store_id`/`created_by` correctos, `productos` íntegros, `subtotal/total` recalculados server-side (25000); recarga (E2E) re-muestra; PATCH recalcula (15000/14000); estados draft→sent persistidos; DELETE → `status='expired'` y fuera de la lista | **PASS** |
| 4 | Seguridad POST/PATCH (divergencia clerk corregida) | Rutas, RLS y pruebas | Política RLS real verificada en la migración `20260612000000` (INSERT/UPDATE = membresía admin/manager/encargado O perfil admin). Checks de ruta replican la política. Probado en vivo: clerk → 403 POST y PATCH (mensajes específicos); encargado CON membresía → 201/200 (no es un bloqueo ciego); tienda ajena → 403; oferta ajena → 404 (fetch RLS); payload manipulado → 400/403. **EXCEPCIÓN**: cambio de `store_id` en PATCH → ver H-1 (falla) | **PARTIAL** (clerk-fix PASS; vector store_id FAIL — preexistente) |
| 5 | Aislamiento E2E | Proyecto y guardrails | Proyecto independiente confirmado por Management API (`lguovmvrozxgssupkwpf` = CostproE2E ≠ `wthkddeleylijmonclxg` = CostproBD). Guard probado con 17 escenarios propios (ver §7) | **PASS** |
| 6 | 24 pruebas unitarias | Resultado reproducible | Ejecución propia: **24/24 PASS** (los casos de paridad son paramétricos — por eso un grep ingenuo cuenta 16) | **PASS** |
| 7 | 14 pruebas E2E | Resultado reproducible | Ejecución propia contra CostproE2E con identidad por corrida: **14/14 PASS** (2,6 min; 10 API + 4 UI) | **PASS** |
| 8 | 4834 pruebas de regresión | CI y ejecución | Ejecución independiente completa: **4835 pasan / 2 fallan / 66 saltan** (4903 total, 409 s) al head. Los 2 fallos son los preexistentes documentados (db-integration espera la tienda de producción `43a4dabc…` → fallan contra el proyecto aislado; independientes del código). El «4834» declarado corresponde al instante del commit 1 (antes del fix de caja); al head es 4835 — el PR MEJORA la cifra | **PASS** |
| 9 | Fix de cash-report-view | Reproducción y regresión | Time-bomb reproducido: versión pre-fix falla HOY (2026-10-31, fecha exacta predicha) en §2, en ambas zonas horarias; versión fix 41/41; invariante barrida en 11.680 instantes (2024-2027) sin violación; aserciones idénticas pre/post (ver §9) | **PASS** |
| 10 | Higiene E2E (91 residuos → guardrail PASS → net delta = 0) | Evidencia de residuos y net delta | Usuarios: real (91 perfiles históricos limpiados; hoy residuo de usuarios = 0 — verificado). **PERO** el «PASS net delta = 0» impreso por el global-teardown era **vacío para tiendas**: el contador usaba `is_archived=false` (sintaxis rechazada por el PostgREST vigente con HTTP 400) y el error se tragaba en un `catch` → devolvía siempre 0 → PASS falso (H-2). El estado real de tiendas al cierre de la misión 001 no es demostrable desde ese print | **PARTIAL/FAIL como evidencia** (usuarios sí, tiendas no medido) |

---

## 4. Causa raíz — CONFIRMADA

La cadena declarada se verificó íntegra, de extremo a extremo:

1. **Estado inicial**: `OfertaItemFactory.create()` → `precio_unitario: 0` (confirmado en `src/contracts/oferta.ts`; el propio PR añade un test documentando el default).
2. **Valor efectivo del input**: `value={item.precio_unitario || ''}` → `0` es falsy → el input se pinta VACÍO. El usuario no percibe que el valor real es 0.
3. **string/number**: `onChange: parseFloat(e.target.value) || 0` — vacío → 0 (número), nunca undefined/NaN.
4. **Zod front/back**: `ofertaItemSchema` exige `positive()` — el 0 rebota legítimamente en ambas capas (paridad probada por los 24 tests: 8 casos de invalidez del form rebota en `ofertaCreateSchema`).
5. **Form ↔ payload**: el submit manda `{...formData, subtotal, total…}` — el 0 viaja al backend.
6. **Respuesta del servidor**: 400 `{error: 'Datos inválidos', details}`.
7. **Propagación de details**: ANTES, `zodError()` devolvía un objeto `{ok, error, details:[...]}` que la ruta anidaba tal cual bajo `details` y `apiFetch` solo leía `body.error` → el motivo por campo se descartaba (D5 confirmado en el diff pre-fix).
8. **Render del error**: hoy el mensaje aparece junto al campo (`productos.0.precio_unitario`), en el resumen `role=alert`, con foco y scroll (verificado por E2E propio: `document.activeElement.data-field === 'productos.0.precio_unitario'`).

**Reproducción del escenario original (propia)**: formulario completo sin precio → toast «Revisa 1 campo: El precio unitario del producto 1 debe ser mayor que 0» + resumen accesible + foco en el campo + **cero POST** + datos conservados. Casos adicionales propios: precio=0 explícito → mismo error; precio=−5 → mismo error; corrección a 1800 → crea exitosamente conservando numero/objeto/cliente/descripción del primer intento.

**Asteriscos ↔ esquema**: «Cant. *» y «Precio Unit. *» corresponden a campos exigidos > 0 por `validateOfertaForm` y por Zod (`positive()`). «Número de Oferta *», «Objeto *», «Empresa *» (ambas) ↔ `min(1)`. Fecha * ↔ `min(1)`. Sin discrepancias interfaz↔esquema detectadas. El control numérico del browser impide texto no numérico en la UI; por API, string «abc» en precio → 400 Zod (probado).

---

## 5. Seguridad POST/PATCH

### 5.1 Arquitectura de las rutas (verificada en código y en vivo)

- **GET/SELECT**: cliente de usuario (RLS aplica) + membresía activa — coherente con la política SELECT.
- **POST**: `withStoreAccess` (sesión) + CSRF (`validateOrigin`) + rate-limit (30/min) + Zod + check de membresía con rol de escritura → insert con **service_role** (el check de ruta es el único guard efectivo).
- **PATCH**: sesión + CSRF + rate-limit + Zod + fetch inicial con cliente de usuario (RLS SELECT: oferta ajena → 404) + check de membresía de escritura sobre la tienda ORIGEN → update con **service_role**.
- **DELETE**: solo admin de perfil o membership manager; soft-delete `status='expired'`.
- `service_role` jamás llega al navegador (solo server-side; el diff no toca `NEXT_PUBLIC_*`).

### 5.2 Matriz de escenarios exigida (resultados en vivo, CostproE2E)

| Escenario | Resultado esperado | Resultado real | Veredicto |
|---|---|---|---|
| Usuario autorizado en su tienda (admin) | Permitido | 201/200/DELETE 200 | PASS |
| Usuario autorizado con rol legítimo (encargado con membresía) | Permitido | POST 201, PATCH 200 (la corrección NO bloquea a todos los clerk-equivalentes) | PASS |
| Usuario no autenticado | 401 | 401 | PASS |
| Usuario sin permiso (clerk con membresía) | 403 | 403 POST y PATCH, mensaje «Tu rol no permite…» | PASS |
| Usuario de otra tienda (sin membresía) | Denegado | POST 403; PATCH/GET de oferta ajena 404 (vía RLS del fetch) | PASS |
| Usuario de otra organización | Denegado | Cubierto por membresía de tienda (las ofertas no tienen `tenant_id`; el aislamiento entre organizaciones se materializa en las tiendas) | PASS |
| **Cambio de `store_id` en el payload (PATCH)** | **No permite escalamiento** | **200 — la oferta SE MOVIÓ a la tienda ajena** (verificado en BD) | **FAIL → H-1** |
| Cambio de `tenant_id` | Sin acceso cruzado | Campo inexistente en el esquema/tabla → stripped por Zod; sin efecto | PASS |
| ID de oferta ajena en PATCH | Denegado | 404 (RLS SELECT del fetch) + registro intacto | PASS |
| Payload manipulado (rol/memberships en body) | Validación del servidor | 403 (la sesión es la fuente de verdad, no el body) | PASS |
| Precio como string no numérico | Validación del servidor | 400 Zod | PASS |

### 5.3 Coherencia con RLS

- Las políticas RLS NO fueron modificadas por el PR (diff de migraciones vacío) — verificado.
- El check de POST replica fielmente la política INSERT (membresía admin/manager/encargado O `isAdminLevel`; nota: `isAdminLevel` admite `superadmin` de perfil, que la política RLS literal no lista — divergencia menor INTENCIONAL por convención del repo «nivel administrativo transversal», CP-ORG-001 ciclo 5, aplicada uniformemente en todas las rutas; no es una ampliación introducida por este PR).
- **El check de PATCH replica el USING (tienda origen) pero no el WITH CHECK implícito (tienda destino)** → H-1.

---

## 6. Integridad de persistencia (CostproE2E)

Ciclo completo ejecutado por esta auditoría (además del spec del PR):

1. Crear oferta → 201, id obtenido. 2. Consulta directa (REST service-role = PostgreSQL): `store_id` y `created_by` correctos. 3. Relaciones: tienda del run y usuario autenticado — coherentes. 4. Productos asociados: JSONB íntegro (3 × 2500.55). 5. Recarga de la aplicación: la oferta sigue en la lista (E2E con `page.reload`). 6. Re-consulta: idéntica. 7. Edición: PATCH parcial (solo `objeto`) conserva el resto; PATCH con productos recalcula (15000 − 1000 = 14000). 8. Cambio de estado draft→sent persistido. 9. Desactivar/eliminar: DELETE → `status='expired'` persistido y fuera de la lista (GET filtra `neq expired`).

**Sondeos de inconsistencia**:

| Caso | Resultado |
|---|---|
| Oferta sin productos | 400 Zod (`min(1)`) — nunca registro huérfano |
| Oferta asociada a otra tienda (movimiento) | **POSIBLE — H-1** (moved a PILOT_B verificado) |
| Duplicados por doble envío UI | 1 POST, 1 registro (candado `submittingRef` + E2E doble clic) |
| Duplicados por doble POST API crudo | 2 registros (sin idempotencia server-side; sin unicidad de `numero`) — limitación de diseño YA documentada por 001 §8.2; el UI la previene |
| Actualización parcial | OK — solo campos enviados |
| Valores numéricos | 3 × 2500.55 = 7501.65 persistido exacto (double precision) |
| Fechas | `fecha` es string libre; sin pares inicio/fin en el modelo (sin inconsistencias posibles) |
| Estados front↔back | Sincronizados (draft/sent/accepted/rejected/expired con CHECK en columna) |

No se aceptó ninguna evidencia basada en estado de React/Zustand/LocalStorage: toda la verificación fue por consulta directa a la base.

---

## 7. Aislamiento CostproE2E — CERTIFICADO

**Identidad del proyecto** (Management API, lectura): `lguovmvrozxgssupkwpf` = CostproE2E (us-east-1, creado 2026-10-22) y `wthkddeleylijmonclxg` = CostproBD (producción, 2026-01-03) — **dos proyectos independientes**, no branch, no alias.

**Guard fail-closed probado COMPORTAMENTALMENTE** (spec propio, 17/17 PASS — no solo inspección de código):

| Grupo | Escenarios | Resultado |
|---|---|---|
| A. Config correcta | URL+key+kind+ref exactos → permite | PASS + centinela `e2e_is_isolated_db()` = `true` en vivo |
| B. Apuntando a producción | URL directa; vía `NEXT_PUBLIC_`; ref de producción como `E2E_ALLOWED_REMOTE_REF` (config adversaria); ref embebido como subcadena del host | 4/4 RECHAZADOS (`E_PRODUCCION` / `E_REF_IGUAL_A_PRODUCCION`) — **sin conectar** |
| C. Variables ausentes | Sin URL ni key; URL sin key; solo vars de app apuntando a producción (¿fallback?) | 3/3 rechazados — **NO existe fallback a producción** |
| D. Ambigua/incorrecta | URL remota desconocida; sin `E2E_TARGET_KIND`; kind inválido; sin ref permitida; URL malformada; ref permitida de otro proyecto; mezcla E2E-válida+NEXT_PUBLIC-prod; mezcla invertida | 8/8 fallan de forma segura (`E_REF_NO_COINCIDE`, `E_TARGET_KIND_*`, `E_REF_PERMITIDA_FALTA`, `E_URL_MALFORMADA`) |

**Higiene de datos — análisis del claim «91 residuos → guardrail PASS → net delta = 0»**:

- Qué es residuo: tiendas que matchean patrones E2E (`E2E80*`, `E2E *`, `E2E-*`, …) no archivadas y no protegidas; usuarios con email `e2e-*` y `deleted_at is null`.
- Identificación de datos de prueba: patrones de nombre/email + fixtures por corrida (run-id único, tenant propio, usuarios propios).
- Limpieza: teardown del run por **id exacto** desde context file por PID; nunca TRUNCATE/DELETE global; los protegidos del config quedan fuera. La limpieza NO puede alcanzar registros ajenos: barre solo el tenant del run y los ids de su context (evidencia empírica: durante esta auditoría coexistió el residuo de otro spec y ninguna de las 3 corridas propias lo tocó).
- **Usuarios**: el claim es REAL — residuo actual 0 (verificado por dos contadores independientes).
- **Tiendas**: el contador del global-teardown (`countE2EResiduals`, `hard-cleanup.ts:405`) usaba `is_archived=false`; el PostgREST vigente responde **HTTP 400** («failed to parse filter (false)») y el `catch` de best-effort dejaba el contador en 0 → **«Guardrail PASS — net delta = 0» se imprimía sin haber medido las tiendas** (H-2, fail-open). El estado real de tiendas al cierre de la misión 001 es indemostrable desde ese print.
- Estado actual del entorno (lectura directa): 1 tienda residuo NO archivada («E2E OTHER-STORE MCmvwfx2eb», creada 2026-10-31T13:31:58Z) procedente de `e2e/flows/master-catalog-full.spec.ts` (spec de CATÁLOGO, no de ofertas — atribución temporal compatible con la misión de catálogo concurrente, PR #1532 abierto 14:00Z) + 24 tumbas archivadas de pilotos (fallback de archivado del teardown). **Ninguna producida por `ofertas.spec.ts`**: las 3 corridas propias del spec de ofertas dejaron net cero (pilotos hard-deleted, ofertas borradas por id).

**Producción durante esta certificación**: cero escrituras, cero lecturas de datos por las APIs del proyecto de producción; la única interacción con infraestructura de producción fue el listado de proyectos por Management API (nombres/refs, sin datos de negocio). El guard rechazó el ref de producción en 5 escenarios sin conectar. Todas las operaciones de prueba usaron exclusivamente credenciales y URL de CostproE2E.

---

## 8. Auditoría del fix de cash-report-view (time-bomb)

1. **Qué fallaba**: el test §2 («intervalo inválido») hardcodeaba `Desde='2026-10-31'` con el comentario «hoy es 2026-10-12», mientras `Hasta` por defecto del componente es HOY dinámico (`new Date().toISOString().slice(0,10)`, `CashReportView.tsx:120`).
2. **Por qué el 31 de octubre**: primera fecha real en la que HOY ≥ 2026-10-31 → `Desde ≤ Hasta` → la alerta de intervalo inválido nunca se renderiza → el test falla. El último CI verde de main corrió el 30-10 (por eso no se había visto).
3. **Dependencia de fecha/reloj**: sí — reloj del sistema, en UTC por ambas partes (componente y test usan `toISOString`), por lo que la zona horaria no afecta la comparación.
4. **El fix**: NO usa reloj controlado ni fecha fija — usa **tiempo relativo** (`Desde = ahora + 24 h`), que mantiene el invariante `Desde > Hasta` para CUALQUIER fecha de ejecución y conserva el comportamiento real del componente (sin mocks de reloj).
5. **¿Conserva la lógica?** Sí: las tres aserciones son idénticas pre/post (botón deshabilitado, alerta contiene «inválido», y cero llamadas a `/api/cash-report`). **Ninguna aserción fue eliminada ni relajada** (diff verificado línea a línea).
6. **¿Puede ocultar un defecto?** No para este test: sigue ejercitando el componente real con reloj real; si el default de `endDate` cambiara, el test fallaría (no está acoplado a una fecha).
7. **America/Havana**: verificado empíricamente en ambas direcciones — pre-fix falla igual con `TZ=America/Havana`; post-fix pasa 41/41 en Havana.
8. **Evidencia de reproducción**: la propia fecha de esta auditoría ES la fecha-bomba (2026-10-31): pre-fix → 1 fallo exactamente en §2 (ambas zonas horarias); post-fix → 41/41. Barrido de invariante: 11.680 instantes (2024-2027, cada 3 h) → 0 violaciones de `Desde > Hasta`.

---

## 9. Resultados de regresión (ejecución INDEPENDIENTE, distinta de los checks del PR)

| Prueba | Resultado propio | Detalle |
|---|---|---|
| 24 unitarias nuevas | **24/24 PASS** | `oferta-contract.test.ts` |
| 14 E2E nuevas | **14/14 PASS** | ejecución propia, 2,6 min, CostproE2E, identidad por corrida |
| 12 E2E adversariales propias | **12/12 PASS** | matriz de autorización + integridad (§5-6) |
| Suite completa (vitest) | **4835 pasan / 2 fallan / 66 saltan** (4903 total, 409 s) | commit `f04919c3f`; 2 fallos preexistentes documentados (db-integration espera tienda de producción → fallan contra el aislado; independientes del código del PR). La cifra declarada «4834» correspondía al commit 1; al head es 4835 (el fix de caja suma un pase). **Omitidas**: 66 (86 en el PR por conteo propio de la misión 001; mismas suites condicionales). **Reintentos**: 0 |
| TypeScript | 0 errores | full `tsc` OOM en sandbox de 4 GB (limitación conocida y documentada por la misión 001; CI lo corre completo: **SUCCESS** al head) + `tsc` acotado al grafo de dependencias de TODOS los archivos del PR: exit 0 |
| ESLint | **0 errores**, 1418 warnings | todos preexistentes (la misión 001 declaró 1419; el PR dejó una menos) |
| Build de producción | CI **SUCCESS** (Vercel Preview + TypeCheck+Lint+Unit+Build) | build local no ejecutable por OOM del sandbox (4 GB) — validado por CI |
| Entorno utilizado | CostproE2E (`lguovmvrozxgssupkwpf`), servidor local Next dev `:3000`, Chromium headless (Playwright 1234), bun 1.3.14 | commit probado: `f04919c3f` |

**Distinción checks-verde-del-PR vs ejecución independiente**: los 8 checks del PR se verificaron por API al head; ADEMÁS se re-ejecutaron de forma independiente las unitarias, la suite completa, el ESLint, el tsc acotado y las 14 E2E con identidad propia. No se declaran cero regresiones a ciegas: las 2 pruebas falladas y las 66 omitidas están identificadas y son preexistentes/ambientales.

---

## 10. Hallazgos clasificados

### H-1 (P1) — PATCH permite mover una oferta a otra tienda (bypass del WITH CHECK de RLS)

- **Severidad**: P1 (autorización incorrecta en una ruta de escritura con efecto multi-tienda). No es P0 porque: no otorga lectura cruzada de datos, el actor ya es un rol de escritura de la tienda origen, y las ofertas no tocan contabilidad/POS.
- **Ubicación**: `src/app/api/ofertas/[ofertaId]/route.ts` — `const { id, ...updateFields } = validated.data` deja pasar el `store_id` del payload; la autorización valida solo `existing.store_id`; la escritura usa service_role (bypass RLS).
- **Evidencia reproducible** (CostproE2E): (1) encargado de PILOT_A crea oferta; (2) `PATCH {store_id: PILOT_B}` → **200** y la oferta queda con `store_id=PILOT_B` (verificado en BD); (3) la MISMA operación por PostgREST con el token del usuario (RLS aplica) → **403 `42501` «new row violates row-level security policy»** — divergencia ruta↔RLS demostrada A/B.
- **Impacto**: inyección de documentos comerciales en la lista de otra tienda (visibles a sus miembros por RLS SELECT); sustracción de la oferta de la tienda origen (elusión de la política DELETE para encargados, que no pueden eliminar); corrupción de la integridad multi-tienda del módulo.
- **Origen**: **PREEXISTENTE en main** (verificado en `422655eae`, línea 110) — NO introducido por el PR #1531. El PR **redujo** su superficie (antes cualquier miembro —incluido clerk— podía explotarlo; ahora solo admin/manager/encargado).
- **Corrección recomendada**: rechazar el cambio de `store_id` en PATCH (400) — implementada y verificada en el PR de corrección adjunto (E2E: 400 + no se mueve + edición con mismo store_id sigue OK).
- **¿Bloquea la integración?**: bloquea la CERTIFICACIÓN del módulo (regla C de la misión). No invalida ninguna afirmación del PR sobre sí mismo; ver recomendación §14.

### H-2 (P2) — Contador de residuos del guardrail fail-open (PASS falso en tiendas)

- **Ubicación**: `e2e/fixtures/hard-cleanup.ts:405` (`countE2EResiduals`).
- **Evidencia**: `is_archived=false` (booleano desnudo) → PostgREST vigente responde HTTP 400 «failed to parse filter (false)» → el `catch` best-effort deja `stores=0` → el global-teardown imprime «Guardrail PASS — net delta = 0» **sin haber medido** (reproducido: el contador devolvía 0 con una tienda residuo presente; el mismo recuento con sintaxis `eq.false` devuelve 1).
- **Impacto**: el claim de higiene «net delta = 0» de la misión 001 no constituía evidencia válida para tiendas (para usuarios sí: ese filtro es válido). Un guardrail de CI que no puede fallar no protege.
- **Origen**: preexistente (herramienta).
- **Corrección**: `is_archived=eq.false` — implementada y verificada en el PR adjunto (el contador vuelve a ver la realidad y el teardown detecta contaminación).
- **¿Bloquea?**: no la integración del PR; sí la aceptación del claim 10 de la matriz como evidencia.

### H-3 (P3) — El chequeo de protegidos del guard BEFORE no puede pasar contra CostproE2E

`protected-resources.json` es histórico de la era compartida (`allowedProjectRefs` = producción); las 5 tiendas protegidas no existen en el proyecto aislado → el modo BEFORE siempre aborta y el workflow oficial lo salta con `E2E_SKIP_PROTECTED_GUARD=1` (escape documentado, CP_E2E_READINESS_001 §3.7.2). Deuda de configuración conocida; no debilita el aislamiento real (el guard de identidad sigue activo).

### H-4 (P3) — Tumbas de pilotos archivados se acumulan

El teardown de cada corrida deja pilotos ARCHIVADOS cuando el hard-delete falla (24+ desde el 2026-10-22). El guard lo tolera por diseño (solo cuenta no-archivadas). Deuda de higiene menor del entorno, no del PR.

### H-5 (P3) — Residuo activo ajeno en CostproE2E (spec de catálogo)

«E2E OTHER-STORE MCmvwfx2eb» (no archivada, 2026-10-31T13:31:58Z) de `e2e/flows/master-catalog-full.spec.ts` — módulo de catálogo (PR #1532), NO de ofertas. Deja el gate AFTER en FAIL hasta que su dueño la limpie. No atribuible a `ofertas.spec.ts` (sus corridas dejan net cero).

### H-6 (P3) — Limitaciones de diseño del modelo (ya declaradas por 001, confirmadas)

`numero` sin unicidad por tienda (duplicados posibles); sin idempotencia server-side en POST (doble POST crudo = 2 registros; el candado es solo UI); ítems de texto libre sin FK al catálogo. Todas pre-declaradas; requieren decisión de producto, no corrección técnica urgente.

---

## 11. Evidencias reproducibles (artefactos de esta auditoría)

| Evidencia | Cómo reproducirla |
|---|---|
| Guard 17/17 (prod rechazada sin conectar; sin fallback; ambigüedad fail-closed; centinela true) | `scripts/cert002-isolation-proof.mjs` (copiado a `scripts/cert002-evidence/` del proyecto de agente) |
| 14/14 E2E del PR | `E2E_ISOLATION=1 E2E_SKIP_PROTECTED_GUARD=1 bunx playwright test --project=core ofertas.spec.ts` (con `.env` apuntando a CostproE2E y servidor local) |
| Matriz adversarial (12/12) + contraste RLS 42501 vs API 200 | specs `cert002-ofertas-audit.spec.ts` y `cert002-rls-contrast.spec.ts` (conservados en el expediente del agente; no se commitearon al repo) |
| Casos de borde UI (0/negativo/corrección, asteriscos) | `cert002-ui-edges.spec.ts` (ídem) |
| Time-bomb: pre-fix falla HOY, post-fix 41/41, ambas TZ | `git show 422655eae:src/__tests__/components/cash-report-view.test.tsx` sobre el archivo y `bunx vitest run` (2026-10-31) |
| Contador fail-open: query 400 vs `eq.false` 200 | `scripts/cert002-guardrail-diag.mjs` + `cert002-residuals-direct.mjs` |
| Suite completa 4835/2/66 | `bunx vitest run --reporter=dot` al head `f04919c3f` |
| Fix H-1/H-2 verificado | PR de corrección adjunto (spec `e2e/ofertas-storeid-guard.spec.ts`: 400 + no se mueve + edición normal OK; teardown con contador reparado detecta el residuo ajeno real) |

---

## 12. Verificación de las reglas de seguridad de la misión (cumplimiento propio)

1. Cero escrituras de prueba en producción (guard + credenciales exclusivamente E2E). 2. Cero migraciones. 3. Cero modificaciones a registros reales de Puertopadre (nunca se conectó a su tienda; los tests usaron pilotos del run). 4. Todas las escrituras de prueba en CostproE2E. 5. Independencia de CostproE2e re-verificada (Management API). 6. Sin secretos en este informe (solo refs de proyecto, que no son secretos). 7. Ningún RLS/guardrail/CI debilitado para lograr verdes (el único flag usado, `E2E_SKIP_PROTECTED_GUARD=1`, es el procedimiento oficial documentado del workflow aislado; el guard de aislamiento permaneció activo). 8. El PR auditado NO fue modificado (la corrección de H-1/H-2 vive en rama/PR separados). 9. Cada defecto separado en hallazgo con evidencia, severidad y recomendación. 10. Historial y resultados conservados (este expediente + artefactos del agente).

---

## 13. Decisión final

# C. NO CERTIFICADO

Conforme a las reglas de la misión («C. NO CERTIFICADO — si existe cualquier P0/P1»):

- Existe **H-1 (P1)**: una ruta de escritura del módulo Ofertas autoriza contra la tienda origen y no contra la tienda resultante, eludiendo el `WITH CHECK` de la política RLS UPDATE — el escenario «cambio de `store_id` en el payload → no permite escalamiento» de la Fase C **FALLA**.
- El claim de higiene «guardrail PASS → net delta = 0» resultó **evidencia inválida para tiendas** (H-2) — un control de la matriz no es demostrable tal como fue declarado.

**Lo que NO motiva el NO**: ninguna afirmación del PR #1531 sobre sí mismo resultó falsa. Causa raíz, corrección, persistencia, alineación clerk↔RLS, aislamiento, 24+14 pruebas, fix del time-bomb y regresión — todo se reprodujo de forma independiente y PASS. El P1 es preexistente en main, no introducido por el PR, y el PR redujo su explotabilidad (de cualquier miembro a solo roles de escritura).

---

## 14. Recomendación explícita sobre la integración del PR #1531

**Recomendación: INTEGRAR el PR #1531, junto con (o inmediatamente seguido de) el PR de corrección adjunto que cierra H-1 y H-2.**

Fundamentos:

1. El PR #1531 corrige de forma verificada los defectos que declaró, mejora la seguridad respecto de main (clerk ya no puede crear/editar ofertas) y no introduce ninguna regresión (4835 pasan; los fallos son preexistentes ambientales).
2. Mantenerlo sin fusionar NO reduce el riesgo H-1 — H-1 vive en main hoy y el PR lo estrecha.
3. El PR de corrección adjunto (rama `fix/ofertas-patch-storeid-guard-20261031`, base main, independiente de #1531) cierra H-1 (rechazo 400 del cambio de tienda en PATCH, verificado E2E: la oferta no se mueve y la edición normal sigue operativa) y H-2 (contador fail-closed, verificado: el guardrail vuelve a detectar contaminación real). Puede fusionarse antes o después de #1531 (los cambios no se solapan: el guard de H-1 se inserta tras la desestructuración de `updateFields`; los hunks de #1531 están en el bloque de autorización y en la línea de `details`).
4. Con ambos fusionados, las objeciones de esta certificación quedan levantadas: los dos únicos hallazgos que la bloquean están cerrados y verificados (la re-verificación mecánica ya está ejecutada en esta misión: spec E2E del guard 1/1 y detección del contador en vivo).

**Orden sugerido**: merge de #1531 → merge del PR de corrección → (opcional) limpieza del residuo de catálogo H-5 por su dueño → re-ejecución del guard de higiene AFTER (debe dar PASS con residuo 0/0).

La decisión final de integración corresponde al propietario. Esta certificación no ejecutó ningún merge.
