# POST-HARDENING-QA-REPORT — Verificación independiente post-implementación de `create_sale_v2`

> **FASE H1-QA-POST · Agent 2 — QA/Verification independiente** · 2026-10-04 · rama `fase/create-sale-v2-hardening` @ `3c85f0e`
> Contrato evaluado: `audit-evidence/FASE-H0-R/CREATE-SALE-V2-HARDENING-SPEC-RECOVERED.md` (H0-R-FINAL · D-EXR-01/D-EXR-02/D-TAX-01 APPROVED) + decisiones `CREATE-SALE-V2-CONTRACT-DECISIONS.md` (D-01…D-38) + matriz/baseline H1.
> **Modo**: verificación, NO reparación. Cero modificaciones a producción, RPC, SQL, RLS, ACL, API, frontend, tests, fixtures del repo. Cero commits de producción. Sondas propias con actores reales + fixtures QA. Scripts de sonda preservados fuera del repo (`/home/z/my-project/scripts/qa-post/`), evidencia runtime archivada en `runtime/`.

---

## 1. Resumen ejecutivo

```text
CORRIDA INDEPENDIENTE (aislada: cleanup + fixtures + run-all, protocolo idéntico al
Implementation Agent, 2026-10-04T15:0xZ):

  101 tests · 82 PASS · 14 FAIL · 4 BLOCKED · 1 NOT-OBSERVABLE
  → REPRODUCE EXACTAMENTE el resultado reportado (82/14/4/1). Sin divergencia.

GATES DE SEGURIDAD (verificación runtime independiente, 9/9 superficies de ATAQUE):
  cerrados — incl. anon-PUBLIC ACL, oráculo de idempotencia A/B/C/D, seller spoofing
  (RPC + checkout + sync directo/anidado), tax manipulation (7 sondas), tasa
  server-authoritative (D-EXR-01/02), concurrencia (misma clave + última unidad),
  multi-tenant con actores reales, anti-resurrección (census semántico 449 archivos),
  auditoría CREATE_SALE_V2 completa.

DEFECTO REAL ENCONTRADO (fuera de la suite de 101 — la suite no lo cubre):
  DEFECT-1 · update_transaction_taxes · HTTP 403 "permission denied for schema auth"
  (42501) para TODOS los callers, incluido el camino AUTORIZADO del contrato §9.2.
  Fail-closed (sin superficie de ataque), pero: flujo de producto muerto, contrato
  §9.2 inejecutable, auditoría UTT imposible, REGRESIÓN funcional vs pre-hardening
  (la UTT /4 anterior ejecutaba con éxito). Root cause exacto identificado (una línea).

REGRESIÓN UNITARIA: 377/377 PASS (23 archivos vitest: api + integration + unit,
incl. pos-checkout price-integrity 20, idempotencia 9, concurrency 5, rem-inv-2 4+2).

VEREDICTO:  BLOCKED — IMPLEMENTATION DEFECTS REMAIN
             (razón única y exacta: DEFECT-1; fix de una línea + re-verificación)
```

Las afirmaciones del Implementation Agent fueron verificadas una a una: el baseline 82/14/4/1 es **reproducible y exacto**; los 8 FAIL de V1 son **correctamente** deuda R1; los otros 6 FAIL son **demostrablemente** defectos/verdicts congelados de los tests (cada uno con evidencia runtime propia); los 9 gates de ataque están **cerrados**. La afirmación "no existen fallos funcionales restantes de V2" es **FALSA en un punto**: el camino autorizado de `update_transaction_taxes` está roto (DEFECT-1) — invisible para la suite porque sus 6 tests runtime de UTT son todos de denegación y pasan de forma vacua.

---

## 2. Alcance y método

