# E-SEC-FINAL-DESIGN.md
## Diseño mínimo — Política definitiva de precio, descuento y autorización (D1–D5)

**Fase**: E-SEC-FINAL · **Baseline**: `b5b48491` (HEAD == origin/main, worktree limpio)
**Predecesora**: FASE E-SEC-R (`b5b48491`, veredicto CONDITIONAL, 5 decisiones pendientes documentadas en `E-SEC-R-DECISION-REQUIRED.md`).
**Naturaleza**: el mandato E-SEC-FINAL resuelve las 5 decisiones (D1–D5). Este documento las convierte en un diseño mínimo ANTES de escribir código. Sin refactors no relacionados.

---

## 0. Dónde vive hoy cada pieza (FASE 1 READ-ONLY — verificado)

| Pieza | Ubicación exacta | Estado actual |
|---|---|---|
| RPC canónico | `create_sale_v2` (migración `20260926000001_esec_price_integrity.sql` == LIVE) | gate agregado: `v_item_discount_pct = v_item_discount_total / v_catalog_subtotal * 100` → `IF v_effective_discount_pct >= 15 OR v_item_discount_pct >= 15` |
| Emisión de token | `src/app/api/auth/supervisor-check/route.ts` → `issueSupervisorToken(sup, opr, st)` | HMAC con `jti` **no rastreado**; TTL 300 s; sin scope |
| Verificación de token | `src/app/api/pos/checkout/route.ts` → `verifySupervisorToken` | verifica firma/TTL/(sup,opr,st); NO consume; NO evalúa scope |
| Construcción de `transaction_items` | `create_sale_v2` segunda pasada (INSERT con `price_at_sale`, `cost_at_sale`, split de pago, `discount_type/discount_value` = copia del descuento GLOBAL) | sin `catalog_price_at_sale`, sin desvío por línea |
| Columnas disponibles | `transaction_items`: `price_at_sale`, `cost_at_sale`, `price_at_sale_cup NUMERIC(12,2)`, `discount_type`, `discount_value`, + 15 cols de pago multi-moneda | D4 requiere 3 columnas nuevas |
| Semáforo UI | `useDiscountAuthorization.ts` (`DISCOUNT_SUPERVISOR_THRESHOLD = 15`), usado por `SalesCatalogCard/Table` + `POSCartDiscountModal` → `SupervisorAuthModal` | advisory; abre modal por cada entrada ≥15% |
| Almacén de autorización | `supervisor-auth-store.ts` (módulo en memoria: userId+token) | UI lo borra tras la venta (UX); servidor no |
| Motivo del descuento | **NO EXISTE** (0 hits en schema/UI/RPC) | D2 lo crea |
| Offline | `src/app/api/sync/batch/route.ts` → `create_sale_v2` bajo sesión `authenticated` con `p_supervisor_user_id` encolado | RC-1 vigente: solo self-supervisor (admin/manager que vende autorizándose a sí mismo) |
| Tests | `pos-checkout-price-integrity.test.ts` (route, mocks RPC/token), `effective-unit-price.test.ts`, `iteration-11-2.test.ts`; política RPC validada LIVE por scripts (patrón E-SEC) | se extienden |

---

## 1. D1 — Umbral de autorización POR LÍNEA (≥15%)

**Decisión**: modelo A. `desviación de precio de una línea >= 15%` ⇒ requiere supervisor. El agregado NO puede diluir una línea.

**Cambio (RPC, única regla canónica)**:
- Primera pasada: además del agregado (que se conserva SOLO como metadato de auditoría), calcular por línea:
  `v_line_pct = (v_reference_price - v_price) / v_reference_price * 100` cuando `v_price < v_reference_price` (0 si no hay desvío).
- Gate: `IF v_effective_discount_pct >= 15 OR v_max_line_pct >= 15` (se reemplaza `v_item_discount_pct >= 15` por el máximo **por línea**). `v_effective_discount_pct >= 15` se conserva (descuento global del carrito, mecanismo existente).
- Comparación EXACTA (numeric, sin redondear el %): 500→425 = 15.00% ⇒ gate; 500→424.99 = 15.002% ⇒ gate; 500→425.01 = 14.998% ⇒ sin gate; 500→490 = 2% ⇒ sin gate.
- El desvío por línea ya se calcula contra el precio de referencia server-side (variante→`product_variants.price`, base→`products.price` bajo FOR UPDATE) — E-SEC lo dejó instalado; D1 solo cambia la **evaluación** (por línea, no agregada).

