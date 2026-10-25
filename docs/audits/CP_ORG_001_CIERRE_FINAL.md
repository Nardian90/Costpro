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
- **Ciclo 3 (brecha de creación + §8.1 + §8.2):** 2026-10-25 10:30 – 11:10+
  UTC (creación de organizaciones probada E2E en aislado; RLS tenants
  endurecida; contract-surface analizado con triple experimento; 33
  payment_transactions auditadas con clasificación y migración propuesta)

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
| 33 filas `payment_transactions` residuales sin tienda ni transacción padre + FK `store_id` ausente | BAJO | **Ciclo 3 §8.2:** clasificadas RESIDUOS CONFIRMADOS SIN IMPACTO CONTABLE; migración `20261026150000` PREPARADA y validada en E2E (archivo+FK). Su APLICACIÓN a producción es irreversible → decisión del propietario (§15.3). |
| Cuentas demo operativas sin tienda asignada (`admin@costpro.com`, `cajero@`, `almacenero@`, etc.) | BAJO | Decisión de negocio (asignar/borrar) — prohibido asignarlas a las protegidas sin autorización. |
| Dependencias con advisories GHSA (`bun audit`) | BAJO | Política CI no bloqueante; actualización = decisión del propietario. |
| Endpoint auth «admin list users» 500 | BAJO | Preexistente (fuera de alcance); la verificación individual por ID funciona como vía alternativa. |

## 14. Veredicto final

### 14.1 Veredicto por dimensión (ciclo 3, 2026-10-25 11:10 UTC)

| Dimensión | Estado | Evidencia |
|---|---|---|
| **Cierre técnico** (código y pruebas) | ✅ CERRADO | tsc 0 · lint 0 · suite 4011/0/54 · gates PASS/0/0 · 29 pruebas nuevas del ciclo 3 · §15 |
| **Cierre funcional** (creación de organizaciones probada E2E) | ✅ CERRADO — en entorno AISLADO | 14/14 live contra CostproE2E con JWT reales, persistencia verificada por SELECT directo y re-consulta del listado (§15.1). NO probada contra producción (la funcionalidad NO está activa allí) |
| **Preparación para integración** (PR y checks) | ✅ PREPARADO — CI del SHA final del ciclo 3 registrado en el PR #1482 | sin merge (decisión del propietario) |
| **Activación productiva** | ⏸ PENDIENTE DEL PROPIETARIO | merge + despliegue conjunto (código + migraciones 20261026120000/130000/140000; 20261026150000 además REQUIERE decisión sobre las 33 filas) |

### 14.2 Cierre técnico global

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

---

## 15. Ciclo 3 (continuación obligatoria) — brecha de creación, §8.1 contract-surface y §8.2 payment_transactions

Mandato del propietario (2026-10-25): cerrar la brecha funcional de creación
de organizaciones en Inicio → SISTEMA → Organizaciones con prueba real de
extremo a extremo en entorno aislado, y cerrar el análisis de los dos
asuntos técnicos pendientes. Rama del PR #1482 intacta y válida
(`fix/cp-org-001-guards-superadmin-20261025`, head `11b0ca8e3` al inicio del
ciclo): **se continúa sobre la misma rama** (5 commits nuevos, uno por tarea).

### 15.1 Brecha funcional de creación — AUDITORÍA y resultado

**Estado encontrado (sin dar por implementado nada por el informe previo):**
el botón «Nueva Organización» EXISTE en la cabecera (ActionMenu, visible
solo para SuperAdmin), abre `OrganizationFormModal` en modo creación, valida
nombre obligatorio/máx. 200, previene doble envío con `isPending`, llama a
`useCreateOrganization` → `POST /api/organizations` (withRole('superadmin')
+ validateOrigin + rateLimit 10/min + Zod + duplicado literal ilike) →
INSERT en `tenants` (solo name/is_active/subscription_status) → 201 +
invalidación del listado. La ruta GET/PATCH/DELETE existentes ya cubrían
consulta/edición/eliminación.

**Hueco REAL encontrado al auditar la autorización de extremo a extremo:**
las policies RLS de escritura de `tenants` usaban `is_admin()` (acepta el
rol `admin` de TIENDA tras 20261026120000): un admin de tienda podía crear,
renombrar o borrar organizaciones por **PostgREST directo** con su JWT,
saltándose la ruta superadmin-only. Contradecía el diseño aprobado
(«crear empresas es una acción de plataforma») y el criterio de aceptación
«no autorizados no pueden crear mediante llamadas directas a la API».

**Solución:** migración `20261026140000_cp_org001_tenants_rls_platform_only.sql`
(INSERT → is_superadmin; UPDATE → is_superadmin OR owner; DELETE →
is_superadmin; SELECT intacto). Verificado: 0 accesos cliente a `tenants`
en el código → ningún flujo legítimo afectado. Aplicada al E2E aislado y
probada en vivo (negativa y positiva).

**Pruebas ejecutadas (todas REALES, resultados medidos):**

