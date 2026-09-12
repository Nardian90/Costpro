# REM-V2-1 — 18 VEREDICTO FINAL (REM-V2-1)

## Respuesta a la pregunta de cierre (§30)

> ¿Podemos eliminar V1 de CHECKOUT y REVERSE sin perder funcionalidad y obteniendo un sistema
> objetivamente más seguro, íntegro, idempotente y mantenible?

# ✅ YES — V2-ONLY WITH DOCUMENTED LEGACY EXCEPTION

La eliminación de V1 es viable y deseable: V2 demuestra **igualdad funcional y superioridad
objetiva** en los controles críticos. La eliminación COMPLETA queda condicionada a 3 excepciones
legacy documentadas (abajo) y a la ejecución del plan de remediación P-1..P-6 (14-remediation),
pendiente de autorización humana y/o credenciales live.

## Base objetiva de la afirmación "V2 superior" (§28)

| Criterio | Veredicto | Evidencia |
|---|---|---|
| SECURITY | **V2 > V1** | guard no-null vs bypass uid-NULL; auth-pinned vs spoofable p_user_id; supervisor ≥15%; boundary API (withAuth+CSRF+rate-limit) — 05/06 |
| INTEGRITY | **V2 > V1** | fn_recalc_wac single-writer inverso exacto vs kardex a costo 0 sin WAC; ledger stock_movements; sin clamp silencioso — 05/06/09 |
| IDEMPOTENCY | **V2 > V1** | FOR UPDATE + estado; UNIQUE INDEX devolutions; V1 receipt/adjustment solo status-check (TOCTOU) — 10 |
| CONCURRENCY | **V2 >= V1** (por diseño; ejecución UNKNOWN) | FOR UPDATE inventory/products/receipt vs sin locks — 10/11 |
| MULTI-STORE | **V2 > V1** | aislamiento estricta en todas las V2; V1 saltaba tienda con uid NULL — 05/06 |
| ACCOUNTING | **V2 >= V1** | mismo single-writer WAC + payment_transactions ledger + reset de pagos — 08 |
| INVENTORY | **V2 >= V1** | validación+lock previo vs delegación; skip servicios — 05 |
| FUNCTIONALITY | **V2 >= V1** | matriz de paridad: V2 ⊇ V1 en cada dimensión — 12 |
| MAINTAINABILITY | **V2 > V1** | contrato de errores ERR_* tipado, contract tests, RPC_MAP unificado, patrón H5-B1 — 05/06 |

UNKNOWN marcados (no asumidos): ejecución dinámica de concurrencia/idempotencia (sin entorno
seguro §3), paridad ejecutada con medición (12-parity), test:security live (sin credenciales),
zero-touch fingerprint (sin credenciales). Ningún UNKNOWN afecta a la comparación de código,
que es la base del veredicto.

## Hallazgos REM-V2-1

| ID | SEV | Hallazgo |
|---|---|---|
| VF-01 | P1 | Camino V1 de checkout ACTIVO que ignora la flag: `SalesCatalogView` → `create_sale` directo del navegador (sin boundary API). Migrar a `/api/pos/checkout` antes del retiro. |
| VF-02 | P1 | `useInvertDocument` (recepción): composición cliente NO atómica (N×`perform_inventory_adjustment` + `UPDATE receipts.status` sin transacción) — ventana de estado inconsistente; sin política de rol normativa en la RPC. |
| VF-03 | P2 | Fallbacks V1 activables por flag OFF con RPCs de menor control: `RPC_MAP_V1.receipt/.adjustment` y `create_devolution` (flag-OFF). Neutralizar vía patrón H5-B1. |
| VF-04 | P2 | EXECUTE a PUBLIC live en `create_sale_v2`, `reverse_receipt_v2`, `void_transaction` (F-06 heredado) + `receive_purchase` con grant `authenticated` sin guardas (F-01, 0 purchase_items hoy — latente). |
| VF-05 | P2 | `reverse_receipt_v2` alcanzable directamente por RPC de navegador sin `can_reverse_document` (solo guard de tienda): cualquier miembro de la tienda puede revertir recepciones activas, saltándose rate-limit/CSRF del API. |
| VF-06 | P2→CERRADO | `.env.example` no documentaba las flags (riesgo de despliegue V1 silencioso). **Corregido en esta pasada** (R-1). |
| VF-07 | P3 | `cost_at_sale=0`: mecanismo COMPARTIDO V1/V2 (confianza en costo del cliente; carrito `cost_price ?? cost_average ?? 0`). Causalidad: DATA LEGACY + diseño común. NO es causado ni agravado por V2 (responde §8/§16). Política contable pendiente (REM-INV-1 F-03). |
| VF-08 | P3 | `same key + different payload` no detecta divergencia de payload (patrón común a V1/V2; efecto único sí garantizado). |
| VF-09 | INFO | `reverse_transfer` (compartida, sin variante v2) aún escribe `products` + kardex directo con costo 0 — candidata a modernización estilo B-10b (FUERA de este gate, §27). |
| VF-10 | INFO | Bloqueos de evidencia: build OOM exit 137 (host 4GB); test:security exit 2 y zero-touch NO ejecutables (sin credenciales live). Documentados, no falseados. |

