# DERIVA PRODUCCIÓN vs REPO — línea base T0 (COSTPRO, misión pendientes 1-2-3)

**Fecha de medición:** 2026-11-06 (solo lectura, Management API `/database/query`, consultas SELECT de catálogo)
**Producción:** CostproBD — ref `wthkddeleylijmonclxg` (309 funciones SECURITY DEFINER en public)
**Aislada:** CostproE2E — ref `lguovmvrozxgssupkwpf` (312 SD; replay tramo 125/125 reconstruido el 2026-11-06)
**Referencia certificada anterior:** `docs/security/certified-function-fingerprint.json` exportado 2026-11-04 (297 SD — desactualizado)
**Método:** `scripts/ci/compute-function-fingerprint.cjs` (modo Management API, solo lectura) + volcados de catálogo
(funciones, tablas, columnas, constraints, triggers, políticas, índices, extensiones) sobre ambos proyectos.
Evidencia bruta: `audit-evidence/T0-DERIVA/` (nombres de objetos; sin datos ni PII).

---

## 1. Huella de funciones (T0.1)

Recuento: **prod 309 · E2E 312 · certificado 2026-11-04 297**. Excluida por regla 8:
`pay_commission` (misma firma 7 args en ambos proyectos; cuerpos NO comparados; en deriva por actor externo).

### (a) Solo en E2E (4)

| Función | Clasificación | Acción |
|---|---|---|
| `close_cash_shift/5` (sin p_declared_cash_usd) | Sobrecarga muerta: la definió `20260911000000_rem_sec1_security_boundaries.sql`, producción la retiró sin migración registrada | **T1 D1.1**: migración NUEVA que la retira del replay (no-op en producción) |
| `create_devolution_v2/11` (sin p_refund_currency) | Ídem — la definió `20261004120001_enervida_import_devolution_operation_date.sql`, producción la retiró sin migración registrada | **T1 D1.1** |
| `e2e_hard_delete_store/1` | Por diseño del sandbox (`20261005120000`) | Excepción permanente |
| `e2e_hard_delete_user/1` | Por diseño del sandbox (`20261005120001`) | Excepción permanente |

### (b) Solo en producción (1)

| Función | Clasificación | Acción |
|---|---|---|
| `profiles_block_privileged_update/0` + trigger `trg_profiles_privileged_cols_guard` | Función de trigger creada out-of-band; ninguna migración la crea; el replay la omite por una transformación (`build-migrations-replay.mjs` → TRANSFORMACIONES_TRAMO) | **T1 D1.2**: migración NUEVA con el cuerpo literal de producción + trigger; retirar la transformación del replay |

### (c) Cuerpo distinto prod vs repo/E2E (3) — producción ATRASADA del repo