**UI**: sin cambios de semántica — ya aconseja por línea (misma regla ≥15%). El servidor pasa a ser la autoridad idéntica.

---

## 2. D2 — `discount_reason` obligatorio cuando hay autorización

**Decisión**: motivo obligatorio ⇔ la venta requirió autorización de supervisor (línea ≥15% o descuento global ≥15%). No se exige bajo el umbral. Campo de texto controlado (1..500 tras trim); sin catálogo de motivos.

**Viaje del motivo**:
```
SupervisorAuthModal (textarea requerido, bloquea "Autorizar" si vacío)
  → supervisor-auth-store (reason junto al token)
  → usePOSCheckout → POST /api/pos/checkout { discount_reason }
  → route Zod: discount_reason: string ≤500 nullable optional (passthrough)
  → RPC p_discount_reason
  → validación SERVER-SIDE + persistencia
```

**Validación server-side (RPC, autoridad)**: si el gate dispara y `(p_discount_reason IS NULL OR btrim(p_discount_reason) = '' OR char_length(btrim(p_discount_reason)) > 500)` ⇒ `RAISE ERR_DISCOUNT_REASON_REQUIRED`. Si el gate no dispara, el motivo es opcional y se almacena si viene.

**Persistencia**: `audit_logs.metadata.discount_reason` (modelo de auditoría existente) + copia en `metadata.lines[]` por línea autorizada. La asociación línea/operación es inequívoca: el array porta `product_id/variant_id` por línea.

**Route**: mapeo del error → HTTP 403 `"Motivo del descuento requerido."`

---

## 3. D3 — Token de supervisor SINGLE-USE (TTL 300 s se mantiene)

**Decisión**: la autorización delegada (operador ≠ supervisor, token firmado) es de UN SOLO USO server-side. El replay debe fallar aunque el atacante conozca el token y llame por HTTP directo.

### 3.1 Binding del token
El payload HMAC firma: `(v, sup, opr, st, iat, exp, jti)` **+ `scp`** = scope autorizado en la emisión:
`scp: [{ pid: product_id, vid: variant_id|null, px: unit_price_autorizado }]`.
- Supervisor/operador/tienda: ya vinculados (RC-1).
- Línea(s) autorizada(s): vinculadas vía `scp` (la UI conoce la línea exacta al momento del modal — el supervisor ve el % exacto que autoriza).
- Operación autorizada: vinculada en el CONSUMO (registro de uso con `transaction_id`).

### 3.2 Single-use (estrategia server-side)
- Tabla `supervisor_token_usages`:
  ```sql
  CREATE TABLE supervisor_token_usages (
    jti text PRIMARY KEY,
    supervisor_user_id uuid NOT NULL,
    operator_user_id uuid NOT NULL,
    store_id uuid NOT NULL,
    transaction_id uuid,
    used_at timestamptz NOT NULL DEFAULT now()
  );
  -- RLS deny-by-default (convención 20260902000001_w9_f01): REVOKE ALL a
  -- anon/authenticated/PUBLIC + ENABLE ROW LEVEL SECURITY. Solo service_role
  -- y el RPC SECURITY DEFINER tocan la tabla.
  ```
- **Consumo atómico DENTRO de la transacción del RPC** (paso del gate): `INSERT ... ON CONFLICT (jti) DO NOTHING`; si `0 filas` ⇒ `RAISE ERR_SUPERVISOR_TOKEN_REUSED`. Mismo store ⇒ advisory lock ya serializa; cross-store ⇒ el PK global detiene el replay. Rollback-safe: una venta fallida NO quema el token; una venta exitosa sí (irreversible).
- Nuevo parámetro RPC `p_supervisor_token_jti text DEFAULT NULL`. El route (único camino service_role) extrae el `jti` del payload verificado y lo pasa. RPC bajo `service_role` con gate disparado EXIGE jti (fail-closed si no llega).

