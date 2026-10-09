# LIMPIEZA DE CONTAMINACIÓN E2E — 2026-10-09 (SEGUNDO INCIDENTE)

> Rama: `fix/e2e-resource-lifecycle-hygiene` · Proyecto Supabase: `wthkddeleylijmonclxg`
> Ejecución: 2026-10-09 01:13–01:40 UTC · Método: reconciliación oficial por RUN ID
> (`e2e/scripts/reconcile-orphan-runs.ts`) + RPC `e2e_hard_delete_user` por UUID.
> Decide identidad, nunca nombre. Protegidos excluidos por diseño
> (`e2e/config/protected-resources.json`).

## 1. Cronología del incidente

| Hora (UTC) | Evento |
|---|---|
| 00:32 | Merge de PR #1383 → push a main → dispara CI + Test Coverage (4 workflows) contra código SIN el fix de gobernanza |
| 00:34–00:41 | Sesión local (anterior) provisiona 4 entornos de run de prueba (A01D2D, 3FCEE0, 50D7F7, F7EA69) validando el mecanismo |
| 00:50–00:57 | Los 2 workflows Test Coverage entran en fase E2E (sin timeout, `continue-on-error`) y empiezan a crear recursos; también lo hace la sesión local |
| 01:09:42 | Última tienda contaminante creada antes de la intervención |
| 01:13 | Diagnóstico: 45→60 tiendas, 26 usuarios y 6 tenants nuevos desde 00:34; creación ACTIVA (7 tiendas en 2 min → 11 en la muestra siguiente) |
| 01:14 | Pilotos protegidos verificados presentes; **los 2 runs Test Coverage se CANCELAN** (HTTP 202) — frenan la creación y el riesgo de que el sweep de main (3 UUIDs hardcodeados) borrara los pilotos `e711cebc…`/`b5fed991…` |
| 01:16 | Confirmado: 0 tiendas creadas en los últimos 3 min; runs `completed cancelled` |
| 01:17–01:19 | Reconciliación por RUN ID de los 6 runs muertos (dry-run + execute) |
| 01:20–01:22 | 4 usuarios `e2e80-created-*` restantes eliminados por UUID vía RPC oficial |
| 01:21–01:23 | Detección de actividad MANUAL del propietario en tiendas reales (3 vales) — EXCLUIDOS de la limpieza (§5) |

## 2. Inventario BEFORE (01:16 UTC, verificado por SQL)

- `stores = 60` (12 preexistentes + 2 pilotos protegidos + **46 contaminantes**)
- `auth.users = 48` (22 preexistentes + 1 ghost excluido por revisión humana + **26 contaminantes**)
- `tenants = 11` (5 preexistentes + **6 `E2E TENANT E2E-20261009-*`**)

## 3. Recursos eliminados (todos por UUID, con evidencia de origen)

### 3a. Reconciliación por RUN ID (CLI oficial, guarda de protegidos activa)

| Run ID (muerto: sesión local muerta o CI cancelado) | Tiendas | Usuarios | Tenant |
|---|---|---|---|
| E2E-20261009-A01D2D | 7/7 | 4/4 | eliminado (vacío) |
| E2E-20261009-3FCEE0 | 10/10 | 4/4 | eliminado (vacío) |
| E2E-20261009-50D7F7 | 14/14 | 4/4 | eliminado (vacío) |
| E2E-20261009-F7EA69 | 15/15 | 4/4 | eliminado (vacío) |
| E2E-20261009-EEA303 | 0/0 | 2/2 | eliminado (vacío) |
| E2E-20261009-7F722C | 0/0 | 4/4 | eliminado (vacío) |
| **Subtotal** | **46** | **22** | **6** |

Resolución por run: tenant `name ∋ runId`; usuarios patrón exacto
`e2e-<slug>-{adm,usr,wh,enc}@costpro.test`; tiendas por tenant del run,
`name ∋ runId` o `created_by ∈ usuarios del run`. La resolución de tenant se
corrigió en este PR (`eq."…"` con %20 no matchea espacios en PostgREST →
`ilike.*runId*`).

### 3b. Residuos fuera de run sets (email `e2e80-created-<base36>@costpro.test`)

Evidencia: patrón exacto generado por `flows/roles-permissions.spec.ts:144`
(test E2E-RBAC-008, SIN limpieza posterior), creados en la ventana del
incidente. Eliminados por UUID vía `rpc/e2e_hard_delete_user` (sign_out previo):

