#!/usr/bin/env python3
"""Fase 4 — Genera docs/audits/AUDITORIA_CONCILIACION_ENERVIDA_VITALLCONS.md
con las tablas calculadas a partir de los volcados y resultados de conciliación."""
import json

BASE = '/home/z/my-project/scripts/enervida-recon'
OUT = '/home/z/my-project/costpro/docs/audits/AUDITORIA_CONCILIACION_ENERVIDA_VITALLCONS.md'

recon = json.load(open(f'{BASE}/recon_results.json'))
rows = recon['rows']
verdicts = recon['verdicts']
exist = json.load(open(f'{BASE}/existenciafinal.json'))['rows']
prods = json.load(open(f'{BASE}/products_enervida.json'))
stock_final = json.load(open(f'{BASE}/stock_final.json'))
comi = json.load(open(f'{BASE}/confcomisiones.json'))['rows']
ops = json.load(open(f'{BASE}/operaciones.json'))['rows']

r873 = next(d for d in ops if d['_excel_row'] == 873)
r854 = next(d for d in ops if d['_excel_row'] == 854)

# ---------- tabla de existencias por SKU ----------
prod_by_sku = {p['sku']: p for p in prods}
final_by_sku = {int(d[0]): d for d in stock_final['diferencias']}  # solo diferencias
exist_map = {d['Código']: d['Existencia Final'] for d in exist}
used_skus = {str(d['Código']) for d in ops}

stock_lines = ['| SKU | Descripción | Excel | COSTPRO (pre) | Dif. inicial | Corrección aplicada | COSTPRO (final) | Dif. final | Estado |',
               '|---:|---|---:|---:|---:|---|---:|---:|---|']
conciliados = 0
for d in sorted(exist, key=lambda x: x['Código']):
    sku = str(d['Código'])
    excel = d['Existencia Final']
    p = prod_by_sku.get(sku)
    if p is None:
        note = 'Reservado: sin operaciones en Operaciones, stock Excel 0, sin comisión definida'
        stock_lines.append(f'| {sku} | (sin producto en COSTPRO) | {excel} | — | — | No aplica | — | — | No aplicable — {note} |')
        continue
    pre = float(p['stock_current'])
    if sku == '137':
        corr, post, dif, estado = 'VS-000179-2026 (−10, fila 873)', 340.0, 0.0, '✅ CORREGIDO y conciliado'
    elif sku == '141':
        corr, post, dif = '— (pendiente, ver §6)', pre, round(pre - excel, 2)
        estado = '⚠️ Pendiente: +10 (fila 854 ausente — no registrable por política forward-only; ver §6)'
    else:
        corr, post, dif, estado = '—', pre, round(pre - excel, 2), '✅ Conciliado'
        if abs(dif) <= 0.0001:
            conciliados += 1
    difi = round(pre - excel, 2)
    stock_lines.append(f'| {sku} | {p["name"][:38]} | {excel:g} | {pre:g} | {difi:g} | {corr} | {post:g} | {dif:g} | {estado} |')

# productos COSTPRO sin fila Excel
extra = [p for p in prods if str(p['sku']) not in {str(d['Código']) for d in exist}]
for p in extra:
    stock_lines.append(f'| {p["sku"]} | {p["name"][:38]} | (sin fila) | {float(p["stock_current"]):g} | — | — | {float(p["stock_current"]):g} | — | {"✅ Sin fila Excel (999 servicio / s/correspondencia)" if p["sku"] in ("998","999") else "ℹ️ Producto COSTPRO sin fila en ExistenciaFinal"} |')

# ---------- tabla de discrepancias ----------
DISC_ESTADOS = ('CONCILIADA', 'CONCILIADA_GRUPO', 'CONCILIADA_VIA_AJUSTE', 'CONCILIADA_FECHA_DISTANTE')
disc = [r for r in rows if r['estado'] not in DISC_ESTADOS]
disc_lines = ['| Fila Excel | Fecha | Nota | SKU Excel | SKU COSTPRO | Clas. | Cant. | Diferencia detectada | Impacto | Acción ejecutada | Estado |',
              '|---:|---|---|---:|---:|---|---:|---|---|---|---|']
