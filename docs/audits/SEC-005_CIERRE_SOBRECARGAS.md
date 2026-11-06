# CP-SEC-005 — CIERRE DE SOBRECARGAS MUERTAS Y FUNCIÓN SOLO-PRODUCCIÓN (T1)

**Fecha:** 2026-11-06 · **Rama:** `fix/cp-sec-005-sobrecargas-y-funcion-prod-only` · **SHA:** `4a077ca03`
**Alcance:** D1.1 (sobrecargas muertas), D1.2 (`profiles_block_privileged_update`), D1.3 (deriva documentada → T2.6), D1.4 (paridad), D1.5 (este documento).
**Escrituras:** SOLO en CostproE2E (`lguovmvrozxgssupkwpf`) vía apilador oficial con guard fail-closed. **Cero escrituras en producción.**

## 1. Causa

`docs/audits/SEC-005_PARIDAD_REPLAY.md` (toma 11-04) documentó que el replay termina DISTINTO de producción en:
`close_cash_shift/5` y `create_devolution_v2/11` (solo-E2E: producción las retiró out-of-band sin migración
registrada) y `profiles_block_privileged_update/0` (solo-producción: creada out-of-band el 2026-10-09 sin DDL
versionado; el replay la omitía mediante una transformación documentada en `build-migrations-replay.mjs`).

## 2. D1.1 — migración `20261106120000_sec005_drop_dead_overloads_close_cash_shift5_devolution_v11.sql`

- **Qué hace:** `DROP FUNCTION IF EXISTS` con firma EXACTA de cada sobrecarga muerta, en transacción,
  idempotente. **No toca** la lógica de `close_cash_shift/6` ni de `create_devolution_v2/12`. Posterior a
  `20261021120000` y `20261024230000` (versionado 20261106120000). En producción es **no-op** (ya no las
  tiene — [MEDIDO] T0.1: prod tiene solo /6 y /12).
- **Guards fail-closed (in-migración):**
  1. Las canónicas DEBEN existir antes de retirar (`p_declared_cash_usd` / `p_refund_currency` en la
     identidad de argumentos) — si no, ABORTA.
  2. Dependencias `pg_depend` (vistas/triggers/funciones) sobre cada sobrecarga muerta → ABORTA si >0.
  3. Verificación posterior: canónicas presentes y muertas ausentes, si no ABORTA.
- **Guards procedurales (evidencia [MEDIDO] 2026-11-06, en el encabezado de la migración):**
  - (a) producción sin ambas sobrecargas → `audit-evidence/T0-DERIVA/huellas-md5-prod.json`.
  - (b) call-sites: TODOS los de `close_cash_shift` envían 6 parámetros nombrados (incluye
    `p_declared_cash_usd` → resuelve /6); `src/app/api/devolutions/route.ts:161` envía `p_refund_currency`
    → resuelve /12. Cero llamadas resuelven a las aridades /5 o /11.

## 3. D1.2 — migración `20261020000000_sec005_profiles_block_privileged_update_prod_literal.sql`

- **Qué hace:** `CREATE OR REPLACE FUNCTION public.profiles_block_privileged_update()` con el **cuerpo
  LITERAL de producción** (`pg_get_functiondef`, solo lectura, 2026-11-06) + creación condicional
  idempotente del trigger `trg_profiles_privileged_cols_guard` (BEFORE UPDATE ON public.profiles).
  Lógica INTACTA. Versionado antes de `20261020000002` para que su `REVOKE EXECUTE` sea aplicable.
- **Guard fail-closed:** el md5 del cuerpo creado debe ser **`421bd3645353d93f518331bbd7b2033a`** (medido en
  producción) o ABORTA. Verificado en CostproE2E tras aplicar: hash idéntico [MEDIDO].
- **Replay:** se RETIRA la transformación histórica que omitía el `REVOKE EXECUTE` (el objeto ya existe);
  la retirada está documentada en el propio `TRANSFORMACIONES_TRAMO` de `build-migrations-replay.mjs`.
- **Protección funcional:** un usuario sin privilegios no puede cambiar columnas privilegiadas de su perfil
  (el trigger aborta con SQLSTATE 42501); un admin legítimo sí; las rutas service_role no dependen de
  `auth.uid()`. El comportamiento es el MISMO que producción (cuerpo byte-a-byte). Cobertura adicional:
  la batería de 22 casos de `src/__tests__/e2e/assert-isolated-db.test.ts` y la suite completa
  (5082 tests) corren en verde con el trigger activo.
- **Superficie certificada:** la función NO está en `supabase/security-contract/contract-surface.sql`
  (archivo GENERATED por `scripts/export-contract-surface.cjs` desde el censo vivo de producción, que
  captura funciones de escritura — las funciones de TRIGGER quedan fuera del censo por diseño). **Propuesta**
  (no aplicada): ampliar el generador para incluir funciones de trigger (o un anexo explícito) y
  regenerar con credenciales del propietario; nada versionado a mano en el archivo generado.

## 4. Transformaciones del replay (D1.2/D1.1 — `build-migrations-replay.mjs`)

