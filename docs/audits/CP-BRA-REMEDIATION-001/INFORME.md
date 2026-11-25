# INFORME FINAL — CP-BRA-REMEDIATION-001

**Misión:** Remediación integral de reglas de negocio y certificación progresiva de COSTPRO
**Fecha:** 2026-11-25 · **Estándar rector:** CP-BRA-001 · **Misión precedente:** CP-SAAS-BUSINESS-RULES-CERTIFICATION-001 (PR #1715)
**PRs de esta misión:** #1717 (R-01+R-14) · #1718 (R-02) · #1719 (R-11) · #1720 (R-15)

---

## 1. FASE 0 — Estado real verificado

- **PR #1715: FUSIONADO** el 2026-11-25 18:31:22Z (merge commit `ea2eb0503`, head `e55839c25`, 7/7 check-runs
  success, sin conflictos). El estándar CP-BRA-001 (catálogo de 72 reglas + puerta CI + manifiesto) está
  integrado en main. No se repitieron operaciones (misión §2).
- **PR #1716 (posterior, 18:39:04Z):** guards del ciclo de vida de pagos (4 vías), saneamiento TiendaPueblo,
  filtros CxP, advertencia UI de duplicados. La reversión Pixelarte $1,800 (operación gobernada pendiente)
  **ya estaba ejecutada** (audit `PAYMENT_REVERSED` 17:52Z). 0 PRs ajenos tocados; 0 PRs abiertos al inicio.
- Entorno restaurado: repo clonado, `bun install --frozen-lockfile`, `.env` principal (sección 4 del prompt),
  PM2 online con **health 200**.

## 2. FASE 1-2 — Auditoría forense de los 7 críticos (código + producción)

Script re-ejecutable: `scripts/cpbra-forensic-7criticals.mjs` (solo lectura vía Management API;
excepción justificada en writers.manifest).

