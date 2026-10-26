# CP-E2E-RECONCILE-001 — Regeneración determinista del manifiesto de replay (condición C1)

> **Fecha:** 2026-10-26 (America/Havana) · **Rama:** `docs/cp-e2e-reconcile-001-20261026` (exclusiva para este PR)
> **SHA base (main vigente):** `394080cf6e5d53d87aa2fe8ea20fa34bf4dcb4f5` · **SHA auditado por CP-E2E-READINESS-001:** `fd73e3edbbd6e693665e74ebab5446f7452ec6fb`
> **Objeto:** resolver la condición **C1** del expediente `docs/audits/CP_E2E_READINESS_001_COSTPROE2E.md` (§7.1): regenerar y commitear el manifiesto del replay alineado con el `main` vigente.
> **Esta misión NO ejecuta E2E, NO se conecta a CostproE2E y NO aplica migraciones a ninguna base de datos.**
> **Alcance estricto:** manifiesto determinista + esta evidencia documental. C2/C3/C4 y la corrida E2E siguen bloqueadas (§5).

---

## 0. Resumen ejecutivo

| Dimensión | Resultado | Evidencia |
|---|---|---|
| Manifiesto regenerado con el generador oficial | ✅ Tramo 72 → **93** migraciones (21 nuevas, posiciones 73–93) | `node scripts/e2e/build-migrations-replay.mjs`, exit 0 (§3.1) |
| Determinismo (`--check`) | ✅ **MATCH (sin deriva), exit 0 — dos veces** (doble regeneración byte-idéntica) | §3.5 |
| Tramo verbatim | ✅ 21/21 con `sha256_generado == sha256_original == sha256 del archivo fuente`; **0 transformaciones nuevas** | §3.3–3.4 |
| Entradas previas (1–72) | ✅ 0 cambios (verificación programática campo a campo) | §3.2 |
| Cambios ajenos | ✅ Ninguno: el árbol quedó con **exactamente 1 archivo modificado** (el manifiesto) | §3.5 |
| Migraciones out-of-band (`20261026120000`/`20261026130000`) | ✅ Replay **seguro por convergencia** (análisis sentencia a sentencia); 4 incertidumbres documentadas para C2/C3 | §4 |
| C1 | ✅ Resuelta **en esta rama** — completa cuando el propietario fusione este PR | §5.1 |

**Consecuencia práctica:** con este PR fusionado, el paso 2 del workflow («Verificar determinismo de la capa de reproducción») vuelve a dar verde sobre `main`; la ejecutabilidad de la batería queda entonces bloqueada **solo** por el estado real del esquema de la base aislada (C2–C4), que es exactamente el diseño fail-closed certificado por READINESS-001.

---

## 1. Reglas respetadas — lo que NO se ejecutó

1. **NO se ejecutó ninguna prueba E2E** ni `workflow_dispatch` ni Playwright ni `.spec.ts`. Los comandos ejecutados fueron: lecturas de git, `node scripts/e2e/build-migrations-replay.mjs` (regeneración, sin red) y `--check` (tmpdir), y un script local de verificación de hashes (sha256 de archivos del repo, sin red).
2. **NO se estableció ninguna conexión con CostproE2E** (ni lectura ni escritura): el generador no tiene ninguna ruta de red (verificado §2.4); este entorno no posee credenciales E2E.
3. **NO se ejecutaron migraciones, reset, seed, limpieza ni `supabase db push`** sobre ninguna base. El único efecto persistente es el archivo `audit-evidence/INFRA-011/e2e-migrations-manifest.json` del propio repo.
4. **Ningún secreto fue impreso** (solo nombres lógicos, SHAs y rutas).
5. **Ningún PR se fusionó**; ningún cambio de producción, permisos, RLS ni datos.

---

## 2. Fase 1 — Estado real verificado

### 2.1 GitHub

