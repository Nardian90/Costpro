# CP-E2E-RECONCILE-003 — Replay controlado de CostproE2E (C2) y verificación (C3) — FALLO DETERMINISTA EN POSICIÓN 75

> **Fecha:** 2026-10-27 (UTC) · **Base objetivo:** `CostproE2E` (ref `lguovmvrozxgssupkwpf`, us-east-1) ·
> **Código:** `main` @ `f1611c3560da0e32b4e09bc989044170d12ab48f` (+ commit del manifiesto `6ac6e02ca`) ·
> **Manifiesto:** 94 posiciones, digest `5ceff26cff21d54f…`, sha256 de archivo `43c9a77cd779098b…`
>
> **RESULTADO:**
> **C2 — FALLIDO (bloqueo determinista en posición 75; 3/23 posiciones aplicadas y registradas: 72, 73, 74; cero daño, rollback íntegro probado).**
> **C3 — NO EJECUTADO como certificación** (los modos oficiales `--verify`/`--contract` se ejecutaron como **diagnóstico de solo lectura**: `INCOMPLETA` 74/94; contrato vigente 151 fn con 2 faltantes).
> **E2E — SIGUE NO AUTORIZADA.** La base NO queda reconciliada. La causa raíz es un defecto de determinismo del propio stream de migraciones, ya documentado por el propio repo en CP-MONEY-002 §9.2.

---

## 0. Resumen ejecutivo

