# PR-VERIFICATION — Auditoría independiente de los PRs objetivo

**Misión:** CP-BRA-FINAL-VERIFICATION-AND-INV005-001 · **Fecha:** 2026-11-26
**Método:** examen del código real de cada rama (git diff), checks de CI vía API, verificación DDL de producción, pruebas locales. No se aceptó ninguna afirmación de agentes anteriores sin verificación directa.

## Resultado global

| PR | Dominio | Hallazgo | Veredicto de auditoría | Fusión |
|---|---|---|---|---|
| #1717 | Motor de pagos y reversiones | R-01 + R-14 | **APTO** — implementación correcta y fail-closed | `5563356fb` |
| #1718 | Cuentas por cobrar | R-02 | **APTO** — tasa canónica sin constantes | `800d92ff3` |
| #1719 | Incidencias POS | R-11 | **APTO** — validación server-side real | `9e78fc5f0` |
| #1720 | Proveedores | R-15 | **APTO** — dedup server-side con decisión §8.4 respetada | `33ec0975c` |

Los 4 fusionados con `merge_method: merge` (estrategia del repositorio), en la única secuencia válida (1717→1718→1719→1720) impuesta por la cadena lineal de commits verificada en git (GITHUB-STATE.md §4).

## #1717 — R-01 (rama OT del trigger) + R-14 (guard de período fiscal)

**Contenido real examinado** (14 archivos, +1227/−35): migración `20261126140000` (511 líneas), test de contrato (13 pruebas), mapeo de error en `/api/payments/[id]`, surface de contrato, manifiestos.

1. **Lógica del trigger re-emitido:** las TRES ramas (receipt | service | production_order|work) con neteo de contra-filas (`direction='reversal'` resta) en las tres; lectura `COALESCE(NEW,OLD)` para que DELETE recompute; guard de OT `voided` (no toca saldos de documentos anulados). Verificado contra el SQL en producción (rama OT presente, 3× neteo, guard) — **coincide**.
2. **`register_supplier_payment`:** rama OT con `FOR UPDATE` (misma vía de bloqueo que receipt|service) + `ERR_ORDER_NOT_PAYABLE` solo para `voided`; draft sigue permitido (34 pagos históricos en draft — anticipos operativos; restricción adicional es decisión del propietario, documentada como tal).
3. **`reverse_supplier_payment` R-14:** firma de 5 args; **el overload de 4 args fue eliminado con DROP** (no queda vía antigua sin guard — lección ADN-009 verificada en producción: 1 sola función); guard consulta `fiscal_closings` en estado `closed|locked` por la fecha del pago ORIGINAL; la excepción exige `p_allow_closed_period` AND `is_admin_check` AND motivo no vacío, y audita `PAYMENT_REVERSED_CLOSED_PERIOD` con contexto completo. La idempotencia por `reverses_payment_id` se evalúa ANTES del guard (correcto: un reintento de reversión ya aplicada no abre el tema de período).
4. **Concurrencia:** advisory lock (`pg_advisory_xact_lock('revpay:'+id)`) + `FOR UPDATE` sobre la fila de pago original. Reversión de contra-fila bloqueada (`ERR_PAYMENT_NOT_REVERSIBLE`). Solo `receipt|service` reversible (OT hoy sin vía de reversión — FIN-013 documentado).
5. **Caller API:** mapeo de `ERR_PAYMENT_IN_CLOSED_FISCAL_PERIOD` → HTTP 409; sin cambios de contrato en rutas.
6. **Pruebas:** 13/13 de contrato en local tras fusión; CI 9/9 en el head.
7. **Sin secretos en el diff; sin permisos nuevos; ACLs service_role exclusivo re-declaradas.**

## #1718 — R-02 (tasa canónica CxC)

**Contenido real examinado** (18 archivos): helper puro `src/lib/accounts-receivable/rates.ts`, ruta CxC, vista CxC, pruebas (9).

1. `resolveCanonicalRate`: CUP→1; divisa con fila en `store_exchange_rates` y rate>1 → esa tasa; **sin tasa → `null` (fail-closed, sin fallback)**. Verificado que NO queda constante 450: `grep "* 450"` en la ruta = 0 coincidencias tras fusión (antes: `route.ts:123`).
2. `convertBalanceToCup`: null rate → null (el saldo se expone en moneda original); redondeo canónico round2 con EPSILON (semántica ROUND(numeric,2)).
3. Ruta: tasa resuelta UNA vez por request; `balance_cup` nullable + `exchange_rate_used` expuesto; **KPIs y summary solo sobre saldos con tasa** (FIN-009: monedas distintas nunca se suman); bloque `unrated {count, total_by_currency}` para transparencia.
4. Vista: badge «(+N sin tasa)» en grupos con saldos no convertibles.
5. **Pruebas:** 9/9 en local (incluye regresión «×450 eliminado»); CI 9/9.

## #1719 — R-11 (incidencias POS server-side)

**Contenido real examinado** (21 archivos): migración `20261126150000` (1.388 líneas — reemisión VERBATIM de `create_sale_v2` salvo 2 bloques), test de contrato, pruebas del checkout.