- **PR #1498 (expediente READINESS-001): FUSIONADO** el 2026-10-26T00:10:17Z (merge commit `394080cf6e`); el expediente está en `main`.
- **`main` vigente: `394080cf6e`** — incorpora además los PR IC-DIVIZA #1497/#1499/#1500 (con la migración `20261027000000_inteligencia_diviza_source.sql`) y la re-certificación del contract surface (`81a4ae801`, 153 fn, sha256 `cfd2fd63…`).
- **SHA auditado por READINESS-001:** `fd73e3e` — referencia histórica de aquel expediente; entre ese SHA y el actual `main` se fusionaron 3 PR más. Por mandato, el manifiesto se regenera sobre el **main vigente**, no sobre el auditado.
- 0 PRs abiertos al inicio de esta misión.

### 2.2 Estado inicial del repo

Clone fresco en `main @ 394080cf6e`, `git status --porcelain` **vacío** (árbol limpio, sin cambios ajenos que pudieran incluirse). Rama de trabajo exclusiva creada desde ese SHA: `docs/cp-e2e-reconcile-001-20261026`.

### 2.3 Documentación consultada

- `docs/audits/CP_E2E_READINESS_001_COSTPROE2E.md` (íntegro, 316L) — condiciones C1–C4, §4.1–4.2 (deriva), §7.1–7.3.
- `docs/e2e/E2E_AISLADO.md` (íntegro, 286L) — procedimiento oficial CP-INFRA-011: estrategia v3 baseline+tramo (§5), preparación (§6), idempotencia del apilador por sha256 contra `e2e_infra.e2e_migrations_replay_state` (§7).
- `docs/e2e/CHECKLIST_PROPIETARIO_COSTPROE2E.md` (íntegro, 128L).
- `audit-evidence/INFRA-011/` — manifiesto commiteado, evidencia remota 2026-10-22.

### 2.4 Generador verificado (`scripts/e2e/build-migrations-replay.mjs`, 381L, leído íntegro)

- **Propósito:** genera la capa de reproducción `.e2e-migrations/` (baseline certificada 2026-08-28 + pre-tamo W7 + tramo post-cutoff) y el manifiesto determinista; copia este último a `audit-evidence/INFRA-011/e2e-migrations-manifest.json` (línea 373). **Sin red ni BD**: solo `node:crypto/fs/os/path/url` + `split-sql.mjs` (splitter puro, verificado).
- **Determinismo:** manifiesto sin marcas de tiempo; serialización `JSON.stringify(…, null, 2)`; transformaciones contadas con `fatal` si difieren (188 funciones C, 6 `extensions.*`, 204 `ALTER DEFAULT PRIVILEGES`, 6/2/1/6 triggers/publications, 13 `\echo`, monotonicidad del tramo, transformación del tramo exactamente 1 vez).
- **Modo `--check`:** regenera en `fs.mkdtempSync(os.tmpdir())`, compara sha256 con el manifiesto commiteado y **borra el tmpdir** — jamás toca archivos del repo.
- **Tramo verbatim:** única transformación documentada `20261020000002_sec_definer_hardening.sql` (REVOKE inaplicable en E2E); para todo archivo sin transformación exige `sha256_generado == sha256_original` (línea 329) — garantía mecánica de verbatim.

---

## 3. Fase 2 — Regeneración y auditoría del manifiesto

### 3.1 Ejecución (rama específica, desde main vigente)

```
$ node scripts/e2e/build-migrations-replay.mjs
[build-migrations-replay] OK (v3 baseline+tramo):
  baseline: audit-evidence/20260828/.../production-schema-snapshot-20260828.sql
    sha256 original 351efa11be5f7f29… -> generado 1ed539ccc0dd7dd1… (6 event triggers + 2 publications + 1 alter-publication + 188 funciones C de btree_gist + 6 funciones de plataforma en extensions.* + 6 ALTER EVENT TRIGGER + 204 ALTER DEFAULT PRIVILEGES de roles de plataforma omitidas, todas documentadas)
  pre-tamo: 10 paquetes W7-RELEASE (out-of-band, verbatim)
  tramo incluido: 93 migraciones (> 20260828)
  excluidos: 415 (409 cubiertos por baseline + 6 no SQL)
  capa: .e2e-migrations | manifiesto sha256: ded26695de791223b3f784d702b87830fc69aaae6249c365d0d010a95adbbbbc
exit 0
```

