# CREATE-SALE-V2-HARDENING-SPEC-RECOVERED — Especificación contractual oficial (H0-R)

> **FASE H0-R — RECONSTRUCCIÓN CONTRACTUAL** · 2026-10-04
> Este documento **reemplaza conceptualmente** la especificación H0 perdida (`CREATE-SALE-V2-HARDENING-SPEC.md`, nunca producida — ver FASE-H1 Baseline §1) y es la fuente normativa para el hardening H1–H6, las superficies colaterales y el retiro de V1.
> **Modo**: READ-ONLY / DECISION-ONLY. Esta fase no modificó producción, tests, fixtures ni migraciones (verificado: `git status` — solo documentación añadida).

---

## 0. Procedencia y reglas de construcción

### 0.1 Fuentes de verdad utilizadas (en orden)

| Fuente | Contenido usado |
|---|---|
| **A — evidencia runtime H1** | `audit-evidence/FASE-H1/` (101 tests: 50 PASS · 44 FAIL · 6 BLOCKED · 1 NOT-OBSERVABLE), `scripts/qa-h1/`, `_consolidated.json`, resultados por suite |
| **B — hallazgos FASE 3** | ACL V2 canónico F4, idempotency-before-auth, seller spoofing, tax/rate en cliente, cross-store, reconciler como vector de resurrección |
| **C — código LIVE** | `pg_get_functiondef` LIVE de `create_sale_v2` (/24, 26.981 chars), `create_sale` V1, `update_transaction_taxes`, `adjust_total_amount`, `has_store_access_as`, `has_store_role_as`, trigger `protect_transactions_total_amount` (PT008), RLS/policies LIVE (`tax_configurations`, `store_exchange_rates`, `exchange_rates`), rutas `/api/pos/checkout` y `/api/sync/batch`, `features.ts`, `usePOSCheckout.ts`, `useSalesCatalog.ts`, `TransactionDetailsModal.tsx`, `useTaxes.ts`, `/api/store-rates`, `exchange-capture.ts` |
| **D — negocio existente** | Decisiones documentadas y ratificadas en código/migraciones: E-SEC-FINAL D1–D5 (umbral supervisor 15% por línea + motivo + token single-use — `FASE-E-SEC-FINAL/04-SERVER-POLICY.md`), DECISION-FX-01 (escritura de tasas globales solo admin con auditoría atómica — `20260827000006`), DECISION-AUD-02 (auditoría atómica, dueño rechazó best-effort), patrón SEC-TS-02 (`/api/store-rates`: escritura `canManageStore` = admin/manager/encargado de la tienda), patrón `adjust_total_amount` (admin + motivo + PT002 + auditoría), patrón idempotencia V2.26 (`idempotency_registry` + `check_idempotency` + `ERR_IDEMPOTENCY_KEY_REUSE` + param_hash exhaustivo), regla F-21 (tasa no-CUP > 1.5 en recepciones), defaults BCC segmento 3 (MIPYMES) en `/api/exchange-rates` |

### 0.2 Regla sobre los 44 FAIL

Los 44 FAIL de H1 son **evidencia intacta**. Esta especificación:

- **no** reinterpreta ningún FAIL para reducirlo;
- **no** elimina, relaja ni modifica tests ni expected results;
- **no** clasifica ningún FAIL como "aceptable";
- confirma los expected results originales (§13) y añade el **REQUIRED CONTRACT** que faltaba.

Cambio de categoría permitido únicamente para los 6 BLOCKED (§18): 4 pasan a `FAIL — IMPLEMENTATION` porque este documento define su contrato; 2 permanecen `BLOCKED — BUSINESS DECISION` porque **no existe evidencia** para fijar el valor (§15). El único NOT-OBSERVABLE se resuelve como `NOT-OBSERVABLE BY DESIGN` con vía de certificación (§14).

### 0.3 Qué puede decidir este documento

Arquitectura derivable de las fuentes A–D. Donde una decisión de negocio no puede demostrarse por código/migraciones/config/datos históricos/documentación existente, se marca **`BUSINESS DECISION REQUIRED`** y **no se inventa el valor**.

---

## 1. Estado final deseado (resumen ejecutivo)

```text
create_sale_v2 es el ÚNICO contrato de venta:
  · ACL: EXECUTE solo para authenticated y service_role (PUBLIC/anon = prohibido, en LIVE y en toda la cadena de migraciones)
  · Orden interno: auth → actor → autorización (membresía) → idempotencia → negocio → financiero → inventario
  · Seller: p_seller_id == actor autenticado (Opción B), sin excepciones
  · Tax: fuente única tax_configurations (global + por tienda), recálculo server-side, cliente = propuesta validada/reemplazada
  · Rate: resolución server-side store_exchange_rates → exchange_rates (BCC seg 3 → elToque), cliente = informativo
  · Idempotencia: identidad (clave, actor, tienda, param_hash) + ERR_IDEMPOTENCY_KEY_REUSE
  · update_transaction_taxes: retenida y estrictamente limitada (Opción B, patrón adjust_total_amount)
  · V1: retirada por gates PR-R1 con anti-resurrección total
```

Pendiente exclusivamente del dueño: **staleness de tasa**, **banda de desviación**, **tope superior de impuesto porcentual** (§15). Por eso el veredicto es `BLOCKED — BUSINESS DECISION REQUIRED` (§16).

---

## 2. H1 — ACL de `create_sale_v2`

### 2.1 Contrato final

| Llamador | EXECUTE sobre create_sale_v2 | Justificación (fuente) |
|---|---|---|
| `anon` | **DENEGADO** | H1/T-H1-002; el oráculo de existencia de claves (T-H1-003/004) se cierra en la capa ACL |
| `PUBLIC` | **DENEGADO** (sin `=X` en proacl) | idem; `anon` hereda de `PUBLIC`, por lo que `REVOKE ... FROM anon` solo es insuficiente |
| `authenticated` | **PERMITIDO** | `/api/sync/batch` ejecuta el RPC con el token del usuario (T-SB-004 PASS, diseño documentado); la autorización de negocio la hace el RPC (membresía) |
| `service_role` | **PERMITIDO** | `/api/pos/checkout` (envoltorio server-side: Zod + CSRF + rate-limit + token de supervisor) |

proacl objetivo:

```text
{postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
```

### 2.2 EXECUTE ≠ autorización de negocio

El privilegio SQL `EXECUTE` habilita la **llamada**; la **autorización de negocio** (identidad → membresía → estado financiero) la resuelve el cuerpo del RPC (`has_store_access_as`). Esta separación es deliberada y debe conservarse: `authenticated` conserva EXECUTE y el RPC rechaza a no-miembros con `ERR_UNAUTHORIZED` uniforme.

### 2.3 Propiedad de no-divulgación (oráculo cerrado)

> Una llamada anónima no puede descubrir **siquiera si una idempotency key existe**.

Contrato observable:

| Llamador | Clave existente | Clave aleatoria | Resultado exigido |
|---|---|---|---|
| anon (sin EXECUTE) | cualquiera | cualquiera | HTTP **403 uniforme** de PostgREST (mismo status/body/latencia-clase para ambas) |
| authenticated no-miembro | existente | aleatoria | `ERR_UNAUTHORIZED` (HTTP 400/403) **indistinguible** entre ambas |
| authenticated miembro, actor distinto | existente | aleatoria | existente → `ERR_IDEMPOTENCY_KEY_REUSE` (sin `transaction_id`); aleatoria → ejecución normal |

Tests que fijan este contrato: T-H1-001/002/003/004, T-H2-001/002, T-H6-006/007/008, T-CS-005.

---

## 3. H2 — Orden canónico de ejecución

### 3.1 Contrato de orden (dentro del RPC)

La función LIVE ejecuta hoy: advisory-lock → **idempotencia (offset ~2798) → auth (offset ~3242)** → … (evidencia estática `v2_order` + evidencia runtime T-H1-003/T-H2-001). El contrato H0-R **invierte** los dos primeros pasos de seguridad:

```text
1. pg_advisory_xact_lock(hashtext(p_store_id))     — serialización por tienda (sin cambio)
2. AUTH: v_uid (auth.uid(); service_role → COALESCE(p_user_id, auth.uid()))
        + has_store_access_as(v_uid, p_store_id)   — ERR_UNAUTHORIZED uniforme
3. SELLER BINDING: p_seller_id == v_uid            — §4 (ERR_SELLER_REQUIRED / ERR_SELLER_MISMATCH)
4. validate_operation_date (si p_operation_date)   — sin cambio
5. IDEMPOTENCIA: (clave, actor, tienda, param_hash) — §7; conflicto → ERR_IDEMPOTENCY_KEY_REUSE
6. Negocio: items/precio/stock (primera pasada FOR UPDATE, orden determinista por product_id)
7. Financiero: subtotal → descuento → impuestos (§5) → tasa (§6) → total → gate supervisor (D1–D5 sin cambio)
8. Pagos: split + invariantes (PT011 sin cambio)
9. Persistencia: transactions → stock_movements/transaction_items → payment_transactions → audit_logs
```

Cualquier denegación en 2–5 **no produce escritura alguna** (T-H2-003 PASS se mantiene como invariante de regresión).

### 3.2 Por qué el orden es observable-conductualmente

El orden interno exacto no es instrumentable en el PostgreSQL administrado de Supabase sin `auto_explain`/trazas por sentencia (§14). La verificabilidad se logra con **sondas conductuales deterministas** ya presentes en la suite: anon+clave existente (T-H1-003), no-miembro+clave existente (T-H2-001), actor cruzado con clave ajena (T-H6-006) — cada una demuestra empíricamente qué check corre primero. Post-hardening, las tres deben fallar **antes** de tocar idempotencia.

---

## 4. H3 — Seller binding (`auth.uid()` · `p_user_id` · `p_seller_id`)

### 4.1 Decisión: **Opción B** — mantener `p_seller_id` y exigir identidad con el actor

```text
p_seller_id == v_uid (actor autenticado resuelto)
```

**Evidencia que la sostiene (Fuente C/D):**

1. **Ningún flujo de producto usa un vendedor distinto del actor**: `usePOSCheckout.ts` y `useSalesCatalog.ts` (online y offline) envían siempre `seller_id/p_seller_id = user.id`; `useTransactions.ts` (V1) también. No existe selector de vendedor en la UI.
2. **Las tres superficies ya resuelven el actor server-side**: ruta checkout → `p_user_id = session.user.id` (T-RT-007 PASS); sync → token del usuario + `p_user_id = session.user.id` (T-SB-004 PASS); RPC directo → `auth.uid()`.
3. **Opción B evita el cambio de firma /24** (E-SEC-FINAL): sin nuevo overload, sin re-touch del reconciler F4 por firma, sin cambio de contrato PostgREST; el hardening vive en el cuerpo del RPC (único choke point).
4. **Opción A** (eliminar el parámetro) queda registrada como evolución V3 posible (§13 — requisito no bloqueante), pero exige cambio de firma + ACL + rutas + sync: mayor superficie de regresión sin beneficio de seguridad adicional sobre B.

**Sin excepción administrativa**: no existe evidencia de ningún flujo "en nombre de" (no hay feature, no hay UI, no hay dato histórico). Cualquier flujo futuro de venta delegada requerirá una enmienda explícita a esta especificación (nueva superficie autorizada, con auditoría propia) — **no** una relajación silenciosa de `p_seller_id`.

