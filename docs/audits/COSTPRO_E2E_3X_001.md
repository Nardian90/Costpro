# COSTPRO-E2E-3X-001 — Activación temporal y certificación E2E (3 corridas verdes consecutivas)

**Fecha:** 2026-11-06 · **Ejecutada por:** agente (sesión z.ai) · **Estado final:** `CERTIFICADO`
**Alcance:** activar temporalmente la suite E2E existente, conseguir tres ejecuciones
completas y consecutivas PASS sobre `CostproE2E`, y desactivar nuevamente la ejecución
automática dejando el repositorio en su estado original respecto a la activación.

---

## 1. Estado inicial de las pruebas

El repositorio tiene DOS mecanismos E2E, inspeccionados al inicio de la misión:

| Mecanismo | Estado inicial | Evaluación |
|---|---|---|
| Jobs legacy `e2e` en `ci.yml` y `e2e-tests` en `test-coverage.yml` | **Desactivados con `if: false`** desde 2026-10-09 por el propietario (contaminaron el Supabase compartido: 48 tiendas + 26 usuarios; `docs/audits/e2e-contamination-cleanup-20261009.md`) | NO se reactivaron: usan el environment antiguo `e2e`, tienen `continue-on-error: true` (prohibido por la misión para certificar) y su desactivación tiene causa raíz documentada. Mandato del propio repo: "NO ELIMINAR ESTE BLOQUE" |
| Workflow `e2e-isolated.yml` (CP-INFRA-011, environment `e2e-isolated`) | **Vivo, exclusivamente manual** (`on: workflow_dispatch` — nunca en push/PR, mandato FASE 7 §8.1) | Mecanismo utilizado para la certificación: es la configuración E2E existente y diseñada para operar contra la base aislada |

Historial del workflow al iniciar: 16 corridas; las 2 últimas (2026-10-30, SHAs
`b00480e20`/`8d30e113c`) en success; runs 12–14 anteriores en failure (corregidos en su
momento según comentarios del propio workflow).

Hallazgos de entorno detectados antes de certificar (ver §4):

1. La base aislada tenía **huérfanos** de una corrida del 2026-11-04 (run
   `20261104-1AC13C`) que murió sin teardown: 2 tiendas piloto de run + 4 usuarios
   sintéticos → el guardrail de net-zero (`global-teardown`) habría fallado toda corrida.
2. La base aislada estaba **desactualizada** respecto a `main`: faltaba el tramo de
   migraciones aplicado desde 2026-10-30 (v2.25.0 incluida la nueva firma de
   `create_sale_v2`); la app responde 503 fail-closed ante ese desfase.

## 2. Mecanismo utilizado para activarlas

- **Sin un solo cambio de código, tests, fixtures ni configuración E2E.** La activación
  consistió en disparar el workflow existente `e2e-isolated.yml` por `workflow_dispatch`
  (su vía de activación nativa), con inputs por defecto: `target=project` y el
  **smoke set CP-INFRA-011** (la suite E2E prevista: health-api, isolated-db-sentinel,
  auth.spec.ts, data-hygiene-probe, isolation-proof, inventory.spec.ts, pos-checkout,
  inventory-integrity). Filtro NO alterado, cobertura NO reducida, validaciones NO
  modificadas.
- Ejecución con `--retries=0` y sin `continue-on-error` (así está definido el workflow:
  cualquier fallo = corrida fallida; nada se oculta).
- Para garantizar **mismo SHA en las tres corridas** ante pushes paralelos a `main`,
  se creó la rama temporal **`cert/e2e-3x-001` fijada exactamente al SHA certificado**
  `deeef4374a9d7ea499ff17a3b650d15e6aae656c` (main al inicio de la misión). La rama no
  recibió commits y fue eliminada tras la certificación (§7).

## 3. Verificación de que se utilizó `CostproE2E`