manual_notes = {
    873: ('137', '137', 'VS faltante en COSTPRO (intento previo como SKU 127 rechazado por stock negativo; Excel rectificado 127→137)',
          'Inventario/Kardex (−10 SKU 137)', 'VS-000179-2026 registrada vía RPC create_vale_salida con trazabilidad completa', '✅ CORREGIDO'),
    854: ('141', '141', 'Venta 141 ×10 (transf. 200.000 CUP) no registrada en COSTPRO', 'Inventario (+10 SKU 141), ventas, comisiones',
          'Documentada; NO registrable: fecha 09/10 < MAX operativo 14/10 (ERR_BACKDATED_DOCUMENT, política forward-only)', '⏳ Pendiente (requiere decisión)'),
    447: ('111', '111', 'Venta registrada en COSTPRO con fecha operativa 04/10 (re-registro POS documentado en ENERVIDA-EXCEL-IMPORT §7)', 'Ventas/fecha',
          'Emparejada con enervida-imp-ven-480 (importe exacto 2.000 CUP)', '✅ Conciliada (fecha distante documentada)'),
    688: ('87', '87', '«Ajuste» registrado como inventory_adjustment (kardex), no como recepción', 'Inventario (+7,7)',
          'Emparejada con «Ajuste ENERVIDA fila 721» (+7,7)', '✅ Conciliada vía ajuste'),
    536: ('84', '84', 'Par venta+DV ausente en COSTPRO', 'Ninguno (efecto neto 0)', 'Documentada; no registrable retroactivamente (forward-only)', '⏳ Pendiente documentada (neto 0)'),
    537: ('84', '84', 'Par venta+DV ausente en COSTPRO', 'Ninguno (efecto neto 0)', 'Documentada; no registrable retroactivamente (forward-only)', '⏳ Pendiente documentada (neto 0)'),
    791: ('9', '9', 'VS cuyo equivalente fue creada y REVERSADA en COSTPRO (VS-000126) — la DV de la fila 790 es esa reversión', 'Ninguno (neto 0)',
          'Emparejada con la reversión (fila 790)', '✅ Conciliada (compensada, neto 0)'),
    786: ('141', '141', 'Venta registrada en COSTPRO con fecha 04/10 y desglose zelle CUP (49×680)', 'Ventas/fecha/desglose',
          'Emparejada con enervida-imp-ven-819 (49 USD × 680 = 33.320 CUP, re-registro POS documentado)', '✅ Conciliada (fecha distante + convención documentada)'),
    788: ('141', '141', 'Venta importada con fecha 03/10 exacta', '—', 'Emparejada con enervida-imp-ven-821 (38.000 CUP)', '✅ Conciliada'),
    898: ('147', '147', 'Venta registrada 14/10 00:55 (la operación cruzó la medianoche)', 'Fecha',
          'Emparejada con la venta POS de 94.800 CUP', '✅ Conciliada (desfase 1 día legítimo)'),
}
for r in disc:
    n = r['excel_row']
    if n in manual_notes:
        sx, sc, dd, imp, acc, est = manual_notes[n]
        disc_lines.append(f'| {n} | {r["fecha"]} | {r["nota"] or "—"} | {sx} | {sc} | {r["cls"]} | {r["cantidad"]:g} | {dd} | {imp} | {acc} | {est} |')
    elif r['estado'] == 'FECHA_DIFIERE_1DIA':
        pass  # agregadas más abajo
    else:
        m = r.get('match') or {}
        disc_lines.append(f'| {n} | {r["fecha"]} | {r["nota"] or "—"} | {r["sku"]} | {m.get("sku", "—")} | {r["cls"]} | {r["cantidad"]:g} | {r["estado"]} | {r["cls"]} | Ver CSV anexo | {r["estado"]} |')

# muestras del desfase sistemático de recepciones
fechas_1d = [r for r in rows if r['estado'] == 'FECHA_DIFIERE_1DIA']
ent_1d = [r for r in fechas_1d if r['cls'] == 'Entrada']
ven_1d = [r for r in fechas_1d if r['cls'] == 'Ventas']
muestra = ', '.join(f'f{r["excel_row"]}' for r in ent_1d[:6])

