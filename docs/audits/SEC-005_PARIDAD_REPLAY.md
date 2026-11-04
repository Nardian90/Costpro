# SEC-005 — Paridad entre el replay del repo y la superficie certificada

Tarea: T3 de la misión SEC-025/026/003/005/006/UI-001 · PR: `fix/cp-sec-005-paridad-replay-vs-certificado`
Fechas: 2026-11-04 (mediciones solo lectura; dos tomas separadas ~1 h)
Evidencia: `audit-evidence/CP-SEC-005/EVIDENCIA.md` · Herramienta: `scripts/ci/compute-function-fingerprint.cjs` + `docs/security/certified-function-fingerprint.json`
Estado (regla 10): **PARIDAD DEMOSTRADA SALVO EXCEPCIONES DOCUMENTADAS — SIN ESCRITURA EN PRODUCCIÓN** (producción sigue siendo la referencia certificada).

## 1. Método

Comparación función por función de las SECURITY DEFINER del esquema `public` entre
CostproBD (producción, ref wthkddeleylijmonclxg) y CostproE2E (ref lguovmvrozxgssupkwpf),
solo lectura vía Management API: `name`, `pg_get_function_identity_arguments`,
`md5(pg_get_functiondef(oid))`. Sin datos, sin PII.

## 2. Resultado de la comparación (toma T0 2026-11-04; T1 ≈1 h después revalidada)

| Métrica | Valor [MEDIDO] |
|---|---|
| Funciones SECURITY DEFINER en producción | 297 (la evidencia previa de la misión decía 294: creció con lo fusionado el 2026-11-03/04) |
| En CostproE2E | 300 |
| Idénticas (nombre/aridad/huella) | 295 |
| Solo en CostproE2E | 4 (ver §3) |
| Solo en producción | 1 (ver §4) |
| Cuerpo distinto en ambas | 1 en T0 (`create_master_product`); +1 aparecida EN VIVO en T1 (`pay_commission`, ver §5) |

La evidencia previa (294 vs 299, 5 de diferencia) queda revalidada y explicada al 100 %:
2 propias del E2E + 2 sobrecargas históricas + 1 out-of-band de producción; sin ninguna
función más débil en el replay que en producción.

## 3. Solo en CostproE2E (4) — causa

| Función | Causa | Migración que la define (lado replay) |
|---|---|---|
| `e2e_hard_delete_store/p_store_id uuid` | Propia del E2E por diseño (limpieza de datos de prueba) | `20261005120000_e2e_hard_delete_store.sql` |
| `e2e_hard_delete_user/p_user_id uuid` | Ídem | `20261005120001_e2e_hard_delete_user.sql` |
| `close_cash_shift/5` (sin `p_declared_cash_usd`) | Sobrecarga histórica: el replay final crea /5 y /6 (migraciones de caja v2_18→v2_24.1); producción retiró la /5 sin migración registrada (out-of-band, regla 11) | última: `20261021120000_nulidad_compuesta_refunds_devolucion.sql` (rama /5) |
| `create_devolution_v2/11` (sin `p_refund_currency`) | Ídem: producción retiró la /11 sin migración registrada | última: `20261024230000_devoluciones_reembolso_fisico_moneda.sql` (rama /11) |

Las dos sobrecargas muertas son de la FAMILIA DE DINERO (caja/devoluciones): por la regla 6
NO se tocan desde esta misión. Quedan en la lista de excepciones del JSON de huellas con su
causa; el propietario decide si codifica su retirada con una migración explícita.

## 4. Solo en producción (1) — causa

| Función | Causa | Acción propuesta |
|---|---|---|
| `profiles_block_privileged_update/` (0 args, función de trigger) | Creada OUT-OF-BAND en producción sin DDL versionado en el repo (ninguna migración la crea; solo una hace REVOKE: `20261020000002_sec_definer_hardening.sql`). El replay la omite con una TRANSFORMACIÓN DOCUMENTADA (CP-INFRA-011, `build-migrations-replay.mjs` TRANSFORMACIONES_TRAMO). NO está en la superficie certificada (`contract-surface.sql`). | Propuesta (no ejecutada): migración NUEVA que materialice su definición literal de producción + trigger asociado, o aceptarla como excepción permanente documentada. Decisión del propietario. |

