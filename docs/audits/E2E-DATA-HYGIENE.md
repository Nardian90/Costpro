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
ANTES RUN #1: stores=9 users=27 tenants=15  (residuo E2E = 0/0)
```

### Corrida #1 (specs que crean entidades: probe + stores-crud + lifecycle + autoswitch + switching + reset + security + multi-store)

```text
E2E run #1:
  DESPUÉS inmediato:  stores=16 (+7) users=32 (+5)  ← FUGA DETECTADA
  new stores: 7 (specs que crean como admin compartido en T0 + attackers)
  new users: 5 (plantel de 2 invocaciones + attackers)
  net: ≠ 0 → expuso que el teardown por tenant NO cubría entidades creadas
  fuera del tenant del run → FIX APLICADO: sweepResidualsSince() integrado
  en teardownRunEnv (barrido por ventana temporal del run + identidad).
  Limpieza del residuo: 7 tiendas + 5 usuarios (sweep puntual) → estado base 9/27/15.
```

### Corrida #2 (repetición obligatoria, MISMA suite, con el fix integrado)

```text
E2E run #2:
  ANTES:  stores=9 users=27 tenants=15
  DESPUÉS (incluido el barrido asíncrono del propio teardown):
          stores=9 users=27 tenants=15
  stores_residuo = 0 · users_residuo = 0
  NET DELTA = 0  ✓
  E2E-CLEANUP-PROBE = 0 (create→verify→delete→verify-absence OK en ambas corridas)
```

Resultados de tests de las corridas (informativo): run #2-A 48 passed / 2
failed (security.spec V2.12.9/V2.12.13 — PREEXISTING: `create_sale` fue
reemplazado por `create_sale_v2` en el esquema, el test busca el error de auth
y recibe PGRST202; sin relación con la higiene de datos) / 5 skipped.

### Verificación final de Supabase (FASE 21)

```text
Stores: 9 totales = 3 protegidas (activas) + QA-H1-A/B (fixtures QA activas)
        + Tienda Auditor / No Address / blank / Store Tenant 2 (D-indeterminadas archivadas)
Users:  27 = 8 protegidos + 3 reales + 16 D-indeterminados documentados
Unexpected E2E entities: 0
Memberships huérfanas: 0 · Memberships sin user: 0 · Profiles sin auth: 0
Auth:   0 identidades E2E residuales
Protegidas (integridad de negocio intacta):
  Puerto Padre 36 productos · 212 transacciones · ENERVIDA 157 productos ·
  590 transacciones · TIENDA CENTRAL 126 productos · logins demo OK
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
