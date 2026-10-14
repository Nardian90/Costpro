# AUDITORÍA DE CONCILIACIÓN — ENERVIDA-VITALLCONS
## Excel `Costpro.xlsx` vs. COSTPRO (Supabase `wthkddeleylijmonclxg`) + Configuración de comisiones por producto

> **ESTADO ACTUAL (2026-10-14): CONCILIACIÓN CERRADA — corte 14/10/2026.** Las secciones 1–10
> describen el estado de la auditoría previa y se conservan como historial. La última regularización
> pendiente (fila 854 / SKU 141) fue resuelta y la conciliación integral quedó en **0 diferencias**.
> Ver **§11 «Cierre definitivo de conciliación — corte 14/10/2026»** para el estado vigente, la tabla
> final de los 175 SKUs y el resumen ejecutivo del cierre.

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
(SKU 141, +10) está **explicada y trazada** a la fila 854 ausente. La conciliación NO se declara
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

| Fila Excel | Fecha | Nota | SKU Excel | SKU COSTPRO | Clas. | Cant. | Diferencia detectada | Impacto | Acción ejecutada | Estado |
|---:|---|---|---:|---:|---|---:|---|---|---|---|
| 536 | 2026-09-11 | — | 84 | 84 | Ventas | 1 | Par venta+DV ausente en COSTPRO | Ninguno (efecto neto 0) | Documentada; no registrable retroactivamente (forward-only) | ⏳ Pendiente documentada (neto 0) |
| 537 | 2026-09-11 | — | 84 | 84 | DV | 1 | Par venta+DV ausente en COSTPRO | Ninguno (efecto neto 0) | Documentada; no registrable retroactivamente (forward-only) | ⏳ Pendiente documentada (neto 0) |
| 791 | 2026-10-05 | OT/54 | 9 | 9 | VS | 1 | VS cuyo equivalente fue creada y REVERSADA en COSTPRO (VS-000126) — la DV de la fila 790 es esa reversión | Ninguno (neto 0) | Emparejada con la reversión (fila 790) | ✅ Conciliada (compensada, neto 0) |
| 854 | 2026-10-09 | — | 141 | 141 | Ventas | 10 | Venta 141 ×10 (transf. 200.000 CUP) no registrada en COSTPRO | Inventario (+10 SKU 141), ventas, comisiones | Documentada; NO registrable: fecha 09/10 < MAX operativo 14/10 (ERR_BACKDATED_DOCUMENT, política forward-only) | ⏳ Pendiente (requiere decisión) |
| 873 | 2026-10-10 | OT/Ferro | 137 | 137 | VS | 10 | VS faltante en COSTPRO (intento previo como SKU 127 rechazado por stock negativo; Excel rectificado 127→137) | Inventario/Kardex (−10 SKU 137) | VS-000179-2026 registrada vía RPC create_vale_salida con trazabilidad completa | ✅ CORREGIDO |
| 898 | 2026-10-13 | — | 147 | 147 | Ventas | 1 | Venta registrada 14/10 00:55 (la operación cruzó la medianoche) | Fecha | Emparejada con la venta POS de 94.800 CUP | ✅ Conciliada (desfase 1 día legítimo) |

### 3.2 Desfase sistemático de fecha en recepciones importadas (54 filas)

Las 54 recepciones importadas (`IMPORT-ENERVIDA-*`) tienen `reception_date`/`created_at` fijados a las
**16:00 UTC** del día anterior al que registra el Excel (p. ej. fila 488: Excel 09/09 ↔ COSTPRO 08/09).
Es un **artefacto documentado de la importación del 04/10** (la importación preservó la fecha operativa
en UTC). Impacto: reportes agrupados por día pueden desplazar esas entradas un día; **el stock no se ve
afectado** (cantidad correcta). Filas afectadas: f445, f488, f489, f505, f506, f507, … (54 en total; CSV anexo
`recon_discrepancias.csv`). No se corrigieron: editar 54 documentos históricos no aporta valor frente al
riesgo, y la política forward-only impide re-fechar; **documentado** como convención.

### 3.3 Clasificación completa de las 897 filas

| Veredicto | Filas | Significado |
|---|---:|---|
| CONCILIADA | 801 | Coincidencia exacta (fecha, SKU, cantidad, importes) |
| CONCILIADA_GRUPO | 33 | Filas de ventas multi-producto verificadas por grupo (Σ filas = totales de la transacción) |
| CONCILIADA_VIA_AJUSTE | 1 | Fila «Ajuste» registrada como ajuste de inventario (kardex) |
| CONCILIADA_FECHA_DISTANTE | 2 | Re-registros POS documentados (fechas 02/09→04/10 y 02/10→04/10) |
| FECHA_DIFIERE_1DIA | 55 | 54 recepciones (artefacto UTC) + 1 venta tras medianoche (f898) |
| AUSENTE_COMPENSADA | 3 | Pares neto-cero (venta+DV f536/f537; DV+VS f790/f791) |
| AUSENTE_EN_COSTPRO | 2 | **Discrepancias reales**: f854 (pendiente) y f873 (CORREGIDA) |

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

