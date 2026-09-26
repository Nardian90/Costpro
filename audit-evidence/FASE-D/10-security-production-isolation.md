# FASE D — 10 SECURITY & PRODUCTION ISOLATION

## Zonas prohibidas — NUNCA tocadas

```text
ENERVIDA-VITALLCONS      = 5e6fe821-5465-48b1-b3f1-3aa3182edc38
Puerto Padre VITALLCONS  = 43a4dabc-b8b4-4b66-82b3-0c75335ca5d1
TIENDA CENTRAL COSTPRO   = d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576 (prudencia extra)
```

Toda mutación de FASE D quedó filtrada por `store_id = 241c47df…` (sandbox propio)
o por IDs capturados del fixture. Cero INSERT/UPDATE/DELETE/RPC fuera del sandbox.

## Verificación zero-touch final (GET-only, post-FASE-D)

```text
ENERVIDA-VITALLCONS:     último producto actualizado 2026-08-22 | última venta 2026-08-17
Puerto Padre VITALLCONS: último producto actualizado 2026-08-16 | última venta 2026-07-11
TIENDA CENTRAL COSTPRO:  último producto actualizado 2026-09-06 | sin ventas
(FASE D inició 2026-09-25T23:13Z → ninguna actividad posterior en las 3 tiendas) ✓
```

## Mecanismo de prueba usado (§0)

Opción 4 del mandato: **usuario/tienda de prueba explícitamente creada para el test**
+ protocolo §32 completo:

```text
CREATE FIXTURE (auth user + tienda + perfil + membership + 2 productos + stock via
  RPC sancionado register_stock_movement + WAC via fn_recalc_wac único-escritor)
→ CAPTURE ID   (manifest ~/scripts/fase-d-fixtures.json, guardado incremental)
→ ASSERT OWNERSHIP/CONTRACT (membership admin active; products.store_id = sandbox)
→ OPERATE (solo en la sandbox; checkout por UI real con JWT del fixture)
→ ASSERT (conciliación completa, doc 07)
→ CLEANUP BY ID (doc 07; lo bloqueado por gobernanza documentado)
```

## Seguridad del checkout (§9) — verificaciones

```text
PASS  autenticación: withAuth fail-closed (SEC-024) — sin Bearer → 401 (demostrado:
      el 401 pre-fix fue capturado en red/logs).
PASS  rate-limit 30 req/min + CSRF validateOrigin + Zod estricto del payload.
PASS  idempotencia server-side por idempotency_key (misma key = misma venta).
PASS  oversell imposible: ERR_INSUFFICIENT_STOCK 409 con stock exacto en el mensaje.
PASS  membership: ERR_UNAUTHORIZED / "Unauthorized store access" para no-miembros
      (observado al llamar RPCs sin contexto de usuario).
PASS  supervisor firmado (REM-INV-4A-R): supervisor_token con TTL y binding
      supervisor+operador+tienda; sin token, el supervisor_user_id se rechaza (403).
HALLAZGO (preexistente, DOCUMENTADO — no corregido en FASE D):
  el precio por ítem (price_at_sale) lo fija el cliente; create_sale_v2 valida
  coherencia interna (total = Σ ítems, pagos = total) y descuento GLOBAL ≥15%
  requiere supervisor, pero NO compara price_at_sale vs products.price por ítem.
  Demostración: venta aceptada (200) con price 1.00 en producto de 100.00.
  Riesgo: subcarga no autorizada a nivel ítem (el margen negativo quedaría
  registrado en cost_at_sale y auditService.logSaleBelowCost es client-side).
  Recomendación (fase posterior): validación server-side de desvío de precio por
  ítem (p.ej. |price_at_sale − product.price| > umbral → ERR_SUPERVISOR_REQUIRED).
```

## Secretos

Ningún secreto impreso ni commiteado: PAT, service key, anon key y contraseña del
fixture solo viven fuera del repo (scripts/ y manifest local). Evidencia revisada
con grep de patrones de secretos.