1. **GATE 0 — Reconocimiento**: branch `fase/create-sale-v2-hardening`, HEAD `3c85f0e`, working tree limpio, `git diff --check` OK. Commits de implementación presentes: `e0f9c6f` (h1: RPC /24 + ACL + anti-resurrección), `eb8cb8b` (h3: tax authority + UTT), `5177d2f` (h4: rates), `4c18169` (h6: rutas), `3c85f0e` (evidencia). Leídos completos: spec H0-R-FINAL (729 líneas), registro de decisiones (D-01…D-38), matriz H1 (101), baseline H1, IMPLEMENTATION-EVIDENCE.md, live-post-hardening.txt, harness `scripts/qa-h1/` (lib + 00-fixtures + run-all + 6 suites clave leídas en detalle).
2. **Entorno**: pm2 `costpro` reiniciado sobre el working tree == HEAD (modo dev con hot-reload; servidor sirve el código del PR). HTTP :3000 = 200. Supabase reachable (Management API OK, PostgREST OK). Fixtures recreados con el protocolo aislado (cleanup + ensure — con la fricción conocida PT007/FK idéntica para ambas corridas).
3. **Suite completa**: `node scripts/qa-h1/run-all.cjs` — 16 suites ejecutadas de inicio a fin, 101 tests persistidos en `results/*.json`. El consolidador falló en su paso final (defecto de metadata documentado en §6); los totales se computaron desde los artefactos individuales.
4. **Sondas runtime independientes** (script `gates-runtime.cjs` preservado): los 9 gates del mandato con actores reales (USER_A/clerk@A, USER_B/clerk@B, SUPER_A/manager@A, ENC_B/encargado-global/clerk@B) — sin usar admin para demostrar aislamiento, sin service-role para simular usuario, inspección post-hoc de datos persistidos.
5. **Censo semántico anti-resurrección** (`gate8-anti-resurrection.cjs` preservado): 449 migraciones escaneadas con regex semántico que distingue `GRANT … ON FUNCTION create_sale(_v2) … TO PUBLIC/anon` de `INSERT INTO public.*` (falso positivo del test T-AR-003 demostrado).
6. **Regresión unitaria**: vitest (api/integration/unit — 23 archivos relacionados con venta/checkout/idempotencia/inventario).

---

## 3. Reconstrucción del baseline (mandato §3)

```text
Reportado por Implementation Agent:  101 · 82 PASS · 14 FAIL · 4 BLOCKED · 1 NOT-OBSERVABLE
Corrida independiente (esta QA):     101 · 82 PASS · 14 FAIL · 4 BLOCKED · 1 NOT-OBSERVABLE
DIVERGENCIA: NINGUNA — reproducción exacta, suite por suite.
```

| Suite | PASS | FAIL | BLOCKED | NO | FAIL/BLOCKED de la suite |
|---|---|---|---|---|---|
| 10-h1-acl | 3 | 1 | 0 | 0 | T-H1-002 (B) |
| 11-h2-order | 3 | 0 | 0 | 1 | T-H2-004 (F, by design) |
| 12-h3-seller | 5 | 0 | 1 | 0 | T-H3-004 (C/F congelado) |
| 13-h4-tax | 4 | 1 | 0 | 0 | T-H4-003 (C congelado) |
| 14-h5-rate | 6 | 0 | 0 | 0 | — |
| 15-h6-idempotency | 9 | 0 | 0 | 0 | — |
| 16-financial | 10 | 2 | 0 | 0 | T-FIN-006, T-FIN-009 (C congelados) |
| 17-cross-store | 7 | 0 | 0 | 0 | — |
| 18-inventory | 5 | 0 | 0 | 0 | — |
| 20-collateral-taxcfg | 4 | 0 | 1 | 0 | T-TC-001 (C/F congelado) |
| 21-collateral-utt | 6 | 0 | 2 | 0 | T-UTT-001, T-UTT-006 (C/F congelados) |
| 22-collateral-rates | 4 | 0 | 0 | 0 | — |
| 30-route-checkout | 6 | 1 | 0 | 0 | T-RT-005 (C — binario) |
| 31-route-sync | 5 | 0 | 0 | 0 | — |
| 40-v1-retirement | 2 | 6 | 0 | 0 | T-V1-001/002/003/005/006/007 (D) |
| 41-anti-resurrection | 3 | 3 | 0 | 0 | T-AR-001/002 (D), T-AR-004 (B) |

