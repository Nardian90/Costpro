# CREATE-SALE-V2-QA-BASELINE — FASE H1 (QA TEST-FIRST)

**Fecha**: 2026-10-04 · **Suite**: `scripts/qa-h1/` (16 suites, 101 tests) · **Matriz**: `CREATE-SALE-V2-QA-TEST-MATRIX.md`

---

## 1. Baseline Git

| Ítem | Valor |
|------|-------|
| Repositorio | `https://github.com/Nardian90/Costpro` (clone local `/home/z/my-project/Costpro`) |
| Branch | `main` |
| HEAD | `6cba0a1c1f1d0a63fb4e2e6703b87a6a4d52cb9f` |
| origin/main | `6cba0a1c1f1d0a63fb4e2e6703b87a6a4d52cb9f` (0 ahead / 0 behind) |
| Worktree | Limpio al inicio; al cierre solo contiene adiciones de test/evidencia (§14) |

### ⛔ BLOCKER FUNDAMENTAL: la especificación H0 NO EXISTE

`CREATE-SALE-V2-HARDENING-SPEC.md` **no está en el repositorio, ni en su historia
git, ni en el entorno** (verificado: `git log --all` sin commits que lo añadan;
glob del worktree sin resultados; entre el HEAD de la sesión anterior
`c92a3a74…` y el HEAD actual solo hay 6 commits de UI/fixes sin relación). La
FASE H0 fue encargada en una sesión anterior que agotó contexto antes de
producirla; sus entregables locales se perdieron con aquel entorno.

**Consecuencia**: los contratos que el prompt de FASE H1 define de forma
determinista (H1.x, H2, H3.1–3.3/3.5, H4.1/4.4, H5.1–5.4, matriz H6 completa,
matriz cross-store, integridad financiera, inventario, rutas, gates V1 y
anti-resurrección) **sí fueron traducidos a tests ejecutables**. Los que
dependen de decisiones de H0 quedan como **BLOCKED** (6) — **no se inventaron
contratos**. El veredicto final refleja esto (§13).

## 2. Entorno

| Ítem | Valor |
|------|-------|
| Node / Bun | v24.21.0 / 1.3.14 |
| Servidor app | PM2 `costpro` (bun server.ts) — `http://localhost:3000`, dev mode, `GET /` 200, `/api/health` OK; flags `NEXT_PUBLIC_USE_V2_CHECKOUT=true`, `NEXT_PUBLIC_USE_V2_REVERSE=true` |
| Otros procesos PM2 | `telegram-cron-poller`, `whatsapp-cron-poller` (online; hits 401 por CRON_SECRET ausente — fail-closed por diseño) |
| DB | Supabase LIVE `wthkddeleylijmonclxg` (PostgreSQL via Management API con `SUPABASE_ACCESS_TOKEN`; REST con keys anon/service) |
| Función auditada | `public.create_sale_v2` — firma /24 (E-SEC-FINAL), SECURITY DEFINER, 26.981 chars, `search_path=public,pg_temp` |
| ACL LIVE V2 | `{=X (PUBLIC), postgres, authenticated, service_role}` — **anon ejecuta vía PUBLIC** |
| ACL LIVE V1 | `{postgres, authenticated, service_role}` — **authenticated ejecuta V1** |
| CI existente | `.github/workflows/`: ci.yml (typecheck/lint/unit/e2e/build), security-gate.yml (ts/sql checks + allowlist), daily-audit, test-coverage |

## 3. Tests creados

```
scripts/qa-h1/
├── lib.cjs                  helpers (env, REST/Mgmt, actores, suite-runner, asserts)
├── 00-fixtures.cjs          fixtures idempotentes (ensure/restock/cleanup)
├── 10-h1-acl.cjs            H1.1–H1.3 + ACL LIVE (§16)
├── 11-h2-order.cjs          H2 orden autenticación→idempotencia
├── 12-h3-seller.cjs         H3.1–H3.5 seller binding
├── 13-h4-tax.cjs            H4.1–H4.4 autoridad tributaria
├── 14-h5-rate.cjs           H5.1–H5.6 autoridad de tasa
├── 15-h6-idempotency.cjs    §11 matriz completa + concurrencia
├── 16-financial.cjs         §12 integridad financiera
├── 17-cross-store.cjs       §13 matriz A–F
├── 18-inventory.cjs         §14 atomicidad/oversell/rollback
├── 20-collateral-taxcfg.cjs §8 C1–C4
├── 21-collateral-utt.cjs    §9 C5–C10 + adjust_total_amount
├── 22-collateral-rates.cjs  fuentes de tasa
├── 30-route-checkout.cjs    §17 /api/pos/checkout
├── 31-route-sync.cjs        §17 /api/sync/batch (H3.5)
├── 40-v1-retirement.cjs     §15 gates PR-R1
├── 41-anti-resurrection.cjs §16 anti-resurrección
├── run-all.cjs              orquestador + consolidado
├── gen-matrix.cjs           generador de la matriz .md
└── README.md                documentación de uso
```