### 4.2 CONTRATO FINAL REQUERIDO (matriz)

| Actor | `p_seller_id` | Resultado exigido |
|---|---|---|
| USER_A (clerk, miembro STORE_A, authenticated) | USER_A | `200` · `transactions.seller_id = USER_A` |
| USER_A | USER_B, miembro de STORE_A | `400 ERR_SELLER_MISMATCH` — sin efectos, sin fuga |
| USER_A | USER_B, miembro de STORE_B (cross-store) | `400 ERR_SELLER_MISMATCH` — sin efectos |
| USER_A | `NULL` (explícito) | `400 ERR_SELLER_REQUIRED` |
| USER_A | omitido | `400` (PostgREST, parámetro requerido; el NULL explícito cae al contrato anterior) |
| service_role checkout (`p_user_id` = sesión USER_A) | USER_A | `200` · seller = USER_A |
| service-role checkout | USER_B (≠ sesión) | `400 ERR_SELLER_MISMATCH` |
| service-role sync (token de USER_A) | seller X ≠ USER_A (payload encolado manipulado) | `400 ERR_SELLER_MISMATCH` |
| admin global | sí mismo | `200` · seller = admin |
| admin global | otro usuario | `400 ERR_SELLER_MISMATCH` (sin excepción) |

Notas de implementación:

- El chequeo va **antes** de idempotencia (§3.1 paso 3) y **antes** de cualquier escritura.
- `transactions.seller_id` es `NOT NULL` (esquema LIVE): el NULL explícito hoy falla tarde (violación NOT NULL en el INSERT, tras validar stock); el contrato exige rechazo temprano determinista.
- **Defensa en profundidad en rutas**: `/api/pos/checkout` deja de reenviar `d.seller_id` y deriva `p_seller_id := session.user.id` (el RPC igualmente exige igualdad); `/api/sync/batch` reemplaza `op.payload.p_seller_id` por `session.user.id` al mapear el payload V2 (el payload encolado es dato de cliente no confiable).
- `p_user_id` **solo** tiene efecto bajo `service_role` (T-H3-005 PASS — sin cambio): bajo `authenticated` se ignora y manda `auth.uid()`.

Tests que fijan este contrato: T-H3-001…006, T-CS-003, T-RT-003, T-SB-005.

---

## 5. H4 — Autoridad tributaria (`tax_configurations` + `applied_taxes`)

### 5.1 Fuente autoritativa: **`tax_configurations`** (única)

Evidencia (Fuente C/D):

- La tabla existe con diseño dual **global + por tienda** (`store_id NULL` = impuesto global; FK a stores = por tienda) y semillas históricas globales (`IVA 10%`, `Impuesto 5% (Exento 3260)` — `20260228_implement_taxes.sql`).
- El POS ya la consume como catálogo: `useTaxes(storeId)` selecciona `is_active AND (store_id IS NULL OR store_id = store)`; el carrito aplica impuestos con `toggleTax` y `TaxConfiguration`.
- El ajuste post-venta (`TransactionDetailsModal`) opera sobre el mismo modelo.
- El RPC LIVE tiene **0 referencias** a `tax_configurations` (T-H4-005 FAIL) — el JSONB del cliente es hoy la única fuente. El contrato invierte esa autoridad.

`tax_configurations` queda confirmada como **única fuente server-authoritative** de impuestos. La tabla está **vacía hoy** (0 filas LIVE): el implementador NO debe sembrar impuestos (qué impuestos existen es decisión del dueño/operación — ver aviso §5.6).

### 5.2 Matriz de escritura de `tax_configurations`

Derivada del patrón documentado SEC-TS-02 (`/api/store-rates`: `canManageStore` = membresía activa con rol **admin/manager/encargado en esa tienda** o admin global) para config financiera por tienda, y de DECISION-FX-01 (config financiera global → **solo admin**) para las filas globales:

| Operación | Impuestos globales (`store_id IS NULL`) | Impuestos por tienda (`store_id = X`) |
|---|---|---|
| SELECT | `authenticated` (cualquier miembro — el POS los lee para toda tienda) | miembro activo de X (`has_store_access(X)`) |
| INSERT / UPDATE / DELETE | **solo admin global** (`is_admin()`) | `has_store_role_as(auth.uid(), X, ARRAY['admin','manager','encargado'])` o admin global |
| service_role | bypass (fixtures/flujos server) | bypass |
| anon | DENY total | DENY total |

La policy LIVE única ("Tax unified", ALL para authenticated vía `has_store_access(store_id)`) debe **reemplazarse** por policies separadas SELECT vs ALL con los roles de arriba: hoy un clerk crea impuestos arbitrarios (T-TC-002 FAIL) y las filas globales ni siquiera son legibles por miembros (la policy devuelve false con `store_id NULL` — el contrato de lectura del frontend `useTaxes` exige lo contrario).

Restricciones DDL exigidas (adiciones):

```sql
ALTER TABLE public.tax_configurations ADD CONSTRAINT tax_configurations_value_positive CHECK (value > 0);
-- type CHECK (fixed|percentage) ya existe. min_exempt >= 0.
ALTER TABLE public.store_exchange_rates ADD CONSTRAINT store_rates_positive CHECK (rate > 0);
```

Precedente: `exchange_rates.rate CHECK (rate > 0)` y regla F-21 (tasa no-CUP > 1.5 en recepciones). **Tope superior para `type='percentage'`**: sin evidencia → `BUSINESS DECISION REQUIRED` (§15.3, no bloqueante — ver §5.3).

### 5.3 Contrato de valores en venta

| Valor propuesto (venta) | Resultado exigido |
|---|---|
| Impuesto negativo (fixed −30 / −10%) | **IMPOSIBLE POR CONSTRUCCIÓN** — el impuesto se reconstruye desde catálogo con `value > 0`; entradas cliente con valor negativo no existen en catálogo → `ERR_APPLIED_TAX_INVALID` |
| Impuesto 0% | Solo posible como **ausencia de impuestos** (`applied_taxes = []` → `tax = 0`, venta legítima); no existe config con `value = 0` (CHECK) |
| Impuesto positivo | Aceptado **solo** si existe como fila activa visible para la tienda (global o de la tienda) |
| Impuesto extremo (100% / 10000%) | Solo alcanzable si un rol autorizado (§5.2) crea la config — queda auditado y es análogo a la política vigente de sobrecarga de precio (T-FIN-003, "overprice permitido", E-SEC-FINAL D1). Tope numérico: §15.3 |
| Impuesto duplicado (mismo `id` dos veces) | `ERR_APPLIED_TAX_INVALID` |
| Impuesto desconocido (`id` no existe / inactivo / de otra tienda) | `ERR_APPLIED_TAX_INVALID` — sin revelar si el id existe (mensaje uniforme) |

### 5.4 Pipeline de `p_applied_taxes` (propuesta → validación → reemplazo)

Resultado único exigido — **server validation + server replacement** (el cliente propone, el servidor valida y reemplaza; nunca persiste el JSONB cliente tal cual):

```text
por cada entry de p_applied_taxes:
  · entry.id (uuid) obligatorio
  · lookup: tax_configurations WHERE id = entry.id AND is_active
            AND (store_id IS NULL OR store_id = p_store_id)
  · no encontrado o id duplicado → ERR_APPLIED_TAX_INVALID
  · entrada canónica reconstruida DESDE la fila: {id, name, type, value, min_exempt}
v_applied_taxes := JSONB de entradas canónicas (orden de llegada del cliente, sin recomputar)
v_calculated_tax := Σ  (type='percentage': GREATEST(0, base − min_exempt) × value / 100
                        type='fixed':    value)
                   con base = GREATEST(0, calculated_subtotal − discount_amount)   [misma fórmula §8 actual]
```

Persistencia: `transactions.applied_taxes = v_applied_taxes` (snapshot de catálogo), `transactions.tax_amount = v_calculated_tax`. `p_tax_amount` (cliente) queda como **mirror de validación ignorado** (hoy derivaba del JSONB cliente — T-FIN-006 FAIL).

La ruta `/api/pos/checkout` debe reforzar el schema: `applied_taxes: z.array(z.object({ id: z.string().uuid() }).passthrough())` (hoy `z.array(z.any())`).

### 5.5 Venta histórica

**Confirmado (T-TC-004 PASS — contrato vigente):** una modificación de `tax_configurations` afecta **solo ventas futuras**. Las ventas históricas conservan el snapshot `applied_taxes` + `tax_amount` persistidos; ninguna relectura/recálculo retroactivo. Los reportes contables derivan del snapshot.

### 5.6 Interacción con el gate de supervisor (E-SEC-FINAL D1–D5)

- D1–D5 quedan **intactos** (umbral ≥15% por línea o global; supervisor = admin/manager de la tienda; RC-1 identidad; token single-use + scope bajo service_role; motivo obligatorio).
- La evasión por impuesto negativo (T-H4-004: −30% como descuento implícito) queda **estructuralmente imposible**: el impuesto ya no puede reducir la base.
- **Aviso operativo para el gate de implementación**: con la tabla vacía, toda venta que hoy envie `applied_taxes ≠ []` comenzará a recibir `ERR_APPLIED_TAX_INVALID` hasta que la operación cree sus impuestos. El flujo normal V2 (catálogo de ventas envía `applied_taxes: []`) no se ve afectado. La decisión de poblar el catálogo es del dueño (no sembrar automáticamente).

---

## 6. H5 — Autoridad de tasa de cambio

### 6.1 Jerarquía de resolución (server-side, inequívoca)

Evidencia: `store_exchange_rates` fue diseñada como "tasas manuales por tienda … **que se usan en el POS**; persisten hasta cambio manual" (`20260710000001`); `exchange_rates` es la fuente global (BCC oficial con 3 segmentos + elToque informal; escritura admin-only con auditoría atómica — DECISION-FX-01; captura automática service_role). El default de lectura global de toda la app es **BCC segmento 3 (tasaEspecial, MIPYMES)** — `GET /api/exchange-rates` (`segment || '3'`) y el auto-fill de recepciones (F4-GAP3, `source=BCC&segment=3`). **MLC no existe en BCC** (solo elToque — documentado en `exchange-capture.ts`), por lo que el fallback por moneda necesita la cadena BCC-seg3 → elToque.

```text
v_server_rate := (
  CASE p_sale_currency
    WHEN 'CUP' THEN 1
    ELSE COALESCE(
      (SELECT rate FROM store_exchange_rates
        WHERE store_id = p_store_id AND currency = p_sale_currency),
      (SELECT rate FROM exchange_rates
        WHERE currency = p_sale_currency AND source = 'BCC' AND segment = '3'
        ORDER BY rate_date DESC, captured_at DESC LIMIT 1),
      (SELECT rate FROM exchange_rates
        WHERE currency = p_sale_currency AND source = 'elToque'
        ORDER BY rate_date DESC, captured_at DESC LIMIT 1)
    )
  END);

IF p_sale_currency <> 'CUP' AND (v_server_rate IS NULL OR v_server_rate <= 0) THEN
  RAISE 'ERR_EXCHANGE_RATE_UNAVAILABLE: currency=%, store=%'   -- fail-closed; NUNCA 1, ni 680, ni la tasa del cliente
END IF;
```

### 6.2 Tasa del cliente: **informational only** (el servidor reemplaza)

Fijado por el contrato H1 (T-H5-001/002: "gana la fuente autorizada"; T-FIN-009; T-RT-005):

