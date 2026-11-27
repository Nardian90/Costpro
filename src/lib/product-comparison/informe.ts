/**
 * ADNEGOCIO-UI 2026-11-24 · INFORME EJECUTIVO DE DESEMPEÑO COMERCIAL Y
 * ABASTECIMIENTO (misión Informe Gerencial — replanteo de arquitectura).
 * ===========================================================================
 * Motor analítico PURO (sin I/O) que transforma la comparación REAL
 * (buildComparison → rows/resumen) en un documento de dirección: diagnóstico,
 * indicadores, gráfico, matriz de prioridades con decisiones fundamentadas,
 * análisis complementario y anexos. Consumidor único: el generador del PDF
 * oficial (informe-ejecutivo-pdf.ts). El tab de la vista NO renderiza este
 * contenido en texto: solo controles + estado + vista preliminar.
 *
 * RESPONDE CUATRO PREGUNTAS DE DIRECCIÓN:
 *  1. ¿Qué está ocurriendo con el comportamiento comercial de los productos?
 *  2. ¿Qué causas son compatibles con los cambios observados?
 *  3. ¿Qué riesgos u oportunidades existen en existencias y rotación?
 *  4. ¿Qué decisiones debería evaluar la dirección y con qué prioridad?
 *
 * REGLAS DE INTEGRIDAD (no negociables):
 *  · Nada se inventa: todo número proviene de rows/resumen + catálogo + mayor
 *    de inventario. Sin base → «sin base»; sin datos → limitación declarada.
 *  · HECHO ≠ interpretación ≠ hipótesis ≠ decisión: la redacción lo distingue.
 *  · NO se declara «ventas perdidas» ni demanda no atendida cuantificada: el
 *    importe del tramo anterior no es una pérdida comprobada (Caso Cemento).
 *  · NO se atribuye a demanda un cambio de ingresos con unidades opuestas:
 *    se identifica precio efectivo / composición como explicación compatible
 *    y se recomienda verificación (Caso Cable).
 *  · NO se confunde liderazgo en facturación con rotación: una operación
 *    aislada de alto valor se señala como tal (Caso Inversor).
 *  · NO se recomienda aumentar inventario ante contracción con existencia
 *    disponible (Caso Cemento Blanco): primero velocidad, cobertura, demanda.
 *  · Velocidad y cobertura en la U.M. PROPIA de cada producto — nunca
 *    agregadas entre U.M. distintas; precios efectivos por producto.
 *  · Existencia ACTUAL del almacén de la tienda (instantánea del catálogo
 *    autoritativo). NO se presenta como existencia promedio del período:
 *    sin promedio ni costo de ventas NO se calcula rotación financiera de
 *    inventario (limitación declarada en metodología).
 *  · «Sin ventas» SOLO con evidencia del mayor de inventario; sin evidencia
 *    → «verificar» (no se afirma venta ni su ausencia). Nunca mezclar
 *    categorías solapadas al contar.
 *
 * UMBRALES (documentados, configurables, con fundamento):
 *  · Cobertura de referencia = D (días del tramo analizado, la cadencia
 *    natural del informe mensual): cobertura < D/2 → rotación alta (la
 *    existencia no alcanza la mitad del ciclo — decisión de reposición
 *    en el corto plazo); D/2 ≤ cobertura ≤ D → moderada; cobertura > D →
 *    baja (la demanda del tramo no consume la existencia — revisar compras).
 *  · Crecimiento/contracción relevante: |Δ%| ≥ 50 % — simétrico del umbral
 *    publicado CAIDA_FUERTE_PCT de compare.ts.
 *  · Concentración del líder: > 50 % (participación oficial del RPC).
 */

import { formatCurrency } from '@/lib/utils';
import {
  CAIDA_FUERTE_PCT,
  TOP_PRINCIPAL_ANTERIOR,
  type ComparisonRow,
  type ComparisonResumen,
} from './compare';

// ── Umbrales configurables (documentados arriba; NO cambiar sin revisar
//    la metodología del Anexo IV, que los cita) ───────────────────────────────

/** Cobertura (en múltiplos de D) por debajo de la cual la rotación es ALTA. */
export const UMBRAL_COBERTURA_ALTA = 0.5;
/** Cobertura (en múltiplos de D) por encima de la cual la rotación es BAJA. */
export const UMBRAL_COBERTURA_BAJA = 1;
/** Δ% mínimo (simétrico de CAIDA_FUERTE_PCT) para «relevante» en indicadores. */
export const UMBRAL_CRECIMIENTO_RELEVANTE = CAIDA_FUERTE_PCT;
/** Productos máximos del gráfico ejecutivo (legibilidad del documento). */
export const GRAFICO_MAX_PRODUCTOS = 8;
/** Tope de filas de la matriz ejecutiva (el resto queda en anexos). */
export const MATRIZ_MAX_FILAS = 12;

// ── Tipos del documento ──────────────────────────────────────────────────────

export interface InformeMeta {
  /** Nombre de la entidad (tienda activa) — encabezado institucional. */
  entidadNombre: string;
  titulo: 'INFORME EJECUTIVO DE DESEMPEÑO COMERCIAL Y ABASTECIMIENTO';
  /** Ventana del período actual (yyyy-MM-dd, idéntica a la vista). */
  periodoActual: { desde: string; hasta: string };
  /** Ventana equivalente de comparación (yyyy-MM-dd). */
  periodoComparacion: { desde: string; hasta: string };
  /** Fecha y hora de ELABORACIÓN del informe (ISO; se congela al generar). */
  generadoEl: string;
  /** Ámbito real del análisis (tienda activa). */
  ambito: string;
  /** Días del tramo analizado (velocidad y cobertura usan esta base). */
  diasPeriodo: number;
  /** Parámetros y filtros aplicados (transparencia metodológica). */
  parametros: string[];
}

export interface InformeIndicador {
  label: string;
  value: string;
}

export type PrioridadNivel = 'alta' | 'media' | 'preventiva';

export interface InformePrioridad {
  nivel: PrioridadNivel;
  producto: string;
  /** Situación redactada específica, con las cifras del caso. */
  situacion: string;
  /** Decisión recomendada, adaptada al problema (no plantilla repetida). */
  decision: string;
}

export interface InformeSerieGrafico {
  name: string;
  /** Ingresos del tramo comparable (CUP). */
  anterior: number;
  /** Ingresos del período analizado (CUP). */
  actual: number;
}

export interface InformeGrafico {
  titulo: string;
  nota: string;
  series: InformeSerieGrafico[];
}

export interface InformeTabla {
  titulo: string;
  /** Introducción breve de la tabla (alcance y criterio). */
  intro?: string;
  /** Encabezado de columnas (la tabla es compacta, con su propio criterio). */
  columnas: string[];
  /** Filas con las cifras ya formateadas por producto y U.M. */
  filas: string[][];
  /** Nota breve específica de la tabla (cuando aporta precisión). */
  nota?: string;
  /** Proporciones de ancho por columna (suman 1) — evita columnas comprimidas. */
  anchos?: number[];
  /** Alineación por columna (por defecto: primera izquierda, resto derecha). */
  alineaciones?: Array<'left' | 'right' | 'center'>;
}

export interface InformeMetodologia {
  titulo: string;
  parrafos: string[];
}

/** ADN-ANALISIS-COMPARAR-PRODUCTOS-EXECUTIVE-PDF-001 · Serie del gráfico divergente
 *  de variaciones. DERIVADA de los campos ya calculados por buildComparison
 *  (difCup/varPct/evolucion): no introduce reglas ni cifras nuevas (§10). */
export interface InformeVariacion {
  name: string;
  /** Variación absoluta del período (actual − anterior), CUP. */
  difCup: number;
  /** Variación % — null SIN base comparable (los «nuevos» no llevan % ficticio). */
  varPct: number | null;
  /** Certificado por evolucion==='nuevo': entra al ranking sin ventas comparables. */
  esNuevo: boolean;
}

