/**
 * custom-result.ts — MISIÓN CIERRE: INTEGRIDAD MATEMÁTICA DEL ANEXO DE
 * AUDITORÍA (2026-10-26, P1). Base: PR #1485 (merge 85ac3b3b8).
 *
 * CONTRATO DEL REPORTE PERSONALIZADO CON ANEXO DE AUDITORÍA:
 * la selección de conceptos GOBIERNA el cálculo del reporte personalizado
 * (no solo oculta filas) y convive con un RESULTADO OFICIAL DE REFERENCIA
 * calculado sobre el universo completo de movimientos del período.
 *
 * DOS RESULTADOS INDEPENDIENTES (misión anterior §4.1), misma fuente contable
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
 * ═══════════════════════════════════════════════════════════════════════════
 * CONVENCIÓN DE SIGNOS (misión P1 §2 — UNÍVOCA y documentada):
 *
 *   DIFERENCIA = PERSONALIZADO − OFICIAL
 *
 *   · Diferencia total del efectivo esperado =
 *         efectivoEsperadoPersonalizado − efectivoEsperadoOficial
 *   · Efecto de un concepto sobre el efectivo esperado (fila del anexo) =
 *         signoContableDelTérmino × (importeIncorporado − importeOficial)
 *   · Diferencia de importe de una partida (columna «Dif. importe») =
 *         importePersonalizado − importeOficial
 *
 *   Ejemplo normativo: oficial 10.500 y personalizado 11.000 ⇒ diferencia
 *   +500 (el personalizado EXCEDE al oficial). Personalizado 10.000 ⇒ −500.
 *   La misma convención gobierna el modelo, la vista, la vista previa, el
 *   PDF, la impresión y el Excel — valores, fórmulas y etiquetas.
 *
 * EFECTO DE CADA CONCEPTO (contrato documentado — misión anterior §4.2):
 *
 *   Componentes del EFECTIVO ESPERADO (desactivar EXCLUYE el término del
 *   cálculo personalizado; el anexo registra el importe oficial omitido y su
 *   efecto FIRMADO — un egreso omitido AUMENTA el esperado personalizado):
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
 *   Partidas INFORMATIVAS/AGREGADAS (no tocan el esperado físico — su
 *   efectoEsperado es 0 por diseño; la diferencia de SU importe vive en su
 *   propia magnitud, NUNCA sumada a la diferencia del efectivo):
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
 * ═══════════════════════════════════════════════════════════════════════════
 * CONCILIACIÓN VERIFICABLE (misión P1 §4 — residuo NO tautológico):
 *
 *   El residuo de la versión anterior restaba la diferencia total menos dos
 *   diferencias calculadas DE FORMA SECUENCIAL (total = porConceptos +
 *   porVentas por construcción ⇒ residuo ≡ 0 sin comprobar nada). Ahora:
 *
 *   1. CAMBIO REAL (directo): diferenciaTotal = customExpected(seleccion,
 *      conceptosActivos) − oficial.efectivoEsperado. Dos rutas de código
 *      independientes (la fórmula del personalizado vs la fórmula completa
 *      de summary.ts — el oficial JAMÁS se deriva del personalizado).
 *   2. CONTRIBUCIONES POR CONCEPTO (independientes): para cada componente
 *      DESACTIVADO, efecto = −signo × términoOficial (el término que el
 *      reporte personalizado deja de incorporar, con su signo contable).
 *   3. EFECTO DE EXCLUIR VENTAS (independiente): para cada componente
 *      ACTIVO, efecto = signo × (términoSeleccionadas − términoOficial) —
 *      el cambio que la selección de ventas provoca SOBRE los términos que
 *      el personalizado sí incorpora.
 *   4. RESIDUO = diferenciaTotal − Σ(conceptos) − Σ(ventas). NO es una
 *      identidad algebraica: cruza TRES rutas independientes (customExpected,
 *      conceptTerms y la fórmula oficial de summary.ts). Si el desglose del
 *      anexo deja de reflejar el efecto real de los conceptos omitidos, el
 *      residuo se abre y el estado pasa a «Pendiente de conciliación».
 *   5. COHERENCIA DETALLE↔RESUMEN: sumaEfectosFilas (Σ de la columna
 *      «Efecto en esperado» del anexo) debe coincidir con la suma de las
 *      contribuciones independientes; las diferencias de VENTAS TOTALES y de
 *      EQUIVALENCIA CONTABLE se concilian por separado (magnitudes propias —
 *      jamás se suman efectivo físico, ventas y equivalente como una única
 *      magnitud homogénea).
 *
 * ESTADO DEL ANEXO (misión P1 §5 — tri-estado inequívoco):
 *   · «sin-diferencias»    — el personalizado coincide con el oficial en las
 *                            magnitudes comparadas (esperado, ventas,
 *                            equivalencia) dentro de la tolerancia.
 *   · «explicadas»         — existen diferencias Y el detalle firmado
 *                            (conceptos + selección de ventas) las explica
 *                            por completo dentro de la tolerancia.
 *   · «pendiente»          — el detalle no explica toda la diferencia o las
 *                            bases de comparación no permiten concluir.
 *   La palabra «Conciliado» desaparece del vocabulario visible: un reporte
 *   personalizado que difiere del oficial NO se presenta como conciliado a
 *   secas — se declara «explicado por la configuración».
 *
 * IDENTIDAD VERIFICADA: con TODOS los conceptos activos y TODAS las ventas
 * seleccionadas, customExpected === oficial.efectivoEsperado (misma fórmula
 * de summary.ts, término a término). La prueba custom-result.test.ts la
 * certifica — y el residuo independiente la re-certifica en cada cálculo.
 *
 * Este módulo es PURO (sin IO, sin mutación): el reporte personalizado JAMÁS
 * modifica saldos reales, pagos, ventas, documentos de caja o movimientos
 * persistidos.
 */