### 3.2 Diff completo del manifiesto (inspeccionado)

`+234 / −3` sobre `audit-evidence/INFRA-011/e2e-migrations-manifest.json`:

| Campo | Manifiesto anterior (tramo 72, commit `c31c50a`) | Manifiesto regenerado |
|---|---|---|
| `total_considerados` | 487 | **508** |
| `total_incluidos` | 72 | **93** |
| `total_excluidos` | 415 | 415 (sin cambio) |
| `exclusiones_globales` | no_sql 6 · baseline 409 | idénticas (sin cambio) |
| `digest` | `a0802f985d5775ad…` | `0f2599e15cdc2974…` |
| sha256 del archivo | `05ed34f7bcf34009…` | **`ded26695de791223…`** |
| Última migración incluida | `20261023000000_create_physical_inventory_module.sql` (pos. 72) | `20261027000000_inteligencia_diviza_source.sql` (pos. 93) |

Las 3 líneas eliminadas son exactamente `total_considerados`, `total_incluidos` y `digest`; las 234 insertadas son los 2 totales, el digest y **exactamente las 21 entradas nuevas** (11 líneas por entrada). **Ninguna de las 72 entradas previas cambió** — verificado programáticamente campo a campo contra `git show HEAD:…` (script `reconcile_fase2_verify_manifest.py`: 72 comparadas, 0 cambios).

### 3.3 Las 21 migraciones incorporadas (lista exacta)

| # | Pos | Migración | bytes | sha256 (16 primeros) |
|---|---|---|---|---|
| 1 | 73 | `20261023230000_mision_caja_multimoneda_v2_24_0.sql` | 115084 | `e36ecb55ce8d1549` |
| 2 | 74 | `20261024120000_revision_final_caja_v2_24_1.sql` | 106477 | `df7a1f3725d690de` |
| 3 | 75 | `20261024150000_mision_pagos_mixtos_multimoneda_v2_25_0.sql` | 62697 | `0c4970220cb0dc53` |
| 4 | 76 | `20261024180000_auditoria_caja_idempotencia_determinista.sql` | 22218 | `8a616b5bbeaf2155` |
| 5 | 77 | `20261024220000_saldo_fisico_egresos_multimoneda.sql` | 30852 | `bf0c0d28091734a5` |
| 6 | 78 | `20261024230000_devoluciones_reembolso_fisico_moneda.sql` | 27052 | `9428ec2d51c6ea50` |
| 7 | 79 | `20261024400000_devoluciones_recuperacion_reversa.sql` | 125067 | `6154bdf96e4b185a` |
| 8 | 80 | `20261025120000_cp_money_002_postmerge_integrity.sql` | 68093 | `4f5303867b686e51` |
| 9 | 81 | `20261025130000_cp_money_002_acl_revoke_anon.sql` | 5853 | `d796f70c3d478e3c` |
| 10 | 82 | `20261026000000_caja_serializacion_commit_coherente.sql` | 101185 | `756ce7b5c196c37d` |
| 11 | 83 | `20261026100000_caja_acl_anon_revoke.sql` | 3223 | `24ea442ef06f7ccf` |
| 12 | **84** | **`20261026120000_organizaciones_superadmin_pertenencia_unica.sql`** ⚠ out-of-band | 15968 | `5cc60a88dc32ca29` |
| 13 | **85** | **`20261026130000_cp_org001_platform_role_guards.sql`** ⚠ out-of-band | 16785 | `431768e3d8acd076` |
| 14 | 86 | `20261026140000_cp_org001_tenants_rls_platform_only.sql` | 4165 | `5e32bfac567463e0` |
| 15 | 87 | `20261026150000_payment_tx_integrity.sql` | 7608 | `548c874b8ce8076b` |
| 16 | 88 | `20261026160000_superadmin_store_access.sql` | 4556 | `66fdf5f9c73ef23f` |
| 17 | 89 | `20261026170000_superadmin_active_store_trigger.sql` | 6123 | `d41d974647251faa` |
| 18 | 90 | `20261026180000_cp_org001_platform_acl_revoke.sql` | 2979 | `3fd5dc19cc248fe7` |
| 19 | 91 | `20261026200000_efectivo_fisico_disponibilidad.sql` | 24760 | `2fcd6decf0c8d9cd` |
| 20 | 92 | `20261026210000_cp_org_003_fase2_bootstrap_tenant_admin.sql` | 9704 | `13f339d72044745a` |
| 21 | 93 | `20261027000000_inteligencia_diviza_source.sql` | 95833 | `b77a9cecd2fdcc26` |