**Actores reales** (creados como fixtures con service_role, patrón del repo;
nunca admin global para pruebas de aislamiento):

| Actor | Identidad | Alcance |
|-------|-----------|---------|
| USER_A | `qa.h1.a@costpro.test` | rol global `usuario`, membresía `clerk` en STORE_A (`QA-H1-A`) |
| USER_B | `qa.h1.b@costpro.test` | rol global `usuario`, membresía `clerk` en STORE_B (`QA-H1-B`) |
| SUPER_A | `qa.h1.sup@costpro.test` | rol global `usuario`, membresía `manager` en STORE_A (supervisor propio RC-1) |
| ENC_B | `qa.h1.enc@costpro.test` | rol global **`encargado`**, membresía `clerk` en STORE_B (exposición del alcance global de `update_transaction_taxes`) |

Limpieza disponible: `node scripts/qa-h1/00-fixtures.cjs cleanup`.

## 4. Tests ejecutados

101 tests ejecutados contra el sistema REAL (RPC REST PostgREST con JWT de
actores; rutas HTTP con Bearer; SQL de inspección via Management API;
concurrencia real con `Promise.all`). Ningún mock que elimine una frontera de
seguridad; `service_role` solo para fixtures/limpieza/inspección post-hoc.

**Resultado global: 101 · ✅ 50 PASS · ❌ 44 FAIL · ⛔ 6 BLOCKED · 👁️ 1 NOT-OBSERVABLE** (237s)

## 5. PASS (50) — lo que YA funciona y debe seguir funcionando

- **H1.1** anon sin clave → DENIED sin fuga (T-H1-001); anon+clave aleatoria → DENIED (T-H6-008).
- **AuthZ por membresía** cuando la clave no golpea: no-miembro → ERR_UNAUTHORIZED (T-H2-002), denegación sin escrituras (T-H2-003).
- **H3 parcial**: atribución correcta cuando seller=self (T-H3-001); `p_user_id` ignorado fuera de service_role (T-H3-005); census de callers service_role (T-H3-006).
- **Integridad financiera server-side existente**: subtotal recalculado (T-FIN-004), total mismatch (T-FIN-005), costo=WAC server (T-FIN-010), gate de desvío de precio ≥15% con supervisor propio+motivo (T-FIN-001/002), descuento capped (T-FIN-008), pagos consistentes (T-FIN-011/012).
- **Idempotencia básica**: misma clave+payload → misma tx (T-H6-001/002); clave en tienda ajena no satisface (T-H6-005); **concurrencia con misma clave: exactamente 1 tx/movimiento/pago** (T-H6-009); **última unidad bajo concurrencia sin oversell** (T-INV-003).
- **Inventario**: cadena atómica (T-INV-001), oversell bloqueado (T-INV-002), rollback íntegro (T-INV-004), invariante quantity ≥ 0 (T-INV-005).
- **Cross-store (membresía)**: venta en tienda ajena denegada (T-CS-002), producto ajeno rechazado por trigger `ERR_STORE_MISMATCH` (T-CS-004 — defense-in-depth), RLS select/update bloquea lectura/escritura de txs ajenas (T-CS-006/007).
- **Colaterales**: clerk no puede modificar venta cerrada (T-UTT-002); **`total_amount` es inmutable salvo `adjust_total_amount`** — trigger `protect_transactions_total_amount` PT008 (T-UTT-004); `adjust_total_amount` bien endurecido para no-admins (T-UTT-007/008); tax_config no recalcula ventas previas (T-TC-004); cross-store fiscal denegado (T-TC-005); `exchange_rates` global protegido (T-ER-003) y cerrado a anon (T-ER-004).
- **Rutas**: 401 sin sesión en checkout y sync (T-RT-001/T-SB-001); venta válida por ruta (T-RT-002); RPC canónico V2 (T-RT-006/T-SB-003); `p_user_id` bound a sesión (T-RT-007); **sync/batch: gate por operación de tienda ajena 403** (T-SB-002) y ejecuta con token del usuario, no service_role (T-SB-004).
- **V1**: tests legacy ya migrados (T-V1-004); función V1 removible sin dependientes (T-V1-008).

