# CP-SEC-005 — Evidencia de paridad replay ↔ superficie certificada (T3)

Fechas: 2026-11-04 (toma T0 ~10:15, toma T1 ~11:15 — revalidada tras detectar actividad
en vivo de otra sesión sobre CostproE2E). Mecanismo: Management API, SOLO lectura contra
producción; lectura + tests estáticos contra CostproE2E. Sin secretos ni PII.

## 1. Huellas función a función (T3.1)

Comando (resumen): `SELECT proname, pg_get_function_identity_arguments(oid),
md5(pg_get_functiondef(oid)) FROM pg_proc … WHERE nspname='public' AND prosecdef`.

- T0: producción 297 · E2E 300 · idénticas 295 · solo-E2E 4 · solo-prod 1 · cuerpo distinto 1.
- T1 (revalidación): `pay_commission/7` pasa a diferir (E2E actualizada EN VIVO por otra
  sesión activa a la forma ARRAY de has_store_role_as; producción mantiene la escalar).
  Las capturas se conservan en este directorio (ver fp-*.json exportados abajo).

Clasificación y causa (tabla completa en docs/audits/SEC-005_PARIDAD_REPLAY.md):
- E2E-only por diseño: e2e_hard_delete_store, e2e_hard_delete_user.
- E2E-only sobrecargas históricas (retiradas en producción sin migración registrada):
  close_cash_shift/5, create_devolution_v2/11.
- Prod-only out-of-band (sin DDL versionado; transformación documentada del replay
  CP-INFRA-011): profiles_block_privileged_update.
- Cuerpo distinto por producción atrasada: create_master_product (falta 20261103120000).
- Deriva viva (otro actor): pay_commission.

## 2. Patrón vulnerable (T3.2)

- `grep -rl "IS NOT NULL AND NOT" supabase/migrations/ | wc -l` → **34** (crudo, con
  comentarios); 17 al filtrar código ejecutable.
- Análisis last-wins (`scripts/agent/analyze-vulnerable-pattern.cjs`, sesión): solo 2
  funciones quedaban como "final con patrón" (create_sale/16, apply_physical_count/4) —
  CORREGIDO por verificación EN VIVO: en E2E `create_sale` no existe (DROP de
  20261005140000, test de contrato lo exige) y `apply_physical_count` solo existe como /3
  endurecida: `SELECT … (pg_get_functiondef(oid) LIKE '%IS NOT NULL AND NOT%') → false`.
- Estado EFECTIVO del replay: **0 funciones con el patrón** → ruido histórico puro, sin
  migración de saneamiento.
- Test estático Capa C: 175/175 funciones del surface representadas, 0 divergencias.

## 3. Verificación (T3.4)

```
node scripts/security-contract-test-static.cjs → CONTRATO OK (0 bloqueantes)
node scripts/bola-contract-test.cjs            → 5/5 OK
compute-function-fingerprint.cjs (CP_FP_REF=E2E) →
  referencia 297 · BD analizada 300 · coincidentes 294 · excepciones documentadas 4
  divergencias marcadas (todas conocidas/documentadas): create_master_product,
  pay_commission · faltantes esperadas: profiles_block_privileged_update
```

## 4. Artefactos entregados (T3.3)

- `scripts/ci/compute-function-fingerprint.cjs` (dos modos: DATABASE_URL con `pg`;
  SUPABASE_ACCESS_TOKEN + CP_FP_REF por Management API). Sin credenciales incorporadas.
  NO cableado como gate de CI (requiere credenciales).
- `docs/security/certified-function-fingerprint.json`: huella de producción (referencia
  certificada) exportada 2026-11-04 (297 funciones) + `excluded_from_comparison`
  (excepciones E2E con causa) + `known_expected_diffs_e2e` (divergencias conocidas con
  causa y estado).

## 5. Limitaciones declaradas

- No se re-reconstruyó CostproE2E desde cero en esta sesión: hay OTRA sesión activa
  escribiendo en E2E (deriva de pay_commission detectada en vivo entre T0 y T1); una
  reconstrucción destructiva concurrently sería arriesgada. E2E ya ES el estado del
  replay reconstruido el 2026-11-03 (commit de reactivación del propietario).
- `tsc --noEmit` local: OOM del sandbox (4 GB) — el PR no toca código TypeScript de la
  app; la verificación oficial corre en el CI del PR.
- La estrategia para `schema_migrations` de producción (12 registros) queda PROPUESTA y
  sin ejecutar (docs/audits/SEC-005_PARIDAD_REPLAY.md §10).

## 6. Escrituras en producción

NINGUNA (solo lecturas de catálogo). La compuerta de esta tarea no existe: no requiere.
