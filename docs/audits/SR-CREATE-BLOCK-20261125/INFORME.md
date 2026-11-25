# SR-CREATE-BLOCK-20261125 — «Servicios Recibidos» no permitía crear/confirmar

**Síntoma (propietario, 24-25/11/2026):** en INICIO → OPERACIÓN → FINANZAS → Servicios
Recibidos, al pulsar «Confirmar servicio» aparece el error nativo:

> Could not find the function `public.create_received_service_v2(p_created_by,
> p_creation_key, p_currency, p_distribution_method, p_exchange_rate,
> p_observations, p_payment_terms_days, p_production_order_ids, p_receipt_ids,
> p_reference_doc, p_service_date, p_service_type_id, p_service_type_name,
> p_store_id, p_supplier, p_total_amount)` in the schema cache (PGRST202)

**Severidad:** bloqueo operativo total de creación de servicios (producción).

---

## 1. Causa raíz (verificada contra producción, solo lectura)

El ciclo **CP-OPS-ENERVIDA** (rama `fix/cp-ops-enervida-integridad-operativa`,
mergeado a main el 24/11/2026) cambió el contrato de la RPC
`create_received_service_v2` añadiendo `p_creation_key` (16.º parámetro,
migración `20261124120100_cp_ops_enervida_service_void_idempotency.sql`).
El despliegue de Vercel publica main automáticamente, pero **las 5 migraciones
del ciclo nunca se aplicaron a la base de producción (CostproBD)** — se saltó
el paso «aplicar en producción UNA SOLA VEZ» (prompt §7g).

Estado real verificado (Management API, SELECT sobre pg_proc / information_schema):

| Objeto | Producción ANTES | Aislada (replay canónico) |
|---|---|---|
| `create_received_service_v2` | 15 args (sin `p_creation_key`) | **16 args** (sobrecarga nueva) |
| `reverse_supplier_payment` | NO existe | existe |
| `register_supplier_payment_multi` | NO existe | existe |
| `consolidate_local_party` | NO existe | existe |
| `payment_transactions.reverses_payment_id` | NO existe | existe |
| `customers.master_party_id` | existía | existe |

Con la firma a 15 args, cada llamada del backend con los 16 parámetros nombrados
(`src/app/api/received-services/route.ts`, línea del `admin.rpc(...)`) no resuelve
ninguna función → PGRST202. **El código desplegado era correcto; la BD estaba
rezagada.** Baseline previa intacta: ADN008/ADN010 sí estaban aplicados (borradores,
`can_manage_store_as`, drafts con 19 args).

## 2. Corrección aplicada (regla de oro §7g, UNA SOLA VEZ)

Canal gobernado: Management API + guard CP-INFRA-019
(`scripts/lib/assert-not-production.mjs`) con el doble flag explícito
`ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND`. Script persistido y
re-ejecutable: **`scripts/cpops-apply-migrations-prod.mjs`** (saltar si las marcas
ya existen; `--check` solo lectura; aborta la cadena si una migración falla).

Orden de aplicación a producción — **2026-11-25 ~21:15 UTC** (base main `3e9e1aebe`):

1. `20261124120000_cp_ops_enervida_payment_reversals.sql` — aplicada y verificada (5/5 marcas)
2. `20261124120100_cp_ops_enervida_service_void_idempotency.sql` — aplicada y verificada (5/5)
3. `20261124120200_cp_ops_enervida_cash_report_eligibility.sql` — aplicada y verificada (2/2)
4. `20261124120300_cp_ops_enervida_multi_settlement.sql` — aplicada y verificada (1/1)
5. `20261124120400_cp_ops_enervida_parties_consolidation.sql` — aplicada y verificada (3/3)

POST-check completo: `CHECK OK — ciclo CP-OPS-ENERVIDA completo` (16/16 marcas;
idempotencia probada: re-ejecutar `--check` no aplica nada).

## 3. Verificación funcional

1. **Prueba seca en producción SIN escrituras** (`scripts/sr-rpc-dry-check.mjs`):
   llamada REST real con los 16 parámetros nombrados y `p_total_amount=0` →
   `ERR_INVALID_AMOUNT: total_amount must be > 0`. Esto demuestra que PostgREST
   resuelve la función (schema cache refrescado) y que el GRANT a service_role
   funciona; falla ANTES de cualquier INSERT (cero escrituras). ANTES de la
   migración el mismo camino devolvía PGRST202.
2. **Flujo funcional completo en la BD AISLADA** (`scripts/sr-create-flow-e2e.mjs`,
   servidor local con `.env` intercambiado, JWT real por magic link, PASS 14/14 —
   `evidencia-f5-flujo-funcional.json`):
   - CONFIRM vía `POST /api/received-services` (la ruta REAL desplegada): **HTTP 201**,
     servicio `SRV-20261124-00324`, sin warning de identidad.
   - REPLAY con la misma `creation_key`: mismo id, `duplicate=true` (idempotencia).
   - NEGATIVO `total_amount=0`: HTTP 400, sin escritura residual.
   - LIMPIEZA integral + **NET-ZERO exacto** (contadores idénticos al baseline).

## 4. Regresión

- `tsc --noEmit`: **EXIT 0** (0 errores; nota sandbox: `bunx tsc` aborta por OOM
  del runtime — con node + heap ampliado, EXIT 0. CI valida el build completo).
- vitest objetivo servicios/migraciones: **88/88 PASS** (adn008 drafts 13,
  payments-batch 11, authz 13, v2.18.0 contract 8, migraciones adn008 21 + adn009 22).
- ESLint scripts nuevos: 0 errores.
- Suite completa + build: los cubren los checks de CI del PR.

## 5. Seguridad

- Producción: solo las 5 migraciones (DDL idempotente del ciclo ya revisado en
  el PR CP-OPS-ENERVIDA). Ninguna escritura de datos de negocio en producción.
- Guard CP-INFRA-019: `--check` con `mode:'read'`; escritura exige doble flag
  (registrado en stderr). La BD aislada CostproE2E paso libre.
- `.env` / `.env.main` / `.env.e2e-run` nunca versionados (`git check-ignore` OK);
  el `.env` PRINCIPAL quedó restaurado y health 200 al cierre.
- Sin secretos en el diff (escaneo con los patrones canónicos del §8 del
  prompt de inicio: 0 coincidencias reales).

## 6. Scripts entregados (re-ejecutables)

| Script | Propósito |
|---|---|
| `scripts/cpops-apply-migrations-prod.mjs` | aplica/verifica el ciclo (marcas 16/16, `--check`, skip si ya aplicada) |
| `scripts/sr-rpc-dry-check.mjs` | prueba seca de la RPC (sin escrituras; prod requiere `ALLOW_PROD=read-only`) |
| `scripts/sr-create-flow-e2e.mjs` | flujo funcional completo contra aislada con net-zero |

## 7. Validación del propietario (UI, producción)

1. INICIO → OPERACIÓN → FINANZAS → Servicios Recibidos → «+ NUEVO SERVICIO».
2. Completar tipo/proveedor/importe → «CONFIRMAR SERVICIO» → debe crearse el
   SRV-… en estado ACTIVO sin ningún error.
3. «GUARDAR BORRADOR» sigue funcionando (su RPC `create_received_service_draft`
   no cambió); doble clic/reintento sobre «Confirmar» ya no duplica
   (`p_creation_key` idempotente).
