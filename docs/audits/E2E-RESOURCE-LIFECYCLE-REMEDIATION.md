# E2E RESOURCE LIFECYCLE REMEDIATION — Higiene de datos + gobernanza de fixtures

> ⛔ **ACTUALIZACIÓN 2026-10-09 (post-merge de PR #1383):** mientras este PR
> esperaba merge, el CI de main (sin el fix) y las corridas locales causaron un
> SEGUNDO incidente en vivo (48 tiendas + 26 usuarios + 6 tenants). Fue limpiado
> con los mecanismos de este PR y, como decisión del PROPIETARIO, se deshabilitó
> por defecto toda creación E2E de tiendas/usuarios: specs creadores apagados,
> jobs E2E de CI en `if: false` y modo legacy (pilotos persistentes) como
> default. Evidencia completa:
> [`e2e-contamination-cleanup-20261009.md`](./e2e-contamination-cleanup-20261009.md).

> **Tarea**: E2E 数据修复 + 测试夹具生命周期治理 — eliminar la acumulación persistente
> de usuarios y tiendas de prueba E2E en el proyecto Supabase compartido
> (`wthkddeleylijmonclxg`) y blindar el ciclo de vida de las fixtures.
> **Rama**: `fix/e2e-resource-lifecycle-hygiene` · **Base**: main (`fc815f380`).
> Artefactos hermanos: [`E2E-DATA-HYGIENE.md`](./E2E-DATA-HYGIENE.md) (remediación
> previa 2026-10-05), [`e2e-resource-cleanup-plan.json`](./e2e-resource-cleanup-plan.json)
> (plan FASE B de esta remediación), [`E2E-DATA-LIFECYCLE-REFLECTION.txt`](./E2E-DATA-LIFECYCLE-REFLECTION.txt)
> (reflexión técnica).

## 1. Problema

Cada ejecución E2E (local y CI) provisiona una identidad de run aislada
(4 usuarios + tenant + pilotos A/B + tiendas de specs). El teardown correcto
produce **net zero**, pero toda interrupción (SIGKILL, OOM, cancel de CI) deja
**huérfanos permanentes**: identidades Auth, tiendas y tenants de prueba que
nadie limpia. Entre el 2026-10-05 y el 2026-10-09 se acumularon:

```text
82 tiendas candidatas   (pilotos de run, E2E80, Reset Test, Multi-store…)
28 usuarios candidatos  (plantel e2e-<run>-{adm,usr,wh,enc}@costpro.test)
35 tenants candidatos   (E2E TENANT <run-id> / E2E RUN <etiqueta>)
```

Inventario completo con evidencia por entidad (UUID, fecha, tenant, actividad,
justificación): [`e2e-resource-cleanup-plan.json`](./e2e-resource-cleanup-plan.json).

## 2. Limpieza ejecutada (FASE C) — verificación post-hoc

Mecanismo (mismo de la remediación previa, sin SQL ad-hoc):

| Entidad | Mecanismo |
|---|---|
| Tiendas | RPC `e2e_hard_delete_store` (SECURITY DEFINER, migración `20261005120000`) |
| Usuarios | RPC `e2e_hard_delete_user` (SECURITY DEFINER, migración `20261005120001`) |
| Tenants | DELETE REST service-role tras verificar 0 stores y 0 profiles |

**Verificación UUID-level (snapshot post-limpieza, `2026-10-09T01:0xZ`)**:

```text
Candidatos del plan aún presentes:  stores 0/82 · users 0/28 · tenants 0/35
Estado resultante:                  stores=12 (8 activas) · auth_users=23 ·
                                    profiles=21 · tenants=5 · memberships=17
```

Inventario restante — 100% clasificado, sin residuos E2E de run:

| Categoría | Entidades |
|---|---|
| Negocio protegido | TIENDA CENTRAL COSTPRO · Puerto Padre VITALLCONS · ENERVIDA-VITALLCONS |
| Fixtures QA (conservadas) | QA-H1-A · QA-H1-B · qa.h1.a@costpro.test |
| Fixture landing demo | Grupo Demo CostPro (3 sucursales) + landing.demo@costpro-e2e.com |
| Archivadas era antigua (excluidas por revisión humana) | Tienda Auditor · No Address · (blank) · Store Tenant 2 |
| Usuarios protegidos (8) | admin@costpro.com · admin@demo.com · belkis9999@gmail.com · adrianpompasantana@gmail.com · almacen/cajero/encargado/costo@demo.com |
| Usuarios reales (3) | tery201194 / ronaldoguerra984 / juanmanuelcabreravargas @gmail.com |
| Pendientes de revisión humana (NO borrados, sin evidencia E2E) | 1 ghost auditor@costpro.test · 8 @uberip.com · 1 ghost user_c@tenant_b.com |

**Integridad de negocio verificada intacta**:

```text
TIENDA CENTRAL COSTPRO  products=126  transactions=0   movements=98   slips=0
Puerto Padre VITALLCONS products=36   transactions=212 movements=251  slips=0
ENERVIDA-VITALLCONS     products=157  transactions=600 movements=994  slips=140
```

## 3. Segundo incidente: pilotos persistentes borrados (causa raíz estructural)

Los pilotos persistentes `E2E PILOT A/B CostPro` (modo legacy/reutilización,
SEC-TS-08) fueron re-provisionados la madrugada del 2026-10-09 (UUIDs
`2fc9a0dd…` / `74c30b98…`) y registrados en
`e2e/config/protected-resources.json` — **pero el código seguía protegiendo
únicamente las 3 tiendas de negocio** (`PROTECTED_STORE_IDS` hardcodeado en
`hard-cleanup.ts`). Resultado verificable:

```text
snapshot 2026-10-09T01:00Z → E2E PILOT A/B CostPro: AUSENTES (de nuevo)
```

**Cadena causal** (reproducible, no especulativa):

1. `sweepResidualsSince()` corre en el teardown de CADA run aislado con una
   ventana temporal (`created_at >= run.createdAt`).
2. Filtra por `isTestStoreName()` — el nombre `E2E PILOT A CostPro` **coincide**
   con el patrón `^(E2E|…)` — y por `PROTECTED_STORE_IDS` que NO incluía los
   pilotos.
3. Cualquier run iniciado después del provisionamiento hard-borra los pilotos
   vía RPC `e2e_hard_delete_store` (la guarda SQL de la migración tampoco los
   conoce: solo los 3 UUID de negocio).
4. Riesgo gemelo confirmado: el RPC `e2e_hard_delete_user` acepta cualquier
   email `@costpro.test` → la fixture protegida `qa.h1.a@costpro.test` era
   borrable por el sweep de usuarios.

**Conclusión**: la protección por NOMBRE (exclusiones exactas en
`session.fixture`) era incompleta; la protección por UUID estaba confinada a
una constante hardcodeada en un solo módulo y desincronizada del inventario
de gobernanza. Detalle en la reflexión técnica.

## 4. Fix: gobernanza por UUID como fuente única de verdad

`e2e/config/protected-resources.json` (inventario protegido, revisable en PR)
pasó a ser **consumido por todas las rutas de borrado** a través del nuevo
módulo `e2e/fixtures/protected-resources.ts`:

| Ruta de borrado | Guarda nueva |
|---|---|
| `hardDeleteTestStore(id)` | FATAL si id ∈ config **o** nombre exacto ∈ config (SELECT previo) |
| `hardDeleteRunUser(id)` | FATAL si el email del profile ∈ config (guarda de identidad previa al RPC) |
| `sweepResidualsSince(...)` | Excluye tiendas protegidas (id+nombre) y usuarios protegidos (email) |
| `hardDeleteRunTenantStores(tenant)` | Hereda la guarda vía `hardDeleteTestStore` |
| `countE2EResiduals()` / `data-hygiene-guard.cjs` | Los protegidos NO cuentan como residuo (los pilotos matchean `E2E *` → falso CI=FAIL) |
| `provisionRunEnv()` (run-env.ts) | **Guard de entorno fail-fast**: aborta si falta un recurso protegido |
| `reconcileOrphanedRunContexts()` (nuevo) | Reconciliación UUID-level de runs muertos (ver §5) |

La lista exportada `PROTECTED_STORE_IDS` es la **unión** del mínimo de negocio
hardcodeado (fail-safe si el JSON falta) y del config (pilotos A/B incluidos).
Tras el fix, los pilotos se re-provisionaron con el script oficial:

```text
E2E PILOT A CostPro = e711cebc-8df7-4f12-be6e-873176c7960f   (vía POST /api/stores)
E2E PILOT B CostPro = b5fed991-8357-4edf-88b3-18095369100e   (vía POST /api/stores)
→ UUIDs registrados en e2e/config/protected-resources.json (mismo PR)
```

⚠️ Regla operativa: si un piloto muere, re-provisionar **y actualizar el config
en el mismo PR** — un UUID protegido desactualizado equivale a no proteger.

## 5. Reconciliación de runs interrumpidos (anti-huérfanos)

El teardown (`afterAll`/`global-teardown`) no es ejecutable cuando el runner
muere. Se añade una capa de reconciliación que no depende de hooks:

1. **Automática** — `provisionRunEnv()` invoca `reconcileOrphanedRunContexts()`
   al inicio de cada corrida: escanea `.e2e-run-contexts/`, detecta contextos
   de procesos muertos (PID inexistente con 2 min de gracia; files preset con
   >1h) y limpia **por UUID exacto** lo registrado en cada context (pilotos,
   tiendas del tenant, usuarios, tenant). Nunca ejecuta el sweep global por
   ventana temporal en esta vía (un huérfano es viejo: su ventana cubriría
   entidades de runs posteriores — limpieza cruzada). El residuo por identidad
   se cubre con un sweep por `created_by ∈ usuarios del run muerto`.
2. **Manual/CI** — `e2e/scripts/reconcile-orphan-runs.ts --run-id
   E2E-YYYYMMDD-XXXXXX [--execute]`: resuelve tenant, usuarios (patrón exacto
   de 4 roles) y tiendas (tenant ∪ nombre∋runId ∪ created_by∈usuarios) y los
   hard-deleta por UUID, con exclusiones de protegidos y dry-run por defecto.
   Cubre huérfanos de CI cuyos context files viven en el runner efímero.

## 6. Estado y verificación

Ver [`E2E-DATA-LIFECYCLE-REFLECTION.txt`](./E2E-DATA-LIFECYCLE-REFLECTION.txt)
para el análisis de diseño (por qué afterAll no basta, UUID vs nombre, riesgos
del entorno compartido) y la sección de verificación de este PR (guardrail
before/after, corridas focales, concurrencia, net delta UUID-level).