Las 20 primeras son las identificadas por READINESS-001 §4.2 sobre `fd73e3e`; la 21ª (`20261027000000`, IC-DIVIZA) entró en `main` después del SHA auditado — su inclusión es consecuencia directa del mandato de alinear el manifiesto con el **main vigente**.

### 3.4 Coherencia con los archivos fuente

- **Hashes:** las 21 entradas verificadas con sha256 real de `supabase/migrations/` — `sha256_original` del manifiesto == hash del archivo, `bytes` == tamaño real (script de verificación, 0 errores).
- **Verbatim:** las 21 con `sha256_generado == sha256_original` → copiadas sin transformación (la garantía mecánica de la línea 329 del generador). La única transformación del tramo sigue siendo la documentada `20261020000002` (ya presente en el manifiesto anterior, entrada intacta).
- **Orden:** timestamps monótonos no decrecientes en las 93 entradas; posiciones 1..93 consecutivas; regla lexicográfica del runner oficial preservada.
- **Scan de objetos de plataforma en las 21** (que habrían exigido transformación): 0 `CREATE EVENT TRIGGER`, 0 `CREATE PUBLICATION`, 0 `LANGUAGE c`, 0 `ALTER DEFAULT PRIVILEGES`, 0 `CREATE ROLE`, 0 `CREATE EXTENSION`, 0 `storage.buckets`, 0 `cron.schedule`. Las 2 menciones de `supabase_admin` son benignas: un comentario explicativo (`20261025130000`) y un chequeo `current_user NOT IN ('postgres','supabase_admin','costpro_snapshot_restorer')` dentro de un `DO` (`20261026150000`) que el apilador (rol `postgres`) satisface.
- **Conclusión:** ninguna migración nueva requiere transformación nueva — el manifiesto regenerado es 100 % verbatim en su tramo. (Conforme al mandato: no se da nada por demostrado por `IF EXISTS`; aquí ni siquiera hay bandas del generador: las 21 con `observaciones: []`.)

### 3.5 Determinismo y ausencia de cambios ajenos

```
$ node scripts/e2e/build-migrations-replay.mjs --check
[build-migrations-replay] --check: regenerado ded26695de791223… vs commiteado ded26695de791223… => MATCH (sin deriva)
exit 0
```

- Se ejecutó `--check` **dos veces**, con una re-ejecución intermedia del generador en modo normal: el manifiesto resultó **byte-idéntico** ambas veces → determinismo real, no coincidencia de una sola pasada.
- `git status --porcelain` tras todo el proceso: **exactamente 1 archivo modificado** — el manifiesto. `.e2e-migrations/` está en `.gitignore:142` y no aparece. El generador no altera archivos ajenos ni código funcional (verificado además por lectura íntegra: solo `fs.copyFileSync` hacia OUT y COMMITTED_MANIFEST).

---

## 4. Migraciones con aplicación remota incierta (análisis exigido por el mandato)

### 4.1 Contexto

READINESS-001 §4.1: la misión CP-ORG-001 aplicó **manualmente** a CostproE2E `20261026120000` y `20261026130000` (17/17 pruebas in vivo), **sin registro en `e2e_infra.e2e_migrations_replay_state`**. Consecuencia mecánica en C2: el apilador (idempotente por sha256 contra esa tabla) **las re-aplicará**. Este PR no ejecuta nada de eso; analiza estáticamente si ese replay sería seguro.

Historial de versiones en git (sha256 de cada versión):