Detalle completo test a test: `POST-HARDENING-TEST-MATRIX.md` + `POST-HARDENING-RESULTS.json`. Los 50 PASS de regresión del baseline H0-R están **intactos** (contrato de regresión sin rupturas) y los 32 FAIL→PASS reportados por el Implementation Agent **se confirman** (corrida independiente).

---

## 4. Verificación de los 9 gates (mandato §4–§12)

Documento dedicado con evidencia por sonda: **`SECURITY-GATE-VERIFICATION.md`** (resumen en su cabecera). Puntos que el mandato exigía "no confiar" y cómo se resolvieron:

| Afirmación del Implementation Agent | Verificación independiente | Resultado |
|---|---|---|
| "anon cannot execute" | `has_function_privilege('anon', oid, 'EXECUTE') = false` (semántico) + conducta anon (401 uniforme, body byte-idéntico existente vs aleatoria) + proacl sin token PUBLIC desnudo | **CIERTA** |
| "idempotency leak closed" | Casos A (anon+key → 401 sin tx), B (retry → misma tx, 0 duplicados), C (key+payload distinto → `ERR_IDEMPOTENCY_KEY_REUSE` sin tx, sin 500), D (actor distinto miembro → KEY_REUSE; no-miembro → `ERR_UNAUTHORIZED` — auth precede) | **CIERTA** |
| "seller spoofing closed (RPC + rutas, incl. anidados)" | RPC `ERR_SELLER_MISMATCH`/`ERR_SELLER_REQUIRED` con delta_tx=0; checkout body seller=B → persiste seller=sesión; sync spoof directo, anidado (payload.payload/response_data/data.nested) y p_user_id → siempre seller=sesión | **CIERTA** |
| "tax manipulation closed" | 7 sondas: negativos/duplicado/desconocido/cross-store → `ERR_APPLIED_TAX_INVALID`; válido → snapshot de catálogo + recálculo (mirror 999 ignorado); bypass supervisor estructuralmente imposible; **PERO** ver DEFECT-1 para UTT | **CIERTA en create_sale_v2** · UTT: superficie de ataque cerrada (fail-closed) con defecto de camino legítimo |
| "client exchange-rate authority gone" | 1.000.000/0/−5 → persiste 400 (server) en el 100% de sondas; `price_at_sale_cup` = precio×400; auditoría client/server/source; stale 60d → `ERR_RATE_STALE` (ambas sondas); sin fuente → `ERR_EXCHANGE_RATE_UNAVAILABLE`; fresca → 200 | **CIERTA** (ver nota sobre expectativa del prompt vs contrato D-EXR-02 en SECURITY-GATE-VERIFICATION.md §GATE 5) |
| "concurrency protected" | 6 concurrentes misma clave → exactamente 1 tx/1 item/1 movimiento; última unidad: 1 éxito/5 rechazos/stock 0.0000 | **CIERTA** |
| "multi-tenant probado con actores reales" | 8 sondas USER_A↔STORE_B sin admin: venta/lookup/UTT/clave ajena/PATCH tasa cross-store → todos denegados; venta legítima B OK | **CIERTA** |
| "6 migraciones ofensoras corregidas (anti-resurrección)" | Census semántico 449 archivos: **0 grants peligrosos**; 5/8 archivos que crean V2 neutralizados con REVOKE en el propio archivo; 3 restantes son `CREATE OR REPLACE` (no resetea ACL); reconciler final = último de la cadena; contract-surface sin entrada PUBLIC; LIVE == PR por huella de objetos | **CIERTA** |
| "9/9 gates cerrados" | 9/9 **superficies de ataque** cerradas — PERO el gate 4 incluye el contrato §9.2 de UTT (camino autorizado), que NO se cumple (DEFECT-1) | **CIERTA en ataque · INCOMPLETA en §9.2** |

---

## 5. DEFECT-1 — el defecto real (mandato §13: "la parte más importante")