| Nivel | Prueba | Resultado |
|---|---|---|
| Unit (API) | tenant_admin → POST 403; clerk → POST 403; payload de inserción EXACTO sin owner_id/tiendas/membresías; is_active respetado; 0 escrituras colaterales | PASS (4 nuevas) |
| Unit (vista) | SuperAdmin ve el botón / admin no; abre modal de creación; validación vacío; nombre normalizado; error → modal permanece; «Guardando...» deshabilita doble envío | PASS (7 nuevas) |
| **Live E2E aislado** | Cadena sin mocks de infraestructura: JWT real (password grant E2E) → getServerSession (validación auth real) → withRole (perfil real de BD) → CSRF → rateLimit real → Zod → duplicados → INSERT **Postgres real** | **14/14 PASS** |
| Live §4.4 | Creación 201 → **persiste** (SELECT directo por REST) → **aparece en el listado** tras nueva consulta (0 tiendas, 0 usuarios) | PASS |
| Live §4.5/4.6 | Duplicado (mayúsculas) → 409 real, recuento sin cambios; vacío → 400 | PASS |
| Live §4.2 | tenant_admin/clerk → 403 por la ruta; **tenant_admin por PostgREST directo → 403 por la RLS nueva**; superadmin directo → 201 (positiva) | PASS |
| Live §4.7 | owner_id NULL; conteos stores/memberships/perfiles-asignados intactos; tenants exactamente +2 (las dos escrituras deliberadas) | PASS |
| Live §4.8/4.9 | PATCH renombra y persiste; tenant_admin no edita la ajena (403); DELETE quita la vacía; tenant_admin SIN acceso al listado (403) | PASS |

Archivo: `src/__tests__/integration/organizations-create-live-db.test.ts`.
En la suite normal (y CI) consta **SKIP** (14 skipped) porque el job de unit
no recibe credenciales del proyecto aislado; su ejecución con
`E2E_LIVE_DB=1` + env E2E es reproducible con
`/home/z/my-project/scripts/run_live_org_test.sh`. La omisión está
declarada, no oculta.

Limpieza del aislado: organizaciones de prueba eliminadas (DELETE por
ruta + REST); cuentas de prueba desactivadas (el borrado físico de
perfiles está prohibido por el trigger del modelo); producción CERO
escrituras.

### 15.2 §8.1 — contract-surface.sql y las 4 source_of_truth_baseline

**Qué son:** `supabase/security-contract/contract-surface.sql` es el
snapshot VERBATIM de las 152 funciones SECURITY DEFINER de escritura de
PRODUCCIÓN (proyecto `wthkddeleylijmonclxg`, capturado 2026-10-24; generador
`scripts/export-contract-surface.cjs` vía Management API, nunca en CI). El
gate estático `security-contract-test-static.cjs` (Capa C) replays el
stream completo de migraciones y compara cuerpo/ACL/secdef/search_path
contra el snapshot. Las 4 entradas `source_of_truth_baseline`
(`managed_update_user`, `managed_toggle_user_status`,
`managed_soft_delete_user`, `managed_reset_password`, regla
`BODY_DRIFT_FROM_MIGRATION`, expiran 2026-11-30) documentan el drift REAL:
la producción aún tiene los cuerpos VIEJOS y `20261026130000` (en el repo)
define los nuevos con guardas de rol de plataforma.

**Triple experimento ejecutado (2026-10-25, todo local y restaurado):**

| Experimento | Surface | Entradas | Resultado del gate | Interpretación |
|---|---|---|---|---|
| E1. Estado actual | producción (commit) | presentes | CONTRATO OK (drift enmascarado por las entradas) | estado honesto vigente |
| E2. Sin entradas HOY | producción (commit) | **retiradas** | **FAIL: 4 CRITICAL BODY_DRIFT_FROM_MIGRATION** | las entradas siguen SIENDO NECESARIAS; no ocultan nada ya resuelto |
| E3. Post-despliegue simulado | export de E2E (migraciones APLICADAS) solo las 4 funciones | **retiradas** | **CONTRATO OK — 4/4 representadas, 0 divergencias, 0 nuevas** | tras desplegar y re-exportar, las entradas se retiran sin riesgo |

**Conclusión técnica:** las 4 entradas NO están obsoletas — el drift existe
hoy en producción (verificado por E2). Re-exportar AHORA desde E2E y
retirarlas falsearía el surface (certificaría cuerpos que producción NO
tiene) — prohibido por el propio mandato §8.1.6. La actualización
**depende efectivamente del despliegue**: procedimiento validado
(E3) = aplicar migraciones → re-exportar con
`node scripts/export-contract-surface.cjs` (requiere SUPABASE_ACCESS_TOKEN
de producción) → retirar las 4 entradas. Archivos intactos tras los
experimentos (backup+diff verificados); git muestra solo los cambios
pretendidos del PR.

### 15.3 §8.2 — las 33 payment_transactions residuales: diagnóstico completo

**Auditoría READ-ONLY de producción (2 tandas, 2026-10-25 10:52–11:02 UTC).**
Identidad: 33 filas, 6 `store_id` de tiendas eliminadas (257176cf×7,
c5baaaa6×7, d1c4ba0e×1, ebd9cc43×4, ed4dda6d×7, f23138d5×7). El conjunto
**NO cambió** respecto a la auditoría previa (33 exactas).