- `p_sale_exchange_rate` **no puede** fijar la tasa efectiva ni el valor persistido.
- No se rechaza por valor (0/−5/680/1.000.000 pasan al mismo destino: ser ignorados) — **la política de rechazo por desviación extrema es §15.2 (BUSINESS DECISION)**.
- Auditoría: `audit_logs.metadata` registra `client_rate`, `server_rate`, `rate_source` (`store` | `global_bcc_seg3` | `global_eltoque`) para trazabilidad de la divergencia.

### 6.3 Dónde termina cada tasa (scope completo)

| Campo | Valor persistido |
|---|---|
| `transactions.sale_exchange_rate` | `v_server_rate` |
| `transaction_items.price_at_sale_cup` | `price_at_sale × v_server_rate` (recalculado con tasa servidor) |
| `transaction_items.exchange_rate` (por ítem) | metadata informativa del cliente, **sin autoridad financiera** (las conversiones contables usan exclusivamente la tasa servidor de la venta) |
| `payment_transactions` (zelle): `exchange_rate`, `amount` | `v_server_rate`, `v_zelle_amt / v_server_rate` |
| Contabilidad / reportes | derivan de los campos de arriba (única fuente: tasa servidor) |
| Validaciones `ERR_ZELLE_REQUIRES_RATE` / `PT004` / `PT009` | sin cambio, ahora evaluadas contra `v_server_rate` |

### 6.4 Scope de la resolución

- **store**: `p_store_id` de la venta.
- **currency**: `p_sale_currency` (CUP→1; USD/EUR/MLC→jerarquía).
- **timestamp/fecha efectiva**: la tasa se resuelve **en el momento de ejecución del RPC** (independientemente de `p_operation_date` back-dated; sin resolución "as-of" histórica — no existe patrón previo y añade ambigüedad). La resolución queda registrada en auditoría (§6.2).
- **actor autorizado a escribir las fuentes**:
  - `store_exchange_rates`: `canManageStore` (membresía activa admin/manager/encargado de esa tienda o admin global) vía `/api/store-rates` (SEC-TS-02) — y la policy RLS "Users can manage own store rates" debe **igualar** ese gate (hoy permite write a cualquier miembro vía `profiles.store_id` — T-ER-001/002 FAIL; una sola semántica de autorización, sin superficies paralelas divergentes).
  - `exchange_rates`: admin global vía `upsert_manual_exchange_rate_with_audit` (DECISION-FX-01, auditoría atómica) + captura automática service_role. Sin cambios.
- **fallback**: §6.1 (fail-closed con `ERR_EXCHANGE_RATE_UNAVAILABLE`).

### 6.5 Pendiente de negocio (sin evidencia — NO inventado)

- **Staleness** (T-H5-005): ninguna política de antigüedad de tasa existe en el código (ni 45 días ni otro valor; `store_exchange_rates` ni siquiera tiene fecha de captura — solo `updated_at`; `exchange_rates` tiene `rate_date`). → **§15.1 BUSINESS DECISION REQUIRED**.
- **Banda de desviación** (T-H5-006): no existe banda alguna en el sistema (la constante `EL_TOQUE_SPREAD=1.15` es un estimador de captura, no una banda de validación; F-21 es un piso para recepciones). → **§15.2 BUSINESS DECISION REQUIRED**. Nota: la seguridad ya está cerrada sin banda (la tasa persistida es siempre la del servidor); la banda solo decide rechazo-vs-aceptación de propuestas clientiles aberrantes.

---

## 7. H6 — Idempotencia

### 7.1 Contrato confirmado (matriz completa)

| Escenario | Resultado exigido |
|---|---|
| misma clave + mismo actor + misma tienda + mismo payload (param_hash) | `200 {status:'idempotent', transaction_id}` — la MISMA transacción; 0 duplicados (tx/items/pagos/movimientos) |
| misma clave + payload distinto | `ERR_IDEMPOTENCY_KEY_REUSE` (HTTP 409/400) — **sin** `transaction_id` |
| misma clave + actor distinto | `ERR_IDEMPOTENCY_KEY_REUSE` — sin fuga de la transacción ajena |
| misma clave + tienda distinta | `ERR_IDEMPOTENCY_KEY_REUSE` (o `ERR_UNAUTHORIZED` si además no hay membresía — la autorización precede, §3) |
| anónimo + clave existente | denegación uniforme, indistinguible de clave aleatoria (§2.3) — nunca `transaction_id` |
| concurrente, misma clave (mismo actor/tienda/payload) | exactamente 1 transacción · 0 duplicados de inventario/pago/movimiento (comportamiento ya PASS — T-H6-009 — debe conservarse) |

### 7.2 Identidad del payload (campos del hash — decisión explícita)

Precedente de implementación: patrón V2.26 hotfix2/hotfix3 (`idempotency_registry` + `check_idempotency` + **param_hash exhaustivo** md5 con concatenación canónica `|`), ya en producción para los RPC G-series (80 filas en `idempotency_registry` LIVE).

**ENTRAN en el hash** (identidad de la venta):

```text
p_store_id · v_uid (actor resuelto — cubre seller_id, que bajo §4 == v_uid)
items[]: (product_id, variant_id, quantity, price_at_sale)  — orden determinista por product_id
p_payment_method · p_cash_amount · p_transfer_amount · p_zelle_amount
p_discount_type · p_discount_value
p_applied_taxes           (serialización canónica del JSONB propuesto, tal cual llegó)
p_sale_currency · p_sale_exchange_rate   (propuesta client, tal cual — ver nota)
p_customer_id · p_customer_name · p_operation_date (ISO normalizado)
espejos de validación: p_total_amount · p_subtotal · p_tax_amount (tal cual llegaron)
```

**NO ENTRAN** (metadatos de autorización / re-emisión): `p_supervisor_user_id`, `p_supervisor_token_jti` (single-use: un retry legítimo lleva jti nuevo), `p_supervisor_scope`, `p_discount_reason`, `p_user_id` (el actor entra como `v_uid`).

Nota sobre `p_sale_exchange_rate`/`p_applied_taxes` como propuestas: se hashea **lo que el cliente envió** (no el valor resuelto) — determinista para el retry (mismo body ⇒ mismo hash) y estricto para el conflicto (cualquier cambio de propuesta ⇒ `ERR_IDEMPOTENCY_KEY_REUSE`, fail-closed).

### 7.3 Requisitos de implementación

- El chequeo de idempotencia corre **después** de auth/authZ/seller (§3.1 paso 5) — hoy corre antes (T-H1-003).
- La respuesta idempotente debe incluir la MISMA `transaction_id`; la de conflicto NINGUNA.
- La detección de conflicto debe ocurrir **antes de cualquier INSERT** (hoy un mismo key con tienda/actor distinto puede chocar con el índice único global `transactions_idempotency_key_key` y producir un 500 con fuga de existencia). Ya existen los índices: `transactions_idempotency_key_key` (global único) y `transactions_idempotency_key_store_idx` (único `(key, store_id)` parcial) — la semántica de rechazo limpio es responsabilidad del RPC, no del índice.
- El registro `idempotency_registry` (operación `'create_sale_v2'`) es el mecanismo de precedencia recomendado (ya auditado en producción); cualquiera que preserve el contrato observable de §7.1 es válido.
- Concurrencia: mantener advisory-lock por tienda + `FOR UPDATE` (T-H6-009/T-INV-003 PASS).

Tests que fijan este contrato: T-H6-001…009, T-CS-005, T-H2-001.

---

## 8. Integridad financiera — matriz definitiva

| Campo | Cliente puede proponer | Autoridad del servidor | Valor persistido |
|---|---|---|---|
| `quantity` (por ítem) | Sí | valida > 0, finito; conversión por variante (`conversion_factor`) | quantity validado |
| `unit_price` (`price_at_sale`) | Sí | valida ≥ 0 finito (NaN/±Inf/negativo → `ERR_INVALID_PRICE`); redondeo 2dp; desvío vs catálogo (D1: gate ≥15% por línea) — **sin cambio E-SEC-FINAL** | precio redondeado |
| `subtotal` | Sí (mirror) | **RECALCULA** (Σ subtotales de línea redondeados) | `calculated_subtotal` |
| `discount` (`p_discount_value/type`) | Sí | recalcula; **rechaza negativo** (`ERR_INVALID_DISCOUNT` — nuevo; hoy `LEAST(-100, subtotal)` infla el total, T-FIN-007); cap a subtotal; gate ≥15% | `v_discount_amount` |
| `applied_taxes` | Sí (**propuesta**) | valida + **reemplaza** desde `tax_configurations` (§5.4) | snapshot de catálogo |
| `tax_amount` | Sí (mirror) | recalcula desde impuestos validados | `v_calculated_tax` |
| `total_amount` | Sí (mirror) | recalcula; `\|calc − client\| > 0.01` → `ERR_TOTAL_MISMATCH` | `v_calculated_total` |
| `exchange_rate` | Sí (**informativo**) | resuelve server-side (§6.1) | `v_server_rate` |
| `cost_at_sale` | Sí (ignorado) | WAC bajo `FOR UPDATE` (DF-02 — sin cambio) | `v_wac_prev` |
| `payment_amount` (cash/transfer/zelle) | Sí | valida split vs total (`ERR_PAYMENT_MISMATCH`/PT011); normaliza método | importes servidor |
| `seller_id` | Sí (== actor) | binding a `v_uid` (§4) | `v_uid` |

Invariante global (venta y ajustes): **`total = subtotal − descuento + impuesto`** (misma aritmética en `create_sale_v2` §7–9 y en `update_transaction_taxes` endurecida §11).

Tests que fijan esta matriz: T-FIN-001…012, T-H4-001…005, T-H5-001…004, T-RT-004/005.

---

## 9. C6 — `update_transaction_taxes` (contrato completo)

### 9.1 Decisión: **Opción B — limitarla estrictamente** (patrón `adjust_total_amount`)

**Evidencia que la sostiene:**

1. **Existe un flujo de producto legítimo y vigente**: `TransactionDetailsModal.tsx` expone "Ajuste de Impuestos" (toggle de impuestos sobre una venta) para `user.role ∈ {admin, encargado, manager}` y `!isVoided`. La intención original está documentada desde la creación (`20260228_implement_taxes.sql`: "only managers can update taxes of **confirmed sales**"). Retirar la función (Opción A) eliminaría una capacidad de producto con intención de negocio demostrable.
2. **El patrón canónico de mutación financiera post-venta ya existe y está ratificado**: `adjust_total_amount` (PR-4.4I + PT008) = rol + motivo + recálculo/invariante + auditoría. La Opción B consiste en llevar UTT a esa misma clase de garantías — arquitectura derivada, no inventada.
3. **Estado actual roto**: UTT hoy reescribe `tax_amount`/`applied_taxes` sin recálculo (T-UTT-003), sin scoping de tienda (T-UTT-005), sin estado/motivo (T-UTT-006), y su intento de reescribir `total_amount` choca con el trigger PT008 (T-UTT-004: HTTP 502) — es decir, el flujo UI previsto (recalcular total al cambiar impuesto) **ya está defunct** y la función residual solo conserva capacidad dañina. Endurecer (B) restaura el flujo con garantías; retirar (A) sacrifica la capacidad. La evidencia de intención de negocio (1) decide por B.

