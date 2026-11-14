# FIX §17.1 — Servicios Recibidos en divisa: consistencia de moneda del documento

**Fecha:** 2026-11-13 · **Rama:** `fix/servicios-usd-17-1-20261113` · **PR:** (enlazado abajo)
**Origen:** expediente CP-FIN `docs/audits/2026-11-13-cp-fin-partida-doble/INFORME_AUDITORIA_FINAL.md` §17.1 (MEDIO-ALTO, pre-existente, fuera de alcance CP-FIN). Autorización del propietario del 2026-11-13: investigación técnica + solución en rama/PR independientes, sin mezclar con CP-FIN validado; sin cambios en producción sin aprobación expresa.

---

## 1. Defecto

Al pagar un servicio recibido en divisa, `update_payment_status` (rama `service`, versión vigente tras hotfix v2.25.1 de `20260809000012`) acumulaba `v_paid = SUM(amount_cup)` — **siempre CUP** — y lo comparaba contra `v_total = total_amount` — **divisa del documento** —, guardando el resultado en `paid_amount`. Consecuencias:

1. `paid_amount` queda en CUP para documentos en divisa (10 USD pagados → `paid_amount=4000`).
2. `payment_status` mal computado: un pago parcial en divisa (4 USD = 1600 CUP ≥ 10) queda `'paid'`.
3. El guard `prevent_received_service_edit` (regla 4, `ERR_TOTAL_BELOW_PAID`) compara `total_amount` (divisa) contra `paid_amount` (CUP) → **todo documento en divisa pagado queda inalterable** (ni edición ni cambios de estado; veredicto original del hallazgo).
4. `register_supplier_payment` (v. `20261018000000`): `v_balance = total(divisa) − SUM(amount_cup)(CUP)` → el control de overpay mezcla monedas.
5. `void_received_service_with_reversal` no choca directamente (hace `UPDATE` directo con `set_config('app.is_void_rpc')`, línea confirmada), pero la anulación es la única vía de salida — la edición legítima queda bloqueada.

El motor CP-FIN **no** está afectado: `fin_compute_metrics` normaliza con `total_amount × exchange_rate` del propio documento (verificado; caso H de la auditoría integral).

## 2. Corrección

Migración `supabase/migrations/20261113120800_fix_servicios_recibidos_moneda_documento.sql` (idempotente, `CREATE OR REPLACE`):

- **`update_payment_status` (rama `service`):** el acumulado y `paid_amount` se expresan en la **moneda del documento**: pagos en la misma moneda suman su importe nominal; pagos en otra moneda aportan `amount_cup / exchange_rate_del_documento` (inverso exacto de la normalización CP-FIN; **ninguna tasa nueva, ninguna conversión implícita CUP↔USD**).
- **`prevent_received_service_edit` (regla 4):** la comparación queda homogénea (ambos en moneda del documento).
- **`register_supplier_payment`:** saldo pendiente y control de overpay en moneda del documento; el pago se inserta siempre en su moneda original (`amount`/`amount_cup` sin tocar).
- **Restricciones respetadas:** no se modifica ni elimina ningún registro real; no se desactivan triggers, RLS, constraints ni guards (PT007 de DELETE de pagos permanece VIVO — probado); ramas `'receipt'` y `'production_order'` intactas byte a byte (operan en CUP de punta a punta: `receipts`/`production_orders` no tienen columna `currency`).

**Compatibilidad con históricos CUP:** con `currency='CUP'` (100 % de los servicios reales) las tres funciones producen resultados numéricamente idénticos a las versiones anteriores (probado: P1, P2, P10).

## 3. Evidencia de validación (BD E2E aislada `lguovmvrozxgssupkwpf`)

`scripts/validar-fix-17-1-servicios-usd.mjs` — **14/14 PASS**, net delta 0, `data-hygiene-guard` **PASS** (`net delta = 0`):

