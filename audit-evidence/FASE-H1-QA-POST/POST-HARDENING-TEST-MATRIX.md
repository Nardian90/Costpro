# POST-HARDENING-TEST-MATRIX — Matriz de 101 tests (corrida QA independiente)

> **FASE H1-QA-POST · Agent 2** · 2026-10-04 · corrida aislada (cleanup + fixtures + run-all) sobre `fase/create-sale-v2-hardening` @ `3c85f0e` (post-implementación H1–H6).
> Fuente: `POST-HARDENING-RESULTS.json` (totales computados desde los 16 artefactos individuales de suite en `results/` — defecto del consolidador documentado aparte).
> Clasificación: A=REAL PROD BUG · B=TEST BUG · C=OBSOLETE/CONTRACT CHANGED · D=V1 DEFERRED R1 · E=ENV/FIXTURE · F=OBSERVABILITY · "—"=PASS sin issue.

**TOTAL: 101 · ✅ PASS: 82 · ❌ FAIL: 14 · ⛔ BLOCKED: 4 · 👁️ NOT-OBSERVABLE: 1** — reproduce EXACTAMENTE el resultado reportado por el Implementation Agent.

| # | TEST | STATUS | CLS | CURRENT (corrida QA) | NOTA QA |
|---|------|--------|-----|----------------------|---------|
| 1 | `T-H1-001` | ✅ PASS | — | HTTP 401 {"code":"42501","details":null,"hint":null,"message":"permission denied for function create_sale_v2"} | regresión/contrato verificado |
| 2 | `T-H1-002` | ❌ FAIL | B | ACL LIVE = {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} | regex /=X/ detecta postgres=X del estado objetivo §2.1 — contrato cerrado verificado (has_function_privilege=false + conductual) |
| 3 | `T-H1-003` | ✅ PASS | — | anon + clave existente → HTTP 401 {"code":"42501","details":null,"hint":null,"message":"permission denied for function create_sale_v2"} | regresión/contrato verificado |
| 4 | `T-H1-004` | ✅ PASS | — | existing → HTTP 401 {"code":"42501","details":null,"hint":null,"message":"permission denied for function create_sale_v2"} \|\| random → HTTP 401 {"cod | regresión/contrato verificado |
| 5 | `T-H2-001` | ✅ PASS | — | USER_B (sin membresía STORE_A) + clave existente → HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_UNAUTHORIZED"} | regresión/contrato verificado |
| 6 | `T-H2-002` | ✅ PASS | — | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_UNAUTHORIZED"} | regresión/contrato verificado |
| 7 | `T-H2-003` | ✅ PASS | — | transacciones antes=264 después=264 (delta=0) | regresión/contrato verificado |
| 8 | `T-H2-004` | 👁️ NOT-OBSERVABLE | F | tx=true items=1 pagos~59 movimientos=1 | NOT-OBSERVABLE BY DESIGN §14 — certificación estática (auth@3509 < idem@4467) + conductual verificada |
| 9 | `T-H3-001` | ✅ PASS | — | seller_id persistido = 6eb29691-d253-4e03-b593-2b0cdd1415bc | regresión/contrato verificado |
| 10 | `T-H3-002` | ✅ PASS | — | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_SELLER_MISMATCH: p_seller_id=8b04b1a9-80c3-444e-952b-6b0256155d65 no coincide con e | regresión/contrato verificado |
| 11 | `T-H3-003` | ✅ PASS | — | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_SELLER_MISMATCH: p_seller_id=8b04b1a9-80c3-444e-952b-6b0256155d65 no coincide con e | regresión/contrato verificado |
| 12 | `T-H3-004` | ⛔ BLOCKED | C/F | probe actual: HTTP 400 → seller_id=n/a | BLOCKED congelado (evidencia H1); contrato §4.2 verificado runtime propio: ERR_SELLER_REQUIRED |
| 13 | `T-H3-005` | ✅ PASS | — | authenticated + p_user_id=USER_B → HTTP 200 {"status":"success","calculated_tax":0,"transaction_id":"947f5563-1c69-477f-a2c0-1e9aa4f03f55","discount_a | regresión/contrato verificado |
| 14 | `T-H3-006` | ✅ PASS | — | checkout admin-client+p_user_id(session)=true · sync user-token=true | regresión/contrato verificado |
| 15 | `T-H4-001` | ✅ PASS | — | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_APPLIED_TAX_INVALID: entrada sin id de configuración"} | regresión/contrato verificado |
| 16 | `T-H4-002` | ✅ PASS | — | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_APPLIED_TAX_INVALID: entrada sin id de configuración"} | regresión/contrato verificado |
| 17 | `T-H4-003` | ❌ FAIL | C | 0%→HTTP 200 tax=0 · 100%→HTTP 400 tax=? · 10000%→HTTP 400 tax=? | verdict FAIL congelado (evidencia H1); current propio: 100%/10000% cliente ahora RECHAZADOS; contrato §5.4 verificado runtime (GATE 4) |
| 18 | `T-H4-004` | ✅ PASS | — | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_APPLIED_TAX_INVALID: entrada sin id de configuración"} | regresión/contrato verificado |
| 19 | `T-H4-005` | ✅ PASS | — | referencias a tax_configurations en LIVE def: true | regresión/contrato verificado |
| 20 | `T-H5-001` | ✅ PASS | — | rate=680→aceptada stored=400 · rate=1000000→aceptada stored=400 · rate=0→aceptada stored=400 · rate=-5→aceptada stored=400 | regresión/contrato verificado |
| 21 | `T-H5-002` | ✅ PASS | — | server_rate=400 (store_exchange_rates) · client_rate=7 · persisted=400 | regresión/contrato verificado |
| 22 | `T-H5-003` | ✅ PASS | — | refs LIVE: store_exchange_rates=true · exchange_rates=true | regresión/contrato verificado |
| 23 | `T-H5-004` | ✅ PASS | — | store_exchange_rates(own) PATCH → 403 · exchange_rates INSERT → 403 | regresión/contrato verificado |
| 24 | `T-H5-005` | ✅ PASS | — | fixture EUR(store) rate=350 age=60d (>45) · client_rate=7→RECHAZADA 400 ERR_RATE_STALE ✓ · client_rate=350(vencida)→RECHAZADA 400 ERR_RATE_STALE ✓ | regresión/contrato verificado |
| 25 | `T-H5-006` | ✅ PASS | — | HTTP 200 (desviación no bloquea ✓) · persisted=400 (server=400) · audit(client_rate/server_rate/rate_source)=presente | regresión/contrato verificado |
| 26 | `T-H6-001` | ✅ PASS | — | retry → HTTP 200 {"status":"idempotent","transaction_id":"85c81177-1924-402a-b392-629c64a68f5f"} · filas=1 | regresión/contrato verificado |
| 27 | `T-H6-002` | ✅ PASS | — | tx=1 items=1 pagos=1 movimientos=1 | regresión/contrato verificado |
| 28 | `T-H6-003` | ✅ PASS | — | payload distinto (qty=2) con misma clave → HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_IDEMPOTENCY_KEY_REUSE: idempotency confl | regresión/contrato verificado |
| 29 | `T-H6-004` | ✅ PASS | — | precio distinto con misma clave → HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_IDEMPOTENCY_KEY_REUSE: idempotency conflict — la  | regresión/contrato verificado |
| 30 | `T-H6-005` | ✅ PASS | — | USER_A + clave existente + STORE_B → HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_UNAUTHORIZED"} | regresión/contrato verificado |
| 31 | `T-H6-006` | ✅ PASS | — | USER_B + clave de USER_A (STORE_A) → HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_UNAUTHORIZED"} | regresión/contrato verificado |
| 32 | `T-H6-007` | ✅ PASS | — | HTTP 401 {"code":"42501","details":null,"hint":null,"message":"permission denied for function create_sale_v2"} | regresión/contrato verificado |
| 33 | `T-H6-008` | ✅ PASS | — | HTTP 401 {"code":"42501","details":null,"hint":null,"message":"permission denied for function create_sale_v2"} | regresión/contrato verificado |
| 34 | `T-H6-009` | ✅ PASS | — | tx=1 movimientos=1 pagos=1 idsDistintos=1 | regresión/contrato verificado |
| 35 | `T-FIN-001` | ✅ PASS | — | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_SUPERVISOR_REQUIRED: global_pct=0.00000000000000000000, max_line_pct=50.00000000000 | regresión/contrato verificado |
| 36 | `T-FIN-002` | ✅ PASS | — | price_at_sale=50.00 | regresión/contrato verificado |
| 37 | `T-FIN-003` | ✅ PASS | — | ACEPTADA sin supervisor (política D1 vigente) | regresión/contrato verificado |
| 38 | `T-FIN-004` | ✅ PASS | — | subtotal persistido=100.00 | regresión/contrato verificado |
| 39 | `T-FIN-005` | ✅ PASS | — | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_TOTAL_MISMATCH: calculated=100.00, client=50"} | regresión/contrato verificado |
| 40 | `T-FIN-006` | ❌ FAIL | C | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_APPLIED_TAX_INVALID: entrada sin id de configuración"} | verdict FAIL congelado; current propio: HTTP 400 ERR_APPLIED_TAX_INVALID — JSONB cliente ya no es autoridad |
| 41 | `T-FIN-007` | ✅ PASS | — | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_INVALID_DISCOUNT: -100"} | regresión/contrato verificado |
| 42 | `T-FIN-008` | ✅ PASS | — | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_SUPERVISOR_REQUIRED: global_pct=100.00000000000000000000, max_line_pct=0"} | regresión/contrato verificado |
| 43 | `T-FIN-009` | ❌ FAIL | C | rate persistida=400.0000 · price_at_sale_cup=40000.00 | verdict FAIL congelado; current propio: rate persistida=400.0000 (server) — contrato §6 cumplido; GATE 5 verifica 4 sondas |
| 44 | `T-FIN-010` | ✅ PASS | — | cost_at_sale persistido=50 (cliente envió 999) | regresión/contrato verificado |
| 45 | `T-FIN-011` | ✅ PASS | — | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_PAYMENT_MISMATCH: cash=40, transfer=40, zelle=0, total=100.00"} | regresión/contrato verificado |
| 46 | `T-FIN-012` | ✅ PASS | — | cash_amount persistido=100.00 | regresión/contrato verificado |
| 47 | `T-CS-001` | ✅ PASS | — | HTTP 200 {"status":"success","calculated_tax":0,"transaction_id":"09ca7df0-667d-4d68-bd33-0c80a3767cc8","discount_amount":0,"calculated_total":100,"ca | regresión/contrato verificado |
| 48 | `T-CS-002` | ✅ PASS | — | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_UNAUTHORIZED"} | regresión/contrato verificado |
| 49 | `T-CS-003` | ✅ PASS | — | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_SELLER_MISMATCH: p_seller_id=8b04b1a9-80c3-444e-952b-6b0256155d65 no coincide con e | regresión/contrato verificado |
| 50 | `T-CS-004` | ✅ PASS | — | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_STORE_MISMATCH: movement store_id a5b81cbf-8ffc-4525-8ac4-f2ec92b912d2 no coincide  | regresión/contrato verificado |
| 51 | `T-CS-005` | ✅ PASS | — | USER_A + clave de USER_B → HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_UNAUTHORIZED"} | regresión/contrato verificado |
| 52 | `T-CS-006` | ✅ PASS | — | PATCH → 204 · total sigue=200.00 | regresión/contrato verificado |
| 53 | `T-CS-007` | ✅ PASS | — | GET → 200 filas=0 | regresión/contrato verificado |
| 54 | `T-INV-001` | ✅ PASS | — | delta_inventory=2 movimientos=1 items=1 | regresión/contrato verificado |
| 55 | `T-INV-002` | ✅ PASS | — | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_INSUFFICIENT_STOCK: product 24d3c7b9-06f9-481e-adb8-85471c36eff2, stock 978.0000, r | regresión/contrato verificado |
| 56 | `T-INV-003` | ✅ PASS | — | transacciones=1 idsDistintos=1 movimientos=1 inventario_final=0 · resp200=2 | regresión/contrato verificado |
| 57 | `T-INV-004` | ✅ PASS | — | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_INSUFFICIENT_STOCK: product f22dedc7-ff58-4433-8755-0d1c4e18efb1, stock 0.0000, req | regresión/contrato verificado |
| 58 | `T-INV-005` | ✅ PASS | — | filas=3 negativas=0 | regresión/contrato verificado |
| 59 | `T-TC-001` | ⛔ BLOCKED | C/F | policy única: tax_configurations_delete[DELETE] roles={authenticated} USING=(((store_id IS NULL) AND is_admin()) OR ((store_id IS NOT NU · tax_configu | BLOCKED congelado; matriz §5.2 desplegada (4 policies visibles en el propio current) y verificada LIVE |
| 60 | `T-TC-002` | ✅ PASS | — | INSERT clerk → 403 {"code":"42501","details":null,"hint":null,"message":"permission denied for function has_store_role_as"} | regresión/contrato verificado |
| 61 | `T-TC-003` | ✅ PASS | — | check constraints: CHECK ((type = ANY (ARRAY['fixed'::text, 'percentage'::text]))) · CHECK ((value > (0)::numeric)) | regresión/contrato verificado |
| 62 | `T-TC-004` | ✅ PASS | — | ventas=284→284 sumTax=50920.0000000000000000→50920.0000000000000000 | regresión/contrato verificado |
| 63 | `T-TC-005` | ✅ PASS | — | INSERT USER_B sobre STORE_A → 403 | regresión/contrato verificado |
| 64 | `T-UTT-001` | ⛔ BLOCKED | C/F | ACL={costpro_transaction_adjuster=X/costpro_transaction_adjuster,authenticated=X/costpro_transaction_adjuster,service_role=X/costpro_transaction_adjus | BLOCKED congelado; firma/owner/ACL verificados LIVE — PERO semántica runtime INALCANZABLE por DEFECTO-1 (42501) |
| 65 | `T-UTT-002` | ✅ PASS | — | clerk → HTTP 404 [object Object] | regresión/contrato verificado |
| 66 | `T-UTT-003` | ✅ PASS | — | denegada: HTTP 404 {"code":"PGRST202","details":"Searched for the function public.update_transaction_taxes with parameters p_applied_taxes, p_tax_amou | regresión/contrato verificado |
| 67 | `T-UTT-004` | ✅ PASS | — | intento total 200→5 → HTTP 404 · total persistido=200.00 | regresión/contrato verificado |
| 68 | `T-UTT-005` | ✅ PASS | — | denegada: HTTP 404 | regresión/contrato verificado |
| 69 | `T-UTT-006` | ⛔ BLOCKED | C/F | tx status=completed (completed) modificada en C7 · la función no consulta status ni exige motivo | BLOCKED congelado; checks state/reason existen en cuerpo LIVE pero INALCANZABLES por DEFECTO-1 (42501) |
| 70 | `T-UTT-007` | ✅ PASS | — | clerk → HTTP 403 [object Object] | regresión/contrato verificado |
| 71 | `T-UTT-008` | ✅ PASS | — | encargado global → HTTP 403 [object Object] | regresión/contrato verificado |
| 72 | `T-ER-001` | ✅ PASS | — | PATCH store_exchange_rates por clerk → 403 | regresión/contrato verificado |
| 73 | `T-ER-002` | ✅ PASS | — | PATCH cross-store → 403 | regresión/contrato verificado |
| 74 | `T-ER-003` | ✅ PASS | — | INSERT exchange_rates → 403 {"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for | regresión/contrato verificado |
| 75 | `T-ER-004` | ✅ PASS | — | read global→200 read store→200 write→401 | regresión/contrato verificado |
| 76 | `T-RT-001` | ✅ PASS | — | HTTP 401 {"error":"No autorizado","message":"Se requiere sesión activa"} | regresión/contrato verificado |
| 77 | `T-RT-002` | ✅ PASS | — | tx=2a1b1540-cb29-47d9-aa1b-a2ee334b0e0a seller=6eb29691-d253-4e03-b593-2b0cdd1415bc | regresión/contrato verificado |
| 78 | `T-RT-003` | ✅ PASS | — | ACEPTADA con seller persistido=6eb29691-d253-4e03-b593-2b0cdd1415bc | regresión/contrato verificado |
| 79 | `T-RT-004` | ✅ PASS | — | HTTP 400 | regresión/contrato verificado |
| 80 | `T-RT-005` | ❌ FAIL | C | ACEPTADA: rate persistida=400.0000 | test binario ante 200 (comportamiento antiguo); current propio: ACEPTADA con rate persistida=400 (server) — contrato §6.2/D-EXR-02 cumplido |
| 81 | `T-RT-006` | ✅ PASS | — | v2=true v1=false | regresión/contrato verificado |
| 82 | `T-RT-007` | ✅ PASS | — | static bind=true · body p_user_id ignorado=true | regresión/contrato verificado |
| 83 | `T-SB-001` | ✅ PASS | — | HTTP 401 | regresión/contrato verificado |
| 84 | `T-SB-002` | ✅ PASS | — | HTTP 403 {"error":"Sin acceso a la tienda especificada","key":"apiErrors.storeAccessDenied","operationKey":"949367ea-6770-4559-bd | regresión/contrato verificado |
| 85 | `T-SB-003` | ✅ PASS | — | v2=true v1=false | regresión/contrato verificado |
| 86 | `T-SB-004` | ✅ PASS | — | userToken=true admin=false | regresión/contrato verificado |
| 87 | `T-SB-005` | ✅ PASS | — | HTTP 200 · spoofed=no · log={"results":[{"idempotencyKey":"7f70259e-b006-48ec-85e8-fefbc63cab77","status":"ok","serverId":{"status":"success","calcula | regresión/contrato verificado |
| 88 | `T-V1-001` | ❌ FAIL | D | ACL LIVE V1 = {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} | gate R1 (ACL V1) — V1 vivo por mandato §11 |
| 89 | `T-V1-002` | ❌ FAIL | D | callers=1: src/hooks/api/useTransactions.ts | gate R1 (callers V1) — useTransactions.ts es el path V1 que R1 elimina |
| 90 | `T-V1-003` | ❌ FAIL | D | refs=src/config/features.ts (flag) · usePOSCheckout.ts (path v1) | gate R1 (flag/pilot/else-branch) — mecanismo de retirada cuyo retiro ES R1 |
| 91 | `T-V1-004` | ✅ PASS | — | tests legacy=0:  | regresión/contrato verificado |
| 92 | `T-V1-005` | ❌ FAIL | D | allow-list con useTransactions=true · exige presencia V1=true | gate R1 (allow-list v2-only) — pre-condición documentada de R1 |
| 93 | `T-V1-006` | ❌ FAIL | D | specs con dependencia V1/flag=1: security.spec.ts | gate R1 (E2E sin flag) — se retira con el flag en R1 |
| 94 | `T-V1-007` | ❌ FAIL | D | migraciones con GRANT V1=15: 20260114_create_sale_rpc.sql, 20260304_harden_sale_stock_logic.sql, 20260320_fix_audit_v2_hallazgos.sql, 20260324_total_r | gate R1 (grants V1 post-drop) — 15 migraciones históricas inmutables; gate se evalúa POST-drop |
| 95 | `T-V1-008` | ✅ PASS | — | pg_depend no-n=0 · funciones llamantes=0 | regresión/contrato verificado |
| 96 | `T-AR-001` | ❌ FAIL | D | src/hooks/api/useTransactions.ts (1 línea(s)) | idem T-V1-002 (caller V1 en producción) |
| 97 | `T-AR-002` | ❌ FAIL | D | refs=src/config/features.ts, .env.example · pilot-mechanism=true | idem T-V1-003 (mecanismo fallback V1) |
| 98 | `T-AR-003` | ✅ PASS | — | 0 migraciones | regresión/contrato verificado |
| 99 | `T-AR-004` | ❌ FAIL | B | ACL LIVE={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} | idem T-H1-002 (mismo patrón de regex en gate de regresión) |
| 100 | `T-AR-005` | ✅ PASS | — | 0 archivos | regresión/contrato verificado |
| 101 | `T-AR-006` | ✅ PASS | — | GRANT PUBLIC en contract-surface=false | regresión/contrato verificado |

## Recuento por categoría

| Categoría | Tests | Cantidad |
|---|---|---|
| PASS (sin issue) | 82 tests | 82 |
| B — test bug | T-H1-002, T-AR-004 | 2 |
| C — obsoleto/congelado | T-H4-003, T-FIN-006, T-FIN-009, T-RT-005 | 4 |
| D — V1 diferido a R1 | T-V1-001/002/003/005/006/007, T-AR-001/002 | 8 |
| F — not-observable by design | T-H2-004 | 1 |
| C/F — BLOCKED evidencia H1 congelada | T-H3-004, T-TC-001, T-UTT-001, T-UTT-006 | 4 |
| **A — real prod bug (en suite)** | — | **0** |
| **A — real prod bug (FUERA de suite, sonda runtime)** | **DEFECT-1: UTT 42501 permission denied for schema auth** | **1** |

*(ver FAIL-CLASSIFICATION.md para la demostración de cada clasificación y SECURITY-GATE-VERIFICATION.md §4.9 para DEFECT-1)*