1. **§11.6 estructura:** cada incidencia debe ser objeto con `type` ∈ {insufficient_payment, overpayment, mixed_breakdown_mismatch, rate_difference}; `expected_cup/received_cup/difference_cup` numéricos y no negativos; **coherencia aritmética** `difference_cup = received_cup − expected_cup` ±0.01 (`ERR_INCIDENT_ARITHMETIC_MISMATCH`).
2. **§18 cobertura:** si `Σamount_cup ≠ total` y no hay incidencia cuya `difference_cup` iguale EXACTAMENTE el descuadre real (±0.01) → `ERR_INCIDENT_DOES_NOT_EXPLAIN_DIFFERENCE`. Antes, un array no vacío arbitrario desactivaba PT011 completo; ahora la puerta MISIÓN-FLEX sigue abierta (decisión del propietario) pero **ya no es evadible**. PT011 intacto cuando no hay incidencias.
3. Fail-closed adicional: incidencias con USD/EUR sin tasa real >1 → `ERR_RATE_REQUIRED_FOR_INCIDENT`.
4. **Verificación de fidelidad VERBATIM:** el test de contrato de la migración compara el cuerpo; CI SQL Static/DB Security green; DDL productivo contiene los tres errores `ERR_INCIDENT_*` (sonda propia PASS).
5. **Las 3 ventas históricas de producción** (−200, −12.000, +8.100): analizadas SOLO LECTURA (`scripts/cpbra-r11-historical-sales.mjs`): las tres tienen incidencias estructuralmente válidas (§11.6) que explican la diferencia real (§18) — **compatibles con las reglas actuales y trazables** (notas + `payment_incidents` + tipos correctos). No se modificó ninguna.
   - **Advertencia de auditoría (no confundir aceptación con conciliación):** ser compatibles con las reglas NO significa que la operación financiera esté conciliada: la venta `1df5d727` tiene `total=0` con 12.000 CUP cobrados (precio de catálogo en 0 en el momento de la venta — problema de datos maestros, documentado en la incidencia misma «a revisar por el propietario») y la venta `28e94349` dejó un pendiente real de 8.100 CUP sin cobrar. Ambas quedan como **excepciones de negocio abiertas** para el propietario (HISTORICAL-EXCEPTIONS.md).
6. **E2E de humo (evidencia del expediente + CI):** 55/57 con los 2 fallos UI documentados como limitación dev-mode/4GB (CI usa build de producción); guardrail net-zero PASS ×2.

## #1720 — R-15 (dedup server-side de proveedores)

**Contenido real examinado** (27 archivos): migración `20261126160000` (155 líneas), RPC `create_supplier_local`, migración del hook `useCreateSupplier` al RPC, `SupplierSelector` con confirmación explícita, pruebas (8 contrato + 7 hook).

1. **RPC autoritativo:** reuso exacto case-insensitive (`status='reused'`); sospechosos por nombre normalizado (espaciado/caso — causa raíz «TiendaPueblo»), NIT o teléfono de proveedores ACTIVOS de la MISMA tienda; con sospechosos → fail-closed `ERR_SUPPLIER_DUPLICATE_SUSPECTED` con candidatos en el mensaje, salvo `p_confirm_duplicate=true` + motivo ≥3 chars → crea y audita `SUPPLIER_DUPLICATE_CONFIRMED` (decisión, candidatos y motivo en metadata).
2. **Unicidad NO estricta respetada** (decisión §8.4 del propietario): sin UNIQUE por nombre — verificado en producción (los 2 UNIQUE existentes son `suppliers_pkey(id)` y `suppliers_master_party_unique(master_party_id, store_id)`, preexistentes de Catálogo Maestro). La duplicación deliberada es posible pero jamás silenciosa.
3. **Autorización anti-spoofing:** caller desde la sesión (`auth.uid()`; `p_user_id` solo con service_role); `is_admin_check OR has_store_access_as`; ACL `{postgres, authenticated, service_role}`.
4. **Frontend:** la advertencia de UI (#1716) se conserva y la última barrera pasa a ser la BD (SEC-001: la UI es conveniencia).
5. **Pruebas:** 6/6 funcionales en aislada (evidencia del expediente) + 8/8 contrato + 7/7 hook en local; CI 9/9.

## Controles transversales verificados en los 4 PRs

1. Estado real: OPEN → merged en la secuencia única (cada fusión confirmada por API con SHA).
2. CI: 9/9 success en cada head (incluido `E2E Aislado (project)` manual ejecutado en los 4).
3. Sin conflictos en ningún paso (`mergeable_state: clean`); tras cada fusión el siguiente PR recalculó su diff sin conflicto.
4. Secretos: escaneo del diff completo de la cadena (`github_pat_`, `sb_secret_`, `sbp_`, `sb_publishable_`, `eyJhbGciOi`, contraseñas) → **0 coincidencias**.
5. Manifiestos sensibles: `ci-gate-allowlist.json` solo RETIRA la entrada de drift temporal `register_supplier_payment/12` (endurecimiento); `writers.manifest.json` solo AÑADE el script de aplicación como guardProtected; `e2e-migrations-manifest.json` incluye las 3 migraciones (215→218) con sus SHA.
6. Declaración CP-BRA-001: los 4 PRs actualizan `BUSINESS-RULES-CATALOG.md`, `RISK-REGISTER.md` y `TRACEABILITY-MATRIX.md` (verificado en los diffs).
7. Producción: las migraciones ya estaban aplicadas (MIGRATION-RECONCILIATION.md); fusionarlas en main NO disparó ningún cambio de BD. Verificación post-fusión: todos los artefactos presentes, forensic 7 críticos sin cambios.
