# INFORME FORENSE — INTEGRIDAD ECONÓMICA DE RECEPCIONES
## Caso principal: FAC-VITALLCONS-001 (recepción `fd9d6c88-5db8-49ea-b185-8bc96cc93e63`)

**Misión:** CP-RECEIPT-INTEGRITY-001 · **Fecha:** 2026-11-14 · **Tienda:** ENERVIDA-VITALLCONS
**Alcance de datos:** producción `wthkddeleylijmonclxg` — **EXCLUSIVAMENTE LECTURA** (98 recepciones, 309 líneas, 310 movimientos de compra, 89 asientos CP-FIN, auditoría completa del caso). Escrituras de prueba solo en la BD aislada E2E `lguovmvrozxgssupkwpf`.
**Entregable técnico:** rama `fix/recepciones-integridad-20261114` (PR a main) con la corrección del defecto de inmutabilidad + presentación.

---

## 0. Resumen ejecutivo

| Magnitud | Valor |
|---|---|
| Total mostrado en «Total Costo» | **192.039.436,00 CUP** |
| Suma de subtotales de línea comunicada | **5.404.573,25** (mezcla **5.129.706 CUP + 274.867,25 USD sumados sin convertir**) |
| Diferencia detectada | **186.634.862,75 = 274.867,25 USD × (680 − 1)** |
| Naturaleza de la diferencia | **La conversión de divisa de las 22 líneas USD, aplicada EXACTAMENTE una vez** |
| Defecto de cálculo del motor | **NINGUNO** — cabecera = Σ(q·uc·tasa) con diferencia 0,00 |
| Defecto REAL | **(1) Presentación**: subtotales en moneda original con etiqueta «CUP» junto al total CUP; **(2) Inmutabilidad**: las rutas de edición de moneda/tasa de líneas mutaban recepciones confirmadas sin guard ni recalculo (demostrado con una edición real el 2026-11-14T12:15Z); **(3) Tasa ad-hoc 680** sin respaldo de las series oficiales de la fecha — **decisión económica del propietario** |
| Alcance del defecto de presentación | 5 recepciones con líneas en divisa (el caso + 4 del 2026-10-26) |
| Alcance del defecto aritmético | **0 de 98 recepciones** (ninguna diferencia de cabecera > 1 CUP; CP-FIN cuadra en las 89 contabilizadas) |
| Consecuencia mayor en curso | Asiento CP-FIN de 192.039.436 CUP (débito ACT_INVENTARIO / crédito PAS_CXP_PROV) emitido HOY por el backfill m020 sobre un inventario físico mayoritariamente en 0 → **activo fantasma en balance** pendiente de decisión del propietario |

---

## 1. Las 7 preguntas de la misión, respondidas

### 1.1 ¿Cuál es el total correcto y por qué?

**Ambos importes son correctos en su denominación; el total económico del documento en CUP es 192.039.436,00.**

- 5.404.573,25 no es un total: es la **suma aritmética de subtotales expresados en dos monedas distintas sin convertir** (5.129.706 CUP de 79 líneas CUP + 274.867,25 USD de 22 líneas USD). Sumarlos entre sí carece de significado económico.
- 192.039.436,00 es el **equivalente CUP** del documento: cada línea USD se convierte **una sola vez** con la tasa congelada en su propio snapshot (`receipt_items.tasa_cambio_recepcion = 680`), y las CUP entran con tasa 1. La cabecera coincide con ese recomputo **al céntimo** (diferencia 0,00 verificada independientemente en SQL/REST, sin usar las funciones de la interfaz).
- Matemática exacta de la diferencia reportada: `192.039.436,00 − 5.404.573,25 = 186.634.862,75 = 274.867,25 × 679`. La app **no multiplica dos veces** por la tasa; la UI mostraba dos magnitudes distintas (mezcla original vs CUP) una al lado de la otra sin declarar la moneda de cada una.

**Salvedad económica (no aritmética), que exige decisión del propietario:** la tasa 680 no corresponde a ninguna serie oficial de la fecha del documento (2026-07-01: BCC seg.3 ≈ 585–589; elToque ≈ 620) ni de la fecha real de creación (2026-08-11: sin fila de tasa ese día; hoy BCC seg.3 = 832, Diviza/tienda = 910). Los 22 costos unitarios en USD son magnitudes plausiblemente USD (Panel 585 = 380 USD; MC4 = 7 USD; Cable solar 4 mm = 4,5 USD; Transfer trifásico = 65 USD), de modo que la denominación USD de las líneas parece intencional y el costo unitario original se conserva. **Si la tasa real de esas compras no era 680, el valor correcto del documento en CUP cambia, y esa rectificación es un acto económico que debe hacerse por procedimiento autorizado, nunca por edición silenciosa.**