| Caso | Escenario | Resultado |
|---|---|---|
| F0a/F0b | funciones vigentes contienen el fix | ✓ |
| P1 | CUP completo: 100 CUP → paid=100, 'paid' | ✓ |
| P2 | CUP parcial: 80/200 → paid=80, 'partial' | ✓ |
| P3 | USD completo: 10 USD (tasa 400) → paid=**10**, 'paid' (antes: 4000) | ✓ |
| P4 | USD parcial: 4/10 → paid=4, 'partial' (antes: 'paid') | ✓ |
| P5 | USD pagado en CUP: 4000 CUP → paid=10 USD-equivalente | ✓ |
| P6a | editar servicio USD pagado: subir total 10→12 **ADMITIDO** (antes ERR_TOTAL_BELOW_PAID espurio) | ✓ |
| P6b | bajar total por debajo de lo pagado **SIGUE bloqueado** (legítimo) | ✓ |
| P7 | overpay: 11 USD a doc de 10 → rechazado con saldo en moneda del doc | ✓ |
| P8 | anulación void de servicio USD pagado → success, reset unpaid/0 | ✓ |
| P9 | guard DELETE de pagos VIVO (PT007) + acumulado divisa correcto | ✓ |
| P10 | doc CUP con pago mixto (CUP+USD): paid=5000 CUP (semántica intacta) | ✓ |
| L1 | limpieza total: 0 residuos | ✓ |

## 4. Registros históricos afectados en producción (read-only, 2026-11-13)

`scripts/auditoria-17-1-servicios-usd.mjs` (guard CP-INFRA-019 `ALLOW_PROD=read-only`; salida íntegra en `scripts/../download/` y resumida aquí):

- Funciones vigentes confirman el defecto (SUM(amount_cup) contra total en divisa; guard con mezcla).
- **Inventario:** 41 servicios, **todos CUP** (16 active/paid, 20 draft/unpaid, 5 voided); 16 pagos de servicios, todos CUP; 0 servicios en divisa; 0 pagos en divisa.
- **Registros afectados hoy: CERO.** El defecto es latente: el flujo POST `/api/received-services` acepta `currency` (esquema + RPC `create_received_service_v2` con `p_currency`), y CP-FIN ya normaliza divisas con tasa del documento — el escenario es alcanzable en cuanto se registre el primer servicio en divisa.
- `receipts`: sin columna `currency` → la rama `'receipt'` no padece la mezcla (confirmado).

## 5. Propuesta de recuperación de históricos (NO EJECUTADA)

**No hay nada que recuperar hoy** (0 documentos en divisa en producción). Una vez aplicado el fix en producción (requiere autorización expresa del propietario), si aparecieran documentos en divisa creados ANTES de la aplicación con `paid_amount` en CUP, la recuperación sería:

1. **Detección** (read-only, re-ejecutable, ya incluida en `scripts/auditoria-17-1-servicios-usd.mjs` Q3/Q4/Q6): servicios con `currency <> 'CUP' AND paid_amount > total_amount` (bloqueados) o con `payment_status` discrepante del recalculo en moneda del documento.
2. **Recalculo controlado** (a ejecutar SOLO con autorización expresa): `UPDATE` de `paid_amount`/`payment_status`/`paid_at` recalculando con la MISMA fórmula del fix (pagos misma moneda nominal; otra moneda `amount_cup / tasa_doc`), en una transacción con backup previo (`CREATE TABLE ... AS SELECT` de las filas afectadas) y registro en `audit_logs`.
3. **Verificación post:** re-ejecución de la auditoría read-only (Q4/Q6 deben devolver 0 filas) y cuadre contra `payment_transactions` (trazabilidad por `ref_id`).

El paso 2 NO se ha ejecutado ni se ejecutará sin aprobación expresa del propietario (condición de la autorización).

## 6. Aplicación a producción

**PENDIENTE de autorización expresa.** El fix está validado en la BD aislada y en la rama/PR; la aplicación a producción (canal Management API, patrón m014-m016: lote único, `NOTIFY pgrst`, verificación post fail-closed, delta 0) queda documentada y lista pero **no ejecutada**, conforme a la autorización vigente.

## 7. Alcance y no-regresiones

- Rama creada desde `main` post-merge CP-FIN (#1610); **cero contacto** con componentes CP-FIN validados (no se tocó `fin_*`).
- `ci-gate-allowlist.json`: sin cambios necesarios (las 3 funciones ya estaban clasificadas o no requieren entrada nueva).
- `scripts/lib/writers.manifest.json`: `scripts/auditoria-17-1-servicios-usd.mjs` declarado `guardProtected` (usa `assert-not-production` con destino real). `check-writers` PASS.
- Secretos en el diff: CERO coincidencias (patrones de PAT/tokens/llaves/JWT/credenciales BD — verificado con el escaneo del paso final).