### 9.2 Contrato WHO / WHAT / WHEN / WHICH STORE / WHICH FIELDS / HOW / AUDIT / REVERSIBILITY

| Dimensión | Contrato |
|---|---|
| **WHO** | `auth.uid() IS NOT NULL` (si no: `ERR_UNAUTHENTICATED` PT014) Y (`is_admin()` O `has_store_role_as(auth.uid(), v_store_id, ARRAY['admin','manager','encargado'])`). Roles de **membresía en la tienda de la transacción** — no roles globales (cierra T-UTT-005: encargado global de STORE_B sobre tx de STORE_A → `ERR_UNAUTHORIZED`) |
| **WHEN (estados)** | `status IN ('pending','completed')` (= "venta confirmada", intención original + UI `!isVoided`). Cualquier otro estado (`voided`, `cancelled`, `reversed`, `refunded`, `failed`, `compensated`) → `ERR_TRANSACTION_STATE` (cierra T-UTT-006) |
| **WHICH STORE** | `v_store_id` se lee **de la fila de la transacción** (bajo `FOR UPDATE`); la autorización se evalúa contra esa tienda |
| **WHICH FIELDS** | `applied_taxes`, `tax_amount`, `total_amount` — **los tres derivados server-side**. Los parámetros cliente `p_tax_amount`/`p_total_amount` desaparecen de la firma (o se ignoran y auditan como propuesta); nada del cliente se persiste tal cual |
| **HOW CALCULATED** | Misma aritmética canónica que `create_sale_v2`: `base = GREATEST(0, subtotal − discount_value)`; impuestos **validados/reemplazados desde `tax_configurations`** (§5.4 — mismas reglas de catálogo visible para la tienda); `new_tax = Σ(percentage: GREATEST(0, base − min_exempt)·value/100; fixed: value)`; `new_total = subtotal − discount_value + new_tax` |
| **INVARIANTES** | `new_total < SUM(payment_transactions.amount_cup) − 0.01` → `ERR_TOTAL_BELOW_PAYMENTS` (PT002 — mismo límite que `adjust_total_amount`; el pago registrado nunca queda por encima del total). PT008: la función endurecida debe ejecutar como owner `costpro_transaction_adjuster` (la clase de privilegio que PT008 permite) o equivalente, para que `total_amount` sea mutable **solo** por la familia auditada `adjust_*` |
| **MOTIVO** | `p_reason` obligatorio (1..500, `btrim` — misma regla D2/E-SEC-FINAL): vacío → `ERR_REASON_REQUIRED` (PT013), > 500 → `ERR_REASON_INVALID` |
| **AUDIT** | `audit_logs` action `UPDATE_TRANSACTION_TAXES`: `old {tax_amount, applied_taxes, total_amount}` → `new {…}`, `reason`, actor, store, `paid_total_at_time` (extender el INSERT existente — patrón `ADJUST_TOTAL_AMOUNT`) |
| **REVERSIBILITY** | Sin reversión automática: cada corrección es auditada y las correcciones posteriores son posibles. La anulación/revés de la venta sigue siendo exclusiva de los flujos `void/reverse` (nunca por UTT) |

### 9.3 ¿Puede modificar una venta ya cerrada?

```text
SÍ — status='completed' (venta confirmada), con rol autorizado EN ESA tienda
     + motivo + recálculo server-side + invariante PT002 + auditoría completa.
NUNCA — voided / cancelled / reversed / refunded / failed / compensated.
```

Respuesta inequívoca: la corrección tributaria post-cierre es una operación **administrativa auditada**, de la misma clase que `adjust_total_amount` (que hoy modifica totales de ventas cerradas solo como admin). La asimetría actual (UTT permitía encargados globales sin tienda; `adjust_total_amount` exige admin) queda resuelta igualando ambas al mismo estándar de garantías, con UTT permitiendo roles de tienda (manager/encargado) por la intención original documentada.

### 9.4 Firma objetivo (implementación)

```sql
-- DROP FUNCTION public.update_transaction_taxes(uuid, jsonb, numeric, numeric);
CREATE FUNCTION public.update_transaction_taxes(
  p_transaction_id uuid,
  p_applied_taxes  jsonb,   -- propuesta: solo se usan los {id}
  p_reason         text
) RETURNS boolean ...      -- SECURITY DEFINER, owner costpro_transaction_adjuster,
                            -- search_path = public, pg_temp
-- ACL explícito: REVOKE FROM PUBLIC; GRANT TO authenticated, service_role
```

Ruta UI asociada: `TransactionDetailsModal` pasa a enviar `{p_transaction_id, p_applied_taxes (ids), p_reason}`; el recálculo client-side actual queda como **solo-preview**. (Cambio de frontend necesario — parte del alcance del implementador.)

Tests que fijan este contrato: T-UTT-001…008 (C5–C10 + superficies adyacentes).

---

## 10. Superficies colaterales — inventario contractual

| Superficie | Contrato H0-R |
|---|---|
| `create_sale_v2` | §2–§8 (núcleo) |
| `/api/pos/checkout` | Envoltorio canónico service_role: session (401), CSRF, rate-limit 30/min, Zod estricta (`applied_taxes` = array de objetos con `id` uuid — no `z.any()`), **deriva `p_seller_id := session.user.id`** (no reenvía body), `p_user_id := session.user.id`, supervisor-token HMAC (RC-1/D3 sin cambio). Taxes/tasa se resuelven en el RPC |
| `/api/sync/batch` | Gate por operación de tienda ajena (403 — sin cambio); RPC con **token del usuario** (sin cambio); al mapear `sale → create_sale_v2`: `p_seller_id := session.user.id` (el payload encolado es dato de cliente); `p_user_id := session.user.id`; F-21 recepciones sin cambio |
| `update_transaction_taxes` | §9 (Opción B endurecida) |
| `adjust_total_amount` | **Sin cambio** (ya endurecida: admin + motivo + PT002 + auditoría + PT008). Prohibido relajar. Única clase de privilegio mutador de `total_amount` junto a UTT endurecida |
| `tax_configurations` | §5 (fuente única; matriz de roles §5.2; CHECK `value > 0`; histórico intacto) |
| `store_exchange_rates` | Fuente primaria de tasa por tienda; RLS de escritura = `canManageStore` (admin/manager/encargado de la tienda) — alineada con `/api/store-rates`; CHECK `rate > 0` |
| `exchange_rates` | Fuente global (fallback); escritura admin-only con auditoría atómica (DECISION-FX-01 — sin cambio); captura automática service_role |
| `create_sale` (V1) | §11 (retiro PR-R1 + anti-resurrección §12) |
| Reconcilers de ACL | §12 (reescritura obligatoria del patrón F4: REVOKE PUBLIC) |

**Regla de cierre**: "V2 está seguro" **no** se acepta mientras cualquiera de las superficies de esta tabla pueda modificar el mismo resultado financiero sin las mismas garantías. Todas quedan cubiertas por tests H1 (T-TC-*, T-UTT-*, T-ER-*, T-RT-*, T-SB-*).

---

## 11. V1 — Gates de retiro (PR-R1) — confirmados

| Gate | Test | Estado requerido post-PR-R1 |
|---|---|---|
| ACL V1 sin `authenticated` | T-V1-001 | proacl V1 = `{postgres, service_role}` (o función dropeada) |
| Callers V1 = 0 | T-V1-002 / T-AR-001 | `useTransactions.ts` deja de llamar `create_sale` (el queue offline ya replaya V2 vía sync; el path online V1 del hook se elimina) |
| Fallback V1 = 0 | T-V1-003 / T-AR-002 | eliminar `USE_V2_CHECKOUT`, `V2_CHECKOUT_PILOT_STORES`, `shouldUseV2Checkout`, else-branch V1 de `usePOSCheckout.ts`, `.env.example` |
| Tests legacy V1 = 0 | T-V1-004 | ya PASS — mantener |
| Allow-list V2-ONLY vacía | T-V1-005 | `allowedV1Checkout = []` en `v2-only-contract-test.cjs` (hoy permite Y exige `useTransactions`) |
| E2E usa V2 | T-V1-006 | `security.spec.ts` sin flag/V1 |
| Reconcilers no resucitan V1 | T-V1-007 | ninguna migración **post-drop** con GRANT V1 (las 15 históricas pre-drop permanecen inmutables en la historia) |
| V1 removible | T-V1-008 | ya PASS (0 dependientes pg_depend) — mantener |

El DROP de V1 **no** es parte del hardening H1–H6: PR-R1 es un PR separado posterior (orden: hardening V2 → verificación → retiro V1).

---

## 12. Anti-resurrección (contrato permanente)

### 12.1 Estado final prohibido

```text
PUBLIC  EXECUTE ON create_sale_v2 = FORBIDDEN   (live, migraciones, contract-surface, reconciler, seeds, scripts, CI)
anon    EXECUTE ON create_sale_v2 = FORBIDDEN   (idem; anon hereda de PUBLIC — REVOKE FROM PUBLIC es el que cierra)
GRANT EXECUTE ON create_sale (V1)  = FORBIDDEN  (post-drop; 15 migraciones históricas quedan como historia inmutable)
```

### 12.2 Los 6 vectores de resurrección identificados por H1 (censos verificados en esta fase)

| # | Vector | Mecanismo |
|---|---|---|
| 1 | `20260807000003_v2_16_3_create_sale_v2.sql` | CREATE + `REVOKE anon` + grants — **PUBLIC queda del ACL default** |
| 2 | `20260810000003_v2_19_3_invoice_number_fiscal_lock.sql` | `DROP FUNCTION` + CREATE (ACL reset → default PUBLIC) + `REVOKE anon` (insuficiente) |
| 3 | `20260810000070_pr4_4e_timezone_services_document.sql` | idem 2 |
| 4 | `20260916000002_rem_inv_6_reconcile_function_acl.sql` | **GRANT TO PUBLIC explícito** (patrón canónico rem_inv_6) |
| 5 | `20260927000002_f4_create_sale_v2_acl_reconciliation.sql` | **GRANT TO PUBLIC explícito** (reconciler F4 — "patrón canónico" que debe reescribirse) |
| 6 | `20260927000001_esec_final_definitive_policy.sql` | `DROP /21` + `CREATE /24` sin grants → ACL default (PUBLIC) — fue lo que el F4 "reconcilió" canonizando el grant peligroso |

Vector adicional detectado en esta fase (no cubierto por T-AR-006): **`supabase/security-contract/contract-surface.sql`** anota `proacl={=X/postgres, …}` para `create_sale_v2` (línea ~3034) — un replay del contract-surface materializa PUBLIC EXECUTE aunque no exista `GRANT ... TO PUBLIC` literal. El gate debe corregir la anotación (quitar `=X`) o añadir REVOKE explícito.

### 12.3 Requisitos

1. **Reconciler F4 reescrito**: nueva migración reconciler que establezca `REVOKE EXECUTE ... FROM PUBLIC` (+ `FROM anon`) y grants solo `authenticated`/`service_role` — y **corrección de las 6 migraciones ofensoras** (reemplazo del patrón canónico en las que siguen en la cadena activa; las históricas quedan neutralizadas por el reconciler final, que corre al final de la cadena).
2. **contract-surface.sql**: proacl de `create_sale_v2` sin `=X`.
3. **CI (security-gate)**: census automatizado de (a) `GRANT EXECUTE ... TO PUBLIC/anon` sobre V2, (b) patrón `DROP FUNCTION create_sale_v2` seguido de CREATE sin `REVOKE ... FROM PUBLIC`, (c) proacl LIVE (query pg_proc), (d) grants V1 post-drop, (e) contract-surface sin `=X`.
4. **El patrón "canónico" de reconciliación de ACL** queda redefinido para TODA función sensible: el estado certificado es `{postgres, authenticated, service_role}` — nunca `{PUBLIC, …}`.