| SKU | Descripción | Excel | COSTPRO (pre) | Dif. inicial | Corrección aplicada | COSTPRO (final) | Dif. final | Estado |
|---:|---|---:|---:|---:|---|---:|---:|---|
| 1 | Abrazadera metálica de 3/4 | 18 | 18 | 0 | — | 18 | 0 | ✅ Conciliado |
| 2 | Abrazadera metálica de 1 pulgada | 32 | 32 | 0 | — | 32 | 0 | ✅ Conciliado |
| 3 | Araganes | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 4 | Bisagra | 1 | 1 | 0 | — | 1 | 0 | ✅ Conciliado |
| 5 | Brecker 16A Sencillo | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 6 | Brecker 25 A Sencillo | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 7 | Brecker 32A Trifasico | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 8 | Brecker C32 A Trible | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 9 | Brecker D63 A | 1 | 1 | 0 | — | 1 | 0 | ✅ Conciliado |
| 10 | Brida 58 | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 11 | Cabilla 70 Cm | 6 | 6 | 0 | — | 6 | 0 | ✅ Conciliado |
| 12 | Cable Conductor electrico 10 | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 13 | Cable Conductor electrico 8 | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 14 | Distribuidor de corriente 4 salidas | 16 | 16 | 0 | — | 16 | 0 | ✅ Conciliado |
| 15 | Cemento Cola | 49 | 49 | 0 | — | 49 | 0 | ✅ Conciliado |
| 16 | Cemento P425 Tudella | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 17 | Césped Artificial | 6 | 6 | 0 | — | 6 | 0 | ✅ Conciliado |
| 18 | Cheques metálicos | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 19 | Codo de 90 | 16 | 16 | 0 | — | 16 | 0 | ✅ Conciliado |
| 20 | Codos de 45 grado | 15 | 15 | 0 | — | 15 | 0 | ✅ Conciliado |
| 21 | Colchón Milexus | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 22 | Conectores MC4 | 77 | 77 | 0 | — | 77 | 0 | ✅ Conciliado |
| 23 | Cuchilla 2P 100A | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 24 | Cuchilla 2P 63A | 12 | 12 | 0 | — | 12 | 0 | ✅ Conciliado |
| 25 | Cuchilla 3P 100A | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 26 | Disco de esmeril | 3 | 3 | 0 | — | 3 | 0 | ✅ Conciliado |
| 27 | Escobas | 3 | 3 | 0 | — | 3 | 0 | ✅ Conciliado |
| 28 | Espejo | 32 | 32 | 0 | — | 32 | 0 | ✅ Conciliado |
| 29 | Expansiones 8x80 | 123 | 123 | 0 | — | 123 | 0 | ✅ Conciliado |
| 30 | Expansiones anaranjada 6*40mm /Rapita | 9 | 9 | 0 | — | 9 | 0 | ✅ Conciliado |
| 31 | Expansiones con tornillos M6 | 1 | 1 | 0 | — | 1 | 0 | ✅ Conciliado |
| 32 | Expansiones con tornillos M8 | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 33 | Extensiones 5M | 5 | 5 | 0 | — | 5 | 0 | ✅ Conciliado |
| 34 | Fregadero | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 35 | Fuerte eléctrico | 56 | 56 | 0 | — | 56 | 0 | ✅ Conciliado |
| 36 | Impermeable verde 20Kg | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 37 | J de techo | 25 | 25 | 0 | — | 25 | 0 | ✅ Conciliado |
| 38 | Lampara de 20 | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 39 | Tubo de Lampara de 40 | 5 | 5 | 0 | — | 5 | 0 | ✅ Conciliado |
| 40 | Latiguillo de media por 3/8 | 7 | 7 | 0 | — | 7 | 0 | ✅ Conciliado |
| 41 | Latiguillo MC4 | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 42 | Llave de lavamano | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 43 | Losa aporcelanada 60x60 | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 44 | Losa aporcelanada 60x60 con defectos | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 45 | Malla perli | 1 | 1 | 0 | — | 1 | 0 | ✅ Conciliado |
| 46 | Masilla interior blanca | 1 | 1 | 0 | — | 1 | 0 | ✅ Conciliado |
| 47 | Mortero | 6 | 6 | 0 | — | 6 | 0 | ✅ Conciliado |
| 48 | Nudo de media | 37 | 37 | 0 | — | 37 | 0 | ✅ Conciliado |
| 49 | Nudos de 3/4 | 8 | 8 | 0 | — | 8 | 0 | ✅ Conciliado |
| 50 | Nudos de 50 | 8 | 8 | 0 | — | 8 | 0 | ✅ Conciliado |
| 51 | Pintura Casa Blanca 14L | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 52 | Pintura Verde 4L | 42 | 42 | 0 | — | 42 | 0 | ✅ Conciliado |
| 53 | Planchas de zinc | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 54 | Porta Fusibles | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 55 | Purles | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 56 | Reducido de 3/4 | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 57 | Rodillo | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 58 | Rosca Chapa | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 59 | Soporte de papel higiénico | 1 | 1 | 0 | — | 1 | 0 | ✅ Conciliado |
| 60 | Supresores de sobretensiones | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 61 | T de media | 19 | 19 | 0 | — | 19 | 0 | ✅ Conciliado |
| 62 | T de pulgada a 3/4 | 4 | 4 | 0 | — | 4 | 0 | ✅ Conciliado |
| 63 | Tanqueta de Aceite negro 20 L | 1 | 1 | 0 | — | 1 | 0 | ✅ Conciliado |
| 64 | Tanqueta de antioxidante gris 20L | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 65 | Terminales eléctricas | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 66 | Tornillo M10 | 98 | 98 | 0 | — | 98 | 0 | ✅ Conciliado |
| 67 | Transfer monofásico | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 68 | Transfer trifásico | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 69 | Unión universal de 3/4 | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 70 | Unión universal de media | 76 | 76 | 0 | — | 76 | 0 | ✅ Conciliado |
| 71 | Uniones de media/Niple macho | 106 | 106 | 0 | — | 106 | 0 | ✅ Conciliado |
| 72 | Yee de 50 | 6 | 6 | 0 | — | 6 | 0 | ✅ Conciliado |
| 73 | Interruptor doble | 6 | 6 | 0 | — | 6 | 0 | ✅ Conciliado |
| 74 | Controlador de línea | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 75 | Espigas de 15 AMP | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 76 | Toma corriente con tapa | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 77 | Teipe negro | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 78 | Tornillo con tuerca 4.8 | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 79 | Interruptor y toma corriente | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 80 | Brecker C32A Doble | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 81 | Bridas de 4x8 400mm | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 82 | Crimpiadora con pela cable Anaranjada | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 83 | Crimpiadora Roja con 6 dabas rojas | 3 | 3 | 0 | — | 3 | 0 | ✅ Conciliado |
| 84 | Conector XT60 | 31 | 31 | 0 | — | 31 | 0 | ✅ Conciliado |
| 85 | Panel 585 | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 86 | Panel + 600W | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 87 | Cable Solar Negro 4mm | 63 | 63 | 0 | — | 63 | 0 | ✅ Conciliado |
| 88 | Cable Solar Rojo 4mm | 63 | 63 | 0 | — | 63 | 0 | ✅ Conciliado |
| 89 | Cable Solar Negro 6mm | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 90 | Cable Solar Rojo 6mm | 3 | 3 | 0 | — | 3 | 0 | ✅ Conciliado |
| 91 | Liquidación OT 16 | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 92 | Juego de pata | 5 | 5 | 0 | — | 5 | 0 | ✅ Conciliado |
| 93 | Liquidacion de OT 12 | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 94 | Barrena 6mm Madera | 2 | 2 | 0 | — | 2 | 0 | ✅ Conciliado |
| 95 | Barrena 34mm Madera | 36 | 36 | 0 | — | 36 | 0 | ✅ Conciliado |
| 96 | Barrena 5mm Madera | 212 | 212 | 0 | — | 212 | 0 | ✅ Conciliado |
| 97 | Disco de corte | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 98 | Limpia parabrisa | 42 | 42 | 0 | — | 42 | 0 | ✅ Conciliado |
| 99 | Electrodo 4mm | 22 | 22 | 0 | — | 22 | 0 | ✅ Conciliado |
| 100 | Autorroscante chiquito | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 101 | Canal de media | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 102 | Cajas eléctricas | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 103 | Perfiles para brecker | 2 | 2 | 0 | — | 2 | 0 | ✅ Conciliado |
| 104 | Terminales cubanas | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 105 | Cajita breckera sencilla | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 106 | Tornillo con arandela | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 107 | Caja de distribución TRIC | 2 | 2 | 0 | — | 2 | 0 | ✅ Conciliado |
| 108 | Cajita Breckera sencilla gris | 1 | 1 | 0 | — | 1 | 0 | ✅ Conciliado |
| 109 | inicio Z | 1 | 1 | 0 | — | 1 | 0 | ✅ Conciliado |
| 110 | Intermedio | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 111 | Grapas plasticas con clavo de acero | 24 | 24 | 0 | — | 24 | 0 | ✅ Conciliado |
| 112 | Grapas metalicas 3/4 con tornillo rosc | 45 | 45 | 0 | — | 45 | 0 | ✅ Conciliado |
| 113 | Goma Termo Retractil | 122 | 122 | 0 | — | 122 | 0 | ✅ Conciliado |
| 114 | Combustible | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 115 | Canaleta  | 31 | 31 | 0 | — | 31 | 0 | ✅ Conciliado |
| 116 | Herraje | 1 | 1 | 0 | — | 1 | 0 | ✅ Conciliado |
| 117 | Inversor | 2 | 2 | 0 | — | 2 | 0 | ✅ Conciliado |
| 118 | Barilla de Tierra | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 119 | Yee MC4 | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 120 | Estación de carga | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 121 | Supresores | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 122 | Controladores de voltaje | 2 | 2 | 0 | — | 2 | 0 | ✅ Conciliado |
| 123 | Alarma | 3 | 3 | 0 | — | 3 | 0 | ✅ Conciliado |
| 124 | Linterna de casa 4.2 V | 3 | 3 | 0 | — | 3 | 0 | ✅ Conciliado |
| 125 | Linterna de cabeza de 15W | 2 | 2 | 0 | — | 2 | 0 | ✅ Conciliado |
| 126 | Linterna solar | 1 | 1 | 0 | — | 1 | 0 | ✅ Conciliado |
| 127 | Transfer 220 | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 128 | Brecker 63 AMP Corriente alterna | 8 | 8 | 0 | — | 8 | 0 | ✅ Conciliado |
| 129 | Maleta de herramientas | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 130 | Breckera SPC | 1 | 1 | 0 | — | 1 | 0 | ✅ Conciliado |
| 131 | Panel de 550W | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 132 | Brecker 32 A Alternar Doble | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 133 | Ventiladores recargables | 12 | 12 | 0 | — | 12 | 0 | ✅ Conciliado |
| 134 | U de aluminio o intermedio | 23 | 23 | 0 | — | 23 | 0 | ✅ Conciliado |
| 135 | Cable 6 | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 136 | Bateria EKO 5KW | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 137 | Tubo blanco de condulei  de 1/2 de 5M | 340 | 350 | 10 | VS-000179-2026 (−10, fila 873) | 340 | 0 | ✅ CORREGIDO y conciliado |
| 138 | Kid de 6 K Inversor - 5K Bateria +Acce | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 139 | Panel de 640 W Suntech | 9 | 9 | 0 | — | 9 | 0 | ✅ Conciliado |
| 140 | Breckera de 9 posiciones | 1 | 1 | 0 | — | 1 | 0 | ✅ Conciliado |
| 141 | Cemento TBV 50 Kg | 24 | 34 | 10 | — (pendiente, ver §6) | 34 | 10 | ⚠️ Pendiente: +10 (fila 854 ausente — no registrable por política forward-only; ver §6) |
| 142 | Cemento Blanco 2 Kg | 26 | 26 | 0 | — | 26 | 0 | ✅ Conciliado |
| 143 | Filtros de Gasolina | 28 | 28 | 0 | — | 28 | 0 | ✅ Conciliado |
| 144 | Fusible de auntomovil | 300 | 300 | 0 | — | 300 | 0 | ✅ Conciliado |
| 145 | Tunder 24 Vol | 1 | 1 | 0 | — | 1 | 0 | ✅ Conciliado |
| 146 | Tunder Grande | 1 | 1 | 0 | — | 1 | 0 | ✅ Conciliado |
| 147 | MPPT | 4 | 4 | 0 | — | 4 | 0 | ✅ Conciliado |
| 148 | Huncong (Medir corriente) | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 149 | Voltímetro | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 150 | Batería 7.5 Kilos 21.8 V 314 Ah | 8 | 8 | 0 | — | 8 | 0 | ✅ Conciliado |
| 151 | Inversor Sumry | 4 | 4 | 0 | — | 4 | 0 | ✅ Conciliado |
| 152 | Equipo Música DAZONE | 1 | 1 | 0 | — | 1 | 0 | ✅ Conciliado |
| 153 | Taladro con bateria y barrena | 1 | 1 | 0 | — | 1 | 0 | ✅ Conciliado |
| 154 | Breckera de 12 posiciones | 6 | 6 | 0 | — | 6 | 0 | ✅ Conciliado |
| 155 | Compresor de aire | 2 | 2 | 0 | — | 2 | 0 | ✅ Conciliado |
| 156 | Barilla de Aterramientos | 4 | 4 | 0 | — | 4 | 0 | ✅ Conciliado |
| 157 | Royal Cole | 83 | 83 | 0 | — | 83 | 0 | ✅ Conciliado |
| 158 | Detergente | 24 | 24 | 0 | — | 24 | 0 | ✅ Conciliado |
| 159 | Cemento Blanco 5Kg | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 160 | (sin producto en COSTPRO) | 0 | — | — | No aplica | — | — | No aplicable — Reservado: sin operaciones en Operaciones, stock Excel 0, sin comisión definida |
| 161 | (sin producto en COSTPRO) | 0 | — | — | No aplica | — | — | No aplicable — Reservado: sin operaciones en Operaciones, stock Excel 0, sin comisión definida |
| 162 | (sin producto en COSTPRO) | 0 | — | — | No aplica | — | — | No aplicable — Reservado: sin operaciones en Operaciones, stock Excel 0, sin comisión definida |
| 163 | (sin producto en COSTPRO) | 0 | — | — | No aplica | — | — | No aplicable — Reservado: sin operaciones en Operaciones, stock Excel 0, sin comisión definida |
| 164 | (sin producto en COSTPRO) | 0 | — | — | No aplica | — | — | No aplicable — Reservado: sin operaciones en Operaciones, stock Excel 0, sin comisión definida |
| 165 | (sin producto en COSTPRO) | 0 | — | — | No aplica | — | — | No aplicable — Reservado: sin operaciones en Operaciones, stock Excel 0, sin comisión definida |
| 166 | (sin producto en COSTPRO) | 0 | — | — | No aplica | — | — | No aplicable — Reservado: sin operaciones en Operaciones, stock Excel 0, sin comisión definida |
| 167 | (sin producto en COSTPRO) | 0 | — | — | No aplica | — | — | No aplicable — Reservado: sin operaciones en Operaciones, stock Excel 0, sin comisión definida |
| 168 | (sin producto en COSTPRO) | 0 | — | — | No aplica | — | — | No aplicable — Reservado: sin operaciones en Operaciones, stock Excel 0, sin comisión definida |
| 169 | (sin producto en COSTPRO) | 0 | — | — | No aplica | — | — | No aplicable — Reservado: sin operaciones en Operaciones, stock Excel 0, sin comisión definida |
| 170 | (sin producto en COSTPRO) | 0 | — | — | No aplica | — | — | No aplicable — Reservado: sin operaciones en Operaciones, stock Excel 0, sin comisión definida |
| 171 | (sin producto en COSTPRO) | 0 | — | — | No aplica | — | — | No aplicable — Reservado: sin operaciones en Operaciones, stock Excel 0, sin comisión definida |
| 172 | (sin producto en COSTPRO) | 0 | — | — | No aplica | — | — | No aplicable — Reservado: sin operaciones en Operaciones, stock Excel 0, sin comisión definida |
| 173 | (sin producto en COSTPRO) | 0 | — | — | No aplica | — | — | No aplicable — Reservado: sin operaciones en Operaciones, stock Excel 0, sin comisión definida |
| 998 | Servicio de Carga/Capacidad | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |
| 999 | Servicio de crimpiar | 0 | 0 | 0 | — | 0 | 0 | ✅ Conciliado |

