/**
 * custom-result.ts — MISIÓN CONCILIACIÓN DEFINITIVA (2026-10-26).
 *
 * CONTRATO DEL REPORTE PERSONALIZADO CON ANEXO DE AUDITORÍA:
 * la selección de conceptos GOBIERNA el cálculo del reporte personalizado
 * (no solo oculta filas) y convive con un RESULTADO OFICIAL DE REFERENCIA
 * calculado sobre el universo completo de movimientos del período.
 *
 * DOS RESULTADOS INDEPENDIENTES (misión §4.1), misma fuente contable
 * (computeDailySummary — fórmula única) y mismas definiciones de movimiento,
 * moneda y fechas; la ÚNICA diferencia es la selección aplicada al
 * personalizado:
 *
 *   RESULTADO 1 — Reporte personalizado: conceptos ACTIVOS + ventas
 *   seleccionadas. Lo consumen vista, vista previa, PDF, impresión y Excel.
 *   Identificado como «Reporte personalizado — conceptos seleccionados».
 *
 *   RESULTADO 2 — Reporte oficial de referencia: TODOS los conceptos y TODAS
 *   las ventas válidas del período. Independiente del estado de los
 *   checkboxes — jamás se construye a partir del personalizado ni sumando
 *   sus diferencias. Base de comparación del anexo de auditoría.
 *
 * EFECTO DE CADA CONCEPTO (misión §4.2 — contrato documentado):
 *
 *   Componentes del EFECTIVO ESPERADO (desactivar EXCLUYE el término del
 *   cálculo personalizado; el anexo registra el importe oficial omitido):
 *   · saldoInicial     → + saldoInicial (libro, ventana [origen, inicio))
 *   · ventasEfectivo   → + cobrosBilletes (ventasCash + liquidacionBilletes:
 *                        billetes netos de las ventas con liquidación — el
 *                        vuelto cruzado se retira JUNTO con la venta)
 *   · otIngresos       → + otIngresosCash
 *   · ajustes          → + ajustesPositivos − ajustesNegativos
 *   · ingresosCaja     → + ingresosCaja
 *   · otrosEgresos     → − (comisionesCash + serviciosRecibidosCash +
 *                        recibosProveedoresCash)
 *   · egresosCaja      → − egresosCaja
 *   · reembolsos       → − reembolsosCash
 *
 *   Partidas INFORMATIVAS/AGREGADAS (no tocan el esperado físico — misión
 *   §4.3: «desaparece de la salida, pero no debe modificar artificialmente
 *   ese saldo físico»):
 *   · resumenDia         → total agregado, RECALCULADO con los componentes
 *                          de venta activos (nunca se suma a sus componentes)
 *   · ventasTransferencia/ventasZelle → filas informativas; también se
 *                          excluyen del agregado resumenDia cuando se
 *                          desactivan (ninguna partida silenciosa)
 *   · equivalenciaCup    → equivalencia contable CUP de cobros en otra moneda
 *                          (línea propia; los billetes viven en su hoja). El
 *                          «equivalente contable CUP» personalizado la excluye
 *                          al desactivarse, sin reclasificar la venta original.
 *
 * IDENTIDAD VERIFICADA: con TODOS los conceptos activos y TODAS las ventas
 * seleccionadas, customExpected === oficial.efectivoEsperado (misma fórmula
 * de summary.ts, término a término). La prueba
 * custom-result.test.ts la certifica.
 *
 * DESCOMPOSICIÓN DE LA DIFERENCIA (misión §5.2 — aditiva y con ventas
 * separadas de conceptos):
 *   total      = oficial.efectivoEsperado − personalizado.efectivoEsperado
 *   byConcepts = oficial − personalizadoConTodasLasVentas
 *   bySales    = personalizadoConTodasLasVentas − personalizado
 *   unexplained = total − byConcepts − bySales  (0 por construcción; si ≠ 0
 *   se informa «Pendiente de conciliación» y NO se declara conciliado).
 *
 * Este módulo es PURO (sin IO, sin mutación): el reporte personalizado JAMÁS
 * modifica saldos reales, pagos, ventas, documentos de caja o movimientos
 * persistidos (misión §1.5).
 */

import type { DailySummary } from './summary';
import type { SummaryConceptKey, SummaryConceptsSelection } from './report-selection';

export type CustomCurrency = 'CUP' | 'USD';

/** Base monetaria de una partida (misión §5.1 «Base monetaria»). */
export type MonetaryBase = 'CUP' | 'USD' | 'equivalente contable CUP';

/** Efecto de un concepto sobre el cálculo personalizado. */
export type ConceptEffectKind = 'componente' | 'informativo';

