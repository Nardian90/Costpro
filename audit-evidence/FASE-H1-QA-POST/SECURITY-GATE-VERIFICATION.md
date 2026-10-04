# SECURITY-GATE-VERIFICATION — Verificación runtime independiente de los 9 gates críticos

> **FASE H1-QA-POST · Agent 2 (QA independiente)** · 2026-10-04 · rama `fase/create-sale-v2-hardening` @ `3c85f0e`
> Método: sondas runtime propias (script preservado fuera del repo: `gates-runtime.cjs`) + actores reales QA (USER_A/clerk@A, USER_B/clerk@B, SUPER_A/manager@A, ENC_B/encargado-global/clerk@B) + fixtures QA-H1. Evidencia completa: `runtime/gates-runtime.json` + `runtime/gates-runtime-verdicts.json`.
> Regla de la auditoría respetada: cero modificaciones a producción/RPC/SQL/RLS/ACL/tests. Solofixtures QA propios (tiendas/productos/usuarios/tasas/impuestos de prueba) + manipulación de fixture documentada (updated_at de tasa EUR, status voided de tx QA).

---

## Resumen ejecutivo

```text
GATE 1  ACL / anon-PUBLIC          ✅ CERRADO (verificado semántico + conductual)
GATE 2  IDEMPOTENCY ORACLE         ✅ CERRADO (A/B/C/D verificados)
GATE 3  SELLER SPOOFING            ✅ CERRADO (RPC + checkout + sync directo/anidado)
GATE 4  TAX MANIPULATION           ⚠️  CERRADO EN SUPERFICIE DE ATAQUE — CON DEFECTO REAL
        (pipeline tax del RPC: 7/7 verificados · UTT attack paths: fail-closed ·
         PERO camino AUTORIZADO de UTT IMPOSIBLE — DEFECTO-1, ver §4.9)
GATE 5  EXCHANGE RATE AUTHORITY    ✅ CERRADO (5/5 aspectos + auditoría)
GATE 6  CONCURRENCY                ✅ CERRADO (misma clave y última unidad)
GATE 7  MULTI-TENANT               ✅ CERRADO (8/8 con actores reales)
GATE 8  ANTI-RESURRECTION          ✅ CERRADO (census semántico 449 archivos + LIVE)
GATE 9  AUDIT                      ⚠️  PARCIAL (CREATE_SALE_V2 completo; UTT audit
         IMPOSIBLE mientras DEFECTO-1 persista — la función nunca ejecuta con éxito)
```

Los 9 gates de **ataque** están cerrados. El único defecto real encontrado (DEFECTO-1) es de **camino legítimo** (fail-closed): rompe el flujo de producto de `update_transaction_taxes` para managers autorizados y hace imposible su auditoría, pero NO abre ninguna superficie de ataque (ver detalle en §4.9 y en `POST-HARDENING-QA-REPORT.md` §5).

---

## GATE 1 — ACL (`create_sale_v2`)

| # | Sonda | Resultado | Evidencia |
|---|---|---|---|
| 1.1 | `has_function_privilege('anon', <oid V2>, 'EXECUTE')` | **false** | `runtime/gates-runtime.json` → `gate1_acl.privileges` — autoridad semántica del catálogo (consulta corre con privilegios de admin del proyecto) |
| 1.2 | `has_function_privilege('authenticated', …)` / `('service_role', …)` | true / true | idem — EXECUTE habilita la llamada; la autorización de negocio la resuelve el RPC (§2.2 del spec) |
| 1.3 | proacl materializado | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | idem → `gate1_acl.proacl` — sin entrada PUBLIC (análisis semántico de token `=X` desnudo: falso) |
| 1.4 | Anon conductual, clave EXISTENTE | HTTP **401** `42501 permission denied for function create_sale_v2` | idem → `gate1_acl.anon_existing` — sin transaction_id, sin status idempotent/success |
| 1.5 | Anon conductual, clave ALEATORIA | HTTP **401** — body **byte-idéntico** al de clave existente | idem → `gate1_acl.anon_random` + `anon_indistinguishable=true` — oráculo de existencia cerrado |
| 1.6 | Miembro autenticado (USER_A clerk@A) | HTTP 200 venta creada | idem → `gate1_acl.authenticated_member_call` |

