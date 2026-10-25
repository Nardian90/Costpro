# CP-E2E-READINESS-001 — Auditoría y certificación de preparación E2E sobre la base aislada CostproE2E

> **Fecha:** 2026-10-26 (America/Havana) · **Rama auditada:** `main` · **SHA auditado:** `fd73e3edbbd6e693665e74ebab5446f7452ec6fb` (= `origin/main`, árbol limpio)
> **Rama de auditoría:** `docs/cp-e2e-readiness-001-20261026` (expediente documental exclusivo)
> **Alcance:** determinar si COSTPRO 4 Multitienda está preparado para ejecutar su batería E2E **exclusivamente** contra la base aislada **CostproE2E**. **La batería E2E NO se ejecutó en esta misión** (§1).
> **Dictamen global:** **APTO CONDICIONADO** (§9) — sin ruta ejecutable hacia producción (demostrado), pero con 4 condiciones previas (C1–C4) que DEBEN resolverse y demostrarse antes de la corrida.

---

## 0. Resumen ejecutivo

| Dimensión | Resultado | Evidencia clave |
|---|---|---|
| Identidad del destino efectivo | ✅ Acreditada por cadena fail-closed + corrida verde | `verify-remote-e2e` en CI verde 2026-10-22: `ref=*** verificado, centinela=true, REST 200`; 4 secretos del entorno `e2e-isolated` presentes desde 2026-10-22 |
| Rutas de fallback a producción | ✅ Ninguna ejecutable | Guard Caso A rechaza producción **sin conectar**; CI sin `.env`; alias de workflow = mismos secretos |
| Esquema/migraciones | ❌ **DERIVA** | `build-migrations-replay.mjs --check` → `DERIVA DETECTADA`, exit 1 (reproducido en esta auditoría sobre `fd73e3e`); 18 migraciones sin evidencia de aplicación |
| Ejecutabilidad de la batería hoy | ❌ Bloqueada por diseño fail-closed | El workflow abortaría en el paso 2 («Verificar determinismo»), antes de tocar la BD o ejecutar un test |
| Efectos externos | ✅ Controlados | Smoke set sin llamadas externas (grep); sin credenciales externas en el runner; artefactos opt-in |
| Dictamen | **APTO CONDICIONADO** | La identidad y el aislamiento están probados y son reverificables pre-corrida; el esquema quedó desalineado de `main` tras el 2026-10-23 y la corrección es un procedimiento oficial, concreto y ya ejecutado una vez (C1–C4, §7) |

**Consecuencia práctica:** la única corrida verde documentada (2026-10-22, 45 passed / 0 failed / 1 skipped, 1.6 min) demostró el funcionamiento íntegro de la cadena con código y esquema alineados. Desde el 2026-10-23, `main` incorporó 20 migraciones SQL nuevas sin que exista evidencia de aplicación en la base aislada (salvo 2 aplicadas fuera de banda), y el gate de determinismo bloquea toda corrida. **La segunda fase (ejecución) NO queda autorizada por esta auditoría** hasta demostrar C1–C4 (§7.1).

---

## 1. Reglas respetadas — lo que NO se ejecutó

Garantías verificables de esta misión (preguntas 1–3 del §10 del mandato):

1. **NO se ejecutó ninguna prueba E2E.** No se lanzó Playwright, ningún `.spec.ts`, ningún `workflow_dispatch`, ningún flujo de autenticación E2E ni comando que pudiera activar la batería. Verificación: los únicos comandos ejecutados contra el repo fueron lecturas (`git`, `rg`, `ls`, `sed`), consultas de solo lectura a la API de GitHub (estado, PRs, entornos, historial de corridas y sus logs ya existentes) y un chequeo **estático** documentado en §4.2.
2. **NO se escribió ni alteró ningún dato de CostproE2E.** No hubo ninguna conexión a la base aislada: este entorno no posee credenciales E2E localmente (§3.5) y la misión no solicitó el `SUPABASE_ACCESS_TOKEN` del apilador.
3. **NO se ejecutó ninguna migración, reset, seed ni limpieza.** El único script de pipeline ejecutado fue `scripts/e2e/build-migrations-replay.mjs --check`, que escribe **exclusivamente en un directorio temporal** (`fs.mkdtempSync(os.tmpdir())`, línea 301) y no abre conexiones de red ni de BD (leído y verificado íntegro).

Además: no se detuvo/reinició ningún servicio compartido, no se modificó código funcional, no se fusionó ningún PR y ningún secreto se imprimió (los nombres lógicos sí; los valores nunca).

---

## 2. Contexto histórico consultedo

- **CP-INFRA-011** (2026-10-22): construcción de la base aislada CostproE2E y del pipeline manual fail-closed. Documentación normativa: `docs/e2e/E2E_AISLADO.md` + `docs/e2e/CHECKLIST_PROPIETARIO_COSTPROE2E.md`; evidencia versionada: `audit-evidence/INFRA-011/` (manifiesto de migraciones, `remote/apply-replay.json`, `remote/verify.json`, `remote/contract.json`).
- **Incidente de contaminación (2026-10-09):** los E2E que compartían el proyecto de producción crearon 48 tiendas + 26 usuarios + 6 tenants. El job E2E de `ci.yml` quedó `if: false` con veto del propietario (verificado intacto: `.github/workflows/ci.yml:68-75`, comentario ⛔ «NO ELIMINAR ESTE BLOQUE»). Expedientes: `docs/audits/e2e-contamination-cleanup-20261009.md`, `E2E-DATA-HYGIENE.md`, `E2E-RESOURCE-LIFECYCLE-REMEDIATION.md`, `E2E-DATA-CLEANUP-INVENTORY.md`, `E2E-FIXTURE-REUSE-TRIGGER-INVESTIGATION.md`, `E2E-INCREMENTAL-STABILIZATION.md`.
- **FASE E2E-80** (2026-09-27, `E2E-COVERAGE-REPORT.md`): cobertura de escenarios 88.3 % (113/128; P0 96.2 %, P0+P1 90.8 %), 15 escenarios no automatizados con justificación. Denominador oficial: `e2e/SCENARIO-INVENTORY.md`.
- **Misiones posteriores con escrituras aisladas documentadas:** CP-ORG-001 (2026-10-25/26) aplicó fuera de banda a CostproE2E las migraciones `20261026120000` (versión corregida) y `20261026130000`, validadas con 17/17 pruebas in vivo (worklog multiagente, Task ID CP-ORG-001). Ninguna otra misión registra aplicación E2E posterior.

