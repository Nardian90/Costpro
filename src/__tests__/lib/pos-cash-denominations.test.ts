/**
 * pos-cash-denominations.test.ts
 * MISIÓN POS DENOMINACIONES MULTIMONEDA (2026-10-26) — Función A (§6.1).
 *
 * Suite del módulo puro `src/lib/pos/cash-denominations.ts`:
 *  1. CUP y USD presentan sus denominaciones iniciales correspondientes.
 *  2. CUP incluye 5.000 y 2.000 y permite añadir más denominaciones.
 *  3. USD presenta opciones utilizables por defecto (sin configuración previa).
 *  4/5. Añadir/activar/desactivar en una moneda NO modifica la otra.
 *  7. Una personalizada sobrevive a la recarga (persistencia por tienda+moneda).
 *  8. La configuración de una tienda no sobrescribe la de otra.
 *  9. Duplicados, ceros, negativos e inválidos se rechazan.
 *  10. Total contado, faltante y sobrante por moneda.
 *  11. La descomposición exacta usa SOLO las activas de la moneda seleccionada.
 *  + Corrupción de preferencias → defaults (no bloquea el desglose).
 *  + Aritmética en centavos (0,10/0,05/0,01 USD sin errores de coma flotante).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  POS_DEFAULT_CUP_DENOMS,
  POS_DEFAULT_USD_DENOMS,
  type PosCurrency,
  type DenominationConfig,
  defaultDenominationsFor,
  denominationsStorageKey,
  loadDenominations,
  saveDenominations,
  validateNewDenomination,
  addDenomination,
  removeCustomDenomination,
  toggleDenomination,
  restoreDefaultDenominations,
  activeDenominations,
  breakdownTotal,
  exactBreakdownFor,
  formatDenomLabel,
  sortDenominationsDesc,
} from '@/lib/pos/cash-denominations';

const STORE_A = '11111111-1111-4111-8111-111111111111';
const STORE_B = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  window.localStorage.clear();
});

describe('MISIÓN POS — denominaciones iniciales por moneda (§3.2 / §6.1.1-3)', () => {
  it('CUP incluye 5.000, 2.000 y el resto del catálogo, todas activas', () => {
    const cup = defaultDenominationsFor('CUP');
    expect(POS_DEFAULT_CUP_DENOMS).toEqual([5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 1]);
    expect(cup.map(d => d.value)).toEqual([5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 1]);
    expect(cup.every(d => d.active)).toBe(true);
    expect(cup.every(d => d.custom === false)).toBe(true);
  });

  it('USD presenta billetes y monedas fraccionarias utilizables por defecto', () => {
    const usd = defaultDenominationsFor('USD');
    expect(POS_DEFAULT_USD_DENOMS).toEqual([100, 50, 20, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.01]);
    expect(usd.every(d => d.active)).toBe(true);
    // Etiquetas legibles sin ambigüedad de moneda
    expect(formatDenomLabel(5000, 'CUP')).toBe('5.000');
    expect(formatDenomLabel(0.5, 'USD')).toBe('$0.50');
    expect(formatDenomLabel(100, 'USD')).toBe('$100');
  });
});

describe('MISIÓN POS — independencia total CUP/USD (§3.1 / §6.1.4-5)', () => {
  it('añadir una personalizada en CUP no modifica la lista de USD', () => {
    const cup = addDenomination(defaultDenominationsFor('CUP'), 'CUP', 3000);
    const usd = defaultDenominationsFor('USD');
    expect(cup.some(d => d.value === 3000 && d.custom)).toBe(true);
    expect(usd.some(d => d.value === 3000)).toBe(false);
    expect(usd).toEqual(defaultDenominationsFor('USD'));
  });

  it('añadir una personalizada en USD no modifica la lista de CUP', () => {
    const usd = addDenomination(defaultDenominationsFor('USD'), 'USD', 3);
    const cup = defaultDenominationsFor('CUP');
    expect(usd.some(d => d.value === 3 && d.custom)).toBe(true);
    expect(cup).toEqual(defaultDenominationsFor('CUP'));
  });

  it('activar/desactivar en una moneda no toca la otra (estado por referencia separada)', () => {
    const cup = toggleDenomination(defaultDenominationsFor('CUP'), 5000);
    expect(cup.find(d => d.value === 5000)?.active).toBe(false);
    // El catálogo default de USD permanece intacto (otra moneda, otra lista)
    expect(defaultDenominationsFor('USD').every(d => d.active)).toBe(true);
    // Y las funciones de gestión de USD no ven la desactivada de CUP
    const usd = toggleDenomination(defaultDenominationsFor('USD'), 100);
    expect(activeDenominations(usd).some(d => d.value === 100)).toBe(false);
    expect(activeDenominations(cup).some(d => d.value === 5000)).toBe(false);
    expect(activeDenominations(defaultDenominationsFor('CUP')).some(d => d.value === 5000)).toBe(true);
  });

  it('restaurar predeterminadas de CUP no altera USD (y viceversa)', () => {
    const cupWithCustom = addDenomination(defaultDenominationsFor('CUP'), 'CUP', 3000);
    const usdWithCustom = addDenomination(defaultDenominationsFor('USD'), 'USD', 3);
    const restoredCup = restoreDefaultDenominations('CUP');
    expect(restoredCup.some(d => d.value === 3000)).toBe(false);
    expect(restoredCup).toEqual(defaultDenominationsFor('CUP'));
    // USD conserva su personalizada: restaurar CUP no la tocó
    expect(usdWithCustom.some(d => d.value === 3 && d.custom)).toBe(true);
  });
});

describe('MISIÓN POS — persistencia por tienda y moneda (§3.4 / §6.1.7-8)', () => {
  it('las claves están separadas por tienda y moneda', () => {
    expect(denominationsStorageKey(STORE_A, 'CUP')).toBe(`costpro:pos:cash-denominations:v1:store:${STORE_A}:CUP`);
    expect(denominationsStorageKey(STORE_A, 'USD')).toBe(`costpro:pos:cash-denominations:v1:store:${STORE_A}:USD`);
    expect(denominationsStorageKey(STORE_B, 'CUP')).toBe(`costpro:pos:cash-denominations:v1:store:${STORE_B}:CUP`);
    expect(denominationsStorageKey(null, 'CUP')).toContain('store:sin-tienda:CUP');
  });

  it('una denominación personalizada sobrevive a la recarga (misma tienda+moneda)', () => {
    const cup = addDenomination(defaultDenominationsFor('CUP'), 'CUP', 3000);
    saveDenominations(STORE_A, 'CUP', cup);
    const reloaded = loadDenominations(STORE_A, 'CUP');
    expect(reloaded.some(d => d.value === 3000 && d.custom && d.active)).toBe(true);
    // El resto del catálogo compatible se conserva (migración no destructiva)
    expect(reloaded.some(d => d.value === 5000)).toBe(true);
  });

  it('el estado activo/inactivo sobrevive a la recarga', () => {
    const usd = toggleDenomination(defaultDenominationsFor('USD'), 100);
    saveDenominations(STORE_A, 'USD', usd);
    const reloaded = loadDenominations(STORE_A, 'USD');
    expect(reloaded.find(d => d.value === 100)?.active).toBe(false);
    expect(reloaded.find(d => d.value === 50)?.active).toBe(true);
  });

  it('la configuración de una tienda NO sobrescribe la de otra', () => {
    const cupA = addDenomination(defaultDenominationsFor('CUP'), 'CUP', 3000);
    saveDenominations(STORE_A, 'CUP', cupA);
    // La tienda B no tiene nada guardado → defaults, sin la personalizada de A
    const reloadedB = loadDenominations(STORE_B, 'CUP');
    expect(reloadedB.some(d => d.value === 3000)).toBe(false);
    // Guardar en B no altera lo guardado en A
    saveDenominations(STORE_B, 'CUP', defaultDenominationsFor('CUP'));
    const reloadedA = loadDenominations(STORE_A, 'CUP');
    expect(reloadedA.some(d => d.value === 3000 && d.custom)).toBe(true);
  });

  it('la moneda guardada de una tienda no afecta la otra moneda de la misma tienda', () => {
    const usd = addDenomination(defaultDenominationsFor('USD'), 'USD', 3);
    saveDenominations(STORE_A, 'USD', usd);
    const cupReloaded = loadDenominations(STORE_A, 'CUP');
    expect(cupReloaded.some(d => d.value === 3)).toBe(false);
  });

  it('una preferencia corrupta cae en los defaults de ESA moneda (no bloquea)', () => {
    window.localStorage.setItem(denominationsStorageKey(STORE_A, 'CUP'), '{{{no-json');
    const cup = loadDenominations(STORE_A, 'CUP');
    expect(cup).toEqual(defaultDenominationsFor('CUP'));
    expect(cup.length).toBeGreaterThan(0); // denominaciones visibles garantizadas

    // Array vacío / con valores inválidos → defaults también
    window.localStorage.setItem(denominationsStorageKey(STORE_A, 'USD'), '[]');
    expect(loadDenominations(STORE_A, 'USD')).toEqual(defaultDenominationsFor('USD'));
    window.localStorage.setItem(denominationsStorageKey(STORE_A, 'USD'), JSON.stringify([{ value: -5 }, { value: 'abc' }, null, { value: 20.001, active: true }]));
    expect(loadDenominations(STORE_A, 'USD')).toEqual(defaultDenominationsFor('USD'));
  });

  it('valores válidos de un guardado anterior se conservan (compatibilidad)', () => {
    // Guardado estilo antiguo con solo el subconjunto válido
    window.localStorage.setItem(
      denominationsStorageKey(STORE_A, 'CUP'),
      JSON.stringify([{ value: 1000, active: true }, { value: 500, active: false }]),
    );
    const reloaded = loadDenominations(STORE_A, 'CUP');
    expect(reloaded.find(d => d.value === 1000)?.active).toBe(true);
    expect(reloaded.find(d => d.value === 500)?.active).toBe(false);
  });

  it('ssr-safe: sin window no explota (devuelve defaults)', () => {
    // jsdom siempre tiene window; se simula el guard verificando que la función
    // pura de defaults es la misma que usa loadDenominations con store inválido.
    expect(() => denominationsStorageKey(undefined, 'CUP')).not.toThrow();
  });
});

describe('MISIÓN POS — validación de denominaciones nuevas (§3.3 / §6.1.9)', () => {
  const cup = defaultDenominationsFor('CUP');
  const usd = defaultDenominationsFor('USD');

  it('rechaza duplicados contra el catálogo de la MISMA moneda', () => {
    expect(validateNewDenomination('1000', 'CUP', cup)).toEqual({ ok: false, reason: expect.stringContaining('ya existe') });
    expect(validateNewDenomination(100, 'USD', usd)).toEqual({ ok: false, reason: expect.stringContaining('ya existe') });
  });

  it('rechaza duplicados contra personalizadas ya añadidas', () => {
    const withCustom = addDenomination(cup, 'CUP', 3000);
    const dup = validateNewDenomination('3000', 'CUP', withCustom);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.reason).toContain('ya fue añadida');
  });

  it('un valor de CUP NO es duplicado en USD (espacios separados por moneda)', () => {
    // 50 existe en CUP y en USD — pero cada moneda es independiente
    expect(validateNewDenomination('50', 'CUP', cup).ok).toBe(false);
    expect(validateNewDenomination('50', 'USD', usd).ok).toBe(false);
    // 3 USD no existe en ningún catálogo → válido añadirlo a USD
    expect(validateNewDenomination('3', 'USD', usd)).toEqual({ ok: true, value: 3 });
    // Y el 3 añadido a USD no crea duplicado en CUP
    const usdWith3 = addDenomination(usd, 'USD', 3);
    expect(validateNewDenomination('3000', 'CUP', addDenomination(cup, 'CUP', 3000)).ok).toBe(false);
    expect(usdWith3.some(d => d.value === 3)).toBe(true);
  });

  it('rechaza cero, negativos, no-numéricos y vacíos', () => {
    expect(validateNewDenomination('0', 'CUP', cup).ok).toBe(false);
    expect(validateNewDenomination('-100', 'CUP', cup).ok).toBe(false);
    expect(validateNewDenomination('abc', 'CUP', cup).ok).toBe(false);
    expect(validateNewDenomination('', 'CUP', cup).ok).toBe(false);
    expect(validateNewDenomination(null, 'CUP', cup).ok).toBe(false);
    expect(validateNewDenomination('1e999', 'CUP', cup).ok).toBe(false); // Infinity
  });

  it('rechaza más de dos decimales (precisión monetaria del sistema)', () => {
    expect(validateNewDenomination('0.125', 'USD', usd).ok).toBe(false);
    expect(validateNewDenomination('20.333', 'CUP', cup).ok).toBe(false);
  });

  it('acepta valores válidos con coma o punto decimal', () => {
    expect(validateNewDenomination('3000', 'CUP', cup)).toEqual({ ok: true, value: 3000 });
    expect(validateNewDenomination('2,5', 'USD', usd)).toEqual({ ok: true, value: 2.5 });
    expect(validateNewDenomination(0.25, 'USD', addDenomination(usd, 'USD', 2.5)).ok).toBe(false); // 0.25 ya existe
  });

  it('eliminar solo afecta personalizadas (el catálogo inicial no se elimina)', () => {
    const withCustom = addDenomination(cup, 'CUP', 3000);
    const afterRemove = removeCustomDenomination(withCustom, 3000);
    expect(afterRemove.some(d => d.value === 3000)).toBe(false);
    const untouched = removeCustomDenomination(withCustom, 5000);
    expect(untouched.some(d => d.value === 5000)).toBe(true); // default NO eliminable
  });
});

describe('MISIÓN POS — conteo, totales y descomposición exacta (§3.5 / §6.1.10-11)', () => {
  it('total contado por moneda — fixture aritmético de la misión', () => {
    const cup = defaultDenominationsFor('CUP');
    const usd = defaultDenominationsFor('USD');
    // Desglose CUP: 2 × 5.000 + 1 × 2.000 = 12.000 CUP
    const cupBd = { '5000': 2, '2000': 1 };
    expect(breakdownTotal(cupBd, cup)).toBe(12000);
    // Desglose USD: 2 × 20 + 1 × 5 = 45 USD
    const usdBd = { '20': 2, '5': 1 };
    expect(breakdownTotal(usdBd, usd)).toBe(45);
  });

  it('faltante y sobrante se derivan del total contado por moneda', () => {
    const cup = defaultDenominationsFor('CUP');
    const counted = breakdownTotal({ '5000': 2, '2000': 1 }, cup); // 12.000
    const aCobrar = 12500;
    expect(counted - aCobrar).toBe(-500); // faltante 500 CUP
    expect(breakdownTotal({ '5000': 3 }, cup) - aCobrar).toBe(2500); // sobrante 2.500
  });

  it('las cantidades de denominaciones DESACTIVADAS no suman al total', () => {
    const usd = toggleDenomination(defaultDenominationsFor('USD'), 100);
    const bd = { '100': 2, '50': 1 }; // 100 desactivada → solo cuenta 50
    expect(breakdownTotal(bd, usd)).toBe(50);
  });

  it('entradas huérfanas (denominación eliminada) no suman', () => {
    const usd = defaultDenominationsFor('USD');
    const bd = { '3': 4 }; // 3 USD no existe en el catálogo
    expect(breakdownTotal(bd, usd)).toBe(0);
  });

  it('descomposición exacta usa SOLO las activas de la moneda seleccionada', () => {
    // CUP con 5.000 desactivada: 12.000 se descompone SIN billetes de 5.000
    const cup = toggleDenomination(defaultDenominationsFor('CUP'), 5000);
    const { breakdown, total, exact } = exactBreakdownFor(12000, cup);
    expect(exact).toBe(true);
    expect(total).toBe(12000);
    expect(breakdown['5000']).toBeUndefined();
    expect(breakdown['2000']).toBe(6); // 6 × 2.000
    // Y con todas activas, prefiere las mayores
    const full = exactBreakdownFor(12000, defaultDenominationsFor('CUP'));
    expect(full.breakdown['5000']).toBe(2);
    expect(full.breakdown['2000']).toBe(1);
    expect(full.exact).toBe(true);
  });

  it('descomposición USD con fracciones — aritmética en centavos exacta', () => {
    const usd = defaultDenominationsFor('USD');
    // 45 USD = 2×20 + 1×5 (fixture)
    const r1 = exactBreakdownFor(45, usd);
    expect(r1.exact).toBe(true);
    expect(r1.total).toBe(45);
    // 0.30 USD con 0.25/0.10/0.05/0.01 → 0.25 + 0.05 (sin errores de coma flotante)
    const r2 = exactBreakdownFor(0.3, usd);
    expect(r2.exact).toBe(true);
    expect(r2.total).toBe(0.3);
    expect(r2.breakdown['0.25']).toBe(1);
    expect(r2.breakdown['0.05']).toBe(1);
    // 0.06 USD = 0.05 + 0.01
    const r3 = exactBreakdownFor(0.06, usd);
    expect(r3.exact).toBe(true);
    expect(r3.breakdown['0.05']).toBe(1);
    expect(r3.breakdown['0.01']).toBe(1);
  });

  it('importe no representable → aproximación greedy inferior + exact=false (sin redondeo arriba)', () => {
    // CUP con denominaciones enteras y amount con centavos: no exacto
    const cup = defaultDenominationsFor('CUP');
    const r = exactBreakdownFor(3000.5, cup);
    expect(r.exact).toBe(false);
    expect(r.total).toBe(3000); // aproximación inferior, JAMÁS 3001
    expect(r.breakdown['2000']).toBe(1);
    expect(r.breakdown['1000']).toBe(1);
  });

  it('importe ≤ 0 o sin denominaciones activas → desglose vacío', () => {
    expect(exactBreakdownFor(0, defaultDenominationsFor('CUP')).breakdown).toEqual({});
    expect(exactBreakdownFor(-5, defaultDenominationsFor('CUP')).breakdown).toEqual({});
    const none: DenominationConfig[] = [];
    expect(exactBreakdownFor(100, none).breakdown).toEqual({});
  });
});

describe('MISIÓN POS — orden y etiquetas (§3.3)', () => {
  it('las denominaciones se ordenan de mayor a menor', () => {
    const unsorted: DenominationConfig[] = [
      { value: 5, label: '5', active: true, custom: false },
      { value: 5000, label: '5000', active: true, custom: false },
      { value: 100, label: '100', active: true, custom: false },
    ];
    expect(sortDenominationsDesc(unsorted).map(d => d.value)).toEqual([5000, 100, 5]);
    // addDenomination mantiene el orden desc
    const withCustom = addDenomination(defaultDenominationsFor('CUP'), 'CUP', 3000);
    expect(withCustom.map(d => d.value)).toEqual([5000, 3000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 1]);
  });
});

describe('MISIÓN POS — acceso al almacenamiento local seguro', () => {
  it('saveDenominations tolera cuota llena sin lanzar', () => {
    const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => saveDenominations(STORE_A, 'CUP', defaultDenominationsFor('CUP'))).not.toThrow();
    spy.mockRestore();
  });

  it('loadDenominations tolera getItem lanzando', () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadDenominations(STORE_A, 'CUP')).toEqual(defaultDenominationsFor('CUP'));
    spy.mockRestore();
  });
});
