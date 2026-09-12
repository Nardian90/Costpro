# REM-V2-1 — 13 PLAN DE RETIRO (FASE 15) + relación con REM-INV-1 (FASES 11-12)

## Tabla de decisión por función V1

Estados: RETIRE NOW / REVOKE NOW-DROP LATER / KEEP TEMPORARILY / BLOCKED BY DEPENDENCY

| V1 FUNCTION | STATUS | ACTIVE CALLERS | V2 REPLACEMENT | PARIDAD | RECOMENDACIÓN | Dependencia bloqueante |
|---|---|---|---|---|---|---|
| `create_sale` | ACTIVE-LEGACY | `SalesCatalogView` (UI viva) | `create_sale_v2` + `/api/pos/checkout` | completa + extras | **KEEP TEMPORARILY → RETIRE**: (1) redirigir SalesCatalogView al endpoint V2 (o guard de flag), (2) REVOKE authenticated, (3) DROP tras observación | caller UI activo (migración de vista) |
| `reverse_receipt` | API-ONLY ACTIVE-LEGACY | `/api/reverse` solo con flag OFF | `reverse_receipt_v2` | V2> V1 en todos los controles críticos | **REVOKE NOW (ya service_role-only) + neutralizar RPC_MAP_V1.receipt → DROP LATER** | ninguna técnica; solo el flag OFF del mapa |
| `reverse_adjustment` | API-ONLY ACTIVE-LEGACY | `/api/reverse` solo con flag OFF | `reverse_inventory_adjustment_v2` | V2 > V1 | ídem anterior | ídem |
| `create_devolution` (overloads) | API-ONLY ACTIVE-LEGACY | `/api/devolutions` solo con flag OFF | `create_devolution_v2` | V2 > V1 (ledger+idempotencia; F-02) | ídem | ídem |
| `reverse_transaction` | DEAD | ninguno (DROP verificable H5-B1) | `reverse_transaction_v2` | — | **ya retirada** (patrón validado) | — |
| `receive_purchase` | DANGEROUSLY-REACHABLE | ninguno en repo (solo catálogo live) | familia register_reception/confirm_pending_reception | V2-family superior (guardas + WAC) | **REVOKE NOW FROM authenticated** (F-01; 1 línea; sin DDL en repo ⇒ aplicar live + registrar en evidence) | ninguna (0 purchase_items hoy) |
| `void_transaction` | ACTIVE-LEGACY (Nivel 1 POS undo B-8) | POS undo (`useInvertDocument`) | no tiene reemplazo funcional 1:1 (la ventana 30s del undo propio es un requisito de producto) | n/a | **KEEP TEMPORARILY** — hardened y con política normativa en DB; REVOKE PUBLIC (F-06) sí procede | funcionalidad de producto (undo propio) |
| `perform_inventory_adjustment` (composite inversión recepciones) | ACTIVE-LEGACY DANGEROUS | `useInvertDocument` tipo reception | `reverse_receipt_v2` (fluxo correcto) | V2 > composite | **KEEP TEMPORARILY** con migración de `useInvertDocument`→`/api/reverse`; luego REVOKE authenticated | caller UI activo |
| `void_pending_reception` | ACTIVE | `useVoidReception` (pending) | n/a (sin variante v2; PR-3 atómica y correcta) | n/a | KEEP (fuera del eje V1/V2) | — |
| `register_reception`/`confirm_pending_reception` | ACTIVE | API receptions | n/a | n/a | KEEP (familia vigente) | — |

## FASE 11 — relación con F-01 (receive_purchase)

¿Existe equivalente V2 funcionalmente completo? **SÍ**: la familia vigente de recepciones
(`register_reception` + `confirm_pending_reception` + `void_pending_reception`, con guards de
tienda, transiciones validadas y WAC via fn_recalc_wac) cubre y supera la funcionalidad de
`receive_purchase`. La remediación preferida del gate procede: **disable/revoke V1**
(`REVOKE EXECUTE ... FROM authenticated`) y NO reconstruir el V1. Nota: la función no tiene DDL
en el repo (solo live) ⇒ el retiro se aplica live y se documenta con snapshot (patrón H5-B1).

## FASE 12 — relación con F-02/F-03

- No se mezclan ejes: la migración de datos históricos y la política contable del costo base
  (F-03) y la anulación de NC fantasma (F-02) pertenecen a REM-INV-1 (decisión humana pendiente).
- Causalidad determinada (ver 08-accounting): cost_at_sale=0 = DATA LEGACY + diseño compartido
  (client-cost) V1 y V2; NC fantasma = V1 HISTORICAL (overload sin ledger, ya sin grant authenticated).
- ¿Puede reproducirse HOY por V1? NC fantasma: solo vía flag OFF de `/api/devolutions`
  (service_role server-side) con la variante histórica — superficie mínima, remediada por el retiro
  de la flag-OFF path. cost_at_sale=0: reproducible por AMBOS con productos de costo 0 (no es un
  defecto de la migración).

## Orden de retiro propuesto (compatible con §20)

1. (config) Añadir flags a `.env.example` + fijar `true` en el entorno real del operador.
2. (código) Migrar `SalesCatalogView` a `/api/pos/checkout` (o bloquear venta V1 con guard de flag).
3. (código) Migrar `useInvertDocument` recepción → `/api/reverse` (elimina composite no atómico).
4. (código) `RPC_MAP_V1.receipt/.adjustment` → resolver a V2 (patrón H5-B1) o eliminar el mapa.
5. (DB, live) REVOKE PUBLIC ×3 (F-06) + REVOKE authenticated `receive_purchase`.
6. Regresión completa + observación.
7. (DB, live) DROP de `reverse_receipt`, `reverse_adjustment`, `create_devolution` tras 0 referencias.
   Los pasos 5/7 requieren credenciales live ⇒ **quedan listos para ejecución cuando el operador
   re-provea acceso; NO se ejecutan en esta pasada** (§3 y 00-baseline).