### 1.2 ¿Cuál de los dos importes está mal, si alguno?

Ninguno a nivel de cálculo. Está mal la **presentación**: el modal «Total Costo» mezclaba la etiqueta «CUP» en subtotales que estaban en moneda original (defecto documentado en `ReceptionDetailsModal.tsx:648` con `formatCurrency(item.quantity * item.unit_cost)` sin pasar la moneda, frente a `:507` que muestra `receipt.total_cost` en CUP). El usuario compara entonces 5,4 M «CUP» contra 192 M CUP y concluye que hay 186,6 M «perdidos». La vista `ReceptionProductLinesTable` sí hacía la presentación correcta (desglose por moneda + «≈ CUP»), lo que confirma que el patrón correcto ya existía en el producto y el modal divergía de él.

### 1.3 ¿En qué capa se introduce la diferencia?

- **Nivel A — Datos originales:** líneas intactas; snapshot por línea (moneda + tasa + unit_cost) correcto. El documento fue **creado fuera del flujo canónico** (importación legacy del 2026-08-11 22:49 con `reception_date` retroactiva y `updated_at` forjado), pero los datos económicos guardados son internamente consistentes.
- **Nivel B — Cálculo económico:** correcto. Conversión única por línea; sin doble conversión; sin líneas duplicadas ni ausentes (101 líneas ↔ 101 movimientos de compra con `unit_cost` ya convertido: 680000 = 1000×680, 44200 = 65×680, 6800 = 10×680).
- **Nivel C — Backend:** el total de cabecera se calcula con la misma fórmula canónica (`calculate_receipt_total_cup` = Σ(q·uc·tasa)) y coincide. **El defecto de backend real es de GOBERNANZA**: las rutas `PATCH /api/inventory/receptions/[id]/items/[itemId]` y `POST /api/inventory/receptions/backfill-tasas` mutaban líneas con `service_role` (bypaseando el DENY de RLS) **sin guard de estado y sin recalcular `receipts.total_cost`** — divergencia potencial de 3 vías (cabecera vs líneas vs proyecciones ya aplicadas). Hoy a las 12:15:56Z se ejecutó una edición de tasa sobre una línea de esta recepción **active** (680→680, sin cambio numérico): el camino de escritura funcionaba.
- **Nivel D — Interfaz:** aquí se **introduce la percepción** de la diferencia (etiquetado de monedas mezclado). La hora mostrada «18:49:18» provenía de `created_at` real (22:49:18Z = 18:49:18 Habana) combinada con la `reception_date` retroactiva «01/07/2026», ocultando que el documento se creó el 11/08.

### 1.4 ¿El error afecta a otras recepciones?