---

## 13. Nota sobre inventario (ya verificado — sin brechas)

H1 certificó 5/5 (T-INV-001…005): cadena atómica, oversell bloqueado, rollback íntegro, `quantity ≥ 0`, última unidad bajo concurrencia. El hardening H1–H6 **no toca** la mecánica de inventario (advisory-lock + `FOR UPDATE` + `register_stock_movement`); estos tests quedan como regresión protegida y cualquier regresión en ellos bloquea el PR.

---

## 14. NOT-OBSERVABLE — resolución (T-H2-004)

**Propiedad no demostrable en runtime**: la secuencia INTERNA exacta de sentencias dentro de una única llamada (actor→authZ→membresía→idempotencia→validación→cálculo→inventario) en el PostgreSQL administrado de Supabase (sin `auto_explain`/trace por sentencia accesible desde la app).

**¿Instrumentación de test puede hacerla observable?** No sin modificar producción (triggers/observadores en tablas internas distorsionarían el objeto medido). La propiedad se certifica por tres vías complementarias:

1. **Estática** (SQL inspection): `pg_get_functiondef(create_sale_v2)` — offsets de sentencias en orden (`auth` debe preceder a `idempotencia`; hoy es al revés: 2798 < 3242). Gate determinista post-hardening: `position('ERR_UNAUTHORIZED') < position('status'',''idempotent')` dentro del cuerpo.
2. **Conductual** (ya en la suite): T-H1-003/004 (anon+clave existente), T-H2-001/002 (no-miembro+clave existente), T-H6-006/007 (actor cruzado) — cada una demuestra empíricamente qué check corre primero; post-hardening todas deben denegar antes de idempotencia.
3. **Agent 3 review**: revisión del cuerpo final de la función contra §3.1.

Clasificación final: **NOT-OBSERVABLE BY DESIGN** — con certificación estática + conductual + revisión; el contrato de ORDEN (§3.1) es vinculante para el implementador aunque la secuencia exacta no sea instrumentable.

---

## 15. Decisiones de negocio pendientes (sin evidencia — NO inventadas)

### 15.1 Staleness de tasa (T-H5-005) — **BUSINESS DECISION REQUIRED**

Ninguna política de antigüedad existe en el sistema. Opciones para el dueño:

- **(a)** Sin límite de staleness (la fuente manual de tienda es válida hasta cambio manual — diseño documentado; el fallback global usa la última fila disponible).
- **(b)** Límite de N días sobre el fallback `exchange_rates.rate_date` (p.ej. 45) → `ERR_RATE_STALE` fail-closed.
- **(c)** Límite de N días sobre `store_exchange_rates.updated_at` (requiere tratar `updated_at` como fecha de captura).

### 15.2 Banda de desviación cliente↔servidor (T-H5-006) — **BUSINESS DECISION REQUIRED**

La seguridad ya está cerrada sin banda (§6.2: la tasa persistida es siempre la del servidor). La banda decide el tratamiento de propuestas clientiles divergentes:

- **(a)** Sin banda: propuesta aberrante = ignorada silenciosamente (auditoría registra la divergencia).
- **(b)** Banda ±X% (p.ej. ±10%): fuera de banda → rechazo `ERR_RATE_DEVIATION` (UX fail-closed).
- **(c)** Banda ±X%: fuera → warning en auditoría + aceptación con tasa servidor.

### 15.3 Tope superior de impuesto porcentual (TC-C3, "extreme tax") — **BUSINESS DECISION REQUIRED (no bloqueante para los 44 FAIL)**

- **(a)** Sin tope (control = rol autorizado §5.2 + auditoría — análogo a overprice permitido D1).
- **(b)** Tope N% (p.ej. 100%) en `CHECK` — requiere valor del dueño.

Estas tres decisiones son las **únicas** que impiden `READY FOR IMPLEMENTATION`. Todo lo demás de esta especificación es ejecutable sin decisiones adicionales de arquitectura.

---

## 16. VEREDICTO FINAL

# `BLOCKED — BUSINESS DECISION REQUIRED`

**Justificación**: el contrato normativo H1–H6 + colaterales + V1 queda **completamente definido** en este documento (seller binding §4, tax authority §5, tax roles §5.2, exchange-rate authority §6, UTT §9, idempotencia §7, ACL §2, matriz financiera §8, superficies §10, anti-resurrección §12), pero el gate de §15 del mandato exige **staleness definida** y **deviation policy definida**: no existe evidencia en código/migraciones/config/historia para fijarlas (§15.1/§15.2, más el tope opcional §15.3). No se inventaron valores.

**Los 44 FAIL de H1 permanecen intactos como evidencia** (§0.2, §18-matriz): 50 PASS + 48 FAIL — IMPLEMENTATION (44 FAIL originales + 4 ex-BLOCKED ahora con contrato determinista) + 2 BLOCKED — BUSINESS DECISION + 1 NOT-OBSERVABLE BY DESIGN = 101.

**Para desbloquear**: el dueño responde §15.1/§15.2 (y opcionalmente §15.3) → se emenda este documento (sección única, sin cambios arquitectónicos) → veredicto `READY FOR IMPLEMENTATION` → el Implementation Agent ejecuta §17 y QA re-ejecuta `node scripts/qa-h1/run-all.cjs`.

---

## 17. Requisitos de implementación (orden sugerido para el Implementation Agent)

> Ningún paso requiere decisiones de arquitectura: todo está contratado arriba. Los pasos marcados ⛔ dependen de §15.

1. **RPC `create_sale_v2`** (una migración): reorden §3.1 (auth→seller→idempotencia), binding seller §4, validación/reemplazo de impuestos §5.4, resolución de tasa §6.1, idempotencia con param_hash §7, `ERR_INVALID_DISCOUNT` (descuento negativo) §8, auditoría ampliada (client_rate/server_rate/rate_source, hash). Sin cambio de firma /24.
2. **ACL** (misma migración): `REVOKE EXECUTE ON create_sale_v2 FROM PUBLIC, anon` + grants explícitos `authenticated`/`service_role`; reescritura del reconciler F4 (§12.3) y corrección de contract-surface.
3. **`tax_configurations`**: policies SELECT/ALL por roles §5.2 + `CHECK (value > 0)`; `store_exchange_rates`: policy alineada a `canManageStore` + `CHECK (rate > 0)`.
4. **`update_transaction_taxes`**: DROP+CREATE con firma /3 (p_reason) + contrato §9.2 completo (owner `costpro_transaction_adjuster`, PT008/PT002, auditoría).
5. **Rutas**: `/api/pos/checkout` (derivar seller; Zod applied_taxes estricto), `/api/sync/batch` (seller := session).
6. **Frontend**: `TransactionDetailsModal` (enviar ids + reason; preview-only), `usePOSCheckout`/`useSalesCatalog` (mantener seller=user.id — ya comply; opcional: eliminar constantes 680 hardcodeadas en favor de la tasa servidor).
7. ⛔ **Staleness / banda / tope** (§15): solo tras decisión del dueño.
8. **PR-R1 (separado)**: retiro V1 con los 8 gates §11 + anti-resurrección §12.
9. **QA**: re-ejecutar `scripts/qa-h1/run-all.cjs` — esperado: 50 PASS intactos + 48 FAIL → PASS (salvo los 2 ⛔ y el NOT-OBSERVABLE por diseño) + verificación estática §14.

---

## 18. Matriz final (101 tests)

Generada desde `audit-evidence/FASE-H1/results/*.json` (evidencia H1 intacta) contra el contrato H0-R. Clasificaciones: `PASS` (regresión protegida) · `FAIL — IMPLEMENTATION` (expected confirmado; el hardening lo convierte en PASS) · `BLOCKED — BUSINESS DECISION` (§15) · `NOT-OBSERVABLE BY DESIGN` (§14).