**Resumen**: 159 SKU conciliados con diferencia cero · SKU 137 corregido (350→340=Excel) ·
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
| `scripts/enervida-recon/*.json` (workspace del agente, NO versionados por contener datos operacionales) | Volcados íntegros de Excel y COSTPRO + resultados — respaldo verificable y evidencia |
| `docs/audits/AUDITORIA_CONCILIACION_ENERVIDA_VITALLCONS.md` | Este informe |

**Base de datos (producción, escrituras trazadas):**
1. `issue_slips` + `issue_slip_items` + `stock_movements` + `kardex_entries`: VS-000179-2026 (f873).
2. `commission_rules` (1 regla) + `commission_rule_products` (110 filas) + `commission_rule_versions` (v1).

*Rama: `feat/enervida-conciliacion-comisiones` · PR: https://github.com/Nardian90/Costpro/pull/1403 (sin merge, pendiente de autorización).*


---

## 11. Cierre definitivo de conciliación — corte 14/10/2026

**Fecha y hora de ejecución:** 2026-10-14, 12:55–13:15 (America/Havana) · **Rama:** `cierre/conciliacion-enervida-corte-1410` (PR #1404)
**Estado de partida verificado:** PR #1403 **mergeado** (merge commit `20c584e`), tras el PR #1402 (`regularize_sale_payment`, merge `e1620b0` — RPC de ajuste de pagos, no necesario para esta misión). Corrección de la fila 873 (VS-000179-2026) **verificada intacta** en producción.
**Excel de referencia:** `Costpro.xlsx` re-adjuntado por el usuario (`/home/z/my-project/upload/Costpro.xlsx`), 3 hojas (Operaciones 897 filas · ExistenciaFinal 175 SKUs · ConfComisiones 175 SKUs), idéntico en estructura al de la auditoría previa. **No fue modificado.**

### 11.1 Las dos diferencias reales: causas y soluciones ejecutadas

| # | Fila Excel | SKU | Diferencia (COSTPRO − Excel) | Causa raíz (evidencia) | Mecanismo oficial aplicado | Resultado |
|---|---:|---:|---:|---|---|---|
| 1 | **854** | **141** Cemento TBV 50 Kg | **+10** (34 vs 24) | Venta 141 ×10 @ 20.000 CUP = **200.000 CUP transferencia** del 09/10/2026 nunca registrada (verificada su ausencia: 0 TX 141×10/200k; la política forward-only impide registrar con fecha 09/10 → `ERR_BACKDATED_DOCUMENT`) | **Venta real registrada vía RPC `create_sale_v2`** (mismo RPC que invoca el POS), **no** un ajuste de inventario: preserva la naturaleza económica de la operación (venta con importe, pago y comisión) | TX `e794db77-2829-424c-9fd8-c653a8922563`; stock 34 → **24 = Excel** |
| 2 | **873** | **137** Tubo blanco de condulei 1/2 de 5M | −10 (350 vs 340) | VS 137 ×10 (OT/Ferro, 10/10) no registrada al momento (intento previo como SKU 127 rechazado por stock negativo; Excel rectificado 127→137) | **Corregida en la auditoría previa** vía RPC `create_vale_salida` → VS-000179-2026; en este cierre se **verificó su integridad** (documento completed, items 137×10, kardex y saldo) | VS-000179-2026 intacta; stock **340 = Excel** |

La verificación integral contra los datos actuales (no los números heredados) confirma que **no existen más diferencias reales**: tras resolver la fila 854, la comparación ExistenciaFinal↔COSTPRO arroja **0 diferencias** en los 161 SKU con producto en COSTPRO.

### 11.2 Detalle de la fila 854 y el SKU 141

| Campo | Valor Excel (fila 854) | Registro COSTPRO ejecutado |
|---|---|---|
| Clasificación | Ventas | `transactions` (venta POS v2) |
| Código / Producto | 141 · Cemento TBV 50 Kg | product_id `d1afd532-0bad-4af7-8605-b3594c25e864` |
| Cantidad | 10 | 10 |
| Precio unitario | 20.000 CUP (total 200.000 / 10) | `price_at_sale` 20.000 = precio catálogo (sin desvío → sin gate de supervisor) |
| Pago | Transferencia 200.000 CUP | `payment_transactions` transfer 200.000 CUP (rate 1) |
| Comisión | 2.000 (10 × 200) | Regla vigente `commission_rule_products` = 200 CUP/ud → motor calcula 10 × 200 = **2.000** |
| Fecha | 2026-10-09 | **Fecha operativa 14/10/2026 13:05:03 Havana** (17:05:03 UTC) — la económica (09/10) queda documentada en `p_discount_reason` |
| Vendedor / atribución | — | `admin@demo.com` (id `a1111111-…`), atribución estándar de las importaciones ENERVIDA |
| Idempotencia | — | `recon-enervida-fila854-ven141x10` — reintento verificado → `status:idempotent`, misma TX, 0 duplicados |

**Decisione de mecanismo (Opción B del procedimiento):** la fila 854 ES una venta (clasificación «Ventas» con importe y pago). Registrar la venta real conserva su naturaleza económica (importe, pago por transferencia, comisión y kardex) frente a un ajuste de inventario (Opción C), que habría alterado el stock sin reflejar la operación comercial. La política forward-only se respetó: no se falsificó ninguna fecha ni se modificó el historial; la venta quedó fechada en la fecha operativa actual con mención explícita de la fecha económica 09/10.

### 11.3 Identificadores persistentes y respaldos

| Objeto | Identificador | Evidencia |
|---|---|---|
| Venta regularizada (f854) | TX **`e794db77-2829-424c-9fd8-c653a8922563`** | `f854_rpc_result.json` · idempotency_key `recon-enervida-fila854-ven141x10` |
| Movimiento kardex de la venta | `movement_type=out, qty=10, balance_after=24` | kardex_entries (reference_description «Venta POS v2») |
| VS regularizada (f873, misión previa) | **VS-000179-2026** (`0ea29335-8d2a-40b1-8524-f17604cf26ba`) | verificada completed, items 137×10 |
| Respaldo pre-corrección (f854) | `scripts/cierre-1410/backup_pre_f854.json` | product stock 34 · inventory 34 · 26 filas kardex · 637 TX · 0 ventas 141×10/200k previas |
| Volcados de estado | `scripts/cierre-1410/*.json` | productos, inventario, ops, VS, recepciones, DV, movimientos, kardex (pre y post) |

### 11.4 Saldos anterior y posterior de los SKU afectados

| SKU | Producto | Excel al corte | COSTPRO antes | Corrección | COSTPRO después | Diferencia final |
|---:|---|---:|---:|---|---:|---:|
| 141 | Cemento TBV 50 Kg | 24 | 34 | venta f854: −10 | **24** | **0** |
| 137 | Tubo blanco de condulei 1/2 de 5M | 340 | 340 | — (VS-000179 ya aplicada, verificada) | **340** | **0** |
| 127 | Transfer 220 | 0 | 0 | — (intacto) | **0** | **0** |

### 11.5 Corte oficial 14/10/2026: saldo de cierre vs existencia operativa

Movimientos registrados en la tienda el día del corte (America/Havana):

| Hora | Documento | Contenido | Origen |
|---|---|---|---|
| 00:55 | venta | 147 ×1 (94.800 CUP) | fila 898 (operación que cruzó la medianoche — desfase 1 día ya conciliado §3.1) |
| 11:54 | VS-000179-2026 | 137 ×10 (f873) | regularización misión previa |
| 13:05 | venta TX `e794db77` | 141 ×10 (200.000 CUP) | regularización f854 (este cierre) |

**No existe ningún movimiento posterior a la última regularización** (13:05). Por tanto, para cada SKU:
`Saldo de cierre al 14/10/2026 = Existencia operativa actual = ExistenciaFinal del Excel`. La política forward-only impidió además retrodatar las dos regularizaciones; ambas quedan fechadas dentro del propio día del corte, con la fecha económica original documentada en cada documento. No se alteró ningún saldo inicial ni el Kardex histórico; no se crearon ni cerraron jornadas.

### 11.6 Resultado de la conciliación de todos los SKU (verificación final)

- **175 SKUs** de `ExistenciaFinal` examinados (los 175, no solo los modificados).
- **161 conciliados** con diferencia exactamente 0 (verificado en las 3 fuentes: `products.stock_current`, `inventory.quantity` y saldo final del Kardex — sin divergencias entre fuentes).
- **14 SKUs (160–173)**: reservados por el usuario, sin producto dado de alta en COSTPRO y con existencia 0 en el Excel — sin operaciones ni comisión; se mantienen documentados (§6.4).
- **0 SKUs de COSTPRO sin fila Excel · 0 diferencias sin resolver · sin tolerancias ni redondeos** (comparación decimal exacta).

### 11.7 Tabla final de conciliación (todos los SKUs de ExistenciaFinal)

| SKU | Excel al corte | COSTPRO al corte | Diferencia | Regularización | Resultado |
|---|---:|---:|---:|---|---|
| 1 | Abrazadera metálica de 3/4 | 18 | 18 | 0 | — | ✅ Conciliado |
| 2 | Abrazadera metálica de 1 pulgada | 32 | 32 | 0 | — | ✅ Conciliado |
| 3 | Araganes | 0 | 0 | 0 | — | ✅ Conciliado |
| 4 | Bisagra | 1 | 1 | 0 | — | ✅ Conciliado |
| 5 | Brecker 16A Sencillo | 0 | 0 | 0 | — | ✅ Conciliado |
| 6 | Brecker 25 A Sencillo | 0 | 0 | 0 | — | ✅ Conciliado |
| 7 | Brecker 32A Trifasico | 0 | 0 | 0 | — | ✅ Conciliado |
| 8 | Brecker C32 A Trible | 0 | 0 | 0 | — | ✅ Conciliado |
| 9 | Brecker D63 A | 1 | 1 | 0 | — | ✅ Conciliado |
| 10 | Brida 58 | 0 | 0 | 0 | — | ✅ Conciliado |
| 11 | Cabilla 70 Cm | 6 | 6 | 0 | — | ✅ Conciliado |
| 12 | Cable Conductor electrico 10 | 0 | 0 | 0 | — | ✅ Conciliado |
| 13 | Cable Conductor electrico 8 | 0 | 0 | 0 | — | ✅ Conciliado |
| 14 | Distribuidor de corriente 4 salidas | 16 | 16 | 0 | — | ✅ Conciliado |
| 15 | Cemento Cola | 49 | 49 | 0 | — | ✅ Conciliado |
| 16 | Cemento P425 Tudella | 0 | 0 | 0 | — | ✅ Conciliado |
| 17 | Césped Artificial | 6 | 6 | 0 | — | ✅ Conciliado |
| 18 | Cheques metálicos | 0 | 0 | 0 | — | ✅ Conciliado |
| 19 | Codo de 90 | 16 | 16 | 0 | — | ✅ Conciliado |
| 20 | Codos de 45 grado | 15 | 15 | 0 | — | ✅ Conciliado |
| 21 | Colchón Milexus | 0 | 0 | 0 | — | ✅ Conciliado |
| 22 | Conectores MC4 | 77 | 77 | 0 | — | ✅ Conciliado |
| 23 | Cuchilla 2P 100A | 0 | 0 | 0 | — | ✅ Conciliado |
| 24 | Cuchilla 2P 63A | 12 | 12 | 0 | — | ✅ Conciliado |
| 25 | Cuchilla 3P 100A | 0 | 0 | 0 | — | ✅ Conciliado |
| 26 | Disco de esmeril | 3 | 3 | 0 | — | ✅ Conciliado |
| 27 | Escobas | 3 | 3 | 0 | — | ✅ Conciliado |
| 28 | Espejo | 32 | 32 | 0 | — | ✅ Conciliado |
| 29 | Expansiones 8x80 | 123 | 123 | 0 | — | ✅ Conciliado |
| 30 | Expansiones anaranjada 6*40mm /Rapita | 9 | 9 | 0 | — | ✅ Conciliado |
| 31 | Expansiones con tornillos M6 | 1 | 1 | 0 | — | ✅ Conciliado |
| 32 | Expansiones con tornillos M8 | 0 | 0 | 0 | — | ✅ Conciliado |
| 33 | Extensiones 5M | 5 | 5 | 0 | — | ✅ Conciliado |
| 34 | Fregadero | 0 | 0 | 0 | — | ✅ Conciliado |
| 35 | Fuerte eléctrico | 56 | 56 | 0 | — | ✅ Conciliado |
| 36 | Impermeable verde 20Kg | 0 | 0 | 0 | — | ✅ Conciliado |
| 37 | J de techo | 25 | 25 | 0 | — | ✅ Conciliado |
| 38 | Lampara de 20 | 0 | 0 | 0 | — | ✅ Conciliado |
| 39 | Tubo de Lampara de 40 | 5 | 5 | 0 | — | ✅ Conciliado |
| 40 | Latiguillo de media por 3/8 | 7 | 7 | 0 | — | ✅ Conciliado |
| 41 | Latiguillo MC4 | 0 | 0 | 0 | — | ✅ Conciliado |
| 42 | Llave de lavamano | 0 | 0 | 0 | — | ✅ Conciliado |
| 43 | Losa aporcelanada 60x60 | 0 | 0 | 0 | — | ✅ Conciliado |
| 44 | Losa aporcelanada 60x60 con defectos | 0 | 0 | 0 | — | ✅ Conciliado |
| 45 | Malla perli | 1 | 1 | 0 | — | ✅ Conciliado |
| 46 | Masilla interior blanca | 1 | 1 | 0 | — | ✅ Conciliado |
| 47 | Mortero | 6 | 6 | 0 | — | ✅ Conciliado |
| 48 | Nudo de media | 37 | 37 | 0 | — | ✅ Conciliado |
| 49 | Nudos de 3/4 | 8 | 8 | 0 | — | ✅ Conciliado |
| 50 | Nudos de 50 | 8 | 8 | 0 | — | ✅ Conciliado |
| 51 | Pintura Casa Blanca 14L | 0 | 0 | 0 | — | ✅ Conciliado |
| 52 | Pintura Verde 4L | 42 | 42 | 0 | — | ✅ Conciliado |
| 53 | Planchas de zinc | 0 | 0 | 0 | — | ✅ Conciliado |
| 54 | Porta Fusibles | 0 | 0 | 0 | — | ✅ Conciliado |
| 55 | Purles | 0 | 0 | 0 | — | ✅ Conciliado |
| 56 | Reducido de 3/4 | 0 | 0 | 0 | — | ✅ Conciliado |
| 57 | Rodillo | 0 | 0 | 0 | — | ✅ Conciliado |
| 58 | Rosca Chapa | 0 | 0 | 0 | — | ✅ Conciliado |
| 59 | Soporte de papel higiénico | 1 | 1 | 0 | — | ✅ Conciliado |
| 60 | Supresores de sobretensiones | 0 | 0 | 0 | — | ✅ Conciliado |
| 61 | T de media | 19 | 19 | 0 | — | ✅ Conciliado |
| 62 | T de pulgada a 3/4 | 4 | 4 | 0 | — | ✅ Conciliado |
| 63 | Tanqueta de Aceite negro 20 L | 1 | 1 | 0 | — | ✅ Conciliado |
| 64 | Tanqueta de antioxidante gris 20L | 0 | 0 | 0 | — | ✅ Conciliado |
| 65 | Terminales eléctricas | 0 | 0 | 0 | — | ✅ Conciliado |
| 66 | Tornillo M10 | 98 | 98 | 0 | — | ✅ Conciliado |
| 67 | Transfer monofásico | 0 | 0 | 0 | — | ✅ Conciliado |
| 68 | Transfer trifásico | 0 | 0 | 0 | — | ✅ Conciliado |
| 69 | Unión universal de 3/4 | 0 | 0 | 0 | — | ✅ Conciliado |
| 70 | Unión universal de media | 76 | 76 | 0 | — | ✅ Conciliado |
| 71 | Uniones de media/Niple macho | 106 | 106 | 0 | — | ✅ Conciliado |
| 72 | Yee de 50 | 6 | 6 | 0 | — | ✅ Conciliado |
| 73 | Interruptor doble | 6 | 6 | 0 | — | ✅ Conciliado |
| 74 | Controlador de línea | 0 | 0 | 0 | — | ✅ Conciliado |
| 75 | Espigas de 15 AMP | 0 | 0 | 0 | — | ✅ Conciliado |
| 76 | Toma corriente con tapa | 0 | 0 | 0 | — | ✅ Conciliado |
| 77 | Teipe negro | 0 | 0 | 0 | — | ✅ Conciliado |
| 78 | Tornillo con tuerca 4.8 | 0 | 0 | 0 | — | ✅ Conciliado |
| 79 | Interruptor y toma corriente | 0 | 0 | 0 | — | ✅ Conciliado |
| 80 | Brecker C32A Doble | 0 | 0 | 0 | — | ✅ Conciliado |
| 81 | Bridas de 4x8 400mm | 0 | 0 | 0 | — | ✅ Conciliado |
| 82 | Crimpiadora con pela cable Anaranjada | 0 | 0 | 0 | — | ✅ Conciliado |
| 83 | Crimpiadora Roja con 6 dabas rojas | 3 | 3 | 0 | — | ✅ Conciliado |
| 84 | Conector XT60 | 31 | 31 | 0 | — | ✅ Conciliado |
| 85 | Panel 585 | 0 | 0 | 0 | — | ✅ Conciliado |
| 86 | Panel + 600W | 0 | 0 | 0 | — | ✅ Conciliado |
| 87 | Cable Solar Negro 4mm | 63 | 63 | 0 | — | ✅ Conciliado |
| 88 | Cable Solar Rojo 4mm | 63 | 63 | 0 | — | ✅ Conciliado |
| 89 | Cable Solar Negro 6mm | 0 | 0 | 0 | — | ✅ Conciliado |
| 90 | Cable Solar Rojo 6mm | 3 | 3 | 0 | — | ✅ Conciliado |
| 91 | Liquidación OT 16 | 0 | 0 | 0 | — | ✅ Conciliado |
| 92 | Juego de pata | 5 | 5 | 0 | — | ✅ Conciliado |
| 93 | Liquidacion de OT 12 | 0 | 0 | 0 | — | ✅ Conciliado |
| 94 | Barrena 6mm Madera | 2 | 2 | 0 | — | ✅ Conciliado |
| 95 | Barrena 34mm Madera | 36 | 36 | 0 | — | ✅ Conciliado |
| 96 | Barrena 5mm Madera | 212 | 212 | 0 | — | ✅ Conciliado |
| 97 | Disco de corte | 0 | 0 | 0 | — | ✅ Conciliado |
| 98 | Limpia parabrisa | 42 | 42 | 0 | — | ✅ Conciliado |
| 99 | Electrodo 4mm | 22 | 22 | 0 | — | ✅ Conciliado |
| 100 | Autorroscante chiquito | 0 | 0 | 0 | — | ✅ Conciliado |
| 101 | Canal de media | 0 | 0 | 0 | — | ✅ Conciliado |
| 102 | Cajas eléctricas | 0 | 0 | 0 | — | ✅ Conciliado |
| 103 | Perfiles para brecker | 2 | 2 | 0 | — | ✅ Conciliado |
| 104 | Terminales cubanas | 0 | 0 | 0 | — | ✅ Conciliado |
| 105 | Cajita breckera sencilla | 0 | 0 | 0 | — | ✅ Conciliado |
| 106 | Tornillo con arandela | 0 | 0 | 0 | — | ✅ Conciliado |
| 107 | Caja de distribución TRIC | 2 | 2 | 0 | — | ✅ Conciliado |
| 108 | Cajita Breckera sencilla gris | 1 | 1 | 0 | — | ✅ Conciliado |
| 109 | inicio Z | 1 | 1 | 0 | — | ✅ Conciliado |
| 110 | Intermedio | 0 | 0 | 0 | — | ✅ Conciliado |
| 111 | Grapas plasticas con clavo de acero | 24 | 24 | 0 | — | ✅ Conciliado |
| 112 | Grapas metalicas 3/4 con tornillo roscan | 45 | 45 | 0 | — | ✅ Conciliado |
| 113 | Goma Termo Retractil | 122 | 122 | 0 | — | ✅ Conciliado |
| 114 | Combustible | 0 | 0 | 0 | — | ✅ Conciliado |
| 115 | Canaleta  | 31 | 31 | 0 | — | ✅ Conciliado |
| 116 | Herraje | 1 | 1 | 0 | — | ✅ Conciliado |
| 117 | Inversor | 2 | 2 | 0 | — | ✅ Conciliado |
| 118 | Barilla de Tierra | 0 | 0 | 0 | — | ✅ Conciliado |
| 119 | Yee MC4 | 0 | 0 | 0 | — | ✅ Conciliado |
| 999 | Servicio de crimpiar | 0 | 0 | 0 | — | ✅ Conciliado |
| 120 | Estación de carga | 0 | 0 | 0 | — | ✅ Conciliado |
| 121 | Supresores | 0 | 0 | 0 | — | ✅ Conciliado |
| 122 | Controladores de voltaje | 2 | 2 | 0 | — | ✅ Conciliado |
| 123 | Alarma | 3 | 3 | 0 | — | ✅ Conciliado |
| 124 | Linterna de casa 4.2 V | 3 | 3 | 0 | — | ✅ Conciliado |
| 125 | Linterna de cabeza de 15W | 2 | 2 | 0 | — | ✅ Conciliado |
| 126 | Linterna solar | 1 | 1 | 0 | — | ✅ Conciliado |
| 127 | Transfer 220 | 0 | 0 | 0 | — | ✅ Conciliado |
| 128 | Brecker 63 AMP Corriente alterna | 8 | 8 | 0 | — | ✅ Conciliado |
| 129 | Maleta de herramientas | 0 | 0 | 0 | — | ✅ Conciliado |
| 130 | Breckera SPC | 1 | 1 | 0 | — | ✅ Conciliado |
| 131 | Panel de 550W | 0 | 0 | 0 | — | ✅ Conciliado |
| 132 | Brecker 32 A Alternar Doble | 0 | 0 | 0 | — | ✅ Conciliado |
| 133 | Ventiladores recargables | 12 | 12 | 0 | — | ✅ Conciliado |
| 134 | U de aluminio o intermedio | 23 | 23 | 0 | — | ✅ Conciliado |
| 135 | Cable 6 | 0 | 0 | 0 | — | ✅ Conciliado |
| 998 | Servicio de Carga/Capacidad | 0 | 0 | 0 | — | ✅ Conciliado |
| 136 | Bateria EKO 5KW | 0 | 0 | 0 | — | ✅ Conciliado |
| 137 | Tubo blanco de condulei  de 1/2 de 5M | 340 | 340 | 0 | VS-000179-2026 (f873, misión previa — verificada) | ✅ Conciliado |
| 138 | Kid de 6 K Inversor - 5K Bateria +Acceso | 0 | 0 | 0 | — | ✅ Conciliado |
| 139 | Panel de 640 W Suntech | 9 | 9 | 0 | — | ✅ Conciliado |
| 140 | Breckera de 9 posiciones | 1 | 1 | 0 | — | ✅ Conciliado |
| 141 | Cemento TBV 50 Kg | 24 | 24 | 0 | venta TX e794db77 (f854, −10) | ✅ Conciliado |
| 142 | Cemento Blanco 2 Kg | 26 | 26 | 0 | — | ✅ Conciliado |
| 143 | Filtros de Gasolina | 28 | 28 | 0 | — | ✅ Conciliado |
| 144 | Fusible de auntomovil | 300 | 300 | 0 | — | ✅ Conciliado |
| 145 | Tunder 24 Vol | 1 | 1 | 0 | — | ✅ Conciliado |
| 146 | Tunder Grande | 1 | 1 | 0 | — | ✅ Conciliado |
| 147 | MPPT | 4 | 4 | 0 | — | ✅ Conciliado |
| 148 | Huncong (Medir corriente) | 0 | 0 | 0 | — | ✅ Conciliado |
| 149 | Voltímetro | 0 | 0 | 0 | — | ✅ Conciliado |
| 150 | Batería 7.5 Kilos 21.8 V 314 Ah | 8 | 8 | 0 | — | ✅ Conciliado |
| 151 | Inversor Sumry | 4 | 4 | 0 | — | ✅ Conciliado |
| 152 | Equipo Música DAZONE | 1 | 1 | 0 | — | ✅ Conciliado |
| 153 | Taladro con bateria y barrena | 1 | 1 | 0 | — | ✅ Conciliado |
| 154 | Breckera de 12 posiciones | 6 | 6 | 0 | — | ✅ Conciliado |
| 155 | Compresor de aire | 2 | 2 | 0 | — | ✅ Conciliado |
| 156 | Barilla de Aterramientos | 4 | 4 | 0 | — | ✅ Conciliado |
| 157 | Royal Cole | 83 | 83 | 0 | — | ✅ Conciliado |
| 158 | Detergente | 24 | 24 | 0 | — | ✅ Conciliado |
| 159 | Cemento Blanco 5Kg | 0 | 0 | 0 | — | ✅ Conciliado |
| 160 | — | 0 | — | — | — | ⬜ Reservado (sin producto en COSTPRO, stock 0) |
| 161 | — | 0 | — | — | — | ⬜ Reservado (sin producto en COSTPRO, stock 0) |
| 162 | — | 0 | — | — | — | ⬜ Reservado (sin producto en COSTPRO, stock 0) |
| 163 | — | 0 | — | — | — | ⬜ Reservado (sin producto en COSTPRO, stock 0) |
| 164 | — | 0 | — | — | — | ⬜ Reservado (sin producto en COSTPRO, stock 0) |
| 165 | — | 0 | — | — | — | ⬜ Reservado (sin producto en COSTPRO, stock 0) |
| 166 | — | 0 | — | — | — | ⬜ Reservado (sin producto en COSTPRO, stock 0) |
| 167 | — | 0 | — | — | — | ⬜ Reservado (sin producto en COSTPRO, stock 0) |
| 168 | — | 0 | — | — | — | ⬜ Reservado (sin producto en COSTPRO, stock 0) |
| 169 | — | 0 | — | — | — | ⬜ Reservado (sin producto en COSTPRO, stock 0) |
| 170 | — | 0 | — | — | — | ⬜ Reservado (sin producto en COSTPRO, stock 0) |
| 171 | — | 0 | — | — | — | ⬜ Reservado (sin producto en COSTPRO, stock 0) |
| 172 | — | 0 | — | — | — | ⬜ Reservado (sin producto en COSTPRO, stock 0) |
| 173 | — | 0 | — | — | — | ⬜ Reservado (sin producto en COSTPRO, stock 0) |

### 11.8 Pruebas ejecutadas y resultados

| Prueba | Resultado |
|---|---|
| Registro de la venta f854 vía `create_sale_v2` (RPC oficial, service-role) | ✅ TX `e794db77…`, total 200.000, transfer 200.000, item 141×10 @20.000 |
| Stock e inventario tras la corrección | ✅ `products.stock_current` 34→24 · `inventory.quantity` 24 (= Excel 24) |
| Kardex | ✅ movimiento `out` 10 → `balance_after` 24 |
| Idempotencia (reintento de la misma clave) | ✅ `status:idempotent`, misma TX, 1 sola TX con la clave, 0 TX 141×10/200k adicionales |
| Verificación f873 (VS-000179-2026) | ✅ completed, 137×10, saldo 340 = Excel |
| Conciliación integral 3 fuentes × 175 SKUs | ✅ 161 conciliados / 0 diferencias / sin divergencia entre fuentes |
| Aislamiento multi-tienda | ✅ escrituras últimos 3h solo en ENERVIDA (`store_id 5e6fe821…`); TIENDA CENTRAL, Puerto Padre y Sucursal Habana: 0 cambios de producto |
| Suite de regresión (vitest) | ✅ 56/56 (commission-product 6, kardexPeriod, movementPresentation, pos-checkout-price-integrity) |
| Aplicación operativa | ✅ PM2 online, HTTP 200 (puerto 3000) |

### 11.9 Limitaciones y observaciones que permanecen

1. **Fecha operativa ≠ fecha económica en las dos regularizaciones**: ambas quedaron fechadas 14/10 (VS 11:54, venta 13:05 Havana) porque la política forward-only (`validate_operation_date` → `ERR_BACKDATED_DOCUMENT`) prohíbe documentos retroactivos. Los reportes agrupados por día mostrarán ambas operaciones el 14/10; la fecha económica original (10/10 y 09/10) queda documentada en las notas de cada documento y en este informe.
2. **SKUs 160–173 (reservas)**: siguen sin alta en COSTPRO. Si llegan a usarse, deben darse de alta (el flujo de Recepciones lo permite desde el PR #1400).
3. **Desfase de 1 día en 54 recepciones importadas** (§3.2): se mantiene como convención documentada; el stock no se ve afectado.
4. **Pares neto-cero f536/f537** (venta+DV ausentes, neto 0): permanecen documentados sin registro (su registro con fecha actual añadiría rastro documental pero ninguna corrección de saldo; se evitó crear documentos artificialmente).
5. **Comisiones históricas de julio** (20 filas con tarifa antigua): ConfComisiones permanece como configuración vigente; no se reconstruyeron tarifas históricas (fuera del alcance, §6.5).
6. La venta regularizada f854 registra la **comisión según la regla vigente** (200/ud → 2.000, idéntica a la del Excel); el importe de venta (200.000 CUP) entra en las cifras del 14/10.

### 11.10 Resumen ejecutivo del cierre

| Métrica | Valor |
|---|---:|
| Total de SKU examinados (ExistenciaFinal) | **175** |
| SKU conciliados (diferencia exactamente 0) | **161** |
| SKU pendientes | **0** (14 reservas 160–173 sin alta en COSTPRO, stock 0 — documentado) |
| Diferencias reales antes de la regularización | **1** (f854/SKU 141, +10) — de las 2 originales: f873 ya corregida y verificada |
| Diferencias reales después de la regularización | **0** |
| Ajustes u operaciones registradas | **1 venta** (TX `e794db77-2829-424c-9fd8-c653a8922563`) vía RPC oficial `create_sale_v2`; 0 ajustes manuales de inventario; 0 documentos falsificados |
| Pruebas | 56/56 regresión · idempotencia RPC verificada · 3 fuentes coherentes · tiendas aisladas |
| **Estado final de la misión** | **COMPLETADA** — inventario de ENERVIDA-VITALLCONS idéntico al Excel en el corte 14/10/2026 |

**Datos escritos en producción (trazados):** única escritura nueva = venta TX `e794db77-2829-424c-9fd8-c653a8922563` (+ sus items, pago y kardex) + filas de `idempotency_registry`. Ningún documento histórico fue editado, re-fechado o eliminado; ninguna otra tienda fue tocada.
