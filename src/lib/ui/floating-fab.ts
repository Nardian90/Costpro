/**
 * DRAGGABLE FAB — lógica pura del botón flotante del agente IA (Darian).
 *
 * Problema: el icono flotante puede tapar contenido importante.
 * Solución estándar internacional (patrón «chat head» / AssistiveTouch —
 * Material Design FAB & WCAG 2.5.7 «Dragging Movements»):
 *  · Arrastrable con Pointer Events (mouse/touch/lápiz).
 *  · El arrastre SOLO reposiciona; abrir el chat sigue siendo un tap/click
 *    normal (el arrastre nunca es la única vía — WCAG 2.5.7).
 *  · Imán a bordes (snap al borde horizontal más cercano) al soltar.
 *  · Posición persistida en localStorage (recuerda dónde lo dejaste).
 *  · Clamp estricto al viewport (nunca fuera de pantalla, ni tras resize).
 *
 * Este módulo es puro (sin DOM) para poder testearlo con vitest.
 */

export const FAB_SIZE = 56; // w-14 h-14 (px)
export const FAB_MARGIN = 16; // bottom-4/right-4 → 1rem
export const DRAG_THRESHOLD_PX = 6; // < 6px de recorrido = click, no drag
export const FAB_POS_STORAGE_KEY = 'costpro.chatbot-fab-pos.v1';

export interface FabPos {
  /** left en px (coords de viewport) */
  x: number;
  /** top en px (coords de viewport) */
  y: number;
}

/** Mantén el FAB íntegramente dentro del viewport, con margen mínimo. */
export function clampFabPos(
  pos: FabPos,
  viewportW: number,
  viewportH: number,
  size: number = FAB_SIZE,
  margin: number = FAB_MARGIN
): FabPos {
  const minX = margin;
  const maxX = Math.max(minX, viewportW - size - margin);
  const minY = margin;
  const maxY = Math.max(minY, viewportH - size - margin);
  return {
    x: Math.min(maxX, Math.max(minX, Math.round(pos.x))),
    y: Math.min(maxY, Math.max(minY, Math.round(pos.y))),
  };
}

/** Imán horizontal: devuelve la x del borde (izq/der) más cercano. */
export function snapFabX(
  x: number,
  viewportW: number,
  size: number = FAB_SIZE,
  margin: number = FAB_MARGIN
): number {
  const left = margin;
  const right = viewportW - size - margin;
  if (right <= left) return left; // viewport más estrecho que el FAB
  return x + size / 2 < viewportW / 2 ? left : right;
}

/** Lee la posición guardada (tolerante a datos corruptos/obsoletos). */
export function loadFabPos(
  storage: Pick<Storage, 'getItem'> | null,
  viewportW: number,
  viewportH: number
): FabPos | null {
  try {
    const raw = storage?.getItem(FAB_POS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FabPos>;
    if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number') return null;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    return clampFabPos({ x: parsed.x, y: parsed.y }, viewportW, viewportH);
  } catch {
    return null;
  }
}

/** Persiste la posición (best-effort: storage lleno/no disponible → ignora). */
export function saveFabPos(
  storage: Pick<Storage, 'setItem'> | null,
  pos: FabPos
): void {
  try {
    storage?.setItem(FAB_POS_STORAGE_KEY, JSON.stringify(pos));
  } catch {
    /* noop */
  }
}

/** Umbral de arrastre: ¿el recorrido desde el origen supera DRAG_THRESHOLD_PX? */
export function exceededDragThreshold(
  dx: number,
  dy: number,
  threshold: number = DRAG_THRESHOLD_PX
): boolean {
  return Math.hypot(dx, dy) >= threshold;
}