| Migración | Versiones (fecha, sha256) | Versión actual de `main` |
|---|---|---|
| `20261026120000` | `175d689c0` 2026-10-24T20:00Z `c60896db…` → `71f081e2e` 2026-10-25T01:29Z `bbbd64a4…` (fix H-7) → `6ef429d46` 2026-10-25T02:06Z `5cc60a88…` (ACL service_role-only) | `5cc60a88…` (= aplicada al manifiesto, pos. 84) |
| `20261026130000` | `39c682dfb` 2026-10-25T01:31Z `1e9cc229…` → `6ef429d46` 2026-10-25T02:06Z `431768e3…` | `431768e3…` (= aplicada al manifiesto, pos. 85) |

El worklog de CP-ORG-001 registra «migraciones corregidas aplicadas» a CostproE2E y una **re-validación E2E tras la corrección ACL** — evidencia fuerte (pero no demostrable sin registro) de que lo aplicado fue la versión final `6ef429d46`.

### 4.2 `20261026120000_organizaciones_superadmin_pertenencia_unica.sql` (posición 84)

Efectos e idempotencia **revisada sentencia a sentencia** (no inferida de `IF EXISTS`):

| Sentencias | Efecto de la re-aplicación |
|---|---|
| 6 × `CREATE OR REPLACE FUNCTION` (`is_superadmin`, `is_admin`, `is_global_admin`, `is_admin_check`, `enforce_membership_tenant_consistency`, `assign_user_organization`) | **Convergente**: reemplaza cualquier definición previa (incluso una versión manual más vieja) por la certificación vigente; no falla nunca por objeto existente |
| 3 × `DROP POLICY IF EXISTS` + `CREATE POLICY` (`tenants_select_own_or_admin`, `tenants_select_own_or_store_member`, `stores_tenant_select`) | **Convergente**: elimina y recrea idéntica — seguro aunque la policy exista |
| 1 × `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` (`trg_membership_tenant_consistency`) | **Convergente** (idem) |
| 1 × `UPDATE public.profiles SET role='superadmin'… WHERE email='admin@demo.com' AND role='admin'` | **No-op tras la primera aplicación** (guard `AND role='admin'`: si ya es superadmin, 0 filas) |
| 1 × `DELETE` membresías de `admin@demo.com` cuando `p.role='superadmin'` | **Convergente** si ya se retiraron (0 filas). Único DML con posible efecto sobre datos creados después — ver incertidumbre 2 (§4.4) |
| 1 × `REVOKE` + `GRANT` (`assign_user_organization` → solo `service_role`) | **Idempotente**; re-afirma la ACL certificada REM-INV-6 |

**Dependencias:** exclusivamente objetos pre-baseline (`profiles`, `tenants`, `stores`, `user_store_memberships`, `user_audit_log`, `auth.uid()`/`auth.role()`). **Cero dependencias de las posiciones 73–83** → en el orden lexicográfico del replay se re-aplica tras ellas sin prerrequisitos insatisfechos. El comportamiento funcional (trigger 23514, ACL 42501, guardas vía service_role) fue validado in vivo 17/17 por CP-ORG-001 sobre la propia base aislada.

### 4.3 `20261026130000_cp_org001_platform_role_guards.sql` (posición 85)

Contenido: 4 × `CREATE OR REPLACE FUNCTION` (`managed_update_user`, `managed_toggle_user_status`, `managed_soft_delete_user`, `managed_reset_password`) + 4 × `REVOKE`/`GRANT` (service_role-only) + 4 × `COMMENT ON FUNCTION`. **Cero DML** (revisado sentencia a sentencia; el propio encabezado lo declara). Re-aplicación **100 % convergente**: reemplaza los cuerpos por la versión vigente y re-afirma ACLs; incluso en el escenario improbable de que la base conservara la firma legada de `20260820000001`, el `OR REPLACE` con la firma actual es no-regresivo (no empeora ningún estado previo).

### 4.4 Conclusión e incertidumbre persistente

**El replay de ambas migraciones en C2 es SEGURO por convergencia**: `CREATE OR REPLACE` + `DROP…IF EXISTS`/`CREATE` + `REVOKE`/`GRANT` llevan el estado al certificado en el repo actual, sea cual sea la versión que se aplicó manualmente. La re-aplicación no es un riesgo añadido sino una **garantía**: elimina la única divergencia conocida entre la base aislada y el manifiesto (READINESS §4.1).

