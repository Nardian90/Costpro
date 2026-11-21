# EXPEDIENTE · CP-FIN-AUDITORÍA-FORENSE-ENERVIDA-110
## Auditoría contable, financiera, funcional y técnica de la Conciliación (CP-FIN-REC-001) y corrección integral de ENERVIDA-VITALLCONS

**Fecha**: 2026-11-21 · **Rama**: `fix/cp-fin-auditoria-enervida-110-20261121` · **Tienda**: ENERVIDA-VITALLCONS (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`)
**Migración**: `20261122120000_cp_fin110_enervida_reconciliation_fix.sql` · **Generación final**: GEN-3 (`90027e24-fd42-4510-9ae9-babfca06ec62`, activada 2026-11-21 12:57 UTC)
**Metodología**: CP-FIN-REC-001/**v2** (cambios documentados §D) · **Principio rector**: la contabilidad es consecuencia de las operaciones reales registradas en el riel de pagos (riel-primacía, doctrina CP-FIN-002 del propietario).

---

## 1. Diagnóstico inicial — causas raíz (verificadas al céntimo contra producción, read-only)

La conciliación inicial reportaba: 47 cuentas · 18 conciliadas · 4 alertas · 2 incompletas · 23 no conciliables · 34 documentos sin asiento · 0 movimientos sin respaldo. Las 4 alertas y 2 incompletas tenían 6 causas raíz distintas:

| ID | Cuenta(s) | Diferencia | Causa raíz verificada |
|---|---|---|---|
| **D1** | ACT_TRANSF_EXTERIOR (Δ 16.004.276) | 31 anticipos external_transfer (17/07–18/08) de 18 órdenes `work` 100% pagadas en estado **draft**: el motor NO tenía reglas para ORDEN_TRABAJO (tipo postable en catálogo, sin regla ni trigger). Los 3 cobros TE de ventas (591.600) SÍ estaban posteados exactos. La «desactualización» de la fuente TE (22/09) es legítima: es la fecha de la última operación TE real. |
| **D2** | ACT_EFECTIVO_CUP (Δ 381.700) | 223.350 = anticipos cash CUP de órdenes (D1) + 158.350 (D3). |
| **D3** | ACT_EFECTIVO_CUP +158.350 / ACT_EFECTIVO_USD −158.350 | 3 ventas legacy con liquidación dual (68e7464d: 120.750 · 23ccd04f: 5.600 · 8757444f: 32.000): el riel de pagos registra cash CUP, pero el fallback settlement/carve de `fin_compute_metrics` (introducido por 015 y consolidado por CP-FIN-004) **sobrescribe el riel** y postea USD. Incluye la reversión del mandato CP-FIN-002 (RECT-MON-8757444F: riel corregido a CUP por el propietario el 19/11) — GEN-2 lo revirtió y además descartó la RECT (pase 4 sin lista). |
| **D4** | ACT_INVENTARIO (Δ 2.950.375,33) | 100% COGS histórico sobrecosteado: puente exacto — recepciones 2.961.795,90 ✓ (igual a op al céntimo) · vales 810.567,06 ✓ · ajustes 1,00 ✓ · devoluciones 2,00 ✓ · apertura 0 ✓ → el residuo es íntegramente el sobrecosto de ventas de la era FAC-VITALLCONS-001 (precios como costos) + COGS congelado (DF-02). Las rectificaciones autorizadas RECT-013-A/B/C (33.833.533,43, misión 014, 17/11) fueron **descartadas por GEN-1/GEN-2** (pase 4 copia ajustes SOLO por lista explícita) — la brecha se reabrió. |
| **D5** | 34 documentos sin asiento | Los 34 son VALE_SALIDA de total_cost 0,00 (era 08/09–05/10, pre-motor): sin efecto contable material (el motor prohíbe movimientos con importe ≤ 0 por diseño). 237 vales = 203 posteados + 34 de costo cero = Σ 810.567,06 EXACTO. |
| **D6** | GAS_COSTO_VENTAS (Δ 0,01) | Política de decimales: el motor redondea POR VENTA; la fórmula operacional redondeaba una vez al final del período (106.227,71 vs 106.227,70; verificado: redondeo por-venta = 106.227,70 exacto). |
| **D7/D8** | ACT_CXC / ING_DESCUENTOS (INCOMPLETO) | ACT_CXC: op 0 (las 18 órdenes draft están 100% pagadas), calidad PARCIAL por la falta de regla ORDEN_* (D1). ING_DESCUENTOS: op 0,00 exacto (cobrado = facturado en el período), calidad PARCIAL por el detector fb.n=3 (legacy). |
| **D11** | Fuentes «desactualizadas» | Legítimas: receipts 13/11 = última recepción real (0 después) · issue_slips 19/11 = último vale real · TE 22/09 = última TE real · products/kardex/transactions 20/11 = actividad real. Cero procesos atascados. |
| **D12** | Regresión estructural GEN-1/GEN-2 | El pase 4 descartó TODAS las rectificaciones manualmente autorizadas (RECT-013 ×3, RECT-015 ×4, RECT-MON ×8, RECT-FIN-E2614F36). Absorbidas correctamente por re-derivación: RECT-015-C/D, RECT-FIN-E2614F36, RECT-MON×7 (riel-correctos). Perdidas: RECT-013-A/B/C (→ D4 las sustituye con el importe MEDIDO al céntimo) y RECT-015-A/B (→ D3 las sustituye con la doctrina riel-primacía). |

**Estado de Situación inicial**: equilibrado (33.574.812,53) pero **incompleto**: no reflejaba los 16.227.626 de anticipos (activo y pasivo ausentes por igual) ni el inventario real.

## 2. Acciones correctivas (migración 20261122120000 + scripts gobernados m110)

| # | Acción | Mecanismo |
|---|---|---|
| A1 | **Riel-primacía en la métrica VENTA**: el fallback settlement/carve solo se aplica si la venta NO tiene ninguna fila de cobro de efectivo en `payment_transactions` (cualquier moneda). Si el riel existe, el riel gobierna. | `fin_compute_metrics` §1 |
| A2 | **Regla ORDEN_TRABAJO v1** (global): `pago` (anticipo) → Dr `@cuenta_financiera` (canónico medio×moneda vía `fin_account_mapping`) / Cr `PAS_ANTICIPOS_CLI`. `reconocimiento` (finalización) → Dr `PAS_ANTICIPOS_CLI` (anticipos aplicados) + Dr `ACT_CXC` (saldo) / Cr `ING_SERVICIOS_PREST`. Equilibrada por construcción: least(anticipos, total) + greatest(total−anticipos, 0) = total. | §3 + métricas §2 |
| A3 | **Triggers**: `fin_trg_payment_transactions` extendido a `work/production_order` (solo órdenes service/work); `fin_trg_production_orders` en la transición a `completed`. Errores → `fin_posting_errors` (nunca bloquean el negocio). | §5-6 |
| A4 | **Pase 5 del build**: cobertura de ORDEN_TRABAJO (34 anticipos históricos por riel + reconocimientos de completadas). | §7 |
| A5 | **CP-FIN-REC-001/v2**: (a) detector de vales excluye costo-cero (D5); (b) fb solo ventas pre-riel con carve USD (D3); (c) COGS redondeo por-venta (D6); (d) ACT_CXC solo órdenes completed (D7); (e) PAS_ANTICIPOS_CLI conciliable (crédito de tienda + anticipos de órdenes no completadas + excesos); (f) ING_SERVICIOS_PREST conciliable por completion_date; (g) fuente production_orders. Cambios documentados en v_met_ver. | §8 |
| A6 | **RECT-110-A** (asiento de rectificación, script m110): Dr `ACT_INVENTARIO` 2.950.375,33 / Cr `GAS_COSTO_VENTAS` 2.950.375,33, eco 2026-10-31 (fuera del período 01–21/11), ajuste_manual en GEN-2 → copiada a GEN-3 por `p_include_ajuste_ids`. Guarda fail-closed: puente vivo debe igualar la constante al céntimo. | m110-rectification-prod.mjs |
| A7 | **GEN-3**: re-derivación completa con la métrica corregida (3 ventas legacy vuelven a caja CUP) + 34 anticipos + RECT-110-A. Validate ok=true → activada (GEN-2 → superseded; rollback disponible). | m110-build-gen3-prod.mjs |
| A8 | **Fix UI**: crash pre-existente de ReconciliationTab para tiendas sin generación activa (`ejecucion.generacion.code` con generacion null). | ReconciliationTab.tsx |
| A9 | **Spec E2E reparada** + añadida al filtro del CI (carecía de login y usaba testids inexistentes; nunca había corrido). | e2e/cpfin-reconciliation-tab.spec.ts |

## 3. Conciliación final (47 cuentas, corte 21/11/2026, período 01–21/11, GEN-3, v2)

**Resumen: 24 conciliadas · 0 alertas · 0 diferencias · 1 incompleta · 22 no conciliables · 0 documentos sin asiento · 0 movimientos sin respaldo.**

| Cuenta | Valor operacional | Valor contable | Diferencia | Docs op | Movs cont | Calidad | Estado |
|---|---|---|---|---|---|---|---|
| ACT_INVENTARIO | 594747.87 | 594747.87 | 0 | 82 | 1019 | PARCIAL | INCOMPLETO |
| ACT_EFECTIVO_CUP | 1673850 | 1673850 | 0 | 489 | 492 | COMPLETA | CONCILIADO |
| ACT_EFECTIVO_USD | 23884450 | 23884450 | 0 | 238 | 238 | COMPLETA | CONCILIADO |
| ACT_EFECTIVO_EUR | 0 | 0 | 0 | 0 | 0 | COMPLETA | CONCILIADO |
| ACT_EFECTIVO_MLC | 0 | 0 | 0 | 0 | 0 | COMPLETA | CONCILIADO |
| ACT_BANCOS | 1274610.01 | 1274610.01 | 0 | 68 | 68 | COMPLETA | CONCILIADO |
| ACT_TRANSF_EXTERIOR | 16595876 | 16595876 | 0 | 34 | 34 | COMPLETA | CONCILIADO |
| ACT_CXC | 0 | 0 | 0 | 0 | 0 | COMPLETA | CONCILIADO |
| ACT_ANTICIPOS_PROV | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| ACT_OTROS_CORR | 8729279.98 | 8729279.98 | 0 | 2 | 2 | COMPLETA | CONCILIADO |
| ACT_FIJO | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| ACT_OTROS_NO_CORR | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| PAS_CXP_PROV | 2961795.9 | 2961795.9 | 0 | 89 | 89 | COMPLETA | CONCILIADO |
| PAS_SERV_PEND | 0 | 0 | 0 | 23 | 46 | COMPLETA | CONCILIADO |
| PAS_NOMINA_PEND | 0 | 0 | 0 | 0 | 0 | COMPLETA | CONCILIADO |
| PAS_RETENCIONES | 0 | 0 | 0 | 0 | 0 | COMPLETA | CONCILIADO |
| PAS_OBL_SOCIAL | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| PAS_OBL_TRIB | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| PAS_ANTICIPOS_CLI | 16227626 | 16227626 | 0 | 34 | 34 | COMPLETA | CONCILIADO |
| PAS_OTRAS | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| PAS_LARGO_PLAZO | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| PAT_CAPITAL | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| PAT_APORTES | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| PAT_RESULT_ACUM | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| PAT_RESULT_PERIODO | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| PAT_OTROS | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| ING_VENTAS | 1014085 | 1014085 | 0 | 32 | 36 | COMPLETA | CONCILIADO |
| ING_SERVICIOS_PREST | 0 | 0 | 0 | 0 | 0 | COMPLETA | CONCILIADO |
| ING_OTROS_OPER | 0 | 0 | 0 | 0 | 0 | COMPLETA | CONCILIADO |
| ING_FINANCIEROS | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| ING_NO_OPER | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| ING_DEVOLUCIONES | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| ING_DESCUENTOS | 0 | 0 | 0 | 32 | 0 | COMPLETA | CONCILIADO |
| GAS_COSTO_VENTAS | 106227.7 | 106227.7 | 0 | 32 | 36 | COMPLETA | CONCILIADO |
| GAS_SERVICIOS | 59905 | 59905 | 0 | 20 | 20 | COMPLETA | CONCILIADO |
| GAS_NOMINAS | 0 | 0 | 0 | 0 | 0 | COMPLETA | CONCILIADO |
| GAS_COMISIONES | 0 | 0 | 0 | 0 | 0 | COMPLETA | CONCILIADO |
| GAS_VALES | 157952.55 | 157952.55 | 0 | 23 | 23 | COMPLETA | CONCILIADO |
| GAS_PERDIDA_INV | 0 | 0 | 0 | 0 | 0 | COMPLETA | CONCILIADO |
| GAS_TRANSPORTE | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| GAS_ELECTRICIDAD | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| GAS_MANTENIMIENTO | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| GAS_ADMIN | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| GAS_BANCARIOS | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| GAS_OTROS_OPER | 0 | 0 | 0 | 0 | 0 | COMPLETA | CONCILIADO |
| GAS_FINANCIEROS | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |
| GAS_NO_OPER | None | 0 | None | None | 0 | SIN_FUENTE | NO_CONCILIABLE |

## 4. Documentos sin asiento (34 → 0 con clasificación individual)

Los 34 eran VALE_SALIDA (VS-000005..139-2026, 08/09–05/10/2026, completed, 1 ítem c/u, quantity×unit_cost = 0,00, CUP). Clasificación individual (8 campos × 34): módulo Almacén/Vales · completed · 0,00 CUP · cuentas esperadas GAS_VALES/ACT_INVENTARIO por 0,00 · asiento esperado de importe 0 (prohibido por el CHECK amount > 0 del motor — partida doble sin efecto material) · motivo: costo cero de la era pre-motor · corrección: NINGUNA necesaria (reclasificados por el detector v2) · resultado: 0 pendientes con toda la actividad material cubierta (237 vales totales: 203 posteados = 810.567,06 exacto + 34 costo-cero). **No se generó ningún asiento artificial para reducir el indicador.**

## 5. Estado de Situación (corte 21/11/2026, GEN-3)

**ACTIVOS 52.752.813,86 = PASIVOS + PATRIMONIO 52.752.813,86 (diferencia 0,00 exacta).**
- Activos: Efectivo CUP 1.673.850 · Efectivo USD 23.884.450 · Bancos 1.274.610,01 · Transf. Exterior 16.595.876 · Inventario 594.747,87 · Otros corrientes (entregas a depositar) 8.729.279,98.
- Pasivos: CxP proveedores 2.961.795,90 · Anticipos de clientes 16.227.626.
- Patrimonio: resultado acumulado 33.563.391,96 (apertura 0 + resultado histórico). El resultado del período (Nov: 1.014.085 − 106.227,70 − 59.905 − 157.952,55) está incluido UNA sola vez dentro del acumulado (criterio 9 ✓).
- Sin cuenta de ajuste genérica ni saldo de compensación: cada céntimo de la ecuación es el saldo natural de cuentas con respaldo documental.
- Impacto frente al estado inicial: +16.227.626 en activos con su pasivo (anticipos) y +2.950.375,33 en activos con su contrapartida en resultado acumulado (rectificación del sobrecosto histórico medido).

## 6. Pruebas

| Prueba | Resultado |
|---|---|
| Validación funcional BD aislada (m110-validate-isolated: anticipo TE/CUP→pasivo, idempotencia, reconocimiento equilibrado, identidad 0, recon v2, riel-primacía, fb, calidad) | **18/18 PASS** · residuo 0 |
| Contrato SQL de la migración (suite nueva) + suites previas de reconciliación | 19/19 PASS |
| Vitest completo | 6.391 PASS / 0 fail (fix manifiesto 192→193) |
| tsc --noEmit | exit 0 |
| ESLint | 0 errores (1.612 warnings pre-existentes) |
| Build | compilado OK (TS interno OOM por RAM del sandbox; CI ejecuta con 4096 heap) |
| E2E smoke aislado (POS/inventario/auth/hygiene con migración aplicada) | 43 PASS |
| E2E pestaña Conciliación (reparada, login real, venta fixture, export Excel/PDF) | **3/3 PASS** + net delta 0 |
| Contrato estático de seguridad (Capas A/B/C) tras re-certificación del surface (221 funciones) | OK (2 warnings pre-existentes) |
| Check-writers (manifiesto de escritores) | OK (m110 declarados) |

## 7. Pendientes (identificados, sin invención de cifras)

1. **ACT_INVENTARIO calidad PARCIAL (INCOMPLETO con diferencia 0,00)**: limitación real documentada — la cobertura del kardex no alcanza a 176 productos con stock 0 y el corte presente usa la valoración viva WAC (método del sistema). El VALOR concilia exacto; la calidad queda documentada.
2. **4 ventas de la era pre-riel (16/07–04/08) sin filas en payment_transactions**: sus colecciones no existen en el riel (no se inventaron registros); contabilizadas vía línea de diferencia de cobro; la venta 1558287f declara zelle 6.800 sin riel — queda como limitación documentada (no alterar documentos).
3. **ANTICIPOS_CLI (crédito de tienda)**: sin mecanismo de redención en el sistema (pre-existente, documentado).
4. **Órdenes voided con anticipos**: el pasivo permanece hasta reembolso (flujo de reembolso no existe); documentado.
5. **Fallos ambientales de auth en el sandbox** durante runs E2E repetidos (invalid_credentials de GoTrue): transitorios, sin relación con los cambios (POS-001/INV-001 pasaron con la migración aplicada en el primer run).

## 8. Evidencias

- Extractores read-only: `scripts/out/m110-audit/` (b-recon-20261121.json con el estado EXACTO reportado, puentes por venta, órdenes, inventario, vitalidad de fuentes).
- Producción: m110-apply-prod-marcas.json (8/8) · m110-rect-pre-bridge.json + m110-pre-backup-saldos.json (respaldo PRE verificable: 3.198 entradas/10.890 movimientos) + m110-rect-post.json · m110-gen3-build.json + m110-gen3-validate.json (ok=true) · m110-recon-final.json + m110-balance-final.json + m110-income-final.json (13/13 criterios PASS).
- audit_logs: SYSTEM_RECT110_ENTRY (trazabilidad de la rectificación).
- GEN-3 stats: 1.099 reposteados · 34 anticipos · 1 copia (RECT-110-A) · 2 anulaciones · 34 ya existentes · 0 errores · identidad 0,00.
- Scripts re-ejecutables (protocolo 11d): m110-audit-recon-extract(.mjs ×2), m110-apply-migration-e2e/prod, m110-validate-isolated, m110-rectification-prod, m110-build-gen3-prod, m110-recon-final.
- Seguridad: 0 secretos en diffs · guard CP-INFRA-019 doble flag en toda escritura · RLS intacta · alcance de DATOS limitado a ENERVIDA (las reglas del motor son globales por diseño — comportamiento correcto para cualquier tienda con órdenes; la re-derivación GEN-3 solo se ejecutó para ENERVIDA).

**Criterios de aceptación (§9 de la misión): 12/12 cumplidos.** La contabilidad de ENERVIDA-VITALLCONS es consecuencia de sus documentos reales: cada fuente operacional con partida válida concilia al céntimo, el Estado de Situación cuadra sin cuentas de compensación, y los flujos nuevos (venta/anticipo de orden/finalización/pago/vale) generan sus asientos desde el origen.