| # | TEST ID | Contrato H0-R | EXPECTED (contrato) | CURRENT (evidencia H1) | Requisito de implementación | Clasificación |
|---|---------|----------------|----------------------|------------------------|------------------------------|---------------|
| 1 | `T-H1-001` | H0-R §2 (ACL) + §3 (orden) | DENIED (HTTP >= 400, sin transaction_id, sin divulgación de existencia de transacción/clave/tienda/usuario) | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_UNAUTHORIZED"} | REVOKE EXECUTE FROM PUBLIC/anon (LIVE + 6 migraciones + contract-surface + reconciler) y reordenar auth→idempotencia | PASS |
| 2 | `T-H1-002` | H0-R §2 (ACL) + §3 (orden) | proacl NO contiene =X (PUBLIC) ni anon=X | ACL LIVE = {=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} | REVOKE EXECUTE FROM PUBLIC/anon (LIVE + 6 migraciones + contract-surface + reconciler) y reordenar auth→idempotencia | FAIL — IMPLEMENTATION |
| 3 | `T-H1-003` | H0-R §2 (ACL) + §3 (orden) | HTTP >= 400 sin transaction_id, sin status idempotent/success | anon + clave existente → HTTP 200 {"status":"idempotent","transaction_id":"2423a83b-81d7-43c9-89a0-c1a91e744164"} | REVOKE EXECUTE FROM PUBLIC/anon (LIVE + 6 migraciones + contract-surface + reconciler) y reordenar auth→idempotencia | FAIL — IMPLEMENTATION |
| 4 | `T-H1-004` | H0-R §2 (ACL) + §3 (orden) | misma forma de rechazo (status + body) para clave existente y aleatoria | existing → HTTP 200 {"status":"idempotent","transaction_id":"2423a83b-81d7-43c9-89a0-c1a91e744164"} \|\| random → HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_UNAUTHORIZED"} | REVOKE EXECUTE FROM PUBLIC/anon (LIVE + 6 migraciones + contract-surface + reconciler) y reordenar auth→idempotencia | FAIL — IMPLEMENTATION |
| 5 | `T-H2-001` | H0-R §3 (orden de ejecución) | ERR_UNAUTHORIZED (HTTP >= 400) SIN transaction_id — la clave no puede satisfacerse antes de autorizar | USER_B (sin membresía STORE_A) + clave existente → HTTP 200 {"status":"idempotent","transaction_id":"e2e738d4-e8db-4e29-ba2b-cf492d0990ba"} | auth→authZ→idempotencia dentro del RPC; denegación uniforme sin oráculo | FAIL — IMPLEMENTATION |
| 6 | `T-H2-002` | H0-R §3 (orden de ejecución) | HTTP >= 400 ERR_UNAUTHORIZED sin datos | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_UNAUTHORIZED"} | auth→authZ→idempotencia dentro del RPC; denegación uniforme sin oráculo | PASS |
| 7 | `T-H2-003` | H0-R §3 (orden de ejecución) | 0 transacciones nuevas creadas por llamadas denegadas | transacciones antes=118 después=118 (delta=0) | auth→authZ→idempotencia dentro del RPC; denegación uniforme sin oráculo | PASS |
| 8 | `T-H2-004` | H0-R §3 (orden de ejecución) | transacción + items + pago + movimiento de stock presentes y consistentes; orden interno exacto no observable | tx=true items=1 pagos~115 movimientos=1 | auth→authZ→idempotencia dentro del RPC; denegación uniforme sin oráculo | NOT-OBSERVABLE BY DESIGN |
| 9 | `T-H3-001` | H0-R §4 (seller binding) | HTTP 200 y transactions.seller_id == USER_A | seller_id persistido = 6eb29691-d253-4e03-b593-2b0cdd1415bc | binding p_seller_id == actor resuelto (ERR_SELLER_REQUIRED / ERR_SELLER_MISMATCH) en RPC + rutas | PASS |
| 10 | `T-H3-002` | H0-R §4 (seller binding) | DENIED o derivación inequívoca a USER_A; NUNCA seller=USER_B | venta ACEPTADA con seller_id persistido = 8b04b1a9-80c3-444e-952b-6b0256155d65 | binding p_seller_id == actor resuelto (ERR_SELLER_REQUIRED / ERR_SELLER_MISMATCH) en RPC + rutas | FAIL — IMPLEMENTATION |
| 11 | `T-H3-003` | H0-R §4 (seller binding) | DENIED; nunca seller de otra tienda | ACEPTADA con seller_id=8b04b1a9-80c3-444e-952b-6b0256155d65 (miembro de STORE_B) | binding p_seller_id == actor resuelto (ERR_SELLER_REQUIRED / ERR_SELLER_MISMATCH) en RPC + rutas | FAIL — IMPLEMENTATION |
| 12 | `T-H3-004` | H0-R §4 (seller binding) | CONTRATO H0: rechazar O derivar server-side del actor — H0 NO PRODUCIDO | probe actual: HTTP 400 → seller_id=n/a | binding p_seller_id == actor resuelto (ERR_SELLER_REQUIRED / ERR_SELLER_MISMATCH) en RPC + rutas | FAIL — IMPLEMENTATION |
| 13 | `T-H3-005` | H0-R §4 (seller binding) | v_uid = auth.uid() (USER_A): la venta se evalúa contra USER_A, no contra p_user_id | authenticated + p_user_id=USER_B → HTTP 200 {"status":"success","calculated_tax":0,"transaction_id":"5dc9e8ec-dd2e-470f-9134-19f4a06286a0","discount_amount":0,"calculated_total":100,"calculated_subtotal":100} | binding p_seller_id == actor resuelto (ERR_SELLER_REQUIRED / ERR_SELLER_MISMATCH) en RPC + rutas | PASS |
| 14 | `T-H3-006` | H0-R §4 (seller binding) | solo /api/pos/checkout (server route) y ningún path cliente expone service_role al usuario | checkout admin-client+p_user_id(session)=true · sync user-token=true | binding p_seller_id == actor resuelto (ERR_SELLER_REQUIRED / ERR_SELLER_MISMATCH) en RPC + rutas | PASS |
| 15 | `T-H4-001` | H0-R §5 (autoridad tributaria) | DENIED — el impuesto negativo no puede convertirse en descuento implícito | ACEPTADA: tax_amount=-30 total=70.00 | validar/reemplazar applied_taxes desde tax_configurations; recálculo server; rechazar value<=0 | FAIL — IMPLEMENTATION |
| 16 | `T-H4-002` | H0-R §5 (autoridad tributaria) | DENIED — porcentaje negativo invalida la base impositiva | ACEPTADA: tax_amount=-10.0000000000000000 | validar/reemplazar applied_taxes desde tax_configurations; recálculo server; rechazar value<=0 | FAIL — IMPLEMENTATION |
| 17 | `T-H4-003` | H0-R §5 (autoridad tributaria) | el impuesto efectivo debe derivarse server-side de la configuración autorizada (tax_configurations) — no del payload | 0%→HTTP 200 tax=0 · 100%→HTTP 200 tax=100.0000000000000000 · 10000%→HTTP 200 tax=10000.0000000000000000 | validar/reemplazar applied_taxes desde tax_configurations; recálculo server; rechazar value<=0 | FAIL — IMPLEMENTATION |
| 18 | `T-H4-004` | H0-R §5 (autoridad tributaria) | SUPERVISOR POLICY STILL APPLIES — ninguna vía reduce el total bajo umbral sin autorización | ACEPTADA sin supervisor: total=70 sobre subtotal=100 (−30%) | validar/reemplazar applied_taxes desde tax_configurations; recálculo server; rechazar value<=0 | FAIL — IMPLEMENTATION |
| 19 | `T-H4-005` | H0-R §5 (autoridad tributaria) | pg_get_functiondef LIVE referencia tax_configurations como fuente autorizada | referencias a tax_configurations en LIVE def: false | validar/reemplazar applied_taxes desde tax_configurations; recálculo server; rechazar value<=0 | FAIL — IMPLEMENTATION |
| 20 | `T-H5-001` | H0-R §6 (autoridad de tasa) | la tasa efectiva persistida proviene de la fuente server-side autorizada, no del payload | rate=680→aceptada stored=680 · rate=1000000→aceptada stored=1000000 · rate=0→aceptada stored=0 · rate=-5→aceptada stored=-5 | resolver tasa server-side (store_exchange_rates → exchange_rates BCC seg3 → elToque); cliente informativo | FAIL — IMPLEMENTATION |
| 21 | `T-H5-002` | H0-R §6 (autoridad de tasa) | transactions.sale_exchange_rate == server_rate (store_exchange_rates de STORE_A = 400) | server_rate=400 (store_exchange_rates) · client_rate=7 · persisted=7 | resolver tasa server-side (store_exchange_rates → exchange_rates BCC seg3 → elToque); cliente informativo | FAIL — IMPLEMENTATION |
| 22 | `T-H5-003` | H0-R §6 (autoridad de tasa) | el RPC resuelve la tasa con esa jerarquía server-side | refs LIVE: store_exchange_rates=false · exchange_rates=false | resolver tasa server-side (store_exchange_rates → exchange_rates BCC seg3 → elToque); cliente informativo | FAIL — IMPLEMENTATION |
| 23 | `T-H5-004` | H0-R §6 (autoridad de tasa) | USER_A (clerk) NO puede UPDATE store_exchange_rates ni INSERT/UPDATE exchange_rates | store_exchange_rates(own) PATCH → 204 · exchange_rates INSERT → 403 | resolver tasa server-side (store_exchange_rates → exchange_rates BCC seg3 → elToque); cliente informativo | FAIL — IMPLEMENTATION |
| 24 | `T-H5-005` | H0-R §6 (autoridad de tasa) | CONTRATO H0: límite de staleness — H0 NO PRODUCIDO | columnas store_exchange_rates: id, store_id, currency, rate, updated_by, created_at, updated_at | resolver tasa server-side (store_exchange_rates → exchange_rates BCC seg3 → elToque); cliente informativo | BLOCKED — BUSINESS DECISION |
| 25 | `T-H5-006` | H0-R §6 (autoridad de tasa) | CONTRATO H0: banda dentro/fuera — H0 NO PRODUCIDO | sin banda implementada: cualquier tasa cliente se acepta (ver T-H5-001) | resolver tasa server-side (store_exchange_rates → exchange_rates BCC seg3 → elToque); cliente informativo | BLOCKED — BUSINESS DECISION |
| 26 | `T-H6-001` | H0-R §7 (idempotencia) | segunda llamada retorna la MISMA transaction_id; 1 fila en transactions | retry → HTTP 200 {"status":"idempotent","transaction_id":"efb15730-f3bd-4e33-8454-b44ecb28aff1"} · filas=1 | identidad (clave, actor, tienda, param_hash) + ERR_IDEMPOTENCY_KEY_REUSE; registro idempotencia V2.26 | PASS |
| 27 | `T-H6-002` | H0-R §7 (idempotencia) | exactly 1 transaction, 1 set items, 1 pago, 1 movimiento de stock | tx=1 items=1 pagos=1 movimientos=1 | identidad (clave, actor, tienda, param_hash) + ERR_IDEMPOTENCY_KEY_REUSE; registro idempotencia V2.26 | PASS |
| 28 | `T-H6-003` | H0-R §7 (idempotencia) | respuesta de conflicto (no retorno silencioso de la transacción previa) | payload distinto (qty=2) con misma clave → HTTP 200 {"status":"idempotent","transaction_id":"efb15730-f3bd-4e33-8454-b44ecb28aff1"} | identidad (clave, actor, tienda, param_hash) + ERR_IDEMPOTENCY_KEY_REUSE; registro idempotencia V2.26 | FAIL — IMPLEMENTATION |
| 29 | `T-H6-004` | H0-R §7 (idempotencia) | respuesta de conflicto | precio distinto con misma clave → HTTP 200 {"status":"idempotent","transaction_id":"efb15730-f3bd-4e33-8454-b44ecb28aff1"} | identidad (clave, actor, tienda, param_hash) + ERR_IDEMPOTENCY_KEY_REUSE; registro idempotencia V2.26 | FAIL — IMPLEMENTATION |
| 30 | `T-H6-005` | H0-R §7 (idempotencia) | deny o conflict (la clave NO puede reutilizarse en otra tienda) | USER_A + clave existente + STORE_B → HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_UNAUTHORIZED"} | identidad (clave, actor, tienda, param_hash) + ERR_IDEMPOTENCY_KEY_REUSE; registro idempotencia V2.26 | PASS |
| 31 | `T-H6-006` | H0-R §7 (idempotencia) | USER_B con clave de USER_A → deny/conflict, SIN transaction_id de la venta ajena | USER_B + clave de USER_A (STORE_A) → HTTP 200 {"status":"idempotent","transaction_id":"efb15730-f3bd-4e33-8454-b44ecb28aff1"} | identidad (clave, actor, tienda, param_hash) + ERR_IDEMPOTENCY_KEY_REUSE; registro idempotencia V2.26 | FAIL — IMPLEMENTATION |
| 32 | `T-H6-007` | H0-R §7 (idempotencia) | HTTP >= 401/403 sin transaction_id | HTTP 200 {"status":"idempotent","transaction_id":"efb15730-f3bd-4e33-8454-b44ecb28aff1"} | identidad (clave, actor, tienda, param_hash) + ERR_IDEMPOTENCY_KEY_REUSE; registro idempotencia V2.26 | FAIL — IMPLEMENTATION |
| 33 | `T-H6-008` | H0-R §7 (idempotencia) | HTTP >= 400 sin datos | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_UNAUTHORIZED"} | identidad (clave, actor, tienda, param_hash) + ERR_IDEMPOTENCY_KEY_REUSE; registro idempotencia V2.26 | PASS |
| 34 | `T-H6-009` | H0-R §7 (idempotencia) | EXACTLY 1 transacción · 0 duplicados de inventario/pago/movimiento | tx=1 movimientos=1 pagos=1 idsDistintos=1 | identidad (clave, actor, tienda, param_hash) + ERR_IDEMPOTENCY_KEY_REUSE; registro idempotencia V2.26 | PASS |
| 35 | `T-FIN-001` | H0-R §8 (integridad financiera) | ERR_SUPERVISOR_REQUIRED (gate de desvío ≥15%) | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_SUPERVISOR_REQUIRED: global_pct=0.00000000000000000000, max_line_pct=50.00000000000000000000"} | rechazar descuento negativo; tax/tasa server-side (§5/§6) | PASS |
| 36 | `T-FIN-002` | H0-R §8 (integridad financiera) | venta autorizada persistida con snapshot de precio | price_at_sale=50.00 | rechazar descuento negativo; tax/tasa server-side (§5/§6) | PASS |
| 37 | `T-FIN-003` | H0-R §8 (integridad financiera) | política documentada E-SEC-FINAL D1: desvío evalúa SOLO precio<catálogo; overprice permitido sin gate (decisión funcional vigente) — anotado para revisión H0 | ACEPTADA sin supervisor (política D1 vigente) | rechazar descuento negativo; tax/tasa server-side (§5/§6) | PASS |
| 38 | `T-FIN-004` | H0-R §8 (integridad financiera) | transactions.subtotal == 100 (valor servidor), no el del cliente | subtotal persistido=100.00 | rechazar descuento negativo; tax/tasa server-side (§5/§6) | PASS |
| 39 | `T-FIN-005` | H0-R §8 (integridad financiera) | ERR_TOTAL_MISMATCH | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_TOTAL_MISMATCH: calculated=100.00, client=50"} | rechazar descuento negativo; tax/tasa server-side (§5/§6) | PASS |
| 40 | `T-FIN-006` | H0-R §8 (integridad financiera) | el impuesto persistido deriva de fuente autorizada — hoy: del JSONB cliente (referencia T-H4-003) | tax_amount cliente=999 → persistido=10 (derivó del JSONB cliente con value=10) | rechazar descuento negativo; tax/tasa server-side (§5/§6) | FAIL — IMPLEMENTATION |
| 41 | `T-FIN-007` | H0-R §8 (integridad financiera) | DENIED — descuento no puede ser negativo ni esquivar el gate | ACEPTADA: subtotal=100.00 descuento=-100 total=200.00 | rechazar descuento negativo; tax/tasa server-side (§5/§6) | FAIL — IMPLEMENTATION |
| 42 | `T-FIN-008` | H0-R §8 (integridad financiera) | capped a subtotal y gate de supervisor (100% descuento exige autorización) | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_SUPERVISOR_REQUIRED: global_pct=100.00000000000000000000, max_line_pct=0"} | rechazar descuento negativo; tax/tasa server-side (§5/§6) | PASS |
| 43 | `T-FIN-009` | H0-R §8 (integridad financiera) | tasa server-side — hoy el cliente la impone (FAIL vía H5) | rate persistida=1000000.0000 · price_at_sale_cup=100000000.00 | rechazar descuento negativo; tax/tasa server-side (§5/§6) | FAIL — IMPLEMENTATION |
| 44 | `T-FIN-010` | H0-R §8 (integridad financiera) | transaction_items.cost_at_sale == WAC del producto (50) | cost_at_sale persistido=50 (cliente envió 999) | rechazar descuento negativo; tax/tasa server-side (§5/§6) | PASS |
| 45 | `T-FIN-011` | H0-R §8 (integridad financiera) | ERR_PAYMENT_MISMATCH | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_PAYMENT_MISMATCH: cash=40, transfer=40, zelle=0, total=100.00"} | rechazar descuento negativo; tax/tasa server-side (§5/§6) | PASS |
| 46 | `T-FIN-012` | H0-R §8 (integridad financiera) | cash_amount persistido == total server (100) | cash_amount persistido=100.00 | rechazar descuento negativo; tax/tasa server-side (§5/§6) | PASS |
| 47 | `T-CS-001` | H0-R §2/§4/§7 (aislamiento cross-store) | HTTP 200 con transacción creada | HTTP 200 {"status":"success","calculated_tax":0,"transaction_id":"dd86b0db-7f0c-4963-9814-947ed1f6f8b7","discount_amount":0,"calculated_total":100,"calculated_subtotal":100} | seller binding + idempotencia con actor/tienda en identidad | PASS |
| 48 | `T-CS-002` | H0-R §2/§4/§7 (aislamiento cross-store) | DENIED (ERR_UNAUTHORIZED) | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_UNAUTHORIZED"} | seller binding + idempotencia con actor/tienda en identidad | PASS |
| 49 | `T-CS-003` | H0-R §2/§4/§7 (aislamiento cross-store) | DENIED (referencia T-H3-003) | ACEPTADA con seller_id=8b04b1a9-80c3-444e-952b-6b0256155d65 | seller binding + idempotencia con actor/tienda en identidad | FAIL — IMPLEMENTATION |
| 50 | `T-CS-004` | H0-R §2/§4/§7 (aislamiento cross-store) | DENIED — producto ajeno a la tienda no puede venderse | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_STORE_MISMATCH: movement store_id a5b81cbf-8ffc-4525-8ac4-f2ec92b912d2 no coincide con product store_id b9cfacda-3731-47a2-8588-f524c6ec3456 p | seller binding + idempotencia con actor/tienda en identidad | PASS |
| 51 | `T-CS-005` | H0-R §2/§4/§7 (aislamiento cross-store) | DENY/CONFLICT sin revelar la transacción ajena | USER_A + clave de USER_B → HTTP 200 {"status":"idempotent","transaction_id":"029f92b5-d8d3-4c81-b171-3ed44ef55e5a"} | seller binding + idempotencia con actor/tienda en identidad | FAIL — IMPLEMENTATION |
| 52 | `T-CS-006` | H0-R §2/§4/§7 (aislamiento cross-store) | DENIED por RLS (0 filas afectadas) | PATCH → 204 · total sigue=200.00 | seller binding + idempotencia con actor/tienda en identidad | PASS |
| 53 | `T-CS-007` | H0-R §2/§4/§7 (aislamiento cross-store) | 0 filas visibles (RLS SELECT) | GET → 200 filas=0 | seller binding + idempotencia con actor/tienda en identidad | PASS |
| 54 | `T-INV-001` | H0-R §13 (inventario — sin cambios) | transacción, items, movimiento y decremento consistentes | delta_inventory=2 movimientos=1 items=1 | sin cambios (5/5 PASS — proteger como regresión) | PASS |
| 55 | `T-INV-002` | H0-R §13 (inventario — sin cambios) | ERR_INSUFFICIENT_STOCK y 0 escrituras | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_INSUFFICIENT_STOCK: product ea4c1d7b-f827-43b1-9a88-8197171a2dda, stock 969.0000, requested 999999"} · inventario 969.0000→969.0000 | sin cambios (5/5 PASS — proteger como regresión) | PASS |
| 56 | `T-INV-003` | H0-R §13 (inventario — sin cambios) | exactamente 1 éxito · 1 rechazo · inventario >= 0 · sin duplicar movimiento | transacciones=1 idsDistintos=1 movimientos=1 inventario_final=0 · resp200=2 | sin cambios (5/5 PASS — proteger como regresión) | PASS |
| 57 | `T-INV-004` | H0-R §13 (inventario — sin cambios) | sin transacción, sin movimientos, inventario intacto | HTTP 400 {"code":"P0001","details":null,"hint":null,"message":"ERR_INSUFFICIENT_STOCK: product afe22111-1b8e-4b1f-a52d-97bd31044c39, stock 0.0000, requested 999"} · inventario 969.0000→969.0000 · movimientosHuérfanos=0 | sin cambios (5/5 PASS — proteger como regresión) | PASS |
| 58 | `T-INV-005` | H0-R §13 (inventario — sin cambios) | todas las cantidades QA >= 0 | filas=3 negativas=0 | sin cambios (5/5 PASS — proteger como regresión) | PASS |
| 59 | `T-TC-001` | H0-R §5 (tax_configurations) + §10 | CONTRATO H0 (matriz rol→operación) — H0 NO PRODUCIDO | policy única: Tax unified[ALL] roles={authenticated} USING=has_store_access(store_id) | RLS por roles (admin/manager/encargado per-store; admin global) + CHECK value>0 | FAIL — IMPLEMENTATION |
| 60 | `T-TC-002` | H0-R §5 (tax_configurations) + §10 | DENIED — INSERT de tax_configurations por clerk rechazado | INSERT clerk → 201 null | RLS por roles (admin/manager/encargado per-store; admin global) + CHECK value>0 | FAIL — IMPLEMENTATION |
| 61 | `T-TC-003` | H0-R §5 (tax_configurations) + §10 | constraint/policy rechaza value negativo (y rango inválido según H0) | check constraints: CHECK ((type = ANY (ARRAY['fixed'::text, 'percentage'::text]))) | RLS por roles (admin/manager/encargado per-store; admin global) + CHECK value>0 | FAIL — IMPLEMENTATION |
| 62 | `T-TC-004` | H0-R §5 (tax_configurations) + §10 | transactions.applied_taxes/tax_amount de ventas previas permanecen intactas | ventas=147→147 sumTax=40570.0000000000000000→40570.0000000000000000 | RLS por roles (admin/manager/encargado per-store; admin global) + CHECK value>0 | PASS |
| 63 | `T-TC-005` | H0-R §5 (tax_configurations) + §10 | DENIED (has_store_access falla para no-miembro) | INSERT USER_B sobre STORE_A → 403 | RLS por roles (admin/manager/encargado per-store; admin global) + CHECK value>0 | PASS |
| 64 | `T-UTT-001` | H0-R §9 (update_transaction_taxes) + §10 | CONTRATO H0 de autorización exacta — H0 NO PRODUCIDO (FAIL SPEC COVERAGE) | ACL={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} · cuerpo: is_admin() OR has_role('manager') OR has_role('encargado') — roles GLOBALES | endurecer UTT: rol+tienda+estado+motivo+recálculo+PT002+audit (§11) | FAIL — IMPLEMENTATION |
| 65 | `T-UTT-002` | H0-R §9 (update_transaction_taxes) + §10 | DENIED para USER_A (clerk) | clerk → HTTP 400 [object Object] | endurecer UTT: rol+tienda+estado+motivo+recálculo+PT002+audit (§11) | PASS |
| 66 | `T-UTT-003` | H0-R §9 (update_transaction_taxes) + §10 | los campos tributarios persistidos deben derivarse server-side con invariante total=subtotal−desc+tax | ACEPTADA: tax_amount=777 applied=[{"type":"percentage","value":999}] con subtotal=200.00 total=200 (invariante rota: 200≠200−0+777) | endurecer UTT: rol+tienda+estado+motivo+recálculo+PT002+audit (§11) | FAIL — IMPLEMENTATION |
| 67 | `T-UTT-004` | H0-R §9 (update_transaction_taxes) + §10 | el total NO puede reescribirse por esta vía (política de supervisor intacta) | intento total 200→5 → HTTP 502 · total persistido=200 | endurecer UTT: rol+tienda+estado+motivo+recálculo+PT002+audit (§11) | PASS |
| 68 | `T-UTT-005` | H0-R §9 (update_transaction_taxes) + §10 | DENIED — scoping de tienda obligatorio | ACEPTADA: transacción de STORE_A (a5b81cbf-8ffc-4525-8ac4-f2ec92b912d2) con tax_amount=55 escrito por encargado GLOBAL de STORE_B | endurecer UTT: rol+tienda+estado+motivo+recálculo+PT002+audit (§11) | FAIL — IMPLEMENTATION |
| 69 | `T-UTT-006` | H0-R §9 (update_transaction_taxes) + §10 | CONTRATO H0 de estados/justificación — H0 NO PRODUCIDO (FAIL SPEC COVERAGE) | tx status=completed (completed) modificada en C7 · la función no consulta status ni exige motivo | endurecer UTT: rol+tienda+estado+motivo+recálculo+PT002+audit (§11) | FAIL — IMPLEMENTATION |
| 70 | `T-UTT-007` | H0-R §9 (update_transaction_taxes) + §10 | ERR_UNAUTHORIZED para no-admin | clerk → HTTP 403 [object Object] | endurecer UTT: rol+tienda+estado+motivo+recálculo+PT002+audit (§11) | PASS |
| 71 | `T-UTT-008` | H0-R §9 (update_transaction_taxes) + §10 | ERR_UNAUTHORIZED (solo admin global) — contraste con update_transaction_taxes que SÍ lo permite | encargado global → HTTP 403 [object Object] | endurecer UTT: rol+tienda+estado+motivo+recálculo+PT002+audit (§11) | PASS |
| 72 | `T-ER-001` | H0-R §6 (fuentes de tasa) + §10 | DENIED — la fuente server-side de tasas no es escribible por clerk | PATCH store_exchange_rates por clerk → 204 | ajustar RLS store_exchange_rates al gate canManageStore; CHECK rate>0 | FAIL — IMPLEMENTATION |
| 73 | `T-ER-002` | H0-R §6 (fuentes de tasa) + §10 | DENIED | PATCH cross-store → 204 | ajustar RLS store_exchange_rates al gate canManageStore; CHECK rate>0 | FAIL — IMPLEMENTATION |
| 74 | `T-ER-003` | H0-R §6 (fuentes de tasa) + §10 | DENIED (policy service_role-only para INSERT/UPDATE) | INSERT exchange_rates → 403 {"code":"42501","details":null,"hint":null,"message":"new row violates row-level security policy for | ajustar RLS store_exchange_rates al gate canManageStore; CHECK rate>0 | PASS |
| 75 | `T-ER-004` | H0-R §6 (fuentes de tasa) + §10 | DENIED ambos | read global→200 read store→200 write→401 | ajustar RLS store_exchange_rates al gate canManageStore; CHECK rate>0 | PASS |
| 76 | `T-RT-001` | H0-R §10 (ruta checkout) | HTTP 401 | HTTP 401 {"error":"No autorizado","message":"Se requiere sesión activa"} | derivar seller de la sesión; taxes/tasa resueltos en RPC; validar schema applied_taxes | PASS |
| 77 | `T-RT-002` | H0-R §10 (ruta checkout) | HTTP 200, transaction_id presente, seller_id persistido = USER_A | tx=010d6b93-5d79-4c74-984a-57556ae7b455 seller=6eb29691-d253-4e03-b593-2b0cdd1415bc | derivar seller de la sesión; taxes/tasa resueltos en RPC; validar schema applied_taxes | PASS |
| 78 | `T-RT-003` | H0-R §10 (ruta checkout) | la ruta DERIVA el vendedor del servidor (session) o rechaza; jamás persiste seller=USER_B | ACEPTADA con seller persistido=8b04b1a9-80c3-444e-952b-6b0256155d65 | derivar seller de la sesión; taxes/tasa resueltos en RPC; validar schema applied_taxes | FAIL — IMPLEMENTATION |
| 79 | `T-RT-004` | H0-R §10 (ruta checkout) | applied_taxes del body no puede ser la fuente del impuesto persistido | ACEPTADA: tax_amount persistido=100.0000000000000000 (100% del cliente) | derivar seller de la sesión; taxes/tasa resueltos en RPC; validar schema applied_taxes | FAIL — IMPLEMENTATION |
| 80 | `T-RT-005` | H0-R §10 (ruta checkout) | sale_exchange_rate del body no puede fijar la tasa efectiva | ACEPTADA: rate persistida=1000000.0000 | derivar seller de la sesión; taxes/tasa resueltos en RPC; validar schema applied_taxes | FAIL — IMPLEMENTATION |
| 81 | `T-RT-006` | H0-R §10 (ruta checkout) | route.ts invoca rpc("create_sale_v2") y no existe llamada a create_sale V1 | v2=true v1=false | derivar seller de la sesión; taxes/tasa resueltos en RPC; validar schema applied_taxes | PASS |
| 82 | `T-RT-007` | H0-R §10 (ruta checkout) | p_user_id SIEMPRE session.user.id; el body no puede inyectarlo | static bind=true · body p_user_id ignorado=true | derivar seller de la sesión; taxes/tasa resueltos en RPC; validar schema applied_taxes | PASS |
| 83 | `T-SB-001` | H0-R §10 (ruta sync) | HTTP 401 | HTTP 401 | reemplazar p_seller_id encolado por session.user.id (defensa en profundidad) | PASS |
| 84 | `T-SB-002` | H0-R §10 (ruta sync) | HTTP 403 STORE_ACCESS_DENIED (gate por operación) | HTTP 403 {"error":"Sin acceso a la tienda especificada","key":"apiErrors.storeAccessDenied","operationKey":"4bafb242-6914-4c54-8a | reemplazar p_seller_id encolado por session.user.id (defensa en profundidad) | PASS |
| 85 | `T-SB-003` | H0-R §10 (ruta sync) | route.ts mapea entity=sale → create_sale_v2 sin fallback V1 | v2=true v1=false | reemplazar p_seller_id encolado por session.user.id (defensa en profundidad) | PASS |
| 86 | `T-SB-004` | H0-R §10 (ruta sync) | getSupabaseAuthClient(session.token); sin getSupabaseAdminSafe | userToken=true admin=false | reemplazar p_seller_id encolado por session.user.id (defensa en profundidad) | PASS |
| 87 | `T-SB-005` | H0-R §10 (ruta sync) | la venta offline no puede atribuirse a otro vendedor (binding server-side) | HTTP 200 · spoofed=752ec53e-a63f-4fec-8164-4221de995529 · log={"results":[{"idempotencyKey":"6a511a45-311d-42f9-a9da-ff932efc93c9","status":"ok","serverId":{"status":"success","calculated_tax":0,"transa | reemplazar p_seller_id encolado por session.user.id (defensa en profundidad) | FAIL — IMPLEMENTATION |
| 88 | `T-V1-001` | H0-R §11 (gates retiro V1) | proacl de create_sale sin authenticated=X ni anon=X ni PUBLIC | ACL LIVE V1 = {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} | PR-R1: DROP V1 + retirar flag/pilot/else-branch + allow-list vacía + E2E V2 | FAIL — IMPLEMENTATION |
| 89 | `T-V1-002` | H0-R §11 (gates retiro V1) | 0 referencias ejecutables a rpc create_sale / rpcName=create_sale en src (excluye tests) | callers=1: src/hooks/api/useTransactions.ts | PR-R1: DROP V1 + retirar flag/pilot/else-branch + allow-list vacía + E2E V2 | FAIL — IMPLEMENTATION |
| 90 | `T-V1-003` | H0-R §11 (gates retiro V1) | ni features.ts ni hooks conservan el camino V1 (flag, else-branch, pilot stores) | refs=src/config/features.ts (flag) · usePOSCheckout.ts (path v1) | PR-R1: DROP V1 + retirar flag/pilot/else-branch + allow-list vacía + E2E V2 | FAIL — IMPLEMENTATION |
| 91 | `T-V1-004` | H0-R §11 (gates retiro V1) | ningún test de integración/unidad depende de create_sale V1 | tests legacy=0:  | PR-R1: DROP V1 + retirar flag/pilot/else-branch + allow-list vacía + E2E V2 | PASS |
| 92 | `T-V1-005` | H0-R §11 (gates retiro V1) | v2-only-contract-test.cjs con allow-list VACÍA (allowedV1Checkout = []) | allow-list con useTransactions=true · exige presencia V1=true | PR-R1: DROP V1 + retirar flag/pilot/else-branch + allow-list vacía + E2E V2 | FAIL — IMPLEMENTATION |
| 93 | `T-V1-006` | H0-R §11 (gates retiro V1) | specs E2E de venta no dependen de V1 ni del flag | specs con dependencia V1/flag=1: security.spec.ts | PR-R1: DROP V1 + retirar flag/pilot/else-branch + allow-list vacía + E2E V2 | FAIL — IMPLEMENTATION |
| 94 | `T-V1-007` | H0-R §11 (gates retiro V1) | ningún archivo post-retiro hace GRANT EXECUTE sobre create_sale (V1) | migraciones con GRANT V1=15: 20260114_create_sale_rpc.sql, 20260304_harden_sale_stock_logic.sql, 20260320_fix_audit_v2_hallazgos.sql, 20260324_total_remediation.sql, 20260622000001_global_operation_date_policy.sql, 20260622000002_extend_glo | PR-R1: DROP V1 + retirar flag/pilot/else-branch + allow-list vacía + E2E V2 | FAIL — IMPLEMENTATION |
| 95 | `T-V1-008` | H0-R §11 (gates retiro V1) | 0 objetos DB dependen de create_sale (pg_depend) y 0 llamadas internas desde otras funciones | pg_depend no-n=0 · funciones llamantes=0 | PR-R1: DROP V1 + retirar flag/pilot/else-branch + allow-list vacía + E2E V2 | PASS |
| 96 | `T-AR-001` | H0-R §12 (anti-resurrección) | 0 archivos de PRODUCCIÓN (src + scripts activos, excluye tests) llaman a V1 | src/hooks/api/useTransactions.ts (1 línea(s)) | reescribir reconciler F4 a REVOKE; contract-surface sin =X; census CI | FAIL — IMPLEMENTATION |
| 97 | `T-AR-002` | H0-R §12 (anti-resurrección) | 0 ocurrencias del flag de fallback en src/.env.example/CI | refs=src/config/features.ts, .env.example · pilot-mechanism=true | reescribir reconciler F4 a REVOKE; contract-surface sin =X; census CI | FAIL — IMPLEMENTATION |
| 98 | `T-AR-003` | H0-R §12 (anti-resurrección) | 0 migraciones con GRANT EXECUTE ... TO PUBLIC/anon sobre create_sale_v2 | 20260807000003_v2_16_3_create_sale_v2.sql, 20260810000003_v2_19_3_invoice_number_fiscal_lock.sql, 20260810000070_pr4_4e_timezone_services_document.sql, 20260916000002_rem_inv_6_reconcile_function_acl.sql, 20260927000002_f4_create_sale_v2_ac | reescribir reconciler F4 a REVOKE; contract-surface sin =X; census CI | FAIL — IMPLEMENTATION |
| 99 | `T-AR-004` | H0-R §12 (anti-resurrección) | proacl LIVE sin =X ni anon=X (idem T-H1-002, gate de regresión) | ACL LIVE={=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} | reescribir reconciler F4 a REVOKE; contract-surface sin =X; census CI | FAIL — IMPLEMENTATION |
| 100 | `T-AR-005` | H0-R §12 (anti-resurrección) | 0 archivos (excluye migraciones históricas pre-drop) con GRANT V1 | 0 archivos | reescribir reconciler F4 a REVOKE; contract-surface sin =X; census CI | PASS |
| 101 | `T-AR-006` | H0-R §12 (anti-resurrección) | supabase/security-contract/contract-surface.sql sin GRANT PUBLIC a create_sale_v2 | GRANT PUBLIC en contract-surface=false | reescribir reconciler F4 a REVOKE; contract-surface sin =X; census CI | PASS |

**Recuento: 101 tests · PASS 50 · FAIL — IMPLEMENTATION 48 · BLOCKED — BUSINESS DECISION 2 · NOT-OBSERVABLE BY DESIGN 1**
