# REM-INV-2 — 09: AUTHORIZATION / IDENTITY (staging aislado)

Protocolo: determinar si la recepción obtiene identidad desde `auth.uid()` o acepta `p_user_id`/`user_id`/`created_by`/`store_id` desde el cliente sin validar; intentar spoofing seguro (caller A reclama user B); esperado DENIED.

## 1. Fuente de identidad en `receive_purchase` (definición verbatim)

| Pregunta | Respuesta |
|---|---|
| ¿Usa `auth.uid()`? | **NO — 0 ocurrencias** en el cuerpo |
| ¿Acepta `p_user_id`? | **NO — la firma tiene un único parámetro (`p_purchase_id`)** |
| ¿Registra `user_id` / `created_by` en algún lado? | **NO** — ni en stock_movements (no escribe `created_by`) ni en audit (no escribe audit_logs) |
| ¿`created_by` de la OC? | Solo lo lee el FK de la tabla; la función nunca lo consulta ni compara |

## 2. "Spoofing" — resultado estructural y conductual

El spoofing (caller A reclama user B) **ni siquiera tiene superficie**: no hay campo de identidad que suplantar — la función es anónima por diseño. Lo demostró el rol `stg_unprivileged` del staging (08): un rol **sin membresía ni relación con STORE_B** ejecutó la recepción de la OC ajena con éxito total. Esperado `DENIED`, obtenido `ACCEPTED` → **FAIL**.

## 3. Contraste con la canónica

| Aspecto | V1 `receive_purchase` | Canónica `register_reception` / `receive_against_po` |
|---|---|---|
| Identidad | ninguna | `auth.uid()`; `p_user_id` solo aceptado si `auth.role()='service_role'` (los endpoints de app toman `session.user.id` del servidor, nunca del body del cliente — suplantación bloqueada en los handlers) |
| Autorización | ninguna | `has_store_access_as` / `has_store_access` |
| Trazabilidad de quién recibió | nula | receipts.user_id + stock_movements.created_by + audit_logs |

## 4. Consecuencia

**FAIL del control de autorización/identidad**: la V1 no valida quién llama ni deja rastro de quién actuó. Combinada con el EXECUTE a `authenticated` (S17), cualquier usuario autenticado puede operarla anónimamente sobre OCs de tiendas donde la RLS le dé visibilidad — sin atribución posterior posible en audit_logs.
