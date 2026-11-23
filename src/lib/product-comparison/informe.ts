/**
 * ADNEGOCIO-UI 2026-11-23 · INFORME EJECUTIVO DE COMPARACIÓN DE PRODUCTOS
 * (misión Comparar Productos §3 — tab «Informe Ejecutivo»)
 * ===========================================================================
 * MÓDULO PURO (sin I/O): transforma los resultados REALES de la comparación
 * (buildComparison → rows/resumen) en un informe empresarial redactado,
 * estructurado y orientado a la toma de decisiones. Consumidores: la vista
 * Comparar Productos (render en pantalla) y el generador del PDF oficial
 * (informe-ejecutivo-pdf.ts) — UNA sola fuente de redacción y cifras.
 *
 * REGLAS DE INTEGRIDAD (no negociables, heredadas de la misión):
 *  · Nada se inventa: todo número proviene de rows/resumen (RPC
 *    get_sales_dashboard_analytics + catálogo). Sin base → «sin base»,
 *    sin datos → texto honesto, jamás cero supuesto.
 *  · Los porcentajes SOLO se calculan con base válida (ventas anteriores > 0).
 *  · Las cantidades NUNCA se agregan entre productos con unidades de medida
 *    distintas: se muestran por producto con su U.M.
 *  · Moneda: CUP contable canónico del sistema (misma valoración que la
 *    tabla) — no se mezclan nominales.
 *  · Cada hallazgo diferencia: HECHO comprobado → EVIDENCIA numérica →
 *    POSIBLE implicación comercial (hipótesis, no hecho) → ACCIÓN a evaluar.
 *  · Un producto ausente del Top actual NO se declara descatalogado: se
 *    relaciona con la evidencia disponible (existencia) y se marca lo que
 *    requiere investigación.
 *  · Umbrales publicados del producto: concentración > 50 % en un producto;
 *    caída fuerte ≥ 50 % de las ventas (CAIDA_FUERTE_PCT de compare.ts).
 */

import { formatCurrency } from '@/lib/utils';
import {
  TOP_PRINCIPAL_ANTERIOR,
  CAIDA_FUERTE_PCT,
  type ComparisonRow,
  type ComparisonResumen,
} from './compare';

// ── Estructura del informe ───────────────────────────────────────────────────

export interface InformeMeta {
  /** Nombre de la entidad (tienda activa) — encabezado documental. */
  entidadNombre: string;
  titulo: 'INFORME EJECUTIVO DE COMPARACIÓN DE PRODUCTOS';
  /** Ventana del período actual (yyyy-MM-dd, idéntica a la vista). */
  periodoActual: { desde: string; hasta: string };
  /** Ventana equivalente de comparación (yyyy-MM-dd). */
  periodoComparacion: { desde: string; hasta: string };
  /** Fecha y hora de GENERACIÓN del informe (ISO; se congela al generar). */
  generadoEl: string;
  /** Ámbito real del análisis (tienda activa). */
  ambito: string;
  /** Parámetros y filtros aplicados (transparencia metodológica). */
  parametros: string[];
}

export interface InformeHallazgo {
  titulo: string;
  /** 1. Hallazgo comprobado (hecho). */
  hallazgo: string;
  /** 2. Evidencia numérica. */
  evidencia: string;
  /** 3. Posible implicación comercial (explícitamente hipótesis). */
  implicacion: string;
  /** 4. Acción que conviene evaluar (no una orden). */
  accion: string;
}

export interface InformeSeccion {
  titulo: string;
  /** Párrafo redactado dinámicamente a partir de los datos. */
  intro: string;
  productos: ComparisonRow[];
}

