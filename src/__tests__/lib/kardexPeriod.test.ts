/**
 * Tests — Lógica pura del Kardex por producto (§6, §10, §12, §21, §22, §34-bis, §40).
 *
 * Garantías:
 *   1. Ranking de búsqueda inteligente: exacto código > comienza código >
 *      contiene código > exacto nombre > comienza nombre > contiene nombre.
 *   2. Resumen del período: saldo inicial, entradas, salidas, saldo final
 *      DERIVADO cronológicamente (saldoInicial + entradas − salidas).
 *   3. Orden cronológico determinista (created_at, luego id).
 *   4. Formateo de cantidades preserva decimales reales sin ruido flotante.
 *   5. §34-bis: saldo corrido cronológico derivado desde el origen —
 *      independiente del orden de INSERCIÓN del balance_after almacenado
 *      (corrección del defecto SKU 15 Cemento Cola, 2026-10-21), cubriendo
 *      la batería A5 de la misión (saldo inicial, retroactivos, empates de
 *      marca temporal, reversos, devoluciones, conciliación final).
 */

import { describe, it, expect } from 'vitest';
import {
  rankearCoincidencias,
  calcularResumenPeriodo,
  derivarSaldosCronologicos,
  formatearCantidad,
  ordenarCronologico,
  type KardexMovementLike,
} from '@/lib/inventory/kardexPeriod';
import {
  GRUPOS_FILTRO_MOVIMIENTO,
  TIPOS_MOVIMIENTO_REALES,
  validarCoberturaGrupos,
  obtenerEtiquetaMovimiento,
} from '@/lib/inventory/movementPresentation';

const mk = (
  id: string,
  created_at: string,
  movement_type: string,
  quantity_change: number,
  balance_after: number,
  reference_doc: string | null = null
): KardexMovementLike => ({
  id,
  created_at,
  movement_type,
  quantity_change,
  balance_after,
  reference_doc,
  reference_type: null,
  created_by: null,
});

describe('rankearCoincidencias — §6 búsqueda inteligente', () => {
  const productos = [
    { id: 'a', name: 'Kit solar MC4', sku: '122', stock_current: 5 },
    { id: 'b', name: 'Conector MC4', sku: '220', stock_current: 10 },
    { id: 'c', name: 'Cable MC4', sku: '22', stock_current: 3 },
    { id: 'd', name: 'Panel 220W', sku: 'PN-9', stock_current: 1 },
  ];

  it('la coincidencia exacta de código aparece PRIMERO (ej: buscar "22")', () => {
    const ranked = rankearCoincidencias(productos, '22');
    expect(ranked[0].sku).toBe('22');
    expect(ranked[0].name).toBe('Cable MC4');
    // '220' (comienza por código, score 1) antes que '122' (contiene, score 2)
    expect(ranked[1].sku).toBe('220');
    expect(ranked[2].sku).toBe('122');
    // 'Panel 220W' solo coincide por nombre (score 5) → último
    expect(ranked[3].sku).toBe('PN-9');
  });

  it('prioriza "comienza por código" sobre "contiene código"', () => {
    const items = [
      { id: 'x', name: 'Producto A', sku: 'X-22' },
      { id: 'y', name: 'Producto B', sku: '2200' },
    ];
    const ranked = rankearCoincidencias(items as any, '22');
    expect(ranked[0].id).toBe('y'); // comienza por 22
    expect(ranked[1].id).toBe('x'); // solo contiene
  });

  it('coincidencia exacta de nombre antes que parcial (ej: "MC4")', () => {
    const items = [
      { id: 'p', name: 'MC4', sku: 'ZZ' },
      { id: 'q', name: 'MC4 Pro', sku: 'YY' },
      { id: 'r', name: 'Cable MC4', sku: 'XX' },
    ];
    const ranked = rankearCoincidencias(items as any, 'MC4');
    expect(ranked[0].id).toBe('p'); // exacto
    expect(ranked[1].id).toBe('q'); // comienza
    expect(ranked[2].id).toBe('r'); // contiene
  });

  it('término vacío no altera el orden', () => {
    const ranked = rankearCoincidencias(productos, '  ');
    expect(ranked).toHaveLength(4);
  });
});

