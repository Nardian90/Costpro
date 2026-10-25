# CP-ORG-001 — CIERRE DEFINITIVO DE ORGANIZACIONES, TENANT Y SUPERADMIN

> Expediente final único y reproducible. Misiones previas relacionadas: ORG
> (PR #1481, fusionado) y su limpieza productiva autorizada (2026-10-26).
> Este documento CIERRA la auditoría integral CP-ORG-001 sobre el estado real.

---

## 1. Fecha y hora UTC

- **Inicio de este ciclo:** 2026-10-25 01:14 UTC
- **Cierre de este ciclo:** 2026-10-25 02:20 UTC (evidencia recogida en el intervalo)

## 2. Repositorio, rama, SHA base y SHA final

| Elemento | Valor verificado en el momento de la comprobación |
|---|---|
| Repositorio | `Nardian90/Costpro` (público; git anónimo verificado con `ls-remote`) |
| Rama de trabajo | `fix/cp-org-001-guards-superadmin-20261025` |
| `origin/main` al inicio | `e9225927444bca43b1454deffded28a6c803e194` (= fusión del PR #1481) |
| SHA base de la rama | `e9225927444bca43b1454deffded28a6c803e194` |
| SHA final de la rama | `010be8312` (9 commits: 71f081e2e, efe1fb066, 2e148c794, 7168a237a, e0a6f85c5, f1ea6890c, a858e214b, 4ab1972e4, 010be8312) |
| Árbol de trabajo | Limpio al final (todos los cambios con commit) |

Nota de entorno: el repositorio local anterior se perdió (sándbox reiniciado);
se re-clonó desde GitHub (origin/main idéntico al reportado por las misiones
previas) y se reactivó el servidor pm2 `costpro` (puerto 3000, HTTP 200) con el
`.env` del propietario. **El PAT de GitHub facilitado devolvió `401 Bad
credentials` en todas las pruebas** (Bearer y token, `/user`): expirado o
revocado. Consecuencia: imposible hacer push/abrir PR desde este ciclo con
esas credenciales (ver §13).

## 3. PR y estado de fusión

- **PR #1481** (`feat/mision-organizaciones-superadmin-limpieza-20261025`):
  **MERGED** el 2026-10-25 por el propietario `Nardian90`. Head `897c4bb7c`
  (4 commits). Checks en el head en el momento de la fusión: 11 verdes
  (TypeCheck, Lint, Unit, Build, Unit&Integration y 4 de seguridad). Sin
  revisiones formales pendientes ni conversaciones sin resolver.
- La entrega de ESTE ciclo de correcciones es una **rama nueva + PR nuevo**
  (el #1481 ya no es actualizable). El push queda **BLOQUEADO por el PAT
  inválido** (§13); la rama con los 9 commits queda lista localmente y el
  bundle `cp-org-001.patch` adjunto a la evidencia permite aplicarla con un
  PAT válido.

## 4. Alcance exacto de los cambios (9 commits)

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

## 10. Estado de CI por check (SHA final)

- **CI del SHA final `010be8312`: NO EJECUTADO** — el push está bloqueado por
  el PAT inválido (§13). No se puede fabricar evidencia de CI de un SHA no
  publicado; se registra como **NOT RUN**.
- **CI del SHA `897c4bb7c` (última fusión, PR #1481): 11/11 verdes** en el
  momento de la fusión (fusión 2026-10-25). Fuente: página del PR (GitHub).
- **Build local:** `bun run build` (unificado y por fases, turbopack y
  webpack, heap 3000–3500): **FAIL por memoria** (SIGKILL/OOM del sandbox de
  4 GB con el servidor pm2 activo). **Limitación, NO éxito local** — el CI
  ejecuta el build completo con `NODE_OPTIONS=4096` en runners mayores
  (misma situación documentada por las misiones previas). Evidencia de
  compilación local equivalente: tsc 0 errores + suite 4000 verde (runtime).
- **Bundle gate local: NOT RUN** (requiere artefacto `.next` de un build
  completado). CI lo ejecuta tras el build.

## 11. Hallazgos corregidos y pendientes

Corregidos en la rama (9 commits, §4): actor RPC spoofeable; omisión
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

**NINGUNA escritura.** Únicamente consultas SELECT/WITH (guard duro
SELECT-only reutilizado de las fases previas, script
`scripts/org001_phase4_prod_verify.py` con `assert` de solo-SELECT). Sin
migraciones productivas, sin deletes/updates, sin cambios de permisos, sin
toques a cuentas/tiendas, sin re-ejecución de limpiezas, sin merges, sin
despliegues. El único writes realizado fue contra el proyecto **E2E aislado**
(sentinel verificado), donde se re-aplicaron las migraciones corregidas y se
ejercitaron las guardas en vivo — su finalidad declarada.

## 13. Riesgos residuales y decisión requerida al propietario

| Riesgo | Severidad | Decisión requerida |
|---|---|---|
| PAT `github_pat_11A7Y…` inválido (401 Bad credentials) | **BLOQUEANTE para la entrega** | Facilitar un PAT válido (o hacer push manual) para publicar la rama `fix/cp-org-001-guards-superadmin-20261025` (9 commits, listo) y abrir el PR. El bundle `/home/z/my-project/download/cp-org-001.patch` permite aplicarla con `git am`. |
| Escalada admin→superadmin por RPC **sigue posible en producción hasta desplegar** `20261026130000` | ALTO (explotable por un admin interno) | Desplegar código + migraciones JUNTOS (nota de despliegue de `20261026120000`). |
| `assign_user_organization` spoofeable en producción hasta desplegar la versión corregida | ALTO | Ídem. |
| 33 filas `payment_transactions` residuales sin tienda ni transacción padre + FK `store_id` ausente | BAJO | Borrado/quarantena + migración FK (a decidir). |
| Build/bundle-gate del SHA final sin evidencia de CI | — | Tras el push, confirmar los checks del SHA `010be8312` (o del SHA con el que se publique). |

## 14. Veredicto final

**NO CERRADO (por entrega bloqueada).**

Todas las condiciones técnicas de cierre exigidas por la misión están
satisfechas y verificadas con evidencia — estado de GitHub comprobado, cero
fallos de TypeScript atribuibles, suite completa verde con exit code real,
modelo organización/SuperAdmin probado en sus límites (17/17 negativas en
aislamiento), aislamiento entre organizaciones verificado, limpieza histórica
re-verificada sin escrituras, protegidas contrastadas — pero **dos condiciones
no pueden cumplirse en este ciclo**:

1. **El PR nuevo con las correcciones no existe**: el PAT facilitado devuelve
   401 y el push es imposible (se documentó y se preservó el trabajo: rama
   local completa + patch aplicable + expediente). El PR #1481 está fusionado
   y no es actualizable.
2. En consecuencia, **la CI del SHA final está NOT RUN** (no hay SHA
   publicado) y el expediente de fusión queda pendiente del propietario.

La única acción que cierra el ciclo es del propietario: (a) publicar la rama
con credenciales válidas — el bundle del patch está en
`audit-evidence/CP-ORG-001-20261025/cp-org-001.patch`; (b) confirmar los
checks del SHA publicado; (c) desplegar código + migraciones juntos cuando
decida activar SuperAdmin y retirar entonces las 4 entradas del baseline del
gate. Sin esas acciones, el expediente queda en este estado y no se disimula.