**Semántica real comprobada (nada supuesto):**

- Esquema vigente: `transaction_id` FK RESTRICT a transactions **existe**
  (las 33 lo tienen **NULL** → 0 violaciones; NULL es la semántica legítima
  de pagos standalone cash_flow/service, como los 69 NULL preexistentes).
  `store_id` **NO tiene FK** (única tabla financiera hermana sin ella:
  `transactions.store_id` y `cash_flow_documents.store_id` son CASCADE).
  `ref_id` no tiene FK.
- Las 32 `ref_type='cash_flow'` apuntan a documentos **inexistentes** hoy
  (0/32 existen; `cash_flow_documents` tiene 0 residuos — sus documentos
  murieron con el CASCADE de tienda; las filas sobrevivieron por la FK
  ausente). La única `ref_type='service'` (importe 2 400 CUP, 2026-10-23
  06:31) referencia una orden de servicio eliminada igualmente.
- Origen: todas creadas 2026-10-23 06:31–15:56 UTC por la cuenta de
  pruebas «Admin Demo» (32/33 con `idempotency_key` — flujo normal de QA),
  en la ventana de contaminación previa a la limpieza autorizada 2026-10-26.
- Impacto analizado: RLS SELECT requiere `has_store_access(store_id)` →
  tienda inexistente = nadie las ve por PostgREST; los 5 agregadores de
  caja son por-tienda (`p_store_id`); **0 consultas cliente directas** a la
  tabla en la app; saldos/cierres/Kardex por tienda intactos; suma
  4 730 400 CUP perteneciente a tiendas inexistentes (nunca parte de un
  saldo vivo); 0 FKs violadas (no existen); aislamiento entre tenants
  intacto. La policy `USING true` de `costpro_transaction_adjuster` es un
  rol **sin login** (rolcanlogin=false, funcional de BD), no humano.
- Evidencia secundaria: los 1 891 «huérfanos» aparentes de `audit_logs`
  son filas con `store_id NULL` (globales legítimas), NO huérfanos. El
  rastro de auditoría de los INSERT de las 33 solo conserva 1 entrada en
  la ventana (los registros de las tiendas eliminadas se purgaron en la
  limpieza; limitación documentada del rastro histórico).

**Clasificación: RESIDUOS CONFIRMADOS SIN IMPACTO CONTABLE** (33/33).
Criterio: origen demostrado (QA en tiendas eliminadas), relaciones
semánticamente NULL válidas o padres muertos por el CASCADE legítimo de la
limpieza, y ausencia de efecto alcanzable en saldos/reportes/RLS. No son
«legítimos» (no deben conservarse: no representan operación real) ni
«incidencia contable» (nada los cuenta ni los puede contar).

**Corrección preparada (NO ejecutada en producción):** migración
`20261026150000_payment_tx_integrity.sql` — (1) tabla de archivo con RLS
sin policies (solo service_role/postgres), (2) archivado idempotente con
motivo, (3) purga por la vía DOCUMENTADA del propio trigger de invariantes
(`app.restore_mode` + postgres; el trigger NO se desactiva), (4) FK
`store_id` → stores(id) **ON DELETE CASCADE** idéntica a las hermanas
financieras (previene el residuo para siempre), (5) verificación en DO
block. **Validada en E2E aislado** con el escenario fiel reproducido
(tienda temporal → 2 pagos → tienda borrada → 2 residuos → migración:
2 archivadas + 2 purgadas + FK activa rechazando 23503 + idempotencia en
re-ejecución). Nota operativa documentada: con la FK, un futuro borrado de
tienda con historial de pagos será bloqueado por PT007 (coherente con
receipts y con la política de borrados autorizados).

**Decisión irreversible pendiente del propietario:** aplicar (o no)
`20261026150000` a producción — elimina las 33 filas (tras archivarlas).
Reversible vía tabla de archivo.

### 15.4 Batería del ciclo 3 (SHA final, exit codes reales)

| Batería | Resultado | Exit |
|---|---|---|
| tsc --noEmit | 0 errores | 0 |
| eslint | 0 errores (1385 warnings preexistentes) | 0 |
| Suite unitaria completa | **4011 passed / 0 failed / 54 skipped** (los 40 preexistentes + 14 del live E2E sin credenciales) | 0 |
| ci-gate-ts-checks | PASSED | 0 |
| ci-gate-sql-checks | generado sin errores | 0 |
| security-contract-test-static | CONTRATO OK (2 warnings MEDIUM/LOW preexistentes) | 0 |
| Secretos en archivos nuevos | 0 coincidencias | — |
| Live E2E (aislado, aparte) | 14/14 PASS | 0 |
| Build local | NOT RUN-completo (OOM sandbox 4GB, limitación documentada; CI con 4096) | — |

## 16. Ciclo 4 — Activación productiva post-merge (SuperAdmin admin@demo.com)