/** ADN-ANALISIS-COMPARAR-PRODUCTOS-EXECUTIVE-PDF-001 · Elemento del gráfico de
 *  disponibilidad y cobertura. DERIVADO de evaluarRotacion (MISMOS umbrales y
 *  clasificación — sin reglas nuevas; §10). */
export interface InformeCoberturaItem {
  name: string;
  /** Estado operativo para la visualización (etiqueta textual siempre visible). */
  estado: 'agotado' | 'cobertura_insuficiente' | 'cobertura_moderada' | 'baja_rotacion' | 'sin_movimiento' | 'sin_dato';
  /** Cobertura estimada en días (existencia ÷ velocidad) — null cuando no es calculable. */
  coberturaDias: number | null;
  /** Texto oficial de cobertura ya formateado por el motor. */
  coberturaTexto: string;
}

export interface InformeEjecutivo {
  meta: InformeMeta;
  /** Diagnóstico ejecutivo: situación general (párrafos sustantivos). */
  situacionGeneral: string[];
  /** Conclusión gerencial central (una frase, la de mayor severidad). */
  conclusionGerencial: string;
  /** Indicadores relevantes (pocos, útiles, sin redundancia). */
  indicadores: InformeIndicador[];
  /** Gráfico ejecutivo (barras comparativas de los productos de impacto). */
  grafico: InformeGrafico | null;
  /** Gráfico divergente de variaciones (mayores incrementos/reducciones). */
  variaciones: InformeVariacion[];
  /** Disponibilidad y cobertura para la visualización de riesgo de inventario. */
  riesgoCobertura: InformeCoberturaItem[];
  /** Resumen gerencial (<1 min): síntesis derivada de las cifras existentes. */
  resumenGerencial: string[];
  /** Matriz de prioridades y decisiones (Página 2 del documento). */
  prioridades: InformePrioridad[];
  /** Análisis complementario — solo secciones con contenido. */
  complementarias: InformeTabla[];
  /** Anexos I-III (ranking, disponibilidad y cobertura, sin ventas). */
  anexos: InformeTabla[];
  /** Anexo IV — metodología y fuentes. */
  metodologia: InformeMetodologia[];
  /** Conciliación explícita de cifras del conjunto comparado. */
  conciliacion: {
    productosAnalizados: number;
    ingresosActual: number;
    ingresosAnterior: number;
    variacion: number;
    /** Etiquetado del alcance exacto (unión de Tops, no la tienda entera). */
    alcance: string;
    /** Variación % del conjunto — null si el anterior del conjunto es 0. */
    variacionPct: number | null;
  };
}

export interface InformeInput {
  rows: ComparisonRow[];
  resumen: ComparisonResumen;
  meta: Omit<InformeMeta, 'titulo' | 'generadoEl' | 'parametros' | 'diasPeriodo'> & {
    /** Parámetros extra que la vista quiera documentar (opcional). */
    parametrosExtra?: string[];
  };
  /** Fecha de elaboración (ISO). El llamador la congela al generar. */
  generadoEl: string;
  /**
   * Evidencia REAL del mayor de inventario: product_ids con salidas por
   * venta (movement_type='sale') en el período actual. Un producto fuera
   * del Top actual CON esa evidencia tiene ventas verificables aunque el
   * agregado no informe su importe; SIN ella, su situación comercial se
   * marca «verificar» — nunca se afirma venta ni su ausencia (misma regla
   * conservadora de buildComparison, aquí en lenguaje del documento).
   */
  ventasEnPeriodoActual?: Set<string> | null;
}

// ── Evaluación de rotación y cobertura (indicadores operativos) ──────────────

export type RotacionClase = 'alta' | 'moderada' | 'baja' | 'sin_movimiento' | 'sin_base';

export const ROTACION_LABEL: Record<RotacionClase, string> = {
  alta: 'Alta rotación',
  moderada: 'Rotación moderada',
  baja: 'Baja rotación',
  sin_movimiento: 'Sin movimiento',
  sin_base: 'Sin base suficiente',
};

export interface EvaluacionRotacion {
  row: ComparisonRow;
  /** Velocidad diaria de venta (unidades de SU U.M. por día). */
  velocidad: number | null;
  velocidadTexto: string;
  /** Existencia actual declarada por el catálogo (instantánea). */
  existencia: number | null;
  /** Cobertura estimada en días: existencia / velocidad. */
  coberturaDias: number | null;
  coberturaTexto: string;
  clasificacion: RotacionClase;
  /** Alerta de disponibilidad (texto honesto; sin fechas de agotamiento). */
  alerta: string | null;
  /** Precio promedio efectivo: ingresos netos / unidades (SU U.M.). */
  precioEfectivoActual: number | null;
  precioEfectivoAnterior: number | null;
}

