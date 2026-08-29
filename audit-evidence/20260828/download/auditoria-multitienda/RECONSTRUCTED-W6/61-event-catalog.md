> **[ RECONSTRUCTED-FROM-TRANSCRIPT — NO ES EVIDENCIA ORIGINAL ]**
> Reconstruido: 2026-08-28 · Original perdido en reinicio de sandbox (ver `../RECOVERY-20260828/68-recovery-state-report.md`)
> Original: `download/auditoria-multitienda/WAC-DATAFLOW/W6-CANONICAL-DESIGN/61-event-catalog.md`
> Método: verbatim desde transcripción (lectura íntegra previa a la pérdida); único añadido = este banner. SHA-256: ver `00-RECONSTRUCTION-MANIFEST.md`.

# W6 · 61 — Catálogo canónico de eventos (matemática, idempotencia, parciales, unidades, contra-asientos)

Cada evento define: entradas autorizadas → costo creado/consumido → efecto WAC (bajo D-01=A) → registro obligatorio → contra-asiento → idempotencia. Tipos de movimiento reutilizan el enum existente (hecho 59: 17 valores) — cambios de enum marcados [ENUM-CANDIDATE].

## E-R · RECEPCIÓN (crea costo de adquisición)

- Entrada válida: `qty_present × unit_cost(origen) × tasa ⇒ cost_cup > 0` (B4 ya lo exige); variantes → `units = qty × conversion_factor` para inventario; `receipt_items` conserva presentación+factor (trazabilidad).
- Efecto WAC: **blend** `(S_prev×WAC_prev + units×cost_cup)/(S_prev+units)`; cp NO se toca.
- Registros: receipt('active'), receipt_items inmutables post-confirmación, movement `purchase` uc=cost_cup/ unidad base, kardex in.
- Un solo escritor vivo: la RPC de recepción llama a `fn_recalc_wac` en TX (el trigger heterodoxo desaparece — PR-1). Caso B/A del harness quedan como regresión permanente.
- Idempotencia: clave del comando + status machine `pending→active→(voided|reversed)`; confirm atómica por recepción completa (sin parciales por ítem).
- Contra-asiento: enlace a cuentas por pagar vía `po_id`/CxP ya existente fuera de alcance [FUTURO].

## E-V · VENTA (congela COGS server-side)

- COGS = `Σ items(units × WAC_prev_snapshot)` capturado con FOR UPDATE bajo el advisory lock vigente por tienda; escrito IDÉNTICAMENTE en `transaction_items.cost_at_sale` y `stock_movements.unit_cost`; WAC_post = WAC_prev.
- El campo `cost_at_sale`/`cost` del request se IGNORA (compatibilidad de firma conservada; docs API marcan deprecated). UI deja de enviar costo (doc 63).
- Kardex out: `total_value=units×WAC` ; `balance_*` a estado corriente.
- Parciales/mixed/Zelle/tasas de VENTA no afectan COGS (separación venta-pago intacta).
- Idempotencia: ya UNIQUE(idempotency_key) + retorno idempotente (hecho 59) — estandarizar sobre registry común (D-10).

## E-D · DEVOLUCIÓN (reversión simétrica del COGS)

- Tope duro: `Σ devuelta(item) ≤ vendida(original)` acumulada entre todas las devoluciones activas que referencian la misma transacción [CHECK-FUNC + validación RPC]. Cierra DF-07.
- Costo de reversión: **exactamente** el `cost_at_sale` original (fiable post-canon); si no hay vínculo o es era-pre-canon: fallback = WAC_vigente + metadata `reversal_basis='WAC_CURRENT'` + flag visible en reportes (decisión D-04 ratificable).
- Efecto WAC: **reversión neutral** (A1 recomendada): WAC constante, stock sube, valorización sube `units×c_rev`. La identidad PR-5 queda desplazada exactamente por esa diferencia c_rev vs WAC y se reporta como línea «varianza por base de reversión» [transparente, no oculta]. Alternativa A2 (blend como recepción) documentada pero no recomendada.
- **Contra-asiento financiero obligatorio**: filas de reembolso ligadas al pago ORIGINAL (split proporcional por defecto; método alternativo solo manager+ con motivo auditado). Implementación recomendada D-05-(i): extender `payment_transactions` con `ref_type='devolution'`, `amount>0` + campo dirección/semántica refund (el CHECK amount>0 existente lo exige así), UNIQUE `pay-devol-<id>`; reportes de caja interpretan dirección. Alcanza F2-P1-01.
- Kardex `devolution_in` uc=c_rev; doble aserción stock+finanzas en tests.