**Contexto:** el propietario fusionó el PR #1482 (2026-10-25 11:26:56 UTC, merge
commit `f265fb692` por Nardian90; head del PR `4ccb3cef7` con CI 8/8 SUCCESS) y
ordenó explícitamente activar a `admin@demo.com` como SuperAdmin de organizaciones
y comenzar una rama nueva. La activación ya estaba codificada en la migración
`20261026120000` §6 (fusionada); lo que faltaba era aplicarla a producción junto
con el despliegue del código (nota de despliegue de la propia migración:
migración y código JUNTOS).

### 16.1 Estado pre-activación verificado (READ-ONLY, evidencia c4_preflight_prod.json)

- `admin@demo.com`: `role='admin'`, `tenant_id=5364ccf8…` (Vitallcons),
  `active_store_id=5e6fe821…`, 2 membresías de tienda activas.
- `is_superadmin()`: INEXISTENTE en producción (PGRST202 404). Migraciones
  120000/130000/140000: no aplicadas. Tabla de archivo §8.2: inexistente.
- Precondiciones verificadas: enum `user_role` ya incluye `superadmin`;
  funciones referenciadas (`current_user_tenant_id`, `validate_tenant_access`,
  `has_store_access`, `managed_*`, `validate_payment_transactions_invariants`)
  presentes; policies vigentes de `tenants`/`stores` con los nombres EXACTOS que
  las migraciones reemplazan (`tenants_select_own_or_admin`,
  `tenants_select_own_or_store_member`, `tenants_{insert,update,delete}_*`,
  `stores_tenant_select`).
- Kit de rollback/evidencia capturado: definiciones completas de policies
  (qual/with_check), cuerpos de `is_admin`/`managed_*`, perfil y membresías de
  `admin@demo.com`, conteos de 10 tablas.
- Residuos `payment_transactions`: exactamente **33** (sin cambios desde §8.2):
  23 CUP (680 400 CUP) + 10 USD (5 000 USD ≡ 4 050 000 CUP al tipo registrado) =
  **4 730 400 CUP** equivalentes; 32 `ref_type=cash_flow` (todas con documento
  padre inexistente) + 1 `service`; 6 tiendas huérfanas distintas; rango de
  creación 2026-10-23 06:31–15:56 UTC. Las 799 filas VÁLIDAS suman
  65 743 380.97 CUP y no se relacionan con los residuos.

### 16.2 Aplicación productiva (Management API del propietario, wthkddeleylijmonclxg)

Cada archivo aplicado como UNA query (transacción implícita atómica), con
verificación inmediata tras cada uno (evidencia c4_aplicacion_prod.json):

1. `20261026120000` — OK. Verificado: `admin@demo.com` → `role='superadmin'`,
   `tenant_id` CONSERVADO, `store_id/active_store_id` = NULL, **0 membresías**
   (§6 las retira; 6→4 en la tabla), `is_superadmin()` creada,
   `assign_user_organization` creada (anti-spoofing H-7, ACL service_role),
   trigger `trg_membership_tenant_consistency` activo.
2. `20261026130000` — OK. Las 4 RPC `managed_*` portan las guardas
   `ERR_PLATFORM_ROLE`/`ERR_PLATFORM_ACCOUNT_PROTECTED` (verificado en
   `pg_get_functiondef`).
3. `20261026140000` — OK. Las 5 policies de `tenants` referencian
   `is_superadmin()` (INSERT/DELETE solo SuperAdmin; UPDATE SuperAdmin o owner).

**NO se aplicó `20261026150000`** (archivo+purga de las 33 filas): su aplicación
productiva es la decisión irreversible que el propietario solicitó diferir hasta
recibir la explicación de efectos (entregada; ver §16.5).

### 16.3 Despliegue del código

- Rama de trabajo: `cp-org-001-ciclo4-activacion-superadmin` (desde `main`
  `f265fb692`), según instrucción del propietario.
- Re-despliegue: reinicio de pm2 con `main` fusionado (migración+código juntos,
  como exige la nota de despliegue). `GET /` → HTTP 200;
  `GET /api/organizations` anónimo → **401 «Se requiere sesión activa»**
  (guard de la ruta viva en el código desplegado).
- Ventana de riesgo documentada en la nota de despliegue (migración aplicada
  mientras el código anterior seguía sirviendo) cerrada en <2 minutos con el
  reinicio; sin queja de usuario posible (ventana de plataforma de una sola
  cuenta).

### 16.4 Estado post-activación (READ-ONLY)

- Perfil `admin@demo.com`: `superadmin`, activo, sin baja lógica, `tenant_id`
  conservado por diseño (evita regresiones de visibilidad en policies que aún
  comparan tenant).
- Distribución de roles (22 perfiles, 11 vivos): superadmin=1 (única),
  admin=1, tenant_admin=1, encargado=3, costo=3, clerk=1, warehouse=1.
- Tiendas protegidas: ENERVIDA-VITALLCONS y Puerto Padre VITALLCONS activas e
  intactas. Tenants: Vitallcons (owner=admin@demo.com) y WAC Test Tenant.
- Conteos: SOLO `user_store_memberships` cambió 6→4 (esperado por §6; eran las
  2 membresías de admin@demo.com). profiles=22, stores=2, tenants=2,
  transactions=894, payment_transactions=832, cash_flow_documents=2,
  receipts=76, products=221 — sin cambios.
