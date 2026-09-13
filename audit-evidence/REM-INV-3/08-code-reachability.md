# REM-INV-3 — FASE 12 — Static reachability (árbol 29f9ef2e)

Metodología: `rg` exhaustivo sobre src/, supabase/, e2e/, scripts/ (excluye
node_modules/.git), más verificación de ACL en migraciones. No se declara
"legacy" por el nombre: se declara por callers/grants medidos.

## 1. create_devolution_v2 (canónico)

| Superficie | Referencias |
|---|---|
| API route | src/app/api/devolutions/route.ts:71 (flag USE_V2_REVERSE=true → v2) |
| RPC result mapping | src/lib/supabase-traced.ts:47-48 ('result:devolution_id') |
| Duplicado | src/hooks/api/useDuplicateDocumentV2.ts:98-102 (devolution → /api/devolutions) |
| Tests | iteration-11-3.test.ts, iteration-11-5.test.ts, iteration-rls.test.ts (pins contractuales: NO se modifica el cuerpo v2) |
| ACL (migraciones) | w9-F06-C2 20260902200923: REVOKE authenticated/anon/PUBLIC + GRANT service_role → service_role ONLY |
| Conclusión | REACHABLE y ACTIVO (única ruta viva para crear NC) |

## 2. create_devolution (v1, 9-param)

| Superficie | Referencias |
|---|---|
| API route | route.ts:71 (solo bajo flag=false → fallback muerto en prod) |
| Tests | iteration-11-3.test.ts:103 (pin: no dropear el v1) |
| ACL (migraciones) | v2_12_13 (2026-07-27): REVOKE anon; GRANT authenticated + service_role. Sin REVOKE posterior encontrado en migraciones. REM-INV-1 reporta grant postgres/service_role (estado live) — divergencia no resoluble sin acceso: REENUMERAR_EN_ACCESO |
| Conclusión | DORMANT-by-flag (fallback fail-closed). Riesgo residual: si un authenticated tiene EXECUTE live sobre v1, puede llamar el RPC directo y crear documentos con efectos kardex-directo SIN stock_movements (mismo patrón fantasma). Hardening propuesto en 13-remediation-recommendation.md (fuera del alcance mutativo de este gate) |

## 3. reverse_devolution (B-10b)

| Superficie | Referencias |
|---|---|
| API route | src/app/api/reverse (RPC_MAP_V2 devolution → reverse_devolution) |
| Hook | src/hooks/api/useReverseDocument.ts:64 (invalida ['devolutions']) |
| UI | DevolutionsView + pin canReverseDocumentInStore (iteration-15-b10) |
| Migración | 20260905120000_w9_b10b (pipeline canónico exclusivo) |
| Conclusión | REACHABLE y ACTIVO |

## 4. Auxiliares del pipeline

- next_document_number: v2_19_1/v2_19_4 + vale_salida (2026-08-17, última definición en repo); usada por create_devolution_v2, invoices, quotations, z_reports, vale_salida. REACHABLE.
- register_stock_movement: última definición en repo = qa_batch2 (2026-06-26); el fix WAC F4-04 (2026-09-09) retocó register_reception, NO esta función (verificado en commit b94ca369). Llamada por v2 y reverse con p_skip_access_check=true.
- fn_sync_inventory_on_movement / auto_kardex_on_stock_movement / sync_product_stock: triggers LIVE verificados en q04-triggers.json (REM-INV-1).
- Módulo UI devolutions: DORMANT (sin entrada de navegación) — coherente con B-10b "módulo dormant, sin puerta de navegación".

## 5. Conclusión de alcance

No existe ningún camino VIVO que reproduzca el patrón fantasma de 2026-08-06
(sin venta original / qty libre / sin movimientos): el único creador activo es
create_devolution_v2 (service_role only, DF-03/DF-07, pipeline canónico). Los
dos riesgos residuales del patrón son (a) el fallback flag=false hacia v1 y
(b) un hipotético EXECUTE authenticated residual sobre v1 — ambos mitigables
con 1 línea de ACL en un gate de remediación autorizado.
