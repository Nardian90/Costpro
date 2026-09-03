# W9.4.7 — H5-B1 · FASE 22 — Negative security tests

## FASE 22 — Negative security tests (garantías W9.4.6 mantenidas)

| Probe | Pre-DROP (FASE 11/12) | Post-DROP (FASE 21/22) | Estado |
|---|---|---|---|
| anon → V1 | 401 `42501 permission denied for function reverse_transaction` | 404 `PGRST202` (función inexistente) | V1 retirada ✓ |
| anon → V2 | 401 `42501 permission denied for function reverse_transaction_v2` | **401 `42501 permission denied for function reverse_transaction_v2`** | **INALTERADA** ✓ |
| service_role → V1 | 400 `ERR_TX_NOT_FOUND` (ejecutable) | 404 `PGRST202` (ineliminable de llamar) | objetivo del checkpoint ✓ |
| service_role → V2 | 400 `ERR_TRANSACTION_NOT_FOUND` | **400 `ERR_TRANSACTION_NOT_FOUND`** | **INALTERADO** ✓ |

Garantías W9.4.6 preservadas sin tocar V2:

- `authenticated` → V2: sin grant EXECUTE en proacl (post-audit: ACL `postgres=X/postgres,service_role=X/postgres` intacta) → denegado por ACL, mismo estado que W9.4.6 F8.
- `cross-store → ERR_UNAUTHORIZED`: la lógica de autorización de V2 (hash del cuerpo intacto: `6468aa64…`) no fue modificada — garantizado por prosrc hash pre==post, no por re-ejecución con datos.
- `forged p_user_id → neutralized`: idem — cuerpo de V2 byte-a-byte idéntico (FASE 20), comportamiento sin cambio posible.

Cero modificaciones a V2: OID 138188, firma, owner, secdef, ACL, search_path y prosrc hash idénticos pre/post (FASE 18 snapshot vs FASE 20 post-audit).
