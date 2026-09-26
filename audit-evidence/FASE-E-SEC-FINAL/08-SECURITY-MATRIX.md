# FASE E-SEC-FINAL — 08 SECURITY MATRIX (FASE 4 + 5 del mandato)

**Script**: `/home/z/my-project/scripts/esecf-matrix.py` · **Resultado crudo**: `esecf-matrix-results.json`
**Entorno**: LIVE Supabase, fixture aislado (tienda sintética ESEC TEST 205ed126…, productos PA 500 / PB 300 / PC 100 / PR19 19.99 / PR33 33.33 / PR99 99.95 / PR01 0.01 con stock vía `register_stock_movement`).
**Camino probado**: ROUTE `/api/pos/checkout` (camino delegado encargado→admin con token real) + RPC directo con JWT admin (self-session/offline) + RPC directo service_role (unidad de política).

## Resultado: **35/35 PASS** (ejecuciones 2026-09-26T20:52–21:05Z tras el reorden de denegaciones)

### Normales (REGLA CRÍTICA — precio legítimo preservado)
| # | Caso | Esperado | Resultado |
|---|---|---|---|
| N1 | 500→500 (0%) sin supervisor | 200 | ✅ 200 |
| N2 | 500→490 (2%) sin supervisor | 200 | ✅ 200 |
| N3 | 500→450 (10%) sin supervisor | 200 | ✅ 200 |
| N4 | <15% + reason vacío → motivo NO exigido | 200 | ✅ 200 |

### Umbral (≥15% exacto dispara)
| # | Caso | Esperado | Resultado |
|---|---|---|---|
| U1 | 500→425 (15.000%) sin supervisor | 403 | ✅ 403 "Se requiere autorización de supervisor" |
| U2 | 500→424.99 (15.002%) sin supervisor | 403 | ✅ 403 |
| S1 | 500→400 (20%) sin supervisor | 403 | ✅ 403 |
| S2 | 500→300 (40%) sin supervisor | 403 | ✅ 403 |

### Varias líneas (D1 — cierre de la dilución agregada)
| # | Caso | Esperado | Resultado |
|---|---|---|---|
| M1 | A 500→500 + B 300→240 (agg 7.5% <15%) | 403 por B | ✅ 403 |
| M2 | Explotación A+B+C (agg 6.67%) | 403 | ✅ 403 |

### Token (D3)
| # | Caso | Esperado | Resultado |
|---|---|---|---|
| T1 | token válido → 1ª operación (425 + motivo) | 200 | ✅ 200 |
| T2 | MISMO token → 2ª operación | 403 REUSED | ✅ 403 "ya fue utilizada" |
| T3 | token → OTRO producto (PB 50%) | 403 SCOPE | ✅ 403 |
| T4 | token → MAYOR descuento (px 425, vende 400) | 403 SCOPE | ✅ 403 |
| T5 | token → OTRA línea ≥15% no autorizada | 403 SCOPE | ✅ 403 |
| T6 | token expirado (firma válida, exp −300s) | 403 | ✅ 403 |
| T7 | token falsificado (firma corrupta) | 403 | ✅ 403 |
| T8 | token de otro operador (checkout como admin) | 403 | ✅ 403 |
| T9 | token de otra tienda (store_id extranjero) | 403 | ✅ 403 |

### Motivo (D2)
| # | Caso | Esperado | Resultado |
|---|---|---|---|
| R1 | ≥15% + motivo ("   cliente frecuente   ") | 200 (trim) | ✅ 200 |
| R2 | ≥15% + supervisor + motivo vacío | 403 | ✅ 403 ERR_DISCOUNT_REASON_REQUIRED |
| R4 | motivo >500 chars | 400 (Zod) | ✅ 400 |
| N4 | <15% + motivo vacío | 200 | ✅ 200 (no exigido) |

### Self-session / offline / unidad de política
| # | Caso | Esperado | Resultado |
|---|---|---|---|
| SS1 | RPC admin self-session 20% + motivo (sin token, por diseño) | 200 | ✅ 200 `supervisor_path='self_session'` |
| SS2 | RPC self-session SIN motivo | 400 | ✅ 400 ERR_DISCOUNT_REASON_REQUIRED (D2 también offline) |
| SS3 | RPC encargado citando supervisor ajeno (authenticated) | 400 | ✅ 400 ERR_SUPERVISOR_UNAUTHORIZED (RC-1 intacto) |
| SV1 | service_role con gate y SIN jti | 400 | ✅ 400 ERR_SUPERVISOR_TOKEN_REQUIRED (fail-closed) |

### Redondeo (D5)
| # | Caso | Esperado | Resultado |
|---|---|---|---|
| RD1 | 19.99×3 + 33.33×2 + 99.95 + 0.01 → 226.59 | 200 ∧ DB total 226.59 | ✅ (UI==server==DB) |
| RD2 | 33.33→22.22×3 (33.33% autorizado) | 200 ∧ price_at_sale 22.22 | ✅ |

### Snapshot (D4)
| # | Caso | Esperado | Resultado |
|---|---|---|---|
| SN1 | venta catalog 500 → sale 450 | 200 | ✅ |
| SN2 | catálogo cambiado a 600 → línea histórica | 500/450/50/10 | ✅ `{catalog_price_at_sale:500, price_at_sale:450, item_discount_value:50, item_discount_pct:10}` |

### Auditoría (FASE 8)
| # | Caso | Resultado |
|---|---|---|
| A1 | metadata T1 reconstruible | ✅ reason + supervisor_id + supervisor_path='token' + jti + lines[] + policy_version='E-SEC-FINAL' |
| A2 | `supervisor_token_usages` | ✅ jti → transaction_id de T1, supervisor y operador correctos |

### Integridad (FASE 5)
| # | Caso | Resultado |
|---|---|---|
| IG1 | stock 50→49 + movement 'sale' `quantity_change=−1` (`reference_id`=tx) | ✅ |
| IG2 | oversell qty 999 → | ✅ 409 ERR_INSUFFICIENT_STOCK |
| I1 | idempotencia misma key → misma tx, 2ª = 'idempotent' | ✅ |

## Bypass agregado: CERRADO
M1/M2 demuestran que el carrito {20% en una línea + 0% en otras} ya NO es autorizable sin supervisor aunque el agregado sea <15% — ni por route ni por RPC directo.