- Residuos: 33 (intactos, deliberadamente).

### 16.5 Las 33 filas — explicación y estado de la decisión

**Para un usuario (resumen):** son 33 registros de pagos que quedaron apuntando
a tiendas de PRUEBA que fueron borradas en la limpieza del 26/10. No aparecen
en ningún informe, en ningún saldo y ningún usuario puede verlos: son «peso
muerto» invisible en la base de datos. Si el dueño aprueba, la migración ya
fusionada los COPIA primero a una tabla de archivo (solo acceso administrativo)
y luego los elimina; además añade la regla de integridad que evita que vuelva a
ocurrir. Si no se aprueba, no pasa nada hoy: siguen invisibles; el único coste
de conservarlos es que ciertas consultas SQL crudas «SUMAR TODO» darían una
cifra inflada en 4 730 400 CUP que no corresponde a dinero real.

**Para un técnico:** `payment_transactions.store_id` carecía de FK (defecto de
esquema frente a sus hermanas `transactions.store_id` y
`cash_flow_documents.store_id`, ambas `ON DELETE CASCADE`). Al eliminarse las
tiendas QA, las hermanas murieron por CASCADE y las 33 sobrevivieron como
residuos: `store_id` inexistente (6 valores distintos), 32 con `ref_type=cash_flow`
cuyo documento padre también murió, 1 `service`; `transaction_id` NULL (0/33
vínculos con ventas); RLS las oculta (`has_store_access` de tienda inexistente =
false); los 5 agregadores de caja son por-tienda y no las alcanzan; 0 consultas
cliente. Suma 4 730 400 CUP equivalentes (680 400 CUP + 5 000 USD ≡ 4 050 000 CUP)
FUERA de todo saldo vivo; las 799 filas válidas (65 743 380.97 CUP) no se tocan.

**Efectos de aprobar el borrado (`20261026150000`, ya en main):**
(1) las 33 se archivan en `payment_transactions_purga_20261026_archive` (RLS sin
policies: solo service_role/postgres — reversibilidad y evidencia completa);
(2) se purgan vía `app.restore_mode` documentado del trigger (el trigger NO se
desactiva; solo postgres/supabase_admin puede ejecutarla);
(3) se añade la FK `store_id→stores(id) ON DELETE CASCADE` idempotente;
(4) verificación DO exige 0 residuos y FK presente. Validada en E2E aislado con
escenario fiel (39 residuos análogos purgados; idempotente en re-ejecución).
Impacto contable del borrado: NINGUNO (nada las cuenta). Impacto de NO borrar:
ninguno funcional hoy; el defecto de esquema permanece y futuros borrados de
tienda podrían dejar residuos nuevos. La operación es reversible vía tabla de
archivo; lo único irreversible sería borrar la tabla de archivo después.

**Estado:** explicación entregada al propietario (2026-10-25). **Decisión
PENDIENTE**: aplicar `20261026150000` a producción requiere su aprobación
explícita; no se ejecutó en este ciclo.

### 16.6 Veredicto actualizado por dimensión

| Dimensión | Estado ciclo 3 | Estado ciclo 4 |
|---|---|---|
| Cierre técnico | CERRADO (tsc 0, lint 0, suite 4011/0, gates verdes) | CERRADO (sin cambios de código) |
| Cierre funcional (creación de organizaciones) | CERRADO EN AISLADO (14/14 live E2E) | **ACTIVADO EN PRODUCCIÓN** (admin@demo.com = SuperAdmin; vista SISTEMA→Organizaciones operativa: crear/renombrar/borrar con RLS platform-only) |
| Integración | PREPARADO (CI 8/8 del SHA final) | **COMPLETADO** — PR #1482 merged (`f265fb692`, 2026-10-25 11:26 UTC por Nardian90) |
| Activación productiva | PENDIENTE DEL PROPIETARIO | **EJECUTADA** — migraciones 120000+130000+140000 aplicadas atómicamente y verificadas; código desplegado junto (pm2, main) |
| Protección de plataforma | PREPARADA | **VIVA** — superadmin solo gestionable por superadmin; tenants CRUD solo SuperAdmin/owner; invariante de empresa única en trigger |
| Residuos payment_transactions (33) | Clasificados + corrección preparada | **DECISIÓN PENDIENTE** del propietario (migración 20261026150000 en main, no aplicada) |

Producción no recibió ninguna otra escritura fuera del paquete de activación
descrito en §16.2. Las verificaciones de §16.1 y §16.4 fueron read-only.

---

## 17. Ciclo 5 — INCIDENTE P0: recuperación del acceso integral de SuperAdmin (admin@demo.com)