| Función | Última migración que la define en el repo | ¿Fusionada en main? | Plan |
|---|---|---|---|
| `create_master_product` | `20261028112100_cp_catalogo_rpcs_ciclo_vida.sql` | Sí (archivo en main) | Compuerta **T2.6** |
| `get_transactions` | `20260811000010_pr4_4g_fix_usd_visualization.sql` | Sí | Compuerta **T2.6** |
| `is_party_store_connected` | `20261105130000_cp_clasificador_maestro_base.sql` | Sí (PR #1552) | Compuerta **T2.6** (lote clasificador parcialmente aplicado en prod: objetos presentes, cuerpo viejo) |

### (d) Nuevas respecto al JSON certificado 2026-11-04 (14, presentes en prod Y E2E)

Familia clasificador maestro (PR #1552, `20261105130000` + `20261105130100`): `create_master_party`,
`activate_master_party`, `delete_master_party`, `update_master_party`, `search_master_parties`,
`connect_party_catalog`, `disconnect_party_catalog`, `incorporate_store_parties_to_master`,
`can_read_master_parties`, `fn_party_link_tenant_coherence`, `fn_party_apply_changes` (ajustada por
`20261106100000_cp_contract_surface_reconcile.sql`), `is_party_store_connected`; firma v2.25.0 de
`create_sale_v2` (33 args; última definición en repo `20261004130000_h0r_create_sale_v2_hardening.sql`,
fase 4 por `20261105140000_cp_clasificador_fase4_snapshots.sql`); y `register_reception` (7→9 args,
fase 4 por `20261105140000`). Todas con migración fusionada en main. Conclusión: **la desviación del
JSON no es deriva sin control: es el atraso del JSON de huellas** (11-04) frente al estado real.

## 2. Deriva por migración (T0.2)

Estado del registro: `supabase_migrations.schema_migrations` en producción tiene **12 filas**
(202401230001 → 20260615000003; `public.schema_migrations` no existe). Todo lo posterior fue
aplicado out-of-band. Repo: 534 archivos SQL en `supabase/migrations/`.

Análisis: extracción de objetos firma por migración (funciones por nombre+aridad, tablas, columnas,
constraints, políticas, triggers, índices, extensiones) contrastada contra ambos catálogos vivos.
Migraciones ≤ 20260828 quedan absorbidas por el baseline del replay (procedencia no registrada, declarada).
Para el tramo posterior, el discriminador es: objetos presentes en E2E (convergida al repo el 2026-11-06)
y ausentes en producción ⇒ **pendiente en producción** [MEDIDO].

### Pendientes demostradas en producción (orden, para el plan T2.6)

| # | Migración | Efecto ausente en prod [MEDIDO] | Riesgo | Verificación posterior | Rollback |
|---|---|---|---|---|---|
| 1 | `20261020000004_cogs_derived.sql` | columna `stock_movements.unit_cost_derived` | Bajo (columna derivada) | catálogo: columna presente | `ALTER TABLE … DROP COLUMN` |
| 2 | `20261020000005_legal_incidents_index.sql` | índice `idx_audit_logs_legal_incident_created_at` | Bajo (índice) | catálogo: índice presente | `DROP INDEX` |
| 3 | `20261028112100_cp_catalogo_rpcs_ciclo_vida.sql` (parcial) | cuerpo nuevo de `create_master_product` | Medio (función de catálogo, no de dinero) | huella = repo | recrear cuerpo anterior |
| 4 | `20260811000010_pr4_4g_fix_usd_visualization.sql` (parcial) | cuerpo nuevo de `get_transactions` | Medio (lectura de transacciones; NO cambia lógica de escritura de dinero) | huella = repo | recrear cuerpo anterior |
| 5 | `20261105130000_cp_clasificador_maestro_base.sql` (parcial) | cuerpo nuevo de `is_party_store_connected` | Bajo-Medio | huella = repo | recrear cuerpo anterior |

Nota 1: `20261103120000_user_mgmt_delete_001_managed_hard_delete.sql` NO está pendiente: sus funciones
(`managed_delete_user_preflight`, `managed_hard_delete_user`) están presentes en producción [MEDIDO].
Nota 2: `20261105130100` y `20261105140000` están efectivamente aplicadas en producción (todos sus
objetos presentes, cuerpos iguales salvo los del cuadro (c)). Nota 3: el efecto de 40 migraciones del
tramo está **evolucionado** (sus objetos fueron reemplazados por migraciones posteriores en ambos
proyectos) — no son pendientes. Detalle completo en `audit-evidence/T0-DERIVA/drift-migraciones.json`.

### Deriva inversa (producción tiene objetos que el repo NO define) [MEDIDO]

- Constraints `customers_master_party_id_fkey` y `suppliers_master_party_id_fkey`: **ninguna migración
  las crea** — FKs añadidas out-of-band en producción. Propuesta: registrarlas en una migración nueva
  (o decidir su retirada). Pendiente de decisión del propietario.
- `profiles_block_privileged_update` + `trg_profiles_privileged_cols_guard` (ver (b)).
- `transactions_change_currency_check` (constraint en E2E): **ninguna migración la crea** — out-of-band
  en E2E. Produción no la tiene. Propuesta: registrar o retirar en E2E.
- Extensión `pg_cron` solo en E2E (sin migración que la cree).

### Simétricas sanas [MEDIDO]

RLS: 165/165 tablas con RLS en ambos proyectos, 0 políticas con diferencia de nombres, 0 tablas solo-en-un-proyecto.
Extensiones comunes idénticas (btree_gist, pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp).

## 3. JSON de huellas refrescado (T0.3)

`docs/security/certified-function-fingerprint.json` regenerado con **producción como referencia**
(309 SD), fecha 2026-11-06, conservando y ampliando la lista de excepciones documentadas
(+ `profiles_block_privileged_update`, + `pay_commission` por regla 8) y actualizando
`known_expected_diffs_e2e` con los tres cuerpos distintos y su plan T2.6. No está cableado como gate
de CI (requiere credenciales; se ejecuta con `SUPABASE_ACCESS_TOKEN=… CP_FP_REF=… node
scripts/ci/compute-function-fingerprint.cjs`). Validado: comparación contra CostproE2E reporta
exactamente las divergencias documentadas en este documento (3 cuerpos + 4 solo-E2E + 1 solo-prod).

## 4. Estado honesto

- Toda diferencia de funciones queda **explicada** (a/b/c/d con migración de origen) salvo
  `pay_commission`, registrada como **en deriva por actor externo** (regla 8).
- Las dos FKs de master_parties y la constraint de change_currency quedan **declaradas sin explicar**
  (out-of-band sin migración); requieren decisión del propietario.
- El JSON ya no está desactualizado; la próxima huella certificada debe re-exportarse tras las
  compuertas T2.6 y el cierre T1.
