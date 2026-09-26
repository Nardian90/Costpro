# FASE E-SEC-FINAL — 09 BROWSER REAL (FASE 7 del mandato)

**Entorno**: navegador real (agent-browser/Playwright headless) contra http://localhost:3000 (pm2 `costpro`, código post-implementación). Login REAL por formulario con el usuario fixture **encargado** (rol NO supervisor — camino delegado), tienda sandbox ESEC TEST ESEC0926014201, turno de caja activo.

## B1 — Caso normal (precio de catálogo)

```text
TPV (punto de venta) → agregar ESECF Producto A ($500.00) → carrito $500.00
→ 💳 Pago → Cobrar $500.00 → modal CONFIRMAR VENTA $500.00 → CONFIRMAR
→ "¡VENTA COMPLETADA!"
Conciliación DB: tx 90240299… total 500.0; línea {price_at_sale:500,
catalog_price_at_sale:500, item_discount_pct:0}; audit policy_version='E-SEC-FINAL'
```

## B2 — Caso legítimo 500→490 (2% — SIN supervisor)

```text
Tabla de Venta (SalesCatalog) → Producto A: qty 1, tipo "$" fijo, valor 10
→ VALOR VENTA $490.00 (precio negociado visible en UI)
→ botón Vender → modal "Confirmar Venta — Total de la venta $490.00"
→ SÍ, CONFIRMAR VENTA → toast "Venta completada — 80802597-1abf-4506-803e-038e5318156e"
Red: POST /api/pos/checkout → 200
Conciliación DB: total 490.0; línea {price_at_sale:490, catalog_price_at_sale:500,
item_discount_value:10, item_discount_pct:2.0}; audit supervisor_path='none'
```
**Sin ningún paso de supervisor** — el descuento legítimo inferior al umbral fluye completo (REGLA CRÍTICA).

## B3 — Caso autorizado 500→425 (15% — supervisor + motivo)

```text
Tabla de Venta → Producto A: qty 1, "$" fijo, valor 75 → VALOR VENTA $425.00
→ aparece AUTOMÁTICAMENTE el modal "AUTORIZACIÓN DE SUPERVISOR":
   "Descuento fijo de 75.00 (15.0% efectivo) excede el máximo permitido (15%)"
   + NUEVO CAMPO D2: "MOTIVO DEL DESCUENTO *  0/500 — se registra en la auditoría"
   (el botón AUTORIZAR permanece deshabilitado sin motivo)
→ credenciales del admin (supervisor) + motivo "Venta B3 browser: liquidación
   autorizada por gerencia" → AUTORIZAR
Red: POST /api/auth/supervisor-check → 200 (token firmado con scope [PA@425])
→ Vender → Confirmar Venta → SÍ, CONFIRMAR VENTA
Red: POST /api/pos/checkout → 200
Conciliación DB: tx 4b2b656a… total 425.0
  línea: {price_at_sale:425.0, catalog_price_at_sale:500.0,
          item_discount_value:75.0, item_discount_pct:15.0}
  audit: discount_reason='Venta B3 browser: liquidación autorizada por gerencia'
         supervisor_path='token' · supervisor_token_jti=6166205d… · max_line_pct=15.0
  supervisor_token_usages: jti → transaction_id=4b2b656a (consumo único ✓)
Captura: screenshots/07-browser-b3-venta-425-completada.png
```

## Bypass (HTTP/RPC directo) — cubierto por la matriz 08

- HTTP directo al route sin supervisor (U1/U2/S1/S2/M1/M2): **403**.
- RPC directo con supervisor ajeno bajo `authenticated` (SS3): **400**.
- RPC service_role con gate sin jti (SV1): **400**.
- El payload del browser B3 demuestra el camino legítimo: token + motivo + scope viajan del UI real al RPC.

## Replay — cubierto por la matriz (T1/T2) y por DB

- Matriz: 1ª operación 200 → MISMO token 2ª operación **403 "ya fue utilizada"** (ERR_SUPERVISOR_TOKEN_REUSED server-side).
- El token emitido en el browser B3 (jti 6166205d…) quedó registrado en `supervisor_token_usages` ligado a exactamente UNA operación (4b2b656a) — cualquier reintento con ese token reproduce el caso T2 (PK de jti).

## Defecto preexistente descubierto y corregido (bloqueante del flujo autorizado)

**`SupervisorAuthModal` leía `localStorage('activeStoreId')` — clave que NADIE escribe en la app** (única referencia en todo el código). Consecuencia: TODA autorización de supervisor por UI enviaba `store_id: ''` → supervisor-check respondía **400 "Invalid data"** desde la iteración 11.2 — el flujo de autorización nunca funcionó de extremo a extremo por UI (E-SEC no lo ejercitó en navegador: su caso browser era 490, sin supervisor). Corrección mínima (1 línea + import): leer la fuente de verdad real `useAuthStore.getState().user?.activeStoreId` — la misma que usa `usePOSCheckout`. Verificado: supervisor-check 400 → **200** tras el fix, y la venta B3 completa.
