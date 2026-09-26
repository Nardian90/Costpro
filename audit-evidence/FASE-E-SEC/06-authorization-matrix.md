# FASE E-SEC — 06 AUTHORIZATION MATRIX (GATE E5/E10 — actores y umbral)

## Fecha
2026-09-26 · matriz completa ejecutada PRE y POST fix (mismo fixture).

## Matriz de actores (roles reales del sistema: admin, encargado)
| Actor | Operación | PRE-fix | POST-fix | Evidencia |
|---|---|---|---|---|
| admin fixture | venta al catálogo 500→500 | 200 | 200 | A1 |
| admin fixture | 500→490 vía descuento global | 200 | 200 | A2 |
| admin fixture | 500→490 precio negociado por ítem (2%) | 200 | **200** (sin supervisor — <15%) | A3, A21e |
| admin fixture | 500→450 (10%) | 200 | **200** (sin supervisor — <15%) | A10 |
| admin fixture | 500→300 (40%) sin autorización | 200 ❌ | **403 ERR_SUPERVISOR_REQUIRED** | A11 |
| admin fixture | 500→1 / 0.01 / 0 | 200 ❌ | **403 ERR_SUPERVISOR_REQUIRED** (desvío 99.8–100% ≥15%) | A5, A6, A7 |
| encargado | 500→490 (2%) | 200 | **200** (puede vender con precio negociado) | A21e |
| encargado | 500→300 (40%) sin autorización | 200 ❌ | **403** (no es admin/manager y no aporta token) | A20 |
| encargado + supervisor admin real (token firmado de supervisor-check) | 500→300 (40%) | n/a | **200 — venta creada** (tx 3c0b7624) | A25 |
| cualquiera | supervisor_user_id falso sin token | 403 | **403** (RC-1 intacto) | A19 |
| anon (sin sesión) | RPC directo | 400 ERR_UNAUTHORIZED | 400 ERR_UNAUTHORIZED | B7 |
| encargado | RPC directo 500→300 | 200 ❌ | **400 ERR_SUPERVISOR_REQUIRED** | B4 |

## Resto de la matriz de seguridad del precio (§6 del mandato)
| Ataque | PRE | POST |
|---|---|---|
| $500→$490 | 200 | **200** (debe seguir siendo posible — cumple) |
| $500→$450 / $300 | 200 sin control | 200 / **403** (siguen reglas: <15% libre, ≥15% supervisor) |
| $500→$1 | 200 (explotación) | **403** |
| $500→$0 | 200 | **403** (0 = 100% de desvío → exige supervisor; sin regla explícita de regalo gratuito) |
| $500→−$1 vía route | 400 (Zod) | 400 (Zod) |
| $500→−$1 vía RPC directo | 400 incidental (aritmética) | **400 ERR_INVALID_PRICE** (regla explícita) |
| `NaN` (route / RPC) | 400 / 400 incidental | 400 / **400 ERR_INVALID_PRICE** |
| `Infinity` / `-Infinity` | 400 / 400 incidental | 400 / **400 ERR_INVALID_PRICE** |
| string no numérico | 400 | 400 |
| precisión inválida 490.999999 | 200 | 200 (2% — dentro de la política; redondeo comercial, DECISIÓN PENDIENTE documentada) |
| precio de otro producto sobre PA (80%) | 200 ❌ | **403** (A24b) |
| producto de otra tienda | 400 ERR_STORE_MISMATCH + rollback | 400 (idéntico — aislamiento intacto) |
| producto inexistente | 400 | 400 |
| producto desactivado | 200 (regla existente: sin chequeo is_active) | 200 (sin cambio — regla existente aplicada, documentado como observación) |
| precio antiguo/stale | n/a (el precio vigente se lee server-side en la TX bajo lock) | ídem |
| descuento falso (global 40% con uuid falso) | 403 | 403 |
| rol falso / supervisor falso | 403 | 403 |
| modificación directa del HTTP payload | aceptaba cualquier precio ❌ | validada server-side contra catálogo |

## Interpretación
La identidad, el rol y la autorización provienen SIEMPRE de fuentes server-side
(JWT de sesión, membership en DB, token firmado RC-1). El único dato que faltaba
(price_at_sale) ahora pasa por la misma política de autorización existente (≥15%
→ supervisor admin/manager). El gate NO convierte el catálogo en camisa de fuerza.