| Origen | Cambio | Motivo [MEDIDO] |
|---|---|---|
| `20261020000002` · REVOKE `profiles_block_privileged_update` | **RETIRADA la omisión histórica** — el REVOKE aplica íntegro | La función existe ahora (D1.2 crea antes en el orden del tramo) |
| `20261020000002` · §1(a) DROP `e2e_hard_delete_store/user` | **OMISIÓN nueva documentada** | En producción era limpieza de copias out-of-band (prod ya sin ellas [MEDIDO]); en E2E son INFRAESTRUCTURA del sandbox re-provisionada a propósito (las usa `hard-cleanup.ts` vía RPC); re-aplicarlas destruiría la herramienta de higiene |
| `20261020000002` · §3 REVOKE `register_reception(/7)` | **OMISIÓN nueva documentada** | La firma /7 fue reemplazada por la fase 4 (`20261105140000`) en AMBOS proyectos [MEDIDO]; el objeto del REVOKE no existe (efecto neto cero); el commit `265da3754` cambió el archivo después de su aplicación original (10-22) |

Nota honesta: estas omisiones reproducen el estado actual del sandbox y hacen el replay determinista;
los grants de la firma vigente de `register_reception` los gestiona `20261105140000`.

## 5. D1.4 — paridad demostrada [MEDIDO 2026-11-06]

- **Aplicación:** apilador oficial (`reset-remote-e2e-db.mjs --apply-replay`), reanudación idempotente:
  **tramo 127/127 aplicadas, 0 fallidas**; centinela `e2e_is_isolated_db() === true`; RLS 165/165;
  `--verify`: PREPARADA. Evidencia: `audit-evidence/INFRA-011/remote/{inspect,apply-replay,verify}.json`.
- **Paridad de huellas E2E vs producción** (excluida `pay_commission`, regla 8):
  - solo-producción: **0** (antes 1: profiles_block — ahora materializada y con hash idéntico);
  - solo-E2E: **solo `e2e_hard_delete_store/user`** (infraestructura del sandbox, excepción documentada;
    las sobrecargas muertas /5 y /11 DESAPARECIERON de la divergencia);
  - cuerpo distinto: `create_master_product`, `get_transactions`, `is_party_store_connected` — los 3 de
    T0 → compuerta **T2.6** (producción atrasada del repo; NO se tocan aquí);
  - grants: **12 funciones con grants más amplios en E2E que en producción** (p. ej. `close_cash_shift`,
    `open_cash_shift`, `get_cash_ledger`: prod sin anon/authenticated; E2E con anon). Hallazgo [MEDIDO]:
    el endurecimiento de grants de CP-SEC-027 Fase 7 aplicado en producción (2026-10-20, "clasificación
    103") es más amplio que la migración formal `20261020000002` — parte se aplicó out-of-band sin
    migración. Propuesta (no aplicada en esta misión): migración nueva que replique esos REVOKEs en el
    repo para que el replay converge a producción también en grants.
- **Pruebas E2E** (workflow `E2E Aislado (CostproE2E)`, run 21, SHA `4a077ca03`, filtro
  `cash-closure-flow|devolutions-flow|reverse-sale-flow`): **12 passed / 0 failed / 0 skipped**,
  guardrail net-zero PASS. Evidencia: `audit-evidence/SEC-005/resumen-e2e-caja-devoluciones-run21.txt`.
- **Pruebas locales:** lint 0 errores; vitest completo **5082 passed / 101 skipped / 0 failed** (incluye
  contract tests de seguridad y los 71 tests del guard); `tsc --noEmit` **exit 0**.
- **Manifiesto:** determinismo verificado por el test CP-E2E-RECONCILE-004 §7, actualizado 125→127 con
  cadena justificada (posiciones +1 desde la inserción de 20261020000000).

## 6. Rollback

1. **Sobrecargas:** recrear con la definición versionada del repo si hiciera falta — `close_cash_shift/5`
   desde `20260911000000_rem_sec1_security_boundaries.sql` y `create_devolution_v2/11` desde
   `20261004120001_enervida_import_devolution_operation_date.sql` (sentencias CREATE FUNCTION íntegras,
   sin depender del DROP). El DROP en producción es no-op, así que producción no requiere rollback.
2. **`profiles_block_privileged_update`:** el cuerpo es el literal de producción; rollback = re-aplicar la
   misma definición (idempotente) o restaurar el estado previo (la función no existía en E2E: `DROP
   FUNCTION` + `DROP TRIGGER`).
3. **Replay:** la tabla de estado `e2e_infra.e2e_migrations_replay_state` permite reanudación
   idempotente; ninguna migración existente fue modificada.

## 7. Estado honesto

- CP-SEC-005 cierre de sobrecargas: **RESUELTA EN CÓDIGO Y APLICADA EN CostproE2E** (verificada por
  catálogo); producción no requiere acción (no-op) ni se tocó.
- `profiles_block_privileged_update`: **RESUELTA EN CÓDIGO — APLICADA SOLO EN CostproE2E**; producción ya
  la tiene out-of-band; pendiente de decisión del propietario la propuesta de superficie certificada y la
  migración de grants (hallazgo CP-SEC-027).
- Deriva de cuerpos (`create_master_product`, `get_transactions`, `is_party_store_connected`) y grants de
  12 funciones: **PENDIENTES DE COMPUERTA T2.6** (ver `DERIVA_PRODUCCION_VS_REPO_2026-11-06.md`).
