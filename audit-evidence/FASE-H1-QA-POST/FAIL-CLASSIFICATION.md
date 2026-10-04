# FAIL-CLASSIFICATION — Clasificación de los 14 FAIL · 4 BLOCKED · 1 NOT-OBSERVABLE

> **FASE H1-QA-POST · Agent 2 (QA independiente)** · 2026-10-04 · corrida aislada propia (cleanup + fixtures + run-all) sobre `fase/create-sale-v2-hardening` @ `3c85f0e`.
> Categorías del mandato §13: **A** REAL PRODUCTION BUG · **B** TEST BUG · **C** TEST OBSOLETE / CONTRACT CHANGED · **D** V1 DEBT — CORRECTLY DEFERRED TO R1 · **E** ENVIRONMENT / FIXTURE ISSUE · **F** EVIDENCE / OBSERVABILITY LIMITATION · **G** OTHER.
> Resultado de la corrida independiente: `101 · 82 PASS · 14 FAIL · 4 BLOCKED · 1 NOT-OBSERVABLE` — **idéntico** al reportado por el Implementation Agent (reproducibilidad confirmada; totales calculados desde los 16 artefactos individuales por el defecto documentado del consolidador).

---

## Resumen de clasificación

```text
TOTAL TESTS: 101

PASS:                     82   (50 regresión intactos + 32 convertidos por el hardening)
REAL PROD FAIL (A):        0   (entre los 101 de la suite — ver nota sobre DEFECT-1*)
TEST BUG (B):              2   (T-H1-002, T-AR-004 — regex /=X/)
OBSOLETE/FROZEN (C):       4   (T-H4-003, T-FIN-006, T-FIN-009, T-RT-005)
V1 DEFERRED (D):           8   (T-V1-001/002/003/005/006/007, T-AR-001/002)
ENV/FIXTURE (E):           0
NOT OBSERVABLE (F):        1   (T-H2-004 — BY DESIGN §14)
BLOCKED — evidencia H1 congelada (C/F): 4  (T-H3-004, T-TC-001, T-UTT-001, T-UTT-006)

82 + 2 + 4 + 8 + 1 + 4 = 101 ✓
```

\* **DEFECT-1** (UTT 42501 — camino autorizado imposible) NO está entre los 101 tests de la suite: la suite no contiene ningún test de ÉXITO del camino autorizado de `update_transaction_taxes` (T-UTT-002/003/005/007/008 son todos tests de denegación; T-UTT-001/006 están congelados como evidencia H1). El defecto fue descubierto por la sonda runtime independiente de este QA (mandato §4 GATE 4 / §19) y está documentado en `SECURITY-GATE-VERIFICATION.md` §4.9 y `POST-HARDENING-QA-REPORT.md` §5. Es, por tanto, un **REAL PRODUCTION BUG oculto fuera de la suite** — la razón principal del veredicto BLOCKED.

---

## 1. Los 8 FAIL de V1 (categoría D — correctamente diferidos a R1)

Mandato §14: confirmar individualmente que pertenecen a R1 y que el comportamiento es esperado mientras V1 siga vivo. **Confirmado en los 8**: V1 (`create_sale`) sigue PRESENTE y ejecutable por mandato (spec §11: "El DROP de V1 no es parte del hardening H1–H6: PR-R1 es un PR separado posterior"). Ninguno afecta la certificación de V2 porque todos miden exclusivamente la existencia del camino V1, que el contrato exige mantener vivo hasta R1.