**Nota de fidelidad contractual**: el spec §2.3 menciona "HTTP 403 uniforme de PostgREST"; esta versión de PostgREST materializa la denegación de EXECUTE sobre RPC como **401 con código 42501**. El contrato vinculante de la matriz de tests (§18: "DENIED (HTTP >= 400, sin transaction_id, sin divulgación)") se cumple: ambas claves producen el MISMO status y el MISMO body exacto. Propiedades de no-divulgación verificadas: anon no puede distinguir clave existente de aleatoria; no-miembro no puede satisfacer una clave antes de autorizar (GATE 2/D2).

**Recomprobación del regex defectuoso (mandato §15, ejemplo `/=X/`)**: el estado LIVE objetivo §2.1 contiene `postgres=X/postgres`; el regex `/=X/` del test T-H1-002/T-AR-004 detecta ese substring y reporta FAIL. Demostración de que es falso positivo: (a) la entrada PUBLIC real tendría la forma de token `=X` DESNUDO (inicio de string / tras `{` / tras `,`) — regex semántico `/(^|\{|,)\s*=X/` → **sin match**; (b) `has_function_privilege('anon',…)=false` (1.1); (c) conducta 1.4/1.5. El contrato de fondo está cerrado; el defecto es del regex del test (clasificación B — test bug).

---

## GATE 2 — IDEMPOTENCY ORACLE

| Caso | Sonda | Resultado | Evidencia |
|---|---|---|---|
| **A** | Anon + idempotency key EXISTENTE (venta previa de USER_A) | HTTP **401** `permission denied for function` — **sin transaction_id, sin HTTP 200** | `gate2_idempotency_oracle.caseA_anon_existing_key` |
| **B** | USER_A + misma clave + mismo payload (retry) | HTTP 200 `{"status":"idempotent","transaction_id":<misma>}` · filas transactions=1 · items=1 · movs=1 — **0 duplicados** | `caseB` |
| **C** | USER_A + misma clave + payload DISTINTO (qty 2) | HTTP 400 **`ERR_IDEMPOTENCY_KEY_REUSE`** — sin transaction_id, sin 500 de índice único (detección previa a INSERT) | `caseC` |
| **D1** | SUPER_A (manager@A, mismo store, actor distinto, seller=SU actor) + clave de USER_A | HTTP 400 **`ERR_IDEMPOTENCY_KEY_REUSE`** — sin fuga de la transacción ajena | `caseD_member_other_actor` |
| **D2** | USER_B (clerk@B, SIN membresía A) + clave de USER_A | HTTP 400 **`ERR_UNAUTHORIZED`** — la autorización precede a idempotencia (orden §3.1 verificado estática y conductualmente) | `caseD_nonmember` |

Orden canónico §3.1 verificado de forma independiente: en el cuerpo LIVE, `has_store_access_as` (auth) aparece en offset **3509** e `idempotency_registry` en **4467** — auth ANTES de idempotencia (GATE 8/8.1). Sonda conductual adicional: D1 con `p_seller_id` no-binding produce `ERR_SELLER_MISMATCH` ANTES de llegar a idempotencia — el chequeo de seller (paso 3) precede a idempotencia (paso 5), exactamente el orden §3.1.

---

## GATE 3 — SELLER SPOOFING

| Superficie | Sonda | Resultado | Evidencia |
|---|---|---|---|
| RPC directo | USER_A envía `p_seller_id=USER_B` | HTTP 400 **`ERR_SELLER_MISMATCH`** · delta de transacciones en STORE_A = **0** (sin efectos) | `gate3_seller_spoofing.rpc_spoof` |
| RPC directo | `p_seller_id=NULL` explícito | HTTP 400 **`ERR_SELLER_REQUIRED`** (rechazo temprano determinista §4.2) | `rpc_null` |
| `/api/pos/checkout` | body `seller_id=USER_B` (spoof) | HTTP **200** · `transactions.seller_id = USER_A` (= sesión) — la ruta **deriva** `p_seller_id := session.user.id` (D-34) y no reenvía el body | `checkout_spoof` |
| `/api/sync/batch` | payload encolado `p_seller_id=USER_B` + `p_user_id=USER_B` (spoof directo) | HTTP 200 · `seller_id = USER_A` (= sesión) — el mapper V2 reemplaza el dato encolado | `sync_spoof_direct` |
| `/api/sync/batch` | spoof ANIDADO: `payload.p_seller_id=B` + `payload.payload.p_seller_id=B` + `response_data.p_seller_id=B` + `data.nested.p_seller_id=B` | HTTP 200 · `seller_id = USER_A` — el mapper solo lee los campos explícitos del contrato y los sobreescribe con la sesión; ninguna estructura anidata alcanza al RPC | `sync_spoof_nested` |

