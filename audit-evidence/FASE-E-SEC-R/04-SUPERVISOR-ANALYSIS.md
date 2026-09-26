# FASE E-SEC-R — 04 SUPERVISOR ANALYSIS (FASE 3 — alcance exacto del token)

## Fecha / HEAD
2026-09-26 · dd1e6fb9. Prueba conceptual ejecutada en fixture sintético aislado
(tienda `ESEC TEST ESEC0926014201`, tag `ESECR0926191737`); resultados crudos en
`/home/z/my-project/scripts/esecr-supervisor-matrix.json`. Cero contacto con las
tiendas protegidas (zero-touch verificado pre/post).

## Determinación (código + prueba)

| Pregunta | Determinación | Fuente |
|---|---|---|
| ¿Qué roles pueden autorizar? | `admin`/`manager` de ESA tienda (`has_store_role_as`); global `admin`/`superadmin` (profile) pasa el check del route | RPC `:255-257`; `supervisor-check/route.ts:80-103` |
| ¿Qué operaciones pueden autorizar? | Cualquier venta cuyo desvío (global o ítem-agregado) alcance ≥15%; también cubre price=0 (desvío 100%) y 500→1 | RPC `:241-258` |
| ¿Autoriza una LÍNEA o TODA LA VENTA? | **Toda la venta**: el gate evalúa pct agregado; el token no distingue líneas | RPC `:237-241`; token payload sin campo de línea |
| ¿Duración del token? | TTL **300 s** (5 min), stateless, versionado v1 | `supervisor-token.ts:36` |
| ¿Alcance del token? | Binding (supervisor, operador, tienda). **No** binda producto, línea, monto, porcentaje ni venta concreta | `supervisor-token.ts:40-48,125-127` |
| ¿Puede reutilizarse? | **SÍ dentro del TTL para el mismo binding** (residual P3 del diseño RC-1). La UI lo consume tras 1 venta, pero el servidor NO registra usos | R1/R2/R3 = 200 (abajo); `supervisor-token.ts:28-31` |
| ¿En otra venta? | SÍ (misma tienda, mismo operador, dentro del TTL) | R2/R3 = 200; E-SEC A26 = 200 |
| ¿Para otra línea / otro producto? | SÍ (sin binding de producto) | R2 = 200 (venta sobre OTRO producto) |
| ¿Con otro porcentaje? | SÍ (sin binding de monto/%) | R3 = 200 (50% tras autorizar 40%) |
| ¿Queda registrada la identidad del autorizador? | SÍ: `audit_logs.metadata.supervisor_id` por venta. **No** se registra el token/jti → no puede demostrarse qué emisión autorizó cada venta | RPC `:440`; matriz AUDIT (abajo) |

## Matriz conceptual ejecutada (fixture aislado, Supabase LIVE, dd1e6fb9)

| # | Situación | Resultado | Lectura |
|---|---|---|---|
| R1 | Token válido → misma operación (PA 500→300, 40%) | **200** · tx c1c85a94 | la autorización funciona |
| R2 | MISMO token → otra venta, OTRO producto (PB 100→50, 50%) | **200** · tx 5e9cb9d9 | reutilización cross-producto PERMITIDA server-side |
| R3 | MISMO token → MAYOR descuento (PA 500→250, 50% > 40% autorizado) | **200** · tx 147c1ad2 | reutilización cross-monto PERMITIDA server-side |
| R4 | Token expirado (firma válida, exp hace 100 s) | **403** | EXPIRED rechazado ✓ |
| R5 | Token falso (firma manipulada) | **403** | BAD_SIGNATURE rechazado ✓ |
| R6 | Usuario sin privilegios (encargado) en supervisor-check | **403** "El supervisor no tiene permisos en esta tienda" | rol verificado server-side ✓ |
| R7 | MISMO token válido usado por OTRO operador | **403** | OPERATOR_MISMATCH: binding de operador firme ✓ |

Auditoría de R1/R2/R3: las TRES ventas comparten `supervisor_id = cea2dc34…`;
`jti_registrado = False` en las tres. Es decir: un único supervisor-check puede
respaldar N ventas dentro del TTL y la auditoría muestra la misma identidad en
todas, sin poder distinguir cuántas emisiones hubo.

## Respuestas a las 7 situaciones del mandato
```text
Token válido → misma línea → misma operación   → PERMITIDO   (R1 = 200)
Token válido → otra operación                  → PERMITIDO   (R2/R3 = 200; A26 = 200)
Token válido → otro producto                   → PERMITIDO   (R2 = 200)
Token válido → mayor descuento que autorizado  → PERMITIDO   (R3 = 200)
Token expirado                                 → RECHAZADO   (R4 = 403)
Token falso                                    → RECHAZADO   (R5 = 403)
Usuario sin privilegios                        → RECHAZADO   (R6 = 403; A19/A20/E-SEC)
```

## Interpretación — hechos vs decisión
**HECHOS (verificados, no negociables):** el servidor rechaza expirados, falsos,
sin-privilegios y cross-operador. La identidad del autorizador queda registrada.
**POLÍTICA (no decidida):** la reutilización dentro del TTL (misma tienda/operador,
cualquier producto, cualquier %) es el diseño RC-1 documentado como residual P3
"manager-approval caching model" — E-SEC la dejó como decisión pendiente #3.
**NO se convierte automáticamente en cambio de código** (regla de la fase): si el
propietario decide single-use, el cambio mínimo sería registrar/consumir el jti
en una tabla de uso (o caché server-side con TTL) y rechazar jti ya consumidos;
si decide mantener el modelo de caché, basta documentarlo como política vigente.
La asimetría UI (1 venta/autorización) vs server (N ventas/TTL) queda documentada.
