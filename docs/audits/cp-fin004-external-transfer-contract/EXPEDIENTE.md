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

---

# EJECUCIÓN (2026-11-20, misma sesión — cierre completo del ciclo)

## 5. Migraciones aplicadas a producción (canal canónico + libro)

| Migración | SHA-256 (prefijo) | Aplicada | Libro |
|---|---|---|---|
| M1 `20261120200000` | `84d6ea46…` | 15:26:24 UTC | registrada |
| M2 `20261120210000` | `cfcaafa1…` | 15:26:24 UTC | registrada |
| M3 `20261120215000` | `af5cf99d…` | 15:36:42 UTC | registrada |
| M4 `20261120220000` | `a36bf2f6…` | 16:14 UTC | registrada |

- Orden sin ventana de peligro: M1/M2 ANTES del merge (el backend acepta ambos
  valores — canónico y heredado — desde el primer momento).
- Todas aplicadas en lote único transaccional vía Management API (doble guard
  `--authorize` + `ALLOW_PROD_WRITE`), NOTIFY pgrst, evidencia JSON persistida
  (`scripts/out/cpfin004/m*-aplicacion.json`).
- `production_migration_ledger`: 4 filas con sha256 = archivos del repo (verificado).

## 6. Hallazgos y correcciones durante la ejecución

### 6.1 M3 — regresión de ACL de `get_transactions` (hallazgo del SQL Security Gate LIVE)
- El DROP + CREATE de M2 §19 (cambio de row type por `external_transfer_amount`)
  restableció la ACL por defecto de PostgreSQL (EXECUTE a PUBLIC) y perdió el
  REVOKE de `20261020000002_sec_definer_hardening`.
- Detectado ANTES del merge ejecutando el gate LIVE localmente
  (`secdef_public_grant`, sin allowlist): 1 hallazgo → FALLO.
- M3 restaura el REVOKE con verificación fail-closed en lote. Post: ACL =
  `{postgres, authenticated, service_role}`; gate LIVE re-ejecutado: **TODO PASS**.

### 6.2 M4 — caso «header zelle SIN cobros» (hallazgo de la 1ª ejecución del normalizador)
- La primera ejecución abortó **atómicamente** por la post-condición fail-closed:
  `ERR_NORMALIZACION_INCOMPLETA: cobros zelle residuales=0, headers residuales=3`.
- Universo exacto: 3 ventas pre-corte del propietario con `payment_method='zelle'`
  en el header, `zelle_amount` = total CUP y CERO filas de pago:
  `c5965c77` (FAC-004273-2026, Cable Solar Negro 4mm ×5 = 15.300 CUP),
  `cb3052c3` (FAC-004302-2026, Conectores MC4 ×1 = 4.760 CUP),
  `119a4f5e` (FAC-004311-2026, Conectores MC4 ×1 = 4.760 CUP).
- **Evidencia económica (sustancia USD físico):** 15.300÷680 = 22,50 USD exactos
  (= 5 × 4,50 USD, el MISMO precio unitario USD del Cable Solar 4mm de la venta
  e2614f36 del 07-11) · 4.760÷680 = 7,00 USD exactos. Patrón del bucket
  «USD físico → zelle @680» (decisión 2 del importador, usada ya en los datos
  pre-corte del propio propietario). Conforme a la declaración del anexo §4
  (todo cobro USD fue EFECTIVO salvo las 3 declaradas — que NO son estas).
- M4 añade la sección B2 al normalizador: header → `cash`, pools
  `zelle_amount` → `cash_amount`, **SIN crear payment_transactions** (§5/§6:
  sin pagos ni movimientos nuevos; contabilidad invariante — sin cobros, la
  re-derivación mantiene ING_VENTAS + diferencia_cobro sin movimiento de
  destino, exactamente como GEN-1). Queda documentado para veto/ajuste
  documental del propietario (canal: rectificador idempotente).