Lectura del código verificada además de la conducta: `src/app/api/pos/checkout/route.ts:186` (`p_seller_id: session.user.id`) y `src/app/api/sync/batch/route.ts:140` (`p_seller_id: session.user.id`) — choke point único del RPC (§4) + defensa en profundidad en ambas rutas (§10). No confiamos solo en el test regex del repo: la verificación es conductual post-hoc sobre `transactions.seller_id` persistido.

---

## GATE 4 — TAX MANIPULATION

### 4.1–4.7 Pipeline tributario de `create_sale_v2` (7/7 verificados)

| Sonda | Resultado | Evidencia |
|---|---|---|
| Impuesto negativo fixed (−30, como descuento implícito) | HTTP 400 `ERR_APPLIED_TAX_INVALID: entrada sin id de configuración` | `gate4_tax.negative_fixed` |
| Impuesto porcentual negativo (−10%) | HTTP 400 `ERR_APPLIED_TAX_INVALID` | `negative_pct` |
| id desconocido (uuid aleatorio) | HTTP 400 `ERR_APPLIED_TAX_INVALID` (mensaje uniforme — no revela si el id existe) | `unknown_id` |
| id duplicado (mismo tax dos veces) | HTTP 400 `ERR_APPLIED_TAX_INVALID: impuesto duplicado` | `duplicate` |
| **Cross-store**: tax de STORE_B aplicado a venta de STORE_A | HTTP 400 `ERR_APPLIED_TAX_INVALID` | `cross_store_tax` |
| Impuesto VÁLIDO del catálogo (QA IVA 10% en STORE_A) con `p_tax_amount=999` (mirror cliente) | HTTP 200 · `tax_amount=10` (recálculo server, mirror ignorado) · `applied_taxes` = **snapshot del catálogo** `{id,name,type,value,min_exempt}` (el JSONB cliente NO se persiste) · `total=110` (invariante §8) | `valid_tax_sale` |
| Bypass de supervisor vía tax negativo | Rechazado ANTES de tocar el gate de supervisor — estructuralmente imposible (CHECK `value > 0` + pipeline §5.4: solo ids de catálogo) | `supervisor_bypass` |

### 4.8–4.14 `update_transaction_taxes` (superficie de ataque CERRADA — con defecto de camino legítimo)

| Sonda | Resultado | Evidencia |
|---|---|---|
| UTT por clerk (USER_A) | HTTP 403 — denegado (fail-closed) | `utt_clerk` |
| UTT cross-store: USER_B y ENC_B (encargado global) sobre tx de STORE_A | HTTP 403 ambos — denegados | `utt_cross_store` |
| UTT por manager autorizado (SUPER_A) + tax válido + motivo | **HTTP 403 `42501 permission denied for schema auth` — DEFECTO-1** (ver abajo) | `utt_authorized` |
| UTT sin motivo | HTTP 403 42501 — **no alcanza** `ERR_REASON_REQUIRED` (bloqueado por DEFECTO-1) | `utt_no_reason` |
| UTT sobre tx `voided` (estado terminal) | HTTP 403 42501 — **no alcanza** `ERR_TRANSACTION_STATE` (bloqueado por DEFECTO-1) | `utt_voided` |
| PT008 (protección de `total_amount`) | UPDATE directo de `total_amount` por SQL → **bloqueado por trigger PT008** — protección previa intacta (no fue eliminada) | `pt008_direct_update` |
| `adjust_total_amount` (superficie adyacente, SIN CAMBIO por mandato) | HTTP 403 42501 — mismo defecto **PRE-EXISTENTE** (ver §4.9) | `adjust_total_amount_preexisting` |

### 4.9 DEFECTO-1 ( único defecto real encontrado — camino AUTORIZADO de UTT imposible )