---

## 3. Fase A — Identidad y aislamiento de CostproE2E

### 3.1 El destino efectivo y sus variables (precedencias)

| Variable lógica | Ámbito | Quén la fija | Efecto |
|---|---|---|---|
| `E2E_SUPABASE_URL` | GitHub env `e2e-isolated` | Propietario (secreto) | URL del proyecto apuntado por el runner y por la app en CI |
| `E2E_SUPABASE_ANON_KEY` | ídem | Propietario (secreto) | Anon key del proyecto aislado |
| `E2E_SUPABASE_SERVICE_ROLE_KEY` | ídem | Propietario (secreto) | Solo server-side (global-setup/fixtures/teardown) |
| `E2E_ALLOWED_REMOTE_REF` | ídem | Propietario (secreto) | Ref EXACTO exigido por igualdad contra la URL |
| `E2E_TARGET_KIND` | Workflow (fija `'project'`) | Versionado | Valor exacto validado por el guard |
| `E2E_ISOLATION` / `E2E_SKIP_PROTECTED_GUARD` | Workflow (`'1'`/`'1'`) | Versionado | Modo aislado por corrida; escape documentado del guard de protegidos |

El workflow (`e2e-isolated.yml:83-85`) aliasa `NEXT_PUBLIC_SUPABASE_URL/ANON` y `SUPABASE_SERVICE_ROLE_KEY` a los mismos secretos — **una sola fuente de verdad**: la app compilada en CI y los fixtures apuntan exactamente al mismo proyecto. `playwright.config.ts:6` carga `./.env` vía dotenv, pero en el checkout de CI **no existe `.env`** (gitignored) y dotenv no sobreescribe variables ya presentes.

### 3.2 Cadena de verificación de identidad (fail-closed, 4 capas)

Leídas íntegras y verificadas símbolo a símbolo:

1. **`scripts/e2e/check-e2e-config.mjs`** (61 líneas): exige los 4 nombres lógicos, `E2E_TARGET_KIND='project'` exacto, y **aborta** si `E2E_SUPABASE_URL` o `E2E_ALLOWED_REMOTE_REF` conteniene el ref de producción `wthkddeleylijmonclxg` (hardcoded, líneas 34-42). Imprime solo nombres, jamás valores.
2. **`scripts/e2e/build-migrations-replay.mjs --check`** (gate de determinismo, §4.2).
3. **`scripts/e2e/verify-remote-e2e.mjs`** (47 líneas): extrae el ref de la URL y exige **igualdad exacta** con `E2E_ALLOWED_REMOTE_REF` (sin comparaciones parciales), veto previo de producción, sanidad REST (aborta en 5xx) y **centinela `POST /rest/v1/rpc/e2e_is_isolated_db` === true** (404 = «base NO preparada», fail-closed). Cero escrituras.
4. **Runtime — `e2e/fixtures/assert-isolated-db.ts`** (guard centralizado CP-INFRA-011): Caso A (producción rechazada **sin conectar**, por host/ref), Caso B (remoto: `E2E_TARGET_KIND` exacto + allowlist presente + igualdad exacta de ref + allowlist ≠ producción), Caso C (solo `localhost/127.0.0.1/::1`), Caso D (centinela `true`; error de red NO se convierte en permiso). 13 códigos de error tipados; espejo CommonJS `.cjs` con **71 pruebas de paridad** en `src/__tests__/e2e/assert-isolated-db.test.ts` (misma tabla de 22 casos contra ambas implementaciones).

**Cableado verificado** (ningún otro consumidor de `SUPABASE_SERVICE_ROLE_KEY` en el pipeline E2E — `rg` sobre `assert-isolated-db`): `e2e/global-setup.ts`, `e2e/global-teardown.ts`, `e2e/fixtures/run-env.ts`, `e2e/scripts/provision-pilot-env.cjs`, `data-hygiene-guard.cjs`, `concurrency-proof.cjs`, `reconcile-orphan-runs.ts`. Tanto el global-setup (línea 79: primera operación) como el global-teardown (línea 38) ejecutan `assertIsolatedDb()` **antes** de cualquier sesión, provisión, escritura o limpieza. El spec `e2e/isolated-db-sentinel.spec.ts` re-verifica el centinela **dentro de la propia suite** con la anon key.

### 3.3 Identidad acreditada — evidencia

- **GitHub:** entorno `e2e-isolated` (id 25020724913) con **exactamente los 4 secretos** requeridos, actualizados `2026-10-22T11:52Z` (API de GitHub: solo nombres, valores no expuestos por diseño).
- **Corrida verde 39790965960** (2026-10-22T13:53Z, head `b43b9456f`): su log versionado por GitHub imprime, con los secretos reales en vigor:
  - `[check-e2e-config] OK — configuración completa`
  - `[build-migrations-replay] --check: regenerado 69fece42… vs commiteado 69fece42… => MATCH (sin deriva)`
  - `[verify-remote-e2e] OK — ref=*** verificado, centinela=true, REST 200. Base aislada PREPARADA.` (el ref aparece enmascarado `***` porque GitHub oculta secretos en logs)
  - Suite: **45 passed / 0 failed / 1 skipped (1.6 min)**.
  Es decir: el destino efectivo de esa corrida fue un proyecto Supabase (a) cuyo ref coincide EXACTAMENTE con la allowlist del propietario, (b) que NO es producción (veto previo), (c) que responde REST 200 y (d) cuyo centinela `e2e_is_isolated_db()` devuelve `true` — la definición operativa de la base aislada preparada, conforme a todos los artefactos versionados (ref `lguovmvrozxgssupkwf`, us-east-1).