export interface InformeEjecutivo {
  meta: InformeMeta;
  resumenEjecutivo: {
    /** Párrafo de situación general (números reales incrustados). */
    parrafo: string;
    /** Cifras de contexto (todas computadas del conjunto comparado). */
    cifras: Array<{ label: string; value: string }>;
  };
  indicadores: Array<{ label: string; value: string }>;
  secciones: {
    crecimiento: InformeSeccion;
    descenso: InformeSeccion;
    nuevos: InformeSeccion;
    dejaronDeVenderse: InformeSeccion;
    salieronDelTop: InformeSeccion;
  };
  hallazgos: InformeHallazgo[];
  /** Conclusión ejecutiva (síntesis + prioridades). */
  conclusion: string[];
}

export interface InformeInput {
  rows: ComparisonRow[];
  resumen: ComparisonResumen;
  meta: Omit<InformeMeta, 'titulo' | 'generadoEl' | 'parametros'> & {
    /** Parámetros extra que la vista quiera documentar (opcional). */
    parametrosExtra?: string[];
  };
  /** Fecha de generación (ISO). El llamador la congela al generar. */
  generadoEl: string;
}

// ── Helpers de redacción ─────────────────────────────────────────────────────

const fmtCup = (n: number): string => formatCurrency(n);
const fmtCupSign = (n: number): string => `${n > 0 ? '+' : ''}${formatCurrency(n)}`;
const fmtPct = (n: number): string => `${n > 0 ? '+' : ''}${n}%`;
/** Fecha institucional (dd/MM/aaaa) para el texto redactado del informe. */
const fmtFecha = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};
/** Flecha imprimible: U+2192 NO existe en WinAnsi (fuente estándar de jsPDF);
 *  el documento usa el ángulo simple U+203A, presente en esa codificación. */
const FLECHA = '›';
/** Cantidad con SU unidad de medida (nunca agregada entre U.M. distintas). */
const fmtCant = (n: number, um: string | null): string =>
  `${n.toLocaleString('es-CU')} ${um ?? 'u'}`;

/** Variación legible de una fila: «+12.3% (+1,234.00 CUP)» o «sin base». */
export function variacionTexto(r: ComparisonRow): string {
  if (r.varPct === null) return 'sin base';
  return `${fmtPct(r.varPct)} (${fmtCupSign(r.difCup)})`;
}

const crecientes = (rows: ComparisonRow[]): ComparisonRow[] =>
  rows.filter((r) => r.evolucion === 'crece' || r.evolucion === 'lidera' || r.evolucion === 'nuevo');
const descendentes = (rows: ComparisonRow[]): ComparisonRow[] =>
  rows.filter((r) => r.evolucion === 'desciende');

// ── Constructor del informe ──────────────────────────────────────────────────