```text
TEST:        verificación runtime del camino legítimo §9.2 de update_transaction_taxes
             (SUPER_A = manager@A, membership activa, tx pending/completed de STORE_A,
             tax válido del catálogo, motivo 1..500)
EVIDENCIA:   HTTP 403 {"code":"42501","message":"permission denied for schema auth"}
             — para TODOS los callers (clerk, manager autorizado, encargado, USER_B,
             service_role). El cuerpo LIVE declara `v_actor uuid := auth.uid();`
             (línea DECLARE) y la función es SECURITY DEFINER con owner
             `costpro_transaction_adjuster`.
ROOT CAUSE:  el role `costpro_transaction_adjuster` NO tiene USAGE sobre el schema
             `auth` (verificado: has_schema_privilege(...) = false). Dentro del cuerpo
             SECDEF, current_user = owner → la resolución de `auth.uid()` exige USAGE
             sobre schema auth → 42501 en la primera sentencia, para cualquier caller.
             Ninguna migración del repo contiene `GRANT USAGE ON SCHEMA auth TO
             costpro_transaction_adjuster` (census: 0 resultados).
IMPACT:      (1) El flujo de producto "Ajuste de Impuestos" (TransactionDetailsModal,
             actualizado al contrato /3 en el commit h3) está MUERTO: ningún rol puede
             ejecutar la operación. (2) El contrato §9.2 (WHO/WHEN/HOW/AUDIT) es
             inejecutable: los checks de motivo/estado/invariante/auditoría son
             INALCANZABLES — todas las denegaciones observables son 42501 en lugar de
             los errores de contrato (ERR_UNAUTHENTICATED/ERR_UNAUTHORIZED/
             ERR_REASON_REQUIRED/ERR_TRANSACTION_STATE). (3) La auditoría
             UPDATE_TRANSACTION_TAXES (old/new/reason) no puede producirse jamás
             (GATE 9 parcial). (4) REGRESIÓN FUNCIONAL vs pre-hardening: la UTT /4
             anterior EJECUTABA con éxito (evidencia H1 T-UTT-003: "ACEPTADA:
             tax_amount=777"); la /3 endurecida no puede ejecutar para nadie.
             (5) Los PASS de T-UTT-002/003/005/007/008 son VACUOS en semántica de
             denegación: pasan porque la función falla, no porque el check correcto
             deniegue (fail-closed de facto, no el contrato de errores del spec).
             Seguro en superficie de ataque (nada puede mutarse), roto en camino
             legítimo.
             NOTA: `adjust_total_amount` (PR-4.4I/PT008, superficie SIN CAMBIO por
             mandato §10) sufre el MISMO defecto desde antes de este hardening — el
             patrón owner-adjuster sin USAGE sobre auth era ya defectuoso y el spec
             §9.4 lo mandató replicar para UTT. El defecto de adjust es PRE-EXISTENTE
             (fuera de alcance de este PR); el de UTT fue INTRODUCIDO por la
             migración 20261004130003 del propio hardening.
RECOMMENDATION: Implementation Fix PR (UNA línea en migración nueva):
             `GRANT USAGE ON SCHEMA auth TO costpro_transaction_adjuster;`
             (+ verificación de EXECUTE sobre auth.uid() para el role; considerar
             aplicar el mismo grant para el camino de adjust_total_amount, documentado
             aparte por ser pre-existente). Post-fix, re-ejecutar
             scripts/qa-post/gates-runtime.cjs (preservado) y las suites 21/22: el
             camino autorizado debe producir 200/true + recálculo server (tax=10,
             total=subtotal−desc+tax) + invariante PT002 + fila de auditoría
             UPDATE_TRANSACTION_TAXES, y las denegaciones deben reportar los errores
             de contrato (ya no 42501).
```

**No se corrigió nada durante esta auditoría** (regla §1/§20 del mandato).

---

## GATE 5 — EXCHANGE RATE AUTHORITY (server-authoritative)