Incertidumbres que persisten y quedan documentadas para C2/C3 (ninguna bloquea C1):

1. **Versión exacta aplicada manualmente desconocida** (la tabla de estado no la registra). La re-aplicación la resuelve por convergencia; C3 (`--verify`/`--contract`) confirmará el estado final.
2. **`DELETE` de membresías de `admin@demo.com`** (único DML con efecto potencial sobre datos posteriores): retiraría membresías creadas para esa cuenta después de la aplicación original. En E2E los fixtures usan identidad sintética `e2e-<slug>-…@costpro.test` (READINESS §3.6), no esa cuenta; y el estado resultante (superadmin sin membresías) es exactamente el objetivo de CP-ORG-001. Verificar en C3.
3. **Paso de activación posiblemente no-op**: el baseline es schema-only (0 INSERTs), por lo que `admin@demo.com` puede no existir en la base aislada → el UPDATE afecta 0 filas y **no es fallo** (0 filas ≠ error SQL). Sin conexión a la BD no es verificable en esta misión.
4. **Las otras 19 migraciones nuevas** (posiciones 73–83 y 86–93) no tienen hoy evidencia de aplicación en la base aislada; su contenido/dependencias específicas NO se auditaron en esta misión (C1 cubre el manifiesto): pertenecen a C2, donde el apilador se detiene fail-closed ante el primer error y `--inspect` permite el diagnóstico de solo lectura.

---

## 5. Limitaciones y condiciones pendientes antes de C2

1. **C1 completa solo tras la fusión de este PR por el propietario** — el gate de determinismo corre sobre `main`; hasta la fusión, `--check` sobre `main` seguirá dando DERIVA (el manifiesto commiteado sigue siendo el tramo 72).
2. **C2 (aplicación del tramo 73–93 a CostproE2E)**: requiere **autorización independiente del propietario** y credenciales locales del apilador (`SUPABASE_ACCESS_TOKEN` o `E2E_SUPABASE_DB_URL`, nunca en CI): `--inspect --i-understand-this-is-destructive` (solo lectura) → `--apply-replay --i-understand-this-is-destructive`. Aplicará 21 archivos; las 2 out-of-band se re-aplicarán (análisis §4: seguro por convergencia).
3. **C3**: `--verify` → `PREPARADA`; `--contract` contra `supabase/security-contract/contract-surface.sql` **vigente** — hoy **153 fn** re-certificado tras IC-DIVIZA (`81a4ae801`, sha256 `cfd2fd63…`); el «137/137» de 2026-10-22 quedó histórico y NO debe usarse como referencia de cierre. Commitear la evidencia en `audit-evidence/INFRA-011/remote/`.
4. **C4**: re-verificación pre-corrida automática (los pasos 1–3 del workflow re-ejecutan `check-e2e-config`, `--check` y `verify-remote-e2e` con centinela).
5. **Pendientes ajenos a C1 que este PR NO resuelve** (READINESS-001): hallazgo SEC **POS-007** (`create_sale_v2` cross-store, decisión del propietario); `E2E-INV-007` activo; recomendación §7.3 (protección del entorno `e2e-isolated` con required reviewers + restricción a `main`, separación de `protected-resources.json` por entorno).
6. **La ejecución E2E sigue bloqueada** hasta demostrar C1–C4. Este PR no autoriza ninguna corrida.

---

## 6. Tabla de control (mandato → resultado)