### 3.3 Scope enforcement (líneas/producto/descuento exacto)
- Nuevo parámetro RPC `p_supervisor_scope jsonb DEFAULT NULL` (el route pasa el `scp` firmado).
- RPC: para CADA línea con desvío ≥15% debe existir una entrada de scope con `pid` igual, `vid` igual (NULL-safe) y `round(px,2) <= round(v_price,2)`. Si no ⇒ `RAISE ERR_SUPERVISOR_SCOPE_VIOLATION`.
  - precio real < precio autorizado (descuento mayor) ⇒ DENIED
  - producto/línea no autorizada ⇒ DENIED
  - precio real >= autorizado (descuento menor o igual) ⇒ OK
- Ventas donde el gate dispara SOLO por descuento global (sin líneas ≥15%): no se exige scope de líneas (el supervisor autorizó el descuento global en su modal).
- Modo "any-match": si hay entradas duplicadas del mismo producto (autorizaciones sucesivas), basta una que cubra el precio real.

### 3.4 Acumulación de scope en la UI (preserva flujos legítimos)
- `supervisor-auth-store` pasa a guardar `{ userId, token, issuedAt, reason, scope[] }`.
- Cada modal (SalesCatalogCard / SalesCatalogTable / POSCartDiscountModal) envía a supervisor-check el scope ACUMULADO + la entrada nueva (upsert por pid+vid, última gana). Cada autorización re-emite el token (el supervisor ya re-ingresa credenciales hoy) con el scope completo.
- `SupervisorAuthModal` recibe `scopeEntry` opcional del caller y `reason` obligatorio; setSupervisorAuth(userId, token, reason, mergedScope).
- Sin scope nuevo (modal global): `scopeEntry = null`, se envía el acumulado (no se pierden líneas autorizadas previas).

### 3.5 Sesión propia (offline / sync-batch) — SIN token por diseño
- `sync/batch` ejecuta `create_sale_v2` bajo `authenticated`; RC-1 exige `p_supervisor_user_id == auth.uid()` + rol admin/manager en la tienda. El supervisor actúa con SU sesión (no hay token que reutilizar). D3 no aplica a este camino; en auditoría queda `supervisor_path='self_session'`.
- El replay (D3) es un ataque al camino DELEGADO (token). El camino de sesión propia queda con la política preexistente (intacta desde RC-1). Compatibilidad offline preservada.

### 3.6 UI cleanup
- `clearSupervisorAuth()` tras la venta se mantiene (higiene UX). El servidor ya NO confía en ello: el jti quemado hace el replay imposible.

---

## 4. D4 — Snapshot histórico del precio por línea

**Decisión**: conservar por línea vendida la reconstrucción del precio comercial del momento. Cambio mínimo: **3 columnas nuevas** en `transaction_items` (nullable; compatible con filas históricas):

```sql
ALTER TABLE public.transaction_items
  ADD COLUMN IF NOT EXISTS catalog_price_at_sale NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS item_discount_value   NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_discount_pct     NUMERIC(9,2)  NOT NULL DEFAULT 0;
```

- `catalog_price_at_sale` = `ROUND(v_reference_price, 2)` (variante si hay, si no base) — el MISMO valor contra el que se evalúa el desvío (única fuente).
- `item_discount_value` = `ROUND(GREATEST(0, ref − price) * qty, 2)`.
- `item_discount_pct` = desvío % de la línea (0 si no hay).
- `price_at_sale` ya existe (queda redondeado a 2dp por D5).
- La venta histórica NO depende del catálogo: cambiar el precio del producto después no altera la línea (los 4 valores viven en la fila). `venta histórica ≠ precio actual` verificable por SQL.
- `authorized_by` / `discount_reason`: según el modelo de auditoría EXISTENTE (mandato D4 literal) — `audit_logs.metadata` ya registra `supervisor_id`; se añade `discount_reason`, `supervisor_token_jti`, `supervisor_path` y el array `lines[]` con el snapshot por línea (`product_id, variant_id, catalog_price, price_at_sale, discount_value, discount_pct`). NO se crean columnas de autorización por línea (mínimo esquema).
- NO se construye un sistema de historial de precios completo.

---