| R | Diagnóstico código | Evidencia producción (2026-11-25) | Prioridad | Estado tras esta misión |
|---|---|---|---|---|
| R-01 | ABIERTO: reemisión 20261124120000 del trigger `update_payment_status` sin la rama OT (perdida desde 20261113120800) | 18/18 OTs pagadas aún coherentes (pagos previos a la reemisión); 34 pagos sobre OT draft sin gate; TODO pago futuro habría quedado sin actualizar `paid_amount` | P1 | **REMEDIADO (#1717)** |
| R-02 | ABIERTO: tasa fija ×450 en CxC (route.ts:123) | 0 OT no-CUP activas (riesgo latente) | P1 | **REMEDIADO (#1718)** |
| R-04 | REMEDIADO por #1716 (guards fail-closed en 4 vías) | 0 recepciones/servicios anulados con pagos vivos; reversión Pixelarte ejecutada | P1 | **CERRADO (verificado)** |
| R-05 | ABIERTO: `confirm_inventory_adjustment` sobrescribe stock con autorización mínima | 1 ajuste confirmado (rol encargado) — exposición baja | P1 | **PENDIENTE — decisión del propietario (§6)** |
| R-11 | ABIERTO: `payment_incidents[]` desactiva PT011 sin verificación | **3 ventas completed con Σpagos≠total (−200, −12 000, +8 100)** — impacto real | P1 | **REMEDIADO (#1719)** |
| R-14 | ABIERTO: reversión sin guard de período fiscal | 0 cierres fiscales aún (riesgo latente) | P2 | **REMEDIADO (#1717)** |
| R-15 | PARTIAL: advertencia solo en frontend | 0 duplicados actuales; incidente TiendaPueblo saneado | P1 | **REMEDIADO (#1720, vía RPC)** |

## 3. Remediaciones implementadas (cada una con expediente, pruebas y aplicación §11g)

### PR #1717 — Motor de pagos (R-01 + R-14) · migración 20261126140000
- `update_payment_status` reemitido con las **TRES ramas** (receipt|service|production_order|work): rama OT
  restaurada **con neteo de contra-filas** + guard de OT voided + recomputo en DELETE.
- `register_supplier_payment`: rama OT con `FOR UPDATE` + `ERR_ORDER_NOT_PAYABLE` (voided).
- `reverse_supplier_payment`: firma de 5 args con guard `ERR_PAYMENT_IN_CLOSED_FISCAL_PERIOD` (patrón
  v2_19_3) + excepción administrativa auditada `PAYMENT_REVERSED_CLOSED_PERIOD`; overload de 4 args eliminado.
- **Evidencia:** 9/9 marcas en aislada y producción; prueba funcional con ROLLBACK (400→partial; +600→paid;
  reversa 100→900); 13 pruebas de contrato; replay 215→216; surface re-certificado (232 fn).

### PR #1718 — CxC tasa canónica (R-02)
- Helper puro `src/lib/accounts-receivable/rates.ts` (tasa vigente de `store_exchange_rates`; CUP→1;
  **sin tasa → null, nunca constante**); ruta con `balance_cup` nullable + `exchange_rate_used`; KPIs solo
  sobre saldos con tasa (FIN-009) + bloque `unrated` transparente; vista con badge «sin tasa».
- **Evidencia:** 9 pruebas (incluida regresión «×450 eliminado»).

### PR #1719 — Incidencias POS (R-11) · migración 20261126150000
- `create_sale_v2` reemitido VERBATIM con validación server-side: §11.6 estructura tipada + coherencia
  aritmética; §18 el descuadre real debe estar EXPLICADO por una incidencia (ERR_INCIDENT_*). La puerta
  MISIÓN-FLEX sigue abierta (decisión del propietario) pero ya no es evadible.
- **Evidencia:** 5/5 marcas aislada y producción; **E2E de humo con swap de entorno: 55/57** (toda la batería
  POS; **POS-015b «importe parcial CON incidencias: se registra» PASS** = compatibilidad probada; guardrail
  net-zero ×2; los 2 fallos UI son la limitación dev-mode/4GB documentada en playwright.config.ts — CI usa
  `next start`); 7 pruebas de contrato; replay 216→217.

### PR #1720 — Dedup server de proveedores (R-15) · migración 20261126160000
- RPC `create_supplier_local` como vía autoritativa: reuso exacto; sospechosos por nombre normalizado
  (semántica `normalizeSupplierName`)/NIT/teléfono → `ERR_SUPPLIER_DUPLICATE_SUSPECTED` con candidatos,
  salvo confirmación explícita + motivo → audita `SUPPLIER_DUPLICATE_CONFIRMED`. **Unicidad NO estricta**
  (decisión §8.4 del propietario respetada): la duplicación deliberada es posible pero **jamás silenciosa**.
- Hook `useCreateSupplier` migrado al RPC (la última barrera es la BD — SEC-001); SupplierSelector envía la
  confirmación explícita tras su advertencia.
- **Evidencia:** prueba funcional 6/6 en aislada (alta/reuso/rechazo/fail-closed-sin-motivo/confirmación+auditoría/
  sin-actor) con limpieza exacta; 8 pruebas de contrato + 7 del hook; replay 217→218; surface 233 fn.

## 4. Estado de certificación tras la misión (matriz TR-)

- **12 VERIFICADAS/CERTIFICADAS · 3 CONDICIONALES · 0 RECHAZADAS** (antes: 10/3/3).
- FIN-011 (R-01+R-02): VERIFICADA en código (certificación plena tras E2E aislado en CI).
- POS-006 (R-11): VERIFICADA en BD. FIN-004/FIN-008 (R-14): límite/riesgo resueltos.
- PRO-001 (R-15): VERIFICADA vía RPC. FIN-012/FIN-002 se conservan certificadas.
- **El sello global «COSTPRO — BUSINESS RULES COMPLIANCE: VERIFIED» sigue PENDIENTE** mientras R-05
  quede abierto (regla crítica RECHAZADA→decisión) — criterio de cierre de la misión §11.

## 5. Decisiones pendientes del propietario (presentadas, no ejecutadas)

1. **R-05 (INV-005) — segundo control en ajustes de inventario.** Propuesta concreta: exigir confirmación
   por rol de gestión (admin/manager/encargado — patrón `canManageStore` de /api/payments) o, mejor,
   tope de desviación (patrón POS ≥15%) con supervisor (maquinaria D1–D5 existente en create_sale_v2).
   El único ajuste histórico lo confirmó un encargado (rol con gestión) → la elevación de rol no habría
   roto el uso real. **Se requiere autorización porque fija política de autorización operativa.**
2. **R-11 política:** tope máximo por incidencia (X CUP o % del total) y/o supervisor obligatorio sobre
   umbral; motivo obligatorio en la UI.
3. **R-15 opcional:** UNIQUE parcial `(store_id, lower(btrim(name)))` — reversa la decisión §8.4 y exigiría
   saneamiento histórico previo (hoy 0 duplicados).
4. **3 recepciones sin proveedor ($19,435)** y **quirks residuales**: sin evidencia de identidad suficiente
   (sin NIT/factura/contacto) — permanecen como excepciones pendientes (no se asignan por conveniencia).

## 6. Verificaciones ejecutadas

- Vitest: 36/36 + 30/30 + 25/25 (contratos de migración, replay, rates, hook) — todas las suites nuevas en verde.
- `security-contract-test-static.cjs`: CONTRATO OK, 0 divergencias, surface re-certificado 3 veces (232→232→233 fn).
- `check-writers.mjs`: OK (apply script guardProtected; forense en exceptions justificada).
- ESLint: 0 errores en todos los archivos modificados. Escaneo de secretos en cada diff: **0 coincidencias**.
- E2E aislado (suite de humo del CI): 55/57 + guardrail net-zero PASS ×2.
- Nota: `tsc --noEmit` no es ejecutable en el sandbox local (core dump de node v24 **preexistente en main
  limpio**, verificado con stash) — CI lo ejecuta con normalidad (checks de #1717/#1718: **9/9 success**).

## 7. Operaciones productivas ejecutadas (governadas y documentadas)

| Operación | Migración | Expediente |
|---|---|---|
| Trigger motor de pagos + guards | 20261126140000 | APLICACION-MIGRACION-20261126140000-PRODUCCION.md |
| Validación incidencias POS | 20261126150000 | APLICACION-MIGRACION-20261126150000-PRODUCCION.md |
| Dedup RPC proveedores | 20261126160000 | este informe (§3 PR #1720) + marcas re-ejecutables |

Todas: aislada primero → producción UNA sola vez (doble flag + NOTIFY pgrst) → surface re-certificado.
**Sin cambios de datos históricos** (los saldos OT ya eran coherentes; 0 duplicados; Pixelarte ya revertido).

## 8. Queda pendiente (siguiente sesión)

1. Decisión del propietario sobre R-05 (y las políticas de §5) → misión de remediación corta.
2. CI de #1719/#1720 (en ejecución al cierre; #1717/#1718 9/9 verde) y fusión de los 4 PRs apilados en orden.
3. E2E aislado del workflow manual en los heads de #1719/#1720.
4. Certificación plena de FIN-011 (E2E) y elevación de reglas VERIFICADAS→CERTIFICADAS según política.
