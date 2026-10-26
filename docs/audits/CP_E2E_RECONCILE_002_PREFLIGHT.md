# CP-E2E-RECONCILE-002 — Preflight de CostproE2E y autorización de replay controlado

> **Fecha:** 2026-10-26 (America/Havana) · **Rama:** `docs/cp-e2e-reconcile-002-preflight-20261026` (exclusiva, documental)
> **`main` vigente:** `9aa6e1f659ecff00aaba3383d885a919e6fa92de` (= merge del PR #1501, verificado contra GitHub antes de trabajar)
> **Objeto:** comprobar que el manifiesto quedó integrado, inspeccionar **de solo lectura** el estado remoto de la base aislada `CostproE2E` y determinar si es seguro recomendar el replay oficial (C2).
> **Esta misión es exclusivamente de inspección y preparación: NO aplicó migraciones, NO alteró datos, NO ejecutó pruebas E2E, NO ejecutó `--apply-replay`/`--reset`/`--verify`/`--contract` ni `supabase db push`.**
> **C2 (escritura) requiere autorización expresa e independiente del propietario.** Este expediente no la concede.

---

## 0. Resumen ejecutivo

| Dimensión | Resultado | Evidencia |
|---|---|---|
| PR #1501 (manifiesto C1) | ✅ **FUSIONADO** 2026-10-26T00:38:19Z (merge `9aa6e1f65` = `main` vigente) | §2.1 |
| Manifiesto en `main` | ✅ 508 considerados / **93 incluidos**, digest `0f2599e1…`, sha `ded26695…`; generador oficial | §2.2 |
| Determinismo (`--check`) sobre `main` | ✅ **`MATCH (sin deriva)`, exit 0** | §2.3 |
| Identidad de CostproE2E | ✅ Verificada sin ambigüedad: Management API (nombre `CostproE2E`, ref exacto, us-east-1, ACTIVE_HEALTHY) + guard fail-closed + **centinela `e2e_is_isolated_db()=true`** + inventario de 2 proyectos | §3 |
| Inspección remota (solo lectura) | ✅ Completada con el apilador oficial `--inspect` + 3 sondas SELECT puras | §4 |
| Registro de replay remoto | 87 filas: 82 `aplicada` (baseline + 10 pre-tamo + **71 tramo**) + 2 `fallida` (históricas v1) + 3 `limpiada` | §4.2 |
| Divergencia manifiesto↔registro | **22 pendientes** (posiciones 72–93); 0 divergencias por hash en las 71 aplicadas | §4.3 |
| Out-of-band real | ⚠️ **10 de las 22 pendientes tienen efectos YA presentes en remoto sin registro** (72, 73, 74, 84, 85, 86, 87, 88, 89, 90) — no solo las 2 documentadas por READINESS-001 | §4.4, §5 |
| `20261026120000` (UPDATE+DELETE) | ✅ Re-aplicación **0 filas** en ambos DML (perfil existe con `role='superadmin'` y **0 membresías** — verificado en vivo) | §5.1 |
| `20261026130000` | ✅ 4 `CREATE OR REPLACE` + ACL; **0 DML top-level**; ACLs remotas ya en estado final | §5.2 |
| Plan de replay C2 | ✅ 22 migraciones en orden lexicográfico; todas idempotentes/convergentes (verificado patrón a patrón) | §6 |
| Dictamen | **A — LISTO PARA SOLICITAR AUTORIZACIÓN DE REPLAY** (no autoriza la escritura) | §8 |

**Consecuencia práctica:** C1 está integrada y determinista en `main`. El estado remoto quedó censado por completo: la base está **preparada y sana** (centinela true, baseline aplicada, 71/93 registradas), pero con un historial manual más extenso que el documentado — exactamente el escenario que el mandato anticipó («no dar por supuesto que el historial manual es una prueba suficiente»). El replay de las 22 pendientes con el apilador oficial no solo es seguro: es **el mecanismo que registra y normaliza** ese estado disperso.

---

## 1. Reglas respetadas — lo que NO se ejecutó

1. **NO se ejecutó ninguna prueba E2E**, `workflow_dispatch`, Playwright ni `.spec.ts`.
2. **NO se ejecutaron migraciones, replay, reset, seed ni limpieza** sobre CostproE2E ni sobre ninguna otra base. Los comandos remotos ejecutados fueron **exclusivamente `SELECT`** (vía `--inspect` del apilador oficial y 3 sondas suplementarias validadas fail-closed contra DDL/DML).
3. **NO se ejecutaron** `--apply-replay`, `--bootstrap`, `--reset`, `--verify`, `--contract`, `--surgical-cleanup-v1`, `--reconcile-table-acl` ni `supabase db push`. El único modo del apilador usado fue `--inspect` (solo lectura, verificado en código antes de ejecutarlo, §3.1).
4. **NO se conectó a producción para comprobar o reparar el estado E2E.** El único dato de producción obtenido fue su entrada en el inventario de proyectos (`CostproBD`, ref `wthkddeleylijmonclxg`, solo nombre/ref/región/estado vía Management API GET) — sin conexión a su base de datos. El guard Caso A siguió activo en todas las ejecuciones.
5. **NO se modificaron credenciales, secretos ni protecciones.** Ninguna credencial se imprimió: el token de acceso vive en `.env` (no versionado), se leyó por variable lógica y jamás apareció en logs, evidencias ni este expediente. Las sondas escriben solo los RESULTADOS de los SELECT.
6. **NO se cambió código funcional, NO se fusionó ni desplegó nada, NO se omitió ningún guard** para obtener resultados.
7. El único efecto persistente de esta misión: este expediente + la evidencia de solo lectura versionada en `audit-evidence/INFRA-011/remote/preflight-002/`.

---

## 2. Fase 1 — Estado real de GitHub y del manifiesto

### 2.1 PR #1501

Consultado directamente contra la API de GitHub (sin asumir el estado previo):

- **state: closed, merged: true**, `merged_at: 2026-10-26T00:38:19Z`
- head: `cd167a67c` (rama `docs/cp-e2e-reconcile-001-20261026`) · base: `main`
- **merge_commit_sha: `9aa6e1f659ecff00aaba3383d885a919e6fa92de` = SHA actual de `main`** (el merge de #1501 es el commit vigente de `main`; no hay commits posteriores).

### 2.2 Presencia e integridad del manifiesto en `main`

- `audit-evidence/INFRA-011/e2e-migrations-manifest.json`: presente; `total_considerados=508`, `total_incluidos=93`, `total_excluidos=415`, digest `0f2599e15cdc297423ea032f64e3b127517555408a15641e92aac38785977ad5`, sha256 del archivo `ded26695…` (idéntico al regenerado por RECONCILE-001).
- `docs/audits/CP_E2E_RECONCILE_001_MANIFEST.md`: presente (236 líneas).
- Tramo 93 completo: primera `20260831000001_w9_f07_reset_store_data_acl.sql`, última `20261027000000_inteligencia_diviza_source.sql` (posición 93), posiciones 1..93 consecutivas.

### 2.3 Control estático (ejecutado sobre `main`, sin conexión a BD)

```
$ node scripts/e2e/build-migrations-replay.mjs --check
[build-migrations-replay] --check: regenerado ded26695de791223… vs commiteado ded26695de791223… => MATCH (sin deriva)
exit 0
```

**C1 queda confirmada integrada y determinista en `main`** (condición del mandato §2: al estar fusionado el PR, se continuó con el `main` real `9aa6e1f65`, no con los SHAs históricos de la auditoría).

---

## 3. Verificación del destino CostproE2E (antes de conectar)

### 3.1 Revisión previa del apilador — `--inspect` es de solo lectura (trazado completo)

`scripts/e2e/reset-remote-e2e-db.mjs` (545 líneas) fue leído íntegro ANTES de cualquier ejecución, conforme al mandato («no deducirlo por el nombre del parámetro»). Trazado exacto del modo `--inspect`:

| Paso | Código | Efecto remoto |
|---|---|---|
| Precondiciones | líneas 79–94 | Sin red: exige `--i-understand-this-is-destructive`, `E2E_TARGET_KIND=project`, `E2E_ALLOWED_REMOTE_REF` presente y ≠ producción, ref de la URL == allowlist (igualdad exacta); **aborta (exit 2) si la URL apunta a producción — sin conectar** (línea 85) |
| Identidad Management API | `verifyProjectName()` líneas 143–150 | `GET https://api.supabase.com/v1/projects/{ref}` — **solo lectura**; exige `d.id === REF_ALLOWED` y (línea 221) `identidad.name === 'CostproE2E'`, si no: throw sin escrituras |
| Guard centralizado | línea 227: `guard.assertIsolatedDb({ mode: 'bootstrap' })` | `e2e/fixtures/assert-isolated-db.ts` leído íntegro: `decideIsolatedTarget()` es **función pura sin red** (Caso A rechaza producción por host/ref; Caso B exige target-kind + allowlist exacta); en modo bootstrap omite SOLO el centinela (excepción §3.3 documentada de CP-INFRA-011) → **cero llamadas de red** |
| Inspección | `inspectState()` líneas 153–170 | **7 SELECT** exclusivamente: `pg_tables`, conteo `pg_proc`, `pg_extension`, `pg_roles`, `storage.buckets`, `select public.e2e_is_isolated_db()`, `select … from e2e_infra.e2e_migrations_replay_state` |
| Evidencia | líneas 541–542 | Escritura **local** de JSON (nunca remota) |

Conclusión verificada en código: **`--inspect` no contiene ninguna operación de aplicación, reset, limpieza ni seed**; el transporte SQL usado (`--transport=api`, Management API `/database/query`) solo recibió los 7 SELECT literales del script. La `service_role key` NO se transmite en este modo (el centinela REST — único uso de la key — está omitido por el propio guard en modo bootstrap; verificado líneas 240–246 del guard).

### 3.2 Identidad acreditada (evidencia, sin secretos)

1. **Management API (GET, solo lectura):** proyecto `id=lguovmvrozxgssupkwpf`, `name=CostproE2E`, `region=us-east-1`, `status=ACTIVE_HEALTHY` (no pausado), `created_at=2026-10-22T01:36:11Z` — coincide con el ref público documentado en `docs/e2e/E2E_AISLADO.md` §1 y `docs/e2e/CHECKLIST_PROPIETARIO_COSTPROE2E.md` §1, y con la identidad que exige el apilador (línea 221).
2. **Inventario de la cuenta (GET `/v1/projects`, solo lectura):** exactamente **2** proyectos visibles: `CostproBD` (`wthkddeleylijmonclxg`, producción — NO tocada, solo listada) y `CostproE2E` (`lguovmvrozxgssupkwpf`). No existe ningún otro proyecto con ese nombre ni ambigüedad de ref.
3. **Guard fail-closed ejecutado en cada operación:** `E2E_SUPABASE_URL=https://lguovmvrozxgssupkwpf.supabase.co` + `E2E_ALLOWED_REMOTE_REF=lguovmvrozxgssupkwpf` + `E2E_TARGET_KIND=project` (el veto de producción y la igualdad exacta de ref se validaron antes de cada conexión; el guard Caso A rechaza el host de producción sin conectar).
4. **Centinela en vivo:** `select public.e2e_is_isolated_db()` → **`true`** (dentro de `--inspect`). La base responde como la base aislada preparada.
5. El propio `--inspect` re-verificó la identidad por Management API antes de tocar la base: salida `OK identidad-management-api — nombre=CostproE2E ref=lguovmvrozxgssupkwpf region=us-east-1 estado=ACTIVE_HEALTHY`.

**Nota de transparencia sobre la key de servicio:** el requisito de `service_role` del apilador (línea 86) es una comprobación de presencia (no se transmite en `--inspect`, §3.1); en esta estación solo existe la key de producción en `.env` (fallback del script) y la key E2E real **no está disponible localmente** (PENDING_OWNER, §7). Ninguna escritura fue posible ni intentada. Para C2 la key E2E es imprescindible (§6.4).

---

## 4. Inspección remota de solo lectura — resultado

### 4.1 Estado general (salida del `--inspect` oficial, exit 0)

- `public`: **155 tablas**, **510 funciones**, centinela **true**.
- Extensiones: `btree_gist@1.7`, `pg_cron@1.6.4`, `pg_stat_statements@1.11`, `pgcrypto@1.3`, `plpgsql@1.0`, `supabase_vault@0.3.1`, `uuid-ossp@1.1` — las requeridas por el stream (E2E_AISLADO §14) están.
- Roles: incluye los 4 roles shim del bootstrap (`warehouse_staff`, `costpro_transaction_adjuster`, `costpro_snapshot_restorer`, `dashboard_user`) + roles de plataforma.
- Bucket `reports` presente y **privado** (`public=false`) — pre-tamo aplicado.
- Evidencia completa: `audit-evidence/INFRA-011/remote/preflight-002/inspect.json` (el histórico del 2026-10-22 en `remote/inspect.json` quedó intacto).

### 4.2 Registro `e2e_infra.e2e_migrations_replay_state` (87 filas)

| Estado | Filas | Detalle |
|---|---|---|
| `aplicada` | **82** | 1 `BASELINE:production-schema-snapshot-20260828.sql` (sha `1ed539ccc0dd7dd1…` = **coincide EXACTAMENTE** con `baseline.sha256_generado` del manifiesto vigente → el apilador omitirá el baseline por hash) + 10 `PRETAMO:*` (W7-RELEASE 01–09 + bucket reports) + **71 tramo** |
| `fallida` | 2 | Históricas del intento v1 (2026-10-22): `202401230002_update_rls_for_encargado.sql` y `20240801_create_inventory_adjustments.sql` — **ninguna pertenece al manifiesto actual** (excluidas documentadas); su presencia es registro histórico inerte |
| `limpiada_para_baseline` | 3 | Artefactos v1 purgados quirúrgicamente (`202401230001`, `20240325000000`, `20240725`) — idem, ajenas al manifiesto |

### 4.3 Divergencia manifiesto↔registro (criterio exacto del apilador, línea 444)

Comparación programática replicando `yaOk.get(nombre) === (sha256_generado || sha256_original)`:

- **71/93** registradas `aplicada` con sha **exactamente** igual al manifiesto → el apilador las omitirá (idempotencia por hash). **0 divergencias de hash** entre lo registrado y el manifiesto.
- **22 pendientes** (posiciones **72–93** completas). Listado exacto en la tabla del §6.3.
- Evidencia: `audit-evidence/INFRA-011/remote/preflight-002/divergencia-manifiesto-vs-remoto.json`.

### 4.4 Hallazgos sobre el estado real (el historial manual NO era prueba suficiente)

**H1 — La posición 72 nunca se aplicó pese a estar en el manifiesto anterior.** El manifiesto commiteado `c31c50a` (tramo 72, 2026-10-23T03:41Z) incluía `20261023000000_create_physical_inventory_module.sql`, pero el registro remoto termina en la posición 71: la última aplicación real fue el 2026-10-22T03:59Z (tramo 70) más una migración adicional. El expediente READINESS-001 contó «18 sin evidencia + 2 out-of-band» (20) desde el límite del manifiesto; la inspección real demuestra que **las pendientes son 22**, no 21/20 — el módulo de inventario físico, clave para los specs de inventario del smoke set, está entre ellas.

**H2 — Diez de las 22 pendientes tienen efectos YA presentes en remoto, sin registro.** Verificado por marcadores de versión in vivo (sondas SELECT puras, evidencia `sonda2-*`/`sonda3-*`):

| Pos | Migración | Efecto observado en remoto | Evidencia |
|---|---|---|---|
| 72 | `20261023000000_create_physical_inventory_module` | 5 tablas `physical_inventory*` con RLS activada, 4 triggers, funciones del módulo | sonda3 |
| 73 | `20261023230000…v2_24_0` | columna `transactions.cash_received_cup` (exclusiva de las pendientes 73–93) + cuerpo v2.24 | sonda2/3 |
| 74 | `20261024120000…v2_24_1` | marcadores `ERR_OVERPAYMENT_UNREGISTERED_CHANGE` (exclusivo v2.24.1) en `create_sale_v2` + `ERR_SHIFT_ALREADY_OPEN` en `open_cash_shift` | sonda3 |
| 84 | `20261026120000…` | 6 funciones versión final (H-7 + fix-b + ACL service_role-only), 3 policies, trigger activo — documentada por READINESS-001 | sonda1 |
| 85 | `20261026130000…` | guardas `ERR_PLATFORM_ROLE`/`ERR_SELF_ROLE_CHANGE` + ACL service_role-only en las 4 `managed_*` — documentada por READINESS-001 | sonda1 |
| 86 | `20261026140000…tenants_rls_platform_only` | policies de tenants exactamente `is_superadmin()`-only (insert/delete) y `is_superadmin() OR owner_id` (update) | sonda2 |
| 87 | `20261026150000_payment_tx_integrity` | tabla archivo presente, FK `payment_transactions_store_id_fkey` presente, 0 huérfanas | sonda2/3 |
| 88 | `20261026160000_superadmin_store_access` | policies `stores_tenant_*` con bypass `is_superadmin()` + `current_user_store_ids` con rama superadmin | sonda2 |
| 89 | `20261026170000…active_store_trigger` | `validate_active_store` con marcador «CP-ORG-001 ciclo 5» | sonda2 |
| 90 | `20261026180000…platform_acl_revoke` | `is_superadmin` sin anon; `enforce_membership_tenant_consistency` service_role-only — estado final exacto de esta migración | sonda1 |

Explicación coherente con los expedientes: la misión CP-ORG-001 validó **en vivo** contra CostproE2E su cadena completa (17/17 pruebas de guardas, 14/14 creación de organizaciones, 12/12 acceso superadmin — `docs/audits/CP_ORG_001_CIERRE_FINAL.md` §6/§8), y las migraciones 72–74 tienen sus propios expedientes de validación E2E (inventario físico y caja v2.24). READINESS-001 documentó solo 2 porque examinó evidencia de aplicación, no el estado remoto — que no pudo inspeccionar (sin credenciales). Esta misión confirma que el fenómeno out-of-band fue más amplio, **pero también que todos los efectos presentes corresponden a la versión FINAL de cada archivo** (marcadores de última versión verificados uno a uno, §5.3), por lo que el replay convergerá sin cambios netos.

**H3 — Discrepancia archivo de purga.** El encabezado de `20261026150000` declara «39 residuos análogos purgados»; la tabla `payment_transactions_purga_20261026_archive` remota contiene **2 filas** (el «escenario fiel» del propio expediente CP-ORG-001: tienda temporal → 2 pagos → 2 residuos → 2 archivadas + 2 purgadas). Los 39 residuos preexistentes fueron retirados manualmente ANTES del mecanismo de archivo (sin evidencia en tabla). Se documenta expresamente: la cifra del comentario NO es reproducible desde el estado remoto — motivo adicional para que el replay oficial registre cada aplicación.

**H4 — Residuales de datos de pruebas.** `public.profiles` tiene 78 filas: 1 `admin@demo.com`, **6** perfiles `superadmin` (5 adicionales creados por las validaciones in vivo), 44 sintéticos `e2e-%@costpro.test` (residuos de corridas fallidas del 2026-10-23 cuyo teardown no completó) y el resto cuentas de pruebas de otras misiones. **Ninguna migración pendiente los toca** (los DML de las 22 son los analizados en §5/§6.3); su limpieza es una decisión ajena a C2 (política de higiene del propietario).

---

## 5. Análisis obligatorio de las migraciones aplicadas fuera de banda

### 5.1 `20261026120000_organizaciones_superadmin_pertenencia_unica.sql` (pos 84)

Efectos de la re-aplicación **verificados contra el estado remoto actual** (no inferidos):

| Sentencia | Efecto de re-aplicar hoy | Verificación en vivo |
|---|---|---|
| 6 × `CREATE OR REPLACE FUNCTION` (`is_superadmin`, `is_admin`, `is_global_admin`, `is_admin_check`, `enforce_membership_tenant_consistency`, `assign_user_organization`) | Convergente: reemplaza por la versión certificada vigente | remoto YA en versión final: H-7 (`auth.role()='service_role'`) ✓, fix-b (`tenant_id = p_tenant_id` SIEMPRE) ✓, `is_admin` incluye superadmin ✓ |
| 3 × `DROP POLICY IF EXISTS` + `CREATE POLICY` (tenants×2, stores) | Convergente | las 3 policies presentes con la expresión esperada |
| `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` | Convergente | `trg_membership_tenant_consistency` activo (`tgenabled='O'`) |
| `UPDATE profiles SET role='superadmin' … WHERE email='admin@demo.com' AND role='admin'` | **0 filas** (guard `AND role='admin'`; el perfil YA es superadmin) | perfil existe: `role='superadmin'`, `store_id=NULL`, `active_store_id=NULL`, activo, no borrado → 0 filas, **y 0 filas NO es error SQL** |
| `DELETE FROM user_store_memberships … WHERE p.email='admin@demo.com' AND p.role='superadmin'` | **0 filas** | **0 membresías** para esa cuenta (consulta directa) → nada que perder; los fixtures usan `e2e-*@costpro.test` (censo: 44 sintéticos) |
| `REVOKE`/`GRANT` `assign_user_organization` → service_role-only | No-op convergente | remoto: `anon=false, authenticated=false, service_role=true` ✓ |

**Respuesta a las preguntas del mandato:** (a) el `UPDATE` es un no-op guardado (0 filas hoy); (b) el `DELETE` elimina 0 membresías — **no existen usuarios ni fixtures afectados**; (c) funciones/policies/trigger reemplazados convergen a idéntico estado actual; (d) **re-aplicar no pierde dato alguno que deba conservarse** — el estado objetivo de CP-ORG-001 (superadmin sin membresías) ya está logrado y se preserva. La verificación de solo lectura necesaria que pedía RECONCILE-001 (incertidumbre 2) **quedó ejecutada y resuelta**.

### 5.2 `20261026130000_cp_org001_platform_role_guards.sql` (pos 85)

- Contenido: 4 × `CREATE OR REPLACE FUNCTION` (`managed_update_user`, `managed_toggle_user_status`, `managed_soft_delete_user`, `managed_reset_password`) + 4 × `REVOKE` (PUBLIC/anon/authenticated) + 4 × `GRANT` (service_role) + 4 × `COMMENT`.
- **Cero DML de nivel superior** (los `UPDATE`/`INSERT` viven dentro de los cuerpos y solo ejecutan al invocarse — distinción DDL↔DML verificada).
- Estado remoto en vivo: los 4 cuerpos ya contienen las guardas finales (`ERR_PLATFORM_ACCOUNT_PROTECTED`, `ERR_PLATFORM_ROLE`, `ERR_SELF_ROLE_CHANGE`) y las 4 ACLs ya son `service_role`-only (`anon=false, authenticated=false, service_role=true` en las 10 funciones sondeadas).
- **Idempotencia del DDL = convergencia de funciones/permisos = efectos DML sobre datos existentes: ninguno. Re-aplicación 100 % segura.**

### 5.3 Las otras ocho con efectos presentes (72, 73, 74, 86, 87, 88, 89, 90)

Verificación patrón a patrón (sin asumir idempotencia por `IF EXISTS`):

| Pos | Patrón de idempotencia verificado | DML top-level |
|---|---|---|
| 72 | `CREATE TABLE IF NOT EXISTS` (5) + `DROP/CREATE TRIGGER IF EXISTS` (4, con drop previo) + `DROP/CREATE POLICY` + `CREATE OR REPLACE FUNCTION` + `ALTER` idempotentes | **0** |
| 73 | `add column if not exists` + `drop constraint if exists`→`add constraint` (patrón drop→add, 2 constraints) + `CREATE OR REPLACE` | 0 |
| 74 | Solo `CREATE OR REPLACE` (5 funciones) | 0 |
| 86 | `DROP POLICY IF EXISTS`+`CREATE` (3) + DO de verificación (read-only) | 0 |
| 87 | `CREATE TABLE IF NOT EXISTS` + INSERT archivo `NOT EXISTS by id` + DELETE solo huérfanas archivadas + FK en DO con `IF NOT EXISTS` + DO verificación | **Archivo+purga: HOY 0 huérfanas → 0 archivadas, 0 purgadas** (estado ya convergido; FK impide nuevas huérfanas) |
| 88 | `CREATE OR REPLACE` + `DROP/CREATE POLICY` (3) | 0 |
| 89 | `CREATE OR REPLACE` + DO verificación | 0 |
| 90 | `BEGIN; REVOKE…; GRANT…; COMMIT;` — ACL pura | 0 |

Además: la sobrecarga `create_sale_v2` v2.24.1 presente en remoto **coincide firma a firma** con el `DROP FUNCTION IF EXISTS` de `20261025120000` (pos 80) → el replay ejecutará la migración de firma v2.24.1→v2.25 limpiamente, sin dejar sobrecargas huérfanas.

---

## 6. Plan exacto y orden de replay propuesto (C2 — NO ejecutado en esta misión)

### 6.1 Funcionamiento del apilador (leído íntegro, con líneas)

| Mecanismo | Implementación |
|---|---|
| Valida la identidad | Precondiciones sin red (líneas 79–94: veto de producción línea 85, igualdad exacta URL↔allowlist línea 94) → `verifyProjectName()` Management API con `name==='CostproE2E'` (143–150, 218–223) → guard `assertIsolatedDb` (227; bootstrap durante el replay porque el centinela se instala al final §3, guard NORMAL como verificación final línea 475–476) |
| Compara hashes | baseline: sha256 de la capa vs `manifest.baseline.sha256_generado` (381); por migración: sha256 del archivo vs `sha256_generado||sha256_original` (447–449); **deriva = abort** |
| Detecta aplicadas | Lee `e2e_infra.e2e_migrations_replay_state` (374) y construye `yaOk` solo con `estado='aplicada'` (375) |
| Maneja las no registradas | Ausentes del registro ⇒ **las aplica** (443–451) — es exactamente lo deseado: normaliza + registra las 10 out-of-band y las 12 restantes; el diseño idempotente por hash evita re-aplicar las 71 ya registradas |
| Ordena | baseline → pre-tamo (por `orden`) → tramo por `posicion` ascendente (368, 421, 443) = orden lexicográfico del runner oficial |
| Aborta ante discrepancias | Fallo SQL: `markState fallida` + throw (452–456); baseline por lotes transaccionales: fallo = rollback del lote + `BASELINE:progress` para reanudar (404–410); identidad no concluyente: throw sin escrituras (223); deriva de hash: fatal (381, 426, 449) |
| Registra el resultado | `markState('aplicada', sha, posicion)` por archivo (458), progreso por lote (412), evidencia JSON local (536/542); centinela sección C + verificación REST con service key + guard normal final (466–477) |

### 6.2 Alcance exacto de la corrida C2

- Baseline: **omitida** (registrada con sha exacto al manifiesto vigente).
- Pre-tamo: **omitido** (10/10 registradas).
- Tramo: **exactamente 22 migraciones** (posiciones 72–93), una a una, parada al primer error.
- Estado final esperado del registro: 71+22=93 `aplicada` + baseline + pre-tamo; centinela re-instalado (sección C) y guard normal verde.

### 6.3 Tabla de las 22 pendientes (plan de replay)

«Registrado» = fila `aplicada` en `e2e_infra.e2e_migrations_replay_state` (todas: NO). «Remoto» = efecto verificado en vivo (§4.4/§5).

| Pos | Migración (bytes, sha256-16) | Registrado | Remoto comprobado | Efectos relevantes al aplicar | Dependencia | Recomendación |
|---|---|---|---|---|---|---|
| 72 | `20261023000000_create_physical_inventory_module.sql` (66267, `fd483761397c…`) | NO | **Efectos ya presentes** (5 tablas+RLS+4 triggers+fn) | DDL convergente (IF NOT EXISTS / drop→create); 0 DML | objetos pre-baseline | Aplicar (normaliza+registra) |
| 73 | `20261023230000…v2_24_0.sql` (115084, `e36ecb55ce8d…`) | NO | **Efectos presentes** (columnas + fn v2.24) | ALTERs `if not exists`; constraints drop→add; CREATE OR REPLACE | pre-baseline (caja) | Aplicar (convergente) |
| 74 | `20261024120000…v2_24_1.sql` (106477, `df7a1f3725d6…`) | NO | **Presente** (marcadores v2.24.1) | 5× CREATE OR REPLACE | 73 | Aplicar (convergente) |
| 75 | `20261024150000…v2_25_0.sql` (62697, `0c4970220cb0…`) | NO | **Ausente** (sin marca `p_payment_components`) | Reescribe `create_sale_v2` a v2.25 (+sobrecarga nueva) | 73/74 | Aplicar (primera aplicación) |
| 76 | `20261024180000_auditoria_caja….sql` (22218, `8a616b5bbeaf…`) | NO | Indeterminado (sin marcador único) | CREATE OR REPLACE `create_cash_flow_document` | 73/74 | Aplicar (convergente por OR REPLACE) |
| 77 | `20261024220000_saldo_fisico….sql` (30852, `bf0c0d280917…`) | NO | Indeterminado | CREATE OR REPLACE ×2 | 76 | Aplicar (convergente) |
| 78 | `20261024230000_devoluciones_reembolso….sql` (27052, `9428ec2d51c6…`) | NO | Indeterminado | CREATE OR REPLACE `create_devolution_v2` | 73 | Aplicar (convergente) |
| 79 | `20261024400000_devoluciones_recuperacion_reversa.sql` (125067, `6154bdf96e4b…`) | NO | **Ausente** (sin `ERR_DEVOLUTION_ALREADY_RECOVERED`) | 10 fn; `DROP FUNCTION IF EXISTS reverse_devolution(uuid,text,uuid)` (migración de firma documentada) | 78 | Aplicar (primera aplicación) |
| 80 | `20261025120000_cp_money_002_postmerge….sql` (68093, `4f5303867b68…`) | NO | **Ausente** (sobrecarga v2.25 inexistente) | `DROP` de la sobrecarga v2.24.1 (firma coincide EXACTAMENTE con el remoto, §5.3) + CREATE v2.25 | 75 | Aplicar (primera aplicación) |
| 81 | `20261025130000_cp_money_002_acl_revoke_anon.sql` (5853, `d796f70c3d47…`) | NO | No aplicado (anon activo en fn caja) | REVOKE/GRANT puros sobre la sobrecarga v2.25 (existirá tras pos 75/80) | 75 | Aplicar (primera aplicación) |
| 82 | `20261026000000_caja_serializacion….sql` (101185, `756ce7b5c196…`) | NO | **Ausente** (sin `ERR_COMMISSION_STATE_CHANGED`) | 8 fn (incl. `pay_commission`, `register_cash_adjustment` — **no existen aún en remoto**) | 73–79 | Aplicar (primera aplicación) |
| 83 | `20261026100000_caja_acl_anon_revoke.sql` (3223, `24ea442ef06f…`) | NO | No aplicado (anon mixto en caja) | REVOKE/GRANT puros | 79/82 | Aplicar (primera aplicación) |
| 84 | `20261026120000_organizaciones….sql` (15968, `5cc60a88dc32…`) | NO | **Presente, versión final** | §5.1: UPDATE/DELETE → **0 filas verificado**; funciones/policies/trigger convergentes | pre-baseline | Aplicar (convergente, registra) |
| 85 | `20261026130000…platform_role_guards.sql` (16785, `431768e3d8ac…`) | NO | **Presente, versión final** | §5.2: 0 DML; ACL convergente | 84 | Aplicar (convergente) |
| 86 | `20261026140000…tenants_rls_platform_only.sql` (4165, `5e32bfac5674…`) | NO | **Presente** (policies exactas) | DROP/CREATE policies + DO verificación | 84 | Aplicar (convergente) |
| 87 | `20261026150000_payment_tx_integrity.sql` (7608, `548c874b8ce8…`) | NO | **Presente** (archivo 2 filas, FK, 0 huérfanas) | Archivo+purga: **hoy 0 huérfanas → 0/0 filas**; FK idempotente; DO exige 0 residuos | pre-baseline | Aplicar (convergente; el DO es la prueba) |
| 88 | `20261026160000_superadmin_store_access.sql` (4556, `66fdf5f9c73e…`) | NO | **Presente** (policies + `current_user_store_ids`) | CREATE OR REPLACE + 3 policies drop→create | 84 | Aplicar (convergente) |
| 89 | `20261026170000…active_store_trigger.sql` (6123, `d41d97464725…`) | NO | **Presente** (marcador c5) | CREATE OR REPLACE + DO verificación | 88 | Aplicar (convergente) |
| 90 | `20261026180000…platform_acl_revoke.sql` (2979, `3fd5dc19cc24…`) | NO | **Presente** (ACL exacta) | REVOKE/GRANT puros | 84/85 | Aplicar (convergente) |
| 91 | `20261026200000_efectivo_fisico_disponibilidad.sql` (24760, `2fcd6decf0c8…`) | NO | **Ausente** (sin `physical_cash`) | CREATE OR REPLACE ×2 | 73–82 | Aplicar (primera aplicación) |
| 92 | `20261026210000…bootstrap_tenant_admin.sql` (9704, `13f339d72044…`) | NO | **Ausente** (gate fase 2 no presente) | CREATE OR REPLACE `create_store_with_membership` | pre-baseline | Aplicar (primera aplicación) |
| 93 | `20261027000000_inteligencia_diviza_source.sql` (95833, `b77a9cecd2fd…`) | NO | **Ausente** (fn `get_cash_balances_by_currency` inexistente) | CREATE OR REPLACE ×4 (IC-DIVIZA) | 73–82 | Aplicar (primera aplicación) |

**Orden propuesto:** el del propio apilador (lexicográfico 72→93) — es además el orden en que se escribieron las dependencias (75 antes de 81; 73/74 antes de 75/80; 84–90 en cadena). **No se propone alterar el orden ni saltar archivos**: el apilador aplica la secuencia completa y registra cada paso.

### 6.4 Requisitos previos de C2 (no disponibles en esta estación)

1. **Autorización expresa del propietario** (escritura sobre CostproE2E) — este expediente NO la concede.
2. **`E2E_SUPABASE_SERVICE_ROLE_KEY`** (y `E2E_SUPABASE_ANON_KEY` para CI): el apilador la usa para el centinela REST final (línea 468–473) y C3 (`--verify`/`--contract`, guard normal). En remoto la cuenta existe; localmente NO hay key E2E (solo la de producción en `.env`, que el guard Caso A mantiene lejos de E2E). **PENDING_OWNER**: gestor de contraseñas o ejecución desde el entorno del propietario (CHECKLIST §8: re-ejecuciones corren por cuenta del propietario).
3. `SUPABASE_ACCESS_TOKEN` ya demostrado operativo (transporte api + identidad Management API verificados en esta misión).
4. Recomendación vigente READINESS-001 §7.3: proteger el entorno `e2e-isolated` (required reviewers + rama `main`) ANTES de la fase de ejecución.

### 6.5 Plan de verificación post-C2 (C3 — no ejecutado)

`--verify` (esperado `PREPARADA`: centinela true, baseline sha exacto, 93/93 `aplicada`, 8 tablas esenciales, RLS >100) → `--contract` contra `supabase/security-contract/contract-surface.sql` **vigente (153 fn tras IC-DIVIZA)** — el 137/137 de 2026-10-22 es histórico y NO sirve como referencia de cierre (RECONCILE-001 §5.3) → commitear evidencia en `audit-evidence/INFRA-011/remote/`. Después C4 (re-verificación pre-corrida automática del workflow) y solo entonces plantear la corrida E2E (READINESS-001 §7.2).

---

## 7. Comprobaciones que faltan y limitaciones de evidencia

1. **Versión exacta en remoto de 76/77/78:** sin marcador único verificable (versiones intermedias de la cadena caja); se resuelve por convergencia `CREATE OR REPLACE` en C2 — el estado final es idéntico sea cual sea la versión intermedia presente. No bloquea.
2. **Centinela vía REST con service key:** NO re-verificado (key E2E no disponible localmente); verificado vía SQL directo (`select public.e2e_is_isolated_db()` → true). La verificación REST la ejecutará el apilador al final de C2 y el workflow en cada corrida (C4).
3. **`--verify`/`--contract` NO ejecutados** (C3, requieren guard normal + key E2E): postergados con plan exacto (§6.5).
4. **La cifra «39 purgados» del encabezado de pos 87 no es reproducible** desde la tabla de archivo (2 filas) — documentado como H3; los 39 residuos previos se retiraron manualmente sin archivo. La re-aplicación registrada elimina esta clase de opacidad.
5. **Residuales sintéticos (44 perfiles `e2e-%`) y 5 superadmins de pruebas:** no tocados por C2 (ningún DML pendiente los alcanza); política de higiene pendiente del propietario, sin impacto en el smoke set (identidad sintética por corrida, READINESS §3.6).
6. **`assert-isolated-db.cjs`** espejo CJS: no re-auditado en esta misión (71 pruebas de paridad ya certificadas por READINESS-001 Fase A; sin cambios en `main` desde entonces en ese archivo — verificado `git log` sin commits posteriores).
7. La inspección depende de la verdad del Management API y del registro remoto en el instante 2026-10-26T00:48Z; C4 re-verifica todo pre-corrida por diseño.

---

## 8. Dictamen

**A — LISTO PARA SOLICITAR AUTORIZACIÓN DE REPLAY.**

Justificación contra los cuatro requisitos del mandato:

1. **Destino aislado demostrado:** identidad Management API inequívoca (nombre + ref exacto + región + fecha de creación), guard fail-closed verificado en código y ejecutado en cada operación, centinela true en vivo, inventario de 2 proyectos sin ambigüedad, veto de producción activo. No se operó con identidades inferidas por nombre parcial ni configuración histórica.
2. **Integridad del manifiesto demostrada:** PR #1501 fusionado; `--check` MATCH exit 0 sobre `main` vigente `9aa6e1f65`; tramo 93 verbatim certificado por RECONCILE-001.
3. **Identidad del estado remoto establecida por censo completo:** 71 aplicadas con hash exacto, 22 pendientes enumeradas una a una con su estado remoto real (10 con efectos presentes, 7 ausentes confirmadas, 3 intermedias indeterminadas, 2 ACL puras no aplicadas) — incluida la detección de que las out-of-band reales son 10, no 2, y que la posición 72 (inventario físico) jamás se aplicó.
4. **Alcance de todas las operaciones pendientes acotado:** tabla §6.3 con efectos, dependencias y recomendación por archivo; los únicos DML con posible efecto sobre datos (pos 84 UPDATE/DELETE y pos 87 archivo/purga) verificados **0 filas** contra el estado actual; ningún `DROP TABLE`/`TRUNCATE`/borrado no acotado en las 22; migración de firma `create_sale_v2` verificada firma a firma. Existe plan para conservar los datos que deban mantenerse (fixtures sintéticos intactos; 0 membresías de la cuenta demo) y plan de verificación (C3/C4, §6.5).

**ADVERTENCIA EXPLÍCITA (mandato §6):** este dictamen A **NO autoriza la escritura**. La aplicación del replay (C2) requiere autorización expresa e independiente del propietario, junto con la `E2E_SUPABASE_SERVICE_ROLE_KEY` (§6.4). La ejecución E2E permanece bloqueada hasta C1–C4 demostradas (C1 ✓; C2–C4 pendientes).

---

## 9. Separación explícita: inspección realizada vs. operaciones NO autorizadas

| Categoría | Estado en esta misión |
|---|---|
| Inspección solo lectura (Management API + `--inspect` + sondas SELECT) | ✅ Ejecutada (evidencia versionada) |
| Regeneración/verificación estática del manifiesto (`--check`) | ✅ Ejecutada (sin BD) |
| `--apply-replay` / `--bootstrap` / reset / seed / limpieza / `db push` | ⛔ **NO ejecutados — requieren autorización del propietario (C2)** |
| `--verify` / `--contract` | ⛔ NO ejecutados (C3; solo lectura pero requieren key E2E — plan §6.5) |
| Workflow E2E / Playwright / `workflow_dispatch` | ⛔ NO ejecutados (bloqueado hasta C1–C4) |
| Fusión de PRs / cambios de código / producción / secretos / protecciones | ⛔ Ninguno |

---

## 10. Tabla de control (mandato → resultado)

| # | Control del mandato | Resultado | Evidencia |
|---|---|---|---|
| 1 | Estado real de PR #1501 + SHAs | ✅ Fusionado; main `9aa6e1f65`; head `cd167a67c` | §2.1 |
| 2 | Manifiesto + expediente presentes en main | ✅ 93/508, digest y sha exactos | §2.2 |
| 3 | `--check` = MATCH, exit 0 | ✅ | §2.3 |
| 4 | Leer E2E_AISLADO + CHECKLIST + READINESS-001 | ✅ Íntegros (antes de conectar) | §3 |
| 5 | Confirmar `--inspect` solo lectura por implementación | ✅ Trazado completo de código, precondiciones fail-closed | §3.1 |
| 6 | Conexión exclusiva a CostproE2E; identidad permitida | ✅ Guard + Management API + centinela; producción vetada sin conectar | §3.2 |
| 7 | Inspección sin operaciones de escritura | ✅ Solo SELECT; 0 escrituras remotas | §4, §1 |
| 8 | Registro legible y coherente | ✅ 87 filas censadas y clasificadas | §4.2 |
| 9 | Migraciones registradas/no registradas | ✅ 71 registradas hash-exacto; 22 no registradas con estado remoto comprobado | §4.3–4.4 |
| 10 | Divergencias remotas vs manifiesto | ✅ 22 pendientes; 0 conflictos de hash; hallazgos H1–H4 | §4.3–4.4 |
| 11 | Análisis `20261026120000` (UPDATE/DELETE/funciones/trigger/datos) | ✅ 0 filas verificado in vivo; versión final confirmada | §5.1 |
| 12 | Análisis `20261026130000` (funciones/privilegios/ACL) | ✅ 0 DML; ACL final confirmada | §5.2 |
| 13 | Distinguir idempotencia DDL / convergencia / efectos DML / seguridad de re-ejecución | ✅ Por archivo, patrón a patrón (§5.3, §6.3) | §5–6 |
| 14 | No concluir seguridad solo por `CREATE OR REPLACE`/`IF EXISTS` | ✅ Efectos verificados contra el estado remoto real | §5 |
| 15 | No ocultar out-of-band en el registro | ✅ Registro intacto; las 10 detectadas quedan documentadas, no maquilladas | §4.4 |
| 16 | Plan de replay sin ejecutarlo + tabla por migración | ✅ 22 filas con hash/estado/efectos/dependencia/recomendación | §6 |
| 17 | Prohibidos no ejecutados (apply/reset/verify/contract/push/E2E) | ✅ Ninguno | §1, §9 |
| 18 | Dictamen A/B/C explícito | ✅ **A** con justificación y advertencia de no-autorización | §8 |
| 19 | Expediente documental, rama exclusiva, PR abierto sin fusionar | ✅ Este PR | — |

---

## 11. Respuestas explícitas al informe final del mandato

1. **¿Está C1 integrado y confirmado en `main`?** **SÍ.** PR #1501 fusionado (merge `9aa6e1f65` = `main` vigente, sin commits posteriores); manifiesto 93/508 presente con digest `0f2599e1…`.
2. **¿El manifiesto pasa `--check`?** **SÍ: `MATCH (sin deriva)`, exit 0** sobre `main`.
3. **¿Se verificó de forma inequívoca el destino CostproE2E?** **SÍ:** Management API (nombre+ref exacto+región), guard fail-closed en cada operación, centinela `e2e_is_isolated_db()=true` en vivo, inventario de exactamente 2 proyectos. Producción vetada por el guard sin conectar en ningún momento.
4. **¿Qué migraciones aparecen pendientes de registro?** **22** (posiciones 72–93, §6.3). De ellas, **10 tienen efectos ya presentes sin registro** (72, 73, 74, 84, 85, 86, 87, 88, 89, 90 — las 2 documentadas por READINESS-001 más 8 detectadas por esta inspección), 7 ausentes confirmadas (75, 79, 80, 82, 91, 92, 93), 3 intermedias indeterminadas (76, 77, 78) y 2 ACL puras no aplicadas (81, 83). Incluye el hallazgo de que la **posición 72 (inventario físico) nunca se aplicó**, pese a figurar en el manifiesto anterior.
5. **¿Efectos potenciales de re-ejecutar `20261026120000` y `20261026130000`?** **Ninguno sobre datos**: el UPDATE afecta 0 filas (perfil ya `superadmin`; guard `AND role='admin'`), el DELETE afecta **0 filas** (0 membresías verificadas), y `20261026130000` no tiene DML top-level. Ambos convergen funciones/policies/trigger/ACL a la versión certificada vigente — confirmada como la ya presente. Ambas quedan además **registradas** tras el replay.
6. **¿Se ejecutó alguna escritura, migración, reset, seed o prueba E2E?** **NO.** (§1, §9 — solo SELECT remotos; el único efecto persistente es este expediente y su evidencia.)
7. **¿Se recomienda solicitar autorización para C2 o bloquear por incertidumbre?** **Se recomienda SOLICITAR AUTORIZACIÓN DE REPLAY (dictamen A)**: todas las incertidumbres de RECONCILE-001 quedaron resueltas con verificación en vivo, y las nuevas detectadas (10 out-of-band, posición 72 pendiente, archivo 2-vs-39) están acotadas, documentadas y gestionadas por el propio diseño convergente del apilador.
8. **¿Condiciones exactas antes de autorizar el replay?** (a) Orden expresa del propietario para C2 (escritura); (b) `E2E_SUPABASE_SERVICE_ROLE_KEY` del proyecto aislado (PENDING_OWNER — necesaria para el centinela REST final del apilador y para C3); (c) ejecución con el procedimiento oficial `--inspect` → `--apply-replay` → `--verify` → `--contract` (E2E_AISLADO §6) desde el entorno del propietario o con credenciales provistas; (d) commitear la evidencia de C3; (e) recomendación: activar protección del entorno `e2e-isolated` (required reviewers + `main`) antes de la fase de corrida; (f) la corrida E2E sigue bloqueada hasta C1–C4 demostradas y NO queda autorizada por este expediente.

**Archivos examinados:** `scripts/e2e/reset-remote-e2e-db.mjs` (545L íntegro), `e2e/fixtures/assert-isolated-db.ts` (258L íntegro), `scripts/e2e/build-migrations-replay.mjs` (verificado en RECONCILE-001; re-ejecutado `--check` aquí), `audit-evidence/INFRA-011/e2e-migrations-manifest.json` (íntegro), las 22 migraciones pendientes de `supabase/migrations/` (censo estático completo; lectura íntegra de 20261026120000, 20261026130000, 20261026140000, 20261026150000, 20261026160000, 20261026170000, 20261026180000; censos dirigidos del resto), `docs/e2e/E2E_AISLADO.md`, `docs/e2e/CHECKLIST_PROPIETARIO_COSTPROE2E.md`, `docs/audits/CP_E2E_READINESS_001_COSTPROE2E.md`, `docs/audits/CP_E2E_RECONCILE_001_MANIFEST.md`, `docs/audits/CP_ORG_001_CIERRE_FINAL.md` (§§ relevantes), baseline `production-schema-snapshot-20260828.sql` (grep de pertenencia de objetos).

**Comandos ejecutados:** git local (estado, fetch ff-only, rama) · GitHub API read-only (PR #1501, `main`) · `node scripts/e2e/build-migrations-replay.mjs --check` (MATCH exit 0) · Management API GET (`/v1/projects`, `/v1/projects/{ref}`) · `node scripts/e2e/reset-remote-e2e-db.mjs --inspect --i-understand-this-is-destructive --evidence-out=…/preflight-002` (exit 0) · 3 sondas SELECT puras (fail-closed, scripts `reconcile002_*.py` en `/home/z/my-project/scripts/`, persistidos) · análisis estático local (censo, diffs de versión, baseline grep).

**Evidencia versionada en este PR:** `audit-evidence/INFRA-011/remote/preflight-002/` — `inspect.json` (estado oficial), `divergencia-manifiesto-vs-remoto.json`, `verificacion-suplementaria-read-only.json`, `sonda2-efectos-pendientes-en-remoto.json`, `sonda3-cierre-inventario.json`. Sin credenciales (sanitizado por diseño + revisado).

