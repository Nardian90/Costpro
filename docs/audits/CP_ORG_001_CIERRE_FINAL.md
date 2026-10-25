# CP-ORG-001 — CIERRE DEFINITIVO DE ORGANIZACIONES, TENANT Y SUPERADMIN

> Expediente final único y reproducible. Misiones previas relacionadas: ORG
> (PR #1481, fusionado) y su limpieza productiva autorizada (2026-10-26).
> Este documento CIERRA la auditoría integral CP-ORG-001 sobre el estado real.

---

## 1. Fecha y hora UTC

- **Ciclo 1 (auditoría + correcciones):** 2026-10-25 01:14 – 02:20 UTC (PAT
  inválido → push bloqueado, trabajo preservado en patch)
- **Ciclo 2 (publicación + cierre):** 2026-10-25 09:45 – 10:14+ UTC (PAT nuevo
  válido; rama publicada, PR #1482, CI del SHA de código completo y verde,
  producción re-verificada read-only)

## 2. Repositorio, rama, SHA base y SHA final

| Elemento | Valor verificado en el momento de la comprobación |
|---|---|
| Repositorio | `Nardian90/Costpro` (público; verificado con ls-remote y API autenticada) |
| Rama de trabajo | `fix/cp-org-001-guards-superadmin-20261025` (publicada en el ciclo 2) |
| `origin/main` al inicio | `e9225927444bca43b1454deffded28a6c803e194` (= fusión del PR #1481) |
| SHA base de la rama | `e9225927444bca43b1454deffded28a6c803e194` |
| SHA del código auditado | `e5ecf72d7c6ae8e25943f1902b45f456edba7bfe` (10 commits; CI completo verde, §10) |
| SHA final de la rama | El presente expediente es el único commit posterior a `e5ecf72d7` (cambio solo-docs); su CI se registra en el PR #1482 |
| Árbol de trabajo | Limpio al final (todos los cambios con commit) |

Nota de entorno: el sándbox se reinició entre ciclos (repositorio local perdido);
el trabajo fue preservado en `cp-org-001.patch` (10 commits, `git am` limpio
sobre el mismo `origin/main` intacto) y re-verificado íntegro antes de
publicar (tsc 0, lint 0, suite 4000/0, gates). El PAT del ciclo 1 devolvió
401; **el PAT nuevo facilitado por el propietario fue válido (200)** y
permitió push + PR. Servidor pm2 `costpro` reactivado (puerto 3000, HTTP 200,
health ok, `pm2 save`).

## 3. PR y estado de fusión

- **PR #1481** (`feat/mision-organizaciones-superadmin-limpieza-20261025`):
  **MERGED** el 2026-10-25 por el propietario `Nardian90`. Head `897c4bb7c`
  (4 commits). Checks en el head en el momento de la fusión: 11 verdes
  (TypeCheck, Lint, Unit, Build, Unit&Integration y 4 de seguridad). Sin
  revisiones formales pendientes ni conversaciones sin resolver.
- La entrega de este ciclo es el **PR #1482**
  (`fix/cp-org-001-guards-superadmin-20261025` → `main`), abierto el
  2026-10-25 10:00 UTC aprox., **open y SIN fusionar** (decisión de merge: el
  propietario). CI del head de código `e5ecf72d7`: 8/8 checks ejecutados en
  success + E2E skipped por política del repo (§10).

## 4. Alcance exacto de los cambios (10 commits, +1855/−140, 23 archivos)

1. **Migración `20261026120000` (editada, PRE-despliegue — nunca aplicada a
   producción, verificado):** `assign_user_organization` vincula el actor a
   `auth.uid()` con el patrón anti-spoofing H-7 (antes: `p_actor_id` arbitrario
   de cualquier `authenticated` → escalamiento por PostgREST directo); el
   `UPDATE` del perfil aplica `tenant_id` SIEMPRE (antes: si la tienda activa
   pertenecía al destino o era legacy, el cambio de empresa se omitía
   silenciosamente con `applied=true`); `performed_by` de la auditoría registra
   el actor real; ACL a patrón certificado (solo `service_role`).
2. **Migración NUEVA `20261026130000_cp_org001_platform_role_guards.sql`
   (idempotente, CREATE OR REPLACE, sin cambios de datos):** guardas de rol de
   plataforma en `managed_update_user` (otorgar/retirar `superadmin` solo por
   otro SuperAdmin; nadie cambia su propio rol; la cuenta SuperAdmin solo la
   gestiona otro SuperAdmin en CUALQUIER campo), `managed_toggle_user_status`,
   `managed_soft_delete_user` y `managed_reset_password` (cuenta de plataforma
   solo por SuperAdmin). ACL certificada en las 4 (solo `service_role`).
3. **PATCH/GET `/api/users/[id]`:** `'superadmin'` eliminado del enum Zod de
   entrada (el rol de plataforma jamás viaja en un payload de edición);
   `ERR_PLATFORM_ROLE` / `ERR_PLATFORM_ACCOUNT_PROTECTED` /
   `ERR_SELF_ROLE_CHANGE` mapeados a 403 claros; el resto de errores internos
   ya no viajan crudos al cliente; **GET trata al SuperAdmin como admin con
   alcance global** (defecto introducido por el rol nuevo: caía al camino de
   membership y no podía editar usuarios de otras empresas).
4. **GET `/api/users`:** `sanitizeSearchTerm()` (sin inyección de sintaxis en
   la expresión `.or()` de PostgREST; valor entrecomillado con el escape
   documentado), filtro `role=tenant_admin` admitido, error de BD saneado.
5. **Vista Usuarios (hook/vista):** `useUsersAdmin` con filtros
   **server-side** + paginación real (fin de los falsos negativos tras los
   primeros 100 registros) y **errores propagados** (fin del «vacío fingido»);
   banner de error reintentable `role=alert`, esqueleto de carga, aviso
   honesto de listado parcial, debounce de búsqueda; edición de cuentas de
   plataforma sin `role` en el payload + rol real BLOQUEADO en el formulario
   (fin del downgrade silencioso «Administrador» para una cuenta SuperAdmin);
   acciones sobre cuentas de plataforma deshabilitadas con razón visible;
   a11y (aria-label en Switch/Select); «Días Activos» muestra «—» sin fecha.
6. **GET `/api/organizations`:** filtro `has_stores` resuelto en servidor
   ANTES de paginar (contador coherente), resumen del **alcance completo**
   (no de la página), «Tiendas» cuenta solo activas (etiqueta «Tiendas
   activas» ahora exacta); POST/PATCH con duplicados **LITERALES** (fin de
   falsos 409 por comodines `%`/`_`); ternario muerto eliminado.
7. **Modales:** asignación de empresa cierra tras aplicar y captura rechazos
   de la RPC (toast ya existente); detalle de organización con botón
   Reintentar; `maxLength` alineado con la validación (200).
8. **viewRegistry:** `actions` de `organizations` reflejan las capacidades
   reales de la vista.
9. **`ci-gate-allowlist.json`:** 4 entradas `source_of_truth_baseline`
   (`BODY_DRIFT_FROM_MIGRATION`, con razón, autor y **expiración
   2026-11-30**) documentando el drift esperado de cuerpos de las 4 RPC
   hasta que el propietario despliegue `20261026130000` y re-exporte el
   surface certificado. Mecanismo documentado del propio gate; se retiran
   tras el despliegue (patrón de las misiones previas).
10. **Expediente (docs):** el commit 10 del ciclo 1 añadió este documento;
    el ciclo 2 lo actualiza con la publicación y evidencia final (el presente
    texto) — único cambio posterior al SHA de código `e5ecf72d7`.

## 5. Modelo de organización, usuario, tienda y SuperAdmin (estado verificado)

- Usuario ordinario ∈ exactamente UNA organización (`profiles.tenant_id`),
  que puede tener varias tiendas; membresías de tiendas de otra organización
  rechazadas por trigger a nivel DB (`trg_membership_tenant_consistency`,
  probado EN VIVO en aislamiento con el error 23514 real).
- SuperAdmin (`profiles.role='superadmin'`): rol de PLATAFORMA; fuente
  canónica `is_superadmin()` en DB (nunca cadenas del cliente); hereda toda
  la capacidad administrativa (`is_admin()`/`is_global_admin()`/jerarquía
  app) y accede a todo lo transversal; NO necesita tienda (la migración le
  retira membresías y tienda activa).
- `tenant_admin`: rol de NEGOCIO del tenant (auto-provisionado por landing),
  con privilegios DISTINTOS y documentados (sin acceso transversal; jerarquía
  operativa equivalente a encargado). No es sinónimo de superadmin.
- En la APP: `withRole('superadmin')` solo pasa con el rol real;
  `hasRole` consulta la jerarquía real (un admin NO satisface chequeos de
  superadmin); `toFormRole` ya no degrada el rol visible; el enum Zod de
  edición no acepta roles de plataforma del cliente.

## 6. Resultados de seguridad/RLS y pruebas negativas (E2E aislado, 17/17 PASS)

Ejecutadas contra el proyecto E2E aislado (`CostproE2E`, sentinel
`e2e_is_isolated_db()=true`), simulando contextos JWT reales de PostgREST
(`SET LOCAL request.jwt.claims`). PRODUCCIÓN NO SE TOCÓ (solo lectura):

| # | Prueba negativa | Resultado |
|---|---|---|
| ACL | `authenticated` directo a `managed_update_user` / `assign_user_organization` | ✗ permission denied 42501 (ACL certificada) |
| N1 | service_role con sesión de clerk suplantando actor | ✗ «El actor no tiene permisos administrativos» (anti-spoofing H-7) |
| N2 | admin cambia SU PROPIO rol | ✗ ERR_SELF_ROLE_CHANGE |
| N3 | admin concede `superadmin` a otro | ✗ ERR_PLATFORM_ROLE |
| N4 | admin edita la cuenta SuperAdmin | ✗ ERR_PLATFORM_ACCOUNT_PROTECTED |
| N5 | admin desactiva al SuperAdmin | ✗ ERR_PLATFORM_ACCOUNT_PROTECTED |
| N6 | admin da de baja al SuperAdmin | ✗ ERR_PLATFORM_ACCOUNT_PROTECTED |
| N7 | admin resetea contraseña del SuperAdmin | ✗ ERR_PLATFORM_ACCOUNT_PROTECTED |
| N8 | ruta API (admin) edita usuario ordinario | ✓ permitido |
| N9 | sesión superadmin gestiona roles ordinarios | ✓ permitido |
| P1 | membresía cruzando organizaciones | ✗ rechazada por trigger (23514) |
| S7 | cambio de empresa con commit real | ✓ tenant efectivamente movido y auditado |

Hallazgo del propio gate estático que este ciclo corrigió: la primera versión
de `20261026130000` re-granteaba EXECUTE a `authenticated`, revirtiendo la ACL
certificada por `20260916000002` (REM-INV-6). Detectado por
`security-contract-test-static.cjs` (Capa C) y corregido antes del push.

## 7. Verificación de la limpieza histórica de producción (READ-ONLY, sin escrituras)

Consultas SELECT-only contra producción (`wthkddeleylijmonclxg`) con guard
SELECT/WITH/EXPLAIN. Cero escrituras productivas en este ciclo.

| Verificación | Resultado | Esperado | Veredicto |
|---|---|---|---|
| Tiendas existentes | **2**: ENERVIDA-VITALLCONS (`5e6fe821`), Puerto Padre VITALLCONS (`43a4dabc`), ambas activas en Default Tenant | 2 protegidas | ✅ |
| Tenants existentes | **2**: Default Tenant (`5364ccf8`, enterprise, owner=admin@demo.com), WAC Test (`2de3d368`, free) | 2 conservados | ✅ |
| Cuentas dadas de baja | **11 soft-deleted** (emails anonimizados `deleted+*@anonymized.local`, `full_name='[deleted user]'`, inactivas, `deleted_by` + razón «Limpieza autorizada 2026-10-26»), **11 baneadas en auth** (`banned_until > now()`), sesiones/refresh purgados | 11/11 | ✅ |
| Tenants de prueba eliminados | Test Tenant B, Tenant Test RLS, E2E TENANT, Grupo Demo CostPro: **ausentes** | 4 eliminados | ✅ |
| Membresías huérfanas | 0 | 0 | ✅ |
| Membresías cruzando tenants | 0 | 0 | ✅ |
| Perfiles con tienda activa inexistente | 0 | 0 | ✅ |
| Transacciones/productos/inventario huérfanos de tiendas | 0 / 0 / 0 | 0 | ✅ |
| Storage | 305 objetos (product-images 151, reports 122, stores 31, salva 1) | 305 intactos | ✅ |
| Auditoría de la limpieza | `USER_SOFT_DELETED` × 11 (2026-10-24 22:43–22:44 UTC) | 11 | ✅ |

**Prueba de conservación (protegidas):** ENERVIDA 185 productos / 682
transacciones / 152 inventario / 4 membresías activas; Puerto Padre 36 / 212 /
35 / 2. **Suma idéntica al baseline pre-borrado** de la misión anterior
(221 productos / 894 transacciones / 6 membresías). La comparación se apoya
en recuentos + identidad canónica de los IDs; no existe un hash/manifest por
fila en el respaldo previo que permita una comparación más fuerte — limitación
documentada.

**DISCREPANCIA REAL ENCONTRADA (no reparada, por mandato §4):** existen
**33 filas en `payment_transactions`** (6 `store_id` de tiendas eliminadas,
todas del 2026-10-23 06:31–15:56 UTC, es decir, **contaminación previa a la
limpieza**) cuyo `transaction_id` tampoco existe (FK `transaction_id` RESTRICT
intacto; **no existe FK de `store_id`** en esa tabla, por lo que el borrado de
tiendas no las bloqueó). El informe de la fase previa afirmaba «0 dangling de
payment_transactions» refiriéndose a los 69 NULL legítimos preexistentes;
estas 33 filas con referencia a tienda inexistente quedaron fuera de ese
conteo. **Riesgo: bajo** (filas inertes: sin tienda ni transacción padre, no
son visibles por ninguna vista que una por transacciones existentes; solo
afectarían recuentos si alguna consulta barriera `payment_transactions` sin
JOIN). **Acción que corresponde al propietario** (requiere decisión, no
ejecutada): borrado/quarantena puntual de esas 33 filas + migración que añada
el FK `store_id` faltante. Este ciclo NO escribió.

**Re-verificación del ciclo 2 (2026-10-25 10:05 UTC, READ-ONLY, 14 consultas
GET, 0 escrituras):** estado idéntico — 2 tiendas (protegidas, activas,
tenant `5364ccf8`), baseline exacto 185+36=221 productos / 682+212=894
transacciones / 4+2=6 membresías, 11 perfiles anonimizados (inactivos,
`deleted_at` 2026-10-24, tenant NULL), 11 registros `USER_SOFT_DELETED`, 0
huérfanos de membresía/tienda activa, 4 tenants de prueba ausentes, y **los 11
bans verificados individualmente** (GET auth admin por usuario: `banned_until`
2126-09-30, 0 sesiones). El tenant `5364ccf8` figura ahora con nombre
«Vitallcons» (antes «Default Tenant»): renombrado por el propietario entre
ciclos (misma identidad canónica; sin impacto). Los 33 `payment_transactions`
residuales PERSISTEN (documentados arriba; sin cambios). Endpoint admin list
de auth sigue en 500 (preexistente); la verificación individual por ID funciona
y se usó como vía.

**Seguridad del respaldo:** localizable en
`/home/z/my-project/backups/org-cleanup-20261026/` (1443 filas / 25 tablas +
11 identidades auth sin hashes) y verificación de restauración en el proyecto
E2E (schema `restore_check_20261026`, 1443/1443) documentada por la misión
anterior — re-verificable por el propietario. Nada se copió a repos públicos.

## 8. Estado de las tiendas protegidas y limitaciones de la comparación histórica

Ver §7: ambas identificadas por identidad canónica, activas, con datos
intactos según la comparación de recuentos disponible. Limitaciones: (a) la
comparación se basa en recuentos + IDs canónicos (sin manifest por fila);
(b) no se puede comprobar si los REGISTROS individuales cambiaron de
contenido — el respaldo previo no incluía hashes por fila; (c) 33 filas de
`payment_transactions` residuales (§7) NO afectan a las protegidas.

## 9. Pruebas ejecutadas y resultados exactos

| Batería | Resultado | Exit code verificado |
|---|---|---|
| Focused users/organizations (9 suites) | 68/68 | — |
| **Suite unitaria completa** | **4000 passed / 0 failed / 40 skipped preexistentes** (274 archivos + 2 preexistentes skipped) | **0** |
| tsc --noEmit | 0 errores | 0 |
| eslint | 0 errores (1385 warnings preexistentes) | 0 |
| E2E aislado en vivo (guardas) | 17/17 PASS | 0 |
| BOLA contract | 5/5 | — |
| security-contract-test-static | OK con 2 warnings MEDIUM/LOW (con baseline revisada) | 0 |
| ci-gate-ts-checks.js | PASSED | 0 |
| ci-gate-sql-checks.js (estático) | completado (canary checks_completed) | 0 |
| Hardcoded secrets (regex del CI) | sin coincidencias | 1 (grep sin match = OK) |
| bun audit | warnings GHSA preexistentes en dependencias (DOMPurify, zod, brace-expansion, sentry) | no bloqueante según política CI (`\\|\\| echo`) |

Nuevas de este ciclo: 18 pruebas (10 guardas/sanitización/has_stores,
4 rol-de-plataforma en formulario, 4 estados honestos de vista) + 6
preexistentes actualizadas para los nuevos contratos (mock con semántica
PostgREST real). Pruebas de aislamiento entre organizaciones (trigger +
alcances por rol) re-verificadas en vivo.

## 10. Estado de CI por check (SHA de código `e5ecf72d7`, verificado 2026-10-25 10:10 UTC)

Los 4 workflows terminaron en `success` (fuente: API `check-runs` del commit):

| Check | Resultado | Evidencia (run/job) |
|---|---|---|
| TypeCheck + Lint + Unit Tests + Build | **SUCCESS** (build completo con heap 4096) | run 40183361242 / job 121138897513 |
| Unit & Integration Tests (Test Coverage) | **SUCCESS** | run 40183361330 / job 121138897593 |
| SQL Static Checks | **SUCCESS** | run 40183361221 / job 121138897566 |
| SQL DB Security Checks | **SUCCESS** | run 40183361221 / job 121138897387 |
| Security Audit | **SUCCESS** | run 40183361242 / job 121138897453 |
| TypeScript Security Checks | **SUCCESS** | run 40183361211 / job 121138897345 |
| Allowlist Review | **SUCCESS** | run 40183361211 / job 121138897224 |
| Vercel Preview Comments | **SUCCESS** | run 121139164147 |
| E2E Tests (Playwright) | **SKIPPED** (política del repo: entorno aislado; no una omisión de este ciclo) | — |

- **CI del SHA `897c4bb7c` (última fusión, PR #1481): 11/11 verdes** en el
  momento de la fusión (fusión 2026-10-25). Fuente: página del PR (GitHub).
- **Build local:** `bun run build` (unificado y con workers reducidos, heap
  3000–3900): **FAIL por memoria** (SIGKILL/OOM del sandbox de 4 GB con el
  servidor pm2 activo). **Limitación, NO éxito local** — el CI ejecuta el build
  completo con `NODE_OPTIONS=4096` en runners mayores y terminó SUCCESS en el
  SHA de código (evidencia arriba). Evidencia local equivalente: tsc 0 errores
  + suite 4000 verde (runtime).
- **Bundle gate local: NOT RUN** (requiere artefacto `.next` de un build
  completado). Corre en CI tras el build (workflow CI, success).
- **CI del SHA final (solo-expediente):** el único cambio posterior a
  `e5ecf72d7` es este documento; su CI se espera idéntico y se registra por
  check en la descripción del PR #1482 y en la respuesta final al propietario.

## 11. Hallazgos corregidos y pendientes

Corregidos en la rama (10 commits, §4): actor RPC spoofeable; omisión
silenciosa del cambio de empresa; escalada admin→superadmin por RPC/ruta;
desactivación/baja/reset de la cuenta SuperAdmin por admin ordinario;
downgrade silencioso del rol de plataforma en el formulario; SuperAdmin sin
alcance global en GET `/api/users/[id]`; inyección de sintaxis en la
búsqueda de usuarios; truncado silencioso a 100 usuarios + vacío fingido ante
errores; `has_stores` post-paginación con contador incoherente; resumen de
organizaciones por página; falsos duplicados por comodines; ACL revertida
(detectada por el gate); textos/a11y menores.

Pendientes (fuera del alcance técnico, requieren decisión o despliegue):
1. **Despliegue conjunto** (código #1481 ya en main + migraciones
   `20261026120000`/`20261026130000`): en producción NO hay SuperAdmin aún
   (verificado: `is_superadmin()` no existe, `admin@demo.com` role=`admin`).
   El estado actual es SEGURO (superadmin es aditivo), pero la activación del
   rol es decisión y operación del propietario. Tras el despliegue: re-exportar
   `contract-surface.sql` y retirar las 4 entradas `source_of_truth_baseline`.
2. **33 filas residuales de `payment_transactions`** (§7) + FK `store_id`
   faltante: decisión del propietario (se aporta la evidencia exacta).
3. `admin@costpro.com` y cuentas demo operativas sin tienda asignada
   (preexistente, documentado por la misión anterior): decisión de negocio.
4. `bun audit`: dependencias con advisories GHSA (política CI no bloqueante);
   actualización de dependencias = decisión del propietario.
5. Endpoint de administración de Auth «admin list users» 500 preexistente
   (documentado por la misión anterior; fuera de alcance).

## 12. Operaciones productivas realizadas durante este ciclo

**NINGUNA escritura.** Ciclos 1 y 2: únicamente consultas SELECT/GET (guardo
SELECT-only del ciclo 1 + verificación REST GET-only del ciclo 2: 14 consultas
de BD + 11 verificaciones auth individuales). Sin migraciones productivas, sin
deletes/updates, sin cambios de permisos, sin toques a cuentas/tiendas, sin
re-ejecución de limpiezas, sin merges, sin despliegues. El único writes
realizado fue contra el proyecto **E2E aislado** (sentinel verificado) durante
las pruebas negativas del ciclo 1 — su finalidad declarada. El push/PR de este
ciclo toca SOLO la rama de trabajo, jamás `main` ni producción.

## 13. Riesgos residuales y decisión requerida al propietario

| Riesgo | Severidad | Decisión requerida |
|---|---|---|
| ~~PAT inválido (bloqueo del ciclo 1)~~ | RESUELTO | El PAT nuevo facilitado funcionó (200): rama publicada y PR #1482 abierto. Sin acción pendiente. |
| Escalada admin→superadmin por RPC **sigue posible en producción hasta desplegar** `20261026130000` | ALTO (explotable por un admin interno) | Hacer merge del PR #1482 cuando lo decida y desplegar código + migraciones JUNTOS (nota de despliegue de `20261026120000`). |
| `assign_user_organization` spoofeable en producción hasta desplegar la versión corregida | ALTO | Ídem. |
| 33 filas `payment_transactions` residuales sin tienda ni transacción padre + FK `store_id` ausente | BAJO | Borrado/quarantena + migración FK (a decidir). |
| Cuentas demo operativas sin tienda asignada (`admin@costpro.com`, `cajero@`, `almacenero@`, etc.) | BAJO | Decisión de negocio (asignar/borrar) — prohibido asignarlas a las protegidas sin autorización. |
| Dependencias con advisories GHSA (`bun audit`) | BAJO | Política CI no bloqueante; actualización = decisión del propietario. |
| Endpoint auth «admin list users» 500 | BAJO | Preexistente (fuera de alcance); la verificación individual por ID funciona como vía alternativa. |

## 14. Veredicto final

**TÉCNICAMENTE CERRADO** (ciclo 2, 2026-10-25 10:14 UTC).

Cierre del ciclo 1: la entrega quedó bloqueada por el PAT inválido (401) y el
expediente registró **NO CERRADO por entrega bloqueada**, preservando el
trabajo (rama local + patch aplicable + expediente). Cierre del ciclo 2: el
propietario facilitó un PAT válido y el estado de GitHub se reconstruyó de
cero (repo re-clonado, `origin/main` intacto en `e922592744`, rama
re-aplicada con `git am` limpio y re-verificada). Con el push + PR #1482, la
condición que faltaba queda satisfecha:

1. ✅ Estado de GitHub y SHA final comprobados (§2) — incluida la pérdida del
   sándbox y la recuperación íntegra desde el patch (10 commits, +1855/−140).
2. ✅ Cero fallos de TypeScript atribuibles a la misión (tsc local 0 + CI
   TypeCheck SUCCESS en `e5ecf72d7`).
3. ✅ Batería de CI terminada e identificada por check (§10): 8/8 SUCCESS +
   E2E SKIPPED por política del repo (no una omisión oculta). El único commit
   posterior al SHA de código es este expediente (solo-docs); su CI se
   registra en el PR #1482.
4. ✅ Modelo organización/SuperAdmin probado en los límites (17/17 negativas
   en aislamiento, §6).
5. ✅ Aislamiento entre organizaciones verificado (trigger DB + alcances por
   rol + pruebas negativas).
6. ✅ Limpieza histórica re-verificada SIN nuevas escrituras (§7, ciclo 2 con
   verificación individual de los 11 bans).
7. ✅ Tiendas protegidas identificadas y contrastadas con el baseline
   (221/894/6 exacto; limitación de comparación por-fila documentada en §8).
8. ✅ Sin riesgos críticos/alto sin identificar (§13: los dos ALTO existentes
   requieren DESPLIEGUE del propio propietario — el código correcto está
   publicado en el PR #1482; no son defectos del código entregado).
9. ✅ El PR y este expediente reflejan exactamente lo verificado (resultados
   medidos, fuentes y fechas citadas).
10. ✅ Ningún merge ni cambio productivo en este ciclo (§12).

**Acción del propietario (única vía para completar en producción):** revisar y
hacer merge del PR #1482, y desplegar código + migraciones
(`20261026120000` + `20261026130000`) JUNTOS cuando decida activar
SuperAdmin; tras el despliegue, re-exportar `contract-surface.sql` y retirar
las 4 entradas `source_of_truth_baseline` del gate. Hasta el despliegue, la
mitigación es operativa: los vectores afectados (RPC/RUTA) exigen sesión de
admin interno.