/** Fila del anexo: comparación por concepto (misión §5.1 tabla obligatoria). */
export interface ConceptAuditRow {
  /** Concepto (nombre de la partida financiera). */
  concepto: string;
  /** Clave del concepto. */
  key: SummaryConceptKey;
  /** Estado en configuración: activo u omitido. */
  estado: 'activo' | 'omitido';
  /** Importe según el cálculo completo de COSTPRO (universo completo). */
  importeOficial: number;
  /** Importe incorporado al resultado configurado. */
  importePersonalizado: number;
  /** Diferencia que provoca la selección (oficial − personalizado). */
  diferencia: number;
  /** Base monetaria (CUP, USD, equivalente contable). */
  base: MonetaryBase;
  /** Componente de la fórmula del esperado o partida informativa. */
  efecto: ConceptEffectKind;
  /** Motivo de la diferencia o aclaración de la base. */
  observacion: string;
}

/** Conciliación del anexo (misión §5.1 «sección de conciliación»). */
export interface AuditReconciliation {
  /** Total oficial de ventas del período (universo completo, moneda hoja). */
  ventasTotalesOficial: number;
  /** Total del reporte personalizado (componentes activos). */
  ventasTotalesPersonalizado: number;
  /** Saldo inicial oficial (libro autoritativo, ventana [origen, inicio)). */
  saldoInicialOficial: number;
  /** Efectivo esperado OFICIAL por moneda (fórmula completa de COSTPRO). */
  efectivoEsperadoOficial: number;
  /** Efectivo esperado según la configuración (conceptos activos). */
  efectivoEsperadoPersonalizado: number;
  /** Equivalencia canónica CUP oficial (solo hoja CUP; 0 en USD). */
  equivalenciaOficial: number;
  /** Equivalencia canónica CUP configurada (0 si concepto desactivado). */
  equivalenciaPersonalizada: number;
  /** Ingresos de caja oficiales del período. */
  ingresosCajaOficial: number;
  /** Egresos de caja oficiales del período. */
  egresosCajaOficial: number;
  /** Diferencia monetaria total configurado − oficial (negativa = excluido). */
  diferenciaTotal: number;
  /** Parte de la diferencia causada SOLO por conceptos desactivados. */
  diferenciaPorConceptos: number;
  /** Parte causada SOLO por la selección individual de ventas. */
  diferenciaPorVentas: number;
  /** Residuo no explicado (0 esperado; ≠ 0 ⇒ Pendiente de conciliación). */
  diferenciaNoExplicada: number;
  /** Ventas válidas del período (universo oficial). */
  ventasValidas: number;
  /** Ventas incluidas en el personalizado. */
  ventasSeleccionadas: number;
  /** Ventas excluidas por selección individual. */
  ventasExcluidas: number;
  /** true ⇔ la diferencia se explica por completo (misma base y ventana). */
  conciliado: boolean;
}

/** Resultado completo por moneda: personalizado + oficial + auditoría. */
export interface CustomCurrencyResult {
  currency: CustomCurrency;
  /** Resumen OFICIAL: computeDailySummary del reporte ORIGINAL (todas las
   *  ventas, todos los conceptos). Jamás derivado del personalizado. */
  oficial: DailySummary;
  /** Resumen del conjunto SELECCIONADO (mismos conceptos — insumo del
   *  personalizado antes de aplicar conceptos). */
  seleccion: DailySummary;
  /** Efectivo esperado del reporte personalizado (conceptos activos sobre el
   *  conjunto seleccionado). Con todo activo = oficial.efectivoEsperado. */
  efectivoEsperadoPersonalizado: number;
  /** Total agregado de ventas personalizado (componentes activos). */
  ventasTotalesPersonalizado: number;
  /** Equivalente contable CUP personalizado (hoja CUP; excluye la
   *  equivalencia cuando el concepto está desactivado). */
  equivalenteContablePersonalizado: number;
  /** Tabla de comparación por concepto (anexo). */
  conceptos: ConceptAuditRow[];
  /** Conciliación (anexo). */
  conciliacion: AuditReconciliation;
  /** true ⇔ ninguna personalización (todos los conceptos + todas las ventas):
   *  el documento se identifica como reporte oficial completo. */
  esPersonalizado: boolean;
}