**Ninguno de los 14 FAIL de la suite es un bug de producción** (clasificación en `FAIL-CLASSIFICATION.md`: 2B + 4C + 8D). PERO la auditoría runtime independiente encontró **un defecto de producción real que la suite no cubre**:

```text
TEST:            Camino AUTORIZADO de update_transaction_taxes (contrato §9.2):
                 SUPER_A (manager@A, membership activa) + tx pending/completed de
                 STORE_A + tax válido del catálogo + motivo válido.
EVIDENCIA:       HTTP 403 {"code":"42501","message":"permission denied for schema auth"}
                 — idéntico para clerk, manager autorizado, encargado global, usuario
                 cross-store y service_role. Evidencia: runtime/gates-runtime.json
                 (gate4_tax.utt_authorized / utt_no_reason / utt_voided /
                 adjust_total_amount_preexisting / owner_schema_auth_usage).
ROOT CAUSE:      El role `costpro_transaction_adjuster` (owner SECURITY DEFINER de la
                 UTT endurecida) NO tiene USAGE sobre el schema `auth`
                 (has_schema_privilege = false, verificado). El cuerpo declara
                 `v_actor uuid := auth.uid();` → al ejecutar como owner, la resolución
                 de auth.uid() exige USAGE sobre schema auth → 42501 en la primera
                 sentencia para CUALQUIER caller. Ninguna migración del repo otorga
                 `GRANT USAGE ON SCHEMA auth TO costpro_transaction_adjuster`
                 (census 449 archivos: 0 resultados). La migración 20261004130003
                 gestionó un GRANT transitorio de CREATE on schema public para el
                 ALTER OWNER, pero omitió el USAGE sobre auth.
IMPACT:          (1) Regresión funcional: el flujo "Ajuste de Impuestos"
                 (TransactionDetailsModal, reescrito al contrato /3 en el commit h3)
                 está MUERTO — ningún rol puede completarlo. (2) El contrato §9.2
                 (WHO/WHEN/HOW/AUDIT) es inejecutable: motivo/estado/invariante/
                 auditoría son inalcanzables; las denegaciones observables son 42501
                 en lugar de los errores de contrato. (3) GATE 9 parcial: la
                 auditoría UPDATE_TRANSACTION_TAXES (old/new/reason) no puede existir
                 jamás. (4) Los PASS de T-UTT-002/003/005/007/008 son VACUOS: pasan
                 porque la función falla (fail-closed de facto), no porque el check
                 correcto deniegue. (5) Contexto: `adjust_total_amount` —el patrón
                 "ratificado" que el spec mandó replicar— sufre el MISMO defecto desde
                 ANTES de este hardening (PRE-EXISTENTE, superficie sin cambio por
                 mandato §10; fuera del alcance de este PR). El defecto de UTT sí fue
                 INTRODUCIDO por la migración del hardening: la UTT /4 pre-hardening
                 EJECUTABA con éxito (evidencia H1 T-UTT-003: "ACEPTADA tax_amount=777").
RECOMMENDATION:  NO corregido durante esta auditoría (regla §1/§20). Implementation
                 Fix PR posterior con UNA migración:
                   GRANT USAGE ON SCHEMA auth TO costpro_transaction_adjuster;
                 (+ verificación/evidencia de EXECUTE sobre auth.uid() para el role;
                 evaluar el mismo grant para adjust_total_amount como ítem separado
                 por ser pre-existente). Post-fix: re-ejecutar
                 scripts/qa-post/gates-runtime.cjs (preservado) + suites 21/22/13/16.
                 El camino autorizado debe producir: 200/true · recálculo server
                 (tax=10 · total=subtotal−desc+tax) · invariante PT002 · fila
                 audit_logs UPDATE_TRANSACTION_TAXES con old/new/reason/actor/store;
                 y las denegaciones deben reportar los errores de contrato (ya no 42501).
```

**Dimensiones del defecto**: severidad funcional ALTA (flujo de producto muerto), severidad de seguridad BAJA (fail-closed; ninguna superficie de ataque abierta — de hecho la mutación fiscal post-venta es imposible para cualquiera). Es exactamente el caso que el mandato §24 anticipa: un FAIL no es lo mismo que un sistema inseguro — y un PASS de denegación no es lo mismo que un sistema correcto.

