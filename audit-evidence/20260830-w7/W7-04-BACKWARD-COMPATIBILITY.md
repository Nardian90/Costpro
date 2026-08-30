# W7-04 — BACKWARD COMPATIBILITY (FASE 13)

Simulación de tres perfiles de cliente contra el clon `w7_gate` (estado post-migración), con sondas reales (resolución de firma + llamada ejecutada). Evidencia: `tmp/W7-f11-f13-run.out`, `tmp/W7-f11-overloads.txt`, suite DF (`tmp/W7R-*.out`).

## 13.1 Clasificación por RPC afectado

| RPC / ruta | CLIENT_OLD (payload actual) | CLIENT_CURRENT (repo @b7b9dec) | CLIENT_NEW (post-W8) | Clase |
|---|---|---|---|---|
| create_sale_v2 (checkout L100-104 envía cost/cost_at_sale) | Aceptada; **costo cliente IGNORADO**, COGS=WAC server (7777→100 demostrado) | Igual que OLD | omite el campo | **COMPATIBLE-BUT-DEPRECATED** |
| confirm_pending_reception / fn_process_receipt / ajustes / reversas (12 convertidas) | firma intacta; respuestas iguales; errores nuevos solo en estados inválidos | idéntico | idéntico | **COMPATIBLE** |
| withdraw_production_item 6-arg (ruta L26 `unit_cost||0`) | **42883 function does not exist** (reproducido) | mismo error | usa withdraw_production_item_v3 | **BREAKING** |
| withdraw_production_item 9-arg | **42883** | — | — | **BREAKING** |
| receive_production_output 4-arg | **42883** (reproducido) | — | — | **BREAKING** |
| receive_production_output 6-arg | COMPATIBLE + ACL ahora authed/service (antes PUBLIC/anon) | COMPATIBLE | COMPATIBLE | **COMPATIBLE** (ACL más estricta) |
| create_devolution v1 9-arg/10-arg (ruta devolutions L73, USE_V2_REVERSE=false→v1) | **42501 permission denied** (REVOKE reproducido: authed=false) | mismo error si el flag sigue false | usa create_devolution_v2 | **BREAKING** |
| create_devolution_v2 | firma intacta; ahora exige original_transaction_id (ERR_DEVOLUTION_NO_ORIGINAL) y emite contra-asiento | COMPATIBLE con cambio de comportamiento | COMPATIBLE | **COMPATIBLE-BUT-DEPRECATED** (semántica endurecida) |
| close_production_order_v2 sin key (ruta close L107 SIEMPRE envía key) | key auto-generada `close-<order_id>`: COMPATIBLE | COMPATIBLE (key enviada) | COMPATIBLE + param_hash | **COMPATIBLE** |
| confirm_transfer / reverse_transfer | firma intacta; blend destino nuevo | COMPATIBLE | COMPATIBLE | **COMPATIBLE** |
| create_vale_salida 6-arg | redefinida (llama v3); firma intacta | COMPATIBLE | COMPATIBLE | **COMPATIBLE** |
| create_vale_salida 5-arg | delegadora; llamada con EXACTAMENTE los 5 named params comunes → **42725 is not unique** (reproducido) | el repo llama 6-arg → sin impacto | — | **UNSAFE-narrow** (ambigüedad residual preexistente, solo notación named con 5 params) |
| reset_store_data (route reset L170, admin) | **ERR_WAC_SINGLE_WRITER_VIOLATION** al intentar reset con keep_catalog (guard bloquea su UPDATE de cost_average) | mismo | requiere rediseño/token admin | **BREAKING** (fail-closed, decisión del dueño pendiente — W62-10 §9.5) |

## 13.2 Reglas aplicadas

- «Nunca declarar backward-compatible solo porque PostgreSQL permite la llamada»: create_sale_v2 se declara COMPATIBLE-BUT-DEPRECATED porque el comportamiento cambia (costo ignorado), verificado con asserts (W7R df02 13/0).
- PostgREST: tras pkg 04, los nombres `withdraw_production_item` y `receive_production_output` exponen exactamente 1 firma viva cada uno → PGRST203 / `is not unique` de los nombres migrados desaparece. Residual: `create_vale_salida` mantiene par 5/6-arg (ambas expuestas a authenticated) — la ambigüedad de named-args con los 5 comunes persiste (preexistente, no regresión; su eliminación corresponde a la etapa 5 de la transición W62-04).

## 13.3 Consecuencia operativa (ventana de migración)

El despliegue DB **no** puede ir solo: hasta que el frontend migre (W8), estas rutas del repo quedan rotas en runtime: `withdraw` (L26), `devolutions` con USE_V2_REVERSE=false (L73), `reset` (L170). Es breaking deliberado y conocido (W62-10 §9.7: «la migración de frontend es W8; el servidor ya no les da autoridad»). Para W7 la clasificación es: **BREAKING controlado con ventanas definidas — el orden DB→frontend o la coexistencia deben decidirse en el runbook del dueño.**

## 13.4 Veredicto FASE 13

```text
BACKWARD COMPAT GATE = PASS (clasificación completa, sin breaks ocultos)
```
Todos los breaks están inventariados, reproducidos y documentados; ninguno es silencioso ni corrompe datos (todos fallan con error explícito).
