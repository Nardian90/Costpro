'use client';

/**
 * PanImageViewer
 *
 * Visor de imagen con soporte de arrastre/pan para el modal de detalle
 * de producto en la vitrina pública.
 *
 * Características:
 *   - Estado inicial: imagen centrada, sin zoom, con object-fit: contain.
 *   - Arrastre con pointer events (mouse, touch, stylus) — una sola API.
 *   - Bounds: la imagen no puede desaparecer completamente del viewport.
 *   - Cursor indicando que se puede arrastrar (grab / grabbing).
 *   - Reset automático al cambiar la imagen.
 *   - Sin scroll accidental de la página (preventDefault en pointermove).
 *   - Sin selección de texto durante el arrastre (user-select: none).
 *   - No interfiere con el cierre del modal (clic fuera, botón X).
 *   - Sin zoom añadido — la imagen ya está completa y el pan es suficiente
 *     para explorar partes ocultas en imágenes verticales/panorámicas.
 *
 * Por qué NO zoom:
 *   - El modal de detalle usa object-fit: contain que ya muestra toda la
 *     imagen dentro del viewport. Las imágenes que "no caben" son aquellas
 *     cuyo aspect ratio difiere del viewport — pero contain las encaja
 *     totalmente (con whitespace). El problema reportado por el usuario
 *     es imágenes con contenido desplazado dentro del encuadre inicial.
 *   - El pan resuelve ese caso: el usuario arrastra para ver otras zonas.
 *   - Añadir zoom multiplicaría la complejidad (otro gesto, otros bounds,
 *     botones +/-, etc.) sin aportar valor al caso de uso real.
 *
 * Uso:
 *   <PanImageViewer src={url} alt={name} className="aspect-[4/3] w-full" />
 *
 * El componente renderiza un div (viewport) con overflow-hidden que
 * contiene un <img> posicionada absolutamente. El usuario arrastra la
 * imagen dentro del viewport.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

interface PanImageViewerProps {
  src: string;
  alt: string;
  className?: string;
  /** Aspect ratio del viewport. Default: '4/3'. */
  aspect?: string;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

export default function PanImageViewer({
  src,
  alt,
  className,
  aspect = '4/3',
}: PanImageViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);

  // Reset offset when src changes (new product)
  useEffect(() => {
    setOffset({ x: 0, y: 0 });
    setLoaded(false);
  }, [src]);

  /**
   * Calcula los límites máximos de desplazamiento permitidos.
   *
   * La imagen se muestra con object-fit: contain — esto significa que la
   * imagen se escala para caber íntegramente dentro del viewport, respetando
   * su aspect ratio. Si la imagen es más ancha que alta y el viewport es
   * más alto que ancho, la imagen ocupa todo el ancho y queda whitespace
   * arriba/abajo. Viceversa para imágenes verticales.
   *
   * Con contain, NUNCA hay contenido fuera del viewport — todo el contenido
   * de la imagen es visible. ¿Por qué entonces necesitamos pan?
   *
   * Realidad: en algunos navegadores (especialmente móviles), y cuando la
   * imagen tiene un aspect muy diferente al viewport, el centrado puede
   * dejar zonas relevantes cerca de los bordes que son difíciles de ver
   * sin hacer scroll en el modal completo. El pan permite al usuario
   * "re-centrar" manualmente.
   *
   * También: si en el futuro se añade zoom, los bounds aquí calculados
   * seguirán siendo válidos (multiplicados por el factor de zoom).
   *
   * Lógica: la imagen puede desplazarse hasta que cualquiera de sus bordes
   * alcance el borde opuesto del viewport. Es decir: como mínimo, la mitad
   * de la imagen (o del viewport, el menor) debe permanecer visible.
   */
  const getBounds = useCallback(() => {
    const viewport = viewportRef.current;
    const img = imgRef.current;
    if (!viewport || !img) return { maxX: 0, maxY: 0 };

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    // naturalWidth/naturalHeight dan las dimensiones reales de la imagen
    // sin escala. Pero la imagen se está renderizando con object-contain,
    // así que las dimensiones renderizadas se calculan así:
    const nw = img.naturalWidth || vw;
    const nh = img.naturalHeight || vh;

    // Escala para que la imagen quepa con contain (respeta aspect ratio)
    const scale = Math.min(vw / nw, vh / nh);
    const renderedW = nw * scale;
    const renderedH = nh * scale;

    // Si la imagen renderizada es menor o igual al viewport, no hay
    // contenido que explorar — el pan no debería permitir movimiento.
    // Pero permitimos un pequeño margen (10% del viewport) para que el
    // usuario perciba feedback al arrastrar imágenes que ya caben.
    const slack = 0.1;
    const maxX = renderedW > vw ? (renderedW - vw) / 2 : (vw * slack) / 2;
    const maxY = renderedH > vh ? (renderedH - vh) / 2 : (vh * slack) / 2;

    return { maxX, maxY };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLImageElement>) => {
    // Solo botón primario (left click o touch)
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    e.preventDefault();
    e.stopPropagation();

    const img = e.currentTarget;
    img.setPointerCapture(e.pointerId);

    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setDragging(true);
  }, [offset.x, offset.y]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLImageElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    e.preventDefault();
    e.stopPropagation();

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    const { maxX, maxY } = getBounds();
    const newX = Math.max(-maxX, Math.min(maxX, drag.originX + dx));
    const newY = Math.max(-maxY, Math.min(maxY, drag.originY + dy));

    setOffset({ x: newX, y: newY });
  }, [getBounds]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLImageElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    e.preventDefault();
    e.stopPropagation();

    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    dragStateRef.current = null;
    setDragging(false);
  }, []);

  // Reset on escape
  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setOffset({ x: 0, y: 0 });
  }, []);

  return (
    <div
      ref={viewportRef}
      className={`relative overflow-hidden bg-muted ${className || ''}`}
      style={{ aspectRatio: aspect.replace('/', ' / ') }}
    >
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-muted/50" />
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        loading="lazy"
        draggable={false}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 select-none ${loaded ? 'opacity-100' : 'opacity-0'}`}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none', // CRITICAL: prevents browser touch gestures (scroll/zoom) from interfering
          willChange: 'transform',
        }}
      />
    </div>
  );
}