---

## 6. Defecto del consolidador (documentado por separado — mandato §3)

`run-all.cjs:67` lanza `TypeError: Cannot read properties of undefined (reading 'pass')` cuando en `results/` existe un `_consolidated.json` de una corrida previa (el loop de consolidación relee TODOS los `*.json` del directorio, incluido su propio output, que no tiene campo `counts`). Las 16 suites y los 101 tests se ejecutan y persisten correctamente ANTES del crash. **No se modificó el test**; los totales se computaron desde los 16 artefactos individuales (script de cómputo embebido en `POST-HARDENING-RESULTS.json → consolidator_issue`). La corrida del Implementation Agent no sufrió este defecto por partir de `results/` limpio; el riesgo existe para cualquier re-ejecución sobre artefactos previos. Corrección futura (excluir `_consolidated.json` del loop) corresponde al PR de QA con expecteds definitivos.

---

## 7. Regresión funcional (mandato §19)

| Flujo | Evidencia | Resultado |
|---|---|---|
| Venta normal (RPC, actor miembro) | Sondas G1/G2/G4/G5/G6 — decenas de ventas 200 con persistencia íntegra (tx+items+pagos+movimientos+WAC) | ✅ INTACTO |
| Venta por ruta checkout | GATE 3 sonda checkout (200, seller=sesión) + T-RT-002 PASS + vitest pos-checkout-price-integrity 20/20 | ✅ INTACTO |
| Venta offline + sync | GATE 3 sondas sync directo/anidado (200, seller=sesión) + suite 31-route-sync 5/5 PASS | ✅ INTACTO |
| Inventario (atomicidad, oversell, rollback, quantity ≥ 0) | Suite 18-inventory 5/5 PASS + sonda última unidad (1/5/stock 0) + vitest concurrency 5/5 + rem-inv-2 4+2 | ✅ INTACTO |
| Concurrencia última unidad | GATE 6: 1 éxito, 5 `ERR_INSUFFICIENT_STOCK`, stock 0.0000 | ✅ INTACTO |
| Pagos (split, invariantes PT011) | T-FIN-011/012 PASS + pagos contados=1 en retries | ✅ INTACTO |
| Impuestos (venta con catálogo) | GATE 4: tax válido → recálculo server + snapshot + invariante total | ✅ INTACTO |
| **UI de actualización fiscal (UTT)** | **DEFECT-1: camino autorizado muerto (42501)** | ❌ **REGRESIÓN** |
| Checkout idempotente | GATE 2/B + GATE 6: misma tx, 0 duplicados | ✅ INTACTO |
| Unitario global | vitest: 377/377 PASS (23 archivos) | ✅ INTACTO |

**Distingue hardening success vs functional regression**: el hardening V2 (create_sale_v2 + rutas + tasas + impuestos de venta) es un éxito verificable; la regresión se circunscribe a la superficie endurecida `update_transaction_taxes` (camino autorizado) — introducida por la migración 20261004130003 al replicar el patrón owner-adjuster sin el grant de USAGE sobre auth.

---

## 8. Verificaciones adicionales del mandato

