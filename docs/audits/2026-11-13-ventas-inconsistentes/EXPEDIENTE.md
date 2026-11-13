# EXPEDIENTE — Las 3 ventas inconsistentes o parciales (BLOQUEADAS · decisión del propietario)

**Fecha (UTC):** 2026-11-13 · **Modo:** read-only producción. **No se corrigen importes, no se inventan devoluciones, no se generan pagos, no se anulan documentos.** Ninguna operación contable se ejecuta sobre estos documentos. Evidencia JSON: `scripts/out/m3-tres-ventas.json` (registro, ítems, pagos, auditoría, operaciones relacionadas).

Los tres documentos tienen filas reales en `payment_transactions` (NO forman parte de las 165 legacy) y `total_amount` diverge del cobro. El motor los rechazaría (`ERR_UNBALANCED`) en cualquier backfill: quedan bloqueados.

---

## Documento 1 — Venta `1df5d727-e6ee-402a-aa51-6c44a0768c5a` (total 0,00 · cobrado 12.000,00 CUP)

| Campo | Valor |
|---|---|
| Tienda / estado | ENERVIDA-VITALLCONS · `completed` |
| Fecha (UTC) | 2026-10-16 16:00 creado/completado |
| Vendedor | Admin CostPro · cliente: no registrado |
| total_amount | **0,00 CUP** · sale_currency CUP · rate 1 |
| Ítem | Cajita Breckera sencilla gris (sku 108) ×1 · precio 0,00 CUP · costo 1,00 |
| Cobro | cash CUP 12.000,00 (fila `pay-cash-1df5d727…`) · campo legacy cash_amount = 12.000 |
| Historial (audit_logs) | `CREATE_SALE_V2` (2026-10-17 13:47:51 UTC) · `SALE_PAYMENT_INCIDENT`: «Precio catálogo 0 vs 12.000 recibido; incidencia documentada. Sobrepago detectado» |
| Relacionadas | 0 devoluciones · 0 store_credit · sin liquidación explícita |
| CP-FIN | 0 asientos · 0 errores registrados (el backfill no ha corrido) |

**Naturaleza:** el catálogo tenía precio 0 para el producto; se cobró 12.000 CUP en efectivo. La venta reconoce 0 de ingreso frente a 12.000 de caja → asiento imposible (D 12.000 / C 0).

**Alternativas de tratamiento (decisión del propietario):**
1. **Corrección documental del precio** del ítem (a 12.000) con soporte (registro fuente «misión 16/10/2026 fila 17») → la venta pasaría a íntegra. Modifica un documento original — exige autorización expresa.
2. **Mantener bloqueada** y tratar los 12.000 como cobro a rendir/anticipo documentado fuera de CP-FIN hasta decisión (riesgo: caja sin contrapartida contable).
3. **Anulación + reregistro correcto** (procedimiento documental completo, con reversa de stock). Requiere autorización y evidencia.

## Documento 2 — Venta `8ab7becf-8598-4779-b3e4-dbee2b67ee98` (total 15.800,00 · cobrado 16.000,00 CUP · exceso +200)

| Campo | Valor |
|---|---|
| Tienda / estado | ENERVIDA-VITALLCONS · `completed` |
| Fecha (UTC) | 2026-10-16 16:00 creado/completado |
| Vendedor | Admin CostPro |
| total_amount | **15.800,00 CUP** (CUP canónico) · ítem Brecker 63 AMP (sku 128) ×1, 20 USD × 790 = 15.800 · costo 0,88 |
| Cobro | cash CUP 16.000,00 (fila `pay-cash-8ab7becf…`) · legacy cash_amount = 16.000 |
| Historial | `CREATE_SALE_V2` (2026-10-17 13:47:50 UTC) · `SALE_PAYMENT_INCIDENT`: «Sobrepago +200 CUP documentado (MISION-FLEX)» |
| Relacionadas | 0 devoluciones · 0 store_credit |
| CP-FIN | 0 asientos · 0 errores registrados |

**Naturaleza:** sobrepago de 200 CUP sin vuelto registrado (el total es exacto al ítem; el exceso quedó en caja).

**Alternativas:**
1. **Regularización del pago vía RPC `regularize_sale_payment`** (existe en el sistema con invariantes): registrar los 200 como vuelto/ajuste documentado → Σcob = total → contabilizable. Requiere evidencia de que el exceso no se entregó como mercancía/crédito.
2. **Mantener bloqueada** y documentar los 200 como efectivo sobrante en caja (incidencia).
3. **Sobrante a favor del cliente como store_credit** (crédito 200) — generaría pasivo documentado; modifica datos → autorización expresa.

## Documento 3 — Venta `28e94349-0a3e-499c-935f-c4a25c9db3fe` (total 177.770,00 · cobrado 169.670,00 CUP · pendiente 8.100)

| Campo | Valor |
|---|---|
| Tienda / estado | ENERVIDA-VITALLCONS · `completed` |
| Fecha (UTC) | 2026-10-19 16:00 creado/completado |
| Vendedor | Admin Demo |
| total_amount | **177.770,00 CUP** · ítems: Conectores MC4 (7 USD → 5.670) · Cemento Blanco 2 Kg (2.000 CUP) · Panel 640 W Suntech (210 USD → 170.100) |
| Cobro | cash CUP 169.670,00 (fila `pay-cash-28e94349…`) · legacy cash_amount = 169.670 · ítems con carve cash_paid: 7 USD + 2.000 CUP + 200 USD |
| Historial | `CREATE_SALE_V2` (2026-10-21 02:57:31 UTC) · `SALE_PAYMENT_INCIDENT`: «venta registrada con pago insuficiente. Total 177.770; Importe recibido 169.670. Pendiente: 8.100 CUP» |
| Relacionadas | 0 devoluciones · 0 store_credit |
| CP-FIN | 0 asientos · 0 errores registrados |

**Naturaleza:** venta con pago insuficiente documentado en el propio sistema (pendiente 8.100 CUP).

**Alternativas:**
1. **Cobro del pendiente** (operación real de cobro con evidencia documental) → la venta pasa a íntegra y contabilizable. Depende del mundo real, no del sistema.
2. **Cuentas por Cobrar** (Opción A de la comparativa de política): reconocer ingreso completo con D `ACT_CXC` 8.100 — REQUIERE la regla v2 y la decisión de política del propietario (no adoptada).
3. **Mantener bloqueada** (Opción B, estado actual) hasta el cobro o la decisión de política.

---

## Estado conjunto

| Documento | total | cobrado | exceso/pendiente | Estado | Decisión |
|---|---|---|---|---|---|
| 1df5d727 | 0,00 | 12.000,00 | +12.000 (total 0) | BLOQUEADA | Propietario |
| 8ab7becf | 15.800,00 | 16.000,00 | +200 | BLOQUEADA | Propietario |
| 28e94349 | 177.770,00 | 169.670,00 | −8.100 | BLOQUEADA | Propietario |

Los tres quedan **fuera de cualquier contabilización automática** hasta decisión expresa del propietario. Ninguna alternativa ha sido ejecutada ni preseleccionada como recomendación única: cada una modifica datos o requiere hechos/evidencia externa.