## 6. FAIL (44) — la lista inequívoca para el implementador

### Bloqueadores H (comportamiento que el hardening H1–H6 debe corregir)

1. **T-H1-002 / T-AR-004** — ACL LIVE: `create_sale_v2` ejecutable por **PUBLIC** (patrón canónico F4). Fix: REVOKE a PUBLIC/anon en LIVE **y** en migración.
2. **T-H1-003 / T-H6-007 / T-CS-005 / T-H2-001 / T-H6-006** — **idempotencia antes de autZ**: anon y no-miembros reciben `200 {status:'idempotent', transaction_id}` de ventas ajenas (fuga de existencia + ID, cross-actor y cross-store). Fix: reordenar auth→authZ→idempotencia.
3. **T-H1-004** — la clave existente vs aleatoria es distinguible por anon (oráculo de existencia).
4. **T-H3-002 / T-H3-003 / T-CS-003 / T-RT-003 / T-SB-005** — **seller spoofing**: `p_seller_id` del cliente se persiste tal cual (RPC directo, ruta checkout y sync). USER_A vende como USER_B (incluso cross-store) y la venta queda atribuida a USER_B.
5. **T-H4-001…005 / T-FIN-006 / T-RT-004** — **autoridad tributaria en el cliente**: `p_applied_taxes` JSONB cliente es la única fuente; impuestos negativos (fijo −30 / −10%) aceptados como descuento implícito que **esquiva el gate de supervisor** (venta al 70% sin autorización); 0%/100%/10000% aceptados; 0 referencias a `tax_configurations`.
6. **T-H5-001…004 / T-FIN-009 / T-RT-005** — **autoridad de tasa en el cliente**: `p_sale_exchange_rate` persistido tal cual (1/680/1000000/0/−5), `price_at_sale_cup = precio×tasa cliente`; sin jerarquía `store_exchange_rates→exchange_rates`; fuente de tienda reescribible por **cualquier miembro (clerk)** (policy "Users can manage own store rates") e incluso cross-store parcial (T-ER-002: política por `profiles.store_id`).
7. **T-H6-003 / T-H6-004** — retry con **payload distinto** (cantidad/precio) retorna silenciosamente la tx original: no hay `IDEMPOTENCY_CONFLICT` (la clave no está ligada al hash del payload).
8. **T-FIN-007** — **descuento negativo** (fixed −100) aceptado: el total se infla a 200 y el pct negativo no dispara supervisor.

### Superficies colaterales

9. **T-TC-002 / T-TC-003** — `tax_configurations`: clerk crea impuestos arbitrarios activos (201) y la tabla no tiene CHECK de rango sobre `value` (negativos introducibles).
10. **T-UTT-003 / T-UTT-005** — `update_transaction_taxes`: reescribe `tax_amount`/`applied_taxes` tal cual (999%/777) sin recálculo ni invariante, y un **encargado GLOBAL de STORE_B modifica transacciones de STORE_A** (SECDEF + rol global sin scoping; RLS no protege porque corre como postgres). El total queda a salvo SOLO por el trigger PT008.
11. **T-ER-001 / T-ER-002** — `store_exchange_rates` reescribible por clerk de la tienda (204) — la futura fuente confiable de H5 NO es confiable hoy.

### Gates de retiro V1 (esperados en FAIL hasta PR-R1)

12. **T-V1-001** — V1 aún ejecutable por `authenticated` en LIVE.
13. **T-V1-002 / T-AR-001** — caller V1 vivo: `src/hooks/api/useTransactions.ts` (`rpcName='create_sale'`).
14. **T-V1-003 / T-AR-002** — mecanismo de fallback V1 completo: flag `USE_V2_CHECKOUT` + pilot stores + else-branch V1 en `usePOSCheckout.ts` + `.env.example`.
15. **T-V1-005** — el contract test V2-ONLY **permite y exige** el caller V1 (allow-list `useTransactions`).
16. **T-V1-006** — E2E `security.spec.ts` referencia el flag/V1.
17. **T-V1-007 / T-AR-003** — 15 migraciones con grants históricos V1; y **6 migraciones re-grantean `TO PUBLIC` sobre `create_sale_v2`** (el reconciler F4 es el mecanismo de resurrección del grant peligroso).

## 7. BLOCKED (6) — decisiones H0 ausentes (NO se inventaron)