report = f"""# AUDITORÍA DE CONCILIACIÓN — ENERVIDA-VITALLCONS
## Excel `Costpro.xlsx` vs. COSTPRO (Supabase `wthkddeleylijmonclxg`) + Configuración de comisiones por producto

**Fecha de auditoría:** 2026-10-14 · **Ejecutada por:** Agente IA (misión COSTPRO — conciliación y comisiones)
**Tienda:** ENERVIDA-VITALLCONS `5e6fe821-5465-48b1-b3f1-3aa3182edc38` (tenant `5364ccf8-…`)
**Fuente de referencia:** `Costpro.xlsx` (3 hojas: Operaciones 897 filas · ExistenciaFinal 175 SKUs · ConfComisiones 175 SKUs) — **el Excel NO fue modificado**
**Rama de trabajo:** `feat/enervida-conciliacion-comisiones` (PR #1403) · Scripts reproducibles: `scripts/enervida-recon/`

---

## 1. Resumen ejecutivo

| Métrica | Valor |
|---|---:|
| Filas Excel examinadas (hoja Operaciones) | **897** (659 Ventas · 179 VS · 55 Entradas · 4 DV; 16/07→13/10/2026) |
| Operaciones **conciliadas plenamente** | **837** (801 exactas + 33 en grupo multi-producto + 1 vía ajuste + 2 con fecha distante documentada) |
| Conciliadas con desfase de fecha ≤1 día (artefacto documentado) | **55** (54 recepciones importadas + 1 venta tras medianoche) — ver §3 |
| Conciliadas compensadas (par DV+VS / venta+DV, neto 0) | **3** (filas 536, 537, 791) |
| **Discrepancias reales** | **2** (filas 854 y 873) |
| Discrepancias **corregidas** | **1** (fila 873 → **VS-000179-2026**, SKU 127→137) |
| Discrepancias pendientes de decisión | **1** (fila 854 — ver §6) |
| Existencias conciliadas | **160/161** productos de COSTPRO vs ExistenciaFinal (99,4%) |
| Diferencia de existencias restante | **1** (SKU 141: +10, explicada por la fila 854) |
| SKUs del Excel sin producto en COSTPRO | 14 (160–173: reservados, sin operaciones, stock 0) |
| Comisiones por producto importadas | **110** reglas (75 >0 + 35 ceros explícitos) · 65 vacías omitidas · idempotencia probada |

**Resultado final de la conciliación de existencias:** 160/161 SKU conciliados; la única diferencia
(SKA 141, +10) está **explicada y trazada** a la fila 854 ausente. La conciliación NO se declara
globalmente «cerrada al 100%» mientras la fila 854 permanezca sin registrar (limitación del sistema,
§6) — el resto del libro queda conciliado con evidencia registro a registro.

---

## 2. Metodología

1. **Fuentes**: Excel leído con `openpyxl` (solo lectura, `data_only`); COSTPRO consultado vía
   Management API (`/database/query`, mismo mecanismo que `scripts/apply-migration-mgmt.ts`) y volcado
   íntegro a JSON (`scripts/enervida-recon/*.json`) como **respaldo verificable pre-corrección**.
2. **Identificación de operaciones**: cada fila Excel se empareja con registros COSTPRO por
   **clasificación + SKU + fecha (America/Havana) + cantidad decimal exacta + importes**. Los
   identificadores persistentes (id de transacción, slip_number, idempotency_key) se conservan en
   `recon_results.json`. Dos operaciones con igual SKU/importe/fecha NO se consideran duplicadas sin
   contexto documental (notas, fila-referencia de la importación `enervida-imp-ven-<fila>`).
3. **Convenciones de importes** (heredadas de `docs/audits/ENERVIDA-EXCEL-IMPORT.md`, decisiones aprobadas):
   efectivo↔`cash_paid` (CUP) · Transf↔`transfer_paid` (CUP) · USD↔`zelle_paid` (USD nativo o CUP×680) ·
   **vuelto**: filas con efectivo negativo ≡ USD neto (`usd + efectivo/680`) — equivalencia económica exacta.
   Tolerancia de redondeo ≤ 1 CUP (redondeo documentado de la importación: −0,02 en 2 filas).
4. **Matching en pasadas**: (1) estricta fecha≤1d ∧ cantidad; (2) relajada; (3) fecha distante para
   re-registros POS documentados; swap por pares para cruces de asignación; verificación por **grupo**
   para ventas multi-producto (Σ filas Excel ↔ totales de la transacción); compensación DV/VS.
5. **Precisión decimal**: cantidades comparadas sin redondeo (tolerancia 0,001); importes a 2 decimales.
6. **Fechas**: el Excel contiene fechas de calendario locales; COSTPRO almacena timestamptz → se
   normaliza a `America/Havana` para comparar día operativo.
7. **Trazabilidad de correcciones**: toda corrección usa **exclusivamente RPCs oficiales**
   (`create_vale_salida`) con idempotency_key propio, nota de origen, y respaldo pre/post verificado.

---

## 3. Detalle de discrepancias

### 3.1 Discrepancias reales y casos especiales (registro a registro)

{chr(10).join(disc_lines)}

### 3.2 Desfase sistemático de fecha en recepciones importadas (54 filas)

Las 54 recepciones importadas (`IMPORT-ENERVIDA-*`) tienen `reception_date`/`created_at` fijados a las
**16:00 UTC** del día anterior al que registra el Excel (p. ej. fila 488: Excel 09/09 ↔ COSTPRO 08/09).
Es un **artefacto documentado de la importación del 04/10** (la importación preservó la fecha operativa
en UTC). Impacto: reportes agrupados por día pueden desplazar esas entradas un día; **el stock no se ve
afectado** (cantidad correcta). Filas afectadas: {muestra}, … (54 en total; CSV anexo
`recon_discrepancias.csv`). No se corrigieron: editar 54 documentos históricos no aporta valor frente al
riesgo, y la política forward-only impide re-fechar; **documentado** como convención.

### 3.3 Clasificación completa de las 897 filas

| Veredicto | Filas | Significado |
|---|---:|---|
| CONCILIADA | {verdicts.get('CONCILIADA',0)} | Coincidencia exacta (fecha, SKU, cantidad, importes) |
| CONCILIADA_GRUPO | {verdicts.get('CONCILIADA_GRUPO',0)} | Filas de ventas multi-producto verificadas por grupo (Σ filas = totales de la transacción) |
| CONCILIADA_VIA_AJUSTE | {verdicts.get('CONCILIADA_VIA_AJUSTE',0)} | Fila «Ajuste» registrada como ajuste de inventario (kardex) |
| CONCILIADA_FECHA_DISTANTE | {verdicts.get('CONCILIADA_FECHA_DISTANTE',0)} | Re-registros POS documentados (fechas 02/09→04/10 y 02/10→04/10) |
| FECHA_DIFIERE_1DIA | {verdicts.get('FECHA_DIFIERE_1DIA',0)} | 54 recepciones (artefacto UTC) + 1 venta tras medianoche (f898) |
| AUSENTE_COMPENSADA | {verdicts.get('AUSENTE_COMPENSADA',0)} | Pares neto-cero (venta+DV f536/f537; DV+VS f790/f791) |
| AUSENTE_EN_COSTPRO | {verdicts.get('AUSENTE_EN_COSTPRO',0)} | **Discrepancias reales**: f854 (pendiente) y f873 (CORREGIDA) |

**Registros COSTPRO sin fila Excel (verificados, legítimos):**
- 18 ventas **anuladas/voided** (artefactos documentados de correcciones previas: importe-0 reclasificadas
  como VS en «LOTE 9», re-importaciones tras reversión, y pruebas del 13/10 sustituidas por copias importadas).
- 110 items de recepción `INV-INIT-*` (carga inicial de inventario del 10/08, previa al libro del Excel).
- 0 vales y 0 devoluciones sin pareja.

---

## 4. Conciliación de existencias

Fórmula aplicada: `Diferencia = Existencia COSTPRO − ExistenciaFinal Excel` (fuente de verdad:
`inventory.quantity`; `products.stock_current` sincronizado). Estado PRE = volcado de inicio de sesión
(respaldo `products_enervida.json`); estado POST = verificado tras la corrección.

{chr(10).join(stock_lines)}

**Resumen**: {conciliados} SKU conciliados con diferencia cero · SKU 137 corregido (350→340=Excel) ·
SKU 141 pendiente (+10, explicado) · 14 SKUs reservados sin producto · 0 productos COSTPRO sin fila Excel
(salvo 998/999, servicios documentados).

---

## 5. Caso especial SKU 127 → SKU 137 (fila 873)

**Localización exacta**: fila **873** del Excel (confirmada por la anotación de la col. 12
«Se rectifico del cod 127 al 137»):

| Campo | Valor Excel (fila 873) |
|---|---|
| Clasificación | VS (Vale de Salida) |
| Código | **137** (rectificado desde 127) |
| Descripción | «Tubo blanco de condulei  de 1/2 de 5M» |
| Cantidad | 10 |
| Fecha | 2026-10-10 |
| Nota | OT/Ferro |
| UM / Comisión | USD / 0 |

**Evidencia recolectada (Fase 2.3):**
1. El producto **SKU 137** en COSTPRO se llama exactamente «Tubo blanco de condulei  de 1/2 de 5M»
   (coincidencia literal de descripción); el **SKU 127** es «Transfer 220» — producto distinto.
2. En COSTPRO **no existía** ninguna VS del 10/10 con 10 uds ni del SKU 127 ni del 137 (las VS «OT/Ferro»
   de ese día eran otras filas: f874→VS-000165 SKU 112, etc.).
3. **Origen del error**: la misión anterior (10-12/10, `agent-ctx/informe-final-mision-multitienda.md` §C.2)
   intentó registrar esta VS como SKU 127 y fue **rechazada por la BD** («Stock negativo no permitido» —
   Transfer 220 tiene stock 0). El usuario rectificó el Excel a 137, pero la operación **nunca llegó a
   registrarse** en COSTPRO.
4. **Impacto numérico exacto**: COSTPRO 350 vs Excel ExistenciaFinal **340** → diferencia **−10** = la VS faltante.
5. Los movimientos históricos del SKU 127 (3 VS de 1 ud en sept., filas 536/685/754 del Excel viejo) están
   correctos y conciliados — el error afectaba SOLO a esta operación.

**Corrección ejecutada (trazabilidad completa):**
- Mecanismo oficial: RPC **`create_vale_salida`** (el mismo que invoca la UI), con `p_user_id` de
  admin@demo.com (atribución de las importaciones ENERVIDA) y `p_idempotency_key =
  recon-enervida-fila873-vs137x10`.
- Resultado: **VS-000179-2026** (id `0ea29335-8d2a-40b1-8524-f17604cf26ba`), 10 uds, coste 1,00 c/u,
  nota: «OT/Ferro | fila Excel 873 (rectificada 127→137) — regularización conciliación 14/10/2026; VS no
  registrada al momento (rechazo stock negativo como SKU 127 erróneo); fecha operativa hoy por política
  forward-only».
- **Fecha operativa**: el Excel data la VS el 10/10; la política forward-only de la BD
  (`validate_operation_date` → `ERR_BACKDATED_DOCUMENT`) prohíbe fechar documentos anteriores al MAX
  operativo de la tienda (14/10). La VS quedó fechada hoy; la discrepancia de fecha queda documentada en
  la nota del documento y en este informe.
- **Verificación post-corrección**: `products.stock_current` 350→**340**; `inventory.quantity` 350→**340**
  (versión 3→4); kardex `issue_slip_out −10 → balance_after 340` con nota trazable; **idempotencia
  probada** (reintento → `ERR_IDEMPOTENCY_KEY_REUSE`, 0 duplicados); SIN tocar el SKU 127 ni documentos ajenos.
- Respaldo pre-corrección: `scripts/enervida-recon/backups/pre_correccion_sku137.json`.

---

## 6. Pendientes y riesgos

1. **Fila 854 — venta 141 ×10 (transf. 200.000 CUP, 09/09→09/10, comisión 2.000)**: ausente en COSTPRO.
   Es la causa exacta de la diferencia +10 del SKU 141 (34 vs 24). **No es registrable** por los flujos
   oficiales: su fecha (09/10) es anterior al MAX operativo (14/10) y `validate_operation_date` rechaza
   documentos retrodatados (`ERR_BACKDATED_DOCUMENT`). Evidencia necesaria para decidir: autorización del
   equipo para (a) registrarla con fecha actual (pérdida de fecha histórica) o (b) mantenerla fuera del
   sistema y ajustar la referencia del usuario. Mientras tanto, **NO se aplicó ningún ajuste manual de
   inventario** para «maquillar» la diferencia (regla de la misión: no ocultar errores documentales).
2. **Pares neto-cero** (f536/f537 venta+DV; f790/f791 DV+VS): sin impacto en stock ni importes. Si el
   usuario quiere el rastro documental completo, requerirían la misma vía (registro con fecha actual),
   valor dudoso — se dejan documentados.
3. **Convención de fecha de las 54 recepciones importadas** (§3.2): los reportes diarios pueden desplazar
   entradas un día. Riesgo bajo; corrección opcional (UPDATE de reception_date) NO ejecutada por prudencia.
4. **SKUs 160–173**: reservados en el catálogo del usuario (stock 0, sin operaciones, sin comisión). Si se
   llegan a usar, deberán darse de alta en COSTPRO (el alta manual desde Recepciones ya funciona tras el
   PR #1400).
5. **20 filas de ventas con comisión ≠ qty × unidad actual** (julio): la tarifa unitaria cambió a lo largo
   del tiempo; ConfComisiones se importó como configuración VIGENTE (no se reconstruyeron tarifas históricas).

---

## 7. Validación final

**Pruebas ejecutadas (con evidencia real en BD):**
- 897/897 filas de Operaciones clasificadas por el motor de conciliación (reproducible:
  `scripts/enervida-recon/reconcile.py` sobre volcados JSON versionados).
- Corrección f873: RPC oficial + verificación de stock (340=Excel), kardex (balance_after 340),
  idempotencia (`ERR_IDEMPOTENCY_KEY_REUSE`) y ausencia de efectos colaterales (SKU 127 intacto).
- Existencias: comparación 3 fuentes (products / inventory / kardex) × 161 productos × 175 SKUs Excel.
- Importación de comisiones: doble corrida (110 creadas → 110 sin cambios), fidelidad 100% vs Excel,
  35 ceros preservados, trigger de versionado activo (1 versión), aislamiento por tienda verificado.
- Suite completa: **2916 tests passed / 0 failed** (2 corridas consecutivas; una corrida previa registró
  1 fallo intermitente no relacionado, no reproducible), `tsc --noEmit` limpio, eslint 0 errores.
- Nuevas pruebas del motor de comisiones: 6/6 (multi-producto per_unit, decimal, cero explícito,
  store-wide, worker-ajeno, producto sin regla).

**Datos corregidos (production):**
- VS-000179-2026 (fila 873, SKU 137 ×10) — única escritura de la misión, por RPC oficial y trazada.
- Regla de comisiones `product_specific` store-wide + 110 filas `commission_rule_products` (ENERVIDA).

**Comprobaciones que NO pudieron completarse:**
- Registro retroactivo de la fila 854 (política forward-only — decisión del equipo pendiente, §6).
- Verificación UI «en vivo» del sub-tab Por producto con sesión autenticada (el despliegue del cliente
  corregido requiere merge del PR #1403; la persistencia queda garantizada por arquitectura: los valores
  viven en `commission_rule_products` y la UI los hidrata vía GET /api/commissions/rules).

**No se declara la conciliación global como 100% cerrada** mientras la fila 854 esté sin registrar;
el resto del libro (896/897 filas, 160/161 existencias) está conciliado con evidencia registro a registro.

---

## 8. Comisiones por producto (Fase 5)

**Análisis de ConfComisiones**: 175 filas (SKU + «Comisión por Unidad Vendida»); 75 valores >0, 35 ceros
explícitos, 65 vacías; sin duplicados ni inconsistencias; moneda CUP (validado: 523 filas de venta
cumplen `Comisión = cantidad × unidad` del propio Excel); todos los SKUs con valor existen en el catálogo.

**Implementación (integrada con la arquitectura existente — sin sistemas paralelos):**
- Datos: 1 regla `product_specific` store-wide (`worker_id NULL` = «Toda la tienda», id
  `79fc05ac-5243-4646-9693-b84b5c872e76`, `valid_from 2026-10-14`, modo `per_unit`) +
  **110 filas** en `commission_rule_products` (`commission_amount` CUP, ceros incluidos).
  Idempotente por `UNIQUE (rule_id, product_id)`; el trigger SQL registró la versión 1.
- Motor: `src/lib/commission-engine.ts` ya calcula `per_unit → monto × cantidad` y excluye esas líneas
  del % de otras reglas — verificado con pruebas nuevas (6/6).
- UI (`WorkersView.tsx`): el sub-tab «Por producto» ya muestra la columna Comisión editable, búsqueda por
  SKU/categoría, productos sin regla identificados (campo vacío + preview «—»). **Corrección aplicada**:
  el guardado descartaba los ceros explícitos (`amount > 0` → ahora `amount != null`), requisito
  «los ceros se conservan como cero».
- Persistencia: valores en BD (sobreviven a recargas y re-logins por arquitectura).
- Importador reproducible: `scripts/enervida-recon/import_comisiones.py` (resumen creado/actualizado/
  sin-cambios/omitidas/pendientes; segunda corrida = 0/0/110).

**Resumen de la carga inicial**: creadas 110 · actualizadas 0 · sin cambios 0→110 (2ª corrida) ·
omitidas 65 (vacías) · pendientes 51 de 161 productos (sin regla definida, identificables en la UI).

---

## 9. Pruebas de la misión (14 casos obligatorios)

| # | Caso | Resultado |
|---|---|---|
| 1 | Venta que coincide exactamente con el Excel | ✅ 801 conciliadas exactas |
| 2 | Operación con SKU incorrecto corregible | ✅ f873 (127→137) corregida vía RPC |
| 3 | Operación duplicada no contabilizada dos veces | ✅ matching uno-a-uno; 0 duplicados creados; idempotencia RPC probada |
| 4 | Entrada y VS con efecto correcto sobre inventario | ✅ 55 entradas + 179 VS conciliadas; kardex verificado |
| 5 | Devolución que revierte el movimiento correcto | ✅ 2 devoluciones + 1 reversión de VS conciliadas |
| 6 | Cantidad decimal con precisión conservada | ✅ 14 filas decimales (p.ej. 65,5 / 27,5) exactas |
| 7 | SKU con existencia diferente antes de corregir | ✅ SKU 137 (−10) diagnosticado y corregido |
| 8 | Conciliación del SKU 137 | ✅ 340 = Excel tras VS-000179 |
| 9 | Carga de comisión unitaria desde ConfComisiones | ✅ 110 reglas importadas (75 >0, 35 =0) |
| 10 | Comisión de venta multi-producto | ✅ prueba del motor: Σ por línea (6/6 tests) |
| 11 | Persistencia tras recargar | ✅ valores en commission_rule_products (BD) |
| 12 | Repetición de carga sin duplicar | ✅ 2ª corrida: 0 creadas / 110 sin cambios |
| 13 | Separación de configuración por tienda | ✅ regla con store_id propio; TIENDA CENTRAL (60 reglas preexistentes) y Puerto Padre (0) intactas |
| 14 | Sin alteraciones en otras tiendas | ✅ ninguna escritura fuera de ENERVIDA (verificado por query de reglas por tienda y volcados) |

---

## 10. Archivos modificados / entregables

| Archivo | Cambio |
|---|---|
| `src/components/views/terminal/views/workers/WorkersView.tsx` | Preservar ceros explícitos al guardar el catálogo por producto (`amount != null`) |
| `src/__tests__/lib/commission-product-confcomisiones.test.ts` | Nuevo — 6 pruebas del motor de comisiones por producto |
| `scripts/enervida-recon/reconcile.py` | Nuevo — motor de conciliación reproducible (897 filas) |
| `scripts/enervida-recon/import_comisiones.py` | Nuevo — importador idempotente de ConfComisiones |
| `scripts/enervida-recon/inspect_excel.py`, `dump_excel.py`, `dump_store_ops.py`, `db.py` | Nuevos — inspección y volcados verificables |
| `scripts/enervida-recon/*.json` | Volcados de datos + resultados (respaldo y evidencia) |
| `docs/audits/AUDITORIA_CONCILIACION_ENERVIDA_VITALLCONS.md` | Este informe |

**Base de datos (producción, escrituras trazadas):**
1. `issue_slips` + `issue_slip_items` + `stock_movements` + `kardex_entries`: VS-000179-2026 (f873).
2. `commission_rules` (1 regla) + `commission_rule_products` (110 filas) + `commission_rule_versions` (v1).

*Rama: `feat/enervida-conciliacion-comisiones` · PR: https://github.com/Nardian90/Costpro/pull/1403 (sin merge, pendiente de autorización).*
"""
open(OUT, 'w').write(report)
print(f'Informe generado: {OUT} ({len(report)} chars)')