| Sonda | Resultado | Evidencia |
|---|---|---|
| Cliente envía `rate=1.000.000` (USD, store rate fixture 400) | HTTP 200 · `transactions.sale_exchange_rate = 400.0000` (server) · `price_at_sale_cup = 40.000,00` (precio×400) — la tasa cliente NO se persiste | `gate5_rate.client_1000000` |
| Cliente envía `rate=0` | HTTP 200 · persistida **400** | `client_0` — D-EXR-02: 0/−5/680/1.000.000 van al mismo destino (ignorados); el contrato NO exige rechazo del valor informativo |
| Cliente envía `rate=−5` | HTTP 200 · persistida **400** | `client_neg` — idem |
| Tasa de tienda **vencida 60 días** (fixture EUR 350) + cliente 7 | HTTP 400 **`ERR_RATE_STALE`** — sin transaction_id (D-EXR-01 fail-closed) | `stale.probe_arbitrary_7` |
| Tasa vencida + cliente envía la MISMA tasa vencida (350) | HTTP 400 **`ERR_RATE_STALE`** — el cliente NO puede sustituirla | `stale.probe_stale_350` |
| Tasa fresca (USD store 400) | HTTP 200 — venta legítima | `fresh_rate` |
| Moneda sin fuente alguna (XYZ) | HTTP 400 **`ERR_EXCHANGE_RATE_UNAVAILABLE`** — fail-closed total (sin default 1/680/cliente) | `unavailable` |
| Auditoría de divergencia | `audit_logs.metadata`: `client_rate=1000000, server_rate=400.0000, rate_source=store` — observabilidad no-autoritativa D-EXR-02 | `audit_divergence` |

**Aclaración sobre la expectativa del mandato §8** ("rate=0 / rate<0 → debe rechazarse según contrato"): el contrato H0-R-FINAL **D-EXR-02 (APPROVED)** establece expresamente que la tasa del cliente es *informational-only* y que 0/−5/680/1.000.000 "pasan al mismo destino: ser ignorados" (spec §6.2). No existe requisito de rechazo por valor de la propuesta informativa; el sistema evaluado cumple el contrato real (persiste `server_rate` SIEMPRE — verificado en las 4 sondas). El requisito de rechazo que el prompt describe no forma parte del contrato aprobado por el dueño; se documenta la divergencia prompt-vs-contrato y se resuelve a favor del contrato (mandato §8 final: "determina si el sistema realmente persiste server_rate y no client_rate" — **sí, en el 100% de las sondas**).

---

## GATE 6 — CONCURRENCY

| Sonda | Resultado | Evidencia |
|---|---|---|
| Misma clave + mismo payload, **6 llamadas concurrentes** (Promise.all) | exactamente **1** transaction_id único · filas=1 · items=1 · movimientos=1 — 0 duplicados (todas responden 200 idempotent con la MISMA tx) | `gate6_concurrency.same_key_concurrent` |
| **Última unidad**: stock repuesto a 1 (products + inventory), 6 ventas concurrentes con claves DISTINTAS qty=1 | **1 éxito** · **5 rechazos** (`ERR_INSUFFICIENT_STOCK`) · stock final **0.0000** (nunca negativo) — sin duplicación de movimiento | `last_unit` |

El resultado no depende de timing/orden: la serialización proviene del advisory-lock por tienda + `FOR UPDATE` + `idempotency_registry` (verificado en el cuerpo LIVE, GATE 8). Retry/HTTP-duplicado cubierto por la sonda de misma clave (todas las réplicas reciben la misma transacción).

---

## GATE 7 — MULTI-TENANT (actores reales, sin admin)

| Sonda | Resultado | Evidencia |
|---|---|---|
| USER_B vende en STORE_B (producto B) | HTTP 200 · seller=USER_B | `gate7_multi_tenant.sale_B` |
| USER_A intenta vender en STORE_B | HTTP 400 `ERR_UNAUTHORIZED` | `a_in_B` |
| USER_A lee transacciones de STORE_B (REST, RLS SELECT) | 200 · **0 filas** | `lookup` |
| USER_A llama UTT sobre tx de STORE_B | 403 denegado | `utt_a_on_B` |
| USER_A reutiliza idempotency key de USER_B | 400 `ERR_UNAUTHORIZED` — sin fuga de la tx ajena | `key_reuse_cross` |
| SUPER_A (manager@A) PATCH `store_exchange_rates` de STORE_B | denegado (RLS canManageStore) — la tasa de la tienda ajena no cambia | `rate_patch_cross` |
| Venta cross-store como vendedor ajeno / tax cross-store / clave ajena | ver GATE 3 / GATE 4 / GATE 2 — todos denegados | — |

**USER_A nunca pudo manipular información financiera de STORE_B en ninguna sonda.** El aislamiento se demostró con actores reales (clerk@A vs clerk@B), sin usar admin para "probar" el aislamiento (el admin no aparece en ninguna sonda de denegación).

---

## GATE 8 — ANTI-RESURRECTION

