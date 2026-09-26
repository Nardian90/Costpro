# FASE E-SEC-FINAL — 05 TOKEN SINGLE-USE (D3)

## Diseño

- **Emisión** (`/api/auth/supervisor-check` → `issueSupervisorToken`): payload HMAC-SHA256 firmado con `NEXTAUTH_SECRET` (sin secretos nuevos): `{v, sup, opr, st, iat, exp, jti, scp?}`.
  - `scp` = línea(s) autorizada(s) en la emisión: `[{pid, vid, px}]` — el supervisor vio y autorizó ese producto/variante a ese precio unitario. Firmado: el cliente no puede alterarlo (test `supervisor-token.test.ts`: mutar scp → BAD_SIGNATURE).
- **TTL**: 300 s se mantiene (decisión D3). `verifySupervisorToken` retorna `{valid, payload:{jti, scp}}`.
- **Consumo**: dentro de la transacción de `create_sale_v2` (camino `service_role` con gate disparado):
  ```sql
  INSERT INTO supervisor_token_usages (jti, supervisor, operador, store, transaction_id)
  VALUES (...) ON CONFLICT (jti) DO NOTHING;
  IF NOT FOUND THEN RAISE 'ERR_SUPERVISOR_TOKEN_REUSED'; END IF;
  ```
  - Atómico: venta fallida → rollback → token NO quemado; venta confirmada → irreversiblemente quemado.
  - Replay **aunque el atacante conozca el token y llame por HTTP directo**: choca con el PRIMARY KEY de `supervisor_token_usages`.
- **Scope enforcement** (server): cada línea con desvío ≥15% debe estar cubierta por una entrada `scp` con `pid` igual, `vid` igual (NULL-safe) y `ROUND(px,2) <= ROUND(price_at_sale,2)` (el descuento aplicado no excede el autorizado). Sin cobertura → `ERR_SUPERVISOR_SCOPE_VIOLATION`.
- **Fail-closed**: `service_role` con gate y sin jti → `ERR_SUPERVISOR_TOKEN_REQUIRED` (matriz SV1). La UI puede borrar el token cuando quiera; el servidor es la fuente de verdad.
- **Camino self-session (offline/sync)**: `authenticated` con `p_supervisor_user_id == auth.uid()` (RC-1) no usa tokens por diseño (la sesión firmada del supervisor ES la prueba; no existe token reutilizable). Auditado como `supervisor_path='self_session'`. Compatibilidad offline preservada (SS1/SS2).
- `supervisor_token_usages` NO almacena secretos: el jti es un identificador opaco de un solo uso (mandato D3: "No almacenar secretos innecesarios. Si se utiliza un identificador/jti, debe impedir efectivamente el replay").

## Evidencia LIVE (matriz 08, extracto)

| Caso | Resultado |
|---|---|
| T1 token válido → 1ª operación (425 + motivo) | **200** |
| T2 MISMO token → 2ª operación | **403 "ya fue utilizada"** (ERR_SUPERVISOR_TOKEN_REUSED) |
| T3 token → otro producto no autorizado | **403** ERR_SUPERVISOR_SCOPE_VIOLATION |
| T4 token → mayor descuento (px 425, vende 400) | **403** ERR_SUPERVISOR_SCOPE_VIOLATION |
| T5 token → otra línea ≥15% no autorizada | **403** ERR_SUPERVISOR_SCOPE_VIOLATION |
| T6 expirado (firma válida, exp pasado) | **403** |
| T7 falsificado (firma inválida) | **403** |
| T8 otro operador | **403** OPERATOR_MISMATCH |
| T9 otra tienda | **403** STORE_MISMATCH |
| SV1 service_role con gate sin jti | **400** ERR_SUPERVISOR_TOKEN_REQUIRED |
| A2 DB | fila en `supervisor_token_usages` con `transaction_id` de T1 |

## Evidencia browser (09)

El token emitido por el flujo real (modal → supervisor-check 200) quedó consumido exactamente una vez: `supervisor_token_usages` fila `jti=6166205d…` → `transaction_id=4b2b656a…` (venta B3 de 425).