describe('calcularResumenPeriodo — §10/§12/§23', () => {
  it('calcula entradas, salidas y saldo final del período', () => {
    const movs = [
      mk('1', '2026-09-02T10:00:00Z', 'purchase', 50, 150, 'EN-0012'),
      mk('2', '2026-09-04T10:00:00Z', 'sale', -10, 140, 'V-0045'),
      mk('3', '2026-09-06T10:00:00Z', 'out', -5, 135, 'VS-0021'),
      mk('4', '2026-09-08T10:00:00Z', 'return', 2, 137, 'DEV-0004'),
    ];
    const r = calcularResumenPeriodo(movs, 100);
    expect(r.saldoInicial).toBe(100);
    expect(r.entradas).toBe(52); // 50 + 2
    expect(r.salidas).toBe(15); // 10 + 5
    expect(r.saldoFinal).toBe(137); // DERIVADO: 100 + 52 − 15 (§34-bis)
    expect(r.cantidadMovimientos).toBe(4);
  });

  it('período vacío: saldo final = saldo inicial', () => {
    const r = calcularResumenPeriodo([], 42.5);
    expect(r.saldoInicial).toBe(42.5);
    expect(r.saldoFinal).toBe(42.5);
    expect(r.entradas).toBe(0);
    expect(r.salidas).toBe(0);
    expect(r.cantidadMovimientos).toBe(0);
  });

  it('saldo final se DERIVA aunque el balance_after almacenado no cuadre (§34-bis)', () => {
    // CORRECCIÓN SKU 15: el balance_after se encadena por ORDEN DE INSERCIÓN;
    // con movimientos retro-datados puede no cuadrar cronológicamente. El
    // saldo cronológico del submayor se deriva desde el origen: aquí 0 + 10,
    // jamás el 999 almacenado (que refleja otro punto de la cadena de
    // inserción). La divergencia queda como evidencia de auditoría.
    const movs = [mk('1', '2026-09-02T10:00:00Z', 'purchase', 10, 999, 'EN-0001')];
    const r = calcularResumenPeriodo(movs, 0);
    expect(r.saldoFinal).toBe(10);
  });

  it('balance_after nulo del último movimiento NO afecta el saldo derivado', () => {
    const movs = [{ ...mk('1', '2026-09-02T10:00:00Z', 'adjustment', 5, 0), balance_after: null }];
    const r = calcularResumenPeriodo(movs, 7);
    expect(r.saldoFinal).toBe(12); // 7 + 5 — derivado, no depende de balance_after
  });
});

describe('ordenarCronologico — §21/§22', () => {
  it('ordena de más antiguo a más reciente', () => {
    const movs = [
      mk('3', '2026-09-08T10:00:00Z', 'sale', -1, 99),
      mk('1', '2026-09-02T10:00:00Z', 'purchase', 50, 150),
      mk('2', '2026-09-04T10:00:00Z', 'sale', -10, 140),
    ];
    const sorted = ordenarCronologico(movs);
    expect(sorted.map(m => m.id)).toEqual(['1', '2', '3']);
  });

  it('misma fecha: desempate determinista por id (§22)', () => {
    const movs = [
      mk('b', '2026-09-04T10:00:00Z', 'sale', -1, 99),
      mk('a', '2026-09-04T10:00:00Z', 'purchase', 50, 150),
    ];
    const sorted = ordenarCronologico(movs);
    expect(sorted.map(m => m.id)).toEqual(['a', 'b']);
  });

  it('no muta el arreglo original', () => {
    const movs = [mk('2', '2026-09-04T10:00:00Z', 'sale', -1, 99), mk('1', '2026-09-02T10:00:00Z', 'purchase', 50, 150)];
    const copia = [...movs];
    ordenarCronologico(movs);
    expect(movs).toEqual(copia);
  });
});