- **Aritmética: no.** Matriz completa de las 98 recepciones (89 ENERVIDA-VITALLCONS, 5 PUERTO PADRE, 4 COSTPRO-Prueba): **0 con diferencia de cabecera > 1 CUP**; 0 posibles conversiones duplicadas; 0 líneas duplicadas/ausentes; importes CP-FIN == ΣCUP en las 89 contabilizadas. Clasificación: 93 «Correcta», 4 «Diferencia monetaria (presentación)», 1 «Caso principal».
- **Presentación: sí.** Las 5 recepciones con líneas en divisa comparten el defecto del modal: `fd9d6c88` (USD@680) y `41b16484` (USD@840), `7c305acb` (USD@835), `d5f3a77b` (USD@845), `0d40955f` (USD@840) — todas ENERVIDA, 2026-10-26; sus tasas están dentro del rango oficial de ese día (743–845), por lo que solo el caso principal combina además tasa no oficial.
- **Contabilidad: 9 recepciones sin contabilizar** (5 PUERTO PADRE + 4 COSTPRO-Prueba, incluida 1 revertida) — el backfill m020 (PR #1621) aún no cubre esas tiendas.
- `41b16484` comparte además «sin trazabilidad de inventario» (movimientos sin vínculo) — documentado, sin modificar.

### 1.5 ¿Editar las tasas de los productos altera documentos históricos?

- **La configuración actual de un producto NO reescribe la historia**: las líneas guardan un snapshot congelado (`unit_cost`, `moneda_recepcion`, `tasa_cambio_recepcion`); el modal solo joinea `products` por identidad/imagen. **Verificado empíricamente en la BD aislada (escenarios S5/S6):** cambiar `cost_price`, `price` y `price_currency` de un producto dejó intactas las líneas y el total de su recepción activa.
- **Las rutas de edición de tasa/moneda de LÍNEAS sí alteraban la historia confirmada** (ver 1.3, demostración de las 12:15Z). Corregido en esta misión: guard de estado (solo `pending`), delegación en la RPC canónica `update_receipt_item_tasa` (autorización por membresía + F-21 + auditoría dual + recalculo atómico de cabecera), y trigger de inmutabilidad a nivel BD (`ERR_RECEIPT_ITEM_IMMUTABLE`) con escape hatch gobernado (`SET LOCAL app.allow_receipt_item_edit='on'`) para correcciones autorizadas y trazadas.

### 1.6 ¿Qué consecuencias hay sobre inventario, WAC y CP-FIN?

- **Inventario:** el caso tiene 105 movimientos de compra con fecha forjada `2026-07-01T12:00`, `reference_id NULL` y `reference_doc` textual («Confirmacion recepcion») → **la trazabilidad movimiento↔recepción está rota** (la conciliación por referencia es imposible; se reconstruyó por producto+fecha). Cantidades y costos sí cuadran con las líneas (unit_cost ya convertido).
- **WAC:** la valoración a 680 se propagó al costo medio de varios productos (`Yee MC4` 6800 = 10×680; `Transfer trifásico` 44200 = 65×680; `Caja TRIC` 17000 = 25×680). La misión GATE16 (2026-10-06/07) ya había registrado 57 `wac_correction` citando textualmente `fd9d6c88` como evidencia, con contradicciones anotadas (línea 1000 USD/ud vs precio de venta 1000 CUP).
- **CP-FIN:** hoy 2026-11-14T01:51Z el backfill m020 emitió el asiento «reconocimiento» por **192.039.436 CUP** (débito ACT_INVENTARIO / crédito PAS_CXP_PROV), recomputado en vivo desde las líneas — coherente con ellas, pero apoyado en inventario físico mayoritariamente 0 (`stock_current` 0 en la mayoría de los 101 productos). Mientras el propietario no valide la tasa 680, el balance muestra un **activo de inventario de 192 M CUP sin respaldo físico contable**. La regularización histórica de costos y cualquier backfill financiero deben esperar a esta decisión (prioridad absoluta marcada por la misión).

### 1.7 ¿Qué correcciones deben hacerse y en qué orden?

**Ya implementadas (rama `fix/recepciones-integridad-20261114`, PR adjunto):**
1. **Modal de detalle** (`ReceptionDetailsModal.tsx`): subtotales de línea con moneda explícita + «≈ CUP» con la tasa congelada; pie de resumen en CUP (Σ de las líneas); tarjeta «Total Costo (CUP)» con aviso de conversión única; desglose por moneda cuando haya mezcla; toast explicativo para el 409.
2. **Ruta PATCH de ítems** → delegación completa en la RPC canónica `update_receipt_item_tasa` (guard autoritativo solo `pending`, autorización por membresía, F-21, auditoría dual, recalculo de cabecera) + guard temprano 409 con remedio.
3. **Ruta backfill-tasas** → pre-check `has_store_access_as`, filtro **`receipts.status='pending'`** obligatorio, delegación por ítem en la misma RPC (auditoría + recalculo por recepción), aislamiento de fallos por ítem.
4. **Ruta PATCH de cabecera** → campos económicos/documentales (supplier, referenceDoc, itemUpdates) solo en `pending`; `notes` editable en cualquier estado; `ERR_NOT_EDITABLE` → 409.
5. **Migración `20261114160000`** → trigger `BEFORE UPDATE` en `receipt_items`: bloquea mutaciones de líneas de recepciones no-pendientes incluso para `service_role`, con escape hatch gobernado y documentado. *(Pendiente de aplicación a producción por el procedimiento controlado del propietario; aplicada y probada en la BD aislada.)*
6. **Pruebas**: 43 unitarias/integración nuevas (rutas + modal + migración) + suite E2E aislada de 12/12 con los 13 escenarios de la misión + guard de higiene net-zero.

**Propuestas para decisión del propietario (por orden recomendado):**
1. **Decidir la tasa real** de las 22 líneas USD de FAC-VITALLCONS-001 (680 ad-hoc vs oficial ~585/620 del 01/07/2026). Sin esta decisión no se puede avanzar en nada dependiente del valor del documento.
2. Si la tasa 680 es correcta: **conciliar el activo fantasma** (inventario contable 192 M CUP vs stock físico ~0) mediante el procedimiento de regularización de inventario que el propietario planifique — con trazabilidad completa.
3. Si la tasa debe rectificarse: **reversión/anulación controlada + recepción correctiva** (o corrección gobernada con escape hatch documentado), con registro de usuario/fecha/motivo/valores y reconciliación de WAC y CP-FIN.
4. **Aplicar la migración** `20261114160000` a producción (cuando el PR se fusione, por el canal controlado habitual) — la BD aislada ya la validó.
5. **Completar la contabilización** de las 9 recepciones restantes (PUERTO PADRE + COSTPRO-Prueba) extendiendo el backfill m020.
6. **Reparar la trazabilidad** de los 105 movimientos históricos sin vínculo (backfill de `reference_id`/`notes` con auditoría) — opcional, para conciliación futura.
7. Revisar las 5 líneas con moneda de línea ≠ moneda de producto (2 USD/CUP + 3 CUP/USD) — decisión de negocio menor.

---

## 2. Diagnóstico de backend y frontend (evidencia de código)

### 2.1 Backend — dónde vive cada magnitud

| Magnitud | Dónde se almacena | Regla |
|---|---|---|
| Moneda de venta del producto | `products.price_currency` | No interviene en recepciones |
| Tasa «actual» (auto-fill) | `exchange_rates` (BCC seg.3/Diviza) | Auto-rellena el formulario; no es histórica |
| Tasa de tienda (POS/ventas) | `store_exchange_rates` | **NO la usan las recepciones** |
| Moneda/tasa de la LÍNEA | `receipt_items.moneda_recepcion / tasa_cambio_recepcion` | **Snapshot congelado — única fuente de conversión** |
| Total de cabecera | `receipts.total_cost` | Implícitamente CUP; recalculado por `calculate_receipt_total_cup` |
| Costo histórico al inventario | `stock_movements.unit_cost` | CUP ya convertido (uc×tasa, una vez) |
| WAC | `products.cost_average` (+ `wac_change_log`) | Blend con uc_in = uc_cup |

### 2.2 Frontend — el defecto exacto

```tsx
// ReceptionDetailsModal.tsx (ANTES):
const subtotal = receipt?.total_cost || 0;            // total de cabecera (CUP)
...
{formatCurrency(item.quantity * item.unit_cost)}      // :648 — moneda ORIGINAL, etiqueta «CUP»
{formatCurrency(receipt?.total_cost || 0)}            // :507 — total CUP
```
`formatCurrency(amount, currency = 'CUP')` etiqueta CUP por defecto → una línea de 274.867,25 USD se muestra «$ 274.867,25 CUP». Corregido: cada subtotal con su moneda + «≈ CUP» equivalente + pie «Subtotal (CUP)» + tarjeta «Total Costo (CUP)».

### 2.3 Ciclo de vida y matriz de permisos por estado documental

Estados reales (`receipts_status_check`): `pending | confirmed | active | partial | voided | reversed`. Transiciones válidas (trigger `trg_validate_receipt_transition`): `pending→[confirmed|active|voided]`, `confirmed→[active|reversed|voided]`, `active→[reversed|voided]`, `partial→[active|confirmed|reversed|voided]`; `voided`/`reversed` terminales. En producción: `register_reception` crea `active` directo (online/offline/sync); `confirm_pending_reception` hace `pending→active` recalculando; `void_pending_reception` anula borradores; `reverse_receipt_v2` revierte activas.

| Operación | pending | active | voided | reversed |
|---|---|---|---|---|
| Editar líneas (cantidad/costo/moneda/tasa) — vía RPC canónica | **SÍ** (`update_reception_items`, `update_receipt_item_tasa`) | NO (`ERR_NOT_EDITABLE`) | NO (`ERR_ALREADY_VOIDED`) | NO |
| Editar líneas — vía ruta API (ANTES de esta misión) | SÍ | **SÍ (defecto)** | **SÍ (defecto)** | **SÍ (defecto)** |
| Editar líneas — vía ruta API (DESPUÉS) | SÍ (delega en RPC + recalculo) | **409** | **409** | **409** |
| Mutación directa service_role/SQL (DESPUÉS + migración) | SÍ | **ERR_RECEIPT_ITEM_IMMUTABLE** | **ERR_RECEIPT_ITEM_IMMUTABLE** | **ERR_RECEIPT_ITEM_IMMUTABLE** |
| Editar cabecera: supplier / referenceDoc | SÍ | **409 (solo `notes`)** | 409 | 409 |
| Anular / revertir | `void_pending_reception` | `reverse_receipt_v2` | terminal | terminal |
| Contabilización CP-FIN | al pasar a active (trigger diferido) | reconocimiento emitido | anulación del asiento | anulación del asiento |

---

## 3. Evidencia de pruebas (BD aislada CostproE2E)

**Suite E2E `e2e/creation/receipts-integrity.spec.ts` — 12/12 PASS** (los 13 escenarios de la misión; el 5 y 6 comparten test):
S1 CUP puro (total 600 = Σq·uc) · S2 USD puro (170.000 = Σq·uc·680, conversión única) · S3 monedas mezcladas (68.500 = 500 CUP + 68.000 USD@680) · S4 tasa histórica congelada (backdated 500 ≠ vigente; no se reconvierte al consultar) · S5/S6 cambio posterior de costo+moneda del producto → recepción activa intacta · S7 borrador: CUP→USD@700 recalcula cabecera 200→140.000 + auditoría · S8 confirmada inmutable: 409 + remedio, trigger bloquea incluso service_role, cabecera solo `notes`, nada cambia · S9 anulación de borrador (líneas preservadas) + correctiva 140.000 · S10 recalculo desde detalles en todas (cabecera == Σ) · S11 movimientos vinculados por uuid con `unit_cost = uc·tasa` (no uc·tasa²) y cantidades exactas · S12 WAC con `uc_in = uc·680` por línea y CP-FIN == ΣCUP · S13 duplicado de factura rechazado (`ERR_INVOICE_DUPLICATE`) y PATCH no-op → `no_change` con totales estables.
**Higiene:** `data-hygiene-guard` AFTER → **PASS — net delta = 0**. Migración `20261114160000` aplicada a la BD aislada y verificada (trigger + función).
**Regresión completa:** vitest 6052 PASS (443 archivos; el único fallo inicial era el conteo del manifiesto de replay 160→161 por la migración nueva — actualizado) · `tsc --noEmit` 0 errores · eslint 0 errores (avisos preexistentes de estilo).
**Unitarias/integración nuevas:** 43 pruebas (guard de rutas, delegación RPC, recalculo, mapping de errores, modal con monedas, contrato estático de la migración).

## 4. Cumplimiento de restricciones

Producción **solo lectura** (REST GET + 1 RPC SELECT). No se modificó `fd9d6c88`, ni sus líneas, ni monedas/tasas/costos, ni WAC, ni inventario, ni estados, ni asientos; sin migraciones aplicadas a producción, sin merge ni deploy. La recepción anómala que la matriz detectó quedó **documentada sin tocar**. La única escritura de la sesión en producción fue la **lectura**… ninguna (la edición de las 12:15Z fue anterior, detectada por auditoría). Escrituras de prueba exclusivamente en la BD aislada (net-zero verificado). El `.env` principal quedó restaurado con health 200.

## 5. Expediente y trazabilidad

- `EVIDENCIA_FAC-VITALLCONS-001.json` — extracción íntegra con hashes SHA-256 por sección (cabecera, 101 líneas, productos, tienda, tasas, auditoría de tasas, WAC, fin_entries, pagos, audit_logs, exchange_rates, backup PR-2, recomputo independiente).
- `MATRIZ_RECONCILIACION_RECEPCIONES.xlsx` — matriz de las 98 recepciones (clasificación, trazabilidad, contabilización) + resumen + hoja del caso.
- `consultas_sql_independientes.sql` — las consultas reproducibles (ejecutadas de forma equivalente vía REST+JS por las limitaciones de red del sandbox; documentado en el propio archivo).
- `MANIFIESTO_SHA256_RECEPCIONES.txt` — manifiesto de todos los entregables.
- Expediente dentro del repo: `docs/audits/receipt-integrity-20261114/`.

**Criterio de cierre de la misión:** cada línea conserva su moneda y costo de origen; la conversión se realiza una sola vez; la cabecera coincide con la suma válida de sus componentes (0,00 de diferencia en 98/98); una recepción confirmada ya no puede alterarse silenciosamente (verificado a nivel API y BD); los cambios actuales de productos no reescriben la historia (verificado E2E); inventario, WAC y CP-FIN reciben exactamente el importe de las líneas — y el importe de las líneas (tasa 680) queda pendiente de la única decisión que no es técnica: **la validación de la tasa por el propietario.**