## 5. Cuerpo distinto (2) — causa

| Función | Diagnóstico | Migración del cuerpo final en cada lado |
|---|---|---|
| `create_master_product/11` | **Producción ATRASADA del repo**: la migración `20261103120000_fix_master_sku_exists_race_message.sql` (commit fe991456e, 2026-11-03) reemplaza el `COALESCE(uuid, texto)` (roto en runtime si salta la rama) por `COALESCE(::text, …)`. E2E (replay) ya tiene la versión final del repo; producción no la ha aplicado. Diferencia cosmética de mensaje, no de seguridad. | repo/E2E: `20261103120000`; producción: texto original de `20261028112100_cp_catalogo_rpcs_ciclo_vida.sql` (el archivo fue corregido en el repo tras su aplicación — antipatrón a evitar) |
| `pay_commission/7` | **DERIVA VIVA durante la sesión**: en la toma T0 ambas BD eran idénticas (huella 7ba1cdef…); en T1 E2E fue actualizada EN VIVO por otra sesión activa a la forma ARRAY de `has_store_role_as` (producción mantiene la escalar). Hay un refactor anti-spoofing en curso gestionado por otro actor. Por regla 6 (función de dinero) y porque la referencia es producción, NO se converge unilateralmente; el script de huellas sigue marcándola hasta que producción absorba el cambio. | E2E (vivo, en curso): cambio out-of-band del 2026-11-04; producción: forma escalar vigente |

## 6. T3.2 — Patrón vulnerable `IS NOT NULL AND NOT`: RUIDO HISTÓRICO puro

- Archivos que contienen el literal hoy: **34** por grep crudo (incluye comentarios y
  menciones); **17** al analizar código ejecutable (sin comentarios). La misión citaba 30
  al 2026-10 (los listados cambian con cada misión que cita el patrón en cabeceras).
- Funciones definidas en esos archivos: todas están SUPERSEADAS en el replay final por
  migraciones posteriores con la versión certificada (v2_12_12, rem_inv_6
  `20260916000001_materialize_certified_function_surface`, w9_b10, rem_po1, etc.).
- **Estado EFECTIVO verificado EN VIVO en CostproE2E (replay reconstruido el 2026-11-03
  por el commit de reactivación del propietario): 0 funciones con el patrón.** Las dos que
  un análisis ingenuo de "última definición" señalaba (`create_sale/16`,
  `apply_physical_count/4`) no existen en el estado efectivo: `create_sale` fue DROP-ada
  por `20261005140000_drop_v1_sale_devolution.sql` (con test de contrato que lo exige) y
  `apply_physical_count` solo existe como /3 endurecida (patrón ausente, verificado por
  catálogo en E2E y producción).
- Además, la reconciliación Capa C del test estático (replay vs superficie certificada)
  da **175/175 representadas, 0 divergencias de cuerpo**: el estado final del replay
  coincide con la superficie certificada. NO se requiere migración de saneamiento.
- Chequeo automático propuesto (añadido en este PR): `scripts/ci/compute-function-fingerprint.cjs`
  contra el JSON committeado (ver §7), ejecutable manualmente/semanalmente; no es gate de
  CI porque requiere credenciales de BD (regla T3.3 de la misión).

## 7. T3.3 — Script de huella (sin credenciales incorporadas)

`scripts/ci/compute-function-fingerprint.cjs`:
- Modo 1: `DATABASE_URL=postgres://… node scripts/ci/compute-function-fingerprint.cjs` (usa `pg` ya presente) — sirve para CostproE2E (URL del pooler) y para un replay local con postgres.
- Modo 2: `SUPABASE_ACCESS_TOKEN=… CP_FP_REF=<ref> node scripts/ci/compute-function-fingerprint.cjs` (Management API; producción SOLO lectura — la query es un SELECT de catálogo).
- Compara contra `docs/security/certified-function-fingerprint.json` (huella de producción exportada el 2026-11-04, 297 funciones) con una lista de excepciones documentada (2 E2E-by-design + 2 sobrecargas históricas) y un registro de divergencias conocidas/esperadas (`known_expected_diffs_e2e`).
- `--export` regenera el JSON desde la BD analizada (solo el propietario debería usarlo contra producción).
- Salida: coincidentes/faltantes/sobrantes/cuerpo-distinto; exit 1 si hay divergencias no documentadas.

