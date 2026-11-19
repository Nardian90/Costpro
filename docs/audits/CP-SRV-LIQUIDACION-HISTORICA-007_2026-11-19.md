# CP-SRV-LIQUIDACION-HISTORICA-007 — Liquidación histórica de Servicios Recibidos y corrección de fecha de pago

**Misión:** ADN-SERVICES-RECEIVED-HISTORICAL-SETTLEMENT-007
**Fecha de ejecución:** 2026-11-19 (America/Havana)
**Actor ejecutor:** agente IA en nombre del propietario (autorización expresa §8 de la misión; el propietario pre-aprueba este expediente al emitir la misión — AGENTS.md §2 "expediente en docs/audits/").
**Alcance:** EXCLUSIVAMENTE 21 identificadores: 20 servicios pendientes + `SRV-20261116-00139`. Tienda única: PUERTO PADRE (`899d2503-d000-41d2-89f0-0827f4ac37ab`). Moneda: CUP (sin conversiones).
**Motivo:** los 20 servicios históricos quedaron como Pendiente porque la interfaz limita la fecha de liquidación a la fecha de operación vigente (forward-only por tienda, `get_global_max_operation_date` + tope HOY). El propietario autoriza liquidarlos por el canal de dominio con fecha de pago = fecha de servicio. Además, `SRV-20261116-00139` quedó con fecha de liquidación 19/11 (estado erróneo) cuando el pago real fue el 17/11.

---

## 1. Mecanismo aplicado (vía de dominio, validado en aislado §11g)

1. **Liquidación:** RPC `register_supplier_payment` (SECURITY DEFINER, service_role-only) con:
   - `p_payment_date` = fecha de servicio a las 12:00 America/Havana (evita desplazamientos UTC; el `AT TIME ZONE` resuelve correctamente el cambio CDT/CST de Cuba),
   - `p_payment_method` = 'cash' (criterio autorizado §8.2 ante ausencia de evidencia histórica de otro medio),
   - `p_currency`='CUP', `p_exchange_rate`=1, `p_amount` = total exacto del documento,
   - `p_idempotency_key` = `M007-<service_number>` (idempotencia nativa del RPC),
   - `p_reference`='M007 liquidación histórica', `p_notes`='Liquidación histórica — fecha de pago = fecha del servicio', `p_paid_by` = admin@demo.com (`a1111111-1111-1111-1111-111111111111`, cuenta operativa del propietario).
   El gate canónico `validate_operation_date` del propio RPC valida cada fecha histórica dentro del piso de 6 meses vigente (NINGUNA restricción global fue modificada — §4.3).
2. **Fecha de liquidación visible:** el trigger `update_payment_status` pone `paid_at=now()`; tras cada pago se alinea `received_services.paid_at` al mismo instante histórico del pago (`payment_transactions.payment_date`) con UPDATE condicional (`WHERE payment_status='paid' AND paid_at IS DISTINCT FROM objetivo`) → coherencia total documento↔pago.
3. **Contabilización:** trigger CP-FIN publica asiento `pago` (débito ACT_EFECTIVO_CUP por cash, crédito PAS_SERV_PEND por importe) con `payment_ref` y `economic_date = service_date` (semántica del motor: la fecha económica del documento). NO se tocó ningún asiento histórico.
4. **Corrección 00139:** (a) `payment_transactions.payment_date` → 17/11/2026 12:00 Habana (la fecha real del pago); (b) `received_services.paid_at` → 17/11/2026 12:00 Habana; (c) observación anexada preservando la existente. El asiento 'pago' (eco 16/11) NO se altera: por diseño del motor la fecha económica de cualquier evento del documento es la del documento (16/11), y el flujo real del efectivo queda en `payment_transactions.payment_date` (17/11) — coherente con la semántica del sistema.

**Validación previa (BD aislada lguovmvrozxgssupkwpf, regla de oro):** réplicas de los dos patrones → PASS completo (pago idempotente, paid_at alineado, asiento pago posted+balanceado, corrección con obs preservada), limpieza net-zero verificada por patrón (0 réplicas) y centinela `e2e_is_isolated_db()=true`. Script: `scripts/m007-validacion-aislada.mjs`; evidencia: `scripts/out/007-liquidacion/validacion-aislada.json`.

## 2. Hallazgo aritmético del texto de la misión (documentado, no bloqueante)

La suma ítem-a-ítem de los 20 servicios es **74.240,00 CUP** (coincide exactamente con los importes en producción), no 52.240,00 como indica el control agregado del texto. Δ = 22.000,00 = exactamente `SRV-20261018-00098`, que SÍ está enumerado en la tabla y explícitamente autorizado en §2.1 («liquidar el 18/10/2026 por 22.000 CUP»). **Decisión:** gobierna la enumeración autorizada registro a registro; se procesan los 20 (74.240,00). El control agregado del texto quedó calculado sin incluir ese registro.

## 3. Identificadores y operaciones (20 liquidaciones)