import type { DailySummary } from './summary';
import type { SummaryConceptKey, SummaryConceptsSelection } from './report-selection';

export type CustomCurrency = 'CUP' | 'USD';

/** Base monetaria de una partida (misión «Base monetaria»). */
export type MonetaryBase = 'CUP' | 'USD' | 'equivalente contable CUP';

/** Efecto de un concepto sobre el cálculo personalizado. */
export type ConceptEffectKind = 'componente' | 'informativo';

/** Estado de auditoría del anexo (misión P1 §5 — tri-estado inequívoco). */
export type AuditStatus = 'sin-diferencias' | 'explicadas' | 'pendiente';

/** Etiqueta corta del estado (misma en vista, PDF, impresión y Excel). */
export function auditStatusLabel(estado: AuditStatus): string {
  switch (estado) {
    case 'sin-diferencias': return 'Sin diferencias';
    case 'explicadas': return 'Diferencias explicadas por la configuración';
    case 'pendiente': return 'Pendiente de conciliación';
  }
}

/** Definición operativa del estado (una línea, para el anexo PDF/Excel). */
export function auditStatusDefinition(estado: AuditStatus): string {
  switch (estado) {
    case 'sin-diferencias':
      return 'el reporte personalizado coincide con el oficial en las magnitudes comparadas (efectivo esperado, ventas totales y equivalencia contable) dentro de la tolerancia.';
    case 'explicadas':
      return 'existen diferencias y el detalle firmado por concepto (conceptos desactivados + selección de ventas) las explica por completo dentro de la tolerancia monetaria.';
    case 'pendiente':
      return 'el detalle por concepto no explica toda la diferencia dentro de la tolerancia o las bases de comparación no permiten una conclusión válida.';
  }
}