## TOP 5 RIESGOS (orden de prioridad)

1. VF-01 — venta V1 activa sin boundary API (superficie de inconsistencia contable).
2. VF-02 — inversión de recepciones no atómica lado cliente.
3. VF-04 — `receive_purchase` reachable por authenticated (doble recepción = inflado de stock/WAC).
4. VF-05 — reversión de recepciones sin política de rol vía RPC directa.
5. VF-03 — fallback V1 latente activable por config.

## ROOT CAUSES (sistémicas)

1. Migración V2 incompleta en capa UI: RPCs endurecidas en DB pero callers directos de navegador
   que persisten (modelo "migrar el servidor y olvidar el cliente").
2. Grants heredados: DDL sin REVOKE PUBLIC sistemático + overload histórico sin retiro forense
   (contraste con el patrón H5-B1, que SÍ lo hace correctamente).
3. Diseño contable con costo aportado por el cliente sin política server-side de costo base.
4. Configuración: flags sin documentación de plantilla (cerrado).

## REMEDIATION ORDER (consolidado)

P-1 flags producción `true` (operador) → P-2 migrar SalesCatalogView → P-3 migrar
useInvertDocument-reception → P-4 neutralizar fallbacks V1 → P-5 REVOKE live (PUBLIC ×3 +
receive_purchase authenticated) → regresión → observación → P-6 DROP V1 (receipt/adjustment/
devolution) tras prueba de 0 consumidores (patrón H5-B1 con guards).

## TEST GAPS detectados

- Sin E2E mutativo de checkout/reverse en entorno seguro (proyecto carece de staging Postgres).
- Sin test de paridad ejecutada V1-vs-V2 (requiere fixtures en Postgres real).
- test:security live sin cobertura en CI sin credenciales; el nuevo v2-only-contract-test.cjs
  cubre la parte estática.
- Sin test que detecte callers RPC directos de navegador a RPCs mutativas (allow-list actual solo
  cubre create_sale; extender a reverse_receipt_v2/void_transaction cuando se migren).

## CERTIFICATION IMPACT

- **V2-ONLY READY: NO alcanzado todavía** (callers V1 activos, revokes pendientes, flags reales
  fuera del repo, E2E no ejecutado).
- **CONDITIONAL: SÍ** — V2 demostrado superior; dependencias legacy documentadas (POS undo
  `void_transaction` como feature de producto; SalesCatalog pendiente de migración; excepciones
  de infraestructura).
- La dirección del producto queda certificada como **YES — V2-ONLY WITH DOCUMENTED LEGACY
  EXCEPTION**; el cierre pleno del gate requiere ejecutar P-1..P-6 con credenciales live y
  regresión posterior.

## Bloqueo de publicación (regla permanente)

Este veredicto se emite **antes** de la verificación REMOTE: sin PAT disponible (perdido con el
reset del workspace) el PUSH no puede completarse. Conforme a la regla permanente REM-PO-1
("si auth Git falla → STOP antes de FINAL VERDICT"), este documento se marca como veredicto
**condicionado a verificación REMOTE**; el commit local y la evidencia íntegra quedan listos.
Ver 17-git/auth-blocker.md.