| # | Servicio | Fecha servicio | Importe CUP | Pago insertado (id) | paid_at final |
|---|---|---|---:|---|---|
| 1 | SRV-20261010-00095 | 2026-10-10 | 200,00 | (se completa tras ejecución) | 2026-10-10 12:00 Habana |
| 2 | SRV-20261016-00096 | 2026-10-16 | 6.300,00 | | 2026-10-16 12:00 Habana |
| 3 | SRV-20261017-00097 | 2026-10-17 | 500,00 | | 2026-10-17 12:00 Habana |
| 4 | SRV-20261018-00098 | 2026-10-18 | 22.000,00 | | 2026-10-18 12:00 Habana |
| 5 | SRV-20261019-00099 | 2026-10-19 | 6.200,00 | | 2026-10-19 12:00 Habana |
| 6 | SRV-20261020-00100 | 2026-10-20 | 2.700,00 | | 2026-10-20 12:00 Habana |
| 7 | SRV-20261021-00101 | 2026-10-21 | 3.480,00 | | 2026-10-21 12:00 Habana |
| 8 | SRV-20261022-00102 | 2026-10-22 | 1.740,00 | | 2026-10-22 12:00 Habana |
| 9 | SRV-20261023-00103 | 2026-10-23 | 2.500,00 | | 2026-10-23 12:00 Habana |
| 10 | SRV-20261024-00104 | 2026-10-24 | 2.900,00 | | 2026-10-24 12:00 Habana |
| 11 | SRV-20261025-00105 | 2026-10-25 | 4.900,00 | | 2026-10-25 12:00 Habana |
| 12 | SRV-20261026-00106 | 2026-10-26 | 6.200,00 | | 2026-10-26 12:00 Habana |
| 13 | SRV-20261027-00107 | 2026-10-27 | 3.600,00 | | 2026-10-27 12:00 Habana |
| 14 | SRV-20261028-00108 | 2026-10-28 | 100,00 | | 2026-10-28 12:00 Habana |
| 15 | SRV-20261029-00109 | 2026-10-29 | 2.400,00 | | 2026-10-29 12:00 Habana |
| 16 | SRV-20261030-00110 | 2026-10-30 | 1.800,00 | | 2026-10-30 12:00 Habana |
| 17 | SRV-20261031-00111 | 2026-10-31 | 400,00 | | 2026-10-31 12:00 Habana |
| 18 | SRV-20261102-00112 | 2026-11-02 | 2.100,00 | | 2026-11-02 12:00 Habana |
| 19 | SRV-20261103-00113 | 2026-11-03 | 3.420,00 | | 2026-11-03 12:00 Habana |
| 20 | SRV-20261104-00114 | 2026-11-04 | 800,00 | | 2026-11-04 12:00 Habana |
| | **TOTAL** | | **74.240,00** | | |

Cada fila conserva: número, fecha de servicio, tipo Comisión, proveedor («No especificado (registro histórico)»), importe exacto, moneda CUP, observación previa («Registro histórico PuertoPadre — comisión del día YYYY-MM-DD (documento origen)») INTACTA.

## 4. Corrección especial SRV-20261116-00139

- Antes: `paid_at=2026-11-19 …` (erróneo), `payment_date=2026-11-16 17:00 UTC`, observación «Pago de comisión 16/11/2026», 1 pago cash 300 CUP, asientos reconocimiento+pago posted.
- Después (requerido): `paid_at=2026-11-17 12:00 Habana`, `payment_date=2026-11-17 12:00 Habana`, observación final «Pago de comisión 16/11/2026\nPago de comisión del día 16/11/2026, que no se pagó ese día. Liquidado el 17/11/2026.», MISMO único pago (sin duplicar), importe/proveedor/fecha de servicio intactos, asientos históricos intocados (reversal_of=NULL, status posted).

## 5. Controles de seguridad aplicados

- Guard CP-INFRA-019 en TODOS los scripts (lectura: `ALLOW_PROD=read-only`; escritura: doble flag + este expediente).
- Pre-verificación por registro antes de cada escritura: existencia, `status='active'`, estado de pago esperado, importe EXACTO esperado, moneda CUP, cero pagos previos (idempotencia §4.2).
- Alcance blindado por patrón: solo los 21 `service_number` de la misión; ningún UPDATE/INSERT fuera de esos ids.
- Nada destructivo: sin DELETE, sin ALTER, sin tocar restricciones de fecha globales, sin modificar asientos (reversal solo existente por diseño), sin tocar cierres de caja (los snapshots de `cash_closures` quedan como fueron cerrados; los pagos históricos entran al ledger de caja por `payment_transactions` con su fecha real).
- Sin secretos en diffs; `.env` intocado; producción tocada UNA sola vez por registro (regla de oro).

## 6. Resultados de ejecución y conciliación

(Se completa tras la ejecución — ver sección al final del expediente y `scripts/out/007-liquidacion/`)