const EPS = 0.005;

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Términos de la fórmula del esperado agrupados por concepto. */
export function conceptTerms(s: DailySummary): Record<SummaryConceptKey, number> {
  return {
    saldoInicial: num(s.saldoInicial),
    // Billetes netos de las ventas (incluye liquidación/vuelto cruzado): el
    // concepto cubre la partida COMPLETA — desactivarla retira también el
    // neto de liquidación, exactamente como si esas ventas no se computaran.
    ventasEfectivo: num(s.cobrosBilletes),
    ventasTransferencia: num(s.ventasTransfer),
    ventasZelle: num(s.ventasZelle),
    equivalenciaCup: num(s.equivCashOtraMoneda),
    ingresosCaja: num(s.ingresosCaja),
    egresosCaja: num(s.egresosCaja),
    otrosEgresos: num(s.comisionesCash) + num(s.serviciosRecibidosCash) + num(s.recibosProveedoresCash),
    otIngresos: num(s.otIngresosCash),
    ajustes: num(s.ajustesPositivos) - num(s.ajustesNegativos),
    reembolsos: num(s.reembolsosCash),
    resumenDia: 0, // agregado — se calcula aparte
  };
}

/**
 * Efectivo esperado del REPORTE PERSONALIZADO (fórmula centralizada).
 * Con todos los conceptos activos reproduce EXACTAMENTE el esperado oficial
 * de summary.ts — identidad certificada por prueba.
 */
export function customExpected(s: DailySummary, sel: SummaryConceptsSelection): number {
  let e = 0;
  if (sel.saldoInicial) e += num(s.saldoInicial);
  if (sel.ventasEfectivo) e += num(s.cobrosBilletes);
  if (sel.otIngresos) e += num(s.otIngresosCash);
  if (sel.ajustes) e += num(s.ajustesPositivos) - num(s.ajustesNegativos);
  if (sel.ingresosCaja) e += num(s.ingresosCaja);
  if (sel.otrosEgresos) e -= num(s.comisionesCash) + num(s.serviciosRecibidosCash) + num(s.recibosProveedoresCash);
  if (sel.egresosCaja) e -= num(s.egresosCaja);
  if (sel.reembolsos) e -= num(s.reembolsosCash);
  return e;
}

/** Total agregado de ventas personalizado (componentes activos; el agregado
 *  NUNCA se suma a sus componentes — misión §4.2 «no dupliques importes»). */
export function customVentasTotales(s: DailySummary, sel: SummaryConceptsSelection): number {
  let t = 0;
  if (sel.ventasEfectivo) t += num(s.ventasCash) + num(s.ventasMixed); // mixed legacy se agrupa con el efectivo
  if (sel.ventasTransferencia) t += num(s.ventasTransfer);
  if (sel.ventasZelle) t += num(s.ventasZelle);
  return t;
}

/**
 * Resultado personalizado + oficial + auditoría por moneda.
 *
 * @param oficial  DailySummary del reporte ORIGINAL (universo completo).
 * @param seleccion DailySummary del conjunto de ventas SELECCIONADO (misma
 *                 fórmula — produce los importes «con las ventas activas»).
 * @param sel      Conceptos activos.
 * @param counts   {validas, seleccionadas} — conteos del período (anexo).
 */
