# FASE H1-IMPL — IMPLEMENTATION EVIDENCE · create_sale_v2 hardening (H1–H6)

> **Implementation Agent** · 2026-10-04 · rama `fase/create-sale-v2-hardening` (desde `origin/main` = `a4aa1ee`, merge PR #1354 H0-R-FINAL).
> Contrato EXCLUSIVO: `audit-evidence/FASE-H0-R/CREATE-SALE-V2-HARDENING-SPEC-RECOVERED.md` (versión H0-R-FINAL — D-EXR-01/D-EXR-02/D-TAX-01 APPROVED, §15) + matriz/baseline H1 + suite `scripts/qa-h1/` (101 tests).
> Cero decisiones de arquitectura inventadas. Cero modificaciones a los 101 tests. Cero relajaciones de assertions.

---

## 1. Resumen ejecutivo

```text
CORRIDA FINAL (aislada: cleanup + fixtures + run-all, 2026-10-04T14:2xZ):
  101 tests · 82 PASS · 14 FAIL · 4 BLOCKED · 1 NOT-OBSERVABLE

Composición del delta (vs baseline 50 PASS · 46 FAIL · 4 BLOCKED · 1 NO):
  +32 FAIL → PASS   (todos los FAIL revertibles en runtime — vía corrección de producción)
  50 PASS intactos (REGRESSION CONTRACT — sin rupturas)
  14 FAIL restantes =
      8 × gates V1 (PR-R1 — EXCLUIDOS de esta fase por mandato §11 y spec §11/§17.8)
      6 × limitaciones estructurales del código de test (documentadas en §6 — NO son
          fallos del sistema: el contrato subyacente está verificado en runtime)
  4 BLOCKED = evidencia H1 congelada (spec §16: "convertibles a expected definitivo
      en el PR de QA post-implementación" — trabajo de Agent 2)
  1 NOT-OBSERVABLE = T-H2-004 (por diseño, certificación §14 — estática+conductual)
```

Los 9 gates de seguridad del mandato §15 están **cerrados y verificados en runtime** (ver §4).

---

## 2. Producción desplegada (LIVE — Management API)

### 2.1 Migraciones aplicadas (orden de cadena)

| # | Migración | Fase | Contenido contractual |
|---|-----------|------|----------------------|
| 1 | `20261004130000_h0r_create_sale_v2_hardening.sql` | H1/H2/H3/H4/H5/H6-núcleo | RPC /24 endurecido (§17.1 — una migración por mandato del spec): reorden §3.1 (auth→seller→fecha→idempotencia), seller binding §4 (`ERR_SELLER_REQUIRED`/`ERR_SELLER_MISMATCH`), impuestos §5.4 (validación+reemplazo desde `tax_configurations`, `ERR_APPLIED_TAX_INVALID`), tasa §6.1 (jerarquía store→BCC seg3→elToque→fail-closed + **D-EXR-01** staleness 45d `ERR_RATE_STALE` + **D-EXR-02** cliente informational-only), idempotencia §7 (`param_hash` exhaustivo + `ERR_IDEMPOTENCY_KEY_REUSE`), descuento §8 (`ERR_INVALID_DISCOUNT`), auditoría ampliada (`client_rate`/`server_rate`/`rate_source`/`idempotency_param_hash`). + REVOKE PUBLIC/anon (§17.2) |
| 2 | `20261004130001_h0r_tax_configurations_authority.sql` | H3 | `CHECK (value > 0)` + policies SELECT/INSERT/UPDATE/DELETE por matriz §5.2 (global=admin global; tienda=admin/manager/encargado `canManageStore`; lectura global para authenticated) |
| 3 | `20261004130002_h0r_store_exchange_rates_authority.sql` | H4 | `CHECK (rate > 0)` + policies §6.4 alineadas a `canManageStore` (UPDATE con WITH CHECK restrictivo → 403 explícito, no 204 silencioso) |
| 4 | `20261004130003_h0r_update_transaction_taxes.sql` | H3 | UTT endurecida §9.4: DROP firma /4 insegura → firma /3 `(uuid, jsonb, text)`; owner `costpro_transaction_adjuster` (clase PT008); WHO por tienda; estados `pending|completed`; motivo PT013; recálculo server desde catálogo; invariante PT002; auditoría old/new. Grant CREATE-on-schema transitorio para el ALTER OWNER (postgres no-superuser) — revertido inmediatamente |
| 5 | `20261004130004_h0r_acl_reconciler.sql` | H1 | Reconciler final idempotente §12.3 — estado canónico `{authenticated, service_role}` (estable frente a futuros replays) |

### 2.2 Cambios de ACL/RLS/grants (registro obligatorio §13)

```text
create_sale_v2 proacl:   {=X/PUBLIC, postgres, authenticated, service_role}
                      →  {postgres, authenticated, service_role}      [anon_can_execute = false — verificado]
update_transaction_taxes: DROP /4 (ACL {postgres, authenticated, service_role})
                      →  /3 SECDEF owner=costpro_transaction_adjuster, ACL {costpro_transaction_adjuster, authenticated, service_role}
has_store_role_as:       + GRANT EXECUTE TO costpro_transaction_adjuster (mínimo, para el cuerpo UTT SECDEF)
tax_configurations:      DROP "Tax unified" [ALL authenticated] → 4 policies por operación/rol
store_exchange_rates:    DROP "Users can manage own store rates" + "Users can view own store rates" → 4 policies canManageStore
exchange_rates:          SIN CAMBIO (ya protegida — service_role-only para escritura)
adjust_total_amount:     SIN CAMBIO (prohibido relajar — spec §10)
RLS adicional:           tax_configurations_value_positive + store_rates_positive (CHECK > 0)
```

### 2.3 Cadena anti-resurrección (§12.3 — replay(limpio) == LIVE)

- **6 migraciones ofensoras corregidas**: `20260807000003_v2_16_3` (+REVOKE PUBLIC), `20260810000003_v2_19_3` (+REVOKE PUBLIC), `20260810000070_pr4_4e` (+REVOKE PUBLIC), `20260916000002_rem_inv_6` (bloque DO reescrito: PUBLIC/anon SIEMPRE revocado), `20260927000001_esec_final` (+REVOKE inmediato tras CREATE /24), `20260927000002_f4` (reescrita completa: ya no canoniza el grant peligroso).
- **GRANTs de create_sale_v2 centralizados** en 2 archivos ACL-dedicados sin cuerpos de función: `20260927000002_f4` + `20261004130004_h0r_acl_reconciler` — estructura requerida por el census T-AR-003 (ver §6.3: su regex `/TO\s+PUBLIC/` matchea `INSERT INTO public.*` de cualquier cuerpo SQL).
- **contract-surface.sql**: anotación `proacl` de create_sale_v2 sin la entrada de PUBLIC (replay del contract-surface ya no materializa EXECUTE público).
- Observación fuera de alcance (documentada, NO tocada): `rem_inv_6` mantiene `GRANT ... TO PUBLIC` para OTRAS funciones (register_reception, reverse_receipt_v2, void_pending_reception, void_transaction) — superficie ajena a este hardening; candidata a fase propia.

### 2.4 Rutas y frontend

| Archivo | Cambio |
|---|---|
| `src/app/api/pos/checkout/route.ts` | `p_seller_id := session.user.id` (no reenvía el body — §4/§10); Zod `applied_taxes: z.array(z.object({id: z.string().uuid()}).passthrough())` (antes `z.array(z.any())`); mapeos HTTP para `ERR_SELLER_*`, `ERR_APPLIED_TAX_INVALID`, `ERR_RATE_STALE` (409), `ERR_EXCHANGE_RATE_UNAVAILABLE` (409), `ERR_INVALID_DISCOUNT` (422), `ERR_IDEMPOTENCY_KEY_REUSE` (409) |
| `src/app/api/sync/batch/route.ts` | mapeo `sale → create_sale_v2`: `p_seller_id := session.user.id` (payload encolado = dato de cliente no confiable) |
| `src/components/views/terminal/views/sales/TransactionDetailsModal.tsx` | firma UTT /3 (`{p_transaction_id, p_applied_taxes: ids, p_reason}`); recálculo client-side degradado a **preview-only** (§9.4); UI: borrador + motivo obligatorio (1..500) + vista previa + guardar |
| `usePOSCheckout.ts` / `useSalesCatalog.ts` / `features.ts` / `USE_V2_CHECKOUT` | **SIN CAMBIO** (V1 vivo — retiro es PR-R1; el frontend ya enviaba seller=user.id) |

### 2.5 Verificaciones runtime LIVE (captura completa: `live-post-hardening.txt`)

```text
anon_can_execute(create_sale_v2)   = false                      ← gate §15 definitivo
ACL v2                             = {postgres, authenticated, service_role} (sin entrada de PUBLIC)
orden interno                      = auth (offset 3575) ANTES de idempotencia (offset 7671) — verificación estática §14
refs tax_configurations/store_exchange_rates/exchange_rates = true/true/true
ERR_RATE_STALE / ERR_SELLER_MISMATCH / ERR_IDEMPOTENCY_KEY_REUSE / ERR_INVALID_DISCOUNT / ERR_APPLIED_TAX_INVALID = presentes
UTT args                           = (p_transaction_id uuid, p_applied_taxes jsonb, p_reason text); owner=costpro_transaction_adjuster
idempotency_registry               = 62 filas create_sale_v2 en producción (patrón V2.26 operativo)
auditoría extendida                = client_rate=1000000 → server_rate=400.0000, rate_source=store, param_hash=md5 ✓ (D-EXR-02)
TypeScript (tsc --noEmit)          = 0 errores
vitest pos-checkout (20 tests)     = 20 PASS · rem-inv-2 (4 tests) = 4 PASS (regresión unitaria intacta)
```

---

## 3. Resultados por suite (corrida final aislada)

| Suite | PASS | FAIL | BLOCKED | NO |
|---|---|---|---|---|
| 10-h1-acl | 3 | 1 (T-H1-002 §6.1) | 0 | 0 |
| 11-h2-order | 3 | 0 | 0 | 1 |
| 12-h3-seller | 5 | 0 | 1 (congelado) | 0 |
| 13-h4-tax | 4 | 1 (T-H4-003 §6.2) | 0 | 0 |
| 14-h5-rate | **6** | 0 | 0 | 0 |
| 15-h6-idempotency | **9** | 0 | 0 | 0 |
| 16-financial | 10 | 2 (§6.2) | 0 | 0 |
| 17-cross-store | **7** | 0 | 0 | 0 |
| 18-inventory | **5** | 0 | 0 | 0 |
| 20-collateral-taxcfg | 4 | 0 | 1 (congelado) | 0 |
| 21-collateral-utt | 6 | 0 | 2 (congelados) | 0 |
| 22-collateral-rates | **4** | 0 | 0 | 0 |
| 30-route-checkout | 6 | 1 (T-RT-005 §6.2) | 0 | 0 |
| 31-route-sync | **5** | 0 | 0 | 0 |
| 40-v1-retirement | 2 | 6 (PR-R1) | 0 | 0 |
| 41-anti-resurrection | 3 | 3 (2×PR-R1 + T-AR-004 §6.1) | 0 | 0 |

---

## 4. Gates de seguridad (mandato §15) — verificación

| Gate | Estado | Evidencia runtime |
|---|---|---|
| anon cannot execute V2 | ✅ CERRADO | `anon_can_execute=false` (LIVE) + T-H1-001/003/004 PASS (rechazo uniforme 403, claves indistinguibles) |
| idempotency leak closed | ✅ CERRADO | T-H1-003/004, T-H2-001, T-H6-006/007, T-CS-005 PASS — auth precede idempotencia |
| seller spoofing closed | ✅ CERRADO | T-H3-002/003, T-CS-003, T-RT-003, T-SB-005 PASS (RPC + ambas rutas derivan/verifican actor) |
| tax manipulation closed | ✅ CERRADO | T-H4-001/002/004, T-FIN-007, T-TC-002/003, T-RT-004, T-UTT-003/005 PASS |
| cross-store tax mutation closed | ✅ CERRADO | T-UTT-005 (encargado global sin membresía → denegado), T-TC-005, T-ER-002 PASS |
| client exchange-rate authority gone | ✅ CERRADO | T-H5-001/002/006, T-FIN-009*, T-RT-004 PASS — tasa servidor persistida siempre |
| stale rate rejected | ✅ CERRADO | T-H5-005 PASS — D-EXR-01 fail-closed a los 45 días, ambas sondas rechazadas con `ERR_RATE_STALE` |
| idempotency collision protected | ✅ CERRADO | T-H6-003/004/005/006 PASS — `ERR_IDEMPOTENCY_KEY_REUSE` sin fuga, sin 500 del índice único |
| concurrency protected | ✅ CERRADO | T-H6-009, T-INV-003 PASS — advisory-lock + registry serializan retries/última unidad |

V1: `create_sale` sigue PRESENTE y ejecutable (sin DROP, sin REVOKE, sin cambio de flag) — conforme a mandato §11. El retiro V1 es **PR-R1** (gates §11 + anti-resurrección §12), después de la certificación independiente.

---

## 5. Contradicciones código-vs-spec DOCUMENTADAS (mandato §12: "documenta la contradicción")

Ningún test fue modificado. Las siguientes limitaciones están documentadas en lugar de "resueltas":

### 6.1 Regex de ACL imposible de satisfacer (T-H1-002 / T-AR-004)
El check `const hasPublic = /=X/.test(acl)` matchea el substring `=X` presente en **cualquier** grant EXECUTE materializado — incluido `postgres=X` del propio estado objetivo del spec (§2.1: `{postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}`). La prueba empírica: el estado LIVE ACTUAL es exactamente el objetivo del spec y el test reporta FAIL. El contrato de fondo (PUBLIC/anon sin EXECUTE) está verificado por `anon_can_execute=false` + T-H1-001/003/004 (conductual). Corrección del regex: `/(^|\{|\,)\=X\//` — corresponde al PR de QA.

### 6.2 Status hardcodeados como evidencia H1 (T-H4-003 / T-FIN-006 / T-FIN-009 / T-RT-005)
- `T-H4-003` y `T-FIN-006` retornan `status:'FAIL'` literal (el veredicto de la evidencia pre-hardening quedó congelado en el código del test).
- `T-FIN-009` retorna `status:'FAIL'` literal.
- `T-RT-005` retorna FAIL ante **cualquier** HTTP 200: la corrida actual muestra `current: ACEPTADA: rate persistida=400.0000` — la tasa persistida ES la servidor (no la 1000000 del cliente), es decir, el contrato §6.2 se CUMPLE y la venta debe ser aceptada (D-EXR-02: la desviación jamás bloquea). El test no implementa la rama "aceptada-con-tasa-servidor".
Estos 4 tests requieren expected definitivo en el PR de QA post-implementación (misma clase que los 4 BLOCKED congelados — spec §16).

### 6.3 Regex del census T-AR-003 (`/TO\s+PUBLIC/` matchea `INSERT INTO public.*`)
Cualquier migración que contenga `GRANT EXECUTE ... create_sale_v2` Y un cuerpo de función con `INSERT INTO public.*` queda señalada (el "TO" de "INTO"). Resolución SIN tocar el test: los GRANTs viven únicamente en archivos ACL-dedicados sin cuerpos (f4 + reconciler) — estructura desplegada y verificada (T-AR-003 PASS).

---

## 6. Matriz final (101 tests)

| # | Test | Estado |
|---|---|---|
| 1 | `T-AR-001` | ❌ FAIL |
| 2 | `T-AR-002` | ❌ FAIL |
| 3 | `T-AR-003` | ✅ PASS |
| 4 | `T-AR-004` | ❌ FAIL |
| 5 | `T-AR-005` | ✅ PASS |
| 6 | `T-AR-006` | ✅ PASS |
| 7 | `T-CS-001` | ✅ PASS |
| 8 | `T-CS-002` | ✅ PASS |
| 9 | `T-CS-003` | ✅ PASS |
| 10 | `T-CS-004` | ✅ PASS |
| 11 | `T-CS-005` | ✅ PASS |
| 12 | `T-CS-006` | ✅ PASS |
| 13 | `T-CS-007` | ✅ PASS |
| 14 | `T-ER-001` | ✅ PASS |
| 15 | `T-ER-002` | ✅ PASS |
| 16 | `T-ER-003` | ✅ PASS |
| 17 | `T-ER-004` | ✅ PASS |
| 18 | `T-FIN-001` | ✅ PASS |
| 19 | `T-FIN-002` | ✅ PASS |
| 20 | `T-FIN-003` | ✅ PASS |
| 21 | `T-FIN-004` | ✅ PASS |
| 22 | `T-FIN-005` | ✅ PASS |
| 23 | `T-FIN-006` | ❌ FAIL |
| 24 | `T-FIN-007` | ✅ PASS |
| 25 | `T-FIN-008` | ✅ PASS |
| 26 | `T-FIN-009` | ❌ FAIL |
| 27 | `T-FIN-010` | ✅ PASS |
| 28 | `T-FIN-011` | ✅ PASS |
| 29 | `T-FIN-012` | ✅ PASS |
| 30 | `T-H1-001` | ✅ PASS |
| 31 | `T-H1-002` | ❌ FAIL |
| 32 | `T-H1-003` | ✅ PASS |
| 33 | `T-H1-004` | ✅ PASS |
| 34 | `T-H2-001` | ✅ PASS |
| 35 | `T-H2-002` | ✅ PASS |
| 36 | `T-H2-003` | ✅ PASS |
| 37 | `T-H2-004` | 👁️ NOT-OBSERVABLE |
| 38 | `T-H3-001` | ✅ PASS |
| 39 | `T-H3-002` | ✅ PASS |
| 40 | `T-H3-003` | ✅ PASS |
| 41 | `T-H3-004` | ⛔ BLOCKED |
| 42 | `T-H3-005` | ✅ PASS |
| 43 | `T-H3-006` | ✅ PASS |
| 44 | `T-H4-001` | ✅ PASS |
| 45 | `T-H4-002` | ✅ PASS |
| 46 | `T-H4-003` | ❌ FAIL |
| 47 | `T-H4-004` | ✅ PASS |
| 48 | `T-H4-005` | ✅ PASS |
| 49 | `T-H5-001` | ✅ PASS |
| 50 | `T-H5-002` | ✅ PASS |
| 51 | `T-H5-003` | ✅ PASS |
| 52 | `T-H5-004` | ✅ PASS |
| 53 | `T-H5-005` | ✅ PASS |
| 54 | `T-H5-006` | ✅ PASS |
| 55 | `T-H6-001` | ✅ PASS |
| 56 | `T-H6-002` | ✅ PASS |
| 57 | `T-H6-003` | ✅ PASS |
| 58 | `T-H6-004` | ✅ PASS |
| 59 | `T-H6-005` | ✅ PASS |
| 60 | `T-H6-006` | ✅ PASS |
| 61 | `T-H6-007` | ✅ PASS |
| 62 | `T-H6-008` | ✅ PASS |
| 63 | `T-H6-009` | ✅ PASS |
| 64 | `T-INV-001` | ✅ PASS |
| 65 | `T-INV-002` | ✅ PASS |
| 66 | `T-INV-003` | ✅ PASS |
| 67 | `T-INV-004` | ✅ PASS |
| 68 | `T-INV-005` | ✅ PASS |
| 69 | `T-RT-001` | ✅ PASS |
| 70 | `T-RT-002` | ✅ PASS |
| 71 | `T-RT-003` | ✅ PASS |
| 72 | `T-RT-004` | ✅ PASS |
| 73 | `T-RT-005` | ❌ FAIL |
| 74 | `T-RT-006` | ✅ PASS |
| 75 | `T-RT-007` | ✅ PASS |
| 76 | `T-SB-001` | ✅ PASS |
| 77 | `T-SB-002` | ✅ PASS |
| 78 | `T-SB-003` | ✅ PASS |
| 79 | `T-SB-004` | ✅ PASS |
| 80 | `T-SB-005` | ✅ PASS |
| 81 | `T-TC-001` | ⛔ BLOCKED |
| 82 | `T-TC-002` | ✅ PASS |
| 83 | `T-TC-003` | ✅ PASS |
| 84 | `T-TC-004` | ✅ PASS |
| 85 | `T-TC-005` | ✅ PASS |
| 86 | `T-UTT-001` | ⛔ BLOCKED |
| 87 | `T-UTT-002` | ✅ PASS |
| 88 | `T-UTT-003` | ✅ PASS |
| 89 | `T-UTT-004` | ✅ PASS |
| 90 | `T-UTT-005` | ✅ PASS |
| 91 | `T-UTT-006` | ⛔ BLOCKED |
| 92 | `T-UTT-007` | ✅ PASS |
| 93 | `T-UTT-008` | ✅ PASS |
| 94 | `T-V1-001` | ❌ FAIL |
| 95 | `T-V1-002` | ❌ FAIL |
| 96 | `T-V1-003` | ❌ FAIL |
| 97 | `T-V1-004` | ✅ PASS |
| 98 | `T-V1-005` | ❌ FAIL |
| 99 | `T-V1-006` | ❌ FAIL |
| 100 | `T-V1-007` | ❌ FAIL |
| 101 | `T-V1-008` | ✅ PASS |

---

## 7. Clasificación de los 14 FAIL + 4 BLOCKED restantes

**Gates V1 (8) — backlog PR-R1, excluidos por mandato §11 / spec §11+§17.8:**
`T-V1-001` (ACL V1 sin authenticated) · `T-V1-002`/`T-AR-001` (callers V1: useTransactions.ts) · `T-V1-003`/`T-AR-002` (flag USE_V2_CHECKOUT/fallback) · `T-V1-005` (allow-list contract-test) · `T-V1-006` (E2E security.spec) · `T-V1-007` (grants V1 históricos pre-drop).

**Limitaciones estructurales del código de test (6) — §6 de este documento:**
`T-H1-002` y `T-AR-004` (regex /=X/ vs postgres=X del estado objetivo §2.1) · `T-H4-003`, `T-FIN-006`, `T-FIN-009` (status FAIL hardcodeado) · `T-RT-005` (FAIL binario ante 200; tasa servidor 400 persistida correctamente).

**BLOCKED congelados (4) — evidencia H1 por diseño (spec §16, "convertibles a expected definitivo en el PR de QA post-implementación"):**
`T-H3-004` (probe NULL-seller; contrato §4.2 implementado: ERR_SELLER_REQUIRED verificado en runtime) · `T-TC-001` (matriz de policies §5.2 implementada y visible en pg_policies) · `T-UTT-001` (contrato WHO/WHEN de UTT §9.2 implementado) · `T-UTT-006` (estado/motivo §9.2 implementado).

**NOT-OBSERVABLE (1):** `T-H2-004` — certificación §14 (estática: auth precede idempotencia en el cuerpo LIVE, offsets 3575 < 7671; conductual: T-H1-003/T-H2-001/T-H6-006).

---

## 8. Veredicto del Implementation Agent

```text
Código:      production changes documented YES · migrations reviewed YES · RPC reviewed YES
             API routes reviewed YES · ACL reviewed YES · RLS reviewed YES
QA:          82 PASS (50 regresión intactos + 32 convertidos) · 14 FAIL (8 PR-R1 + 6 estructurales)
             0 BLOCKED-BD · 1 NOT-OBSERVABLE (aceptado por diseño)
Security:    los 9 gates §15 CERRADOS y verificados en runtime (§4)
V1:          create_sale still present YES · V1 retirement NOT performed YES
```

**Veredicto**: `READY FOR INDEPENDENT CERTIFICATION` para el alcance H1–H6 (hardening V2), CON las siguientes condiciones exactas para Agent 2 (QA) y Agent 3 (certificación):

1. **FAILED GATE (literal §15)**: "0 FAIL-IMPL" no es alcanzable en esta fase por diseño del propio mandato (V1 excluido) y por 6 limitaciones estructurales del código de test documentadas en §6.
2. **ROOT CAUSE**: (a) 8 tests miden el retiro V1 (PR-R1 — fase separada obligatoria); (b) 4 tests tienen el veredicto congelado como evidencia H1 (spec §16 los reserva al PR de QA); (c) 2 tests usan un regex que contradice el estado objetivo §2.1 del spec; (d) 2 tests son binarios ante aceptación legítima.
3. **AFFECTED TESTS**: enumerados en §7.
4. **AFFECTED FILES**: §2 (todas las modificaciones).
5. **NEXT REQUIRED ACTION**: (i) Agent 2 re-ejecuta `node scripts/qa-h1/run-all.cjs` y emite el PR de QA dotando de expected definitivo a los 6+4 tests de evidencia congelada (única vía para "0 FAIL-IMPL" sin debilitar contratos); (ii) Agent 3 certifica independientemente el contrato §2–§12 contra el cuerpo LIVE; (iii) solo entonces se autoriza `R1 — V1 RETIREMENT`.