| TEST | CURRENT (corrida QA) | ¿Pertenece a R1? | ¿Por qué no afecta certificación V2? |
|---|---|---|---|
| `T-V1-001` | ACL LIVE V1 = `{postgres, authenticated, service_role}` | SÍ — gate R1 "ACL V1 sin authenticated" | El proacl de V1 es irrelevante para V2; el hardening no debía tocarlo (§11) y no lo tocó. Mientras V1 viva, su ACL es el histórico. |
| `T-V1-002` | callers=1: `src/hooks/api/useTransactions.ts` | SÍ — gate R1 "callers V1 = 0" | El caller V1 es el path online del hook V1 — exactamente lo que R1 elimina. V2 (`usePOSCheckout`/`useSalesCatalog`/rutas) no usa ese camino. |
| `T-V1-003` | refs: `features.ts` (flag) · `usePOSCheckout.ts` (path v1) | SÍ — gate R1 "fallback V1 = 0" | `USE_V2_CHECKOUT`/pilot/else-branch son el mecanismo de retirada progresiva cuyo retiro ES R1. Mientras tanto V2 es el camino activo (flag = true en LIVE). |
| `T-V1-005` | allow-list con useTransactions=true · exige presencia V1=true | SÍ — gate R1 "allow-list vacía" | El contract-test v2-only documenta la transición; su estado actual es la pre-condición documentada de R1. |
| `T-V1-006` | specs con dependencia V1/flag=1: `security.spec.ts` | SÍ — gate R1 "E2E usa V2" | Dependencia de test E2E del mecanismo de flag — se retira junto al flag en R1. |
| `T-V1-007` | migraciones con GRANT V1=15 (históricas) | SÍ — gate R1 "grants V1 post-drop=0" | Las 15 migraciones son **historia inmutable pre-drop** (spec §11/§12.1: "las 15 históricas permanecen como historia inmutable"); el gate R1 se evalúa POST-drop. Replay completo: la cadena termina con el reconciler canónico V2; V1 no resucita V2. |
| `T-AR-001` | `useTransactions.ts` (1 línea) | SÍ (idem T-V1-002) | idem |
| `T-AR-002` | refs `features.ts`, `.env.example` · pilot-mechanism=true | SÍ (idem T-V1-003) | idem |

**Estado correcto de cada uno: `FAIL — DEFERRED TO R1`** (no se convirtieron artificialmente a PASS — ninguno fue tocado).

---

## 2. Los 6 FAIL atribuidos a "limitaciones de los tests" (categorías B/C — verificación estricta)

Mandato §15: demostrar por qué cada uno es defecto del test y NO del sistema. Para cada uno se aporta evidencia runtime propia (no la del Implementation Agent).

### 2.1 `T-H1-002` y `T-AR-004` — categoría **B (TEST BUG: regex imposible de satisfacer)**

- **Código verificado** (`10-h1-acl.cjs:60` / `41-anti-resurrection.cjs:104`): `const hasPublic = /=X/.test(acl)`.
- **Por qué es falso positivo DEMOSTRADO**: el substring `=X` aparece en `postgres=X/postgres` — que es parte del **estado objetivo del propio spec §2.1**: `{postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}`. El regex contradice al spec que la test afirma defender: con el proacl EXACTO objetivo, reporta FAIL.
- **Evidencia runtime de que la condición de fondo está cerrada** (propia):
  1. `has_function_privilege('anon', <oid V2>, 'EXECUTE') = false` — autoridad semántica del catálogo (SECURITY-GATE-VERIFICATION.md §1.1).
  2. Análisis semántico del proacl: token `=X` desnudo (entrada PUBLIC real: inicio/`{`/`,` + `=X`) → **ausente**; la única aparición de `=X` va precedida por el grantee `postgres`.
  3. Conductual: anon → 401 `42501 permission denied for function` con body byte-idéntico para clave existente y aleatoria (T-H1-003/004 PASS en la misma corrida).
- **La detección de una condición realmente insegura**: una entrada PUBLIC genuina (`{=X/postgres,...}`) SÍ sería detectada por el regex — pero también lo sería el estado objetivo. El test no distingue. Corrección mínima documentada (NO aplicada — tests congelados): `/(^|\{|\,)\s*=X\//`.

### 2.2 `T-H4-003` — categoría **C (verdict congelado como evidencia H1)**

- **Código verificado** (`13-h4-tax.cjs:97`): `return { status: 'FAIL', ... }` — literal incondicional al final del test (el veredicto pre-hardening quedó congelado).
- **Evidencia actual capturada por el propio test**: `0%→HTTP 200 tax=0 · 100%→HTTP 400 tax=? · 10000%→HTTP 400 tax=?` — es decir, el impuesto 100% y 10000% del cliente ahora son **RECHAZADOS** (pre-hardening: HTTP 200 tax=100/10000 persistidos del JSONB cliente). El 0% legítimo (ausencia de impuestos) se acepta con tax=0 — exactamente §5.3.
- **Evidencia runtime propia complementaria** (GATE 4): tax válido del catálogo → recálculo server (tax=10, mirror 999 ignorado, snapshot de catálogo persistido); entradas cliente sin id/valor arbitrario → `ERR_APPLIED_TAX_INVALID`. El contrato §5.4 está operativa y verificado; el FAIL es el verdict congelado, no el sistema.