### 6.3 Hallazgo EXTERNO — `register_supplier_payment_batch` (trabajo paralelo del propietario)
- Función NUEVA creada DIRECTAMENTE en producción (~16:40 UTC, entre dos runs del
  CI del PR #1669), sin migración ni rama GitHub. RPC de lote de pagos a
  proveedor (1-20 componentes, idempotente por bloque) que delega cada
  componente al canónico `register_supplier_payment`.
- Detectada por el SQL Security Gate LIVE (secdef_no_auth: 121 vs 120). Su ACL
  concedía EXECUTE a `authenticated` SIN verificación de identidad en el cuerpo
  (solo pertenencia del documento al store_id suministrado por el llamador)
  → ruta de escalada sobre el canal EXCLUSIVO service_role de la función que
  envuelve.
- **Acción tomada (mínima, no destructiva):** REVOKE EXECUTE from
  PUBLIC/anon/authenticated — ahora service_role-only, el EXACTO patrón de su
  función hermana. El trabajo del propietario continúa intacto por el canal
  service_role. Entrada de allowlist añadida con documentación completa y
  expiración 2026-12-31.
- **FLAG al propietario:** el cuerpo usa el contrato heredado
  (`'cash','transfer','zelle'` — rechaza `external_transfer`) y debe integrarse
  al contrato canónico CP-FIN-004 + representarse en el stream de migraciones
  cuando su PR llegue.

## 7. Normalización ejecutada (16:22:46 UTC) — resultado

```json
{"status":"OK","residual_zelle":0,"n_ventas_efectivo":238,"n_ventas_exterior":3,
 "usd_exterior_final":870.00,"n_works_representacion":31,
 "usd_reclasificados_efectivo":38014.64,"n_headers_efectivo_sin_cobros":3}
```

- **Las 3 declaradas** → `external_transfer` + USD: cobros 330/330/210 USD
  (Σ=870,00 exacto = declaración) con pools CUP 224.400/224.400/142.800 (@680).
- **238 ventas** con cobros zelle → `cash` (235 completas + 3 anuladas que
  conservan su estado): 38.014,64 USD nominales reclasificados a efectivo.
  Reconciliación del universo FASE 0: 241 filas zelle de venta = 3 + 238 ✓.
- **3 headers CUP@680 sin cobros** → `cash` (sección B2, contabilidad invariante).
- **31 cobros de trabajos** → `external_transfer` (solo representación; los
  works no generan asientos y están fuera del alcance declarado).
- **Post-condición**: 0 zelle residual (cobros y headers) ✓ · idempotencia
  re-ejecutada → `YA_APLICADO` ✓ · auditoría `CP_FIN004_NORMALIZE` con conteos ✓.
- Distribución final de cobros de venta ENERVIDA (sin zelle):
  cash CUP 463/10.430.399,98 · cash USD 243/38.237,64 · external_transfer USD
  3/870,00 · transfer CUP 67/1.264.610,01.
- GEN-1 intacta tras la normalización (3.618 movimientos sin cambios).

## 8. GEN-2 — reconstrucción activada (16:24:27 UTC)

| Fase | Resultado |
|---|---|
| create | `7db60abf-401c-4ec9-ae36-4d49b8e94d42` (GEN-2, snapshot de GEN-1) |
| build | candidate · 1.059 asientos re-derivados · 1 copiado · 1 anulación · 34 existentes · **0 errores · 0 no-reconstruibles** |
| validate | **ok=true** · identidad global **0,00** · 0 duplicados · cobertura documental COMPLETA (VENTA 719/719, RECEPCION 89/89, VALE_SALIDA 203/203, SERVICIO 21/21, COMISION 1/1, FLUJO_CAJA 2/2, DEVOLUCION 2/2, AJUSTE 1/1) |
| activate | GEN-2 **active** · GEN-1 superseded (conservada íntegra) · GEN-0 superseded |

### Puente GEN-1 → GEN-2 (única diferencia entre generaciones)
| Categoría | GEN-1 | GEN-2 | Δ |
|---|---|---|---|
| ACT_TRANSF_EXTERIOR | 24.606.900,00 | **591.600,00** | −24.015.300,00 |
| ACT_EFECTIVO_USD | 27.500,00 | **24.042.800,00** | +24.015.300,00 |
| Todas las demás | — | — | **0,00** |

- El espejo es EXACTO: 24.015.300 CUP salen de la cuenta exterior y entran a la
  caja USD; 591.600 CUP restantes en exterior = 870 USD × 680 (las 3 declaradas).
- **Ingresos, COGS, inventario, bancos, caja CUP y CxP: intactos** (Δ=0) — la
  reclasificación solo corrige el DESTINO del cobro, jamás el hecho económico.

### Informes LIVE (generación activa GEN-2)
- Dashboard: **desequilibrio_monto 0 · desequilibrio_balance false** · errores 0.
- KPIs: efectivo_usd 24.042.800 · transfer_exterior 591.600 · bancos
  1.264.610,01 · efectivo_cup 1.233.950 · resultado_neto 30.544.840,20
  (= ingresos 35.923.304,99 − costo_ventas 4.506.831,73 − gastos 871.633,06 ✓).
- Las 3 declaradas visibles en ACT_TRANSF_EXTERIOR con `amount_origin`
  330/330/210 USD (trazabilidad a la moneda original).
- Nota de semántica preexistente (documentada, NO regresión): para ventas
  importadas denominadas en CUP con cobro USD@680, el par
  (`currency_origin`=moneda del documento, `amount_origin`=nominal del cobro)
  es idéntico en GEN-1 y GEN-2 (verificado venta a venta, p. ej. 1dc55aca).

## 9. Verificación de la UI/contrato (E2E BD aislada, código definitivo)

- **Spec de misión 10/10 PASS** (Pruebas A–F del anexo §7 + contrato +
  normalizador con fixtures de las 3 declaradas + demás USD + header sin cobros
  M4 + idempotencia YA_APLICADO) + guardrail **net delta = 0**.
- **pos-checkout (smoke del CI) 9/9 PASS** + net delta = 0 (UI con contrato
  `external_transfer`, presentación sin cambios).
- Unitarios de los módulos tocados 107/107 · tsc 0 errores · ESLint 0 errores.
- Contrato estático: 218/218 representadas, 0 divergencias (surface re-certificado
  dos veces: tras M2 y tras M4) · check-writers OK · manifiesto replay 188 MATCH.

## 10. Criterios de aceptación del anexo (§9) — verificación

1. ✅ POS conserva las 3 opciones (UI sin cambios; solo el value de datos).
2. ✅ Backend sin `zelle` como método canónico: 0 zelle residual en ENERVIDA;
   ingestión normaliza; `zelle` queda como heredado legible.
3. ✅ Las 3 ventas Zelle reales clasificadas `external_transfer` + USD
   (870,00 USD exactos) con cuenta exterior propia.
4. ✅ Demás ventas USD → `cash` + USD (238; incluidas las 3 anuladas que
   conservan estado) — ninguna conserva zelle/exterior por la moneda (Prueba D).
5. ✅ Transferencia (nacional) diferenciada de Transf. Exterior (cuentas y
   columnas separadas; 67 cobros transfer CUP intactos).
6. ✅ Moneda y medio independientes (Prueba D en E2E: USD ≠ exterior).
7. ✅ Regresión histórica (Prueba E): informes y re-derivación no reproducen
   zelle (GEN-2 re-derivada 100% desde fuentes normalizadas).
8. ✅ Venta mixta (Prueba F): cada componente conserva medio/moneda/importe/cuenta.
9. ✅ Sin doble contabilidad: GEN-2 re-deriva (no duplica); GEN-1 conservada;
   cobertura documental exacta; identidad 0,00.
10. ✅ Montos/monedas/fechas/tasas históricas intactos (Δ=0 en todas las
    categorías excepto el espejo exterior↔caja USD).
11. ✅ Migraciones inmutables aplicadas por canal canónico y registradas
    (M1-M4); datos legados compatibles sin contaminar registros nuevos.
12. ✅ Evidencia completa (este expediente + JSONs de ejecución + XLSX).

## 11. Entregables

- Migraciones M1-M4 (repo = producción, shas verificados) · spec E2E de misión ·
  normalizador v2 con sección B2 · M3 de seguridad (ACL).
- Evidencia de ejecución: `scripts/out/cpfin004/` (aplicaciones M3/M4,
  normalización, GEN-2 create/build/validate/activate, verificaciones).
- XLSX de conciliación para el propietario: `download/CP-FIN-004-CONCILIACION-POS-BACKEND.xlsx`.