- **Evidencia de preparación versionada** (`audit-evidence/INFRA-011/remote/`, ref `lguovmvrozxgssupkwpf` en todos): `verify.json` y `contract.json` (2026-10-22T04:00Z, guard-centinela ok), `apply-replay.json` (2026-10-22T03:59Z).

**Re-verificabilidad pre-corrida:** la identidad NO depende de esta auditoría: los pasos 1–3 del workflow la re-prueban en cada corrida y el guard runtime la re-exige antes de cada operación. Esta auditoría **no** re-verificó el centinela en vivo (sin credenciales E2E locales, por diseño); se documenta como la única capa no re-ejecutada aquí y queda cubierta por el mecanismo pre-corrida.

### 3.4 Rutas de fallback analizadas

| Ruta | ¿Puede terminar en producción/desarrollo compartido? | Evidencia |
|---|---|---|
| `playwright.config.ts` carga `./.env` local | **No ejecutable:** el guard Caso A rechaza el ref de producción **sin conectar** (primera operación del global-setup); además `E2E_TARGET_KIND`/`E2E_ALLOWED_REMOTE_REF` no existen en `.env` local | `assert-isolated-db.ts:156-161` (Caso A), `:171-187` (Caso B exige las dos); `.env` local contiene SOLO credenciales de producción (16 nombres, §3.5) y ningún `E2E_*` |
| Ejecución local `npm run test:e2e` sin secretos E2E | Muere fail-closed en el guard (falta URL allowlist / centinela). Modo legacy (`E2E_ISOLATION=0`) contra la base aislada muere con 400 `invalid_credentials` (usuarios seed inexistentes) — hallazgo documentado de la corrida 39775796843 | Comentario workflow líneas 62-70; `global-setup.ts:90-93` |
| Secretos mal configurados (URL ≠ allowlist) | Aborta por igualdad exacta (`E_REF_NO_COINCIDE`) | `assert-isolated-db.ts:185-187`, `verify-remote-e2e.mjs:31-32` |
| Ambos secretos apuntando a un 3er proyecto | Requiere además centinela `true` — RPC exclusiva de la base preparada (no existe en producción «por construcción», E2E_AISLADO.md §4) | `verify-remote-e2e.mjs:42-45` |
| `target=local` | Fail-fast documentado (sin `supabase/config.toml` no hay stack local — PENDING_OWNER) | `e2e-isolated.yml:119-123` |
| Jobs E2E antiguos de `ci.yml`/`test-coverage.yml` | `if: false` intacto con veto del propietario (2026-10-09) | `ci.yml:68-75` |

### 3.5 Claves de servicio y credenciales

- Las claves E2E viven **únicamente** como secretos del entorno GitHub `e2e-isolated` (4 nombres, §3.3); jamás versionadas.
- El `.env` local (16 nombres listados, valores no impresos) contiene credenciales de **producción** — es el archivo del servidor de desarrollo del agente y NO forma parte del runner E2E de CI. No existe ningún `E2E_SUPABASE_*` local: por tanto, en esta estación **no es posible** hoy una corrida E2E (ni contra E2E ni contra nada) sin que el propietario provea los secretos — y si alguien intentara reutilizar el `.env` de producción, el guard Caso A lo rechaza sin conectar.
- `SUPABASE_ACCESS_TOKEN` (Management API, apilador) y `E2E_SUPABASE_DB_URL` (transporte pg) son documentados como «solo local, apilador» (E2E_AISLADO.md §10) — fuera de CI.
- `security.spec.ts:267` usa la Management API con `SUPABASE_ACCESS_TOKEN`; ese spec pertenece a `CREATION_SPECS` (excluido del proyecto `core` y del smoke set).

### 3.6 Alcance de limpieza/creación de datos

- **Provisionamiento por corrida** (`e2e/fixtures/run-env.ts:491-639`): usuarios sintéticos `e2e-<slug>-{adm|usr|wh|enc}@costpro.test` con contraseñas aleatorias, tenant propio `E2E TENANT <runId>`, pilotos A/B creados vía la API real dentro del tenant del run, productos por SKU determinista del run. Todo queda registrado en `e2e-run-context-*.json`.
- **Teardown por ID exacto** (`global-teardown.ts` + `run-env.ts`/`hard-cleanup.ts`): nunca por patrones globales ni por edad; barrido final limitado al tenant del run; guardrail **net-zero** (`countE2EResiduals`) que marca la corrida como fallida si hay residuos. `protected-resources.json` (gobierno) protege por UUID y nombre exacto tiendas y usuarios reales.
- **Concurrencia:** el workflow serializa (`concurrency: e2e-isolated`), `workers: 1`, `fullyParallel: false`; la reconciliación de runs huérfanos (`reconcile-orphan-runs.ts`) está acotada a context files del propio runner.

### 3.7 Observaciones Fase A (no bloqueantes)

1. **El entorno `e2e-isolated` NO tiene reglas de protección** (protection_rules `[]`, deployment_branch_policy `null`). E2E_AISLADO.md §9 lo recomienda («required reviewers + restricción a rama main») pero no está implementado. Riesgo residual: un colaborador con escritura podría disparar corridas o editar secretos. Repo unipersonal hoy; se recomienda activarlo antes de la segunda fase.
2. **`protected-resources.json` es histórico de la era compartida**: `allowedProjectRefs` contiene el ref de PRODUCCIÓN (2026-10-09, cuando los E2E vivían en ese proyecto). El workflow aislado lo salta con `E2E_SKIP_PROTECTED_GUARD=1` (escape documentado por el propio guard, `run-env.ts:458`): correcto para la base aislada (los recursos protegidos no existen allí), pero el JSON invita a confusión; se sugiere en el futuro separar la configuración por entorno.
3. El modo legacy (`E2E_ISOLATION=0`) sigue existiendo en el código (comportamiento original conservado por mandato); contra la base aislada muere fail-closed (§3.4), por lo que no constituye ruta de fuga.

