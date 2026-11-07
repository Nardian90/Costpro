/**
 * DRAGGABLE FAB — pruebas de la lógica geométrica pura
 * (src/lib/ui/floating-fab.ts) del icono flotante del agente IA.
 *
 * Cubre: clamp al viewport, imán a bordes, umbral click vs arrastre,
 * persistencia tolerante a datos corruptos y re-clamp tras resize.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clampFabPos,
  exceededDragThreshold,
  loadFabPos,
  saveFabPos,
  snapFabX,
  DRAG_THRESHOLD_PX,
  FAB_MARGIN,
  FAB_SIZE,
  FAB_POS_STORAGE_KEY,
} from '@/lib/ui/floating-fab';

// Viewport de prueba estándar (desktop)
const VW = 1440;
const VH = 900;

describe('clampFabPos — nunca fuera de pantalla', () => {
  it('posición válida pasa tal cual (redondeada)', () => {
    expect(clampFabPos({ x: 100.4, y: 200.6 }, VW, VH)).toEqual({ x: 100, y: 201 });
  });

  it('esquina inferior derecha por defecto (1440×900): 1440-56-16 = 1368, 900-56-16 = 828', () => {
    expect(clampFabPos({ x: VW - FAB_SIZE - FAB_MARGIN, y: VH - FAB_SIZE - FAB_MARGIN }, VW, VH))
      .toEqual({ x: 1368, y: 828 });
  });

  it('x/y negativos se traen al margen mínimo', () => {
    expect(clampFabPos({ x: -500, y: -500 }, VW, VH)).toEqual({ x: FAB_MARGIN, y: FAB_MARGIN });
  });

  it('más allá del borde derecho/inferior se trae al máximo', () => {
    expect(clampFabPos({ x: 5000, y: 5000 }, VW, VH))
      .toEqual({ x: 1368, y: 828 });
  });

  it('viewport más pequeño que el FAB no produce máximos invertidos', () => {
    expect(clampFabPos({ x: -100, y: -100 }, 40, 40)).toEqual({ x: FAB_MARGIN, y: FAB_MARGIN });
    expect(clampFabPos({ x: 9999, y: 9999 }, 40, 40)).toEqual({ x: FAB_MARGIN, y: FAB_MARGIN });
  });

  it('re-clamp tras resize a viewport menor: posición guardada sigue visible', () => {
    const guardada = clampFabPos({ x: 1368, y: 828 }, VW, VH);
    // viewport más alto: y=828 sigue siendo válido → no se mueve
    expect(clampFabPos(guardada, 768, 1024)).toEqual({ x: 768 - FAB_SIZE - FAB_MARGIN, y: 828 });
    // viewport más bajo (600): y debe traerse al máximo visible
    const re = clampFabPos(guardada, 768, 600);
    expect(re.x).toBe(768 - FAB_SIZE - FAB_MARGIN);
    expect(re.y).toBe(600 - FAB_SIZE - FAB_MARGIN);
  });
});

describe('snapFabX — imán al borde horizontal más cercano', () => {
  it('mitad izquierda del viewport → borde izquierdo', () => {
    expect(snapFabX(100, VW)).toBe(FAB_MARGIN);
    expect(snapFabX(1440 / 2 - FAB_SIZE / 2 - 1, VW)).toBe(FAB_MARGIN);
  });

  it('mitad derecha del viewport → borde derecho', () => {
    expect(snapFabX(1000, VW)).toBe(VW - FAB_SIZE - FAB_MARGIN);
  });

  it('viewport más estrecho que el FAB → borde izquierdo (sin inversión)', () => {
    expect(snapFabX(0, 40)).toBe(FAB_MARGIN);
  });
});

describe('exceededDragThreshold — separar click de arrastre (WCAG 2.5.7)', () => {
  it('micro-movimiento (< 6px) sigue siendo click', () => {
    expect(exceededDragThreshold(3, 4)).toBe(false); // hipot = 5 < 6
    expect(exceededDragThreshold(0, 0)).toBe(false);
  });

  it('recorrido ≥ 6px es arrastre', () => {
    expect(exceededDragThreshold(6, 0)).toBe(true);
    expect(exceededDragThreshold(4, 5)).toBe(true); // hipot = 6.40 ≥ 6
    expect(exceededDragThreshold(100, 100)).toBe(true);
    expect(DRAG_THRESHOLD_PX).toBe(6);
  });
});

describe('persistencia — loadFabPos / saveFabPos', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    globalThis.localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { store = {}; },
      key: () => null,
      get length() { return Object.keys(store).length; },
    } as Storage;
  });

  it('round-trip: lo guardado se lee igual (y dentro de límites)', () => {
    const pos = { x: 300, y: 400 };
    saveFabPos(globalThis.localStorage, pos);
    expect(store[FAB_POS_STORAGE_KEY]).toBe(JSON.stringify(pos));
    expect(loadFabPos(globalThis.localStorage, VW, VH)).toEqual(pos);
  });

  it('sin posición guardada → null (FAB usa su ancla CSS por defecto)', () => {
    expect(loadFabPos(globalThis.localStorage, VW, VH)).toBeNull();
    expect(loadFabPos(null, VW, VH)).toBeNull();
  });

  it('JSON corrupto → null sin lanzar', () => {
    store[FAB_POS_STORAGE_KEY] = '{no-es-json';
    expect(loadFabPos(globalThis.localStorage, VW, VH)).toBeNull();
  });

  it('tipos incorrectos / NaN / Infinity → null sin lanzar', () => {
    store[FAB_POS_STORAGE_KEY] = JSON.stringify({ x: '300', y: 400 });
    expect(loadFabPos(globalThis.localStorage, VW, VH)).toBeNull();
    store[FAB_POS_STORAGE_KEY] = '{"x":NaN,"y":400}';
    expect(loadFabPos(globalThis.localStorage, VW, VH)).toBeNull();
    store[FAB_POS_STORAGE_KEY] = '{"x":1e999,"y":400}';
    expect(loadFabPos(globalThis.localStorage, VW, VH)).toBeNull();
  });

  it('posición obsoleta por cambio de resolución se re-clampa al leer', () => {
    store[FAB_POS_STORAGE_KEY] = JSON.stringify({ x: 1368, y: 828 });
    expect(loadFabPos(globalThis.localStorage, 800, 600))
      .toEqual({ x: 800 - FAB_SIZE - FAB_MARGIN, y: 600 - FAB_SIZE - FAB_MARGIN });
  });

  it('storage lleno (setItem lanza) no rompe la UI', () => {
    const lleno: Pick<Storage, 'setItem'> = {
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    expect(() => saveFabPos(lleno, { x: 1, y: 2 })).not.toThrow();
    expect(() => saveFabPos(null, { x: 1, y: 2 })).not.toThrow();
  });
});
