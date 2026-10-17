# INCIDENTE — REPORTE DE ENTREGA: MONEDAS E IMPORTES DE VENTAS (SKU 108 EN CERO) — ENERVIDA-VITALLCONS 16/10/2026

**Sistema:** COSTPRO 4 Multitienda · **Tienda:** ENERVIDA-VITALLCONS (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`)
**Módulo:** Inicio → OPERACIÓN → Ventas → **Reporte Entrega** (`CashReportView`, plantilla por defecto «Diario (Empresa)»)
**Periodo incidente:** 16/10/2026 (ventana de negocio Habana `[16T04:00Z, 17T03:59:59.999Z]`)
**Ejecución:** 17/10/2026 · **Rama:** `fix/reporte-entrega-monedas-sku108-1610` · **Base:** `main` @ `9ebdada5b`
**Estado:** ✅ **CORREGIDO Y PROBADO LOCALMENTE** (API real + PDF real + pruebas). **NO desplegado** — ver §11.

---

## 1. Síntomas originales

1. El reporte de entrega presentaba todas las ventas en **MN/CUP** aunque existían operaciones cobradas en USD: la venta del SKU 128 pagada en efectivo USD (40 USD) aparecía absorbida dentro del efectivo CUP (31 600 convertidos a tasa 790) y **no existía ningún grupo ni columna USD** para el día.
2. La venta real del **SKU 108 «Cajita Breckera sencilla gris» (12 000 CUP en efectivo)** aparecía **en cero** en la tabla de productos (cantidad 1, importes `-`), pese a estar registrada, cobrada y con su Kardex verificado.
3. Consecuencias contables del defecto: `cash_balance_cup` inflado (184 950 en lugar de 153 350 — el equivalente CUP del cobro USD no es efectivo CUP físico) y el desglose de billetes/cuadre calculados sobre un efectivo inexistente.

**Reproducción formal (antes de corregir):** `scripts/repro_monedas_1610.mjs` contra la API real del servidor local con sesión real, guardada en `audit-evidence/20261017-reporte-entrega-monedas-1610/reproduccion_api_antes.json`. Extracto: `items-summary` devolvía `SKU 108 → total_cup 0, cash_paid 0`; `SKU 128 → cash_paid 47 600` (suma del cobro USD convertido + el cobro CUP, sin columna USD); `payment-totals` → `CUP {cash: 184950}` sin bucket USD.

## 2. Ruta exacta del reporte y archivos involucrados

Cadena de datos (verificada de punta a punta):

```
RPC get_cash_report (Supabase)
  → GET /api/cash-report            (route.ts — summary + sales_split + grupos `sales`)
  → GET /api/cash-report/items-summary   (tabla por producto del PDF)
  → GET /api/cash-report/payment-totals  (fuente 2 de computeDailySummary)
  → GET /api/cash-report/details    (drill-down por (método, moneda) del acordeón)
  → CashReportView.tsx (pantalla) · cash-report-pdf.ts (previsualización/PDF/impresión — plantillas Estándar/Simple/Diario)
  → src/lib/cash-report/summary.ts  (fórmulas únicas computeDailySummary/lineTotalCup/splitItemPortion)
```

## 3. Causa raíz demostrada — clasificación monetaria incorrecta

**El modelo canónico guarda los cobros convertidos a CUP y la moneda original del cobro vive a nivel ítem.**

Evidencia del código (payload real del POS V2): `src/components/views/terminal/views/pos/usePOSCheckout.ts` L129-182 — «Sumas reales por método (filas de pago por item, **convertidas a CUP**) — la fuente de lo REALMENTE recibido» → `cash_amount/transfer_amount/zelle_amount` son **CUP canónico**, y `sale_currency='USD'` **solo cuando hay Zelle** (L226). Los ítems preservan la composición original (`cash_paid`+`cash_currency`, `transfer_paid`+`transfer_currency`, `zelle_paid`+`zelle_currency`, y la línea con `currency='USD'`, `exchange_rate=790`, `price_at_sale_cup=15800`).

Las consultas del reporte clasificaban por `transactions.sale_currency` (`/api/cash-report` L74-95, `payment-totals` L49-73, `details` L46) — que es `'CUP'` para TODAS las 13 transacciones del 16/10 — y además **excluían explícitamente `sale_currency='MIXED'`**. Resultado: un cobro en efectivo USD (fila 10: 40 USD × tasa de tienda 790 = 31 600 CUP canónico) quedaba clasificado como CUP; el bucket USD quedaba vacío; la página USD del PDF ni siquiera se generaba (`usdHasContent` falso).

**Datos reales verificados (SELECT read-only, `payment_transactions` + `transaction_items`):**

| Fila | Tx | Producto | Registro canónico | Cobro real |
|---|---|---|---|---|
| 10 | `d7c8ef72…` | SKU 128 ×2 | `sale_currency=CUP`, `cash_amount=31 600`, ítem `currency=USD`, `exchange_rate=790`, `price_at_sale_cup=15 800`, filas de pago NULL | **40 USD efectivo** (conversión exacta 40×790=31 600) |
| 14 | `8ab7becf…` | SKU 128 ×1 | `total_amount=15 800`, `cash_amount=16 000`, `payment_incidents` sobrepago **+200 CUP** | **16 000 CUP efectivo** |
| 17 | `1df5d727…` | SKU 108 ×1 | `total_amount=0` (precio catálogo 0 al vender), `cash_amount=12 000`, `payment_incidents` sobrepago **+12 000 CUP** | **12 000 CUP efectivo** |

La fuente de negocio (tabla de referencia de la misión y `docs/audits/REGISTRO_OPERACIONES_2026-10-16_ENERVIDA.md` §2 filas 10/14/17) confirma el desglose: SKU 128 = 16 000 CUP + 40 USD; SKU 108 = 12 000 CUP.

## 4. Causa raíz demostrada — importe cero del SKU 108

La venta existe y está completa (transacción `completed`, ítem vinculado, Kardex `sale` verificado, cobro `cash_amount=12 000` + `payment_transactions` 12 000 CUP + incidencia de sobrepago). El cero se producía **en la consulta de agregación**, por dos factores combinados:

1. `transaction_items.price_at_sale_cup = 0` — la venta se registró al **precio de catálogo histórico 0** (error de carga del catálogo, corregido después a 12 000 CUP por misión previa; el precio histórico de la venta NO se altera).
2. El reparto del cobro por ítem era **proporcional al valor de línea** (`splitItemPortion`): con `Σ línea = 0`, la razón `0/0` devolvía `{0,0,0}` — el cobro real de 12 000 CUP del pool de la transacción nunca llegaba a la tabla.

Punto exacto donde los 12 000 CUP desaparecían: `items-summary/route.ts` (versión anterior) L134-146 + `summary.ts` `splitItemPortion` L221 (`if (!(txTotalValue > 0)) return {0,0,0}`).

## 5. Cambios realizados y justificación

**Principio:** corregir la CONSULTA/presentación, nunca el dato. Cero escrituras sobre datos operativos (§8). La reconstrucción es determinista y sin inventar importes.

### 5.1 Nuevo módulo único `src/lib/cash-report/collection-currency.ts`

Fuente única de la **moneda real de cobro** (consumido por las 4 rutas del módulo). Reglas:

1. **Verdad a nivel ítem (ventas V2):** si el ítem registró la fila de pago (`cash_paid`/`cash_currency`, etc.), esa es la moneda del cobro y se usa tal cual.
2. **Legado (filas NULL — caso 16/10):** los pools están en CUP canónico. Para cada método con pool > 0:
   - `zelle` → cobro **USD** (riel USD por diseño): `USD = pool / tasa` con la tasa del contexto (`sale_exchange_rate` de la venta o la de la línea). Sin tasa válida → permanece en CUP (no se inventa conversión).
   - `cash`/`transfer` → si **todas** las líneas del cobro son de moneda original USD **y** el pool coincide exactamente (±0,01) con el valor canónico CUP de esas líneas, el cobro se hizo en **USD** (la conversión exacta del RPC es la marca del mecanismo): `USD = Σ precio_at_sale × cantidad` (40 = 20×2 para fila 10). Cualquier residual ≠ 0 evidencia cobro en **CUP** — los sobrepagos se documentan en CUP (`payment_incidents.received_cup`) — y se reporta el pool real (16 000 fila 14; 12 000 fila 17).
3. **Líneas de monedas originales mezcladas sin filas de pago:** indistinguibles a nivel pool → CUP canónico (conservador, igual que el comportamiento previo del pool) marcado `mixedUnresolved` para auditoría.
4. **Reparto por ítem:** proporcional al valor CUP de línea; **si Σlínea = 0 pero hay cobro, el cobro se asigna por partes iguales** (con 1 ítem: cobro completo — repara el SKU 108). El total histórico `total_cup` de la línea NO se altera; la diferencia cobro-vs-histórico se marca `has_payment_incident` (dato real ya documentado en la BD).
5. **Nunca se suman CUP y USD**: buckets separados por moneda; el equivalente CUP de cada bucket se lleva aparte solo para conciliación (`amountCup`).

### 5.2 Rutas corregidas

| Archivo | Cambio |
|---|---|
| `src/app/api/cash-report/route.ts` | `sales_split` y grupos `sales` por **moneda de cobro** (reconstrucción por ítems; defensiva: transacciones sin ítems conservan el criterio previo). Grupos coherentes con el split → pantalla, acordeón y plantilla Estándar heredan la clasificación real. Se eliminó la exclusión de `sale_currency='MIXED'` (sus cobros ya no desaparecen). El override de comisiones por fecha de pago (FIX-RE-1510 v2) queda intacto. |
| `src/app/api/cash-report/items-summary/route.ts` | Agregación delegada en `buildItemsSummary` (una fila por producto, cobros por moneda). Compatibilidad: `cash_paid/transfer_paid/zelle_paid` siguen expuestos con los importes CUP. Nuevos campos: `cash_cup/transfer_cup/zelle_cup`, `cash_usd/transfer_usd/zelle_usd`, `usd_total`, `total_quantity`, `has_payment_incident`. |
| `src/app/api/cash-report/payment-totals/route.ts` | Misma reconstrucción (fuente 2 de `computeDailySummary`). Ventana original (fin exclusivo) sin cambios. |
| `src/app/api/cash-report/details/route.ts` | Rama `type=sale`: la pertenencia al grupo (método, moneda) se decide por la moneda real de cobro; devuelve `total` = importe del cobro en esa moneda (40 USD / 12 000 CUP), sin alterar los campos crudos del documento. |

### 5.3 Presentación (`cash-report-pdf.ts`)

- Plantilla **Diario (Empresa)** (por defecto): la tabla por producto pasa a la **estructura de referencia del negocio** — `Código | Descripción | Cant. | Efectivo (CUP) | Transfer. (CUP) | USD | Comisión` — **una fila por producto** con sus cobros en cada moneda (SKU 128: 3.00 | 16 000 | − | 40.00). Página USD: `Código | Descripción | Cant. | Efectivo (USD) | Zelle`, ahora generada cuando hay cobros USD.
- Etiqueta genérica **«Desglose de efectivo MN» → «Desglose de efectivo CUP»** (coherente con el resto de COSTPRO; la columna corresponde a CUP).
- Filas con cobro ≠ total histórico se marcan con `*` y leyenda: «* Importe cobrado difiere del total histórico de la venta (incidencia de pago documentada)» — dato real de `payment_incidents`, sin alterar importes.
- Plantilla **Estándar/Simple** (tabla «PRODUCTOS VENDIDOS»): columnas `Efectivo (CUP) / Transfer. (CUP) / USD` con los nuevos campos y totales por moneda.

## 6. Pruebas ejecutadas y resultados

### 6.1 Pruebas automatizadas (vitest)

| Suite | Resultado |
|---|---|
| `src/__tests__/lib/cash-report-collection-currency.test.ts` (**NUEVA**, 17 casos: fixture real del 16/10 + pagos mixtos V2 + zelle legacy/con y sin tasa + sobrepago CUP + sin ítems + reparto proporcional/igualitario + guardas de `lineUsdOf`/`lineCupOf`) | **17/17 ✓** |
| Regresión: `cash-report-view`, `cash-report-dedicated-view` (comp+nav), `cash-report-icon-variant`, `ipv-ventas-navigation`, `gate1-navigation`, `cash-report-period-attribution` | **163/163 ✓** |
| TypeScript (scoped `tsconfig.mision-1610.json`: módulo + 4 rutas + PDF + tests) | 0 errores |
| ESLint (7 archivos de la misión) | 0 errores |

### 6.2 Verificación end-to-end con la API real (solo GET, sesión real, servidor local pm2)

Evidencia: `audit-evidence/20261017-reporte-entrega-monedas-1610/` (`reproduccion_api_antes.json`, `verificacion_api_despues.json`, `verificacion_drilldown_regresion.json`, `reporte_diario_1610_corregido.pdf`, capturas `ui_*.png`). Scripts: `scripts/repro_monedas_1610.mjs`, `scripts/verify_drilldown_regresion_1610.mjs`, `scripts/descarga_pdf_1610.mjs`, `scripts/captura_ui_1610.mjs`.

| Caso (§7 de la misión) | Antes | Después |
|---|---|---|
| 1-5. Totales del 16/10: cant 41 / efectivo 153 350 / transfer 2 400 / USD 40 | 41 / 172 950¹ / 2 400 / **sin USD** | **41 / 153 350 / 2 400 / 40 ✓** |
| 6. SKU 108 = 12 000 CUP, nunca cero | 0 | **12 000 ✓** (marca `*` por incidencia) |
| 7. SKU 128 componentes CUP+USD | 47 600 todo en CUP | **16 000 CUP + 40 USD ✓** (una fila, dos monedas) |
| 8. SKU 158: 3 registros = 2 400 transfer sin duplicar | 2 400 ✓ | **2 400 ✓** (3 transacciones contadas, sin doble conteo) |
| 9. Ventas USD no desaparecen | sin grupo/página USD | **grupo `Efectivo (USD) 1 tx $40` en pantalla + página USD del PDF con 40,00 ✓** |
| 10. Aislamiento por tienda | filtros `store_id` intactos | ✓ (sin cambios en los filtros; módulo opera sobre las filas de la consulta) |
| 11. Rango distinto → resultados propios | — | ✓ (15/10 verificado aparte) |
| 12. Pagos mixtos sin duplicación | — | ✓ (prueba unitaria de conservación: Σítems == buckets == pools) |
| 13. Anuladas según reglas del sistema | `neq('status','voided')` / `eq('status','completed')` intactos | ✓ |
| 14. Otros días/tiendas sin cambios | — | **15/10 verificado: split CUP cash 32 000 = Σ pools reales (20 000+8 000+4 000), sin USD que reclasificar, items idénticos** ✓ |
| 15. Pantalla = previsualización = PDF = impresión = Excel | — | ✓ pantalla y PDF verificados con el mismo origen (`items-summary` + `sales_split`); Excel del módulo no existe como salida separada en esta vista (no aplica) |

¹ 172 950 = items-summary legacy (`total_cash`) sobre pools sin reclasificar; el summary de la API daba 184 950.

**PDF Diario real descargado (página 1):** tabla con 108 → 12 000,00; 128 → 16 000,00 + 40,00 USD; totales 153 350,00 / 2 400,00 / 40,00; leyenda de incidencias. **Página 2 (USD):** Resumen USD 40,00 + tabla 128 → 40,00. **Página 3 (Órdenes):** intacta.

## 7. Conciliación registros reales ↔ importes mostrados

| Concepto | Registros reales (BD) | Reporte corregido | Referencia negocio |
|---|---:|---:|---:|
| Cantidad de artículos vendidos | Σ qty ítems de ventas = 41 | **41** | 41 ✓ |
| Efectivo CUP | Σ pools cash CUP-cobrados = 80 000+2 500+10 000+20 000+12 000+6 250+6 500+100+16 000 = 153 350 | **153 350,00** | 153 350 ✓ |
| Transferencia CUP | 800×3 = 2 400 | **2 400,00** | 2 400 ✓ |
| USD (cobro original) | fila 10: 40 USD (conversión exacta a 31 600) | **40,00** | 40 ✓ |
| Efectivo esperado a entregar (CUP) | 153 350 (el equivalente CUP del cobro USD NO es efectivo CUP físico) | **153 350,00** (antes 184 950) | — |
| SKU 108 | `total_amount=0` + `cash_amount=12 000` + incidencia +12 000 | **Efectivo 12 000,00** · Total histórico 0 (no alterado) · marca `*` | 12 000 ✓ |
| SKU 128 | fila 10 (40 USD) + fila 14 (16 000 CUP, sobrepago +200) | **16 000 CUP + 40 USD** · Total histórico 47 400 · marca `*` | 16 000 + 40 ✓ |

Diferencias documentadas (no corregidas a mano, remitidas a decisión del propietario según `REGISTRO_OPERACIONES_2026-10-16_ENERVIDA.md` §4): sobrepago +200 CUP (fila 14) y +12 000 CUP (fila 17, precio de catálogo 0 al vender). El reporte muestra lo REALMENTE cobrado y señala la diferencia con `*`; el total histórico de cada línea permanece intacto.

## 8. Verificación de regresiones en otras tiendas y fechas

- **15/10/2026 (misma tienda):** `sales_split` CUP cash 32 000 = Σ pools reales; sin bucket USD; ítems idénticos (141×1 20 000 · 47×1 8 000 · 142×2 4 000); `cash_balance_cup` 31 700 (32 000 − 300 de comisiones pagadas, criterio FIX-RE-1510 intacto). El día no tiene ventas USD ni líneas cero → la reconstrucción no reclasifica nada.
- **Días con ventas `sale_currency='USD'` históricas (zelle):** la reconstrucción las clasifica USD (riel USD) con la tasa del contexto — antes quedaban en CUP canónico cuando el grupo era por `sale_currency`; el USD ahora aparece en su columna con su equivalente conciliado (`amountCup`). Caso cubierto por prueba unitaria (fixture 210 USD zelle del 14/10).
- **Transacciones sin ítems:** conservan el criterio previo (pool → `sale_currency`), incluida la exclusión de `MIXED` en esa rama defensiva.
- **`mixedUnsplit` permanece 0** en la reconstrucción: los casos indistinguibles (monedas originales mezcladas sin filas de pago) permanecen en CUP canónico igual que antes — no salen del efectivo esperado (evita mover totales de días históricos).
- **Filtros de tienda/estado/fechas:** sin cambios (`store_id`, `status='completed'`/`neq voided`, ventanas por `created_at`); el aislamiento multi-tienda (RLS + filtro) queda intacto.

## 9. Archivos modificados

| Archivo | Tipo |
|---|---|
| `src/lib/cash-report/collection-currency.ts` | NUEVO — módulo único de moneda de cobro |
| `src/app/api/cash-report/route.ts` | Corregido — split + grupos por moneda de cobro |
| `src/app/api/cash-report/items-summary/route.ts` | Corregido — agregación por producto con cobros por moneda |
| `src/app/api/cash-report/payment-totals/route.ts` | Corregido — misma reconstrucción |
| `src/app/api/cash-report/details/route.ts` | Corregido — drill-down por moneda de cobro |
| `src/components/views/terminal/views/cash/cash-report-pdf.ts` | Corregido — tabla por producto (Efectivo/Transfer CUP + USD), etiqueta MN→CUP, leyenda de incidencias, página USD |
| `src/__tests__/lib/cash-report-collection-currency.test.ts` | NUEVO — 17 pruebas |
| `tsconfig.mision-1610.json` | NUEVO — typecheck acotado de la misión |
| `scripts/repro_monedas_1610.mjs`, `scripts/verify_drilldown_regresion_1610.mjs`, `scripts/descarga_pdf_1610.mjs`, `scripts/captura_ui_1610.mjs`, `scripts/captura_vista_previa_1610.mjs` | NUEVOS — tooling de reproducción/verificación (solo GET) |
| `audit-evidence/20261017-reporte-entrega-monedas-1610/*` | NUEVO — evidencia (antes/después, PDF real, capturas) |

## 10. Rama, commit y PR

- **Rama:** `fix/reporte-entrega-monedas-sku108-1610` (desde `main` @ `9ebdada5b`, worktree limpio verificado antes de modificar).
- **PR:** abierto contra `main` de `Nardian90/Costpro` para protección del trabajo — número visible en el PR (URL registrada en el resumen de la misión).
- Servidor local reactivado con **pm2** (`costpro`, `bun server.ts`, puerto 3000, `.env` restaurado) y usado para toda la verificación end-to-end.

## 11. Estado del despliegue y comprobación en el entorno

| Fase | Estado |
|---|---|
| **Corregido** (código en rama) | ✅ |
| **Probado localmente** (API real + PDF real + pruebas automatizadas contra producción-lectura) | ✅ |
| **Integrado** (PR abierto; merge pendiente de revisión) | ⏳ |
| **Desplegado** (Vercel/costpro4.vercel.app) | ❌ **NO desplegado** — requiere merge del PR y pipeline de despliegue. No se afirma corrección en producción hasta verificarla allí. |

**Limitaciones de verificación:** la verificación end-to-end se realizó contra el mismo Supabase de producción en modo lectura (las rutas corregidas corrieron en el servidor local); el despliegue en Vercel y su verificación en el entorno público quedan pendientes del merge. `tsc` del repo completo se queda sin memoria en este host (limitación conocida documentada en la misión 15/10) — se usó typecheck acotado + CI pendiente.

## 12. Restricciones respetadas

- **Cero escrituras** sobre datos operativos: no se crearon ventas, ni se alteraron registros históricos, precios, stock, triggers, RLS ni validaciones. Todas las consultas directas fueron SELECT.
- No se añadieron excepciones para el SKU 108 ni para ENERVIDA: la corrección es general (moneda de cobro por reconstrucción + reparto con Σlínea=0).
- No se convirtieron USD a CUP para ocultar el problema: el equivalente convertido solo se usa internamente para conciliación y queda separado (`amountCup`).
- Se conservaron los criterios vigentes que no son parte de este incidente (atribución de comisiones por fecha de pago, ventana de negocio Habana, exclusión defensiva de `MIXED` sin ítems).
