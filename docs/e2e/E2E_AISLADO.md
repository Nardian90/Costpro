# E2E AISLADO — COSTPRO 4 MULTITIENDA (CP-INFRA-011)

**Proyecto aislado:** `CostproE2E` (Supabase, us-east-1) · **Ref:** `lguovmvrozxgssupkwpf`
**Producción PROHIBIDA para E2E:** `wthkddeleylijmonclxg` (rechazada por el guard sin conectar)
**Documentación de la misión:** `audit-evidence/INFRA-011/` (inventario FASE 0, manifiesto, evidencia de preparación, comparación de contrato)

---

## 1. Arquitectura del aislamiento

```
┌────────────────────────── Entorno de ejecución E2E ──────────────────────────┐
│  Playwright (CI workflow_dispatch / local)                                   │
│    └─ e2e/global-setup.ts ──► GUARD e2e/fixtures/assert-isolated-db.ts       │
│         (1) URL presente, sin fallback         (identidad por ref EXACTO)    │
│         (2) rechazo INMEDIATO de producción (wthkddeleylijmonclxg)          │
│         (3) remoto: E2E_TARGET_KIND=project|branch + E2E_ALLOWED_REMOTE_REF  │
│             == ref de la URL (igualdad exacta, sin comparaciones parciales)  │
│         (4) centinela public.e2e_is_isolated_db() === true (fail-closed)    │
│    └─ fixtures/run-env.ts · scripts .cjs standalone ──► mismo guard           │
│  App Next.js (localhost:3000) ──► PROYECTO AISLADO CostproE2E                 │
│  149 tablas · 264 funciones SECURITY DEFINER · RLS 149/149 · centinela ✓ ·
│  trigger de alta de usuarios (auth.users → public.on_auth_user_created) ✓ │
└──────────────────────────────────────────────────────────────────────────────┘
```

Diferencia clave con el sistema anterior (jobs E2E con `if: false` de
`ci.yml`/`test-coverage.yml`, INTACTOS por mandato): aquellos compartían el
mismo proyecto Supabase con datos reales y llegaron a contaminarlo
(48 tiendas + 26 usuarios, 2026-10-09). Aquí **ningún E2E puede operar
contra producción por construcción** (guard Caso A) y la identidad del
destino se exige por igualdad EXACTA de ref.

## 2. Guard centralizado — `e2e/fixtures/assert-isolated-db.ts`

- **Caso A (producción):** cualquier URL cuyo host contenga `wthkddeleylijmonclxg` se rechaza **sin conectar**. Identificación por host/ref, nunca por consulta.
- **Caso B (remoto):** exige `E2E_TARGET_KIND` = `project|branch` (valor exacto), `E2E_ALLOWED_REMOTE_REF` presente, ref extraída de la URL == allowlist (igualdad EXACTA), allowlist ≠ producción, y centinela `true`.
- **Caso C (local):** solo `localhost`/`127.0.0.1`/`::1`. Las credenciales locales NO autorizan hosts remotos. El guard normal también exige centinela en local (instalado por el bootstrap local).
- **Caso D (centinela):** `public.e2e_is_isolated_db()` debe devolver exactamente `true`. RPC inexistente/`false`/error de red ⇒ rechazo (los errores de red NO se convierten en permiso).
- **Excepción limitada de bootstrap (§3.3 del mandato):** el modo `bootstrap` omite SOLO el centinela (la base vacía aún no lo tiene) y mantiene TODA la identidad. La usa exclusivamente el apilador (`--bootstrap` / `--inspect`). Cualquier migración, fixture o borrado exige el guard normal.
- **Implementación dual con paridad probada:** el espejo `e2e/fixtures/assert-isolated-db.cjs` existe porque los entrypoints standalone son CommonJS. `src/__tests__/e2e/assert-isolated-db.test.ts` ejecuta la misma tabla de 22 casos contra AMBAS implementaciones (71 tests, todos con red mockeada — nunca conectan a producción).