## 5. D5 — Redondeo monetario explícito (2 decimales, mitad arriba)

**Política**: `precio de línea → 2dp`; `subtotal de línea → 2dp`; `total de venta = Σ subtotales de línea ya redondeados` (− descuento global + impuestos, fórmulas existentes). Cliente y servidor misma semántica.

**Servidor (RPC)**:
1. `v_price := ROUND(v_price, 2)` justo tras la validación `ERR_INVALID_PRICE` (primera pasada). Todo el cálculo y el INSERT usan el valor redondeado.
2. `v_calculated_subtotal := Σ ROUND(v_price * v_qty, 2)` (reemplaza la suma cruda `Σ price*qty`).
3. Descuento global/impuestos/total: fórmulas intactas sobre la base ya redondeada. Tolerancia `ERR_TOTAL_MISMATCH` 0.01 se mantiene como red de seguridad.

**Cliente (`src/store/cart.ts`)**:
1. Nuevo helper `round2(x)` — half-up EXACTO sobre el decimal (truco `e2`: evita `19.995 → 19.99` del float; `Math.round(`${x}e2`)/100` con manejo de signo). Exportado para tests.
2. `effectiveUnitPrice()` → devuelve `round2(...)`: el precio unitario de línea SIEMPRE 2dp (el payload V2 envía el precio redondeado; el servidor lo re-redondea sin cambio).
3. `calculateItemSubtotal()` → `round2(effectiveUnitPrice(...) * qty)`: el subtotal de línea se calcula DESDE el unitario ya redondeado — réplica exacta de la aritmética del RPC (elimina la amplificación unit→línea).
4. Totales ya `.toFixed(2)` — intactos.

**Semántica compartida**: ambos lados hacen `round2(round2(unit) × qty)` por línea y suman. Divergencia residual teórica: mitad-de-centavo donde el float y el decimal difieren — cubierta por tolerancia 0.01 y detectada como `ERR_TOTAL_MISMATCH` (visible, jamás silenciosa).

**Preservación**: NO se reescribe la aritmética financiera completa (WAC, impuestos, split de pago, multi-moneda intactly). Solo los 2 puntos de precio de línea + 1 punto de subtotal.

---

## 6. Archivos afectados (mínimo)

| Archivo | Cambio |
|---|---|
| `supabase/migrations/20260927000001_esec_final_definitive_policy.sql` | **NUEVO**: 3 columnas snapshot + tabla `supervisor_token_usages` (RLS deny-by-default) + nueva definición `create_sale_v2` (D1–D5) |
| `src/lib/supervisor-token.ts` | payload `+scp`; `issueSupervisorToken(sup, opr, st, scope?)`; `verifySupervisorToken` devuelve `{valid, reason?, payload?}` |
| `src/app/api/auth/supervisor-check/route.ts` | acepta `scope` (Zod, opcional, entries pid/vid/px) y lo firma en el token |
| `src/app/api/pos/checkout/route.ts` | Zod `discount_reason` ≤500; pasa `p_supervisor_token_jti` + `p_supervisor_scope` + `p_discount_reason`; mapeos 403 nuevos |
| `src/components/.../supervisor-auth-store.ts` | `{userId, token, issuedAt, reason, scope[]}` + upsert de scope |
| `src/components/.../SupervisorAuthModal.tsx` | textarea Motivo (requerido) + prop `scopeEntry` |
| `src/components/.../SalesCatalogCard.tsx` / `SalesCatalogTable.tsx` | construyen `scopeEntry` (pid, vid, px=effectiveUnitPrice resultante) y la pasan al modal |
| `src/components/.../POSCartDiscountModal.tsx` | modal global: `scopeEntry=null` (preserva acumulado) |
| `src/components/.../usePOSCheckout.ts` | envía `discount_reason` desde el store |
| `src/store/cart.ts` | `round2` + `effectiveUnitPrice`/`calculateItemSubtotal` 2dp (D5) |
| `src/__tests__/api/pos-checkout-price-integrity.test.ts` | extensiones D1–D5 (route) |
| `src/__tests__/store/effective-unit-price.test.ts` | casos de redondeo D5 |

