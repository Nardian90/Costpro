# INFORME EJECUTIVO — CP-FIN-003

**Misión:** CP-FIN-ENERVIDA-CONTROLLED-ACCOUNTING-REBUILD-AND-CONFIGURATION-001 + ANEXO VINCULANTE
(universalización del registro de medios de pago, monedas y liquidación de obligaciones)
**Tienda:** ENERVIDA-VITALLCONS · **Fecha:** 2026-11-20 · **PRs:** #1665 (estructura) + #1666 (recertificación)
**Migración:** `20261120120000_cp_fin003_generations_canonical_mapping.sql` (aplicada a producción y registrada)

---

## 1. Situación anterior

- La clasificación de cobros/pagos mezclaba transferencias exteriores (zelle) con el dinero en bancos
  (24,6 M CUP de historial zelle dentro de ACT_BANCOS), sin caja EUR/MLC en el catálogo.
- Los pagos de Servicios Recibidos y Recepciones solo registraban el medio (sin moneda ni tasa):
  moneda fija CUP y tasa 1 en la UI; el motor imputaba todo efectivo a caja CUP sin importar la moneda real.
- No existía mecanismo de generaciones contables: cada corrección acumulaba asientos
  compensatorios sobre un libro cada vez más difícil de interpretar.
- La configuración contable estaba accesible desde Estados Financieros (CP-FIN-015) pero sin
  acceso contextual por tipo de movimiento ni matriz de cuentas por (medio × moneda).
- El SQL Security Gate de `main` estaba en FALLO desde el 19-11 (laguna heredada de CP-FIN-002:
  `fin_reclassify_sale_payment_currency` aplicada a producción sin entrada de allowlist).

## 2. Causas raíz

1. Las reglas VENTA v2 y SERVICIO/RECEPCION v1 clasificaban por **método** (y la moneda solo
   existía como etiqueta), sin un mapeo canónico (medio × moneda → cuenta) común al motor,
   la UI y los escritores.
2. El motor no distinguía **generaciones** del libro: no había forma de reconstruir el pasado
   sin acumular compensaciones.
3. El formulario de pagos de Servicios/Recepciones no reutilizaba el componente del carrito
   (una sola fila, moneda fija CUP, tasa 1).

## 3. Alcance ejecutado

- **Motor:** generaciones contables (`fin_posting_generations` + `fin_entries.generation_id` +
  ciclo `create/build/validate/activate/rollback`), mapeo canónico `fin_account_mapping`
  (10 combinaciones), categorías nuevas (ACT_TRANSF_EXTERIOR, ACT_EFECTIVO_EUR/MLC), reglas
  VENTA v3 / SERVICIO_RECIBIDO v2 / RECEPCION v2 / DEVOLUCION_VENTA v2, métricas v4
  (moneda_pago + importe original del pago), informes que leen SOLO la generación activa,
  `register_supplier_payment` con tasa obligatoria para divisa, rectificador con mapeo canónico
  y fallback legado.
- **UI:** `PaymentRowsEditor` compartido (mismo diseño/validaciones/semántica del carrito),
  sección «Información del pago» en la creación de servicios (pendiente por defecto, liquidación
  al confirmar con default Efectivo+CUP), editor multi-moneda en el detalle de servicios y
  recepciones, acceso «Config. contable» desde el drilldown de Estados Financieros y matriz de
  cuentas financieras visible en la Configuración de Documentos.
- **Reconstrucción de ENERVIDA (producción):** GEN-1 construida (1.084 asientos), validada
  (identidad 0.00 / 0 desequilibrados / 0 duplicados) y activada atómicamente. GEN-0 conservada
  íntegra como superseded.

## 4. Resultado

| Concepto | GEN-0 (antes) | GEN-1 (después) |
|---|---:|---:|
| Activos | 36,437,300.22 | 33,506,636.10 |
| Pasivos | 2,961,795.90 | 2,961,795.90 |
| Patrimonio total | 33,475,504.32 | 30,544,840.20 |
| Diferencia de la ecuación | 0.00 | **0.00** |
| Dinero en bancos | 25,850,770.01 | 1,264,610.01 |
| Transferencias exteriores | (dentro de bancos) | **24,606,900.00** (cuenta propia) |
| Efectivo CUP / USD | 1,265,280 / −4,500 | 1,233,950 / 27,500 |
| Cuentas por pagar | 2,961,795.90 | 2,961,795.90 (exacto) |

- La variación de patrimonio (−2,930,664.12) está **íntegramente explicada** por el puente de
  conciliación (§F): separación de exteriores (equity-neutral), reallocation del mundo
  FAC-VITALLCONS-001 (neto 0.00) y las 8+4 rectificaciones históricas cuya corrección ya vive
  en los datos (efecto caja −31K/+32K, ingresos −55.7K, descuentos +34.3K, COGS +2.75M etc.).
- **Servicios Recibidos:** 20/20 activos verificados Efectivo+CUP (declaración del propietario
  confirmada al 100%); el módulo ahora soporta Transf./Transf. Exterior/moneda/tasa/pago mixto.
- **Recepciones:** 89 activas con **cero pagos registrados** → la deuda (2,961,795.90) sigue
  pendiente (no se inventan desembolsos); el módulo ya permite liquidarla por cualquier
  (medio × moneda) con pagos parciales/mixtos.
- Configuración contable accesible y comprensible desde Estados Financieros (botón + acción
  contextual por movimiento + matriz de cuentas).

## 5. Limitaciones (identificadas y cuantificadas — nunca ocultas)

1. **Inventario contable −2,355,603.89 (negativo)** vs. valor vivo del maestro 594,771.44
   (82 productos con stock). Causa: el historial congelado (cost_at_sale y WAC de la era del
   importe FAC-VITALLCONS-001, cuando precios de venta se importaron como costos) conserva
   parte de la contaminación; los datos de la recepción YA fueron corregidos
   (192,039,436.00 → 5,861.50) y la cadena completa de correcciones históricas (reversión
   151,299,851 + C1 40,733,723.50 + RECT-013 33,842,533) pertenece a ese mundo ya corregido.
   La re-derivación pura la reproduce sin dobles correcciones; el residual queda cuantificado
   aquí (misión §15: «identifícalo claramente y cuantifica su impacto»). No se crea ajuste
   compensatorio alguno.
2. **Asientos no reconstruibles:** 2 (documento fd9d6c88 como AJUSTE_INVENTARIO — el documento
   ya no existe en `inventory_adjustments`; su efecto C1 está incorporado en los datos
   corregidos). Registrados en `stats.no_reconstruibles` de GEN-1.
3. **Rectificaciones omitidas (efecto incorporado en los datos):** 12 RECTIFICACION_FIN +
   5 ajustes manuales (reversión 151,3M, C1 40,7M, RECT-013 ×3, RECT-SAL 24 CUP) — listadas
   con descripción y fecha en el expediente §D.
4. El pago en EUR/MLC de venta POS no tiene riel de components (checkout admite CUP/USD):
   las categorías existen y el mapeo está listo; la combinación queda documentada como no
   soportada por el POS actual (no se inventa conversión).

## 6. Conclusión

La contabilidad de ENERVIDA-VITALLCONS quedó **reconstruida, clasificada por (medio × moneda)
real, equilibrada (0.00) y auditable** sobre una generación nueva (GEN-1) con la historia
íntegra conservada (GEN-0 superseded). El mecanismo de generaciones queda disponible para
futuros ciclos (build → validate → activate → rollback probados en E2E y en producción).