Esta misión ejecutó por primera vez el replay autorizado (C2) sobre la base aislada `CostproE2E` con el apilador oficial. El preflight se completó íntegro: identidad re-acreditada, centinela true, manifiesto recalculado en `main` vigente con invarianza 1–93 probada y posición 94 nueva (PR #1502) analizada antes de su inclusión, `--check` MATCH exit 0, y las cuatro sondas de migraciones sensibles (§5 del mandato) confirmadas 0 filas de efecto DML. La puerta de decisión de §6 se superó con las ocho condiciones en verde.

La aplicación comenzó correctamente: las posiciones 72, 73 y 74 se aplicaron y registraron con hash exacto del manifiesto (normalizando las tres primeras out-of-band). En la **posición 75** (`20261024150000_mision_pagos_mixtos_multimoneda_v2_25_0.sql`) el apilador se detuvo con `42725: function name "public.create_sale_v2" is not unique`. El análisis forense posterior estableció tres hechos: **(a)** la ejecución fue transaccional y el rollback fue íntegro (censo en vivo: los overloads de `create_sale_v2` siguen siendo exactamente `/26`+`/31`; el `/32` de v2.25 no existe — la base quedó como si la 75 jamás se hubiera ejecutado); **(b)** el fallo es **determinista**: el `COMMENT ON FUNCTION public.create_sale_v2 IS …` final de la migración no califica la lista de argumentos y es ambiguo en cuanto coexisten dos firmas — condición que el propio estado del stream produce en esa posición (la 73 crea `/31` junto al `/26` que ninguna migración elimina); **(c)** el propio repositorio ya lo había predicho y certificado con evidencia S-06 en `docs/audits/CP_MONEY_002_POSTMERGE_AUDITORIA_2026-10-24.md` §9.2: «Aplicar antes 20261024150000 en producción ABORTA inofensivamente con 42725 y hace rollback completo».

La consecuencia estructural: la posición 80 (companion) también contiene un `COMMENT ON FUNCTION` sin lista de argumentos (línea 1253), de modo que incluso salvando la 75, la 80 volvería a abortar sobre el `/26` que el stream nunca retira. El estado certificado final («UNA sola firma de /32») solo es alcanzable desde el estado **driftado** de producción (una única firma `/31`), no desde el estado fiel del stream que el replay reproduce con más fidelidad que la propia historia productiva. El apilador hizo exactamente lo que debe: parar en el primer error, marcar `fallida`, conservar evidencia y no tocar nada más.

Conforme al mandato §7 (reglas 2, 3, 5, 6, 7) no se reintentó (el fallo es reproducible por construcción), no se saltó la posición, no se modificó SQL, no se compensó nada a mano y no se alteró el registro para simular éxito. C3 se ejecutó en modo diagnóstico de solo lectura para dejar constancia oficial del estado: `--verify` = `INCOMPLETA` (74/94 aplicadas, 1 fallida; centinela true, baseline exacto, 8/8 tablas esenciales, RLS 155/155) y `--contract` = 2 funciones certificadas faltantes (`pay_commission`, `register_cash_adjustment`, ambas de la posición 82 bloqueada tras la 75) contra el contrato **vigente de 151 funciones** — no el histórico 137/137.

**Dictamen:** C2 Fallido; C3 No ejecutado (certificación); se requiere una misión de remediación autorizada por el propietario (§13) antes de reintentar el replay. E2E permanece bloqueada hasta C1–C4.

---

## 1. Estado inicial verificado (§2 del mandato — verificado, no asumido)

| Verificación | Resultado | Evidencia |
|---|---|---|
| PR #1501 (RECONCILE-001, manifiesto 93) | `state=closed merged=true`, merge SHA `9aa6e1f65`, fusionado 2026-10-26T00:38:19Z | API GitHub |
| PR #1502 (IC-DIVIZA-002, funcional) | `merged=true`, merge SHA `19877d0ce`, fusionado 2026-10-26T01:10:14Z — **añade la migración `20261027010000_exchange_rates_source_updated_at.sql`** | API GitHub + `git diff 9aa6e1f65..f1611c356` |
| PR #1503 (RECONCILE-002, preflight) | `merged=true`, merge SHA `f1611c356`, fusionado 2026-10-26T01:23:39Z | API GitHub |
| `main` vigente | `f1611c3560da0e32b4e09bc989044170d12ab48f` | API GitHub (`branches/main`) |
| Manifiesto en `main` | Presente (93 posiciones al arranque) | API contents |
| Expediente RECONCILE-002 en `main` | Presente (`docs/audits/CP_E2E_RECONCILE_002_PREFLIGHT.md`) | API contents |
| Árbol local | Limpio; rama exclusiva `docs/cp-e2e-reconcile-003-replay-20261026` desde `f1611c356` | `git status` |
| Operación de replay concurrente | Ninguna (0 filas `progreso`/`BASELINE:progress`; estado estable idéntico al preflight) | `inspect.json` |

### 1.1 Migración nueva en `main` respecto al preflight — análisis de diferencias (no aplicación automática)

`main` contiene **una** migración nueva respecto al último preflight: `20261027010000_exchange_rates_source_updated_at.sql` (52 líneas, 2789 bytes, sha256-original `b3b2bd4cae7dc5d0…`). Se analizó **antes** de recalcular el inventario:

- Contenido íntegro: `ALTER TABLE public.exchange_rates ADD COLUMN IF NOT EXISTS source_updated_at timestamptz` + `COMMENT ON COLUMN` + bloque `DO` de sanidad que exige que la columna sea nullable y sin default.
- **DDL 100% aditivo e idempotente. Cero DML. Cero funciones/políticas/triggers tocados.** Ninguna fila ni valor existente cambia.
- La superficie certificada cubre funciones, no columnas (el propio encabezado de la migración lo documenta).

### 1.2 Recálculo del inventario y comprobación de hashes

Se ejecutó `node scripts/e2e/build-migrations-replay.mjs --check` **sobre `main` intacto primero**: resultado **DERIVA DETECTADA, exit 1** (regenerado `43c9a77cd779098b…` vs commiteado `ded26695de791223…`) — deriva causada exclusivamente por la posición 94 nueva. A continuación se regeneró el manifiesto en la rama de la misión y se comparó programáticamente archivo a archivo contra el manifiesto auditado por RECONCILE-001/002 (evidencia `manifest-diff-93a94.json`):

| Dimensión | Resultado |
|---|---|
| Considerados | 508 → **509** (+1 archivo) |
| Incluidos | 93 → **94** |
| Baseline `sha256_generado` | `1ed539ccc0dd7dd1…` **idéntico** |
| Pre-tamo (10 paquetes W7) | **idénticos** (archivo, orden, hash generado) |
| Posiciones 1–93 (nombre, posición, bytes, sha256_original, sha256_generado, estado, razón) | **CERO diferencias** |
| Única adición | posición **94** = `20261027010000_exchange_rates_source_updated_at.sql` |
| Excluidos | mismos nombres y mismas razones (409 cubiertos por baseline + 6 no SQL) |

`--check` tras la regeneración: **MATCH (sin deriva), exit 0**. Commit del manifiesto: `6ac6e02ca`. Digest nuevo: `5ceff26cff21d54f…`.

### 1.3 Condiciones y limitaciones del preflight anterior revisadas

Se releó el expediente RECONCILE-002 completo: 22 pendientes previstas (72–93), 10 con efectos out-of-band presentes, 0 divergencias de hash, incertidumbres documentadas (versiones intermedias 76–78, centinela REST sin verificar, cifra «39» del encabezado de pos 87). **La variación real respecto al preflight es exactamente +1 posición (94)** y queda explicada por el PR #1502; ninguna otra cifra cambió. El inventario NO se forzó a 22: el estado real arrojó **23 pendientes (72–94)**.

---

## 2. Verificación de credenciales y destino (§3 del mandato)

### 2.1 Revisión de implementación (antes de conectar)

- `docs/e2e/E2E_AISLADO.md` (286 L): releído; los modos oficiales y el origen de credenciales (Settings → API del proyecto E2E; gestor de secretos) confirmados vigentes.
- `scripts/e2e/reset-remote-e2e-db.mjs` (545 L): releído íntegro. **`--inspect` confirmado de solo lectura en el código vigente**: precondiciones sin red (veto de producción línea 85; igualdad exacta URL↔allowlist línea 94), `verifyProjectName()` = GET de Management API (143–150), guard `assertIsolatedDb({mode:'bootstrap'})` (227), `inspectState()` = 7 SELECT exclusivos (153–170). **`--verify` y `--contract` confirmados de solo lectura** (480–499 y 501–531: SELECT + censo + comparación; `--contract` solo escribe el artefacto local `contract-compare.json`). **`--apply-replay` confirmado como aplicación incremental** (364–478: salto por hash de lo registrado, una migración a la vez, parada al primer error, registro `aplicada`/`fallida`, centinela sección C + verificación REST final): **no es un reset** y el parámetro `--i-understand-this-is-destructive` no habilita ningún otro modo.
- `e2e/fixtures/assert-isolated-db.ts` (258 L): releído íntegro. Fail-closed puro; caso A (producción) rechazado por host/ref **sin conectar**; caso B exige `E2E_TARGET_KIND=project` + `E2E_ALLOWED_REMOTE_REF` con igualdad exacta; caso D centinela `=== true`.
- `scripts/e2e/build-migrations-replay.mjs` (382 L): releído; transformaciones del baseline y del tramo sin cambios desde RECONCILE-001 (el mapa de transformaciones contiene exclusivamente la entrada documentada de `20261020000002`).

### 2.2 Identidad del proyecto (re-acreditada)

- Management API GET `/v1/projects/lguovmvrozxgssupkwpf`: **name=`CostproE2E`, ref=`lguovmvrozxgssupkwpf`, region=us-east-1, status=ACTIVE_HEALTHY** (creado 2026-10-22). Único proyecto E2E del inventario; producción `CostproBD` (ref `wthkddeleylijmonclxg`) sigue vetada por el guard Caso A — **nunca se conectó**.
- Centinela en vivo (SQL): `public.e2e_is_isolated_db()` = **true** (`inspect.json`).
- Centinela vía **REST** con la service key E2E (limitación nº 2 del preflight, ahora cerrada): guard normal OK en `--verify` y `--contract` (`guard-normal-centinela — destino validado con centinela true`).

### 2.3 Credenciales (gestor de secretos autorizado; sin secretos en el expediente)

- `E2E_SUPABASE_SERVICE_ROLE_KEY` **no existía localmente** (pendiente del preflight). Se obtuvo del **gestor de secretos oficial de Supabase (Management API, `GET /v1/projects/{ref}/api-keys`)** usando el `SUPABASE_ACCESS_TOKEN` ya configurado por el propietario en `.env` (entorno seguro ya configurado, per mandato §3). No se pidió al propietario pegar secretos en el chat.
- Verificación **anti-crosstalk** en el script de obtención: la clave E2E obtenida **no coincide** con la clave de producción de `.env` (aserción ejecutada; longitud y huella sha256 registradas en consola, nunca el valor).
- Almacenamiento: `/home/z/costpro/.env.local` con `E2E_SUPABASE_URL=https://lguovmvrozxgssupkwpf.supabase.co`, `E2E_TARGET_KIND=project`, `E2E_ALLOWED_REMOTE_REF=lguovmvrozxgssupkwpf`, `E2E_SUPABASE_SERVICE_ROLE_KEY=<E2E>`. `.gitignore` cubre `.env*` (verificado `git check-ignore`) → **no versionado**. El apilador carga `.env.local` con override.
- La clave de producción **no se usó en ninguna operación**: la cadena de precedencia del apilador (`E2E_SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SERVICE_ROLE_KEY`) quedó resuelta siempre por la variable E2E; el veto de URL impide además cualquier destino productivo.
- Escaneo de secretos en toda la evidencia versionada: **0 coincidencias** (`sb_secret`, `sbp_`, `github_pat`).

---

## 3. Preflight remoto inmediatamente anterior al replay (§4 del mandato)

Comando ejecutado (tras confirmar solo lectura en código): `node scripts/e2e/reset-remote-e2e-db.mjs --inspect --i-understand-this-is-destructive --evidence-out=audit-evidence/INFRA-011/remote/replay-003` → **exit 0**.

| # | Comprobación exigida | Resultado |
|---|---|---|
| 1 | Nombre/ref/estado del proyecto | `CostproE2E` / `lguovmvrozxgssupkwpf` / `ACTIVE_HEALTHY` ✓ |
| 2 | Centinela actual | `true` ✓ |
| 3 | Identidad de la conexión del apilador | URL E2E + allowlist exacta + guard ✓ (§2) |
| 4 | Estado de `e2e_infra.e2e_migrations_replay_state` | 87 filas: 82 `aplicada` + 2 `fallida` + 3 `limpiada` ✓ |
| 5 | Migraciones `aplicada`/`fallida`/`limpiada` | 82 = 1 baseline + 10 pre-tamo + 71 tramo; 2 `fallida` y 3 `limpiada` son artefactos v1 históricos ajenos al manifiesto (202401230002, 20240801; 202401230001, 20240325000000, 20240725) ✓ |
| 6 | Hashes registrados vs manifiesto | baseline sha exacto `1ed539ccc0dd7dd1…`; pre-tamo 10/10 exactos; tramo 71/71 exactos — **0 divergencias de hash** ✓ |
| 7 | Inventario actualizado de pendientes | **23 posiciones (72–94)** — ver tabla §4 del preflight + posición 94 nueva ✓ |
| 8 | Migraciones out-of-band y efectos sobre datos | 10 con efectos presentes (72,73,74,84,85,86,87,88,89,90) — revalidadas por sonda §4 de esta misión (infra) ✓ |
| 9 | Ausencia de discrepancias nuevas | Censo idéntico al preflight (155 tablas, 510 funciones, sentencia/bucket/extensiones) + única variación explicada (pos 94) ✓ |

Censo: **155 tablas public**, **510 funciones public**, extensiones completas, 4 roles shim, bucket `reports` privado. Análisis completo en `inspect-analysis.json`.

---

## 4. Revalidación de operaciones sensibles (§5 del mandato) — sondas de solo lectura

Sonda persistida y versionada: `sonda5-migraciones-sensibles.json` (todas las consultas validadas fail-closed SELECT-only antes de enviarse; transporte Management API).

### 4.1 `20261026120000` (pos 84) — organizaciones_superadmin_pertenencia_unica

| Comprobación en vivo | Resultado |
|---|---|
| Perfil `admin@demo.com` | Existe; `role='superadmin'`, `store_id=NULL`, `active_store_id=NULL`, `deleted_at=NULL` |
| Membresías de `admin@demo.com` | **0** |
| Filas que tocaría el `UPDATE … WHERE email='admin@demo.com' AND role='admin'` | **0** |
| Filas que tocaría el `DELETE … WHERE p.role='superadmin'` | **0** |
| Trigger sobre `user_store_memberships` | `trg_membership_tenant_consistency` + `update_user_store_memberships_updated_at`, activos |
| Policies de la 84 (tenants×2 + stores×1) | `tenants_select_own_or_admin`, `tenants_select_own_or_store_member`, `stores_tenant_select` — **3/3 presentes** (las 4 policies `memberships_*` provienen de migraciones pre-baseline de junio/agosto, ajenas a esta posición) |
| ACL `assign_user_organization` | `{postgres=X, service_role=X}` — solo service_role, versión final |

**Conclusión:** revalidada la condición de no-op del DML de la 84 contra el estado actual (idéntica al preflight). Sin cambios de estado → la operación sigue siendo convergente y segura.

### 4.2 `20261026130000` (pos 85) — cp_org001_platform_role_guards

Las 4 funciones (`managed_update_user`, `managed_toggle_user_status`, `managed_soft_delete_user`, `managed_reset_password`) existen como `SECURITY DEFINER` con ACL final `{postgres=X, service_role=X}` — **anon/authenticated ya revocados**. El replay converge a la versión certificada del repositorio y registra la posición. Cero DML top-level en el archivo. ✓

### 4.3 `20261026150000` (pos 87) — payment_tx_integrity

| Comprobación en vivo | Resultado |
|---|---|
| Filas en `payment_transactions_purga_20261026_archive` | **2** (idéntico al preflight) |
| Huérfanas de `payment_transactions` (store inexistente) | **0** |
| Filas que tocaría el `INSERT` de archivo si se aplicara hoy | **0** |
| Filas que tocaría el `DELETE` de purga si se aplicara hoy | **0** |
| FK `payment_transactions_store_id_fkey` | Presente |
| RLS de la tabla de archivo | Habilitada |

Sin datos inesperados, sin nuevas huérfanas, sin borrados de alcance no acotable. La discrepancia documentada del encabezado («39» históricos vs 2 archivadas) sigue siendo solo narrativa. El `DO` de verificación final exige 0 residuos — pasaría. ✓

### 4.4 Caja y `create_sale_v2` (pos 73–82) — dependencias y orden

- Overloads de `create_sale_v2` en remoto antes del replay: exactamente **dos** — `/31` (v2.24.1, 31 args, termina `p_change_currency text`; con `anon` en ACL) y `/26` (26 args, termina `p_payment_incidents jsonb`). La firma `/31` **coincide exactamente** con el `DROP FUNCTION IF EXISTS` de la posición 80 (verificado firma a firma). Sin riesgo de sobrecarga huérfana.
- Funciones de la cadena caja: `create_cash_flow_document` (1), `create_devolution_v2` (2), `create_store_with_membership` (1), `open_cash_shift` (1), `reverse_transaction_v2` (1) presentes; `get_cash_balances_by_currency` y `pay_commission` **ausentes** (las crearán las posiciones 93/82); marcador v2.25 (`p_payment_components`) ausente (lo crea la 75); columna `source_updated_at` ausente (la crea la 94).
- El orden del apilador (lexicográfico 72→94) es el orden de dependencias del propio stream; no se alteró ni omitió nada.

**Todas las condiciones de §5 del mandato se cumplieron sin cambios de estado respecto al preflight.**

---

## 5. Puerta de decisión antes de la escritura (§6 del mandato) — superada en su momento

| # | Condición | Estado al abrir la puerta |
|---|---|---|
| 1 | `main` en SHA auditado + `--check` MATCH | ✓ `f1611c356` + MATCH exit 0 (tras recálculo documentado §1.2) |
| 2 | Identidad exacta de CostproE2E re-acreditada | ✓ Management API + guard + allowlist exacta |
| 3 | Centinela responde | ✓ true (SQL) |
| 4 | Credencial exclusiva de CostproE2E | ✓ Management API + anti-crosstalk + gitignored |
| 5 | Apilador oficial único mecanismo | ✓ implementación re-verificada (aplicación incremental, no reset) |
| 6 | Sin replay concurrente | ✓ 0 filas de progreso; censo estable |
| 7 | Efectos sobre datos comprendidos y acotados | ✓ sondas §4: DML 0 filas, purga 0 filas, sin DROP TABLE/TRUNCATE |
| 8 | Sin divergencias de hash ni incertidumbres materiales | ✓ 71/71 exactos; 1–93 invariantes; única novedad (pos 94) analizada |

**Nota metodológica:** la condición 8 se evaluó con la evidencia disponible en ese momento (el censo de firmas de §4.4 y el preflight). El fallo posterior de la posición 75 reveló una **incertidumbre material no detectable por las sondas**: la ambigüedad del `COMMENT` sin lista de argumentos de la propia migración 75 ante el estado de doble overload `/26`+`/31` que el stream produce legítimamente en esa posición. Este expediente lo documenta como hallazgo principal (§6–§7).

---

## 6. C2 — Aplicación del replay oficial: ejecución y fallo determinista en posición 75

### 6.1 Comando exacto y salida

```
node scripts/e2e/reset-remote-e2e-db.mjs --apply-replay --i-understand-this-is-destructive \
  --evidence-out=audit-evidence/INFRA-011/remote/replay-003
```

Última confirmación previa: implementación y argumentos corresponden a **aplicación incremental** del manifiesto de 94 posiciones (baseline por hash registrado → salto; pre-tamo por hash registrado → salto; tramo una a una; parada al primer error), **no a un reset**. Sin operación simultánea, sin saltos, sin edición de SQL.

Salida (extracto; evidencia íntegra en `apply-replay.json`):

```
OK   guard-identidad-replay — identidad validada (centinela diferido al final del replay: desviación documentada)
OK   tabla-estado-replay — e2e_infra.e2e_migrations_replay_state (IF NOT EXISTS)
OK   baseline-ya-aplicado — sha coincide — reanudación
FAIL replay 20261024150000_mision_pagos_mixtos_multimoneda_v2_25_0.sql —
     (HTTP 400) ERROR 42725: function name "public.create_sale_v2" is not unique
     HINT: Specify the argument list to select the function unambiguously. (posición 75)
FAIL resultado — la migración … FALLÓ en la posición 75 — replay DETENIDO.
```

Posiciones 72, 73 y 74 aplicadas y registradas con hash exacto del manifiesto (`fd483761397c79f3…`, `e36ecb55ce8d1549…`, `df7a1f3725d690de…` — coinciden con la tabla §6.3 del preflight). Posición 75 marcada `fallida` con el error saneado. **Exit 1.**

### 6.2 Comportamiento del apilador: correcto en todos los términos

- Parada en el primer error (regla §7.5 del mandato): sin continuar ciegamente.
- Registro: 75 = `fallida` con diagnóstico; 72–74 = `aplicada` con hash del manifiesto.
- **Sin efectos parciales:** la ejecución multi-sentencia vía `/database/query` es transaccional (protocolo simple de PostgreSQL). Prueba en vivo tras el fallo (`sonda-post-replay-75.json`): los overloads de `create_sale_v2` siguen siendo **exactamente 2** (`/26` y `/31`); la firma `/32` de v2.25 **no existe**; el estado es indistinguible de «la 75 jamás se ejecutó». El `CREATE OR REPLACE` inicial de la 75 y sus dos `GRANT` quedaron revertidos con el `COMMENT` ambiguo.
- Sin compensaciones, sin rollback improvisado, sin reset/seed/limpieza, sin reordenar, sin tocar los 44 perfiles sintéticos ni ningún dato.

### 6.3 ¿Reintento? No — determinismo demostrado

El mandato §7.5 exige evaluar antes de cualquier reintento. La evaluación concluyó que **un reintento reproduce idénticamente el fallo**: el `COMMENT ON FUNCTION public.create_sale_v2 IS …` de la línea 1183 no califica argumentos; con `/26`+`/31` presentes (estado inalterado tras el rollback), el `CREATE OR REPLACE` de la `/32` recrea la condición de ambigüedad y el `COMMENT` aborta de nuevo con 42725. No se reintentó. El propio repositorio ya lo había demostrado con evidencia S-06 en CP-MONEY-002 §9.2 (§7 de este expediente).

---

## 7. Causa raíz: defecto de determinismo del stream de migraciones

### 7.1 Linaje de firmas de `create_sale_v2` en el stream

| Firma | Origen (posición ≤71 salvo indicación) | Eliminación |
|---|---|---|
| `/22` (pre-baseline, termina `timestamptz, uuid`) | era pr4_4e, materializada en baseline | `DROP` calificado en `20260927000001` (esec_final) |
| `/24` (termina `p_discount_reason`) | creada por `20260927000001` | `DROP` calificado en `20261018000001` (drop_legacy) |
| `/26` (termina `p_payment_incidents`) | creada por `20261017000000` (pos_payment_incidents) | **NINGUNA migración del stream la elimina** (verificado: `grep` exhaustivo de `DROP FUNCTION` × `create_sale_v2` en todo `supabase/migrations/`) |
| `/31` (v2.24.x, termina `p_change_currency`) | creada por `20261023230000` (**pos 73**; reemplazada in place por la 74, misma firma) | `DROP` calificado en `20261025120000` (**pos 80**), programado DESPUÉS de la 75 |
| `/32` (v2.25, termina `p_payment_components`) | creada por `20261024150000` (**pos 75**) | — (firma final certificada) |

Estado del stream aplicado fielmente en la posición 75: `/26` + `/31` → el `CREATE OR REPLACE` de la `/32` produce la tercera firma y el `COMMENT` **sin lista de argumentos** de la propia 75 (línea 1183) es ambiguo → `42725`.

### 7.2 El repositorio ya lo había predicho y certificado

`docs/audits/CP_MONEY_002_POSTMERGE_AUDITORIA_2026-10-24.md`:

- **§9.2 «D2 REFORZADO — la migración 20261024150000 ni siquiera era aplicable a producción (42725)»**: «Aplicada sobre una BD con la firma `/31` viva (réplica exacta del estado productivo, PostgreSQL 18 aislado), la migración de #1467 **aborta con `42725: function name "public.create_sale_v2" is not unique`** y hace **rollback completo** (evidencia S-06). Causa: su `COMMENT ON FUNCTION public.create_sale_v2 IS …` final no califica la lista de argumentos…». **Este expediente reproduce ese comportamiento con exactitud sobre la base aislada real.**
- §9.6 (procedimiento productivo certificado): en estados con `/31` viva se prescribe aplicar directamente la companion `20261025120000` (posición 80) porque es auto-suficiente; aplicar antes la `20261024150000` «ABORTA inofensivamente con 42725… no deja daño, pero no aporta nada».

### 7.3 Por qué producción pasó y el replay no; por qué la 80 también bloquearía

- **Producción llegó a la posición 75 en estado driftado** (una única firma `/31` viva — «base v2.24.x = 1 overload /31» según la réplica certificada de CP-MONEY-002; mecanismo real de aplicación productiva no documentado en el repo, §10.3 de aquel expediente: `schema_migrations` desactualizado desde 2026-06-15). El replay E2E, en cambio, reproduce el stream **con más fidelidad que la propia historia productiva**: el baseline deja la `/26` (creada por la posición ≤71 `20261017000000`) y la 73 añade legítimamente la `/31`.
- **La posición 80 también contiene un `COMMENT ON FUNCTION public.create_sale_v2 IS` sin lista de argumentos** (línea 1253). Aunque se salvara la 75, sobre el estado fiel del stream la 80 abortaría igual: su `DROP` retira solo la `/31` y quedaría `/26`+`/32` en el momento de su propio `COMMENT`. El texto certificado de la companion («UNA sola firma de 32 params — overload legado de 31 eliminado — D2») describe el estado final de producción, no un estado alcanzable desde el stream fiel sin retirar también la `/26`.
- El prefacio de RECONCILE-002 §6.3 ya advirtió esta clase de riesgo («la existencia de una función con el nombre correcto no demuestra que su firma…»); la sonda §4.4 de esta misión verificó las firmas pero no podía detectar la ambigüedad del `COMMENT` de la propia migración sin un análisis de ejecución de sentencia a sentencia — que el fallo real suministró.

**Conclusión:** el bloqueo no es un fallo del apilador ni del estado out-of-band de la base (que quedó normalizado en 72–74), sino un **defecto de determinismo del propio stream**: dos `COMMENT ON FUNCTION` sin calificar (75:1183 y 80:1253) más la ausencia de cualquier `DROP` de la firma `/26` hacen que el stream, aplicado fielmente en orden, no pueda converger a su propio estado certificado. La resolución exige cambios en el repositorio autorizados por el propietario (§13); ninguna acción dentro de las prohibiciones de esta misión podía desbloquearla.

---

## 8. C3 — Verificación posterior y contrato (ejecutadas como diagnóstico de solo lectura)

Tras el bloqueo, y como la certificación era inalcanzable, se ejecutaron los modos oficiales de verificación — confirmados de solo lectura en el código vigente — para dejar constancia oficial del estado exacto de la base (no como aprobación de C3):

```
node scripts/e2e/reset-remote-e2e-db.mjs --verify   --i-understand-this-is-destructive --evidence-out=…/replay-003
node scripts/e2e/reset-remote-e2e-db.mjs --contract --i-understand-this-is-destructive --evidence-out=…/replay-003
```

### 8.1 `--verify` → `INCOMPLETA`

| Paso | Resultado |
|---|---|
| `guard-normal-centinela` | OK — destino validado con centinela **true vía REST** con la service key E2E (cierra la limitación nº 2 del preflight) |
| `verificacion-centinela` | OK — `true` |
| `verificacion-baseline` | OK — `aplicada`, sha exacto al manifiesto |
| `verificacion-completitud-tramo` | **FAIL — aplicadas 74/94, fallidas 1** (posiciones 75–94 no aplicadas) |
| `verificacion-objetos-esenciales` | OK — 8/8 (`audit_logs, inventory, products, profiles, receipt_items, stock_movements, stores, transactions`) |
| `verificacion-tablas-rls` | OK — 155 tablas, 155 con RLS |
| **Veredicto** | **`INCOMPLETA`** |

### 8.2 `--contract` → 2 funciones certificadas faltantes

- Contrato vigente: `supabase/security-contract/contract-surface.sql` con **151 funciones** `@contract-function` (el 137/137 de 2026-10-22 es histórico y NO se usó como criterio; el propio conteo vigente corrigió también la estimación de 153 del preflight).
- **Faltan 2**: `pay_commission` y `register_cash_adjustment` — ambas creadas por la **posición 82** (`20261026000000`), bloqueada detrás de la 75. Coherente con la sonda §4.4 (ausentes en remoto).
- `SECURITY DEFINER` en E2E: 264 (extras=132, informativo, esperados por evolución post-baseline). RLS: 155/155. Bucket `reports`: presente.
- Nota técnica: ambos modos terminan con **exit 0 aunque registran pasos FAIL** (no lanzan excepción); el criterio de aprobación son los pasos y el veredicto, no el código de salida. En evidencia: `verify.json`, `contract.json`, `contract-compare-diagnostico.json` (copia de la comparación de esta fecha; `audit-evidence/INFRA-011/contract-compare.json` queda actualizado a este diagnóstico — el histórico de 2026-10-22 permanece recuperable en el historial de Git).

**C3 como certificación: NO EJECUTABLE en el estado actual** — `PREPARADA` exige 94/94 `aplicada` sin fallidas.

---

## 9. Estado final de la base tras la misión

| Elemento | Estado |
|---|---|
| Registro `e2e_migrations_replay_state` | 91 filas: **85 `aplicada`** (1 baseline + 10 pre-tamo + 74 tramo [71 previas + 72, 73, 74 de esta misión]) + **3 `fallida`** (posición 75 + 2 históricas v1 ajenas al manifiesto) + **3 `limpiada`** (v1) |
| Completitud del tramo | 74/94 aplicadas; 20 no aplicadas (75 fallida + 76–94 sin fila) |
| Divergencias de hash | **0** (todas las `aplicada` del tramo coinciden con el manifiesto de 94) |
| Overloads `create_sale_v2` | 2 (`/26` + `/31`) — sin `/32`; prueba de rollback íntegro |
| Centinela | `true` (SQL y REST) |
| Tablas / funciones public | 155 / 510 — sin cambios de censo global |
| Tablas esenciales / RLS | 8/8 / 155-155 |
| Datos | Intactos: 44 perfiles sintéticos y usuarios de validaciones previas NO tocados; DML de 84/87 verificados 0 filas; cero escrituras fuera de las 3 migraciones aplicadas por el apilador |

---

## 10. Evidencias (directorio nuevo de esta misión — históricos intactos)

`audit-evidence/INFRA-011/remote/replay-003/` (nuevo; los registros de 2026-10-22 y preflight-002 permanecen intactos):

| Archivo | Contenido |
|---|---|
| `inspect.json` | `--inspect` pre-replay: identidad, guard, censo, registro completo (87 filas) |
| `manifest-diff-93a94.json` | Comparación programática manifiesto 93→94: invarianza 1–93, única adición pos 94 |
| `inspect-analysis.json` | Análisis del registro vs manifiesto: 71 exactas, 0 divergencias, 23 pendientes (72–94) |
| `sonda5-migraciones-sensibles.json` | Sondas §5: pos 84 (0 filas DML, policies, trigger, ACL), pos 85 (ACL final), pos 87 (archivo 2, huérfanas 0, FK, RLS), caja/`create_sale_v2` (firmas, dependencias, marcadores) |
| `apply-replay.json` | Evidencia de la corrida C2: pasos, fallo 42725 pos 75, sha del manifiesto usado |
| `sonda-post-replay-75.json` | Censo post-fallo: overloads exactos (2), registro 72–75, desglose 85/3/3 — prueba de rollback íntegro |
| `verify.json` | `--verify` diagnóstico: veredicto `INCOMPLETA`, 74/94, censo |
| `contract.json` | `--contract` diagnóstico: pasos y resultado |
| `contract-compare-diagnostico.json` | Comparación contractual de esta fecha (151 esperadas, 2 faltantes, extras 132, RLS 155/155) |

Scripts de análisis persistidos fuera del repo (sin secretos): `/home/z/my-project/scripts/reconcile003_*.py`. **Escaneo de secretos en evidencias: 0 coincidencias.**

---

## 11. C4 — Prerrequisitos pendientes antes de una futura corrida E2E (§10 del mandato; solo verificación de lectura)

- Entorno GitHub `e2e-isolated` verificado por API de solo lectura (2026-10-27): existe, pero **`required_reviewers`=0** y **sin `deployment_branch_policy`** (sin restricción a `main`). La recomendación READINESS-001 §7.3 sigue **PENDIENT_OWNER**. Esta misión **no modificó** reglas del entorno ni sus secretos (sin autorización para ello).
- C4 continúa pendiente por diseño (re-verificación automática pre-corrida en el SHA final) y **además** ahora depende de:
  1. La remediación del bloqueo de stream (§13) aplicada y fusionada.
  2. C2 completa (94/94 `aplicada`) re-ejecutada con autorización expresa.
  3. C3 certificación real: `--verify` = `PREPARADA` y `--contract` = 0 faltantes contra el contrato vigente.
- **No se ejecutó `workflow_dispatch`** ni Playwright ni specs individuales.

---

## 12. Dictamen final (§12 del mandato)

### 12.1 Tabla de resultados C2/C3

| Condición | Veredicto | Detalle |
|---|---|---|
| **C2 — Aplicación del replay oficial** | **FALLIDO** | Bloqueo determinista `42725` en posición 75. Parciales: **3/23 aplicadas y registradas** (72, 73, 74). Cero daño: rollback íntegro probado en vivo; sin efectos parciales; sin divergencias de hash; apilador detenido según diseño. |
| **C3 — Verificación y contrato** | **NO EJECUTADO** (como certificación) | `PREPARADA` inalcanzable: `--verify` = `INCOMPLETA` (74/94, 1 fallida); `--contract` = 2 faltantes (pos 82). Ambos ejecutados solo como **diagnóstico de solo lectura**, con guard normal y centinela REST OK. |

### 12.2 Respuestas expresas a las preguntas del mandato

1. **¿Qué SHA y manifiesto se usaron?** Código: `main` `f1611c3560da0e32b4e09bc989044170d12ab48f` (+ commit de manifiesto `6ac6e02ca` en la rama de la misión). Manifiesto: regenerado en ese SHA, **94 posiciones**, sha de archivo `43c9a77cd779098b…`, digest `5ceff26cff21d54f…`, `--check` MATCH exit 0; posiciones 1–93 invariantes frente al manifiesto auditado por RECONCILE-001 (única adición: posición 94 `20261027010000`, DDL aditivo puro, analizada antes de incluirla).
2. **¿Se confirmó el destino antes y durante la operación?** Sí. Antes: Management API (nombre+ref+región+estado), guard con allowlist exacta, centinela true, `--inspect`. Durante: guard en cada comando; centinela re-verificado vía REST al final (`--verify`/`--contract` con guard normal). Producción vetada sin conectar en ningún momento.
3. **¿Cuántas migraciones se aplicaron realmente y cuáles quedaron ya registradas o pendientes?** Aplicadas realmente: **3** (posiciones 72, 73, 74), todas registradas `aplicada` con hash exacto del manifiesto — normalizan las tres primeras out-of-band. Quedó `fallida`: **1** (posición 75). Quedaron pendientes sin fila: **19** (posiciones 76–94). Registro final: 85 `aplicada` + 3 `fallida` + 3 `limpiada`.
4. **¿Hubo errores parciales o reintentos?** Error: uno, en posición 75 (`42725`, ambigüedad de `COMMENT ON FUNCTION` sin lista de argumentos; HTTP 400 del transporte API). Reintentos: **cero** — la evaluación exigida por §7.5 demostró determinismo (estado de overloads inalterado tras el rollback íntegro; predicción exacta de CP-MONEY-002 §9.2). Efectos parciales: **cero** (ejecución transaccional verificada).
5. **¿El estado final del registro coincide con el manifiesto?** **No.** 74/94 posiciones `aplicada` con hash exacto (71 previas + 3 de esta corrida), 1 `fallida`, 19 sin aplicar. `--verify`: `INCOMPLETA`.
6. **¿`--verify` produjo el resultado esperado?** No produjo `PREPARADA` — produjo `INCOMPLETA` (74/94), consistente con el bloqueo. Componentes sanos: centinela true (SQL y REST), baseline exacto, 8/8 tablas esenciales, RLS 155/155.
7. **¿`--contract` pasó contra el contrato vigente?** No: **2 faltantes** (`pay_commission`, `register_cash_adjustment`, posición 82) contra el contrato vigente de **151 funciones**. Extras 132 (informativo). RLS y bucket OK.
8. **¿Se ejecutó alguna prueba E2E?** **NO.** Cero Playwright, cero specs, cero `workflow_dispatch`, cero batería. (E2E sigue bloqueada hasta C1–C4.)
9. **¿Se ejecutó alguna operación sobre producción?** **NO.** Cero conexiones a `CostproBD`/`wthkddeleylijmonclxg` (vetada por guard, jamás conectada); credencial de producción no utilizada (verificación anti-crosstalk ejecutada).
10. **¿Qué prerrequisitos de C4 faltan antes de la corrida?** (i) remediación del defecto de stream en 75/80 (§13) fusionada en `main`; (ii) C2 re-ejecutada hasta 94/94 con autorización expresa; (iii) C3 certificada (`PREPARADA` + contrato 0 faltantes); (iv) protección del entorno `e2e-isolated` (hoy 0 required reviewers y sin restricción a `main` — verificado 2026-10-27); (v) re-verificación automática pre-corrida en el SHA final (C4 por diseño). — **C4 queda pendiente.**

**Conclusión del dictamen:** C2 FALLIDO y C3 NO EJECUTADO como certificación ⇒ **NO se declara «BASE RECONCILIADA Y VERIFICADA»; E2E SIGUE NO AUTORIZADA.**

---

## 13. Remediación recomendada (decisión del propietario — fuera del alcance de esta misión)

Ninguna de las vías de desbloqueo era ejecutable dentro de las prohibiciones expresas del mandato (no editar SQL para forzar éxito, no saltar posiciones, no aplicar fuera del apilador, no compensar a mano, no alterar el registro). Opciones para una misión separada autorizada:

| Opción | Descripción | Valoración |
|---|---|---|
| **A — Migración de desbloqueo (recomendada)** | Nueva migración (p. ej. `20261024140000_replay_unblock_legacy_create_sale_v2.sql`) con `DROP FUNCTION IF EXISTS` de las firmas EXACTAS `/26` y `/31` — a ubicar lexicográficamente entre las posiciones 74 y 75. Con ellas retiradas, la 75 crea la `/32` como firma única y su `COMMENT` deja de ser ambiguo; la 80 es entonces idempotente (DROP IF EXISTS no-op + re-CREATE + COMMENT único). En producción sería inofensiva (`IF EXISTS` sobre un estado ya certificado `/32`). Después: regenerar manifiesto, `--check` MATCH, re-ejecutar C2/C3. | Mínima, determinista, respeta el historial (no edita migraciones ya aplicadas), reproducible en cualquier entorno. Requiere PR propio del propietario. |
| B — Calificar los `COMMENT` | Editar 75:1183 y 80:1253 para añadir la lista de argumentos, **y** añadir el `DROP` de la `/26` en la 80. | Funciona, pero edita migraciones ya aplicadas en producción (divergencia repo↔historial productivo) y mezcla dos cambios en archivos certificados. |
| C — Transformación del generador | Extender `TRANSFORMACIONES_TRAMO` del generador para calificar los dos `COMMENT` en la capa generada (precedente: `20261020000002`), sin tocar originales; regenerar manifiesto. | Deja el stream original intacto, pero codifica en el generador un apaño por caso y cambia los hashes generados de 75/80 — mayor superficie de revisión. |

Cualquiera de las tres exige: PR revisado y fusionado por el propietario, regeneración del manifiesto con `--check` MATCH, y una misión C2/C3 nueva con autorización expresa. Tras ella, `--verify` debería dar `PREPARADA` (94/94) y `--contract` 0 faltantes (151/151 vigentes).

---

## 14. Separación explícita: ejecutado vs. NO autorizado

| Categoría | Estado en esta misión |
|---|---|
| Inspección solo lectura (Management API + `--inspect` + sondas SELECT + `--verify`/`--contract` como diagnóstico) | ✅ Ejecutada (evidencia versionada, sin secretos) |
| Regeneración/verificación estática del manifiesto (`--check`) + recálculo documentado con análisis de diferencias | ✅ Ejecutada (posiciones 1–93 invariantes; pos 94 analizada antes de incluir) |
| Obtención de credenciales E2E del gestor oficial + `.env.local` gitignored | ✅ Ejecutada (sin secretos impresos/versionados; anti-crosstalk verificado) |
| `--apply-replay` (C2) | ✅ Ejecutado con autorización → **detenido por el apilador en posición 75** (diseño correcto); 3/23 aplicadas |
| `--bootstrap` / reset / seed / limpieza general / `db push` | ⛔ NO ejecutados |
| Compensaciones manuales (DROP manual de `/26`/`/31`, reordenar, saltar la 75, editar SQL de 75/80) | ⛔ NO ejecutados (prohibidos; documentados como remediación para el propietario, §13) |
| Workflow E2E / Playwright / specs / `workflow_dispatch` | ⛔ NO ejecutados (bloqueado hasta C1–C4) |
| Fusión de PRs / cambios de código funcional / producción / RLS / datos de usuarios / reglas del entorno `e2e-isolated` | ⛔ Ninguno |

### Restricciones cumplidas (verificación final)

- 0 pruebas E2E, 0 Playwright, 0 `workflow_dispatch`.
- 0 escrituras en producción; 0 conexiones a producción (vetada por guard).
- 0 reset de la base aislada; 0 seed; 0 limpieza general; 44 perfiles sintéticos y usuarios de validaciones intactos.
- 0 cambios de roles/membresías de usuarios reales para forzar verificaciones.
- 0 migraciones aplicadas fuera del apilador oficial; 0 ediciones de SQL; 0 ediciones del manifiesto manual (solo regeneración por el generador oficial, con invarianza probada).
- 0 secretos impresos, versionados o adjuntos (escaneo 0 coincidencias).
- 0 guards desactivados; 0 políticas RLS o controles de aislamiento tocados.

---

## 15. Tabla de control (mandato → resultado)

| # | Control del mandato | Resultado | Evidencia |
|---|---|---|---|
| 1 | Confirmar SHA vigente + ambos PR fusionados | ✅ `f1611c356`; #1501/#1502/#1503 fusionados (+#1502 detectado: migración nueva) | §1 |
| 2 | Manifiesto en main + `--check` | ✅ Tras recálculo documentado: MATCH exit 0 (invarianza 1–93 + pos 94) | §1.1–1.2 |
| 3 | Revisar condiciones/limitaciones del preflight anterior | ✅ + variación real explicada (22→23 pendientes, pos 94) | §1.3, §3 |
| 4 | Sin cambios locales ajenos / replay concurrente | ✅ Árbol limpio; 0 filas de progreso | §1 |
| 5 | Verificar `--inspect` solo lectura en código vigente | ✅ Trazado de implementación | §2.1 |
| 6 | Identidad por guard + verificación de proyecto + centinela | ✅ Management API + guard + centinela true (SQL y REST) | §2.2 |
| 7 | Credencial exclusiva E2E; nunca la de producción | ✅ Gestor oficial; anti-crosstalk; gitignored | §2.3 |
| 8 | `--inspect` inmediatamente antes del replay (9 comprobaciones) | ✅ exit 0; 23 pendientes 72–94; 0 divergencias | §3 |
| 9 | Sonda pos 84 (DML 0 filas + funciones/policies/trigger) | ✅ Revalidado sin cambios de estado | §4.1 |
| 10 | Sonda pos 85 (privilegios/convergencia) | ✅ ACL final presente | §4.2 |
| 11 | Sonda pos 87 (archivo/huérfanas/FK) | ✅ 2 archivadas, 0 huérfanas, 0 filas | §4.3 |
| 12 | Sonda caja/`create_sale_v2` (dependencias/orden/firmas) | ✅ Firmas verificadas; el fallo reveló la ambigüedad no detectable por sonda | §4.4, §7 |
| 13 | Puerta de decisión (8 condiciones) | ✅ Superada al abrir; incertidumbre revelada luego documentada como hallazgo | §5 |
| 14 | Confirmar `--apply-replay` = incremental, no reset | ✅ Implementación re-verificada | §6 |
| 15 | Reglas de ejecución C2 (sin concurrencia, sin saltos, sin editar, parada ante error) | ✅/⛔ Detenido por fallo determinista; 0 reintentos ciegos | §6 |
| 16 | No dar C2 por buena solo por exit code | ✅ Verificación posterior ejecutada (diagnóstico) | §8 |
| 17 | `--verify`/`--contract` confirmados de solo lectura antes de usar | ✅ | §2.1, §8 |
| 18 | Criterio contractual vigente (no 137 histórico) | ✅ 151 vigentes; 2 faltantes documentadas | §8.2 |
| 19 | Directorio de evidencia nuevo; históricos intactos | ✅ `remote/replay-003/` (9 archivos, 0 secretos) | §10 |
| 20 | Expediente con SHA, fecha, comandos, resultado, estado final | ✅ Este documento | — |
| 21 | Entorno `e2e-isolated` (solo documentar) | ✅ 0 required reviewers, sin restricción main — PENDING_OWNER | §11 |
| 22 | Prohibiciones §11 | ✅ Todas respetadas (§14) | §14 |