export function computeCustomCurrencyResult(
  currency: CustomCurrency,
  oficial: DailySummary,
  seleccion: DailySummary,
  sel: SummaryConceptsSelection,
  counts: { validas: number; seleccionadas: number },
): CustomCurrencyResult {
  const oficialEsperado = num(oficial.efectivoEsperado);
  // Personalizado: conceptos activos sobre el conjunto seleccionado.
  const personalizado = customExpected(seleccion, sel);
  // Personalizado con TODAS las ventas (aisla el efecto de los conceptos).
  const personalizadoTodasVentas = customExpected(oficial, sel);

  const terminosOficial = conceptTerms(oficial);
  const terminosSeleccion = conceptTerms(seleccion);

  // ── Tabla por concepto (anexo §5.1) ──
  const conceptos: ConceptAuditRow[] = ([
    ['saldoInicial', 'Saldo inicial / fondo de caja', 'CUP-like', 'componente',
      'Saldo del libro anterior al período; no cambia con la selección de ventas'],
    ['ventasEfectivo', 'Ventas en efectivo (billetes netos)', 'CUP-like', 'componente',
      'Incluye el neto de liquidación/vuelto de esas ventas (cobrosBilletes)'],
    ['ventasTransferencia', 'Ventas por transferencia', 'CUP-like', 'informativo',
      'La transferencia no es efectivo físico: no interviene en el esperado'],
    ['ventasZelle', 'Ventas por Zelle', 'CUP-like', 'informativo',
      'Zelle no es efectivo físico: no interviene en el esperado'],
    ['resumenDia', 'Resumen del día (agregado)', 'CUP-like', 'informativo',
      'Total agregado recalculado con los componentes activos; nunca se suma a ellos'],
    ['equivalenciaCup', 'Equivalencia CUP de cobros en otras monedas', 'equivalente', 'informativo',
      'Consolidación contable (hoja CUP): los billetes viven en su hoja original'],
    ['ingresosCaja', 'Ingresos de caja (fondo y otros)', 'CUP-like', 'componente',
      'Entradas físicas documentadas del período'],
    ['egresosCaja', 'Egresos de caja (fondo y otros)', 'CUP-like', 'componente',
      'Salidas físicas documentadas del período'],
    ['otrosEgresos', 'Comisiones, servicios y proveedores en efectivo', 'CUP-like', 'componente',
      'Agrupa comisiones, servicios recibidos y pagos a proveedores en efectivo'],
    ['otIngresos', 'Anticipos de órdenes de trabajo', 'CUP-like', 'componente',
      'Cobros en efectivo de OT/producción del período'],
    ['ajustes', 'Ajustes extraordinarios (neto)', 'CUP-like', 'componente',
      'Ajustes positivos menos negativos del período'],
    ['reembolsos', 'Reembolsos de devoluciones (efectivo)', 'CUP-like', 'componente',
      'Solo el tramo pagado en efectivo reduce el esperado'],
  ] as Array<[SummaryConceptKey, string, string, ConceptEffectKind, string]>).map(([key, concepto, baseKind, efecto, observacion]) => {
    const activo = sel[key] !== false;
    let importeOficial: number;
    let importePersonalizado: number;
    let base: MonetaryBase = currency;
    let obs = observacion;
    if (key === 'resumenDia') {
      importeOficial = num(oficial.ventasTotales);
      importePersonalizado = customVentasTotales(seleccion, sel);
    } else if (key === 'equivalenciaCup') {
      // Solo la hoja CUP consolida equivalencias (hoja USD = 0).
      importeOficial = currency === 'CUP' ? num(oficial.equivCashOtraMoneda) : 0;
      importePersonalizado = currency === 'CUP' && activo ? num(seleccion.equivCashOtraMoneda) : 0;
      base = 'equivalente contable CUP';
      if (currency !== 'CUP') obs = 'La hoja USD no consolida equivalencias (regla del modelo v2.24)';
    } else {
      importeOficial = terminosOficial[key];
      // Componente: importe incluido = término del conjunto seleccionado si el
      // concepto está activo; informativo: fila visible (importe) o 0.
      importePersonalizado = activo ? terminosSeleccion[key] : 0;
    }
    if (baseKind === 'equivalente') base = 'equivalente contable CUP';
    return {
      concepto, key, estado: activo ? 'activo' : 'omitido',
      importeOficial, importePersonalizado,
      diferencia: importeOficial - importePersonalizado,
      base, efecto, observacion: obs,
    };
  });

  // ── Conciliación (anexo §5.1) ──
  const diferenciaTotal = oficialEsperado - personalizado;
  const diferenciaPorConceptos = oficialEsperado - personalizadoTodasVentas;
  const diferenciaPorVentas = personalizadoTodasVentas - personalizado;
  const diferenciaNoExplicada = diferenciaTotal - diferenciaPorConceptos - diferenciaPorVentas;
  const excluidas = Math.max(0, counts.validas - counts.seleccionadas);
  const conciliado = Math.abs(diferenciaNoExplicada) < EPS;

  const conciliacion: AuditReconciliation = {
    ventasTotalesOficial: num(oficial.ventasTotales),
    ventasTotalesPersonalizado: customVentasTotales(seleccion, sel),
    saldoInicialOficial: num(oficial.saldoInicial),
    efectivoEsperadoOficial: oficialEsperado,
    efectivoEsperadoPersonalizado: personalizado,
    equivalenciaOficial: currency === 'CUP' ? num(oficial.equivCashOtraMoneda) : 0,
    equivalenciaPersonalizada: currency === 'CUP' && sel.equivalenciaCup !== false ? num(seleccion.equivCashOtraMoneda) : 0,
    ingresosCajaOficial: num(oficial.ingresosCaja),
    egresosCajaOficial: num(oficial.egresosCaja),
    diferenciaTotal,
    diferenciaPorConceptos,
    diferenciaPorVentas,
    diferenciaNoExplicada,
    ventasValidas: counts.validas,
    ventasSeleccionadas: counts.seleccionadas,
    ventasExcluidas: excluidas,
    conciliado,
  };

  const esPersonalizado = Object.values(sel).some(v => v === false) || excluidas > 0;

  return {
    currency,
    oficial,
    seleccion,
    efectivoEsperadoPersonalizado: personalizado,
    ventasTotalesPersonalizado: customVentasTotales(seleccion, sel),
    equivalenteContablePersonalizado: currency === 'CUP'
      ? (sel.equivalenciaCup !== false ? num(seleccion.ventasCash) + num(seleccion.equivCashOtraMoneda) : num(seleccion.ventasCash))
      : 0,
    conceptos,
    conciliacion,
    esPersonalizado,
  };
}