- **§16 (tests hard-coded)**: verificados en código — T-H4-003 (`13-h4-tax.cjs:97`), T-FIN-006 (`16-financial.cjs:119`), T-FIN-009 (`16-financial.cjs:163`) retornan `status:'FAIL'` literal; T-RT-005 (`30-route-checkout.cjs:102-110`) es binario ante 200. Son **evidencia histórica congelada** de la fase H1 (TEST-FIRST): documentan el veredicto pre-hardening y el contrato cuyo expected definitivo reserva el spec §16 al PR de QA. NO se modificaron.
- **§17 (T-RT-005)**: resuelto — el test espera el comportamiento antiguo (cualquier 200 = tasa cliente persistida). El sistema persiste la tasa **servidor** (400) y acepta la venta conforme a D-EXR-02 (la desviación jamás bloquea). El propio campo `current` del test ("rate persistida=400.0000") contiene la prueba de que el contrato se cumple. Clasificación C.
- **§18 (NOT-OBSERVABLE)**: `T-H2-004` se mantiene NOT-OBSERVABLE BY DESIGN (§14) — sin evidencia objetiva de observabilidad alternativa sin modificar producción. Certificación complementaria realizada: estática (auth@3509 < idem@4467) + conductual (T-H1-003/004, T-H2-001, T-H6-006 + sonda propia: `ERR_SELLER_MISMATCH` se dispara antes de idempotencia). Sin PASS artificial.
- **§23.9 (LIVE == PR)**: verificado por huella de objetos (cuerpo del RPC con todos los marcadores contractuales, firma/owner/ACL de UTT, policies de tax_configurations/store_exchange_rates, constraints CHECK>0, ACL canónico V2) — dado que el ledger `schema_migrations` está detenido en 20260615 (patrón pre-existente de despliegue vía Management API, documentado como observación de higiene no bloqueante).

---

## 9. Matriz final (mandato §22)

```text
TOTAL TESTS: 101

PASS:                  82
REAL PROD FAIL:         0   (entre los 101 de la suite)
TEST BUG:               2   (T-H1-002, T-AR-004)
OBSOLETE:               4   (T-H4-003, T-FIN-006, T-FIN-009, T-RT-005)
V1 DEFERRED:            8   (T-V1-001/002/003/005/006/007, T-AR-001/002)
ENV/FIXTURE:            0
NOT OBSERVABLE:         1   (T-H2-004)
BLOCKED:                4   (T-H3-004, T-TC-001, T-UTT-001, T-UTT-006 — evidencia H1 congelada)

+ 1 REAL PRODUCTION BUG fuera de la suite (DEFECT-1 · UTT 42501) — hallazgo de
  esta auditoría runtime; fail-closed, sin superficie de ataque, con regresión
  funcional del camino autorizado §9.2 y auditoría UTT imposible.
```

No se forzó `101 PASS`: la evidencia demuestra 82 legítimos y una composición exacta del resto.

---

## 10. Criterios de certificación (mandato §23)

| # | Criterio | Estado |
|---|---|---|
| 1 | 9 gates realmente cerrados | ⚠️ 9/9 **de ataque** cerrados; el gate 4 incluye el contrato §9.2 de UTT (camino autorizado) → **INCOMPLETO por DEFECT-1** |
| 2 | Sin FAIL de producción crítico oculto entre los 14 | ✅ entre los 14: ninguno — PERO existe un defecto real FUERA de la suite (DEFECT-1), descubierto por esta auditoría |
| 3 | FAIL de V1 correctamente separados y documentados | ✅ 8/8 confirmados individualmente (FAIL-CLASSIFICATION.md §1) |
| 4 | "Test bugs" demostrados como tales | ✅ 6/6 demostrados con evidencia runtime propia (regex /=X/ vs postgres=X; verdicts congelados; T-RT-005 binario) |
| 5 | Sin regresiones funcionales relevantes | ❌ **UTT camino autorizado muerto (42501)** — regresión funcional relevante introducida por la migración del hardening |
| 6 | ACL/RLS/anti-resurrección verificados | ✅ (GATE 1, GATE 7, GATE 8 — runtime + census semántico) |
| 7 | Autoridad financiera server-side confirmada | ✅ (tasas 4/4 sondas server-rate; impuestos catálogo+recálculo; subtotal/total/WAC/pagos; seller=actor) |
| 8 | Multi-tenant con actores reales | ✅ (GATE 7 — 8/8, sin admin) |
| 9 | LIVE coincide con código/migraciones del PR | ✅ (huella de objetos; observación pre-existente del ledger documentada) |

**Criterio 5 falla → NO se puede recomendar certificación.**

---

## 11. VEREDICTO FINAL

# `BLOCKED — IMPLEMENTATION DEFECTS REMAIN`