### 2.3 `T-FIN-006` — categoría **C (verdict congelado)**

- **Código verificado** (`16-financial.cjs:119`): `status: 'FAIL'` literal si la venta tiene éxito (pre-hardening: la venta con JSONB cliente `{fixed,10}` se aceptaba y persistía tax=10 del cliente).
- **Evidencia actual capturada por el propio test**: `HTTP 400 ERR_APPLIED_TAX_INVALID: entrada sin id de configuración` — la venta con impuesto cliente no-catalogado ahora es **RECHAZADA** (la entrada sin id no supera el pipeline §5.4). El contrato (impuesto derivado de fuente autorizada) está reforzado más allá de lo que el test congelado sabía expresar.

### 2.4 `T-FIN-009` — categoría **C (verdict congelado)**

- **Código verificado** (`16-financial.cjs:163`): `status: 'FAIL'` literal si la venta tiene éxito.
- **Evidencia actual capturada por el propio test**: `rate persistida=400.0000 · price_at_sale_cup=40000.00` — con cliente enviando 1.000.000. **La tasa persistida ES la del servidor (400)** y `price_at_sale_cup` = precio×400. El propio campo `current` del test demuestra que el contrato §6 se cumple; el verdict está congelado en el estado pre-hardening (cuando se persistía 1.000.000).
- **Evidencia runtime propia** (GATE 5): 4 sondas (1M/0/−5/400) → 400 persistida en el 100% de los casos + auditoría client/server rate.

### 2.5 `T-RT-005` — categoría **C (test diseñado para el comportamiento antiguo — binario ante 200)**

- **Código verificado** (`30-route-checkout.cjs:102-110`): `if (r.status === 200) return { status: 'FAIL', ... }` — cualquier HTTP 200 es FAIL; solo implementó la rama pre-hardening ("la ruta reenvía tasa cliente→RPC").
- **Evidencia actual capturada por el propio test**: `ACEPTADA: rate persistida=400.0000` — la venta fue aceptada (CORRECTO por D-EXR-02: la desviación JAMÁS bloquea) y la tasa persistida es la del **servidor** (400), no la del cliente (1.000.000). El contrato §6.2 exige exactamente este comportamiento: HTTP 200 + `server_rate` persistida + auditoría de la divergencia (verificada: `client_rate=1000000, server_rate=400, rate_source=store`).
- **Tratamiento especial del mandato §17 resuelto**: el test NO está detectando una condición insegura — está esperando el comportamiento antiguo (rechazo o persistencia de la tasa cliente). El sistema cumple el contrato H0-R-FINAL; el test requiere la rama "aceptada-con-tasa-servidor" (expected definitivo — trabajo del PR de QA post-implementación según spec §16, NO de esta auditoría read-only).

---

## 3. Los 4 BLOCKED (categoría C/F — evidencia H1 congelada por diseño del spec §16)

El spec §16 los declaró anticipadamente: "4 BLOCKED runtime congelados como evidencia H1 (`T-H3-004`/`T-TC-001`/`T-UTT-001`/`T-UTT-006` — contrato §18 = FAIL — IMPLEMENTATION; convertibles a expected definitivo en el PR de QA post-implementación)". Su código de test quedó congelado con el veredicto BLOCKED de la fase H1. Verificación de que el contrato subyacente está implementado:

| TEST | Contrato | Verificación independiente del contrato subyacente |
|---|---|---|
| `T-H3-004` | §4.2: NULL seller → `ERR_SELLER_REQUIRED` temprano | Sonda propia GATE 3: `p_seller_id=null` → HTTP 400 `ERR_SELLER_REQUIRED` ✓ (el probe congelado del test muestra "HTTP 400 → seller_id=n/a" del estado pre-hardening) |
| `T-TC-001` | §5.2: matriz de policies por rol/operación | El `current` del propio test muestra las 4 policies desplegadas (`tax_configurations_select/insert/update/delete` con expresiones `is_admin()`/`has_store_role_as(...)`); verificado además contra `pg_policies` LIVE (GATE 8) y conductualmente: INSERT de tax por clerk → denegado (suite 20: T-TC-002 PASS), cross-store → denegado (T-TC-005 PASS) |
| `T-UTT-001` | §9.2: WHO/WHEN/HOW de UTT | Firma /3 + owner `costpro_transaction_adjuster` + ACL {adjuster, authenticated, service_role} verificados LIVE (GATE 8); cuerpo con `auth.uid()` + `is_admin() OR has_store_role_as(...,[admin,manager,encargado])` + state check + reason check verificados por huella. **PERO: la semántica runtime completa es INALCANZABLE por DEFECTO-1 (42501)** — ver nota |
| `T-UTT-006` | §9.2: estados `pending\|completed` + motivo 1..500 | Ídem: los checks existen en el cuerpo LIVE (`has_state_check=true`, `has_reason_check=true` en la huella) pero **no son alcanzables en runtime** mientras DEFECT-1 persista (toda llamada muere en `auth.uid()` antes de evaluarlos). El `current` congelado del test ("la función no consulta status ni exige motivo") describe el estado PRE-hardening. |

