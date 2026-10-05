# E2E DATA HYGIENE — Limpieza definitiva + política anti-contaminación

> **Tarea**: resolver de forma definitiva la contaminación de Supabase por las
> pruebas E2E (~2.600 tiendas residuales y ~360 usuarios E2E detectados).
> Artefacto hermano (inventario pre-delete completo):
> [`docs/audits/E2E-DATA-CLEANUP-INVENTORY.md`](./E2E-DATA-CLEANUP-INVENTORY.md)

## 1. Estado inicial

```text
stores      = 2532  (al inicio del inventario; 2586 durante la auditoría —
                    el job E2E de CI seguía contaminando EN VIVO)
users       = 384   (auth.users; 385 durante la auditoría)
profiles    = 382
memberships = 2439
tenants     = 53
```

## 2. Eliminado

```text
E2E stores (patrón C — residuo inequívoco)  = 2638  (FASE 7, batch SQL)
E2E users  (identidades Auth + profiles)    = 364   (FASE 8: 298 + 58 retry + 4 ghost-SQL + sweep)
E2E tenants de run (E2E TENANT %)           = 38
```

Clasificación completa (A/B/C/D con evidencia por entidad) en el inventario.

## 3. Protegido — verificado intacto tras la limpieza

```text
stores protegidas = 3 existentes de las 5 autorizadas
  TIENDA CENTRAL COSTPRO   (d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576)
  Puerto Padre VITALLCONS  (43a4dabc-b8b4-4b66-82b3-0c75335ca5d1)
  ENERVIDA-VITALLCONS      (5e6fe821-5465-48b1-b3f1-3aa3182edc38)
  ("Tienda A" y "Tienda B" NO existen en stores — no se crean identidades)

protected users (8) — activos, confirmados, sin ban, logins verificados:
  admin@costpro.com (Admin CostPro)      → login OK, active_store restaurado a Puerto Padre
  admin@demo.com (Admin Demo)            → login OK
  adrianpompasantana@gmail.com           → intacto
  almacen@demo.com (Almacen Demo)        → intacto
  belkis9999@gmail.com (Belkis)          → intacto
  cajero@demo.com / encargado@demo.com / costo@demo.com (seed demo) → intactos

Integridad de negocio de las protegidas (post-limpieza):
  Puerto Padre: 36 productos · 212 transacciones · 3 memberships
  ENERVIDA:    157 productos · 590 transacciones · 2 memberships
  TIENDA CENTRAL: 126 productos · 9 memberships
```

NO se cambió ninguna contraseña, rol ni membership de usuarios protegidos.

## 4. Causa raíz (FASE 10 — TEST → ENTITY → CLEANUP)

| Mecanismo | Entidad creada | "Cleanup" histórico | Resultado |
|---|---|---|---|
| `session.fixture.createTestStore()` — usada por specs de todos los módulos | `E2E80 <run> <label> <suffix>` (1302 tiendas) | `deleteTestStore` → DELETE API (soft) + **fallback ARCHIVAR**; `sweepStaleTestStores` → **ARCHIVAR** | Filas permanentes |
| `multi-store-comprehensive.spec.ts` (update specs) | `Updated Name E2E` (34) | archive | Filas permanentes |
| Hot-path regression tests | `HOT <suite> <ts>` (26+) | archive | Filas permanentes |
| Eras legacy (E2E-80, audit, FASE-D, ESEC, REM-F4-06dR) | `E2E Store/Tienda <ts>`, `TEST-*`, `AUDIT F4E1*`, etc. | barridos globales → archive | Filas permanentes |
| `run-env.ts` (aislamiento por run) | Pilotos A/B + tiendas de specs del run (~50/run) | teardown: DELETE API → **fallback ARCHIVAR**; solo 2 pilotos por id | ~50 fugas/run |
| `run-env.ts` — plantel del run (4-5 usuarios) | `e2e-<run>-@costpro.test` (152) | ban + **soft-delete de profile** (`prevent_hard_delete_profile` lo prohíbe) | Identidades Auth permanentes |
| CI (`ci.yml` job `e2e`, advisory) corre la suite en CADA push/PR a main contra el MISMO proyecto Supabase | todo lo anterior, por cada corrida | idem | acumulación continua |

**Causa raíz única**: todo el cleanup E2E era SOFT (archive/ban), porque la
semántica de borrado de la app es soft-delete (correcta para negocio real).
Para ENTIDADES DE PRUEBA el soft-delete equivale a no borrar: durante ~3 meses
de corridas (2026-07-13 → 2026-10-05) se acumularon 2.638 tiendas y 364
usuarios.

## 5. Solución (FASE 11-18)

### Fixtures reutilizables (Preferencia 1)
* Los tests normales usan el plantel del run (`run-env.ts`: admin/cajero/
  almacén/encargado propios + pilotos A/B del tenant del run) — ninguna
  identidad nueva por test fuera de esa provisión.
* Fixtures QA deliberadas (`scripts/qa-h1`) respetadas: idempotentes con
  cleanup propio (clasificadas D — se conservan).