```text
FAILED GATE:      Contrato §9.2 de update_transaction_taxes (camino AUTORIZADO) —
                  criterio de certificación nº 5 (regresión funcional relevante) y
                  nº 1 (gate 4 completo). Las 9 superficies de ATAQUE están cerradas;
                  el defecto es fail-closed, no una exposición.

ROOT CAUSE:       El role `costpro_transaction_adjuster` (owner SECURITY DEFINER de
                  la UTT endurecida, migración 20261004130003) carece de USAGE sobre
                  el schema `auth`; `v_actor uuid := auth.uid()` en la cláusula
                  DECLARE falla con 42501 para CUALQUIER caller. Defecto hermano
                  PRE-EXISTENTE documentado en adjust_total_amount (fuera de alcance).

AFFECTED TESTS:   Ninguno de los 101 falla por esto (T-UTT-002/003/005/007/008 PASAN
                  de forma VACUA — denegación por 42501, no por el check de contrato;
                  T-UTT-001/006 BLOCKED-congelados no pueden confirmarse en runtime).
                  La cobertura del camino autorizado NO existe en la suite.

AFFECTED FILES:   supabase/migrations/20261004130003_h0r_update_transaction_taxes.sql
                  (falta el grant);
                  src/components/views/terminal/views/sales/TransactionDetailsModal.tsx
                  (UI que invoca una función que no puede ejecutarse con éxito).

NEXT REQUIRED ACTION: Implementation Fix PR (migración única):
                  GRANT USAGE ON SCHEMA auth TO costpro_transaction_adjuster;
                  + re-ejecutar scripts/qa-post/gates-runtime.cjs (preservado) y las
                  suites 21/22; verificar: camino autorizado 200/true + recálculo +
                  invariante PT002 + auditoría UPDATE_TRANSACTION_TAXES (old/new/
                  reason/actor/store) + denegaciones con los errores de contrato
                  (ERR_UNAUTHORIZED / ERR_REASON_REQUIRED / ERR_TRANSACTION_STATE).
                  Con el fix verificado, el resto de las condiciones de certificación
                  ya está cumplido y demostrado por esta auditoría.
```

**Todo lo demás verificado y conforme**: baseline reproducido al 100%, 50 PASS de regresión intactos, 32 conversiones confirmadas, V1 correctamente diferido, 6 "test bugs" demostrados, autoridad financiera server-side, multi-tenant, anti-resurrección, concurrencia, auditoría de venta y regresión unitaria 377/377. El fix de DEFECT-1 es el único paso pendiente para habilitar `READY FOR AGENT 3 CERTIFICATION`.

---

## 12. Artefactos de esta fase

```text
audit-evidence/FASE-H1-QA-POST/
├── POST-HARDENING-QA-REPORT.md          (este documento)
├── POST-HARDENING-TEST-MATRIX.md        (101 tests · status · clasificación · current)
├── POST-HARDENING-RESULTS.json          (corrida completa: totales, 16 suites, 101
│                                          resultados, defecto del consolidador)
├── SECURITY-GATE-VERIFICATION.md        (9 gates — evidencia runtime por sonda)
├── FAIL-CLASSIFICATION.md               (14 FAIL + 4 BLOCKED + 1 NOT-OBSERVABLE)
├── results/                             (16 JSON individuales de MI corrida)
└── runtime/
    ├── gates-runtime.json               (evidencia completa de las sondas de gates)
    ├── gates-runtime-verdicts.json      (veredicto booleano por gate)
    ├── gate8-census.json                (census semántico anti-resurrección, 449 archivos)
    └── run-all-console.log              (salida de consola de la corrida completa)
```

Los resultados de la corrida del Implementation Agent (`audit-evidence/FASE-H1/results/`) fueron restaurados a su estado committed — la evidencia de esta QA vive exclusivamente en `FASE-H1-QA-POST/`. Los scripts de sonda quedan preservados fuera del repo para la re-verificación post-fix (`/home/z/my-project/scripts/qa-post/`: `gates-runtime.cjs`, `gate8-anti-resurrection.cjs`, `gen-matrix.cjs`).
