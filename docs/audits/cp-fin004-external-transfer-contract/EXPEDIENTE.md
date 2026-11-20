# CP-FIN-004 — Corrección del contrato de medios de pago POS-backend y reconstrucción histórica USD (ENERVIDA)

**Misión:** ANEXO VINCULANTE a CP-FIN-ENERVIDA-CONTROLLED-ACCOUNTING-REBUILD-AND-CONFIGURATION-001
**Fecha:** 2026-11-20 · **Tienda:** ENERVIDA-VITALLCONS (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`)
**Principio rector:** EL FRONTEND ACTUAL ES LA REFERENCIA CORRECTA. El backend se adapta a él.

---

## 1. Causa raíz del desacuerdo frontend/backend

| # | Hallazgo | Evidencia |
|---|---|---|
| 1 | El POS muestra la etiqueta correcta «Transf. Exterior» (3 opciones + Mixto), pero el **VALUE de datos** que envía y persiste es `zelle` | `src/components/views/terminal/views/pos/PaymentMethodSelector.tsx` (FIX-TRANSF-EXTERIOR 2026-10-16: «solo cambia la etiqueta visible — nunca el valor de datos») |
| 2 | El enum PostgreSQL `payment_method_enum` incluye el valor `zelle` (posición 7) y todo el motor financiero lo usa como identificador del medio «Transf. Exterior»: `fin_account_mapping` (zelle→ACT_TRANSF_EXTERIOR), métricas `cob_zelle_usd_cup`/`reembolso_zelle_usd_cup`, reglas VENTA v3 y DEVOLUCION_VENTA v2, rectificadores | `supabase/migrations/20261120120000_cp_fin003_generations_canonical_mapping.sql`; cuerpos LIVE verificados 2026-11-20 |
| 3 | El importador histórico de ENERVIDA (2026-10-04) aplicó la política **«USD físico → bucket `zelle` @ tasa 680»** (decisión 2 del GATE de entonces): toda venta cobrada en USD quedó registrada como `zelle`, confluyendo MONEDA con MEDIO DE PAGO — exactamente la deducción prohibida por la Prueba D del anexo | `docs/audits/ENERVIDA-EXCEL-IMPORT.md` §2.2 y §6 |
| 4 | Resultado: 241 componentes de cobro `zelle`+USD en ventas de ENERVIDA (38.884,64 USD) cuando la realidad operativa declarada por el propietario es que solo 3 ventas (870 USD) fueron Transferencia Exterior (Zelle) | Auditoría read-only producción 2026-11-20 (§2) |

## 2. Universo auditado (producción, read-only, 2026-11-20)

### 2.1 Cobros por (método × moneda × ref_type) — ENERVIDA

| ref_type | método | moneda | dirección | n | importe original | CUP |
|---|---|---|---|---:|---:|---:|
| sale | cash | CUP | in | 463 | 10.430.399,98 | 10.430.399,98 |
| sale | cash | USD | in | 5 | 223,00 | 202.105,00 |
| sale | transfer | CUP | in | 67 | 1.264.610,01 | 1.264.610,01 |
| **sale** | **zelle** | **USD** | **in** | **241** | **38.884,64** | **26.464.660,00** |
| work | zelle | USD | in | 31 | 23.535,70 | 16.004.276,00 |
| service | cash | CUP | in | 21 | 60.765,00 | 60.765,00 |
| work | cash | CUP | in | 3 | 223.350,00 | 223.350,00 |
| cash_flow | cash | CUP | out | 1 | 8.435.679,98 | 8.435.679,98 |
| cash_flow | cash | USD | out | 1 | 367,00 | 293.600,00 |
| devolution | cash | CUP | refund | 2 | 239.405,00 | 239.405,00 |

- `zelle` **no existe en ninguna otra tienda** (verificado multitienda).
- Venta-zelle por estado: **238 completed** (36.152,64 USD) + **3 voided** (2.732,00 USD).
- Headers `transactions.payment_method='zelle'`: 217; pools `zelle_amount>0`: 245; items `zelle_paid>0`: 11.
- Devoluciones ENERVIDA: 2, ambas reembolso cash CUP (no hay reembolsos zelle).

### 2.2 Las tres ventas Zelle declaradas por el propietario

| Fecha | Producto | SKU | Cant. | USD | Venta (doc) | Fila Excel origen |
|---|---|---|---:|---:|---|---|
| 21/08/2026 | Panel + 600W | 86 | 1 | 330,00 | `9033864b-2c13-4aa3-b2b8-2fd645a190db` | 407 (`enervida-imp-ven-407`) |
| 22/08/2026 | Panel + 600W | 86 | 1 | 330,00 | `3d19e5e7-2080-4eb1-8eca-cf7e391f30b9` | 422 (`enervida-imp-ven-422`) |
| 22/09/2026 | Panel de 640 W Suntech | 139 | 1 | 210,00 | `1a03c37f-3a9b-4c5a-912c-3958ebbaf91c` | 682 (`enervida-imp-ven-682`) |
| **Total** | | | **3** | **870,00** | | |

**Ambigüedad resuelta de forma determinística y documentada:**
- El 21/08 existen DOS ventas idénticas de SKU 86 @ 330 USD: `9033864b` (fila 407) y
  `d63f734a` (fila 408). El 22/09 existen DOS de SKU 139 @ 210 USD: `1a03c37f` (fila 682)
  y `fbf7f78f` (fila 683). El expediente del importador (§8) certifica que las filas
  duplicadas del Excel son **ventas reales** del mismo valor el mismo día.
- Ambos miembros de cada par son económicamente idénticos (misma fecha/hora, importe,
  tasa 680, producto, cuenta contable) → **los estados financieros son invariantes** a
  cuál se etiquete como Zelle.
- Regla adoptada (no arbitraria, trazable): la operación Zelle declarada corresponde a la
  **primera del registro original** (orden de fila del Excel = orden de importación) en cada
  fecha con duplicados. Queda documentada para veto documental del propietario; el
  rectificador canónico permite re-apuntar la etiqueta al gemelo sin efecto financiero.

### 2.3 Regla de clasificación aplicada (declaración del propietario = evidencia de negocio)

1. Las 3 ventas identificadas → **`external_transfer` + USD** (cuenta ACT_TRANSF_EXTERIOR).
2. Todas las demás ventas USD de ENERVIDA (238 componentes, incluidas 3 voided que
   **conservan su estado y tratamiento contable original**) → **`cash` + USD** (caja USD).
3. Ventas CUP conservan su medio real; ventas mixtas conservan cada componente por separado.
4. Cobros de trabajos (`ref_type='work'`, 31 componentes, 23.535,70 USD): **fuera del alcance
   declarado** (no son ventas y no generan asientos). Solo se normaliza su REPRESENTACIÓN
   `zelle`→`external_transfer` (misma cuenta exterior, efecto contable 0) para que no quede
   ningún valor `zelle` canónico en datos vivos. Pendiente de declaración del propietario
   como efectivo si así lo decide (mismos mecanismos, sin impacto contable).
5. No se modifican: importes, monedas originales, fechas, tasas, equivalentes contables
   históricos, cantidades, inventario, costo de venta, ingresos.

## 3. Contrato canónico nuevo

| Medio POS (UI sin cambios) | Valor canónico | Alias heredado (solo entrada/lectura) | Monedas |
|---|---|---|---|
| Efectivo | `cash` | — | CUP/USD/EUR/MLC |
| Transferencia (nacional) | `transfer` | — | CUP/USD/EUR/MLC |
| Transf. Exterior (Zelle en ENERVIDA) | `external_transfer` | `zelle` | USD/EUR |

- El backend **nunca persiste** `zelle` en registros nuevos: todo punto de ingestión lo
  normaliza a `external_transfer` (el RPC `create_sale_v2` es el punto único de
  normalización server-side; los clientes cacheados que aún envíen `zelle` quedan cubiertos).
- `zelle` permanece en el enum y en los datos históricos pre-normalización como valor
  heredado legible (compatibilidad controlada; imposible que contamine registros nuevos).
- La regla de contabilización es la combinación (medio × moneda) → cuenta canónica
  (`fin_account_mapping`); la moneda NO determina el medio (Prueba D).

## 4. Implementación

- **M1 `20261120200000`** (DDL puro, sin uso del valor nuevo): enum + columnas
  (`transactions.external_transfer_amount`; `transaction_items.external_transfer_paid/
  _currency/_discount_*`) + mapeo canónico + catálogo de métricas.
- **M2 `20261120210000`** (motor + datos): 21 funciones actualizadas desde sus cuerpos LIVE
  verificados, reglas VENTA v4 / DEVOLUCION_VENTA v3, procedimiento normalizador
  idempotente `cp_fin004_normalize_enervida_payments()` (guardas por tienda/venta,
  auditoría por fila, conteos de retorno).
- **GEN-2**: tras aplicar M2, reconstrucción de la generación de ENERVIDA
  (`fin_generation_create/build/validate/activate`), conservando GEN-1 superseded íntegra.
- **Frontend**: contrato de datos (value `external_transfer`) sin alterar presentación.
- **Pruebas A–F** del anexo §7 como spec E2E dedicada + pruebas de contrato/Integración.
