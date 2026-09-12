# 07 — GATE REVIEW / RETIREMENT PLAN (pre-modificación)

## REM-V2-3 PRE-RETIREMENT REVIEW

### Candidato 1 — `RPC_MAP_V1.receipt` → `reverse_receipt`

| Campo | Valor |
|---|---|
| Current callers | route.ts:37 (map) — resuelto bajo flag=false |
| Indirect callers | 0 (sin construcción dinámica de nombres; sin otros imports) |
| Dynamic reachability | demostrada SOLO bajo flag=false (interceptación, ver 03) |
| V2 replacement | `reverse_receipt_v2` — **firma idéntica**, superior en 15/15 props (ver 04) |
| Parity | PASS |
| Security | PASS (V2 con audit_logs/FOR UPDATE; ACL censo en 05) |
| Offline | 0 caminos (offline solo create_sale_v2) |
| Tests | 0 tests operan la V1; contract pins añadidos |
| DB dependencies | 0 internos, 0 triggers (ver 06) |
| Risk | BAJO — drop-in por firma idéntica; camino flag=false mejora (V2 audita) |
| **Recommendation** | **SAFE TO RETIRE** (neutralización del map, patrón H5-B1; DB DROP diferido) |

### Candidato 2 — `RPC_MAP_V1.adjustment` → `reverse_adjustment`

| Campo | Valor |
|---|---|
| Current callers | route.ts:39 (map) |
| Indirect callers | 0 |
| Dynamic reachability | SOLO flag=false (demostrado) |
| V2 replacement | `reverse_inventory_adjustment_v2` — firma idéntica, 15/15 (ver 04) |
| Parity / Security | PASS / PASS |
| Offline | 0 |
| Tests | 0; contract pins añadidos |
| DB dependencies | 0 internos, 0 triggers |
| Risk | BAJO — drop-in; B-10 inversión verdadera ya probada en runtime heredado |
| **Recommendation** | **SAFE TO RETIRE** (ídem) |

### Candidato 3 — `void_transaction`

| Campo | Valor |
|---|---|
| Current callers | **useDocumentActions.ts:75 ACTIVO** (client JWT) + producto: POS-2 MM-9 undo 30s |
| V2 replacement | **NO EXISTE** (no hay void_transaction_v2); es parte del pipeline canónico V2 (create_sale_v2 → void_transaction, congelado por iteration-19) |
| **Recommendation** | **DO NOT RETIRE — LEGACY-BUT-REQUIRED (§28). KEEP.** |

### Otros (no candidatos)

- `create_sale`: REACHABLE (fallback fail-closed POS clásico; allow-list contractual) → **DO NOT RETIRE** en este gate.
- `reverse_transfer`/`reverse_devolution`/`reverse_production_order`: compartidos V1=V2 → **NO CANDIDATOS**.
- `reverse_transaction`: ya retirada (H5-B1, guard intacto) → verificado.

## Checklist de autorización (§16) — candidatos aprobados

| Requisito | receipt | adjustment |
|---|---|---|
| DEAD (post-neutralización) | ✓ | ✓ |
| V2 superior/equivalente | ✓ 15/15 | ✓ 15/15 |
| 0 active callers (post) | ✓ | ✓ |
| 0 dynamic callers (post) | ✓ | ✓ |
| 0 offline callers | ✓ | ✓ |
| 0 replay callers | ✓ | ✓ |
| 0 internal dependencies | ✓ | ✓ |
| security PASS | ✓ | ✓ |
| regression PASS | ✓ (ver 08) | ✓ |

## Plan quirúrgico ejecutado (una pieza, sin cleanup oportunista)

1. route.ts: entries receipt/adjustment del RPC_MAP_V1 → V2 (comentario REM-V2-3).
2. useReverseDocument.ts: comentario de documentación actualizado.
3. Scripts legacy ×3 migrados a V2 (patrón R2 de H5-B1).
4. Contract test: +4 pins (receipt/adjustment → V2; ausencia de V1 en el mapa).
5. Test de regresión permanente: `src/__tests__/api/reverse-route-v1-retirement.test.ts` (6 casos).
6. **NO** migración DB, **NO** DROP, **NO** REVOKE, **NO** cambio de FEATURES/flags, **NO** cambios de negocio.