| # | Control | Resultado | Evidencia |
|---|---|---|---|
| 1 | Estado de PR #1498 y `main` vigente | ✅ Fusionado (merge `394080cf6e`) = main vigente; SHA auditado `fd73e3e` documentado | §2.1 |
| 2 | Lectura de expediente READINESS-001 y procedimiento CP-INFRA-011 | ✅ Íntegros | §2.3 |
| 3 | Existencia/config/propósito del generador | ✅ 381L sin red ni BD; determinista; validaciones fail-closed | §2.4 |
| 4 | Estado inicial sin cambios ajenos | ✅ Clone limpio, rama exclusiva | §2.2 |
| 5 | Regeneración con el generador oficial en rama específica desde main vigente | ✅ exit 0, tramo 93 | §3.1 |
| 6 | Diff completo del manifiesto inspeccionado | ✅ +234/−3, solo las 21 entradas + totales/digest | §3.2 |
| 7 | Nombres/hashes/orden coherentes con la fuente | ✅ 21/21 verbatim, bytes y sha256 verificados, orden monótono | §3.3–3.4 |
| 8 | Migraciones out-of-band investigadas sin asumir idempotencia por `IF EXISTS` | ✅ Análisis sentencia a sentencia; replay seguro por convergencia; 4 incertidumbres documentadas | §4 |
| 9 | `--check` → MATCH, exit 0 | ✅ Dos veces (doble regeneración byte-idéntica) | §3.5 |
| 10 | El generador no altera archivos ajenos | ✅ Solo 1 archivo modificado; `.e2e-migrations` gitignored | §3.5 |
| 11 | PR exclusivo (manifiesto + evidencia estricta), sin fusión | ✅ Este PR | — |
| 12 | No declarar resuelta C2 ni autorizar la corrida | ✅ C2–C4 y E2E siguen bloqueadas | §5 |

---

## 7. Respuestas explícitas al mandato

1. **¿Se ejecutó alguna prueba E2E o `workflow_dispatch`?** NO.
2. **¿Se conectó a CostproE2E?** NO (cero conexiones; el generador no tiene ruta de red).
3. **¿Se ejecutaron migraciones/reset/seed/escrituras remotas/`supabase db push`?** NO — el único efecto persistente es el manifiesto del repo.
4. **¿El manifiesto es determinista y coherente con el main vigente?** SÍ: tramo 93/487→508 considerados, 21 nuevas verbatim con hash verificado contra la fuente, `--check` MATCH ×2.
5. **¿Por qué el replay de las out-of-band sería seguro? ¿Qué incertidumbre persiste?** §4: convergencia por `CREATE OR REPLACE`/`DROP+CREATE`/`REVOKE+GRANT`; persisten 4 incertidumbres (versión aplicada, DML de membresías de `admin@demo.com`, posible no-op de activación, contenido de las otras 19 migraciones) — todas para C2/C3, ninguna bloquea C1.
6. **¿Queda resuelta C2 o autorizada la corrida E2E?** NO — solo C1, y completa cuando el propietario fusione este PR.
7. **Misión siguiente** (cuando este PR esté fusionado): revisar la fusión, ejecutar C2 con el apilador oficial bajo autorización de escritura independiente (procedimiento E2E_AISLADO §6), luego C3/C4, y solo entonces plantear la corrida E2E (READINESS §7.2).

**Archivos examinados:** `scripts/e2e/build-migrations-replay.mjs` (íntegro), `scripts/e2e/split-sql.mjs` (íntegro), `audit-evidence/INFRA-011/e2e-migrations-manifest.json` (viejo vía `git show HEAD:…`, nuevo íntegro), las 21 migraciones de `supabase/migrations/` (hashes; lectura completa de las 2 out-of-band), `supabase/security-contract/contract-surface.sql` (referencia del apilador, línea 503 de `reset-remote-e2e-db.mjs`), `.gitignore`, `docs/e2e/E2E_AISLADO.md`, `docs/e2e/CHECKLIST_PROPIETARIO_COSTPROE2E.md`, `docs/audits/CP_E2E_READINESS_001_COSTPROE2E.md`.

**Comandos ejecutados (todos sin red ni BD):** `git status/branch/checkout -b/rev-parse/log --follow/show/merge-base --is-ancestor` · `ls`/`rg` locales · `node scripts/e2e/build-migrations-replay.mjs` (×2, modo normal) · `node scripts/e2e/build-migrations-replay.mjs --check` (×2, MATCH exit 0) · `sha256sum` · script local de verificación de coherencia (`/home/z/my-project/scripts/reconcile_fase2_verify_manifest.py`) · API de GitHub de solo lectura (estado del PR #1498, `main`).