| Test | Decisión H0 requerida |
|------|----------------------|
| T-H3-004 | `p_seller_id` ausente: ¿rechazar o derivar del actor? (probe actual: HTTP 400, no se persiste) |
| T-H5-005 | Staleness de tasa (p.ej. 45 días) — además `store_exchange_rates` no tiene fecha de captura y el RPC no consulta la fuente |
| T-H5-006 | Banda de desviación de tasa (p.ej. ±10%) dentro/fuera |
| T-TC-001 | Matriz rol→operación sobre `tax_configurations` |
| T-UTT-001 | Contrato de autorización exacto de `update_transaction_taxes` (quiénes, qué tiendas) |
| T-UTT-006 | Estados/justificación permitidos para modificación tributaria post-venta |

## 8. NOT-OBSERVABLE (1)

- **T-H2-004** — la secuencia INTERNA exacta (actor→authZ→membresía→idempotencia→validación→cálculo→inventario) no es observable en runtime sin instrumentation PG. Evidencia runtime disponible: T-H1-003/T-H2-001 demuestran empíricamente que idempotencia precede a authZ. **Requiere verificación por Agent 3** (pg_stat_statements/trace). Evidencia estática: `pg_get_functiondef` posiciona "2. Idempotencia" (offset ~2798) antes de "3. Auth" (offset ~3242).

## 9. Evidencia

- `audit-evidence/FASE-H1/results/*.json` — 16 suites + `_consolidated.json` (por test: id, spec, expected, current, status, evidence).
- `audit-evidence/FASE-H1/CREATE-SALE-V2-QA-TEST-MATRIX.md` — matriz completa 101 filas.
- Scripts re-ejecutables: `node scripts/qa-h1/run-all.cjs`.
- Definiciones LIVE extraídas: `pg_get_functiondef` de `create_sale_v2` (26.981 chars), `create_sale` (5.216), `update_transaction_taxes` (19.118), `adjust_total_amount`, `has_store_access_as`, `has_role`, triggers de `stock_movements`/`inventory`/`transactions` (incl. `fn_sync_inventory_on_movement`, `protect_transactions_total_amount`).

## 10. Relación con H1–H6

| Contrato | Tests | Estado |
|----------|-------|--------|
| H1 ACL + auth-before-idempotency | T-H1-001…004, T-H2-001…003, T-H6-007/008 | 1/4 + 2/4 + oráculo roto |
| H2 orden de autenticación | T-H2-001…004 | runtime: violación demostrada; secuencia interna NOT-OBSERVABLE |
| H3 seller binding | T-H3-001…006 | spoofing VIVO en RPC/ruta/sync; p_user_id OK; NULL → BLOCKED |
| H4 autoridad tributaria | T-H4-001…005, T-FIN-006 | 0/5 — fuente única: JSONB cliente |
| H5 autoridad de tasa | T-H5-001…006 | 0/4 ejecutables — tasa cliente persistida; fuente reescribible por clerk |
| H6 idempotencia | T-H6-001…009 | básica/concurrencia OK; conflicto-payload y fuga cross-actor rotos |
| Integridad financiera (§12) | T-FIN-001…012 | 9/12 — fallan tax, descuento negativo y tasa |
| Cross-store (§13) | T-CS-001…007 | membresía/RLS OK; seller y clave robada fallan |
| Inventario/concurrencia (§14) | T-INV-001…005 | 5/5 |

## 11. Relación con superficies colaterales

| Superficie | Tests | Hallazgo |
|------------|-------|----------|
| `tax_configurations` | T-TC-001…005 | policy única ALL para cualquier miembro; sin CHECK de value; cross-store cerrado |
| `update_transaction_taxes` | T-UTT-001…008 | ACL authenticated + rol GLOBAL sin tienda; reescritura sin recálculo; total salvado solo por trigger PT008 |
| `adjust_total_amount` (adyacente, descubierta) | T-UTT-007/008 | bien endurecida (is_admin+motivo+invariante pagos+audit); asimetría con UTT documentada |
| `store_exchange_rates` | T-ER-001/002, T-H5-004 | reescribible por clerk (y patrón cross-store parcial) |
| `exchange_rates` | T-ER-003/004 | protegida (service_role-only) |
| `/api/pos/checkout` | T-RT-001…007 | reenvía seller/tax/rate del cliente; auth/CSRF/RPC canónico OK |
| `/api/sync/batch` | T-SB-001…005 | gate por tienda OK; reenvía p_seller_id encolado (spoofing vía offline) |

## 12. V1 retirement readiness (gates PR-R1)