**Entrpoints cableados** (ningún otro archivo usa `SUPABASE_SERVICE_ROLE_KEY` en el pipeline E2E): `e2e/global-setup.ts`, `e2e/global-teardown.ts`, `e2e/fixtures/run-env.ts` (provision+teardown), `e2e/scripts/provision-pilot-env.cjs`, `data-hygiene-guard.cjs`, `concurrency-proof.cjs`, `reconcile-orphan-runs.ts` (y vía run-env: `probe-storage-round1.ts` + todos los specs). Los scripts de operación del negocio (`scripts/*` de producción) NO se cablean: su propósito ES operar el proyecto real.

## 3. Excepción limitada de bootstrap — desviación documentada del orden

El mandato ordena: bootstrap → centinela → migraciones. La práctica evidenció
que los **guards de inventario del propio stream** auditan la fidelidad EXACTA
con producción — p. ej. `20260902205210_w9_f06_h1` exige `total funciones
public=481` y el centinela es +1 (evidencia: `audit-evidence/INFRA-011/remote/apply-replay.json`,
2026-10-22, 482≠481). Por ello:

- `supabase/e2e-bootstrap.sql` se divide en **SECCIÓN A** (extensiones + roles
  shim + membresías, aplicada por `--bootstrap`) y **SECCIÓN C** (centinela).
- El apilador aplica la sección C **al FINAL de `--apply-replay`**, tras
  baseline + pre-tamo + tramo, y ejecuta el guard normal como verificación final.
- La garantía runtime permanece íntegra: ningún test/fixture/script puede
  operar sin centinela `true`; `--verify`/`--contract` lo validan en el estado final.
- Durante el replay, la identidad se verifica igualmente por completo (ref +
  allowlist + Management API en `--bootstrap`).

## 4. Centinela — verificación y manual de comprobación

```sql
select public.e2e_is_isolated_db();  -- debe devolver true
```
```powershell
# PowerShell (propietario)
$url = "https://lguovmvrozxgssupkwpf.supabase.co"
$anon = "<anon key del gestor de contraseñas>"   # NUNCA en el repo
Invoke-RestMethod -Method Post -Uri "$url/rest/v1/rpc/e2e_is_isolated_db" `
  -Headers @{ apikey = $anon } -ContentType "application/json" -Body "{}"   # => True
```
Es infraestructura exclusiva de E2E: `SECURITY INVOKER` (los guards del tramo
auditan las funciones SECURITY DEFINER ejecutables por anon), sin acceso a
tablas, con grants explícitos a `anon, authenticated, service_role`. En
producción NO existe por construcción.

## 5. Manifiesto de migraciones — generación y determinismo

```bash
node scripts/e2e/build-migrations-replay.mjs          # genera .e2e-migrations/ (gitignored)
node scripts/e2e/build-migrations-replay.mjs --check  # CI: deriva = exit 1
```

Estrategia v3 **baseline + tramo** (ver el encabezado del generador y el
manifiesto commiteado en `audit-evidence/INFRA-011/e2e-migrations-manifest.json`):

1. **Baseline certificado:** `audit-evidence/20260828/.../production-schema-snapshot-20260828.sql`
   (snapshot schema-only del esquema public, 2026-08-28, autorizado por el dueño,
   0 INSERTs top-level — verificado). Con **7 transformaciones documentadas**
   (9 sentencias de plataforma omitidas: 6 event triggers, 2 publications,
   1 alter-publication, 188 funciones C de btree_gist, 6 funciones extensions.*,
   204 ALTER DEFAULT PRIVILEGES de roles de plataforma + preámbulo SET por lote).
   Motivo de cada una: el artefacto fue diseñado para un restore de laboratorio
   sin defaults de plataforma; las transformaciones reproducen exactamente
   su efecto sobre un proyecto alojado.
2. **Pre-tamo (out-of-band, versionado en el repo):** el bucket `reports`
   (`20260221_create_reports_bucket.sql`, esquema storage no cubierto por el
   snapshot) + los 9 paquetes W7-RELEASE en orden canónico (01..09) aplicados
   a producción fuera del pipeline entre el snapshot y el tramo. Transformación
   única: 13 líneas `\echo` psql-only eliminadas.
3. **Tramo:** 70 migraciones con fecha > 2026-08-28 en orden lexicográfico
   (regla del runner oficial), **verbatim** salvo UNA transformación documentada
   (`20261020000002`: un REVOKE sobre `profiles_block_privileged_update`,
   función out-of-band sin DDL versionado en el repo — inexistente en E2E).

**Por qué no se reproduce el stream completo desde cero:** el inventario FASE 0
evidenció que el esquema core (stores, profiles, products, transactions,
stock_movements, audit_logs…) NO fue creado por las migraciones — se creó
out-of-band en la historia real. El snapshot 2026-08-28 es la ÚNICA
reproducción completa y versionada del estado pre-tramo. 409 migraciones
pre-baseline quedan excluidas con razón `cubierto_por_baseline_snapshot`.

**Nota de orden:** el manifiesto registra los 86 timestamps históricos cortos y
25 grupos de timestamp duplicado; el orden lexicográfico ES la regla del runner
oficial (la que construyó la superficie real). Una ficha retrospectiva
(`202401230002`) resultó inejecutable en orden de stream (42P01 — evidencia
en `remote/apply-replay.json`) y quedó excluida documentada.

## 6. Preparación inicial del proyecto (agente/propietario, NO CI)

Precondiciones: proyecto VACÍO y aislado, `E2E_TARGET_KIND=project`,
`E2E_ALLOWED_REMOTE_REF=<ref exacto>`, service key, y `SUPABASE_ACCESS_TOKEN`
para verificación del NOMBRE vía Management API (solo lectura).

```bash
# 1. Generar la capa (guarda el manifiesto como evidencia)
node scripts/e2e/build-migrations-replay.mjs