- **Ref real verificado por Management API** (apilador `--inspect`, modo solo lectura):
  `nombre=CostproE2E ref=lguovmvrozxgssupkwpf region=us-east-1 estado=ACTIVE_HEALTHY`
  (evidencia: `audit-evidence/INFRA-011/remote/inspect.json`).
- **Producción `wthkddeleylijmonclxg` PROHIBIDA por construcción:** el guard
  fail-closed `e2e/fixtures/assert-isolated-db.ts` (Caso A) rechaza cualquier URL cuyo
  host contenga el ref de producción **sin conectar**; el Caso B exige igualdad EXACTA
  entre el ref de la URL y el secret `E2E_ALLOWED_REMOTE_REF` (configurado en el
  environment `e2e-isolated` con los 4 secrets del workflow, verificados por nombre vía
  API), más el centinela `public.e2e_is_isolated_db() === true`.
- **Credenciales sin mezclar:** el environment del repo apunta a producción y **no fue
  utilizado** en ninguna operación E2E; la clave service-role empleada en el
  mantenimiento (§4) se obtuvo por Management API del propio proyecto E2E
  (`lguovmvrozxgssupkwpf`) y nunca se imprimió ni versionó. Escaneo de secretos de los
  JSON de evidencia y del diff: 0 hallazgos.
- Todas las escrituras de la misión (mantenimiento del entorno) se ejecutaron bajo el
  guard y contra el ref E2E exacto.

## 4. Fallos encontrados y correcciones realizadas

**Primer intento (run 17, id 42206554460) — FAILURE** (contador a cero, per la regla de
consecutividad):

| Corrida | SHA | Total | PASS | FAIL | SKIP | Resultado |
|---|---|---:|---:|---:|---:|---|
| intento previo (run 17) | `deeef4374` | 45 | 37 | 8 | 0 | **FAIL** (2m49s) |

- **Síntoma:** los 8 fallos eran todos de `e2e/flows/pos-checkout.spec.ts` con
  `503 — "firma del RPC create_sale_v2 desactualizada (migraciones v2.25.0 pendientes de
  aplicar)"` (chequeo fail-closed de la propia app ante desfase app/BD), y el guardrail
  de teardown reportó `E2E DATA CONTAMINATION DETECTED — stores=2 users=4`.
- **Corrección 1 — limpieza de huérfanos:** los 2 residuos eran las tiendas
  `E2E PILOT A/B CostPro E2E-20261104-1AC13C` y los 4 usuarios
  `e2e-e2e202611041ac13c-{adm,usr,wh,enc}@costpro.test` de una corrida del 2026-11-04
  que murió sin teardown. Eliminados con el mecanismo OFICIAL del repo
  (`e2e/fixtures/hard-cleanup.ts`: RPC `e2e_hard_delete_store` + GoTrue Admin, con sus
  guardas de recursos protegidos activas) → residuos finales **stores=0 users=0**.
- **Corrección 2 — sincronización de migraciones:** apilador oficial
  `scripts/e2e/reset-remote-e2e-db.mjs --apply-replay` (reanudación idempotente vía
  tabla de estado, guard fail-closed): baseline ya aplicada (sha coincide),
  **tramo 13 aplicadas + 112 reanudadas = 125/125**, 0 fallidas; centinela reinstalado
  (`HTTP 200 — true`); `--verify` final: **PREPARADA**, tablas 165/165 con RLS.
  Evidencia: `audit-evidence/INFRA-011/remote/{inspect,apply-replay,verify}.json`.
- Ambas correcciones son **mantenimiento del entorno E2E** (el sandbox está diseñado
  para esto); NO modifican código, pruebas, fixtures ni configuración E2E del
  candidato, por lo que el SHA certificado permanece `deeef4374` para las 3 corridas.

## 5. Resultado de las tres ejecuciones (mismo SHA, secuenciales, sobre CostproE2E)