export function buildInformeEjecutivo(input: InformeInput): InformeEjecutivo {
  const { rows, resumen, generadoEl } = input;
  const { meta } = input;

  const conPosicionActual = rows.filter((r) => r.posActual !== null);
  const crec = crecientes(rows);
  const desc = descendentes(rows);
  const nuevos = rows.filter((r) => r.evolucion === 'nuevo');
  const dejaron = rows.filter((r) => r.evolucion === 'dejo_de_venderse');
  const salieron = rows.filter((r) => r.evolucion === 'sale_del_top');

  // Δ ingresos del conjunto comparado (Top actual ∪ Top anterior): Σ ventas
  // actuales − Σ ventas anteriores SOLO de los productos de la unión —
  // etiquetado siempre con su alcance exacto (no es la tienda entera).
  const sumAct = rows.reduce((s, r) => s + r.ventasActuales, 0);
  const sumAnt = rows.reduce((s, r) => s + r.ventasAnteriores, 0);
  const deltaConjunto = Math.round((sumAct - sumAnt) * 100) / 100;

  // Concentración: participación oficial del líder (solo si el RPC la informa).
  const lider = conPosicionActual.find((r) => r.posActual === 1) ?? null;
  const participacionLider = lider?.participacionActual ?? null;

  const ordenCrece = [...crec].sort((a, b) => b.difCup - a.difCup);
  const ordenDesc = [...desc].sort((a, b) => a.difCup - b.difCup);

  // ── A/B. Resumen ejecutivo ──
  const partes: string[] = [];
  partes.push(
    `Se compararon ${rows.length} producto${rows.length !== 1 ? 's' : ''} del ranking comercial ` +
      `(Top ${conPosicionActual.length} del período actual y Top ${rows.length - conPosicionActual.length > 0 ? rows.length - conPosicionActual.length : 0} del período anterior) ` +
      `entre el ${fmtFecha(meta.periodoActual.desde)} y el ${fmtFecha(meta.periodoActual.hasta)}, contra el tramo equivalente del ${fmtFecha(meta.periodoComparacion.desde)} al ${fmtFecha(meta.periodoComparacion.hasta)}.`,
  );
  if (resumen.liderActual) {
    partes.push(
      `El líder del período actual es «${resumen.liderActual.name}» con ${fmtCup(resumen.liderActual.ventas)}` +
        (participacionLider !== null ? ` (${participacionLider.toLocaleString('es-CU')} % de las ventas del período)` : '') +
        (resumen.cambioLider ? `. ${resumen.cambioLider}.` : '.'),
      );
  }
  const dirGeneral =
    crec.length === 0 && desc.length === 0
      ? 'El ranking se mantiene estable respecto al tramo anterior.'
      : `Predominan los movimientos ${crec.length >= desc.length ? 'al alza' : 'a la baja'}: ${crec.length} producto${crec.length !== 1 ? 's' : ''} con desempeño igual o mejor y ${desc.length} en descenso.`;
  partes.push(dirGeneral);
  if (nuevos.length > 0) {
    partes.push(
      `${nuevos.length} producto${nuevos.length !== 1 ? 's' : ''} aparece${nuevos.length !== 1 ? 'n' : ''} por primera vez en el ranking` +
        (dejaron.length > 0 ? ` y ${dejaron.length} ${dejaron.length !== 1 ? 'dejaron' : 'dejó'} de registrar ventas respecto al tramo anterior` : '') +
        '.',
    );
  } else if (dejaron.length > 0) {
    partes.push(`${dejaron.length} producto${dejaron.length !== 1 ? 's' : ''} ${dejaron.length !== 1 ? 'dejaron' : 'dejó'} de registrar ventas respecto al tramo anterior.`);
  }

  const resumenEjecutivo: InformeEjecutivo['resumenEjecutivo'] = {
    parrafo: partes.join(' '),
    cifras: [
      { label: 'Productos analizados', value: String(rows.length) },
      { label: 'En crecimiento (o líderes)', value: String(crec.length) },
      { label: 'En descenso', value: String(desc.length) },
      { label: 'Nuevos en el ranking', value: String(nuevos.length) },
      { label: 'Dejaron de venderse', value: String(dejaron.length) },
      { label: 'Salen del Top (siguen vendiendo)', value: String(salieron.length) },
      {
        label: 'Variación de ingresos del conjunto comparado',
        value: `${fmtCupSign(deltaConjunto)} CUP`,
      },
    ],
  };

  // ── Indicadores principales (cifras oficiales, sin estimaciones) ──
  const indicadores: InformeEjecutivo['indicadores'] = [];
  if (resumen.liderActual) {
    indicadores.push({
      label: 'Líder del período actual',
      value: `${resumen.liderActual.name} — ${fmtCup(resumen.liderActual.ventas)} CUP`,
    });
  }
  if (resumen.liderAnterior) {
    indicadores.push({
      label: 'Líder del período anterior',
      value: `${resumen.liderAnterior.name} — ${fmtCup(resumen.liderAnterior.ventas)} CUP`,
    });
  }
  if (resumen.mayorCrecimiento) {
    indicadores.push({
      label: 'Mayor crecimiento',
      value: `${resumen.mayorCrecimiento.name} — ${resumen.mayorCrecimiento.varPct !== null ? fmtPct(resumen.mayorCrecimiento.varPct) : 'sin base'} (${fmtCupSign(resumen.mayorCrecimiento.difCup)} CUP)`,
    });
  }
  if (resumen.mayorCaída) {
    indicadores.push({
      label: 'Mayor caída',
      value: `${resumen.mayorCaída.name} — ${resumen.mayorCaída.varPct !== null ? fmtPct(resumen.mayorCaída.varPct) : 'sin base'} (${fmtCupSign(resumen.mayorCaída.difCup)} CUP)`,
    });
  }
  if (participacionLider !== null) {
    indicadores.push({
      label: 'Participación del líder (oficial)',
      value: `${participacionLider.toLocaleString('es-CU')} % de las ventas del período`,
    });
  }

  // ── C-G. Secciones por comportamiento ──
  const introCrecimiento = crec.length
    ? `${crec.length} producto${crec.length !== 1 ? 's' : ''} mejora${crec.length !== 1 ? 'n' : ''} posición o ingresos frente al tramo anterior` +
      (ordenCrece[0]
        ? `; el avance más fuerte es «${ordenCrece[0].name}» (${variacionTexto(ordenCrece[0])})`
        : '') +
      '. Los crecimientos sostenidos merecen atención de abastecimiento y comercialización.'
    : 'Ningún producto del conjunto comparado mejora su desempeño frente al tramo equivalente anterior.';

  const introDescenso = desc.length
    ? `${desc.length} producto${desc.length !== 1 ? 's' : ''} reduce${desc.length !== 1 ? 'n' : ''} su desempeño comercial` +
      (ordenDesc[0]
        ? `; la caída más marcada es «${ordenDesc[0].name}» (${variacionTexto(ordenDesc[0])})`
        : '') +
      '. Se distingue entre pérdida de ingresos y pérdida de unidades: pueden tener causas distintas (precio, demanda, disponibilidad).'
    : 'Ningún producto del conjunto comparado empeora su desempeño frente al tramo equivalente anterior.';

  const introNuevos = nuevos.length
    ? `${nuevos.length} producto${nuevos.length !== 1 ? 's' : ''} aparece${nuevos.length !== 1 ? 'n' : ''} en el ranking actual sin ventas comparables en el tramo anterior. ` +
      'Importante: esta comparación certifica la AUSENCIA de ventas previas en el Top, no la fecha de alta en el catálogo — determinar si un producto es de incorporación reciente requiere revisar su ficha.'
    : 'Ningún producto nuevo entra al ranking en este período.';

  const introDejaron = dejaron.length
    ? `${dejaron.length} producto${dejaron.length !== 1 ? 's' : ''} registraba${dejaron.length !== 1 ? 'n' : ''} ventas en el tramo anterior y no registra ninguna en el actual. ` +
      'NO se asume descatalogación: la ausencia de ventas puede responder a falta de inventario, pérdida de demanda o visibilidad — la existencia disponible ayuda a orientar la investigación.'
    : 'Ningún producto del tramo anterior dejó de venderse por completo en el período actual.';

  const introSalieron = salieron.length
    ? `${salieron.length} producto${salieron.length !== 1 ? 's' : ''} sale${salieron.length !== 1 ? 'n' : ''} del Top analizado aunque sigue registrando ventas. Este comportamiento NO equivale a «dejó de venderse»: son productos con demanda vigente fuera del recorte del Top.`
    : 'Ningún producto activo sale del Top en este período.';

  const secciones: InformeEjecutivo['secciones'] = {
    crecimiento: { titulo: 'A. Productos en crecimiento', intro: introCrecimiento, productos: ordenCrece },
    descenso: { titulo: 'B. Productos en descenso', intro: introDescenso, productos: ordenDesc },
    nuevos: { titulo: 'C. Productos nuevos en el ranking', intro: introNuevos, productos: nuevos },
    dejaronDeVenderse: { titulo: 'D. Productos que dejaron de venderse', intro: introDejaron, productos: dejaron },
    salieronDelTop: { titulo: 'E. Productos que salen del Top (siguen vendiéndose)', intro: introSalieron, productos: salieron },
  };

  // ── H. Hallazgos y recomendaciones (condicionados a la evidencia) ──
  const hallazgos: InformeHallazgo[] = [];

  // 1) Crecimiento con más unidades → oportunidad de abastecimiento.
  for (const r of ordenCrece) {
    if (r.difCup > 0 && r.unidadesActuales > r.unidadesAnteriores && r.posActual !== null && r.posActual <= 5) {
      hallazgos.push({
        titulo: `Crecimiento sostenido: ${r.name}`,
        hallazgo: `El producto crece en ingresos Y en unidades comercializadas, manteniéndose en el puesto ${r.posActual} del ranking actual.`,
        evidencia: `${variacionTexto(r)} · unidades: ${fmtCant(r.unidadesAnteriores, r.unidadMedida)} ${FLECHA} ${fmtCant(r.unidadesActuales, r.unidadMedida)}${r.stockActual !== null ? ` · existencia actual: ${fmtCant(r.stockActual, r.unidadMedida)}` : ''}.`,
        implicacion: 'Si el ritmo de ventas se mantiene, la demanda superaría el patrón del mes anterior y la existencia actual podría agotarse antes de cerrar el ciclo.',
        accion: 'Evaluar anticipar reposición o ajustar la cantidad de la próxima compra para no perder ventas por quiebre de stock.',
      });
      break; // el caso más relevante por importe
    }
  }

  // 2) Ingresos ↑ con unidades ↓ → posible cambio de precios/composición.
  for (const r of ordenCrece) {
    if (r.difCup > 0 && r.unidadesAnteriores > 0 && r.unidadesActuales < r.unidadesAnteriores) {
      hallazgos.push({
        titulo: `Ingresos al alza con menos unidades: ${r.name}`,
        hallazgo: 'El producto factura más que en el tramo anterior vendiendo MENOS unidades.',
        evidencia: `${variacionTexto(r)} · unidades: ${fmtCant(r.unidadesAnteriores, r.unidadMedida)} ${FLECHA} ${fmtCant(r.unidadesActuales, r.unidadMedida)}${r.devolucionesActuales > 0 ? ` (con ${fmtCant(r.devolucionesActuales, r.unidadMedida)} devueltas)` : ''}.`,
        implicacion: 'Patrón compatible con un aumento de precio, un cambio en la composición de la venta (tamaños/variantes) o ventas de mayor valor unitario — no está demostrado con estos datos.',
        accion: 'Evaluar revisar la política de precios del producto y su mix de variantes antes de proyectar la demanda.',
      });
      break;
    }
  }

  // 3) Descenso fuerte con existencia disponible → rotación / compras.
  for (const r of ordenDesc) {
    if (r.varPct !== null && r.varPct <= -CAIDA_FUERTE_PCT && r.stockActual !== null && r.stockActual > 0) {
      hallazgos.push({
        titulo: `Caída fuerte con existencia disponible: ${r.name}`,
        hallazgo: 'El producto pierde al menos la mitad de sus ventas mientras conserva inventario en el almacén.',
        evidencia: `${variacionTexto(r)} · unidades: ${fmtCant(r.unidadesAnteriores, r.unidadMedida)} ${FLECHA} ${fmtCant(r.unidadesActuales, r.unidadMedida)} · existencia actual: ${fmtCant(r.stockActual, r.unidadMedida)}.`,
        implicacion: 'La rotación del producto se está deteriorando y el inventario disponible podría volverse lento (o acumular costo de almacenamiento) si la tendencia continúa.',
        accion: 'Evaluar revisar las decisiones de compra del producto y activar acciones de comercialización antes de reabastecerlo.',
      });
      break;
    }
  }

  // 4) Principal anterior que deja de venderse — causa NO afirmada.
  const principalDetenido = dejaron.find((r) => r.posAnterior !== null && r.posAnterior <= TOP_PRINCIPAL_ANTERIOR);
  if (principalDetenido) {
    const conStock = principalDetenido.stockActual !== null && principalDetenido.stockActual > 0;
    hallazgos.push({
      titulo: `Producto principal sin ventas: ${principalDetenido.name}`,
      hallazgo: `Un producto que llegó a estar en el puesto ${principalDetenido.posAnterior} del Top anterior no registra ninguna venta en el período actual.`,
      evidencia: `Ventas anteriores: ${fmtCup(principalDetenido.ventasAnteriores)} CUP · unidades anteriores: ${fmtCant(principalDetenido.unidadesAnteriores, principalDetenido.unidadMedida)} · ventas actuales: 0${principalDetenido.stockActual !== null ? ` · existencia actual: ${fmtCant(principalDetenido.stockActual, principalDetenido.unidadMedida)}` : ' · existencia: sin dato'}.`,
      implicacion: conStock
        ? 'Hay existencia disponible sin salida: la causa no parece ser (solo) falta de inventario — puede tratarse de pérdida de demanda, visibilidad o desplazamiento por competencia interna del catálogo. REQUIERE INVESTIGACIÓN.'
        : 'La existencia actual (cero o sin dato) es compatible con un quiebre de stock como causa — REQUIERE INVESTIGACIÓN: verificar reposiciones y movimientos recientes del producto.',
      accion: conStock
        ? 'Evaluar verificar disponibilidad real en piso, precios frente a sustitutos y acciones de exhibición/promoción.'
        : 'Evaluar revisar el abastecimiento del producto y, si el quiebre se prolongó, la demanda acumulada no atendida.',
    });
  }

  // 5) Concentración (umbral publicado del producto: > 50 % en un producto).
  if (participacionLider !== null && participacionLider > 50 && lider) {
    hallazgos.push({
      titulo: `Concentración de ingresos en el líder: ${lider.name}`,
      hallazgo: 'El primer producto del ranking concentra más de la mitad de las ventas del período (umbral de revisión: > 50 %).',
      evidencia: `Participación oficial del líder: ${participacionLider.toLocaleString('es-CU')} % de las ventas · ${fmtCup(lider.ventasActuales)} CUP en el período.`,
      implicacion: 'Una dependencia elevada de un solo producto expone el ingreso total a quiebres de stock o cambios de demanda de ese artículo.',
      accion: 'Evaluar asegurar el abastecimiento del líder y diversificar el empuje comercial hacia los productos de la zona media del ranking.',
    });
  }

  // 6) Cambio de líder (hecho observable del resumen).
  if (resumen.cambioLider && resumen.liderActual && resumen.liderAnterior) {
    hallazgos.push({
      titulo: 'Cambio de liderazgo del ranking',
      hallazgo: resumen.cambioLider + '.',
      evidencia: `Líder actual: ${resumen.liderActual.name} con ${fmtCup(resumen.liderActual.ventas)} CUP · líder anterior: ${resumen.liderAnterior.name} con ${fmtCup(resumen.liderAnterior.ventas)} CUP en su período.`,
      implicacion: 'La estructura de la demanda del catálogo está cambiando: los productos que suben pueden necesitar más presencia que los que ceden protagonismo.',
      accion: 'Evaluar revisar plan de compra y espacios de exhibición de ambos productos para el próximo ciclo.',
    });
  }

  // 7) Nuevos con entrada potente (posición observable, umbral = Top 5).
  const nuevoPotente = [...nuevos].sort((a, b) => (a.posActual ?? 99) - (b.posActual ?? 99)).find((r) => (r.posActual ?? 99) <= 5);
  if (nuevoPotente) {
    hallazgos.push({
      titulo: `Entrada potente al ranking: ${nuevoPotente.name}`,
      hallazgo: `Un producto sin ventas comparables en el tramo anterior entra directamente al puesto ${nuevoPotente.posActual} del Top.`,
      evidencia: `Ventas actuales: ${fmtCup(nuevoPotente.ventasActuales)} CUP · unidades: ${fmtCant(nuevoPotente.unidadesActuales, nuevoPotente.unidadMedida)}${nuevoPotente.stockActual !== null ? ` · existencia actual: ${fmtCant(nuevoPotente.stockActual, nuevoPotente.unidadMedida)}` : ''}.`,
      implicacion: 'La demanda del producto se manifestó de forma relevante desde su primera aparición: puede tratarse de una línea con potencial de crecimiento (o de una venta puntual de alto valor — el período comparado lo aclarará).',
      accion: 'Evaluar dar seguimiento en el próximo período antes de decidir compras adicionales.',
    });
  }

  // Sin hallazgos: nota honesta (no se fuerza una conclusión).
  if (hallazgos.length === 0) {
    hallazgos.push({
      titulo: 'Sin desviaciones sobre los umbrales de revisión',
      hallazgo: 'Ningún comportamiento del conjunto comparado supera los umbrales de revisión de este informe (caída ≥ 50 %, concentración > 50 %, producto principal detenido).',
      evidencia: `${rows.length} productos comparados · Δ ingresos del conjunto: ${fmtCupSign(deltaConjunto)} CUP · crecimientos: ${crec.length} · descensos: ${desc.length}.`,
      implicacion: 'El comportamiento comercial del período es comparable con el tramo anterior sin señales de alerta.',
      accion: 'Mantener el seguimiento periódico de la comparación.',
    });
  }

  // ── I. Conclusión ejecutiva ──
  const conclusion: string[] = [];
  conclusion.push(
    dirGeneral +
      (resumen.liderActual ? ` El liderazgo lo ocupa «${resumen.liderActual.name}»${resumen.cambioLider ? ' tras un cambio de líder respecto al tramo anterior' : ' (se mantiene del tramo anterior)'}.` : ''),
  );
  if (deltaConjunto !== 0) {
    conclusion.push(
      `El conjunto comparado ${(deltaConjunto > 0 ? 'acumula' : 'cede')} ${formatCurrency(Math.abs(deltaConjunto))} CUP ${(deltaConjunto > 0 ? 'más' : 'menos')} que en el tramo equivalente anterior — cifra de alcance limitado al Top comparado, no al total de la tienda.`,
    );
  }
  const prioridades: string[] = [];
  if (dejaron.length > 0) prioridades.push(`investigar la causa de los ${dejaron.length} producto${dejaron.length !== 1 ? 's' : ''} sin ventas`);
  if (ordenDesc.length > 0) prioridades.push('revisar la rotación de los productos en descenso con inventario disponible');
  if (ordenCrece.some((r) => r.unidadesActuales > r.unidadesAnteriores)) prioridades.push('anticipar el abastecimiento de los productos en crecimiento');
  if (prioridades.length > 0) {
    conclusion.push(`Prioridades de revisión sugeridas por la evidencia: ${prioridades.join('; ')}.`);
  }
  conclusion.push(
    'Informe generado automáticamente a partir de las fuentes oficiales de COSTPRO (RPC get_sales_dashboard_analytics y catálogo de productos); las implicaciones comerciales son hipótesis de trabajo condicionadas a la evidencia mostrada y deben validarse con la operación antes de ejecutar acciones.',
  );

  const parametros = [
    `Ámbito: tienda activa (${meta.ambito}) — aislamiento por tienda garantizado por RLS.`,
    'Fuente de ventas: RPC get_sales_dashboard_analytics — valoración canónica CUP contable a la tasa de cada venta, neta de descuentos y devoluciones; anulados y borradores excluidos.',
    'Recorte del análisis: Top 20 por ingresos del período actual más el Top 20 del período anterior (un líder anterior con ventas cero hoy permanece visible).',
    'Existencias y unidades de medida: catálogo oficial de productos de la tienda.',
    ...(meta.parametrosExtra ?? []),
  ];

  return {
    meta: {
      ...meta,
      titulo: 'INFORME EJECUTIVO DE COMPARACIÓN DE PRODUCTOS',
      generadoEl,
      parametros,
    },
    resumenEjecutivo,
    indicadores,
    secciones,
    hallazgos,
    conclusion,
  };
}