| Sonda | Resultado | Evidencia |
|---|---|---|
| Census semántico de **449 migraciones** (regex `GRANT EXECUTE ON FUNCTION (create_sale\|create_sale_v2) … TO … PUBLIC\|anon` — distingue `INSERT INTO public.x` del grant real) | **0 grants peligrosos** | script `gate8-anti-resurrection.cjs` (preservado); salida archivada en `runtime/` |
| Archivos que CREATEan `create_sale_v2` | 8 total: 5 neutralizados con REVOKE V2→PUBLIC/anon en el propio archivo (los 3 ofensores corregidos + esec_final + h0r_hardening); 3 con `CREATE OR REPLACE` (NO resetea ACL — seguro en replay tras el CREATE inicial neutralizado) | idem |
| Reconciler final de cadena | `20261004130004_h0r_acl_reconciler.sql` = último timestamp de la cadena → estado canónico `{authenticated, service_role}` estable frente a replays | idem + lectura del archivo |
| `contract-surface.sql` (línea ~3034) | anotación `proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` — **sin entrada PUBLIC** (el replay del contract-surface ya no materializa EXECUTE público) | lectura directa del archivo |
| LIVE vs PR | cuerpo LIVE: `has_store_access_as`@3509 < `idempotency_registry`@4467 · refs `tax_configurations`/`store_exchange_rates`/`exchange_rates` = true · `ERR_RATE_STALE` + `INTERVAL '45 days'` + `ERR_SELLER_MISMATCH` + `ERR_IDEMPOTENCY_KEY_REUSE` + `ERR_INVALID_DISCOUNT` + `ERR_APPLIED_TAX_INVALID` presentes · SECURITY DEFINER + search_path acotado | `gate8_live_state.fingerprint` |
| UTT LIVE | firma /3 `(uuid, jsonb, text)` · owner `costpro_transaction_adjuster` (clase PT008) | `gate8_live_state.utt_live` |
| Falso positivo del census T-AR-003 (`/TO\s+PUBLIC/` vs `INSERT INTO public`) | demostrado: el patrón del test matchea el "TO" de "INTO"; los GRANTs reales viven únicamente en 2 archivos ACL-dedicados sin cuerpos de función (f4 + reconciler) — estructura desplegada | census propio + estructura de archivos verificada |

**Observación de higiene de despliegue (no bloqueante, pre-existente)**: el ledger `supabase_migrations.schema_migrations` detiene en `20260615000003` — las migraciones posteriores (incluidas las 5 del hardening) se aplicaron vía Management API sin registro en el ledger (patrón pre-existente del proyecto, igual en fases previas). La equivalencia LIVE↔repo se verificó por huella de objetos (función/policies/constraints/ACL arriba), no por ledger. Riesgo documentado: un futuro `supabase db push` reintentaría archivos ya aplicados; se recomienda registrar el estado o mantener el flujo Management API de forma consistente.

---

## GATE 9 — AUDIT

| Sonda | Resultado | Evidencia |
|---|---|---|
| `CREATE_SALE_V2` (3 muestras más recientes) | 3/3 con `metadata.client_rate`, `metadata.server_rate`, `metadata.rate_source` (+ `idempotency_param_hash`) — trazabilidad D-EXR-02 completa: actor implícito por fila, store, tasa cliente vs server, fuente, transacción (record_id) | `gate9_audit.create_sale_v2_samples` |
| `UPDATE_TRANSACTION_TAXES` | **0 filas posibles** — la función no puede ejecutarse con éxito (DEFECTO-1) → el contrato de auditoría old/new+reason+actor+store es INALCANZABLE en runtime | `utt_samples` |

La auditoría del núcleo financiero V2 (venta) cumple el spec §6.2/§9.2-audit. La auditoría de UTT queda BLOQUEADA por DEFECTO-1 (no por ausencia de implementación del INSERT de auditoría — el cuerpo LIVE contiene el INSERT extendido, verificado estáticamente; simplemente nunca se alcanza).

---

## Conclusión de gates

```text
9/9 superficies de ATAQUE cerradas (verificadas en runtime con actores reales).
1 defecto REAL de camino legítimo: DEFECT-1 (UTT 42501) — fail-closed, sin
exposición de ataque, con regresión funcional del flujo autorizado y auditoría
UTT imposible. 1 defecto hermano PRE-EXISTENTE documentado (adjust_total_amount,
fuera de alcance del PR).
```
