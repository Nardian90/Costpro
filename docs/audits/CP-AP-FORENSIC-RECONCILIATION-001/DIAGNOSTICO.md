# CP-AP-FORENSIC-RECONCILIATION-001 — DIAGNÓSTICO FORENSE (FASE 0-1)

**Fecha:** 2026-11-25 · **Tienda auditada:** ENERVIDA-VITALLCONS (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`) ·
**Alcance de datos:** producción CostproBD (`wthkddeleylijmonclxg`), consultas EXCLUSIVAMENTE de solo lectura
(scripts re-ejecutables `scripts/cxap-forensic-audit.mjs` y `scripts/cxap-forensic-detail.mjs`).

---

## 1. Reproducción exacta de los indicadores observados

Con la lógica EXACTA de `GET /api/accounts-payable` (misma selección `status <> 'voided'`, mismo
`today` a medianoche UTC) los 4 KPI y todos los intervalos de antigüedad se reproducen al centavo:

| Indicador | Reproducido | Observado por el propietario |
|---|---:|---:|
| Vencido | $2,352,085.70 | $2,352,085.70 |
| Próximos 7 días | $556,766.00 | $556,766.00 |
| Total pendiente | $2,963,828.90 | $2,963,828.90 |
| Pagado (KPI) | $68,665.00 | $68,665.00 |
| Aging (corriente/próx7/0-30/31-60/61-90/91-120/+120) | $54,977.20 / $556,766.00 / $357,370.20 / $22,594.00 / $1,966,260.00 / $5,861.50 / $0.00 | idéntico |

Documentos en scope: 92 recepciones + 27 servicios + 1 comisión (no voided). Bajo el `limit=200`
por fuente → sin truncamiento hoy en esta tienda (el defecto de paginación existe pero no explica
estas cifras; ver §5).

## 2. CAUSA RAÍZ de la discrepancia «Pagado $68,665.00 vs $0.00»

Dos definiciones INCOMPATIBLES de «Pagado» conviven en la misma pantalla:

- **KPI `totalPaid`** (route.ts L381-384): Σ `total_cup` de documentos con `payment_status='paid'`
  (docs TOTALMENTE pagados, que la tabla EXCLUYE).
- **Columna «Pagado» de Por proveedor** (route.ts L430-448): Σ `paid_cup` de documentos con
  `payment_status !== 'paid'` (SOLO pagos parciales de docs pendientes). El `continue` de L431
  elimina a los pagados de la agrupación.

Con 0 documentos parciales en ENERVIDA, la tabla da $0.00 y el KPI da el total de los 28 docs
pagados. **No es un problema de datos: es una incoherencia de presentación con dos semánticas distintas.**

### 2.1 Desglose documental de los $68,665.00 (verificado transacción a transacción)

28 documentos totalmente pagados: 26 servicios + 1 recepción ($1.00, Juan Carlos) + 1 comisión
($300.00, «Dependiente 1 Pueblo», pagada 2026-10-15 por su canal propio `commission_payments`,
sin `payment_transactions` — por diseño).

Los 26 servicios + 1 recepción suman **$68,365.00** vía 27 filas `payment_transactions`
(direction='in', moneda CUP, método cash), pagadas el MISMO día de creación (flujo pago-inmediato
de Servicios Recibidos) salvo 2 con `payment_date` un día ANTERIOR a `created_at` (ver §4.3).
Proveedores: Tienda Pueblo $19,344.00 (20 servicios), Pedro DTI Etecsa $31,860.00, Danny Ruiz
Perez $6,100.00, Pixelarte $4,800.00 (2), Israel Leyva Velazques $5,000.00, Vendedor $860.00,
TiendaPueblo $400.00 (grafía distinta, ver §4.2), Juan Carlos $1.00. Más la comisión $300.00.

### 2.2 Conciliación objetivo (la que la vista debe exhibir)

| Concepto | Importe |
|---|---:|
| Total (obligaciones incl. pagadas) | $3,032,493.90 |
| Pagado (pagos aplicados a esas obligaciones) | $68,665.00 |
| Saldo = Total − Pagado | $2,963,828.90 (= Total pendiente ✓) |

`Total − Pagado = Saldo` y `Σ saldos por proveedor = Total pendiente` se verifican por proveedor.

## 3. Error al regresar de Detalles a Por proveedor — CAUSA RAÍZ

**Reproducido en el navegador** (evidencia `download/evidencia/cxap-antes-04-regreso-grouped.png`
y stack en logs): al volver de «Detalle» a «Por Proveedor» la vista muere con
`TypeError: Cannot read properties of undefined (reading 'current') at GroupedTableView … Array.map`.

Mecanismo exacto (condición de carrera de estado):
1. `setViewMode('grouped')` se aplica de forma SINCRÓNICA;
2. el `data` del hook aún contiene el array del modo LIST (`UnifiedPayable[]`, sin `.aging`) y
   `loading` sigue `false` (terminó en `false` tras la fetch anterior);
3. el render intermedio ejecuta `GroupedTableView` con filas sin `.aging` → `row.aging.current`
   → TypeError → `ViewErrorBoundary` (TerminalShell) muestra «Error al cargar Cuentas por Pagar»
   con Reintentar = `window.location.reload()` — de ahí que recargar «arregle» la vista.

El mismo defecto en sentido inverso (grouped→list) no crashea pero renderiza filas basura
(`NaN`) porque `ListView` tolera campos undefined. La pestaña de aging NO filtra en modo grouped
(usa `payables` sin aplicar `tab`) — inconsistencia adicional detectada.

## 4. Hallazgos de datos (separados de los de presentación — sin corrección automática, §12)

### 4.1 Pago de $1,800 sobre un servicio VOIDED, sin reversión (PROBLEMA DE DATOS)

- Servicio `fedb7c40-8f10-48fd-8356-cc7e6a7ce0e7` (F-23112026, Pixelarte, $1,800): creado
  2026-11-23 21:34, voided 21:35 (1 minuto), con UN pago `in` de $1,800 aplicado y SIN fila
  contraria (Σ reversals de la tienda = $0.00).
- Existe OTRO servicio ACTIVO F-23112026 (`602eb3c1`, Pixelarte $1,800) creado y pagado el mismo
  día → el usuario creó+pagó, anuló, y volvió a crear+pagar. El pago del servicio anulado quedó
  vivo en `payment_transactions` y en caja (Σ CxP txns = $70,165, no $68,365).
- La maquinaria de reversión (`reverse_supplier_payment`) se aplicó a producción el 2026-11-24,
  DESPUÉS de este incidente (2026-11-23) → el pago quedó sin netear.
- **Propuesta contable (NO ejecutada, requiere aprobación):** `reverse_supplier_payment` sobre el
  pago del servicio voided con motivo trazable, dejando evidencia en `audit_logs`. Nada se tocó.

### 4.2 Grafías de proveedor (no fusionar automáticamente)

- «Tienda Pueblo» (25 docs) vs «TiendaPueblo» (1 servicio $400, pagado) — se agrupan por string
  exacto → dos filas en la tabla.
- 3 recepciones con `supplier='—'` (em-dash literal, $19,435, unpaid, creadas 2026-10-12..22).
- Variantes «Inventario inicial Vitallcons» / «(electricos)» / «(servicios)» — legítimas por
  diseño (migraciones de inventario inicial).

### 4.3 Pagos con `payment_date` un día anterior a la creación del documento (2 casos)

`d9e9f2d1` (creado 2026-10-23, pagado 2026-10-22) y `3aefdb27` (creado 2026-11-01, pagado
2026-10-31). Consistente con fecha de negocio Habana vs medianoche UTC en el flujo
pago-inmediato de Servicios Recibidos. Impacto en CxP: solo orden del historial. Se documenta;
la corrección pertenece al módulo SR (fuera de alcance contable de esta misión).

### 4.4 Sin otros hallazgos negativos

- Conciliación doc↔pagos: 28/28 docs activos concilian `paid_amount` con Σ neta de sus txns
  (única excepción esperada: la comisión, que usa su canal propio).
- 0 reversiones duplicadas, 0 pagos sobre recepciones voided, 0 anticipos en drafts,
  0 docs sin proveedor nulo (los '—' son string literal, ver 4.2).
- Pagos en moneda extranjera: 279, TODAS sobre `sale`/`work` (POS/producción) — ninguna CxP.

## 5. Defectos de código detectados (a corregir en FASES 2-6)

| # | Defecto | Ubicación | Impacto |
|---|---|---|---|
| D1 | KPI «Pagado» con semántica distinta a la columna «Pagado» de la tabla | route.ts L381 | Discrepancia $68,665 vs $0.00 |
| D2 | Tabla agrupada EXCLUYE docs pagados → Total−Pagado≠Saldo | route.ts L431 | Conciliación imposible |
| D3 | Carrera viewMode/data → TypeError al volver a Por proveedor | AccountsPayableView + hook | Error de navegación (§3) |
| D4 | Tabs de aging NO filtran en modo grouped | route.ts L430 | Filtros inconsistentes entre vistas |
| D5 | Paginación `range(offset, …)` POR FUENTE + `has_more` roto | route.ts L166-170, L504 | Pérdida silenciosa de datos >200 docs/fuente |
| D6 | «Hoy» en TZ del servidor (UTC en Vercel), no día de negocio Habana | route.ts L98 | Riesgo de desfase ±1 día en aging |
| D7 | Sin filtro de fechas / fecha de corte | — | FASE 4 de la misión imposible |
| D8 | Export Excel duplica la lógica (mismos D1/D2/D6) | export/route.ts | Excel ≠ pantalla |
| D9 | `paid_amount` denormalizado como única fuente (sin reconstrucción a corte) | route.ts | Sin reproducibilidad histórica |

## 6. Diseño de la corrección (FASES 2-6)

- **Servicio de dominio puro** `src/lib/accounts-payable/calculator.ts`: una ÚNICA función
  recibe (receipts, services, commissions, payment_transactions, query{tab, category, method,
  currency, search, supplier, date_from, date_to, now}) y produce {payables, kpis, summary,
  grouped, totals, meta}. Fecha contable: `receipts.reception_date` (fallback `created_at::date`),
  `received_services.service_date` (NOT NULL), comisiones `created_at::date`.
- **Corte**: `date_to ?? hoy(Havana)`; `paid_asof` = Σ neta de txns con fecha-Habana ≤ corte
  (comisiones: `paid_at` ≤ corte). Aging sobre saldo a corte. Pagos anteriores al período cuentan
  si su doc está incluido (§6.2 de la misión); posteriores al corte no.
- **Definiciones canónicas**: Total = Σ originales incluidos · Pagado = Σ aplicados incluidos ·
  Saldo = Total − Pagado · intervalos de aging particionan el saldo (sin solapes: vence hoy →
  próximos 7d; exactamente 7d → próximos 7d; 1-30/31-60/61-90/91-120/+120 vencidos).
- **Ruta** reescrita sobre el calculador: fetch completo por chunks (sin D5), paginación del
  resultado final, `has_more` correcto, tabs aplicadas a ambos modos (D4), corte Habana (D6).
- **Vista**: filtro de fechas + banner de corte, filtro de categoría (Todos/Recepciones/
  Servicios/Comisiones), drill-down por proveedor (Por proveedor → Detalles → volver), guardas
  anti-carrera en hook (stale) y en componentes (shape guard) (D3), tabla conciliada (D1/D2).
- **Export** refactorizado al mismo calculador (D8). Cero cambios de esquema/DDL, cero toques a
  RLS, cero modificaciones de datos históricos.