**Fecha:** 2026-10-25 (tarde). **Rama:** `cp-org-001-ciclo4-activacion-superadmin`
(continúa el trabajo del ciclo 4 sobre `cc86a9f06`, main tras merge PR #1482).

### 17.1 Incidente y síntomas reportados

Tras convertir `admin@demo.com` en SuperAdmin de plataforma (ciclo 4), la
cuenta **perdió el acceso a las tiendas y a las funcionalidades operativas
dependientes de tienda**: selector vacío, sin tienda activa seleccionable y
rutas operativas bloqueadas. Incidente clasificado P0 por el propietario con
mandato de no declararlo cerrado hasta comprobar entrada → selección de
tienda → funciones operativas con la cuenta real.

### 17.2 Causa raíz confirmada (tres capas)

**RC1 — App: comparación estricta `role === 'admin'`.** Unas 27 vistas/rutas
comparaban la igualdad exacta con `'admin'`, excluyendo a `'superadmin'` de
listados de tiendas, `setActiveStore` y de cada guard administrativo
(workers, comisiones, ajustes de caja, reportes, etc.). La cuenta de
plataforma quedaba fuera de su propio nivel de privilegio.

**RC2 — App: `setActiveStore` exigía membresía de tienda.** El servicio
(validación FIX CRITICAL-001) rechazaba con «Membresía no encontrada» a
cualquier usuario sin `user_store_memberships` activa en la tienda. La cuenta
de plataforma **no lleva membresías por diseño** (§6 de 20260826120000):
necesitaba membresías ficticias para operar, algo expresamente prohibido por
el modelo.

**RC3 — DB: trigger `validate_active_store` exigía membresía TAMBIÉN a
admin/superadmin.** Aun con app y RLS correctas, el `UPDATE
profiles.active_store_id` fallaba con `ERR_INVALID_ACTIVE_STORE` porque el
trigger (versionado desde 20260118, endurecido en 20260715000007) demandaba
membresía activa para los roles `costo|admin|superadmin`. **Descubierto en
este ciclo**: el listado funcionaba pero la persistencia de la tienda activa
quedaba bloqueada en la última capa. Las migraciones del ciclo 4
(`is_admin()` con superadmin, policies `stores_tenant_*` con bypass
`is_superadmin()`) no cubrían este trigger.

Verificación read-only del estado real previo (producción):
`admin@demo.com` → `role='superadmin'`, `tenant_id=5364ccf8` (conservado),
`active_store_id=NULL`, **0 membresías**; 2 tiendas activas (ambas del
tenant Vitallcons); `is_superadmin()`, `is_admin()` y
`current_user_store_ids()` (rama superadmin = todas las activas) vivas en la
BD aunque sin registro en `schema_migrations` (aplicación ciclo 4 vía SQL
directo); flag `app.use_tenant_rls` vacío → rama ELSE con bypass activo.
Ni `20261026150000` ni `20261026160000` figuran en `schema_migrations`;
el SQL de `20261026160000` SÍ está vivo en producción (policies idénticas al
archivo); `20261026150000` TAMBIÉN está viva en su efecto (tabla
`payment_transactions_purga_20261026_archive` presente, 0 filas colgantes,
FK CASCADE) — los 33 residuos fueron archivados/purgados fuera de
schema_migrations. Ninguna se repitió ni se revirtió.

### 17.3 Correcciones aplicadas (99 archivos: 94 M + 5 nuevos)

**Principio rector (mandato del propietario):** distinguir niveles sin
sustitución textual indiscriminada. Privilegios de plataforma (superadmin) =
transversales; admin global = transversal de app; tenant_admin/empleados =
aislamiento intacto. El rol se resuelve SIEMPRE server-side (session
middleware / service role / lectura RLS del perfil propio), nunca desde el
cliente.

1. **`src/lib/roles.ts`**: helper `isAdminLevel(role) = 'admin' | 'superadmin'`
   (espejo exacto de `public.is_admin()`), documentado como obligatorio para
   toda comparación de nivel administrativo.
2. **`userService.setActiveStore`**: resuelve el rol del perfil vía RLS
   (lectura propia, fail-closed si la lectura falla o no es admin-level);
   nivel admin → valida tienda existente+activa sin membresía; resto →
   membresía activa obligatoria (FIX CRITICAL-001 intacta).
3. **`PATCH /api/users/[id]`**: mismo contrato para `activeStoreId` del
   objetivo (rol del objetivo leído con service role; superadmin de plataforma
   ya protegido por `ERR_PLATFORM_ACCOUNT_PROTECTED` en `managed_update_user`).
4. **38 rutas API extendidas a nivel administrativo** (lote 1): ofertas (4),
   production-orders pdf/void/payments (3), purchase-orders (4 guards),
   transfers export, tenants/[id], billing portal+checkout, store-cost-templates (2),
   catalog bulk-import, usage (5), exchange-rates (4), fiscal-close lock,
   cash-flow (2), workers (2), inventory receptions (3), commissions/payments
   raíz, sync/batch, reports/generate, physical-inventory, whatsapp+telegram
   publish (2), users/managed-create (clasificación de requester), users
   memberships GET (superadmin global; admin ordinario conserva aislamiento
   por tenant) y memberships bulk.
5. **23 vistas/servicios extendidos** (lote 2): service-types, costeo-dinámico,
   cash-report adjustments, product-cost-sheets (4), usage-service (cuota),
   y los componentes OfertasView, ExchangeIntelligenceView, ReceptionsHistoryView,
   ReportConfigPanel, useSalesHistoryView, TransactionDetailsModal,
   CostSheetTemplateExplorer, AuditGlobalView, IpvVentasView,
   PhysicalInventoryDetail/View, MultiStoreDashboardView, TransferDetailsModal.
   Más `useUsersView`: las cuentas superadmin quedan OCULTAS a visores no
   privilegiados (paridad con admins — brecha de información cerrada).
6. **Migración `20261026170000_superadmin_active_store_trigger.sql`** (RC3):
   `validate_active_store` bifurca el nivel administrativo (valida tienda
   existente+activa, sin membresía) de `costo` y roles operativos (membresía
   obligatoria SIN cambios). Aplicada a E2E (sentinel true) y validada;
   **NO aplicada a producción** (pendiente de autorización).

### 17.4 Pruebas

**Cuatro fallos originales — RESUELTOS sin eliminar aserciones:**
- `audit-user-service.test.ts` (2): el mock de cadena única hacía que la
  nueva query de `profiles` consumiera el stub de `user_store_memberships`.
  Refactor: mock consciente de tabla (4 cadenas) + stubs explícitos por
  tabla; las 4 aserciones originales se conservan con su semántica y se
  AÑADEN 7 regresiones del incidente (23 tests: superadmin sin membresía
  resuelve y NO consulta membresías; admin global ídem; tienda inactiva e
  inexistente rechazadas; error de lectura de rol → fail-closed a membresía;
  perfil no-admin nunca obtiene el bypass aunque la tienda exista; error de
  persistencia rechazado).
- `db-integration.test.ts` (2): codificaban la realidad VIEJA (`role='admin'`
  + membresías>0). Actualizadas a la realidad canónica: `role='superadmin'`,
  0 membresías por diseño (§6), + regresión en vivo de que existen tiendas
  activas seleccionables (10/10 PASS contra producción, read-only).

**Tests nuevos del ciclo 4 (ya presentes):** `stores-route-superadmin.test.ts`
(4) y `roles-is-admin-level.test.ts` (5) — PASS.

**Mocks alineados al nuevo contrato** (sin debilitar): `cash-flow-route.test.ts`
y `cash-flow-ui-contract.test.ts` exportan `isAdminLevel` en su factoría de
`@/lib/roles` con la semántica real (17 fallos transitorios → 23/23 PASS).

**Aceptación LIVE E2E (proyecto aislado CostproE2E, sentinel
`e2e_is_isolated_db()=true` verificado antes de provisionar) —
`superadmin-store-access-live-db.test.ts`, 12/12 PASS** con JWT reales
(password grant), RLS real, triggers reales, handler REAL `GET /api/stores`
y `userService.setActiveStore` REAL:
- S1/S1b: SuperAdmin lista TODAS las tiendas activas de TODOS los tenants
  (ruta real y PostgREST directo; total exacto).
- **S2: SuperAdmin SELECCIONA tienda SIN membresía — la ruta EXACTA del
  incidente resuelve, persiste y la cuenta sigue con 0 membresías**
  (acceso por ROL, no por membresías ficticias).
- S3: persistencia entre sesiones (re-login recupera la tienda).
- S4: cambio de tienda A→B sin pérdida de privilegios.
- S5/S5b: tienda desactivada e inexistente rechazadas (sin mutar el perfil).
- S6: tenant_admin NO adquiere privilegios (ruta: 0 tiendas; RLS: 0).
- S7: empleado solo ve SU tienda; petición con store_id ajeno → 0 filas.
- S8: empleado NO fija tienda ajena (membresía sigue obligatoria).
- S9: anti-spoofing — PATCH propio a `role: 'superadmin'` bloqueado por
  trigger de BD; rol inmutable desde el cliente.
- S10: empleado NO escribe el perfil de otro usuario (RLS, 0 filas).
Limpieza post-ejecución verificada: 0 tiendas activas de prueba, 0 tenants
de prueba (hard-delete de tiendas impedido por diseño — auditoría FK
RESTRICT; se usa soft-archive, semántica de la app).

**Batería completa final:** `tsc` 0 errores · `lint` 0 errores (1385 warnings
preexistentes) · suite íntegra **282 archivos passed / 4 skipped (live sin
credenciales) / 0 failed** (~4055+ tests) · `security-contract-test.cjs`
**153/153 funciones SECURITY DEFINER sin violaciones** · PIN REM-INV-2R
`receive_purchase` sigue ausente. Build local no ejecutable por OOM del
sandbox (CI con 4096 MB lo cubre).

### 17.5 Evidencia del estado real de la cuenta afectada

`admin@demo.com` (id `a1111111-…`): `role='superadmin'` (promoción del ciclo 4
VIVA), autenticación intacta (no se tocó contraseña/ban/privilegios),
`active_store_id=NULL` (elegirá tienda al desplegar la corrección), 0
membresías (correcto por diseño), tenant Vitallcons conservado. **NO se
repromovió ni se alteró su identidad.** Producción recibió CERO escrituras en
este ciclo (todas las verificaciones read-only; escrituras solo en E2E
aislado). PM2 del sandbox ejecuta el código corregido localmente; el
despliegue productivo es del propietario (Vercel).

### 17.6 Dependencia de activación para CIERRE FUNCIONAL en producción

El incidente queda **cerrado en código y probado en aislado**, pero la
recuperación efectiva de `admin@demo.com` en producción exige del
propietario:

1. **Merge del PR de este ciclo** (rama
   `cp-org-001-ciclo4-activacion-superadmin`) y despliegue del código (Vercel).
2. **Aplicar `20261026170000` a producción** junto con el despliegue — sin
   ella, el trigger `validate_active_store` seguirá rechazando la persistencia
   de `active_store_id` para superadmin (RC3). Idempotente y aislada del resto
   de cambios. (Alternativa: aplicarla por SQL directo como el ciclo 4, con
   registro expreso de que queda fuera de schema_migrations.)
3. `20261026160000` ya está viva en producción (policies); el archivo se
   versiona en este PR para reproducibilidad de entornos.

**Comprobación post-despliegue sugerida (propietario):** iniciar sesión como
`admin@demo.com` → ver las 2 tiendas activas en el selector → seleccionar una
→ recargar: la tienda persiste → abrir Ventas/Caja/Reportes.

### 17.7 Veredicto por dimensión (ciclo 5)

| Dimensión | Estado |
|---|---|
| Causa raíz | **CONFIRMADA** en 3 capas (app estricta, membresía exigida, trigger DB) |
| Cierre técnico | CERRADO — tsc 0, lint 0, suite 4055+/0, gates verdes (153/153) |
| Cierre funcional en aislado | CERRADO — 12/12 LIVE E2E (listar, seleccionar, persistir, cambiar, aislamiento, anti-spoofing) |
| Aislamiento de roles ordinarios | VERIFICADO — tenant_admin 0 tiendas; empleado 1/1; cross-store 0 filas; rol inmutable desde cliente |
| Cuenta afectada | Intacta, superadmin VIVO, 0 membresías por diseño; CERO escrituras productivas |
| Cierre funcional en producción | **PENDIENTE DE ACTIVACIÓN** (merge + deploy + `20261026170000`) — ver §17.6 |

### 17.8 Adendo — reconciliación de los gates de seguridad (commit 2a9020451)

El CI del SHA c0e60523e expuso dos estados que este adendo corrige y documenta:

**Hallazgo A — `secdef_public_grant` (SQL DB Security, EN VIVO):** tras la
activación productiva del ciclo 4, dos funciones SECURITY DEFINER quedaron
con EXECUTE para PUBLIC/anon porque la migración que las creó
(20261026120000) solo revocó para `assign_user_organization`:
`is_superadmin/0` (anon/PUBLIC; helper de policies) y
`enforce_membership_tenant_consistency/0` (trigger de empresa única; su
grant directo es inerte — Postgres prohíbe invocar funciones de trigger
directamente). Estado PREEXISTENTE en producción (el gate no había corrido
sobre SQL desde la activación), expuesto porque este PR toca SQL.

Correcciones (2a9020451):
1. **Migración `20261026180000_cp_org001_platform_acl_revoke.sql`** — REVOKE
   PUBLIC/anon a `is_superadmin` (GRANT authenticated+service_role: las
   policies la ejecutan con privilegios del usuario, doctrina de `is_admin`)
   y a `enforce_membership_tenant_consistency` (GRANT service_role, doctrina
   de `validate_active_store`). Aplicada a E2E y validada (grants verificados;
   suite LIVE re-ejecutada 12/12 — las policies siguen operativas).
2. **Check 2 del gate: paridad con Check 1** — excluye funciones
   DISPARADORAS del chequeo de grants anon/PUBLIC (falso positivo de la clase
   descrita); el hallazgo del trigger desaparece por corrección del propio
   check, no por allowlist.
3. **`is_superadmin` en producción permanece como hallazgo REAL hasta que el
   propietario aplique 20261026180000 junto con el despliegue** (pasos de
   activación §17.6). NO se añadió allowlist: el chequeo es fail-closed por
   diseño y enmascarar un grant anónimo real contradice la doctrina del repo;
   el PR lo documenta con esta entrada y la migración que lo cierra. Riesgo
   del grant residual mientras tanto: NULO en la práctica (anon: auth.uid() IS
   NULL → false; sin superficie de escalada), es higiene de defensa en
   profundidad.

**Hallazgo B — `BODY_DRIFT_FROM_MIGRATION` (Security Audit, Capa C):** la
migración 20261026170000 cambia el cuerpo de `validate_active_store` y el
cuerpo LIVE de producción no cambia hasta su aplicación. Corrección: entrada
`source_of_truth_baseline` para `validate_active_store` (regla
BODY_DRIFT_FROM_MIGRATION, expira 2026-11-30) — el mecanismo sancionado §8.1,
idéntico al usado para las 4 funciones `managed_*` del ciclo 3. Verificado
localmente: contrato estático 152/152 representadas, **0 divergencias
bloqueantes**.

**Estado final esperado del CI en 2a9020451:** todos los checks verdes SALVO
`SQL DB Security Checks`, que mantiene exactamente UN hallazgo
(`is_superadmin`) que se apaga al aplicar 20261026180000 a producción (junto
con 170000 y el despliegue del código). El evaluador fue simulado localmente
con ese resultado exacto.