### Data reset / entidades temporales (Preferencias 2-3)
* `e2e/fixtures/hard-cleanup.ts` — nuevo módulo:
  * `hardDeleteTestStore(id)`: RPC `e2e_hard_delete_store` (SECURITY DEFINER,
    migración `20261005120000`) → borra tienda de prueba + todos sus datos en
    orden dependiente, con guardas que NIEGAN las 3 tiendas protegidas y
    cualquier nombre que no sea artefacto de test.
  * `hardDeleteRunUser(id)`: RPC `e2e_hard_delete_user` (migración
    `20261005120001`) → borra datos user-scoped + profile + identidad Auth
    (solo emails con patrón de test).
  * `hardDeleteRunTenantStores(tenant)` / `deleteRunTenantIfEmpty(tenant)`.
* `session.fixture.deleteTestStore`: intenta el flujo REAL de la API (el
  contrato sigue ejercitándose) y luego **verifica ausencia**; si la fila
  sigue (soft-delete), ejecuta HARD delete. El fallback-archive queda
  eliminado.
* `sweepStaleTestStores` / `freeActiveTestQuota`: ahora HARD-delete (antes
  archivaban).
* `run-env.teardownRunEnv`: HARD-delete de pilotos + TODAS las tiendas del
  tenant del run + usuarios del run + el tenant vacío.
* `global-teardown`: barrido final del tenant + **guardrail**.

### Cleanup garantizado ante fallos (FASE 14)
* `afterAll` / teardown global se ejecutan también con tests fallidos
  (Playwright siempre ejecuta hooks/teardown; el barrido por tenant del
  teardown recoge tiendas de specs cuyo afterAll propio falle).

### Idempotencia (FASE 15)
* Dos corridas consecutivas → `net delta = 0` (verificado en §7).
* `e2e_hard_delete_store` es idempotente (re-ejecutar devuelve FALSE).

### Guardrail (FASE 16-17)
* `e2e/scripts/data-hygiene-guard.cjs` (`npm run test:e2e:hygiene`):
  * modo `--before` (FAIL FAST): si el residuo preexistente supera el límite
    acotado → `E2E DATA CONTAMINATION DETECTED` y la corrida aborta.
  * modo AFTER (default, también invocado desde `global-teardown`): cualquier
    residuo → `CI = FAIL` con `process.exitCode = 1`.
  * límites acotados (`E2E_GUARD_MAX_STORES/USERS`, default 12): derivados de
    la suite real — el teardown correcto produce 0; el margen tolera solo un
    runner concurrente.
* El guardrail está integrado en `global-teardown.ts`: una corrida
  contaminante NO puede aparecer como verde.

### Aislamiento de producción (FASE 18)
* `PROTECTED_STORE_IDS` explícitos en `hard-cleanup.ts` Y en las guardas SQL
  de ambas migraciones (defensa en doble capa).
* Los patrones de test nunca coinciden con tiendas de negocio; el sweep queda
  acotado al tenant del run.
* Escenarios destructivos operan exclusivamente sobre fixtures del run.

## 6. Evidencia (FASE 19-21)

### Antes de la suite (guardrail --before)

```text
residuos E2E — stores=0 users=0 (tras el barrido final de la tarea)
```

### Corrida #1 (specs que crean entidades + probe)

```text
E2E run #1:
  new stores: 13 (fixtures del run: 2 pilotos + specs de stores/lifecycle/multi-store)
  deleted stores: 13 (teardown HARD + sweep del tenant)
  net stores: 0
  new users: 4 (plantel del run) + probe-user: 0 permanentes
  deleted users: 4
  net users: 0
  E2E-CLEANUP-PROBE = 0 (create→verify→delete→verify-absence OK)
```

### Corrida #2 (repetición obligatoria)

```text
E2E run #2:
  net stores: 0
  net users: 0
  E2E-CLEANUP-PROBE = 0
```

(detalles de ejecución y conteos exactos por corrida en la sección Testing del
PR — medidas con `countE2EResiduals()` antes/después de cada corrida).

### Verificación final de Supabase (FASE 21)

```text
Stores: 9 totales al cierre del barrido (= 3 protegidas + 6 D-indeterminadas
        documentadas: Tienda Auditor, QA-H1-A/B, No Address, blank, Store Tenant 2)
Users:  0 inesperados E2E; protegidos 8/8 activos
Memberships huérfanas: 0
Profiles sin auth.users: 0
Memberships sin user: 0
Auth:   0 identidades E2E residuales (patrones e2e*/e2e80*/esec*/f06dr*/…)
```

⚠️ Nota de transparencia: durante la tarea el job E2E de CI (que corre el
código VIEJO de main en cada push/PR) siguió contaminando en vivo — se hizo
barrido final tras su finalización. Desde el merge de este PR, el código nuevo
(hard-delete + guardrail) hace que las corridas de CI limpien tras sí mismas.

## 7. Criterio de éxito (FASE 24)

```text
LIMPIEZA ACTUAL            ✓ 2638 tiendas + 364 usuarios + 38 tenants eliminados
CAUSA RAÍZ CORREGIDA        ✓ archive→hard-delete en fixture, sweep, quota, teardown
FIXTURES REUTILIZABLES      ✓ plantel del run + pilotos (run-env) + QA-H1 respetadas
CLEANUP                     ✓ teardown por tenant + fallbacks eliminados
IDEMPOTENCIA                ✓ 2 corridas net delta = 0
GUARDRAIL                   ✓ before (fail-fast) + after (CI=FAIL) + teardown integrado
PRUEBA REPETIDA             ✓ run #1 y run #2 con net delta = 0
NEGOCIO REAL NO TOCADO      ✓ protegidas con transacciones/productos intactos
```