## E-T · TRANSFERENCIA

- Origen: out a `uc=WAC_origen_frozen` (hoy correcto), WAC_origen constante.
- Destino: **blend** obligatorio con `uc_transfer` sobre el producto destino existente; si crea espejo nuevo, seed `ca_dest=uc_transfer` y cp paramétrico igual que hoy. Cierra DF-06 parcial (transfer).
- Ambas patas en la misma TX de confirmación; reservas intactas.

## E-A · AJUSTE

- Δ>0: `unit_cost_adjustment > 0` OBLIGATORIO (sin default silencioso a WAC); blend tipo recepción. UI solicitará el costo y su justificación.
- Δ<0: retiro a WAC_prev; rechazo si resultaría stock<0 (R-3; sin piso).
- Motivos con taxonomía fija para analítica de mermas [FUTURO].

## E-P · PRODUCCIÓN

- Consumo MP (`withdraw_production_item`): costo SIEMPRE server-side (`p_server_side_cost=true` forzado; false → error). Retiros parciales ACUMULAN ponderado: `actual_unit_cost := Σ(qty_i×uc_i)/Σqty_i` (corrige sobrescritura actual). MP: WAC constante al retirar.
- Salida PT (`receive_production_output`): costo real = Σ materiales consumidos (acumulado ponderado) [+ hook futuro mano de obra/servicios]; RECHAZO si algún material con uc NULL/0 salvo bandera explícita `approve_zero_cost_material=true` con motivo auditado (cierra DF-05).
- WAC_PT blend estándar; **cp deja de espejarse** (queda paramétrico de catálogo; doc 63 lista pantallas que lo mostraban).
- Reversa de producción: doctrina compensatoria (§ER): reintegra MP a su uc congelado y saca PT valorizado al costo input registrado en la orden; WAC recalculado por motor estándar.

## ER · REVERSAS GENÉRICAS (venta/recepción/cierre)

- Nunca mutar; agregar movimiento inverso referenciado (`sale_reverse/purchase_reverse/...`) + contra-asiento espejo cuando aplique; recálculo WAC con los costos congelados de cada pata; `wac_before/wac_after` exigidos en metadata (aproximaciones admitidas y flaggeadas — D-09).

## Matriz resumen evento × columna

| Evento | Crea costo | Modifica WAC | unit_cost movement | cp | Contra-asiento |
|---|---|---|---|---|---|
| Recepción | adquisición | blend | purchase=c_cup | no | CxP [futuro] |
| Confirm-pending | adquisición | blend | purchase=c_cup | no | CxP [futuro] |
| Venta | congela COGS | NO | sale=WAC_prev | no | pagos (existe) |
| Devolución | revierte COGS | NO (A1) / blend (A2) | return=c_rev | no | **reembolso (nuevo)** |
| Transfer out/in | mueve | origen NO / destino blend | transfer/transfer_in=uc | solo seed espejo | n/a |
| Ajuste+ | anuncia base | blend | adjustment=u_adj | no | n/a |
| Ajuste− | saca | NO | adjustment=WAC | no | n/a |
| Producción consume | MP→orden | NO (MP) | production_out=WAC_MP | no | laboral [futuro] |
| Producción salida | PT real | blend PT | production_in=uc_pt | NO-espejo | laboral [futuro] |
| Reversas | compensa | motor estándar | *_reverse=congelado | no | espejo sí |

Reglas parciales/unidades/idempotencia aplican como en §cada evento (D-06/D-07/D-11/D-10 del registro 62).