## 8. T3.4 — Verificación

- E2E ES el estado reconstruido por el replay (reconstrucción del 2026-11-03, commit de
  reactivación del propietario `fe991456e`/`COSTPRO-E2E-REACTIVATION-001`; el manifiesto
  del replay es determinista y el test del manifiesto está en verde). No se re-reconstruyó
  E2E en esta sesión (operación destructiva sobre un entorno compartido con otra sesión
  activa detectada EN VIVO — §5); la paridad se midió directamente sobre ese estado.
- `node scripts/security-contract-test-static.cjs` → **CONTRATO OK** (0 bloqueantes).
- `node scripts/bola-contract-test.cjs` → **5/5 OK**.
- `compute-function-fingerprint.cjs` contra E2E: 294 coincidentes + 4 excepciones
  documentadas + 2 divergencias conocidas marcadas (create_master_product: producción
  atrasada; pay_commission: deriva viva §5). Sin divergencias INESPERADAS.

## 9. T3.5 — Ítems menores

- **GRANTs y COMMENTs de funciones críticas**: la Capa C del test estático ya reconcilia
  ACL (grantee set, owner excluido) con 0 drift — no hay nada que corregir; no se añaden
  sentencias redundantes.
- **Escape `?all=true` y paginación de storeApiClient**: verificado que ya está mitigado
  por diseño: el servidor (`src/app/api/stores/route.ts`, V2.12.11 H4) solo honra
  `?all=true` si se pide EXPLÍCITAMENTE y por defecto pagina a 200; el cliente
  (`src/services/store-api-client.ts`) no usa `?all=true` — `fetchStores` usa la
  paginación por defecto y `fetchAllStores` itera con cursor + safety cap (V2.12.14).
  No requiere cambio.

## 10. Hallazgo registrado: `schema_migrations` de producción (regla 11)

La tabla `supabase_migrations.schema_migrations` de producción solo tiene 12 registros
(última 20260615000003) frente a 535+ archivos en el repo: la BD NO sabe qué se le aplicó
(ya demostrado de nuevo esta misión: `no_overlapping_periods`, `profiles_block_privileged_
update` y el fix de `pay_commission` viven en producción fuera del registro).

**Estrategia propuesta (NO ejecutada)** — elegir por el propietario:
1. **Libro menor adelante + conciliación automática (recomendada):** cada aplicación futura
   en producción (como la compuerta T1 del 2026-11-04) registra evidencia en
   `audit-evidence/` (regla 11) y añade su fila en una tabla nueva
   `public.production_migration_ledger(version, file, applied_at, mechanism, evidence)`;
   un job (o el script de huellas ampliado) compara periódicamente catálogo vivo vs
   superficie certificada vs repo y emite un informe de deriva. No tocar
   `schema_migrations` retroactivamente (riesgo alto, valor bajo).
2. Backfill masivo de `schema_migrations` con las ~470 migraciones ya aplicadas por
   evidencia: NO recomendado (riesgo de "aplicadas" falsas; la evidencia no cubre todas).

## 11. Estado y pendientes

- Paridad repo-replay ↔ producción: DEMOSTRADA con excepciones documentadas (§2–§5).
- Pendiente del propietario: (a) aplicar a producción las migraciones atrasadas
  (20261103120000 y sucesivas) por el cauce normal; (b) decidir sobre las 2 sobrecargas
  muertas E2E-only y la función prod-only (§3/§4); (c) elegir estrategia del §10;
  (d) absorber en producción el refactor en curso de pay_commission (otro actor).
- CERO escrituras en producción en esta tarea.