describe('formatearCantidad — §40/§41', () => {
  it('conserva decimales reales sin redondeo arbitrario', () => {
    expect(formatearCantidad(65.5)).toBe('65.5');
    expect(formatearCantidad(65.25)).toBe('65.25');
    expect(formatearCantidad(0.5)).toBe('0.5');
    expect(formatearCantidad(1.75)).toBe('1.75');
    expect(formatearCantidad(10.125)).toBe('10.125');
  });

  it('elimina solo el ruido de coma flotante', () => {
    expect(formatearCantidad(0.30000000000000004)).toBe('0.3');
    expect(formatearCantidad(125.49999999999999)).toBe('125.5');
  });

  it('enteros sin decimales forzados', () => {
    expect(formatearCantidad(100)).toBe('100');
    expect(formatearCantidad(0)).toBe('0');
  });

  it('valores nulos o no numéricos → —', () => {
    expect(formatearCantidad(null)).toBe('—');
    expect(formatearCantidad(undefined)).toBe('—');
    expect(formatearCantidad(NaN)).toBe('—');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AMPLIACIÓN Trazabilidad Global — §6/§7/§14: grupos de filtro por tipo
// ─────────────────────────────────────────────────────────────────────────────

describe('GRUPOS_FILTRO_MOVIMIENTO — §6/§7/§14 Trazabilidad Global', () => {
  it('cubre TODOS los valores reales del enum movement_type sin solapamientos', () => {
    const problemas = validarCoberturaGrupos();
    expect(problemas).toEqual([]);
  });

  it('cada grupo filtra solo tipos reales del enum en BD', () => {
    for (const grupo of GRUPOS_FILTRO_MOVIMIENTO) {
      for (const tipo of grupo.tipos) {
        expect(TIPOS_MOVIMIENTO_REALES).toContain(tipo);
      }
    }
  });

  it('los grupos son disjuntos entre sí', () => {
    const vistos: string[] = [];
    for (const grupo of GRUPOS_FILTRO_MOVIMIENTO) {
      for (const tipo of grupo.tipos) {
        expect(vistos).not.toContain(tipo);
        vistos.push(tipo);
      }
    }
  });

  it('incluye el grupo mínimo exigido por la especificación (§6) con etiquetas en español', () => {
    const ids = GRUPOS_FILTRO_MOVIMIENTO.map(g => g.id);
    for (const esperado of ['todos', 'ventas', 'entradas', 'vales-salida', 'devoluciones', 'ajustes', 'anulaciones']) {
      expect(ids).toContain(esperado);
    }
    for (const grupo of GRUPOS_FILTRO_MOVIMIENTO) {
      // §7: nunca exponer el enum crudo como etiqueta
      expect(grupo.label).not.toMatch(/^[A-Z_]+$/);
      expect(grupo.label.length).toBeGreaterThan(0);
    }
  });

  it('el diccionario presenta «Vale de salida» para issue_slip_out (§7)', () => {
    expect(obtenerEtiquetaMovimiento('issue_slip_out')).toBe('Vale de salida');
    expect(obtenerEtiquetaMovimiento('issue_slip_reverse')).toBe('Reverso de vale');
    expect(obtenerEtiquetaMovimiento('production_reverse')).toBe('Reverso de producción');
    expect(obtenerEtiquetaMovimiento('devolution_reverse')).toBe('Reverso de devolución');
  });

  it('ningún tipo real del enum cae en el fallback «Otro»', () => {
    for (const tipo of TIPOS_MOVIMIENTO_REALES) {
      expect(obtenerEtiquetaMovimiento(tipo)).not.toBe('Otro');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §34-bis — SALDO CORRIDO CRONOLÓGICO DERIVADO (corrección defecto SKU 15)
// Batería A5 de la misión: cada fila muestra el saldo acumulado inmediatamente
// después de contabilizar ESE movimiento en el orden canónico
// (created_at ASC, id ASC), independiente del orden de inserción con que la
// BD encadenó `balance_after`.
// ─────────────────────────────────────────────────────────────────────────────

describe('derivarSaldosCronologicos — §34-bis batería A5', () => {
  // A5-1: saldo inicial 48; salida 5 → 43; salida 2 → 41
  it('A5-1: 48 − 5 = 43 y 43 − 2 = 41 (aritmética controlada)', () => {
    const movs = [
      mk('1', '2026-10-01T16:00:00Z', 'sale', -5, 43),
      mk('2', '2026-10-02T16:00:00Z', 'sale', -2, 41),
    ];
    const filas = derivarSaldosCronologicos(movs, 48);
    expect(filas.map(f => f.saldo)).toEqual([43, 41]);
  });

  // A5-2: entrada de 15 tras saldo 41 → 56 (sin movimiento intermedio)
  it('A5-2: 41 + 15 = 56 cuando no existe movimiento intermedio', () => {
    const movs = [mk('1', '2026-10-06T23:59:59Z', 'purchase', 15, 56)];
    const filas = derivarSaldosCronologicos(movs, 41);
    expect(filas[0].saldo).toBe(56);
  });

  // A5-3: varias entradas y salidas del mismo día
  it('A5-3: varias entradas y salidas del mismo día encadenan en orden canónico', () => {
    const movs = [
      mk('a', '2026-10-06T10:00:00Z', 'purchase', 15, 55),
      mk('b', '2026-10-06T11:00:00Z', 'sale', -3, 52),
      mk('c', '2026-10-06T12:00:00Z', 'sale', -2, 50),
      mk('d', '2026-10-06T15:00:00Z', 'return', 2, 52),
    ];
    const filas = derivarSaldosCronologicos(movs, 40);
    expect(filas.map(f => f.saldo)).toEqual([55, 52, 50, 52]);
  });

  // A5-4: varios movimientos con la MISMA marca temporal → desempate id ASC
  it('A5-4: misma marca temporal: desempate determinista por id', () => {
    const movs = [
      mk('b', '2026-10-16T16:00:00Z', 'issue_slip_out', -2, 37),
      mk('a', '2026-10-16T16:00:00Z', 'sale', -1, 36),
    ];
    const ordenados = ordenarCronologico(movs);
    const filas = derivarSaldosCronologicos(ordenados, 39);
    // orden canónico: a (sale) antes que b (vale) por id
    expect(filas.map(f => f.id)).toEqual(['a', 'b']);
    expect(filas.map(f => f.saldo)).toEqual([38, 36]);
  });

  // A5-5: recepción ANTES de una salida en la misma fecha, y la inversa
  it('A5-5a: recepción (12:00) antes que salida (23:59) misma fecha', () => {
    const movs = [
      mk('r', '2026-10-06T12:00:00Z', 'purchase', 15, 56),
      mk('s', '2026-10-06T23:59:59Z', 'sale', -1, 55),
    ];
    const filas = derivarSaldosCronologicos(ordenarCronologico(movs), 41);
    expect(filas.map(f => f.saldo)).toEqual([56, 55]);
  });

  it('A5-5b: salida (12:00) antes que recepción (23:59) misma fecha — caso real SKU 15', () => {
    // El par real del 06/10: la venta sellada 12:00 se muestra antes que la
    // recepción sellada 23:59:59. El saldo derivado es 40 y después 55 —
    // jamás el salto imposible 41 → 55 → 56 del balance_after de inserción.
    const movs = [
      mk('s', '2026-10-06T12:00:00Z', 'sale', -1, 55),
      mk('r', '2026-10-06T23:59:59Z', 'purchase', 15, 56),
    ];
    const filas = derivarSaldosCronologicos(ordenarCronologico(movs), 41);
    expect(filas.map(f => f.saldo)).toEqual([40, 55]);
  });

  // A5-6: cambio de filtro de período conserva el saldo anterior (saldo inicial)
  it('A5-6: el saldo inicial del período = acumulado anterior (períodos distintos)', () => {
    const historia = [
      mk('1', '2026-09-01T10:00:00Z', 'purchase', 50, 50),
      mk('2', '2026-09-20T10:00:00Z', 'sale', -2, 48),
      mk('3', '2026-10-01T10:00:00Z', 'sale', -5, 43),
    ];
    // Período A: desde 10-01 → saldo inicial 48 (acumulado anterior)
    const periodoA = historia.filter(m => m.created_at >= '2026-10-01');
    const filasA = derivarSaldosCronologicos(ordenarCronologico(periodoA), 48);
    expect(filasA[0].saldo).toBe(43);
    // Período B: todo el historial → saldo inicial 0
    const filasB = derivarSaldosCronologicos(ordenarCronologico(historia), 0);
    expect(filasB.map(f => f.saldo)).toEqual([50, 48, 43]);
  });

  // A5-9: anulación y reverso — fila contraria encadena, el original queda
  it('A5-9: reverso (fila contraria) restituye el saldo sin borrar el original', () => {
    const movs = [
      mk('1', '2026-10-01T10:00:00Z', 'issue_slip_out', -4, 46),
      mk('2', '2026-10-02T10:00:00Z', 'issue_slip_reverse', 4, 50),
    ];
    const filas = derivarSaldosCronologicos(movs, 50);
    expect(filas.map(f => f.saldo)).toEqual([46, 50]);
  });

  // A5-10: devolución de mercancía incrementa el saldo
  it('A5-10: devolución de mercancía (+2) encadena tras la venta', () => {
    const movs = [
      mk('1', '2026-10-01T10:00:00Z', 'sale', -5, 45),
      mk('2', '2026-10-02T10:00:00Z', 'return', 2, 47),
    ];
    const filas = derivarSaldosCronologicos(movs, 50);
    expect(filas.map(f => f.saldo)).toEqual([45, 47]);
  });

  // A5-11: movimiento retroactivo — TODO el submayor se recalcula desde el
  // origen; no se corrige solo la fila afectada dejando saldos obsoletos.
  it('A5-11: retroactivo reordena la cronología y TODA la cadena se deriva de nuevo', () => {
    // El movimiento 3 se INSERTÓ después (balance_after de inserción 75→73)
    // pero su fecha operativa (09-15) es ANTERIOR a los movimientos 1 y 2.
    const insercion = [
      mk('1', '2026-10-01T10:00:00Z', 'sale', -6, 19),
      mk('2', '2026-10-02T10:00:00Z', 'sale', -5, 14),
      mk('3', '2026-09-15T10:00:00Z', 'purchase', 8, 73), // retro-datado
    ];
    const canonico = ordenarCronologico(insercion);
    expect(canonico.map(m => m.id)).toEqual(['3', '1', '2']); // el retroactivo primero
    const filas = derivarSaldosCronologicos(canonico, 12);
    expect(filas.map(f => f.saldo)).toEqual([20, 14, 9]);
  });

  // A5-12: conciliación final con la fuente autoritativa
  it('A5-12: el saldo final derivado reconcilia con Σ quantity_change del ledger', () => {
    // Datos REALES del SKU 15 Cemento Cola (tienda ENERVIDA) extraídos de la
    // BD viva el 2026-10-21: Σ de los 38 movimientos = 66 = inventory.quantity
    // = products.stock_current. El submayor completo (desde 0) cierra en 66.
    const resumen = calcularResumenPeriodo(
      [mk('38', '2026-10-19T16:00:00Z', 'purchase', 35, 66)],
      31 // Σ de los 37 movimientos anteriores
    );
    expect(resumen.saldoFinal).toBe(66);
  });

  it('no muta el arreglo original y preserva los campos del movimiento', () => {
    const movs = [mk('1', '2026-10-01T10:00:00Z', 'sale', -5, 43)];
    const copia = [...movs];
    const filas = derivarSaldosCronologicos(movs, 48);
    expect(movs).toEqual(copia);
    expect(filas[0]).toMatchObject({ id: '1', movement_type: 'sale', quantity_change: -5 });
    expect(filas[0].saldo).toBe(43);
  });

  it('período vacío devuelve lista vacía sin tocar el saldo inicial', () => {
    expect(derivarSaldosCronologicos([], 48)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REGRESIÓN CON DATOS REALES — SKU 15 Cemento Cola (BD viva, 2026-10-21)
//
// El usuario reportó saltos aritméticamente imposibles en el submayor
// (saldo 41 → salida 1 → 55; entrada 15 → 56; 39 → salida 1 → 36 → salida 2
// → 37...). Causa raíz demostrada en la BD viva: `balance_after` se encadena
// por ORDEN DE INSERCIÓN (trigger: inventory.quantity + quantity_change al
// insertar) mientras la vista ordena por (created_at, id) — y los escritores
// sellan created_at con la fecha operativa retro-datable. Reproducción
// EXACTA del período 01/10 → 19/10 con las filas reales:
// ─────────────────────────────────────────────────────────────────────────────

describe('REGRESIÓN SKU 15 Cemento Cola — submayor cronológico (período 01/10→19/10)', () => {
  // Filas reales del período (created_at UTC real, id real truncado a 8,
  // quantity_change real, balance_after ALMACENADO real).
  // La recepción del 06/10 fue INSERTADA antes que la venta del 06/10 (12:00)
  // pese a su created_at 23:59:59; el vale VS-000190 fue insertado antes que
  // la venta del 16/10; el vale VS-000192 fue insertado antes que la
  // recepción del 19/10. Por eso sus balance_after encadenan en un orden que
  // NO es el cronológico.
  const movsOct = [
    mk('65b90f05', '2026-10-01T16:00:00Z', 'sale', -5, 43, 'Venta POS v2'),
    mk('2f433248', '2026-10-02T16:00:00Z', 'sale', -2, 41, 'Venta POS v2'),
    mk('a3873516', '2026-10-06T12:00:00Z', 'sale', -1, 55, 'Venta POS v2'),
    mk('3cc619dd', '2026-10-06T23:59:59Z', 'purchase', 15, 56, 'Recepción de mercancía'),
    mk('926bb056', '2026-10-10T17:00:00Z', 'sale', -1, 54, 'Venta POS v2'),
    mk('ef88916d', '2026-10-12T16:00:00Z', 'sale', -4, 50, 'Venta POS v2'),
    mk('c05f7bfb', '2026-10-14T03:24:58Z', 'sale', -1, 49, 'Venta POS v2'),
    mk('59c8884b', '2026-10-14T16:00:00Z', 'sale', -1, 48, 'Venta POS v2'),
    mk('a6b86c67', '2026-10-14T16:00:00Z', 'issue_slip_out', -3, 45, 'Vale de Salida VS-000181-2026'),
    mk('6b1d79b8', '2026-10-15T16:00:00Z', 'issue_slip_out', -6, 39, 'Vale de Salida VS-000184-2026'),
    mk('4daaf5cf', '2026-10-16T16:00:00Z', 'sale', -1, 36, 'Venta POS v2'),
    mk('bb8fe8c5', '2026-10-16T16:00:00Z', 'issue_slip_out', -2, 37, 'Vale de Salida VS-000190-2026'),
    mk('1aa60398', '2026-10-17T16:00:00Z', 'issue_slip_out', -1, 35, 'Vale de Salida VS-000191-2026'),
    mk('4087e90e', '2026-10-19T16:00:00Z', 'purchase', 35, 66, 'Recepción de mercancía'),
    mk('97e88573', '2026-10-19T16:00:00Z', 'issue_slip_out', -4, 31, 'Vale de Salida VS-000192-2026'),
  ];

  it('el balance_after almacenado, mostrado en orden cronológico, produce saltos imposibles (defecto reproducido)', () => {
    // Evidencia del defecto: con los valores ALMACENADOS en el orden
    // cronológico canónico, al menos 5 transiciones violan
    // saldo = anterior + entrada − salida.
    const ordenados = ordenarCronologico(movsOct);
    const saltos: string[] = [];
    let anterior = 48; // saldo inicial real del período (Σ previa al 01/10)
    for (const m of ordenados) {
      const esperado = anterior + m.quantity_change;
      if ((m.balance_after ?? 0) !== esperado) {
        saltos.push(`${m.id}: esperado ${esperado}, almacenado ${m.balance_after}`);
      }
      anterior = esperado;
    }
    expect(saltos.length).toBeGreaterThanOrEqual(5); // el defecto existe HOY
  });

  it('el saldo DERIVADO encadena sin saltos: cada fila = anterior + entrada − salida', () => {
    const ordenados = ordenarCronologico(movsOct);
    const filas = derivarSaldosCronologicos(ordenados, 48);
    // Esperado cronológico exacto (desempate id ASC en 14/16/19 igual-fecha):
    expect(filas.map(f => f.saldo)).toEqual([
      43, // 01/10 venta −5
      41, // 02/10 venta −2
      40, // 06/10 12:00 venta −1 (ANTES de la recepción 23:59)
      55, // 06/10 23:59 recepción +15
      54, // 10/10 venta −1
      50, // 12/10 venta −4
      49, // 14/10 03:24 venta −1
      48, // 14/10 16:00 venta −1 (id 59c… < a6b…)
      45, // 14/10 16:00 vale −3
      39, // 15/10 vale −6
      38, // 16/10 venta −1 (id 4da… < bb8…)
      36, // 16/10 vale −2
      35, // 17/10 vale −1
      70, // 19/10 recepción +35 (id 408… < 97e…)
      66, // 19/10 vale −4
    ]);
  });

  it('el saldo final del período reconcilia con la existencia autoritativa (66)', () => {
    // Σ total del ledger real (38 movimientos) = 66 = inventory.quantity
    // = products.stock_current verificados en la BD viva el 2026-10-21.
    // Σ previa al 01/10 = 48 (33−6−5−1−1−7−1−4+19−2−1−3−1−1−1−5−4−1−1−4−3+50−2).
    const resumen = calcularResumenPeriodo(ordenarCronologico(movsOct), 48);
    expect(resumen.saldoFinal).toBe(66);
    expect(resumen.entradas).toBe(50); // 15 + 35
    expect(resumen.salidas).toBe(32); // 5+2+1+1+4+1+1+3+6+1+2+1+4
    expect(resumen.cantidadMovimientos).toBe(15);
  });

  it('los documentos VS-000181/184/190/191/192 reducen existencias exactamente una vez', () => {
    const vales = ordenarCronologico(movsOct).filter(m => m.movement_type === 'issue_slip_out');
    expect(vales.map(v => v.reference_doc)).toEqual([
      'Vale de Salida VS-000181-2026',
      'Vale de Salida VS-000184-2026',
      'Vale de Salida VS-000190-2026',
      'Vale de Salida VS-000191-2026',
      'Vale de Salida VS-000192-2026',
    ]);
    expect(vales.reduce((s, v) => s + v.quantity_change, 0)).toBe(-16); // −3−6−2−1−4
  });
});