/** Días del tramo [desde, hasta] INCLUSIVO (base de velocidad y cobertura). */
export function diasDelPeriodo(desde: string, hasta: string): number {
  const a = new Date(`${desde}T00:00:00Z`).getTime();
  const b = new Date(`${hasta}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

const num = (n: number, dec = 2): string =>
  n.toLocaleString('es-CU', { minimumFractionDigits: 0, maximumFractionDigits: dec });

export const fmtCup = (n: number): string => formatCurrency(n);
export const fmtCupSign = (n: number): string => `${n > 0 ? '+' : n < 0 ? '-' : ''}${formatCurrency(Math.abs(n))}`;
export const fmtPctSign = (n: number): string => `${n > 0 ? '+' : n < 0 ? '-' : ''}${num(Math.abs(n), 1)}%`;

const fmtCant = (n: number, um: string | null): string =>
  `${num(n)} ${um ?? 'u'}`;

/** Fecha institucional dd/mm/aaaa. */
const fmtFecha = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

const precioEfectivo = (ventas: number, unidades: number): number | null =>
  unidades > 0 ? Math.round((ventas / unidades) * 100) / 100 : null;

/**
 * Evalúa rotación y cobertura de UNA fila con las reglas documentadas.
 * Velocidad = unidades vendidas en el tramo analizado / D días.
 * Cobertura = existencia actual / velocidad — solo si ambos existen;
 * sin ventas suficientes NO se genera cobertura ficticia.
 */
export function evaluarRotacion(row: ComparisonRow, dias: number): EvaluacionRotacion {
  // La velocidad se redondea SOLO para presentación; la cobertura se calcula
  // con la velocidad EXACTA para no propagar el error de redondeo al cociente.
  const velocidadBruta = dias > 0 && row.unidadesActuales > 0
    ? row.unidadesActuales / dias
    : null;
  const velocidad = velocidadBruta !== null
    ? Math.round(velocidadBruta * 100) / 100
    : null;

  const existencia = row.stockActual;
  const coberturaDias = velocidadBruta !== null && velocidadBruta > 0 && existencia !== null && existencia > 0
    ? Math.round((existencia / velocidadBruta) * 10) / 10
    : null;

  const velocidadTexto = velocidad !== null
    ? `${num(velocidad)} ${row.unidadMedida ?? 'u'}/día`
    : 'Sin ventas en el período analizado';

  const coberturaTexto = coberturaDias !== null
    ? `aprox. ${num(coberturaDias, 1)} días`
    : velocidad === null
      ? 'No calculable (sin ventas en el tramo)'
      : 'No calculable (sin existencia)';

  // Clasificación documentada (umbrales del encabezado; D = días del tramo).
  let clasificacion: RotacionClase;
  if (velocidad !== null) {
    if (coberturaDias === null) {
      clasificacion = 'sin_base'; // velocidad con existencia desconocida
    } else if (coberturaDias < dias * UMBRAL_COBERTURA_ALTA) {
      clasificacion = 'alta';
    } else if (coberturaDias <= dias * UMBRAL_COBERTURA_BAJA) {
      clasificacion = 'moderada';
    } else {
      clasificacion = 'baja';
    }
  } else if (existencia !== null && existencia > 0) {
    clasificacion = 'sin_movimiento';
  } else {
    clasificacion = 'sin_base';
  }

  // Alertas de disponibilidad (E) — con la evidencia disponible, sin fechas.
  const alertas: string[] = [];
  if (velocidad !== null && existencia !== null && existencia <= 0) {
    alertas.push('Existencia agotada con demanda activa en el tramo');
  }
  if (coberturaDias !== null && coberturaDias < dias * UMBRAL_COBERTURA_ALTA) {
    alertas.push('Cobertura insuficiente: la existencia no alcanza la mitad del tramo al ritmo actual');
  }
  if (
    row.minStock !== null && row.minStock > 0 && existencia !== null && existencia <= row.minStock
  ) {
    alertas.push(`Existencia en o por debajo del mínimo del catálogo (${num(row.minStock)} ${row.unidadMedida ?? 'u'})`);
  }
  const alerta = alertas.length > 0 ? alertas.join('. ') + '.' : null;

  return {
    row,
    velocidad,
    velocidadTexto,
    existencia,
    coberturaDias,
    coberturaTexto,
    clasificacion,
    alerta,
    precioEfectivoActual: precioEfectivo(row.ventasActuales, row.unidadesActuales),
    precioEfectivoAnterior: precioEfectivo(row.ventasAnteriores, row.unidadesAnteriores),
  };
}

// ── Redacción de prioridades (una por producto, la más severa primero) ────────

interface Candidata {
  nivel: PrioridadNivel;
  peso: number;             // impacto para ordenar dentro del nivel
  producto: string;
  situacion: string;
  decision: string;
}

/** Regla 1 — Caso Cemento TBV: agotado con antecedente de demanda relevante. */
function reglaAgotadoConAntecedente(r: ComparisonRow, ev: EvaluacionRotacion, dias: number): Candidata | null {
  if (!(r.ventasActuales === 0 && r.ventasAnteriores > 0 && ev.existencia !== null && ev.existencia <= 0)) return null;
  const principal = r.posAnterior !== null && r.posAnterior <= TOP_PRINCIPAL_ANTERIOR;
  return {
    nivel: 'alta',
    peso: r.ventasAnteriores,
    producto: r.name,
    situacion:
      `El producto, que ${principal ? `ocupó el puesto ${r.posAnterior} del tramo comparativo con ${fmtCant(r.unidadesAnteriores, r.unidadMedida)} y ${fmtCup(r.ventasAnteriores)} CUP` : `registró ${fmtCup(r.ventasAnteriores)} CUP en el tramo comparativo`}, no registra operaciones en el período analizado y su existencia actual es cero. La interrupción comercial es compatible con agotamiento sin reposición.` +
      (dias > 0 && r.unidadesAnteriores > 0
        ? ` Su salida histórica del tramo equivalió a ${num(Math.round((r.unidadesAnteriores / dias) * 100) / 100)} ${r.unidadMedida ?? 'u'}/día.`
        : ''),
    decision:
      'Priorizar la evaluación de reposición y estimar la cantidad de compra tomando como referencia el ritmo histórico de salida y, cuando existan, los plazos de abastecimiento y el inventario de seguridad. El importe del tramo anterior no constituye una pérdida comprobada ni una demanda no atendida cuantificada; la reposición debe orientarse a restablecer la capacidad de atender la demanda.',
  };
}

/** Regla 1-bis — agotado con antecedente pero existencia desconocida (datos). */
function reglaInterrupcionSinDatoStock(r: ComparisonRow, _ev: EvaluacionRotacion): Candidata | null {
  if (!(r.ventasActuales === 0 && r.ventasAnteriores > 0 && r.stockActual === null)) return null;
  return {
    nivel: 'media',
    peso: r.ventasAnteriores,
    producto: r.name,
    situacion:
      `Registró ${fmtCup(r.ventasAnteriores)} CUP en el tramo comparativo y no registra operaciones en el período analizado. El catálogo no informa su existencia actual, por lo que la causa no puede determinarse con la evidencia disponible.`,
    decision:
      'Verificar la existencia física y las reposiciones del producto en el almacén antes de decidir. Si el quiebre se confirma, tramitar el abastecimiento; si hay existencia sin salida, revisar demanda, precio y visibilidad.',
  };
}

/** Regla 2 — cobertura por debajo de la mitad del tramo (Caso Royal Cole). */
function reglaCobertura(r: ComparisonRow, ev: EvaluacionRotacion, dias: number): Candidata | null {
  if (ev.velocidad === null || ev.coberturaDias === null) return null;
  if (ev.coberturaDias >= dias * UMBRAL_COBERTURA_ALTA) return null;
  if (r.ventasActuales <= 0) return null;
  const conAgotado = ev.existencia !== null && ev.existencia <= 0;
  if (conAgotado) return null; // ya cubierto por la regla 1 (más severa)
  return {
    nivel: 'alta',
    peso: r.ventasActuales,
    producto: r.name,
    situacion:
      `La demanda del período equivale a ${num(ev.velocidad)} ${r.unidadMedida ?? 'u'}/día y la existencia actual (${fmtCant(ev.existencia ?? 0, r.unidadMedida)}) cubre aproximadamente ${num(ev.coberturaDias, 1)} días — menos de la mitad del tramo analizado (${dias} días).` +
      (r.difCup > 0 ? ` El producto además creció ${fmtCupSign(r.difCup)} CUP frente al tramo comparativo.` : ''),
    decision:
      'Evaluar la reposición anticipada y dimensionar la compra contra el ritmo de salida vigente. La cobertura es una estimación operativa con la existencia instantánea; contrastar con los programas de entrega antes de fijar la cantidad.',
  };
}

/** Regla 3 — Caso Cemento Blanco: contracción fuerte con existencia disponible. */
function reglaContraccionConStock(r: ComparisonRow, ev: EvaluacionRotacion): Candidata | null {
  if (!(r.varPct !== null && r.varPct <= -CAIDA_FUERTE_PCT && ev.existencia !== null && ev.existencia > 0)) return null;
  return {
    nivel: 'media',
    peso: Math.abs(r.difCup),
    producto: r.name,
    situacion:
      `El producto contrae sus ingresos ${fmtPctSign(r.varPct)} (${fmtCupSign(r.difCup)} CUP) y sus unidades pasan de ${fmtCant(r.unidadesAnteriores, r.unidadMedida)} a ${fmtCant(r.unidadesActuales, r.unidadMedida)}, manteniendo una existencia de ${fmtCant(ev.existencia, r.unidadMedida)}.` +
      (ev.coberturaDias !== null ? ` La cobertura estimada es de ${num(ev.coberturaDias, 1)} días al ritmo actual.` : ''),
    decision:
      'Revisar la velocidad de salida, la cobertura y el comportamiento comercial del producto antes de autorizar nuevas compras. Con la demanda en contracción y existencia disponible, no procede aumentar inventario: evaluar acciones de comercialización o un ajuste del abastecimiento.',
  };
}

/** Regla 4 — Caso Cable Solar: ingresos al alza con unidades a la baja. */
function reglaPrecioComposicion(r: ComparisonRow, ev: EvaluacionRotacion): Candidata | null {
  if (!(r.difCup > 0 && r.unidadesAnteriores > 0 && r.unidadesActuales < r.unidadesAnteriores)) return null;
  const pa = ev.precioEfectivoAnterior;
  const pc = ev.precioEfectivoActual;
  const pTxt = pa !== null && pc !== null
    ? `El ingreso por unidad pasó de ${fmtCup(pa)} a ${fmtCup(pc)} ${r.unidadMedida ?? 'u'}`
    : '';
  return {
    nivel: 'media',
    peso: r.difCup,
    producto: r.name,
    situacion:
      `Los ingresos aumentan ${fmtCupSign(r.difCup)} CUP mientras las unidades vendidas disminuyen de ${fmtCant(r.unidadesAnteriores, r.unidadMedida)} a ${fmtCant(r.unidadesActuales, r.unidadMedida)}. ${pTxt}` +
      (pTxt ? '' : '.'),
    decision:
      'Revisar el precio promedio efectivo y la composición de las operaciones (variantes, tamaños o condiciones de venta) antes de atribuir el resultado a mayor demanda. El movimiento es compatible con un cambio de precio o de mix; la verificación definirá si sostiene la proyección de compras.',
  };
}

/** Regla 5 — Caso Inversor: liderazgo originado en una operación aislada. */
function reglaOperacionAislada(r: ComparisonRow, ev: EvaluacionRotacion, dias: number): Candidata | null {
  const nuevoOPrincipal = r.posActual !== null && r.posActual <= 3;
  if (!(nuevoOPrincipal && r.ventasAnteriores === 0 && r.ventasActuales > 0 && r.unidadesActuales <= 2)) return null;
  const velocidadTxt = ev.velocidad !== null ? `${num(ev.velocidad)} ${r.unidadMedida ?? 'u'}/día` : 's/d';
  return {
    nivel: 'preventiva',
    peso: r.ventasActuales,
    producto: r.name,
    situacion:
      `El producto ocupa el puesto ${r.posActual} del ranking por ingresos (${fmtCup(r.ventasActuales)} CUP), pero ese liderazgo proviene de ${r.unidadesActuales === 1 ? 'una sola operación' : `apenas ${num(r.unidadesActuales)} operaciones`} (${velocidadTxt} en el tramo). No existe base comparable en el período anterior.` +
      (ev.existencia !== null && ev.existencia <= 0 ? ' La existencia actual es cero, lo que justifica una alerta de disponibilidad.' : ''),
    decision:
      'Verificar la naturaleza de la operación, su abastecimiento y la probabilidad de repetición de la demanda antes de establecer una política de compra. El liderazgo en facturación no equivale a rotación alta ni a demanda recurrente; la existencia cero amerita alerta de disponibilidad, no una reposición masiva.',
  };
}

/** Regla 6 — baja rotación con existencia acumulada (F). */
function reglaBajaRotacion(r: ComparisonRow, ev: EvaluacionRotacion, dias: number): Candidata | null {
  const acumulaPorCobertura = ev.coberturaDias !== null && ev.coberturaDias > dias * UMBRAL_COBERTURA_BAJA && ev.existencia !== null && ev.existencia > 0;
  const sinSalida = ev.velocidad === null && ev.existencia !== null && ev.existencia > 0;
  if (!acumulaPorCobertura && !sinSalida) return null;
  const caidaTxt = r.varPct !== null && r.varPct < 0 ? fmtPctSign(r.varPct) : null;
  return {
    nivel: 'preventiva',
    peso: -(ev.existencia ?? 0), // mayor existencia primero
    producto: r.name,
    situacion:
      sinSalida
        ? `El producto mantiene ${fmtCant(ev.existencia ?? 0, r.unidadMedida)} en existencia sin registrar salidas por venta en el tramo analizado` +
          (caidaTxt ? `, tras una contracción de ${caidaTxt} frente al tramo comparativo.` : '.')
        : `La existencia (${fmtCant(ev.existencia ?? 0, r.unidadMedida)}) supera el consumo estimado de un tramo completo al ritmo actual: cobertura de ${num(ev.coberturaDias ?? 0, 1)} días para ${dias} días de análisis` +
          (caidaTxt ? `, con ventas en contracción (${caidaTxt}).` : '.'),
    decision:
      'Revisar el plan de compras y los niveles de inventario del producto; evaluar acciones de comercialización para acelerar su salida. El stock sin demanda equivalente inmoviliza capital y espacio de almacén.',
  };
}

/** Regla 7 — descenso moderado fuera de umbrales pero visible en el Top. */
function reglaDescensoTop(r: ComparisonRow, ev: EvaluacionRotacion): Candidata | null {
  if (!(r.varPct !== null && r.varPct < -20 && r.varPct > -CAIDA_FUERTE_PCT && r.posActual !== null && r.posActual <= 10)) return null;
  return {
    nivel: 'preventiva',
    peso: Math.abs(r.difCup),
    producto: r.name,
    situacion:
      `El producto desciende ${fmtPctSign(r.varPct)} (${fmtCupSign(r.difCup)} CUP) y mantiene el puesto ${r.posActual} del ranking.` +
      (ev.coberturaDias !== null ? ` Cobertura estimada: ${num(ev.coberturaDias, 1)} días.` : ''),
    decision:
      'Incorporar el producto al seguimiento del próximo ciclo: contrastar precio, disponibilidad y competencia interna del catálogo antes de ajustar compras.',
  };
}

// ── Constructor del documento ────────────────────────────────────────────────

export function buildInformeEjecutivo(input: InformeInput): InformeEjecutivo {
  const { rows, resumen, generadoEl, ventasEnPeriodoActual } = input;
  const { meta } = input;

  const dias = diasDelPeriodo(meta.periodoActual.desde, meta.periodoActual.hasta);
  const diasAnterior = diasDelPeriodo(meta.periodoComparacion.desde, meta.periodoComparacion.hasta);
  const evaluaciones = rows.map((r) => evaluarRotacion(r, dias));

  // ── Conciliación del conjunto comparado (metodología explícita) ──
  const ingresosActual = Math.round(rows.reduce((s, r) => s + r.ventasActuales, 0) * 100) / 100;
  const ingresosAnterior = Math.round(rows.reduce((s, r) => s + r.ventasAnteriores, 0) * 100) / 100;
  const variacion = Math.round((ingresosActual - ingresosAnterior) * 100) / 100;
  const variacionPct = ingresosAnterior > 0 ? Math.round((variacion / ingresosAnterior) * 1000) / 10 : null;
  const alcance =
    `unión del Top ${rows.filter((r) => r.posActual !== null).length} del período analizado y el Top ${rows.filter((r) => r.posAnterior !== null).length} del tramo comparable (${rows.length} productos)`;

  // ── Clasificaciones operativas ──
  const conPosicion = rows.filter((r) => r.posActual !== null);
  const crecen = rows.filter((r) => r.difCup > 0);
  const contraen = rows.filter((r) => r.difCup < 0);
  const crecimientoRelevante = rows.filter((r) => r.varPct !== null && r.varPct >= UMBRAL_CRECIMIENTO_RELEVANTE);
  const contraccionRelevante = rows.filter((r) => r.varPct !== null && r.varPct <= -UMBRAL_CRECIMIENTO_RELEVANTE);
  const dejaron = rows.filter((r) => r.evolucion === 'dejo_de_venderse');
  const nuevos = rows.filter((r) => r.evolucion === 'nuevo');
  const salieron = rows.filter((r) => r.evolucion === 'sale_del_top');

  // Disponibilidad (con la existencia del catálogo y la evidencia del mayor)
  const agotadosConAntecedente = rows.filter(
    (r) => r.ventasActuales === 0 && r.ventasAnteriores > 0 && r.stockActual !== null && r.stockActual <= 0,
  );
  const coberturaInsuficiente = evaluaciones.filter(
    (e) => e.velocidad !== null && e.coberturaDias !== null && e.coberturaDias < dias * UMBRAL_COBERTURA_ALTA && e.row.ventasActuales > 0,
  );
  const bajaRotacion = evaluaciones.filter((e) => {
    if (e.clasificacion !== 'baja' && e.clasificacion !== 'sin_movimiento') return false;
    return e.existencia !== null && e.existencia > 0;
  });

  const lider = conPosicion.find((r) => r.posActual === 1) ?? null;
  const participacionLider = lider?.participacionActual ?? null;
  const liderEvaluacion = lider ? evaluaciones.find((e) => e.row.productId === lider.productId) ?? null : null;

  // ── 1. DIAGNÓSTICO: situación general ──
  const situacionGeneral: string[] = [];
  situacionGeneral.push(
    `El análisis compara ${rows.length} productos del ranking comercial —${alcance}— entre el ${fmtFecha(meta.periodoActual.desde)} y el ${fmtFecha(meta.periodoActual.hasta)} (${dias} días), contra el tramo equivalente del ${fmtFecha(meta.periodoComparacion.desde)} al ${fmtFecha(meta.periodoComparacion.hasta)} (${diasAnterior} días). Los ingresos del conjunto comparado ascienden a ${fmtCup(ingresosActual)} CUP en el período analizado y a ${fmtCup(ingresosAnterior)} CUP en el tramo comparable: una variación de ${fmtCupSign(variacion)} CUP` +
      (variacionPct !== null ? ` (${fmtPctSign(variacionPct)})` : '') +
      ', calculada exclusivamente sobre los productos incluidos en ambos cortes (Anexo IV).',
  );
  if (lider) {
    const liderTxt = participacionLider !== null
      ? `${fmtCup(lider.ventasActuales)} CUP y una participación oficial de ${num(participacionLider)}% de las ventas del período`
      : `${fmtCup(lider.ventasActuales)} CUP`;
    if (resumen.cambioLider) {
      situacionGeneral.push(`El liderazgo comercial cambió de manos: ${resumen.cambioLider}. El primer producto del ranking actual —${lider.name}— registra ${liderTxt}.` +
        (liderEvaluacion?.velocidad !== null && liderEvaluacion && liderEvaluacion.row.unidadesActuales <= 2
          ? ' Se trata de un liderazgo sustentado en un número reducido de operaciones, que requiere verificación antes de traducirse en decisiones de compra.'
          : ''));
    } else {
      situacionGeneral.push(`${lider.name} mantiene el liderazgo del ranking con ${liderTxt}.`);
    }
  }
  situacionGeneral.push(
    `${crecen.length} producto${crecen.length !== 1 ? 's' : ''} ${crecen.length !== 1 ? 'aumentan' : 'aumenta'} sus ingresos y ${contraen.length} ${contraen.length !== 1 ? 'los reducen' : 'lo reduce'} dentro del conjunto comparado; ${crecimientoRelevante.length} ${crecimientoRelevante.length !== 1 ? 'crecen' : 'crece'} con variación relevante (+${UMBRAL_CRECIMIENTO_RELEVANTE}% o más) y ${contraccionRelevante.length} ${contraccionRelevante.length !== 1 ? 'se contraen' : 'se contrae'} en la misma magnitud. ${nuevos.length} producto${nuevos.length !== 1 ? 's entran' : ' entra'} al ranking sin ventas comparables en el tramo anterior y ${dejaron.length} ${dejaron.length !== 1 ? 'dejan' : 'deja'} de registrar salidas por venta según el mayor de inventario.`,
  );
  if (agotadosConAntecedente.length > 0 || coberturaInsuficiente.length > 0 || bajaRotacion.length > 0) {
    const partesDisp: string[] = [];
    if (agotadosConAntecedente.length > 0) {
      partesDisp.push(
        `${agotadosConAntecedente.length} producto${agotadosConAntecedente.length !== 1 ? 's' : ''} con antecedentes de ventas relevantes se encuentra${agotadosConAntecedente.length !== 1 ? 'n' : ''} sin existencia y sin operaciones`,
      );
    }
    if (coberturaInsuficiente.length > 0) {
      partesDisp.push(`${coberturaInsuficiente.length} con cobertura estimada inferior a la mitad del tramo`);
    }
    if (bajaRotacion.length > 0) {
      partesDisp.push(`${bajaRotacion.length} con existencia que ${bajaRotacion.length !== 1 ? 'supera' : 'supera'} el ritmo de salida (baja rotación)`);
    }
    situacionGeneral.push(
      `En disponibilidad: ${partesDisp.join('; ')}. La existencia reportada es la instantánea del catálogo del almacén de la tienda; la cobertura es una estimación operativa sobre ese dato y no incorpora plazos de reposición, que el sistema no parametriza.`,
    );
  }

  // Conclusión gerencial central = la prioridad ALTA de mayor impacto.
  const prioridadesCandidatas: Candidata[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const ev = evaluaciones[i];
    for (const regla of [
      () => reglaAgotadoConAntecedente(r, ev, dias),
      () => reglaCobertura(r, ev, dias),
      () => reglaContraccionConStock(r, ev),
      () => reglaPrecioComposicion(r, ev),
      () => reglaOperacionAislada(r, ev, dias),
      () => reglaBajaRotacion(r, ev, dias),
      () => reglaDescensoTop(r, ev),
      () => reglaInterrupcionSinDatoStock(r, ev),
    ]) {
      const c = regla();
      if (c) {
        prioridadesCandidatas.push(c);
        break; // un producto, su situación más severa (orden de reglas = severidad)
      }
    }
  }
  const nivelRank: Record<PrioridadNivel, number> = { alta: 0, media: 1, preventiva: 2 };
  const prioridades: InformePrioridad[] = [...prioridadesCandidatas]
    .sort((a, b) => nivelRank[a.nivel] - nivelRank[b.nivel] || b.peso - a.peso)
    .slice(0, MATRIZ_MAX_FILAS)
    .map((c) => ({ nivel: c.nivel, producto: c.producto, situacion: c.situacion, decision: c.decision }));

  const conclusionGerencial = prioridades[0]
    ? `La decisión más urgente que este informe pone sobre la mesa es la de ${prioridades[0].producto}: ${prioridades[0].decision.split('. ')[0]}.`
    : `El conjunto comparado opera sin desviaciones que superen los umbrales de revisión; el ciclo comercial del período no exige decisiones de reposición o de abastecimiento fuera del seguimiento habitual.`;

  // ── 1.bis. Resumen gerencial (<1 min) — ADN-ANALISIS-…-PDF-001 §3 ──
  // Síntesis DERIVADA exclusivamente de las variables ya calculadas arriba
  // (ingresosActual/Anterior, variacion, variacionPct, lider, crecen/contraen,
  // agotadosConAntecedente, coberturaInsuficiente, prioridades): cero cálculos
  // ni reglas nuevas.
  const resumenGerencial: string[] = [
    `El conjunto comparado facturó ${fmtCup(ingresosActual)} CUP en el período analizado: ${fmtCupSign(variacion)} CUP${variacionPct !== null ? ` (${fmtPctSign(variacionPct)})` : ''} frente al tramo comparable, medido sobre ${rows.length} productos de la unión de ambos cortes.` +
      (variacion < 0
        ? ' El descenso corresponde al conjunto comparado y no certifica una caída de todas las ventas de la tienda: el alcance exacto se declara en el Anexo IV.'
        : ''),
    lider ? `El producto líder del período es ${lider.name}${participacionLider !== null ? `, con ${num(participacionLider)}% de participación oficial` : ''}.` : '',
    `Movimiento del ranking: ${crecen.length} producto${crecen.length !== 1 ? 's crecen' : ' crece'} y ${contraen.length} ${contraen.length !== 1 ? 'se contraen' : 'se contrae'}; ${nuevos.length} ${nuevos.length !== 1 ? 'entran' : 'entra'} nuevos sin base comparable y ${dejaron.length} ${dejaron.length !== 1 ? 'dejan' : 'deja'} de registrar salidas.`,
    agotadosConAntecedente.length + coberturaInsuficiente.length > 0
      ? `Disponibilidad: ${agotadosConAntecedente.length} agotado${agotadosConAntecedente.length !== 1 ? 's' : ''} con antecedente comercial y ${coberturaInsuficiente.length} con cobertura insuficiente — atención inmediata para evitar interrupciones.`
      : 'Disponibilidad sin alertas que superen los umbrales del informe.',
    conclusionGerencial,
  ].filter((s) => s.length > 0);

  // ── Gráfico divergente de variaciones — ADN-ANALISIS-…-PDF-001 §4.B ──
  // DERIVADO de los campos ya calculados por buildComparison (difCup/varPct/
  // evolucion): mayores incrementos y mayores reducciones por valor absoluto;
  // los «nuevos» se marcan y NO reciben porcentaje ficticio (sin base).
  const VARIACION_MAX_LADOS = 7;
  const conDif = rows.filter((r) => r.difCup !== 0);
  const subidas = conDif.filter((r) => r.difCup > 0).sort((a, b) => b.difCup - a.difCup).slice(0, VARIACION_MAX_LADOS);
  const bajadas = conDif.filter((r) => r.difCup < 0).sort((a, b) => a.difCup - b.difCup).slice(0, VARIACION_MAX_LADOS);
  const variaciones: InformeVariacion[] = [
    ...subidas.map((r) => ({ name: r.name, difCup: r.difCup, varPct: r.varPct, esNuevo: r.evolucion === 'nuevo' })),
    ...bajadas.map((r) => ({ name: r.name, difCup: r.difCup, varPct: r.varPct, esNuevo: r.evolucion === 'nuevo' })),
  ];

  // ── Disponibilidad y cobertura para visualización — §4.C ──
  // DERIVADO de evaluarRotacion (MISMOS umbrales): agotado (sin existencia con
  // demanda activa o con antecedente comercial), cobertura_insuficiente (< D/2),
  // cobertura_moderada (D/2..D), baja_rotacion (> D o sin salidas con stock).
  const riesgoCobertura: InformeCoberturaItem[] = [];
  for (const r of rows) {
    const ev = evaluaciones.find((e) => e.row.productId === r.productId);
    if (!ev) continue;
    const agotadoConDemanda = ev.velocidad !== null && ev.existencia !== null && ev.existencia <= 0;
    const agotadoConAntecedente = r.ventasActuales === 0 && r.ventasAnteriores > 0 && ev.existencia !== null && ev.existencia <= 0;
    if (agotadoConDemanda || agotadoConAntecedente) {
      riesgoCobertura.push({ name: r.name, estado: 'agotado', coberturaDias: null, coberturaTexto: ev.coberturaTexto });
      continue;
    }
    if (ev.velocidad !== null && ev.coberturaDias !== null && ev.row.ventasActuales > 0) {
      if (ev.coberturaDias < dias * UMBRAL_COBERTURA_ALTA) {
        riesgoCobertura.push({ name: r.name, estado: 'cobertura_insuficiente', coberturaDias: ev.coberturaDias, coberturaTexto: ev.coberturaTexto });
      } else if (ev.coberturaDias <= dias * UMBRAL_COBERTURA_BAJA) {
        riesgoCobertura.push({ name: r.name, estado: 'cobertura_moderada', coberturaDias: ev.coberturaDias, coberturaTexto: ev.coberturaTexto });
      } else {
        riesgoCobertura.push({ name: r.name, estado: 'baja_rotacion', coberturaDias: ev.coberturaDias, coberturaTexto: ev.coberturaTexto });
      }
      continue;
    }
    if (ev.clasificacion === 'sin_movimiento') {
      riesgoCobertura.push({ name: r.name, estado: 'sin_movimiento', coberturaDias: null, coberturaTexto: ev.coberturaTexto });
      continue;
    }
    riesgoCobertura.push({ name: r.name, estado: 'sin_dato', coberturaDias: null, coberturaTexto: ev.coberturaTexto });
  }

  // ── 2. Indicadores relevantes ──
  const indicadores: InformeIndicador[] = [
    { label: 'Ingresos del conjunto comparado', value: `${fmtCup(ingresosActual)} CUP` },
    {
      label: 'Variación vs. tramo comparable',
      value: `${fmtCupSign(variacion)} CUP` + (variacionPct !== null ? ` (${fmtPctSign(variacionPct)})` : ''),
    },
    { label: 'Productos con crecimiento relevante (+50% o más)', value: String(crecimientoRelevante.length) },
    { label: 'Productos con contracción (-50% o más)', value: String(contraccionRelevante.length) },
    { label: 'Productos sin ventas en el tramo (con antecedente)', value: String(dejaron.length) },
    { label: 'Agotados con antecedentes de ventas', value: String(agotadosConAntecedente.length) },
  ];
  if (coberturaInsuficiente.length > 0) {
    indicadores.push({ label: 'Con cobertura estimada insuficiente', value: String(coberturaInsuficiente.length) });
  }
  if (participacionLider !== null && lider) {
    indicadores.push({ label: 'Lider del período', value: `${lider.name} — ${num(participacionLider)}% de participación` });
  }

  // ── 3. Gráfico ejecutivo: comparación de ingresos por producto principal ──
  const topGrafico = [...rows]
    .sort((a, b) => Math.max(b.ventasActuales, b.ventasAnteriores) - Math.max(a.ventasActuales, a.ventasAnteriores))
    .slice(0, GRAFICO_MAX_PRODUCTOS)
    .filter((r) => r.ventasActuales > 0 || r.ventasAnteriores > 0);
  const grafico: InformeGrafico | null = topGrafico.length >= 2
    ? {
        titulo: 'Ingresos por producto: tramo comparable vs. período analizado (CUP)',
        nota: 'Productos de mayor impacto (unión de ambos cortes). Las cifras son las del agregado oficial por producto; el alcance del conjunto se concilia en el Anexo IV.',
        series: topGrafico.map((r) => ({ name: r.name, anterior: r.ventasAnteriores, actual: r.ventasActuales })),
      }
    : null;

  // ── 4. Análisis complementario (solo secciones con contenido) ──
  const complementarias: InformeTabla[] = [];

  const principales = [...conPosicion].sort((a, b) => b.ventasActuales - a.ventasActuales).slice(0, 10);
  if (principales.length > 0) {
    complementarias.push({
      titulo: 'Evolución de los productos principales',
      columnas: ['Producto', 'Pos. ant.', 'Pos. act.', 'Ventas ant. (CUP)', 'Ventas act. (CUP)', 'Variación', 'Existencia'],
      filas: principales.map((r) => {
        const ev = evaluaciones.find((e) => e.row.productId === r.productId)!;
        return [
          r.name,
          r.posAnterior === null ? '—' : String(r.posAnterior),
          String(r.posActual ?? '—'),
          fmtCup(r.ventasAnteriores),
          fmtCup(r.ventasActuales),
          r.varPct === null ? 'sin base' : `${fmtPctSign(r.varPct)} (${fmtCupSign(r.difCup)})`,
          ev.existencia === null ? 'N/D' : fmtCant(ev.existencia, r.unidadMedida),
        ];
      }),
      nota: 'Los diez primeros productos por ingresos del período analizado, con su existencia actual.',
    });
  }

  if (agotadosConAntecedente.length > 0) {
    complementarias.push({
      titulo: 'Productos agotados con demanda interrumpida',
      columnas: ['Producto', 'Pos. ant.', 'Ventas tramo anterior', 'Cant. anterior', 'Existencia actual', 'Lectura operativa'],
      anchos: [0.17, 0.07, 0.14, 0.11, 0.13, 0.38],
      alineaciones: ['left', 'center', 'right', 'right', 'right', 'left'],
      filas: agotadosConAntecedente
        .sort((a, b) => b.ventasAnteriores - a.ventasAnteriores)
        .map((r) => [
          r.name,
          r.posAnterior === null ? '—' : String(r.posAnterior),
          fmtCup(r.ventasAnteriores),
          fmtCant(r.unidadesAnteriores, r.unidadMedida),
          fmtCant(0, r.unidadMedida),
          'Agotado sin reposición — interrupción compatible con falta de disponibilidad; el importe anterior no es pérdida cuantificada',
        ]),
    });
  }

  if (coberturaInsuficiente.length > 0) {
    complementarias.push({
      titulo: 'Productos con riesgo de desabastecimiento',
      columnas: ['Producto', 'Velocidad', 'Existencia', 'Cobertura estimada', 'Clasificación'],
      filas: coberturaInsuficiente
        .sort((a, b) => (a.coberturaDias ?? 0) - (b.coberturaDias ?? 0))
        .map((e) => [
          e.row.name,
          e.velocidadTexto,
          fmtCant(e.existencia ?? 0, e.row.unidadMedida),
          e.coberturaTexto,
          ROTACION_LABEL[e.clasificacion],
        ]),
      nota: 'Alertas de disponibilidad sobre la existencia instantánea: el sistema no parametriza plazos de reposición ni inventario de seguridad, por lo que no se fijan fechas de agotamiento.',
    });
  }

  const bajaTabla = bajaRotacion
    .sort((a, b) => (b.existencia ?? 0) - (a.existencia ?? 0))
    .slice(0, 15);
  if (bajaTabla.length > 0) {
    complementarias.push({
      titulo: 'Productos de baja rotación',
      columnas: ['Producto', 'Existencia', 'Velocidad', 'Cobertura', 'Situación'],
      anchos: [0.20, 0.12, 0.16, 0.14, 0.38],
      alineaciones: ['left', 'right', 'right', 'right', 'left'],
      filas: bajaTabla.map((e) => [
        e.row.name,
        fmtCant(e.existencia ?? 0, e.row.unidadMedida),
        e.velocidadTexto,
        e.coberturaTexto,
        e.clasificacion === 'sin_movimiento' ? 'Sin salidas en el tramo' : 'Consumo inferior a un tramo completo',
      ]),
      nota: 'Existencias cuya salida estimada no las consume en el tramo analizado: candidatas a revisión de compras y comercialización. La rotación financiera (costo de ventas sobre existencia promedio) no es calculable con las fuentes disponibles.',
    });
  }

  if (nuevos.length > 0) {
    complementarias.push({
      titulo: 'Productos nuevos o emergentes en el ranking',
      columnas: ['Producto', 'Pos.', 'Ventas (CUP)', 'Cantidad', 'Existencia', 'Lectura'],
      anchos: [0.18, 0.06, 0.13, 0.13, 0.13, 0.37],
      alineaciones: ['left', 'center', 'right', 'right', 'right', 'left'],
      filas: [...nuevos]
        .sort((a, b) => (a.posActual ?? 99) - (b.posActual ?? 99))
        .map((r) => {
          const ev = evaluaciones.find((e) => e.row.productId === r.productId)!;
          const aislado = r.unidadesActuales <= 2;
          return [
            r.name,
            String(r.posActual ?? '—'),
            fmtCup(r.ventasActuales),
            fmtCant(r.unidadesActuales, r.unidadMedida),
            ev.existencia === null ? 'N/D' : fmtCant(ev.existencia, r.unidadMedida),
            aislado
              ? 'Operación aislada o de bajo volumen: verificar repetibilidad antes de decisiones de compra'
              : 'Entrada con volumen: seguir en el próximo ciclo antes de fijar política de compra',
          ];
        }),
      nota: '«Nuevo en el ranking» certifica ausencia de ventas comparables en el tramo anterior, no la fecha de alta en el catálogo.',
    });
  }

  if (salieron.length > 0) {
    complementarias.push({
      titulo: 'Productos fuera del Top analizado',
      columnas: ['Producto', 'Pos. ant.', 'Estado respecto al período actual', 'Existencia', 'Lectura'],
      anchos: [0.17, 0.08, 0.34, 0.12, 0.29],
      alineaciones: ['left', 'center', 'left', 'right', 'left'],
      filas: [...salieron]
        .sort((a, b) => (a.posAnterior ?? 99) - (b.posAnterior ?? 99))
        .map((r) => {
          const ev = evaluaciones.find((e) => e.row.productId === r.productId)!;
          const conEvidencia = ventasEnPeriodoActual?.has(r.productId) ?? false;
          return [
            r.name,
            r.posAnterior === null ? '—' : String(r.posAnterior),
            conEvidencia
              ? 'El mayor de inventario registra salidas por venta; su importe no figura en el Top 20 por ingresos'
              : 'Sin evidencia de ventas en el mayor del tramo: verificar antes de cualquier conclusión',
            ev.existencia === null ? 'N/D' : fmtCant(ev.existencia, r.unidadMedida),
            conEvidencia
              ? 'Demanda vigente fuera del recorte del Top'
              : 'Situación comercial por verificar (no se afirma venta ni su ausencia)',
          ];
        }),
      nota: 'Estos productos NO se cuentan como «sin ventas»: el agregado oficial no informa su importe por estar fuera del corte.',
    });
  }

  if (dejaron.length > 0) {
    complementarias.push({
      titulo: 'Productos que dejaron de venderse',
      columnas: ['Producto', 'Pos. ant.', 'Ventas tramo anterior', 'Cant. anterior', 'Existencia', 'Lectura operativa'],
      anchos: [0.17, 0.07, 0.14, 0.11, 0.13, 0.38],
      alineaciones: ['left', 'center', 'right', 'right', 'right', 'left'],
      filas: [...dejaron]
        .sort((a, b) => b.ventasAnteriores - a.ventasAnteriores)
        .map((r) => {
          const ev = evaluaciones.find((e) => e.row.productId === r.productId)!;
          const conStock = ev.existencia !== null && ev.existencia > 0;
          return [
            r.name,
            r.posAnterior === null ? '—' : String(r.posAnterior),
            fmtCup(r.ventasAnteriores),
            fmtCant(r.unidadesAnteriores, r.unidadMedida),
            ev.existencia === null ? 'N/D' : fmtCant(ev.existencia, r.unidadMedida),
            conStock
              ? 'Con existencia disponible y sin salidas: revisar demanda, precio y visibilidad'
              : 'Sin existencia: la interrupción es compatible con agotamiento sin reposición',
          ];
        }),
      nota: 'Solo productos cuya ausencia de salidas por venta está evidenciada en el mayor de inventario del tramo analizado.',
    });
  }

  // ── Anexo I: ranking comparativo completo ──
  const anexoI: InformeTabla = {
    titulo: 'Anexo I. Ranking comparativo completo',
    intro:
      'Productos de la unión de ambos cortes del Top, ordenados por su posición en el período analizado. Cada cantidad se presenta en la unidad de medida propia del producto.',
    columnas: ['Código', 'Descripción', 'Pos. ant.', 'Pos. act.', 'Ventas ant. (CUP)', 'Ventas act. (CUP)', 'Variación CUP', 'Variación %', 'Cant. ant.', 'Cant. act.'],
    filas: [...rows]
      .sort((a, b) => (a.posActual ?? 99) - (b.posActual ?? 99) || (a.posAnterior ?? 99) - (b.posAnterior ?? 99))
      .map((r) => [
        r.sku ?? '—',
        r.name,
        r.posAnterior === null ? '—' : String(r.posAnterior),
        r.posActual === null ? '—' : String(r.posActual),
        fmtCup(r.ventasAnteriores),
        fmtCup(r.ventasActuales),
        fmtCupSign(r.difCup),
        r.varPct === null ? 'sin base' : fmtPctSign(r.varPct),
        fmtCant(r.unidadesAnteriores, r.unidadMedida),
        fmtCant(r.unidadesActuales, r.unidadMedida),
      ]),
  };

  // ── Anexo II: disponibilidad y cobertura ──
  const anexoII: InformeTabla = {
    titulo: 'Anexo II. Disponibilidad y cobertura',
    intro:
      `Existencia actual del almacén de la tienda activa y estimación operativa de cobertura a partir de la velocidad de venta del tramo (${dias} días). Umbrales de clasificación documentados en el Anexo IV.`,
    columnas: ['Descripción', 'Existencia', 'Velocidad', 'Cobertura estimada', 'Clasificación', 'Alerta de disponibilidad'],
    filas: evaluaciones
      .slice()
      .sort((a, b) => (a.coberturaDias ?? Number.POSITIVE_INFINITY) - (b.coberturaDias ?? Number.POSITIVE_INFINITY))
      .map((e) => [
        e.row.name,
        e.existencia === null ? 'N/D' : fmtCant(e.existencia, e.row.unidadMedida),
        e.velocidadTexto,
        e.coberturaTexto,
        ROTACION_LABEL[e.clasificacion],
        e.alerta ?? '—',
      ]),
  };

  // ── Anexo III: productos sin ventas (SOLO con evidencia del mayor) ──
  const sinVentasFilas = dejaron.map((r) => {
    const ev = evaluaciones.find((e) => e.row.productId === r.productId)!;
    const conStock = ev.existencia !== null && ev.existencia > 0;
    return [
      r.name,
      `${fmtFecha(meta.periodoComparacion.desde)} a ${fmtFecha(meta.periodoComparacion.hasta)}`,
      fmtCup(r.ventasAnteriores),
      fmtCant(r.unidadesAnteriores, r.unidadMedida),
      ev.existencia === null ? 'N/D' : fmtCant(ev.existencia, r.unidadMedida),
      conStock
        ? 'Mantiene existencia sin registrar salidas: causa no determinada — revisar demanda, precio, exhibición y competencia interna del catálogo'
        : 'Sin existencia al cierre: compatible con agotamiento sin reposición — revisar el abastecimiento y la reposición del producto',
    ];
  });
  const anexoIII: InformeTabla = {
    titulo: 'Anexo III. Productos sin ventas en el período analizado',
    intro:
      'Productos que registraron ventas en el tramo comparable y cuya ausencia de salidas por venta en el período analizado está evidenciada en el mayor de inventario. Los productos fuera del Top con ventas no evidenciadas NO se incluyen aquí (ver Análisis complementario).',
    columnas: ['Producto', 'Último tramo con ventas', 'Ventas anteriores (CUP)', 'Cant. anterior', 'Existencia actual', 'Interpretación operativa'],
    filas: sinVentasFilas,
  };

  // ── Anexo IV: metodología y fuentes ──
  const metodologia: InformeMetodologia[] = [
    {
      titulo: 'Fuente de datos',
      parrafos: [
        'Ventas por producto: agregado oficial get_sales_dashboard_analytics en dos llamadas (período analizado y tramo comparable), valoración canónica del sistema — CUP contable a la tasa de cada venta, neto de descuentos y de devoluciones; operaciones anuladas y borradores excluidos por el propio agregado.',
        'Existencias, unidad de medida y existencia mínima: catálogo oficial de productos de la tienda activa (instantánea al momento de la elaboración).',
        'Evidencia de ventas fuera del Top y ausencia de salidas: mayor de inventario (stock_movements, salidas por venta del tramo analizado), con aislamiento por tienda garantizado por RLS.',
      ],
    },
    {
      titulo: 'Períodos y criterios de comparación',
      parrafos: [
        `Período analizado: ${fmtFecha(meta.periodoActual.desde)} a ${fmtFecha(meta.periodoActual.hasta)} (${dias} días). Tramo comparable: ${fmtFecha(meta.periodoComparacion.desde)} a ${fmtFecha(meta.periodoComparacion.hasta)} (${diasAnterior} días) — misma longitud del mes anterior.`,
        `El conjunto comparado es la ${alcance}. Un líder del tramo anterior con ventas cero permanece visible en el análisis.`,
        `Variación del conjunto: ${fmtCupSign(variacion)} CUP = suma de los ingresos actuales menos la suma de los ingresos del tramo comparable, calculada SOLO sobre los ${rows.length} productos de la unión (base conciliada; no representa la tienda completa ni incluye productos fuera del corte).` +
          (variacionPct !== null ? ` La variación porcentual (${fmtPctSign(variacionPct)}) usa como base la suma del tramo comparable de esa misma unión.` : ''),
        'Las cantidades nunca se suman entre productos con unidades de medida distintas; los precios efectivos se calculan por producto (ingresos netos / unidades vendidas).',
      ],
    },
    {
      titulo: 'Definición de indicadores',
      parrafos: [
        'Velocidad diaria de venta = unidades vendidas del tramo analizado ÷ días del tramo, en la unidad de medida propia del producto (unidades/día, metros/día, kilogramos/día, según corresponda).',
        'Cobertura estimada (días) = existencia actual ÷ velocidad diaria. Es una estimación operativa con la existencia instantánea: no proyecta demanda futura ni incorpora plazos de reposición o inventario de seguridad, que el sistema no parametriza (salvo la existencia mínima declarada en el catálogo).',
        `Clasificación de rotación (umbrales configurables, anclados a la cadencia mensual del informe con D = ${dias} días): rotación alta, cobertura < D/2; rotación moderada, entre D/2 y D; baja rotación, cobertura > D; sin movimiento, sin salidas en el tramo con existencia disponible; sin base suficiente, cuando no puede calcularse la velocidad o la cobertura (no se generan coberturas ficticias).`,
        `Variación relevante: variación porcentual de +50% o más (crecimiento) o de -50% o más (contracción), simétrico del umbral de caída fuerte publicado por el sistema (50%). Concentración del líder: participación oficial > 50% de las ventas del período.`,
        'Diferencias conceptuales: la velocidad de venta (unidades/día) no equivale a la cobertura (días de existencia), y ninguna de las dos es la rotación financiera de inventario (que requiere existencia promedio y costo de ventas, no disponibles — no se calcula).',
      ],
    },
    {
      titulo: 'Limitaciones',
      parrafos: [
        'La existencia se reporta como valor puntual del catálogo; el sistema no conserva existencia promedio por período, por lo que la rotación financiera de inventario no se calcula ni se estima.',
        'No existen existencias comprometidas, plazos de abastecimiento ni inventario de seguridad parametrizados en las fuentes consultadas: los riesgos se presentan como alertas de disponibilidad, sin fechas de agotamiento.',
        'La ausencia de ventas no equivale a demanda nula, y la existencia del catálogo puede diferir de la física si hay movimientos pendientes de registro.',
        'Los productos fuera del corte del Top 20 por ingresos no informan importe en el agregado oficial: su situación comercial se evalúa únicamente con la evidencia del mayor de inventario y, sin ella, se declara «verificar».',
        'El informe es un instrumento de apoyo a la decisión: las interpretaciones comerciales son hipótesis de trabajo respaldadas por los indicadores mostrados y deben validarse con la operación antes de ejecutar acciones.',
      ],
    },
  ];

  const parametros = [
    `Ámbito: tienda activa (${meta.ambito}) — aislamiento por tienda garantizado por RLS.`,
    'Fuente de ventas: RPC get_sales_dashboard_analytics — valoración canónica CUP contable a la tasa de cada venta, neta de descuentos y devoluciones; anulados y borradores excluidos.',
    'Recorte del análisis: Top 20 por ingresos del período analizado más el Top 20 del tramo comparable (un líder anterior con ventas cero permanece visible).',
    `Existencias, unidad de medida y mínimo del catálogo: instantánea del catálogo oficial de la tienda. Cobertura y rotación estimadas con D = ${dias} días del tramo analizado.`,
    ...(meta.parametrosExtra ?? []),
  ];

  return {
    meta: {
      ...meta,
      titulo: 'INFORME EJECUTIVO DE DESEMPEÑO COMERCIAL Y ABASTECIMIENTO',
      generadoEl,
      diasPeriodo: dias,
      parametros,
    },
    situacionGeneral,
    conclusionGerencial,
    resumenGerencial,
    indicadores,
    grafico,
    variaciones,
    riesgoCobertura,
    prioridades,
    complementarias,
    anexos: [anexoI, anexoII, anexoIII],
    metodologia,
    conciliacion: {
      productosAnalizados: rows.length,
      ingresosActual,
      ingresosAnterior,
      variacion,
      alcance,
      variacionPct,
    },
  };
}