**Fase A: APROBADA** (identidad acreditada por cadena + corrida verde; fallbacks neutralizados; claves confinadas; limpieza acotada).

---

## 4. Fase B — Esquema, migraciones y datos de prueba

### 4.1 Estado documentado de la base aislada

Última preparación oficial verificada (evidencia versionada, 2026-10-22T04:00Z): **baseline** (snapshot certificado de producción 2026-08-28, schema-only, 8049 sentencias / 322 lotes transaccionales, 7 transformaciones documentadas) + **pre-tamo 10/10** (bucket reports + 9 paquetes W7-RELEASE) + **tramo 70/70** (migraciones > 2026-08-28, verbatim) + **centinela true** + verificación `PREPARADA` + contrato **137/137 funciones certificadas presentes, RLS 149/149**. Trigger de alta de usuarios `on_auth_user_created` materializado por el bootstrap (sección C.2 — desviación documentada nº 6).

Posteriormente, el manifiesto commiteado se extendió dos veces **sin evidencia de aplicación en la BD** en el repo: `eb80c71` («tramo 70→71 tras #1452») y `c31c50a` (2026-10-23T03:41Z, «tramo 71→72 — migración 20261023000000 (PR #1456)»). No existe `apply-replay.json` posterior al 2026-10-22T03:59Z.

Fuera de banda, la misión CP-ORG-001 aplicó y validó en CostproE2E `20261026120000` + `20261026130000` (17/17 pruebas in vivo; worklog multiagente). **Esos dos archivos no constan en la tabla de estado del replay** (`e2e_infra.e2e_migrations_replay_state`), porque la aplicación fue manual.

### 4.2 Divergencia actual — evidencia ejecutable

- Manifiesto commiteado: **72 incluidos / 487 considerados**, el más nuevo `20261023000000_create_physical_inventory_module.sql`; sha256 del manifiesto `05ed34f7…`.
- `supabase/migrations/` de `main @ fd73e3e` contiene **20 migraciones SQL posteriores** a ese punto (de `20261023230000_mision_caja_multimoneda_v2_24_0.sql` a `20261026210000_cp_org_003_fase2_bootstrap_tenant_admin.sql`).
- De esas 20: **2 con aplicación E2E documentada** (las de CP-ORG-001) y **18 sin ninguna evidencia de aplicación** (caja multimoneda v2.24.x, pagos mixtos v2.25, CP-MONEY-002, serialización/ACL de caja, superadmin store access, efectivo físico, bootstrap tenant_admin…). Adicionalmente, las 2 migraciones de los tramos 71/72 (en manifiesto) carecen de evidencia de aplicación posterior a la verificación del 2026-10-22.
- **Chequeo ejecutado en esta auditoría** (estático, sin red ni BD):

```
$ node scripts/e2e/build-migrations-replay.mjs --check
[build-migrations-replay] --check: regenerado 061c2d87… vs commiteado 05ed34f7… => DERIVA DETECTADA
exit 1
```

El paso 2 del workflow de CI («Verificar determinismo de la capa de reproducción») ejecuta exactamente este chequeo: **toda corrida de la batería contra `main` actual aborta hoy antes de verificar la BD y antes de ejecutar un solo test.** Comportamiento fail-closed por diseño; reproducido además en las corridas reales 39895105393/39896216673 (§6.3).

### 4.3 Impacto funcional de la divergencia sobre el smoke set

- `flows/pos-checkout` depende de `create_sale_v2`, creada en `20260807000003` (PRE-baseline: existe en E2E por el snapshot) pero **reescrita en v2.25** (`20261024150000`, payment_components, jerarquía de tasas fail-closed) y complementada por caja multimoneda v2.24.x y CP-MONEY-002 — **ninguna aplicada**. Ejecutar el smoke set con el código actual contra el esquema viejo produce un sesgo código↔BD: la prueba ejercitaría un RPC antiguo con payloads nuevos.
- **Evidencia histórica del impacto** (corrida real 39895105393, 2026-10-23T03:27Z, `main@1206572a5`): 43 passed / **3 failed**, con dos matices distintos que esta auditoría separa explícitamente:
  - `E2E-POS-007 (P1) producto de otra tienda → venta aceptada (200)`: **hallazgo de seguridad REAL** (descubierto en la corrida 39781104338 del 12:46 y reproducido aquí): `create_sale_v2` carece de validación cross-store. NO es artefacto del sesgo de esquema. En `main` actual el test está **hard-skip con documentación** (`e2e/flows/pos-checkout.spec.ts:238`: «Requiere decisión del propietario (SEC + migración)») — limitación de cobertura vigente que esta auditoría NO interpreta como resuelta.
  - `E2E-INV-007 (P0) clerk sin membership no puede ajustar en tienda ajena → esperaba 403, recibió 200`: falla que exige investigación (sesgo código↔BD o hueco real); el test permanece **ACTIVO** en `main`.
- Los datos de prueba no dependen de datos reales: identidad sintética por corrida (§3.6). `20261026210000` (bootstrap tenant_admin, PR #1493 ya fusionado) tampoco está aplicada: no afecta al smoke set, pero sí a una eventual extensión con `spec_filter` que cubra `stores/bootstrap`.

**Fase B: REPROBADA** — el historial registrado no está reconciliado con el esquema real de la base aislada respecto de `main`; faltan migraciones esenciales para que las rutas cubiertas por el smoke set se comporten como en el código auditado. Prerrequisito en §7.1 (C1–C3). No se corrigió nada en esta misión (mandato §4).

---

## 5. Fase C — Seguridad y ausencia de efectos externos

| Dominio | Estado | Evidencia |
|---|---|---|
| Ventas/devoluciones/inventario/caja | Escrituras SÍ (es el objeto de la batería), confinadas a la base aislada tras el guard | §3.2-3.6; guard previo a toda operación |
| Organizaciones/tiendas/usuarios/membresías | Creación/modificación por corrida, sintética y con teardown por ID exacto | `run-env.ts` (§3.6); specs de creación excluidos del proyecto `core` (`CREATION_SPECS`, `playwright.config.ts:30-42`) |
| Correo/mensajería | **Sin efecto externo posible en el runner**: el workflow solo define los 4 secretos E2E — ninguna credencial SMTP/Telegram/WhatsApp existe en ese entorno; las especificaciones que dependen de servicios externos están excluidas del smoke set con exclusión explícita y documentada (E2E_AISLADO.md §11) | `e2e-isolated.yml:55-90`; grep de `smtp|sendgrid|resend|telegram|whatsapp` en specs: 0 llamadas reales (las coincidencias de `zelle` son un campo de método de pago) |
| Integraciones/webhooks/terceros | Idem — sin credenciales; `NEXT_PUBLIC_SITE_URL/APP_URL/NEXTAUTH_URL` apuntan a `localhost:3000`; `NEXT_TELEMETRY_DISABLED=1` | `e2e-isolated.yml:86-89` |
| URL «externas» en specs | Negativos de prueba: `Origin: https://evil.example.com` (CSRF) y `https://api.supabase.com` (Management API, solo en `security.spec.ts` — excluido de `core`) | `e2e/security.spec.ts:267,407` |
| Procesos en segundo plano/cron | `pg_cron` instalado con el job de expiración de reservas: ejecución interna de la BD aislada, sin salidas externas (documentado §14 E2E_AISLADO) | no requiere acción |
| Archivos/exportaciones/almacenamiento | Artefactos de fallo SOLO con opt-in del propietario (`vars.E2E_ISOLATED_UPLOAD_ARTIFACTS`, retención 1 día — SEC-TS-07: trazas contienen JWTs sintéticos) | `e2e-isolated.yml:187-195` |
| Limpieza destructiva | Teardown por ID exacto del run + guardrail net-zero; el apilador de preparación no hace `DROP SCHEMA` ni resets automáticos y exige el guard normal (excepción bootstrap solo omite el centinela, mantiene identidad) | §3.6; `assert-isolated-db.ts:29-34` |

**Fase C: APROBADA.** Las escrituras de la batería solo son aceptables en la segunda fase una vez demostrado el destino (Fase A ✓) y con los efectos externos controlados (esta fase). Ambas condiciones de forma quedan cubiertas; la ejecutabilidad queda en Fase B/D.

---

## 6. Fase D — Configuración y ejecutabilidad de la batería

### 6.1 Inventario

- **55 specs** (`e2e/**/*.spec.ts`), **409 `test()`**. 149 menciones de skip (mezcla de saltos condicionales por variables de entorno y saltos documentales; sin skips silenciosos en el smoke set — ver 6.4).
- **Smoke set por defecto** (filtro del workflow, `e2e-isolated.yml:151`): `health-api|isolated-db-sentinel|auth.spec.ts|data-hygiene-probe|isolation-proof|inventory.spec.ts|pos-checkout|inventory-integrity` → 8 specs ≈ 39 tests declarados; la corrida verde ejecutó 46 (algunos specs iteran).
- Proyecto `creation` (12 patrones) registrado SOLO con `E2E_ALLOW_CREATION=1` — imposible ejecutarlo por accidente (fail-closed en la CONFIG).

### 6.2 Configuración Playwright (`playwright.config.ts`)

`workers: 1` · `fullyParallel: false` (datos compartidos no paralelos-safe) · `timeout: 60s` (algunos specs 120s) · `retries: CI?1:0` (el workflow fuerza `--retries=0`) · `storageState: undefined` (cada test maneja su login) · **sin `webServer`** (el workflow arranca `next start` + gate de `/api/health`) · launchOptions anti-OOM (`--disable-dev-shm-usage --disable-gpu`, documentado: OOM del sandbox reproducido) · reporter `line,json` en CI con `PLAYWRIGHT_JSON_OUTPUT_NAME` (hallazgo corrida 39779247845) · dependencias presentes (`@playwright/test ^1.59.1`, `@axe-core/playwright ^4.11.3`).

### 6.3 Historial real de corridas del workflow «E2E Aislado (CostproE2E)» (id 392817535, solo `workflow_dispatch`)

| # | Run | Fecha (UTC) | Head | Resultado |
|---|---|---|---|---|
| 1 | 39774127538 | 2026-10-22 11:54 | `282951b1a` main | ❌ (investigada: heredoc del resumen) |
| 2 | 39775796843 | 2026-10-22 12:07 | `eb80c7196` | ❌ (modo legacy: 400 invalid_credentials — fijado con `E2E_ISOLATION=1`) |
| 3 | 39777819072 | 2026-10-22 12:22 | `be6aea499` | ❌ (FK `tenants_owner_id_fkey` — trigger C.2 del bootstrap) |
| 4 | 39779247845 | 2026-10-22 12:32 | `618ea00a9` | ❌ (reporter JSON) |
| 5 | 39781104338 | 2026-10-22 12:46 | `496ab35e1` | ❌ suite: 3 failed/43 passed — **descubre el hallazgo CICLO 2** (`E2E-POS-007`: venta con producto ajeno aceptada) + fallo de visibilidad UI |
| 6 | **39790965960** | **2026-10-22 13:53** | `b43b9456f` fix/e2e-manifiesto-tramo71 | ✅ **45 passed / 0 failed / 1 skipped (1.6 min)** — cadena íntegra verde (PR #1453 cerrado sin fusión; el contenido llegó a main vía `eb80c71`) |
| 7 | 39895105393 | 2026-10-23 03:27 | `1206572a5` main | ❌ **en la suite**: 3 failed / 43 passed (INV-007 P0, POS-007 P1, timeout UI) — primer sesgo código↔esquema |
| 8 | 39896216673 | 2026-10-23 03:39 | `a6dbba65e` main | ❌ **en el gate de determinismo** (DERIVA — el mismo que esta auditoría reproduce hoy) |

**No hay corridas desde el 2026-10-23** y ninguna verde sobre `main` (la única verde fue sobre una rama fix con esquema alineado). Los fallos 1–5 documentan limitaciones históricas reales (429/credenciales/entorno) todas remediadas y visibles en los comentarios del propio workflow.

### 6.4 Limitaciones y cobertura conocidas (documentadas, sin skips silenciosos)

1. **`E2E-POS-007` hard-skip** (`pos-checkout.spec.ts:238`): `create_sale_v2` sin validación cross-store en producción — venta con producto ajeno aceptada. **Hallazgo de seguridad real pendiente de decisión del propietario (SEC + migración)**; la batería NO verifica esa propiedad. `E2E-INV-007` (la propiedad gemela de inventario) SÍ permanece activa.
2. **Cobertura histórica** (E2E-80, 2026-09-27): 88.3 % de 128 escenarios; 15 no automatizados con justificación (servicios externos, flujos manuales).
3. **Ventana de token 1h** (global-setup) — la suite completa debe caber en esa ventana o relanzarse por módulos; el smoke set dura ~2 min (verde) — holgado.
4. **17 errores TypeScript en `e2e/`** (`tsc -p tsconfig.e2e.json --noEmit`, 5 archivos; 1 de ellos del smoke set, `inventory.spec.ts`). Playwright transpila con esbuild sin typecheck → no bloquean la ejecución (la corrida verde lo demuestra); deuda de higiene, sin impacto en ejecutabilidad.
5. Serialización estricta: `workers: 1` + `concurrency: e2e-isolated` — sin paralelismo; los conflictos entre tests concurrentes están diseñados fuera.
6. Modo local `PENDING_OWNER` (sin stack Supabase local) — no hay procedimiento local oficial.
7. Jobs E2E de `ci.yml`/`test-coverage.yml` `if: false` (vetados 2026-10-09) — la única vía oficial es el workflow aislado.

**Fase D: REPROBADA para ejecución inmediata** (bloqueada por Fase B: el gate de determinismo aborta hoy toda corrida sobre `main`), con mecanismo de ejecución en sí íntegro y probado (corrida verde). Técnicamente ejecutable ≠ realmente representativa: con la deriva actual, aun saltando el gate, el smoke set mediría un esquema viejo.

---

## 7. Fase E — Preparación reproducible de la segunda misión

### 7.1 Condiciones previas C1–C4 (bloquean la autorización de la 2ª fase)

| # | Condición | Comando/verificación | Responsable |
|---|---|---|---|
| **C1** | Regenerar y commitear el manifiesto del replay para `main @ fd73e3e` | `node scripts/e2e/build-migrations-replay.mjs` (copia a `audit-evidence/INFRA-011/e2e-migrations-manifest.json`); commit; luego `--check` debe imprimir `MATCH (sin deriva)` exit 0. Revisar en PR que ninguna de las 20 migraciones nuevas requiera transformación nueva (el generador es verbatim salvo 1 excepción documentada) | Propietario/agente (sin secretos) |
| **C2** | Aplicar el tramo faltante a CostproE2E con el apilador oficial (NO en esta misión) | `node scripts/e2e/reset-remote-e2e-db.mjs --inspect --i-understand-this-is-destructive` (solo lectura) → `--apply-replay --i-understand-this-is-destructive` (idempotente por sha256 contra `e2e_infra.e2e_migrations_replay_state`; transportes `api`/`pg`). **Punto de verificación:** `20261026120000`/`20261026130000` no constan en la tabla (aplicación fuera de banda) y serán re-aplicadas — confirmar su idempotencia documentada antes de proceder (CP-ORG-001 las validó 17/17) | Propietario + apilador (`SUPABASE_ACCESS_TOKEN` o `E2E_SUPABASE_DB_URL`, NUNCA en CI) |
| **C3** | Verificación integral + contrato tras la aplicación | `--verify` → `PREPARADA` · `--contract` → 0 funciones certificadas faltantes vs el contrato vigente. Commitear la evidencia (`audit-evidence/INFRA-011/remote/*.json`) | Propietario + apilador |
| **C4** | Re-verificación pre-corrida en el commit final | Repetir justo antes de disparar: (a) `node scripts/e2e/build-migrations-replay.mjs --check` → MATCH; (b) el propio workflow re-ejecuta `check-e2e-config` + `verify-remote-e2e` (ref exacto + centinela true) antes de cualquier test — cualquier fallo aborta | Automático en CI |

### 7.2 Propuesta exacta de ejecución (segunda misión — NO ejecutar ahora)

- **Canal:** GitHub Actions → **«E2E Aislado (CostproE2E)»** → *Run workflow* (única vía oficial; `workflow_dispatch`, environment `e2e-isolated`). Equivalente CLI: `gh workflow run e2e-isolated.yml --ref main -f target=project -f spec_filter=` (filtro vacío = smoke set CP-INFRA-011).
- **Versión de código:** `main` en el SHA que incorpore C1 (o el SHA que el propietario fije), **después** de demostrar C1–C4.
- **Comando efectivo dentro del runner** (paso «Ejecutar suite E2E»): `bunx playwright test --project=core --reporter=line,json --retries=0 "health-api|isolated-db-sentinel|auth.spec.ts|data-hygiene-probe|isolation-proof|inventory.spec.ts|pos-checkout|inventory-integrity"`.
- **Servicios activos:** ninguno externo — el workflow auto-contiene build (`NODE_OPTIONS=--max-old-space-size=4096 bun run build`), servidor (`bunx next start -p 3000` + gate `/api/health`) y Chromium. **No** se usa el pm2 local ni el `.env` de producción para nada.
- **Datos de prueba previos:** ninguno manual — la identidad sintética nace en el `global-setup` (`run-env.ts`) y muere en el `global-teardown` (guardrail net-zero).
- **Paralelismo/limpieza:** serializado (concurrency del workflow + workers 1); teardown por ID exacto del run; guardrail de residuos = la corrida NO puede quedar verde con contaminación.
- **Criterios de aborto (cualquiera detiene y reporta, sin reintentos):** fallo de `check-e2e-config` / `--check` / `verify-remote-e2e`; centinela ≠ `true` o HTTP 404/5xx; cualquier línea de log que revele un ref distinto del esperado; fallos en propiedades de aislamiento (INV-007 u otras P0/P1 de seguridad); `E2E DATA CONTAMINATION DETECTED` del teardown; errores 429 sostenidos de Supabase Auth.
- **Evidencias a recoger:** URL de la corrida + pasos; salida del paso «Resumen de pruebas» (sin secretos — GitHub enmascara valores de secrets por diseño; no volcar `env`); evidencia de `verify-remote-e2e` (ref enmascarado + centinela=true); artefactos solo con opt-in `E2E_ISOLATED_UPLOAD_ARTIFACTS=true` (SEC-TS-07).
- **Ampliación posterior (opcional, decisión del propietario):** `spec_filter` p. ej. `store-switching|reverse-sale-flow` — documentado en E2E_AISLADO.md §11; los specs de servicios externos (Telegram/WhatsApp/IA/correo) quedan excluidos por diseño.

### 7.3 Riesgo residual a cerrar junto a C1

Recomendación (no bloqueante para el smoke set): activar **required reviewers + restricción a rama `main`** en el entorno `e2e-isolated` (§3.7-1) antes de la segunda fase, y separar en el futuro `protected-resources.json` por entorno (§3.7-2).

---

## 8. Tabla de control

| # | Control (mandato) | Resultado | Evidencia |
|---|---|---|---|
| A-1 | Qué BD usa realmente la batería | ✅ Aprobado | §3.1-3.3: alias único de secretos; corrida verde con `centinela=true` |
| A-2 | Variables y precedencias del destino | ✅ Aprobado | §3.1 (tabla); dotenv no pisa el env del workflow |
| A-3 | Rutas de fallback a compartido/producción | ✅ Aprobado | §3.4 (tabla de 6 rutas, todas fail-closed) |
| A-4 | Cliente de pruebas y scripts → misma instancia | ✅ Aprobado | §3.2 cableado del guard a TODOS los entrypoints |
| A-5 | Claves de servicio limitadas al entorno de pruebas | ✅ Aprobado | §3.5: solo GitHub env `e2e-isolated`; sin `E2E_*` locales |
| A-6 | Limpieza/creación no alcanzan BD ajena | ✅ Aprobado | §3.6: ID exacto + net-zero + guard previo |
| A-7 | Aislamiento válido con la configuración REAL (no solo ejemplo) | ✅ Aprobado | §3.3: corrida verde usó los secretos reales del entorno |
| B-1 | Esquema necesario presente | ❌ Reprobado | §4.2-4.3: 18 migraciones sin aplicar (caja v2.24/v2.25, MONEY-002…) |
| B-2 | Historial de migraciones coherente | ❌ Reprobado | §4.1-4.2: manifiesto commiteado ≠ derivación actual (DERIVA exit 1, reproducido) |
| B-3 | RPC/funciones/triggers/RLS/permisos al día | ⚠️ Parcial | 137/137 y RLS 149/149 el 2026-10-22; NO reverificados tras 20 migraciones de `main` |
| B-4 | Roles/policies requeridos por los casos | ✅ (a la fecha) | igual anterior; requiere re-verificación post-C2 |
| B-5 | Datos mínimos de prueba | ✅ Aprobado | identidad sintética por corrida (§3.6), sin datos reales |
| B-6 | Sin dependencia de datos de producción | ✅ Aprobado | §3.6 + E2E_AISLADO.md §11 (sin datos ENERVIDA/CENTRAL/PP) |
| B-7 | Setup/teardown acotado a lo creado por las pruebas | ✅ Aprobado | §3.6 (context file por run, net-zero) |
| C-1…C-7 | Efectos externos | ✅ Aprobado | §5 (tabla completa) |
| D-1 | Ubicación y número de pruebas | ✅ Documentado | §6.1: 55 specs / 409 tests / smoke ≈ 39-46 |
| D-2 | Proyectos, browsers, workers, timeouts, reintentos | ✅ Documentado | §6.2 |
| D-3 | Dependencias de auth/almacenamiento de sesión | ✅ Documentado | tokens por corrida (1h), sin storageState persistente |
| D-4 | Setup/teardown y precondiciones de datos | ✅ Documentado | §3.6, §7.2 |
| D-5 | Servicios locales y puertos | ✅ Documentado | auto-contenido en CI (localhost:3000) |
| D-6 | Comportamiento con secretos ausentes | ✅ Documentado | fail-closed en cada capa (§3.4) |
| D-7 | Skips/exclusiones que reducen cobertura | ✅ Documentado | §6.4 (POS-007 hard-skip = hallazgo SEC real; 15 escenarios E2E-80) |
| D-8 | Conflictos/dependencias entre tests | ✅ Diseñado fuera | workers 1, serializado, identidad por corrida |
| D-9 | Limitaciones históricas (429, credenciales, entorno) | ✅ Documentadas | §6.3 corridas 1-5 y su remediación |
| E-1 | Propuesta ejecutable específica | ✅ Entregado | §7.2 |
| **GLOBAL** | **Certificación** | **APTO CONDICIONADO** | §9 |

---

## 9. Dictamen global — APTO CONDICIONADO

**Fundamento afirmativo (riesgo de producción/desarrollo compartido: descartado por construcción):**
1. El destino efectivo es la base aislada: cadena de 4 capas fail-closed (config → determinismo → verificación REST con igualdad exacta de ref + centinela → guard runtime) acreditada con una corrida verde real usando los secretos del propietario (2026-10-22, 45/0/1).
2. La identidad se re-prueba automáticamente justo antes de cada corrida (pasos 1-3 del workflow + guard + spec centinela dentro de la suite) — cumple el requisito de re-verificabilidad.
3. Ninguna ruta de fallback analyzed puede terminar en producción (§3.4); las claves de servicio E2E están confinadas al entorno de GitHub; la limpieza es por ID exacto con guardrail net-zero.
4. Los efectos externos están controlados (§5) y las limitaciones de cobertura están documentadas sin skips silenciosos (§6.4).

**Fundamento condicionante (impide APTO):**
5. El esquema de la base aislada NO está reconciliado con el código auditado: la deriva del manifiesto es un hecho reproducible (exit 1) y 18 migraciones relevantes (incluida la reescritura v2.25 de `create_sale_v2`) carecen de evidencia de aplicación. La corrida real del 2026-10-23 sobre `main` con sesgo similar produjo 3 fallos, dos de ellos en propiedades de aislamiento (P0/P1).
6. Por lo tanto, la batería **no puede ejecutarse hoy** ni representativamente (el gate aborta; y de saltarse, mediría un esquema viejo).

**Por qué no NO APTO:** la identidad del destino sí está demostrada con evidencia concreta y repetible (condición que el mandato exige para no caer en NO APTO); no existe operación destructiva sin acotar (todas tras el guard, por ID exacto); y los requisitos faltantes son **menores, concretos, verificables y corregibles** con el procedimiento oficial ya ejecutado con éxito una vez (C1–C4, §7.1) — exactamente la definición del dictamen condicionado.

**No autorizado por este expediente:** la ejecución de la batería (segunda fase) **hasta demostrar C1–C4**. La aplicación de migraciones a CostproE2E (C2) constituye por sí misma una operación de escritura sobre la base aislada que requiere misión/autorización separada del propietario. Este PR es exclusivamente documental y no se fusiona automáticamente.

---

## 10. Respuestas explícitas al informe final (mandato §10)

1. **¿Se ha ejecutado alguna prueba E2E?** **NO.** (§1, garantía 1 — solo chequeos estáticos y lecturas.)
2. **¿Se ha escrito o alterado algún dato de CostproE2E?** **NO.** (§1, garantía 2 — cero conexiones a la base aislada.)
3. **¿Se ha ejecutado alguna migración, reset o seed?** **NO.** (§1, garantía 3 — el único script ejecutado es determinismo puro sobre directorio temporal.)
4. **¿Se ha demostrado que el destino efectivo es la base aislada CostproE2E?** **Sí, con evidencia:** cadena fail-closed leída y verificada íntegra + corrida verde real con los secretos en vigor (`ref=*** verificado, centinela=true, REST 200`) + 4 secretos presentes en el entorno `e2e-isolated` desde el 2026-10-22 + artefactos de preparación versionados con ref `lguovmvrozxgssupkwpf`. La re-verificación en vivo del centinela no se realizó en esta misión (sin credenciales E2E locales, por diseño) y queda cubierta por el mecanismo pre-corrida del propio workflow (C4).
5. **Controles:** aprobados A-1…A-7, B-4…B-7, C-*, D-1…D-9, E-1; **reprobados B-1, B-2** (deriva de migraciones) y con ello la ejecución inmediata (D); parcial B-3 (requiere re-verificación post-C2). Detalle en §8.
6. **Dictamen:** **APTO CONDICIONADO** (§9). Identidad y aislamiento probados; esquema desalineado; 4 condiciones concretas (C1–C4) antes de autorizar la corrida.
7. **Propuesta para la segunda misión:** §7.2 — `main` (post-C1), GitHub Actions «E2E Aislado (CostproE2E)», `target=project`, `spec_filter` vacío (smoke set: 8 specs, ~46 corridas de prueba), auto-contenido en CI, aborto ante cualquier fallo de guard/centinela/aislamiento, evidencias sin secretos. Precondiciones: C1–C4 demostradas; recomendación de protección del entorno (§7.3).

---

## 11. Índice de archivos examinados (evidencia por símbolo)

**Configuración del runner:** `.github/workflows/e2e-isolated.yml` (íntegro) · `playwright.config.ts` (íntegro) · `scripts/e2e/check-e2e-config.mjs` (íntegro, 61L) · `scripts/e2e/verify-remote-e2e.mjs` (íntegro, 47L) · `scripts/e2e/build-migrations-replay.mjs` (íntegro, 382L; `--check` ejecutado) · `.github/workflows/ci.yml:68-90` (job E2E `if:false`).

**Guard y fixtures:** `e2e/fixtures/assert-isolated-db.ts` (íntegro, 259L) + espejo `.cjs` · `e2e/global-setup.ts` / `global-teardown.ts` (íntegros) · `e2e/fixtures/run-env.ts` (líneas 20-139, 140-319, 440-639) · `e2e/config/protected-resources.json` · `e2e/isolated-db-sentinel.spec.ts` · `e2e/flows/pos-checkout.spec.ts:218-242` (hard-skip POS-007) · `e2e/flows/inventory-integrity.spec.ts:200-215` (INV-007 activo) · `e2e/security.spec.ts:267,407`.

**Normativa y evidencia:** `docs/e2e/E2E_AISLADO.md` (íntegro, 287L) · `docs/e2e/CHECKLIST_PROPIETARIO_COSTPROE2E.md` · `audit-evidence/INFRA-011/e2e-migrations-manifest.json` (72/487; última tramo `20261023000000`) · `audit-evidence/INFRA-011/remote/{apply-replay,verify,contract,bootstrap,inspect}.json` · `E2E-COVERAGE-REPORT.md` · `e2e/SCENARIO-INVENTORY.md` · expedientes históricos de `docs/audits/` (§2).

**Estado externo consultado (solo lectura):** `origin/main @ fd73e3e` · PRs: #1496 (fusionado), #1497 (abierto, ajeno) · entorno `e2e-isolated` + sus 4 secretos (nombres) · workflow 392817535 y sus 8 corridas (logs de las corridas verde y falladas 2026-10-22/23) · historial del manifiesto (`3cd4e39` → `eb80c71` → `c31c50a`).

**Comandos ejecutados (todos de solo lectura o estáticos):** `git status/fetch/log/rev-parse/merge-base --is-ancestor` · `node scripts/e2e/build-migrations-replay.mjs --check` (exit 1 = DERIVA) · `bunx tsc -p tsconfig.e2e.json --noEmit` (17 errores de higiena, sin impacto de ejecución) · API de GitHub (branches, pulls, environments, secrets-nombres, workflow runs, jobs, logs) · `rg`/`ls`/`sed` sobre el repo.