/** Fila del anexo: comparación por concepto (tabla obligatoria de la misión). */
export interface ConceptAuditRow {
  /** Concepto (nombre de la partida financiera). */
  concepto: string;
  /** Clave del concepto. */
  key: SummaryConceptKey;
  /** Estado en configuración: activo u omitido. */
  estado: 'activo' | 'omitido';
  /** Importe según el cálculo completo de COSTPRO (universo completo). */
  importeOficial: number;
  /** Importe incorporado al resultado personalizado (0 si el concepto está
   *  desactivado o la partida es informativa oculta). */
  importePersonalizado: number;
  /** Diferencia de IMPORTE de la partida = personalizado − oficial (misma
   *  convención que la diferencia principal; NO es su efecto sobre el saldo). */
  diferencia: number;
  /** Efecto FIRMADO de la partida sobre el EFECTIVO ESPERADO, en la
   *  convención personalizado − oficial: signoContable × diferencia.
   *  Un egreso omitido (importe positivo, término −) produce efecto POSITIVO
   *  (el esperado personalizado aumenta). 0 en partidas informativas. */
  efectoEsperado: number;
  /** Base monetaria (CUP, USD, equivalente contable). */
  base: MonetaryBase;
  /** Componente de la fórmula del esperado o partida informativa. */
  efecto: ConceptEffectKind;
  /** Motivo de la diferencia o aclaración de la base. */
  observacion: string;
}

/** Conciliación del anexo (sección de conciliación de la misión). */
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
  /** DIFERENCIA TOTAL del efectivo esperado = personalizado − oficial
   *  (positivo ⇒ el personalizado EXCEDE al oficial). */
  diferenciaTotal: number;
  /** Efecto de los conceptos DESACTIVADOS, calculado INDEPENDIENTEMENTE de
   *  la diferencia total: Σ (−signoContable × términoOficial) de los
   *  componentes omitidos. Convención personalizado − oficial. */
  diferenciaPorConceptos: number;
  /** Efecto de excluir VENTAS, calculado INDEPENDIENTEMENTE: Σ signo ×
   *  (términoSeleccionado − términoOficial) de los componentes ACTIVOS.
   *  Convención personalizado − oficial. */
  diferenciaPorVentas: number;
  /** Residuo NO tautológico: diferenciaTotal − (porConceptos + porVentas).
   *  0 solo si el desglose del anexo refleja fielmente el efecto de la
   *  configuración sobre el esperado; ≠ 0 ⇒ «Pendiente de conciliación». */
  diferenciaNoExplicada: number;
  /** Σ de la columna «Efecto en esperado» del anexo (verificación del
   *  DETALLE contra el resumen de diferencias — misión §4.5). */
  sumaEfectosFilas: number;
  /** Deriva detalle↔resumen: sumaEfectosFilas − (porConceptos + porVentas).
   *  ≠ 0 ⇒ las filas del anexo no coinciden con el resumen ⇒ pendiente. */
  derivaDetalle: number;
  /** Diferencia de VENTAS TOTALES = personalizado − oficial (magnitud
   *  PROPIA del agregado de ventas — nunca sumada a la del efectivo). */
  diferenciaVentasTotales: number;
  /** Diferencia de EQUIVALENCIA CONTABLE CUP = personalizada − oficial
   *  (magnitud propia de la consolidación contable; 0 en la hoja USD). */
  diferenciaEquivalencia: number;
  /** Tolerancia monetaria aplicada (0,005 — medio centavo). */
  tolerancia: number;
  /** Ventas válidas del período (universo oficial). */
  ventasValidas: number;
  /** Ventas incluidas en el personalizado. */
  ventasSeleccionadas: number;
  /** Ventas excluidas por selección individual. */
  ventasExcluidas: number;
  /** Estado inequívoco del anexo (misión P1 §5). */
  estado: AuditStatus;
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