NO se tocan: `create_sale` (v1, flag-gated), migraciones previas, WAC/stock/inventario, devoluciones, `sync/batch` (camino self-session intacto), R-DEPS-1, R-E2E-1, R-UX-DATE, R-A11Y-1.

## 7. Migración
`20260927000001_esec_final_definitive_policy.sql` — generada por transformación verificada de la definición LIVE (patrón E-SEC: `pg_get_functiondef` LIVE == migración 20260926000001 verificado por hash antes de transformar). Aplicación vía Management API (`POST /v1/projects/{ref}/database/query`) — patrón REM/E-SEC. Post-aplicación: hash LIVE == migración nueva.

## 8. Compatibilidad (REGLA CRÍTICA — precios legítimos preservados)
| Flujo | Resultado |
|---|---|
| 500→500 (0%) | sin supervisor, sin motivo |
| 500→490 (2%) | sin supervisor, sin motivo |
| 500→450 (10%) | sin supervisor, sin motivo |
| 500→425 (15%) | supervisor + motivo |
| 500→424.99 (15.002%) | supervisor + motivo |
| Línea B 300→240 + línea A 500→500 | supervisor por B SOLO (A no exige) — aunque el agregado sea <15% |
| Agregado diluido vía API ({20%+0%}) | DENIED sin supervisor (D1 por línea) |
| `price_at_sale === product.price` (sin desvío) | funciona (regla universal NO implementada) |
| 500→600 (sobrecarga) | permitido (desvío negativo no es descuento) |
| Servicios sin precio de referencia | sin gate (compatibilidad actual) |
| Multi-moneda / zelle / mixed | intactos (no se tocan) |
| Offline self-supervisor | intacto (camino `authenticated`, sin token) |
| Idempotencia | intacta (el consumo de jti vive dentro de la TX; retry idempotente retorna antes del gate) |

## 9. Estrategia de auditoría (FASE 8 del mandato)
`audit_logs.metadata` por venta añade: `discount_reason`, `supervisor_token_jti` (identificador, no secreto), `supervisor_path` (`'token'` | `'self_session'`), `lines: [{product_id, variant_id, catalog_price, price_at_sale, discount_value, discount_pct}]`. Con `transactions` + `transaction_items` + `supervisor_token_usages` se reconstruye: producto, variante, precio catálogo, precio vendido, descuento, %, usuario, supervisor, motivo, tienda, fecha. `supervisor_token_usages` NO expone secretos (jti es opaco y de un solo uso).

## 10. Plan de verificación
- **Matriz LIVE (FASE 4)**: fixtures aislados del sandbox E-SEC (tienda sintética, usuarios fixture, productos PA/PB con stock vía `register_stock_movement`) — casos del mandato: normales (500/490/450), umbral (425/424.99), multi-línea (A=500→500 + B=300→240; explotación con C=100→100), token (1er uso OK, replay DENIED, otro producto/mayor descuento/otra línea DENIED, expirado/falsificado/otro operador/otra tienda DENIED), motivo (≥15%+reason OK; ≥15% sin reason DENIED; <15% sin reason OK), snapshot (catalog 500→venta 450→catálogo a 600 ⇒ línea conserva 500/450), redondeo (19.99/33.33/99.95/0.01 + multi-línea, UI==server==DB).
- **Regresión (FASE 6)**: vitest + tsc + eslint + build/CI; clasificación PASS/FAIL REGRESSION/PREEXISTING/INFRA. Referencia: 2254 passed / 0 failed.
- **Browser real (FASE 7)**: venta normal; 500→490 sin supervisor; 500→425 con supervisor+motivo; bypass HTTP directo DENIED; replay 200→403.
- **Integridad (FASE 5)**: stock/movimientos/oversell/idempotencia/checkout/auditoría sobre el fixture.
- **Zero-touch (FASE 9)**: ENER-VIDA/VITALLCONS, PUERTO PADRE, TIENDA CENTRAL — snapshot de timestamps/counts antes y después.

## 11. Fuera de alcance
No reabrir C2R/FASE D/E-SEC/E-SEC-R; no corregir R-DEPS-1, R-E2E-1, R-UX-DATE, R-A11Y-1; no refactor de arquitectura; no tocar RPC v1 ni dependencias.