- `fcc63816-3fcb-4afc-a3f8-c990f1682a14` (mv08p9vh, 00:41)
- `08ffd4b3-2a2f-459e-a50f-960514bb9cc4` (mv090x83, 00:50)
- `165bdccd-a3f7-46f8-bb96-418ec31a9bc5` (mv098kzo, 00:56)
- `7fd5808d-73e6-46fc-bde5-3fa9fc512e89` (mv09idwk, 01:03)

## 4. Inventario AFTER (verificado por SQL)

| Recurso | Before | After | Esperado |
|---|---|---|---|
| stores | 60 | **14** | 12 preexistentes + 2 pilotos protegidos ✓ |
| auth.users | 48 | **23** | 22 preexistentes + 1 ghost (excluido) ✓ |
| profiles | 47 | **21** | baseline ✓ |
| tenants | 11 | **5** | preexistentes ✓ |
| usuarios creados hoy | 26 | **0** ✓ | — |
| tiendas creadas hoy | 48 | **2** (pilotos protegidos) ✓ | — |

### Identidad UUID-level de protegidos (verificada POST-limpieza)

- `e711cebc-8df7-4f12-be6e-873176c7960f` E2E PILOT A CostPro — presente, activo
- `b5fed991-8357-4edf-88b3-18095369100e` E2E PILOT B CostPro — presente, activo
- `d1c4ba0e…` TIENDA CENTRAL / `43a4dabc…` Puerto Padre / `5e6fe821…` ENERVIDA — presentes

### Integridad de negocio (invariante conservado)

| Tienda | Productos | Transacciones | Movimientos | Vales |
|---|---|---|---|---|
| ENERVIDA-VITALLCONS | 157 | 600 | 994 | 140 |
| Puerto Padre VITALLCONS | 36 | 212 | 255 (+4) §5 | 2 (+2) §5 |
| TIENDA CENTRAL COSTPRO | 126 | 0 | 99 (+1) §5 | 1 (+1) §5 |

## 5. EXCLUIDOS de la limpieza (no se puede probar que sean artefactos E2E)

Tres vales en tiendas REALES creados DESPUÉS de que todo el CI terminó
(último job CI: 01:18:01) y sin productos E2E asociados:

| Vale | Tienda | Hora | Estado | Nota |
|---|---|---|---|---|
| VS-000001-2026 | Puerto Padre | 00:50:15 | reversed | «Prueba de verificación documental — módulo Vales de Salida» |
| VS-000023-2026 | TIENDA CENTRAL | 01:18:44 | completed | «2» |
| VS-000002-2026 | Puerto Padre | 01:20:26 | reversed | «Vale de prueba para verificar botones visibles» |

Las notas son de redacción humana (las del spec E2E son literalmente
«E2E vale para flujo documental» / «E2E vale que se devolverá en setup»).
Clasificación: **prueba manual del propietario sobre la app** → propiedad del
usuario, NO se tocan. Si el propietario desea eliminarlos, debe hacerlo él
(o solicitarlo explícitamente con confirmación UUID-por-UUID).

## 6. Causas raíz del segundo incidente y mitigaciones de este PR

1. **CI ejecutaba E2E de creación contra el proyecto compartido en cada
   push/PR a main** (jobs `e2e` / `e2e-tests` con secrets reales y sin
   timeout). Mitigación: jobs E2E de CI deshabilitados (`if: false`) con
   banner — solo se reactivan por decisión explícita del propietario.
2. **11 specs creaban tiendas/usuarios/tenants** (algunos sin limpieza
   posterior — p. ej. `e2e80-created-*`). Mitigación: deshabilitados por
   defecto con banner reproducible y procedimiento de habilitación puntual.
3. **El modo aislado por run era el default** (4 usuarios + tenant + 2
   pilotos por corrida; cada corrida muerta = huérfanos). Mitigación:
   default invertido a legacy (reutiliza pilotos persistentes A/B,
   fail-closed por nombre exacto; no crea nada). `E2E_ISOLATION=1` queda
   como opt-in explícito.

## 7. Verificación de no-reproducibilidad (FASE E)

Ver `docs/audits/E2E-DATA-LIFECYCLE-REFLECTION.txt` §6: corrida de smoke en
modo legacy (nuevo default) con delta neto cero de tiendas/usuarios/tenants
verificado por UUID antes/después, y guard de higiene en verde.