| Corrida | Run (workflow) | SHA | Total | PASS | FAIL | SKIP | Guardrail net-zero | Duración | Resultado |
|---|---|---|---:|---:|---:|---:|---|---:|---|
| 1 | 18 (id 42208533436) | `deeef4374` | 45 | 45 | 0 | 0 | PASS (net delta = 0) | 4m23s | **PASS** |
| 2 | 19 (id 42209190522) | `deeef4374` | 45 | 45 | 0 | 0 | PASS (net delta = 0) | 3m35s | **PASS** |
| 3 | 20 (id 42209742579) | `deeef4374` | 45 | 45 | 0 | 0 | PASS (net delta = 0) | 3m31s | **PASS** |

- Secuencia exigida: **CORRIDA 1: PASS → CORRIDA 2: PASS → CORRIDA 3: PASS** ✓
- Las tres completaron la suite prevista (45/45), con código de salida cero,
  conclusión `success` del workflow, `--retries=0`, sin `continue-on-error`, sin
  exclusiones y sin reintentos que conviertan fallos en éxitos.
- Cada corrida comenzó con fixtures en estado controlado: identidad sintética
  provisionada por corrida (E2E_ISOLATION=1) sobre una base con net-zero verificado.
- Duraciones (inicio→fin del run): 11:12:40→11:17:03, 11:17:52→11:21:27,
  11:22:14→11:25:45 UTC (2026-11-06).
- Resúmenes de prueba conservados en `download/costpro-e2e-3x-001/corrida-{1,2,3}/`.

## 6. Confirmación de que no se realizaron escrituras contra producción

- El guard fail-closed del repo rechaza la URL de producción **sin conectar** (Caso A)
  y exige igualdad exacta de ref + centinela (Caso B) para cualquier operación.
- Ninguna herramienta de la misión utilizó credenciales de producción: el único env con
  apuntado a producción (`NEXT_PUBLIC_SUPABASE_URL=wthkddeleylijmonclxg` del archivo de
  inicio) se identificó expresamente para NO usarlo.
- Las tres corridas corrieron contra el environment `e2e-isolated` (ref
  `lguovmvrozxgssupkwpf`); el mantenimiento (limpieza + migraciones) también operó ese
  ref, verificado por Management API antes de escribir.
- No se fusionó ningún PR, no se desplegó nada, no se modificó producción.

## 7. Evidencia de que las pruebas quedaron nuevamente desactivadas

- **Nada que restaurar:** no se modificó ningún archivo del repo durante la activación
  (la activación fue `workflow_dispatch` del workflow existente). `git status` contra el
  SHA certificado: sin modificaciones en workflows, tests ni configuración E2E.
- **Rama temporal eliminada:** `cert/e2e-3x-001` borrada del remoto (HTTP 204) y local.
- **Triggers del workflow E2E:** `e2e-isolated.yml` conserva ÚNICAMENTE
  `on: workflow_dispatch` (sin push/PR) — las pruebas no se ejecutan automáticamente en CI.
- **Jobs legacy intactos:** `ci.yml` y `test-coverage.yml` conservan sus `if: false`
  (verificado: 2 y 2 bloques respectivamente) y su environment antiguo sin tocar.
- **Sin workflows temporales activos ni ejecuciones pendientes:** todas las corridas del
  workflow están `completed` (runs 12–20), ninguna en cola; los archivos temporales
  locales de la misión fueron eliminados.
- **Branch protection:** `main` no tiene reglas de protección (HTTP 404 en
  `branches/main/protection`); no se creó ninguna y no se añadió ningún check obligatorio.
- La suite, sus specs, fixtures, configs y el workflow quedan íntegros y disponibles
  para volver a ejecutarse manualmente (`workflow_dispatch`) cuando el propietario decida.

## 8. Veredicto

**CERTIFICADO** — tres ejecuciones E2E completas y consecutivas con PASS (45/45 cada
una) sobre `CostproE2E` con el mismo SHA (`deeef4374`), y las pruebas nuevamente en su
estado original: ejecución exclusivamente manual, jobs legacy desactivados con
`if: false`, sin triggers automáticos, sin workflows temporales y sin cambios en la
protección de ramas.