/**
 * Signo CONTABLE de cada componente en la fórmula del efectivo esperado
 * (summary.ts): ingresos/ajustes positivos suman (+1); egresos, comisiones,
 * servicios, proveedores y reembolsos restan (−1). Las partidas informativas
 * (transferencias, Zelle, equivalencia, agregado) NO figuran aquí: su
 * efectoEsperado es 0 por diseño.
 */
export const CONCEPT_SIGN: Readonly<Partial<Record<SummaryConceptKey, number>>> = {
  saldoInicial: 1,
  ventasEfectivo: 1,
  otIngresos: 1,
  ajustes: 1,
  ingresosCaja: 1,
  otrosEgresos: -1,
  egresosCaja: -1,
  reembolsos: -1,
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
 *  NUNCA se suma a sus componentes — «no dupliques importes»). */
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
  // (1) CAMBIO REAL — cálculo directo del personalizado (conceptos activos
  // sobre el conjunto seleccionado) frente al oficial (fórmula completa de
  // summary.ts). Rutas independientes: el oficial jamás se deriva de aquí.
  const personalizado = customExpected(seleccion, sel);

  const terminosOficial = conceptTerms(oficial);
  const terminosSeleccion = conceptTerms(seleccion);

  // ── Tabla por concepto (anexo) ──
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
      'Salidas físicas documentadas del período; al omitirlas el esperado AUMENTA'],
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
    // Convención unificada: diferencia de importe = personalizado − oficial.
    const diferencia = importePersonalizado - importeOficial;
    // Efecto FIRMADO sobre el efectivo esperado (componentes únicamente):
    // signo contable del término × diferencia de importe. Un egreso (término
    // −) omitido produce efecto POSITIVO: el esperado personalizado aumenta.
    const signo = efecto === 'componente' ? (CONCEPT_SIGN[key] ?? 0) : 0;
    // «+ 0» normaliza el −0 de la multiplicación (0 × negativo = −0) para que
    // la igualdad estricta con 0 sea estable en pruebas y consumidores.
    const efectoEsperado = signo * diferencia + 0;
    return {
      concepto, key, estado: activo ? 'activo' : 'omitido',
      importeOficial, importePersonalizado,
      diferencia,
      efectoEsperado,
      base, efecto, observacion: obs,
    };
  });

  // ── Conciliación (anexo) — convención personalizado − oficial ──
  const diferenciaTotal = personalizado - oficialEsperado;

  // (2) Contribuciones INDEPENDIENTES por concepto desactivado: el término
  // oficial que el personalizado deja de incorporar, con SU signo contable
  // (−signo × término). Calculado de los importes del anexo, NO como resta
  // secuencial de los dos esperados.
  let diferenciaPorConceptos = 0;
  for (const key of Object.keys(CONCEPT_SIGN) as SummaryConceptKey[]) {
    if (sel[key] !== false) continue; // solo componentes DESACTIVADOS
    diferenciaPorConceptos += -(CONCEPT_SIGN[key] ?? 0) * terminosOficial[key];
  }

  // (3) Efecto INDEPENDIENTE de excluir ventas: cambio de cada término
  // ACTIVO entre el conjunto seleccionado y el universo oficial.
  let diferenciaPorVentas = 0;
  for (const key of Object.keys(CONCEPT_SIGN) as SummaryConceptKey[]) {
    if (sel[key] === false) continue; // solo componentes ACTIVOS
    diferenciaPorVentas += (CONCEPT_SIGN[key] ?? 0) * (terminosSeleccion[key] - terminosOficial[key]);
  }

  // (4) Residuo: cambio real − contribuciones independientes. NO tautológico
  // (cruza customExpected ↔ conceptTerms ↔ fórmula oficial de summary.ts).
  const diferenciaNoExplicada = diferenciaTotal - diferenciaPorConceptos - diferenciaPorVentas;

  // (5) Coherencia detalle↔resumen (misión §4.5): la Σ de la columna
  // «Efecto en esperado» debe coincidir con las contribuciones del resumen.
  const sumaEfectosFilas = conceptos.reduce((s, c) => s + c.efectoEsperado, 0);
  const derivaDetalle = sumaEfectosFilas - diferenciaPorConceptos - diferenciaPorVentas;

  // Magnitudes PROPIAS (jamás sumadas a la diferencia del efectivo físico):
  const ventasTotalesPersonalizado = customVentasTotales(seleccion, sel);
  const diferenciaVentasTotales = ventasTotalesPersonalizado - num(oficial.ventasTotales);
  const equivalenciaPersonalizada = currency === 'CUP' && sel.equivalenciaCup !== false ? num(seleccion.equivCashOtraMoneda) : 0;
  const equivalenciaOficial = currency === 'CUP' ? num(oficial.equivCashOtraMoneda) : 0;
  const diferenciaEquivalencia = equivalenciaPersonalizada - equivalenciaOficial;

  // Coherencia de las filas informativas con SUS magnitudes del resumen:
  const filaResumen = conceptos.find(c => c.key === 'resumenDia');
  const filaEquivalencia = conceptos.find(c => c.key === 'equivalenciaCup');
  const derivaVentasDetalle = filaResumen
    ? Math.abs(diferenciaVentasTotales - filaResumen.diferencia)
    : 0;
  const derivaEquivalenciaDetalle = filaEquivalencia
    ? Math.abs(diferenciaEquivalencia - filaEquivalencia.diferencia)
    : 0;

  // Bases de comparación válidas (conteos coherentes).
  const basesValidas = counts.validas >= 0
    && counts.seleccionadas >= 0
    && counts.seleccionadas <= counts.validas;

  // ── Estado tri-estado (misión P1 §5) ──
  const hayDiferencias = Math.abs(diferenciaTotal) >= EPS
    || Math.abs(diferenciaVentasTotales) >= EPS
    || Math.abs(diferenciaEquivalencia) >= EPS;
  const pendiente = !basesValidas
    || Math.abs(diferenciaNoExplicada) >= EPS
    || Math.abs(derivaDetalle) >= EPS
    || derivaVentasDetalle >= EPS
    || derivaEquivalenciaDetalle >= EPS;
  const estado: AuditStatus = pendiente ? 'pendiente' : (hayDiferencias ? 'explicadas' : 'sin-diferencias');

  const excluidas = Math.max(0, counts.validas - counts.seleccionadas);

  const conciliacion: AuditReconciliation = {
    ventasTotalesOficial: num(oficial.ventasTotales),
    ventasTotalesPersonalizado,
    saldoInicialOficial: num(oficial.saldoInicial),
    efectivoEsperadoOficial: oficialEsperado,
    efectivoEsperadoPersonalizado: personalizado,
    equivalenciaOficial,
    equivalenciaPersonalizada,
    ingresosCajaOficial: num(oficial.ingresosCaja),
    egresosCajaOficial: num(oficial.egresosCaja),
    diferenciaTotal,
    diferenciaPorConceptos,
    diferenciaPorVentas,
    diferenciaNoExplicada,
    sumaEfectosFilas,
    derivaDetalle,
    diferenciaVentasTotales,
    diferenciaEquivalencia,
    tolerancia: EPS,
    ventasValidas: counts.validas,
    ventasSeleccionadas: counts.seleccionadas,
    ventasExcluidas: excluidas,
    estado,
  };

  const esPersonalizado = Object.values(sel).some(v => v === false) || excluidas > 0;

  return {
    currency,
    oficial,
    seleccion,
    efectivoEsperadoPersonalizado: personalizado,
    ventasTotalesPersonalizado,
    equivalenteContablePersonalizado: currency === 'CUP'
      ? (sel.equivalenciaCup !== false ? num(seleccion.ventasCash) + num(seleccion.equivCashOtraMoneda) : num(seleccion.ventasCash))
      : 0,
    conceptos,
    conciliacion,
    esPersonalizado,
  };
}