**Nota crítica sobre T-UTT-001/T-UTT-006**: la implementación de los checks es estáticamente demostrable (huella del cuerpo), pero la verificación RUNTIME del contrato de estados/motivo/autorización es imposible hasta corregir DEFECT-1. Esto convierte estos dos BLOCKED en **condicionalmente verificables**: el expected definitivo que el PR de QA deba darles solo podrá confirmarse en runtime tras el fix.

---

## 4. NOT-OBSERVABLE — `T-H2-004` (categoría F — BY DESIGN §14)

Se mantiene `NOT-OBSERVABLE BY DESIGN` conforme al spec §14 (secuencia interna exacta de sentencias no instrumentable en el PG administrado sin distorsionar el objeto medido). Certificación complementaria verificada independientemente por este QA:

1. **Estática**: `pg_get_functiondef` LIVE → `has_store_access_as` (auth) en offset **3509** ANTES de `idempotency_registry` en offset **4467** (gate determinista §14: auth precede a idempotencia ✓).
2. **Conductual**: T-H1-003/004 (anon+clave existente vs aleatoria: idénticos), T-H2-001 (no-miembro+clave existente: `ERR_UNAUTHORIZED`, sin satisfacer la clave), T-H6-006 (actor cruzado: `ERR_IDEMPOTENCY_KEY_REUSE` sin fuga) — todos PASS en la corrida independiente, más las sondas propias GATE 2 (A/B/C/D).
3. La sonda adicional de este QA demostró además que `ERR_SELLER_MISMATCH` (paso 3 §3.1) se dispara ANTES de idempotencia (paso 5) cuando el binding de seller falla — nueva evidencia conductual del orden interno.

No existe evidencia objetiva de que el contrato permita observar la secuencia exacta de otra manera (sin modificar producción, lo cual está prohibido). No se forzó ningún PASS artificial.

---

## 5. Nota sobre el consolidador (mandato §3)

`run-all.cjs` completó las 16 suites (101 tests persistidos en `results/*.json`) y falló SOLO en el paso final de consolidación: `TypeError: Cannot read properties of undefined (reading 'pass')` en `run-all.cjs:67` — el loop de consolidación relee `results/_consolidated.json` de corridas previas (sin campo `counts`) como si fuera una suite. **No se modificó el test** (regla §1). Los totales se calcularon directamente desde los 16 artefactos individuales: `101 · 82 · 14 · 4 · 1` — coincidentes con lo reportado por el Implementation Agent (cuya corrida no sufrió el defecto por partir de `results/` limpio). Defecto documentado en `results/_consolidated.json → consolidator_issue` para su corrección futura por el PR de QA.

---

## 6. Conclusión de la clasificación

```text
Entre los 101 tests de la suite: 0 REAL PRODUCTION BUG (A) — los 14 FAIL se
descomponen en 2 test bugs (regex) + 4 verdicts congelados/obsoletos + 8 deuda V1
correctamente diferida a R1.

FUERA de la suite (descubierto por sonda runtime propia): DEFECT-1 — REAL
PRODUCTION BUG (A) en update_transaction_taxes (42501 permission denied for
schema auth): camino autorizado imposible, auditoría UTT imposible, regresión
funcional del flujo de producto. Fail-closed (sin superficie de ataque abierta),
pero incumple el contrato §9.2 (WHO/WHEN/HOW/AUDIT) y el criterio de
certificación nº 5 del mandato (regresiones funcionales relevantes).

→ Veredicto global: BLOCKED — IMPLEMENTATION DEFECTS REMAIN
   (razón única y exacta: DEFECT-1; todo lo demás verificado y conforme)
```