# 2. Inspección inicial de solo lectura
node scripts/e2e/reset-remote-e2e-db.mjs --inspect   --i-understand-this-is-destructive

# 3. Bootstrap mínimo (extensiones + roles + membresías; centinela diferido §3)
node scripts/e2e/reset-remote-e2e-db.mjs --bootstrap --i-understand-this-is-destructive

# 4. Baseline + pre-tamo + tramo (reanudable por diseño; para ante el primer error)
node scripts/e2e/reset-remote-e2e-db.mjs --apply-replay --i-understand-this-is-destructive

# 5. Verificación integral y comparación con el contrato
node scripts/e2e/reset-remote-e2e-db.mjs --verify   --i-understand-this-is-destructive
node scripts/e2e/reset-remote-e2e-db.mjs --contract --i-understand-this-is-destructive
```

Transporte: `--transport=api` (Management API `/database/query` — funciona sin
PG directo, p. ej. hosts IPv6-only) o `--transport=pg` (cadena
`E2E_SUPABASE_DB_URL`). El apilador NUNCA hace `DROP SCHEMA` ni resets
destructivos automáticos; su nombre se conserva solo por compatibilidad.

**Estado alcanzado el 2026-10-22 (evidencia en `audit-evidence/INFRA-011/remote/`):**
baseline aplicada (8049 sentencias en 322 lotes transaccionales) · pre-tamo
10/10 · tramo 70/70 · centinela true · verificación `PREPARADA` · contrato:
**0 funciones certificadas faltantes** (137/137 presentes), RLS 149/149.

## 7. Comportamiento en re-ejecuciones

- `--apply-replay` es **idempotente por hash**: solo aplica archivos cuyo
  sha256 (de la capa generada) no conste como `aplicada` en
  `e2e_infra.e2e_migrations_replay_state` (schema privado, invisible a los
  guards de inventario). Una corrida interrumpida se reanuda limpia: los
  lotes del baseline son transaccionales (fallo = rollback del lote) y el
  progreso queda registrado por sentencia.
- `--verify` en un proyecto ya preparado no escribe nada.
- **Estado parcial, divergente o incierto:** el apilador se DETIENE con
  diagnóstico de solo lectura y no repara ni borra NADA (mandato §6.3). Una
  reconstrucción destructiva exige autorización expresa y separada del
  propietario (este repositorio no automatiza esa decisión).

## 8. Ejecución local (limitación documentada — PENDING_OWNER)

El workflow soporta `target=local` a nivel de guard (localhost con centinela
local), pero el repo **no tiene stack Supabase local configurado** (no existe
`supabase/config.toml`) — no hay procedimiento oficial que ejecutar. El modo
local del workflow falla rápido con instrucción en vez de inventar uno. Para
habilitarlo (decisión del propietario): `supabase init`, aplicar
`supabase/e2e-bootstrap.sql` (sección A + C) + la capa de reproducción con
`--transport=pg` apuntando a la URL local, y configurar las variables
`NEXT_PUBLIC_SUPABASE_*` locales. Hasta entonces: `PENDING_OWNER`.

## 9. Ejecución manual en GitHub Actions

1. **Settings → Environments → New environment →** `e2e-isolated`
   (NO reutilizar `e2e`). Recomendado: required reviewers + restricción a
   rama `main` (misma práctica SEC-TS-08 del environment `e2e`).
2. Secretos del environment (ver §10 y la checklist): `E2E_SUPABASE_URL`,
   `E2E_SUPABASE_ANON_KEY`, `E2E_SUPABASE_SERVICE_ROLE_KEY`,
   `E2E_ALLOWED_REMOTE_REF`.
3. **Actions → "E2E Aislado (CostproE2E)" → Run workflow** → `target=project`
   (+ `spec_filter` opcional; vacío = smoke set).
4. La corrida: valida configuración (solo nombres lógicos) → verifica el
   determinismo del manifiesto → verifica la base vía REST (centinela) →
   build → servidor + healthcheck → Playwright (smoke) → resumen →
   artefactos SOLO en fallo y solo con `vars.E2E_ISOLATED_UPLOAD_ARTIFACTS=true`.

## 10. Variables y secretos — origen

| Nombre lógico | Ámbito | Origen oficial |
|---|---|---|
| `E2E_SUPABASE_URL` | env `e2e-isolated` | Supabase → Settings → API (URL del proyecto **CostproE2E**) |
| `E2E_SUPABASE_ANON_KEY` | env `e2e-isolated` | Settings → API → anon/publishable key |
| `E2E_SUPABASE_SERVICE_ROLE_KEY` | env `e2e-isolated` | Settings → API → service_role (SOLO server-side; nunca NEXT_PUBLIC) |
| `E2E_ALLOWED_REMOTE_REF` | env `e2e-isolated` | Settings → General → Reference ID (`lguovmvrozxgssupkwpf`) |
| `E2E_TARGET_KIND` | variable del workflow | `project` (fijo en el workflow; `branch` queda reservado) |
| `SUPABASE_ACCESS_TOKEN` | solo local (apilador) | gestor de contraseñas — para verificación del nombre vía Management API. **NO se usa en CI** |
| `E2E_SUPABASE_DB_URL` | solo local (--transport=pg) | Connect → cadena postgres |

**Credenciales JAMÁS en archivos versionados, logs ni evidencias.** La contraseña
de BD y las claves viven en el gestor de contraseñas del propietario. Para
futuras misiones, las realmente necesarias son: URL + anon key + service key +
ref (CI) y, solo para preparar/reconstruir la base, el access token y la
contraseña de BD (locales).

## 11. Selección de pruebas

Smoke set por defecto (FASE 8 del mandato — pequeño, estable, representativo):
`health-api` (healthcheck) · `isolated-db-sentinel` (centinela) ·
`auth.spec.ts` (autenticación sintética) · `data-hygiene-probe` (higiene y
separación) · `isolation-proof` (aislamiento entre tiendas) ·
`inventory.spec.ts` + `flows/inventory-integrity` (inventario) ·
`flows/pos-checkout` (venta POS representativa). Los usuarios y datos nacen de
`e2e/fixtures/run-env.ts` (identidad sintética por corrida — nunca datos
reales de ENERVIDA/CENTRAL/Puerto Padre).

**Exclusiones de servicios externos** (mandato §9.1): specs que dependen de
Telegram/WhatsApp/IA/Zelle/correo no entran en el smoke set — quedan sin
verificar esos flujos integrados. No hay skips silenciosos: el filtro es
explícito y este párrafo es la razón documentada. Para cualquier corrida,
`spec_filter` permite ampliar (p. ej. `store-switching|reverse-sale-flow`).

## 12. Incorporar nuevas pruebas

Añada el `.spec.ts` bajo `e2e/`; NO requiere tocar el guard (el global-setup ya
lo aplica). Si la prueba crea/borra datos, use la identidad de
`run-env.ts` (`E2E_RUN_ID`) — el teardown limpia por id exacto. Actualice el
smoke set del workflow SOLO si la prueba es estable (3 corridas verdes).

## 13. Investigar un fallo

1. Leer el paso fallido en el run (el guard nombra la variable lógica ausente;
   el apilador nombra el archivo/posición/lote exactos).
2. Evidencia local: `audit-evidence/INFRA-011/remote/*.json` (pasos, errores
   saneados, estado) y `e2e-migrations-manifest.json` (qué se aplicó y en qué orden).
3. Estado de la base: `node scripts/e2e/reset-remote-e2e-db.mjs --inspect ...` (solo lectura).
4. Artefactos de CI solo si habilitó `vars.E2E_ISOLATED_UPLOAD_ARTIFACTS` (SEC-TS-07).

## 14. Limitaciones de extensiones y servicios

- `pg_cron` instalado (requerido por `20260803000006`); el job de expiración de
  reservas existe en la base aislada pero SU EJECUCIÓN depende del scheduler de
  la plataforma (verificar con el dashboard del proyecto aislado si se testea
  esa función).
- `btree_gist` (constraints GiST de comisiones) instalado por el bootstrap.
- `vector`/`pg_trgm` NO son requeridos por el stream (inventario FASE 0) — no se instalan.
- Servicios externos (Telegram/WhatsApp/IA) no se testean en el smoke set.

## 15. Evitar la activación accidental en PRs/pushes

- El trigger del workflow es ÚNICAMENTE `workflow_dispatch` — ningún evento
  `push`/`pull_request` aparece en `on:`. Modificar `on:` exige pasar por PR
  (los workflows con `if: false` antiguos permanecen intactos por mandato).
- **Criterios para proponer trigger por PR en el futuro:** (1) tres corridas
  manuales verdes consecutivas del smoke set; (2) orden explícita del
  propietario en un PR dedicado. Antes de eso, cualquier edición del trigger
  debe considerarse fuera de alcance.

## 16. Desviaciones documentadas (resumen)

1. Centinela diferido al final del replay (guards de inventario §3).
2. Tabla de estado del replay en schema privado `e2e_infra` (invisibilidad a
   guards de inventario + higiene).
3. 7 transformaciones del baseline + 1 del pre-tamo (`\echo`) + 1 del tramo
   (REVOKE inaplicable) — todas con motivo y evidencia en el manifiesto.
4. Función `profiles_block_privileged_update` (trigger protector out-of-band
   sin DDL versionado): no existe en E2E — su REVOKE se omitió documentado;
   los flujos que dependan de esa protección divergen (sin impacto en smoke).
5. Modo local PENDING_OWNER (sin stack local en el repo).
6. El baseline (snapshot 2026-08-28) cubre SOLO el esquema public: el
   trigger de alta de usuarios `tr_on_auth_user_created` (auth.users →
   `public.on_auth_user_created`, creado out-of-band y no versionado en
   ningún artefacto del repo) NO es reproducido por la capa de replay. Se
   materializa por el bootstrap (sección C.2 de `supabase/e2e-bootstrap.sql`)
   al final de `--apply-replay`. Hallazgo de la corrida 39777819072
   (CICLO 2): sin él, el provisioning de run-env muere en el FK
   `tenants_owner_id_fkey` (23503) porque los usuarios sintéticos creados vía
   Admin API no obtienen fila en `public.profiles`. Definición replicada
   verbatim de producción (lectura read-only autorizada, 2026-10-22).
