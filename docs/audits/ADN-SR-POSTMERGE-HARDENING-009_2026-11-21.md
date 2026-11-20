# ADN-SERVICES-RECEIVED-POSTMERGE-HARDENING-009 — Expediente de la misión
**Fecha:** 2026-11-21 · **Rama:** `fix/adn-srv-postmerge-hardening-009-20261121` · **Base:** `origin/main` `cc7fbe895`
**Tipo:** corrección técnica post-merge sobre la implementación fusionada de ADN-008 (PR #1670). Sin rediseño de interfaz, sin movimientos financieros históricos tocados.

## 1. Diagnóstico de cada observación (verificado sobre el estado LIVE, no asumido)

| # | Sección misión | Defecto verificado | Evidencia de la inspección (read-only, guard CP-INF-019) |
|---|---|---|---|
| F1 | §3 | `register_supplier_payment_batch` validaba la lista heredada `('cash','transfer','zelle')` y RECHAZABA el canónico `external_transfer` del contrato CP-FIN-004 (PR #1669) → toda liquidación de Servicios Recibidos con Transf. Exterior fallaba con `ERR_COMPONENT_INVALID` | prosrc live del batch: `NOT IN ('cash','transfer','zelle')`; PaymentRowsEditor L61 envía `external_transfer` USD/EUR |
| F2 | §4 | Ni el batch ni el motor individual serializaban: el saldo se leía sin bloqueo → dos gestores concurrentes podían sobrepagar la obligación | prosrc live: sin `FOR UPDATE` en ningún camino de pago; hallazgo Codex P2 (PR #1670, comentario L665) |
| F3 | §5 | ACL live del batch otorgaba EXECUTE a `authenticated` (el REVOKE de CP-FIN-004 del 20-nov fue reemplazado al recrearse la función por la migración 008 a las 16:34) sin verificación de identidad en el cuerpo; los RPC de borradores gateaban con `has_store_access_as` (cualquier miembro activo: clerk/warehouse/usuario/costo) en vez del nivel de GESTIÓN | proacl live; hallazgo Codex P2 (L269) |
| F4 | §6 | `POST /api/received-services` enriquecía la identidad del servicio confirmado con `supplier_id`/`master_party_id`/snapshot del CLIENTE vía UPDATE privilegiado, sin validar tienda/tenant/activo ni coherencia | route.ts (bloque ADN-008 §4.3); hallazgo Codex P2 (L255) |
| F5 | §7 | `create_received_service_draft` consultaba `creation_key` ANTES del advisory lock (carrera: dos solicitudes simultáneas creaban DOS borradores); sin restricción única; el frontend generaba clave nueva por intento | migración 008 L132-151; `pg_indexes`: 0 índices creation_key; view L1288 |
| F6 | §8 | `idempotency_key` del pago = `crypto.randomUUID()` por envío en 3 sitios → un reintento tras respuesta perdida duplicaba el lote financiero | view L196/L282/L687 |
| F7 | §9 | `update_received_service_draft` con COALESCE: omitido vs NULL indistinguibles; fecha no restablecía; limpieza de identidad podía dejar nombre↔ID incoherentes | migración 008 L374-393; hallazgo Codex P2 (L386) |
| F8 | §5 | `/api/payments` sin `canManageStore` y llamando al batch con el cliente de sesión (JWT del usuario) | route.ts L97-136 |
| F9 | §2.6 | `m008-apply-migration-e2e.mjs` escribía a `E2E_REF` sin certificar el DESTINO REAL con assert-not-production | hallazgo Codex P1 del PR #1670 (comentario L26) — verificado vigente |
| F10 | §10 | Discrepancia de fechas: migración 008 con nombre 20261121**120000** aplicada 2026-11-20 16:34 UTC (expediente ADN-008). `supabase_migrations.schema_migrations` de producción SOLO registra 12 migraciones de junio-2026 (el resto del stream se aplica por canal gobernado Management API con registro en expedientes) | consulta live; **impacto en secuencia: NINGUNO** (la versión es la mayor del stream; la correctiva 20261121190000 va encima). NO se renombró |
| F11 | §3 | El motor individual no pre-chequeaba la combinación medio×moneda: `external_transfer`+CUP llegaba al resolver fail-closed con error tardío/opaco | prosrc del motor |
| F12 | §4 | El motor aceptaba pagos sobre servicios NO activos (borrador/anulado) | prosrc del motor |
| F13 (deriva externa) | — | `suppliers.master_party_id` (uuid + FK a master_parties) existe en PRODUCCIÓN pero NO estaba en el stream de migraciones → el replay no podía reproducir el live | information_schema live prod vs BD aislada; descubierta al correr la matriz en la aislada (`column s.master_party_id does not exist`) |
| F14 (deriva externa) | — | `suppliers` NO tiene columna `code` (el código es un concepto del Clasificador Maestro) | information_schema (prod y aislada) |

## 2. Corrección implementada

**Migración correctiva única `20261121190000_adn009_sr_postmerge_hardening.sql`** (versión > 20261121120000; NO toca migraciones aplicadas; CREATE OR REPLACE / DROP IF EXISTS / IF NOT EXISTS — re-aplicable):

1. **F13 reconciliación**: `ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS master_party_id uuid` + FK `suppliers_master_party_id_fkey` → master_parties(id) IF NOT EXISTS — espejo verbatim del live (no-op en producción).
2. **`can_manage_store_as(p_user_id, p_store_id)`** (F3/§5, Alternativa B): espejo DB de `canManageStore` — `is_admin_check` (plataforma) O membresía activa admin/manager/encargado en la tienda. Patrón `can_manage_payroll_as`. ACL service_role-only para invocación directa.
3. **`create_received_service_draft`** (misma firma /19): advisory lock de tienda PRIMERO + re-consulta de creation_key tras el lock (F5/§7); gate de GESTIÓN dentro del RPC con `can_manage_store_as` y `v_caller_uid = auth.uid()` para authenticated (el parámetro `p_created_by` NO es identidad — anti-spoofing); identidad del proveedor resuelta desde la fuente autorizada (ownership + tenant + activo + coherencia local↔maestro + snapshot desde la fila — F4/§6, F14); EXCEPTION `unique_violation` que revierte la creación completa y devuelve el borrador del ganador.
4. **Índice único parcial `uq_audit_service_draft_creation_key`** — defensa adicional (F5/§7): (store_id, metadata->>'creation_key') WHERE action='SERVICE_DRAFT_CREATED' AND creation_key NOT NULL.
5. **`update_received_service_draft`** — NUEVA firma /3 `(p_service_id, p_actor_id, p_patch)`; firma /15 RETIRADA con DROP (sin overloads ambiguos, exigencia §9). Contrato tri-state por clave presente: omitido = conservar; null/'' = limpiar (NULL persistido); `service_date` null = restablecer al día operativo **America/Havana** (`(now() AT TIME ZONE 'America/Havana')::date` — canon CP-FIN-004; CURRENT_DATE corre en UTC y tras las 20:00 Habana fechaba mañana → ERR_FUTURE). Identidad = bloque atómico con snapshot desde la BD (F14: sin `code` desde suppliers) y coherencia nombre/IDs/snapshot (`ERR_SUPPLIER_IDENTITY_MISMATCH`). Vínculos: array = reemplazo completo; null = borrar todos; ausente = conservar.
6. **`register_supplier_payment`** (misma firma /12, motor canónico): `SELECT ... FOR UPDATE` del documento ANTES de idempotencia/saldo (F2/§4 — serialización compartida); estado del servicio comprobado tras el lock (`ERR_SERVICE_NOT_ACTIVE` — solo ACTIVO admite pagos, F12; receipts/OT sin cambio de semántica); pre-check `external_transfer` ⇔ USD/EUR (`ERR_COMBINACION_NO_SOPORTADA` temprano — F11); contrato CP-FIN-004 intacto (zelle heredado normalizado, jamás persistido).
7. **`register_supplier_payment_batch`** (misma firma /7): contrato canónico CP-FIN-004 (F1/§3 — normaliza zelle→external_transfer; acepta cash|transfer|external_transfer); FOR UPDATE del documento PRIMERO (serialización compartida con el individual — F2/§4); estado tras lock; orden documentado: lock → documento → estado → componentes → saldo → replay fast-path → overpay → inserción atómica; ACL **service_role EXCLUSIVA** (REVOKE authenticated — F3/§5 Alternativa A, alineado a CP-FIN-004 y al canal exclusivo del motor).
8. `set_received_service_status` y `create_received_service_v2`: NO se tocan (cero riesgo).

**Aplicación (backend):**
- `/api/payments` (F8/§5): gate `canManageStore` sobre la tienda activa ANTES de la llamada privilegiada; el batch viaja por el cliente service_role; actor = sesión server-side (p_paid_by nunca es parámetro del cliente); mapeos nuevos `ERR_COMBINACION_NO_SOPORTADA`→400 y `ERR_SERVICE_NOT_ACTIVE`→409. El loop receipt/OT no cambia.
- `POST /api/received-services` (F4/§6): `resolveSupplierIdentity` valida supplier_id (suppliers.store_id), master_party_id (tenant de la tienda + status activo) y coherencia ANTES del UPDATE privilegiado; snapshot y nombre desde la fila de la BD. Mismo canal para borradores y confirmación.
- `PATCH action=update-draft` (F7/§9): p_patch con SOLO las claves enviadas (tri-state); identidad bloque atómico resuelto server-side.
- Frontend (F5/§7 + F6/§8): `creation_key` estable por operación (renovada tras éxito; conservada en reintentos); `idempotency_key` del pago estable por intento de liquidación en los 3 sitios (regenerada al abrir/cambiar el contenido del lote; conservada en reintentos → replay completo); `handleSaveDraft`/`handleSubmit` ASÍNCRONOS (el bloqueo visual se libera tras esperar la promesa; el reset solo tras éxito).
- `m008-apply-migration-e2e.mjs` (F9): guard de DESTINO REAL (`projectRef: E2E_REF`).

## 3. Pruebas — matriz §11 completa (BD aislada, proyecto 'creation')

`e2e/creation/adn009-sr-postmerge-hardening.spec.ts` — **22/22 PASS** (2026-11-20, run E2E-20261120-FF22CC) + **guardrail net delta = 0 en la MISMA corrida**:

| Prueba (matriz §11) | Resultado |
|---|---|
| Transferencia Exterior USD — registro completo y cuenta correcta | PASS — pago 100 USD @400 → `external_transfer` persistido, `amount_cup`=40000, asiento con **ACT_TRANSF_EXTERIOR** + PAS_SERV_PEND a cero, partida doble equilibrada |
| Transferencia Exterior EUR (si el catálogo la permite) | PASS — mapping EUR activo → registrada, misma cuenta |
| Nuevo pago legacy `zelle` | PASS — aceptado SOLO por normalización canónica: la fila NUEVA persiste `external_transfer`; cero filas nuevas con 'zelle' (decisión documentada §2: la escritura con el valor heredado se rechaza en el sentido de que jamás se persiste) |
| Combinación incompatible (external_transfer + CUP) | PASS — 400 `ERR_COMPONENT_INVALID` temprano, cero escrituras |
| **Pago batch CONCURRENTE (batch vs batch)** | PASS — dos sesiones pg: 60+60 sobre saldo 100 → EXACTAMENTE uno confirma; el otro lee el saldo post-commit (40) y muere con `ERR_BATCH_OVERPAY`; total ≤ exigible; 1 asiento 'pago' equilibrado; sin huérfanos ni duplicados |
| **Pago individual vs batch concurrente** | PASS — mismo mecanismo de serialización compartido, resultado determinista |
| Doble creación con la misma `creation_key` (CONCURRENTE) | PASS — 2 solicitudes simultáneas → EL MISMO borrador (una con `duplicate:true`); 1 sola fila de auditoría |
| Doble clic / reintento secuencial con la misma clave | PASS — `duplicate:true`, sin fila nueva |
| RPC directa sin rol (anon) | PASS — rechazada (ACL service_role/gate) |
| Cajero (clerk) sin permiso de gestión | PASS — `ERR_UNAUTHORIZED` DESDE el RPC (gate en el cuerpo) |
| Usuario de otra tienda | PASS — `ERR_UNAUTHORIZED` |
| Actor suplantado vía `p_created_by` | PASS — IMPOSIBLE: audit `created_by` = `auth.uid()` del llamante |
| Batch llamada directa por authenticated | PASS — RECHAZADA (service_role exclusiva en la ACL) |
| Proveedor de otra tienda | PASS — rechazado por RPC (ownership) y por RUTA (resolver server-side) |
| Tercero maestro de otro tenant | PASS — `ERR_SUPPLIER_MASTER_INVALID` (tenant efímero real para cruzar la FK) |
| Identidad válida | PASS — snapshot congelado desde la BD (metadatos 'FALSO' del cliente descartados) |
| Limpiar observaciones / referencia (NULL) | PASS — NULL persistido |
| Restablecer fecha (NULL) | PASS — día operativo actual America/Havana |
| Campos omitidos | PASS — valores anteriores conservados |
| Reintento tras respuesta perdida | PASS — replay completo (`replayed:true`, mismos ids, 1 pago, 1 asiento) |
| REGRESIÓN: efectivo CUP | PASS — cuenta canónica **ACT_EFECTIVO_CUP**, obligación a cero |
| REGRESIÓN: flujo borradores 008 (crear→editar→confirmar) | PASS — borrador sin proveedor sin efectos; edición sin efectos; reconocimiento UNA vez; confirmación duplicada → `no_change` sin segundo asiento |

**Hallazgos de la ejecución E2E corregidos**: `SUPABASE_REST_URL` (export real del fixture), `fetch Response.status` (propiedad), `active_store_id` del actor de prueba (patrón cpfin003), alias `AS out` en SELECT de RPC vía pg, `JSON.stringify` de params jsonb (pg serializa arrays como array-literal), `party_type='juridica'` (CHECK), tenant efímero REAL para el maestro ajeno (FK), limpieza por `hardDeleteRunUser` (RPC `e2e_hard_delete_user` — el DELETE directo de GoTrue 500 por las columnas de token, pitfall conocido) y emails `@costpro.local` (guard de dominio del RPC).

**Suites Vitest**: 6.308/6.308 PASS (461 archivos) tras la misión — incluye las nuevas `adn009-sr-hardening-migration.test.ts` (22, contrato estático de la migración) y las suites 008 actualizadas al contrato nuevo (drafts 13, payments-batch 9, payments-route-date 9, payments-modal-auth 13). Manifiesto de migraciones 190 (determinista, --check MATCH).

**TypeCheck** `tsc --noEmit -p tsconfig.json`: **exit 0** (pm2 parado, heap 3.5GB). **ESLint**: 0 errores (warnings pre-existentes). **Build** `next build`: compilación ✓ + runAfterProductionCompile ✓; el paso TypeScript interno del build muere por OOM en el sandbox local (4GB RAM físicas — [MEDIDO]; CI ejecuta con `NODE_OPTIONS=--max-old-space-size=4096` en runner de mayor memoria — el resultado autoritativo del Build es el check de CI). **E2E smoke CI (proyecto core, mismo filtro del workflow): 45/45 PASS + net delta = 0**.

## 4. Migración correctiva — aplicación a producción

- **Aplicada UNA sola vez** a producción (CostproBD `wthkddeleylijmonclxg`) el **2026-11-20 ~20:35 UTC** por el canal gobernado: `ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND node scripts/m009-apply-migration-prod.mjs` — guard CP-INFRA-019 doble (url + `projectRef` de la Management API, fix del hallazgo Codex P1) + `--check` re-ejecutable: **10/10 marcas OK** (supplier_master_column/fk, helper, engine_lock, batch_contract, batch_acl_service_role_only, drafts_mgmt_gate, patch_signature, old_signature_gone, unique_index).
- **Post-estado verificado live**: ACL batch = `postgres, service_role` (authenticated REVOKE ✓); drafts ACL `authenticated, service_role` con gate en el cuerpo ✓; engine+batch con `external_transfer` y `FOR UPDATE` ✓; índice único presente ✓; **0 datos de negocio tocados** (solo DDL: 6 funciones + 1 helper + 1 índice + 1 columna/FK reconciliadas).
- **Surface re-certificado desde live** tras la aplicación: 220 funciones, Capa C **220/220 representadas, 0 divergencias bloqueantes** (live ≡ replay; los 2 warnings cancel_transfer/reset_store_data son PRE-existentes de otros ciclos y no bloquean).
- **No se realizaron pagos, rectificaciones contables ni movimientos de dinero** en esta misión (ni en aislada ni en producción). Los únicos escritos de negocio en aislada fueron los del propio test, eliminados por el teardown (net delta = 0).

## 5. Git

- Rama `fix/adn-srv-postmerge-hardening-009-20261121` desde `origin/main` `cc7fbe895`. Commits por fases: `31915dd97` (db+migración+scripts), `51dbc05f3` (api), `21933d5b0` (ui), `c5f9f9307` (tests), `212f8d75c` (e2e+reconciliación), `4c9ba282b` (surface re-certificado). Sin force push, sin commits directos a main, sin secretos en el diff (scan: 0 coincidencias).
- PR: enlace en el cierre de la misión (se abre tras el push; checks CI corren solos).