| Gate | Test | Estado actual |
|------|------|---------------|
| ACL V1 sin authenticated | T-V1-001 | ❌ `{postgres, authenticated, service_role}` |
| Callers V1 = 0 | T-V1-002 / T-AR-001 | ❌ `useTransactions.ts` (1 caller) |
| `USE_V2_CHECKOUT=false` refs = 0 | T-V1-003 / T-AR-002 | ❌ flag+pilot+else-branch+.env.example |
| Tests legacy V1 = 0 | T-V1-004 | ✅ |
| Allow-list prohíbe V1 | T-V1-005 | ❌ permite+exige useTransactions |
| E2E usa V2 | T-V1-006 | ❌ security.spec.ts referencia flag |
| Reconciler no resucita V1 | T-V1-007 | ❌ 15 migraciones con grants V1 (históricos) |
| V1 removible | T-V1-008 | ✅ sin dependientes pg_depend |

## 13. Anti-resurrection coverage

| Vector | Test | Cobertura |
|--------|------|-----------|
| `create_sale(` como caller legítimo | T-AR-001 | censo src+scripts activos (excl. tests) |
| Fallback V1 (flag/equivalentes) | T-AR-002 / T-V1-003 | features.ts/.env.example/CI + pilot stores |
| Grants `PUBLIC/anon → create_sale_v2` en migraciones | T-AR-003 | 6 ofensores (incl. reconciler F4) |
| Grants peligrosos en LIVE | T-AR-004 / T-H1-002 | proacl LIVE |
| Restauración de grants V1 en scripts/seeds/CI | T-AR-005 | censo |
| `contract-surface.sql` no canoniza PUBLIC | T-AR-006 | ✅ (hoy el grant peligroso vive en migraciones, no en contract-surface) |

---

## 14. Integridad de la fase (Definition of Done)

- [x] H1–H6 tienen al menos un test verificable cada uno (H0 no pudo ser leído — §1).
- [x] Seller spoofing cubierto (RPC + ruta + sync).
- [x] Tax manipulation cubierta (matriz 0/−10/100/10000% + negativo fijo + supervisor bypass + fuente).
- [x] Exchange-rate manipulation cubierta (matriz de tasas + fuente + jerarquía).
- [x] Idempotency leakage cubierta (anon / no-miembro / cross-actor / oráculo de existencia).
- [x] Concurrent idempotency cubierta (misma clave paralela + última unidad).
- [x] Cross-store cubierta con usuarios reales (matriz A–F, membresías activas, sin admin global).
- [x] `tax_configurations` cubierta (C1 BLOCKED por H0; C2–C4 ejecutables).
- [x] `store_exchange_rates` cubierta.
- [x] `update_transaction_taxes` cubierta (C5/C10 BLOCKED por H0; resto ejecutable).
- [x] `/api/pos/checkout` cubierta (7 tests E2E reales con JWT).
- [x] `/sync/batch` cubierta (5 tests, incl. spoofing offline).
- [x] Financial integrity matrix existe (12 tests campo a campo).
- [x] V1 retirement gates existen (8 gates).
- [x] Anti-resurrection checks existen (6 vectores).
- [x] No se modificó lógica de producción (git status: solo adiciones bajo `scripts/qa-h1/` y `audit-evidence/FASE-H1/`).
- [x] No se debilitó ningún test (sin skips, sin PASS*, sin mocks de frontera).
- [x] Worktree limpio salvo tests/documentación (verificar con `git status`).
- [x] Lista inequívoca de fallos actuales entregada (§6, 44 FAIL con IDs).

## 15. VEREDICTO FINAL

# `BLOCKED — TEST CONTRACT AMBIGUITY`

**Justificación**: la especificación H0 (`CREATE-SALE-V2-HARDENING-SPEC.md`)
**no existe** — la FASE H0 nunca fue producida y su ausencia hace imposible
construir expected results deterministas para 6 contratos (§7) y verificar la
casilla "H0 fue leído completamente". No se alteró ningún contrato para forzar
`READY FOR IMPLEMENTATION`.

**Estado real del entregable**: la red de seguridad está construida y es
ejecutable — 101 tests, de los cuales **44 FAIL documentan con evidencia
runtime exactamente los vectores que el hardening debe cerrar** (anon-execución
via PUBLIC, oráculo de idempotencia, seller spoofing en 3 superficies, impuestos
de cliente con descuento implícito, tasas de cliente, fuentes reescribibles,
UTT cross-store) y **6 gates de retiro V1 + 6 vectores anti-resurrección**
quedan armados para PR-R1.

**Para desbloquear**: producir H0 con las 6 decisiones de §7 (seller_id
ausente, staleness, banda de tasa, matriz de roles de tax_config, contrato de
autorización de update_transaction_taxes, estados/justificación UTT) y
re-ejecutar `node scripts/qa-h1/run-all.cjs` — los BLOCKED se convertirán en
tests ejecutables sin tocar el resto de la suite.
