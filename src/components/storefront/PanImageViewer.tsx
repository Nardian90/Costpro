'use client';

/**
 * PanImageViewer — visor de imagen con zoom y pan para el modal de detalle
 * de producto en la vitrina pública.
 *
 * Características:
 *   - Estado inicial: imagen centrada, zoom=1 (100%), object-fit: contain.
 *   - Zoom in/out con botones +/− y rueda del mouse (Ctrl+rueda).
 *   - Pan con pointer events (mouse, touch, stylus) — una sola API.
 *   - Bounds recalculados dinámicamente según zoom, viewport, e imagen.
 *   - Cursor: grab/grabbing cuando hay pan disponible; default cuando no.
 *   - Reset con botón o doble-clic.
 *   - Reset automático al cambiar de producto (src).
 *   - Sin scroll accidental de la página (touch-action: none).
 *   - Sin selección de texto (user-select: none).
 *
 * Uso:
 *   <PanImageViewer src={url} alt={name} aspect="4/3" className="w-full" />
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface PanImageViewerProps {
  src: string;
  alt: string;
  className?: string;
  aspect?: string;
}

const MIN_ZOOM = 1;   // 100%
const MAX_ZOOM = 3;   // 300%
const ZOOM_STEP = 0.25; // 25%
const WHEEL_ZOOM_STEP = 0.1; // 10% per wheel notch

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
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);

  // Reset when src changes
  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    setLoaded(false);
    reset();
  }, [src, reset]);

  /**
   * Calcula los límites máximos de desplazamiento para el zoom actual.
   *
   * Con object-contain a zoom=1, la imagen cabe dentro del viewport.
   * A zoom>1, la imagen crece más allá del viewport y el pan permite
   * explorar las zonas ocultas.
   *
   * Lógica: maxX = (renderedW * zoom - vw) / 2
   *   - Si el resultado es <= 0, no hay contenido oculto → pan innecesario.
   *   - Pero permitimos un pequeño slack (5% del viewport) para feedback táctil.
   */
  const getBounds = useCallback(() => {
    const viewport = viewportRef.current;
    const img = imgRef.current;
    if (!viewport || !img) return { maxX: 0, maxY: 0 };

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const nw = img.naturalWidth || vw;
    const nh = img.naturalHeight || vh;

    // Escala base (contain) — la imagen cabe dentro del viewport
    const baseScale = Math.min(vw / nw, vh / nh);
    // Dimensiones renderizadas con zoom aplicado
    const renderedW = nw * baseScale * zoom;
    const renderedH = nh * baseScale * zoom;

    const slack = 0.05;
    const maxX = renderedW > vw ? (renderedW - vw) / 2 : (vw * slack) / 2;
    const maxY = renderedH > vh ? (renderedH - vh) / 2 : (vh * slack) / 2;

    return { maxX, maxY };
  }, [zoom]);

  // Clamp offset to current bounds
  const clampOffset = useCallback((x: number, y: number) => {
    const { maxX, maxY } = getBounds();
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, [getBounds]);

  // Zoom helpers — conservan el centro del viewport
  const zoomIn = useCallback(() => {
    setZoom(z => {
      const newZoom = Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100);
      return newZoom;
    });
  }, []);

  const zoomOut = useCallback(() => {
    setZoom(z => {
      const newZoom = Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100);
      if (newZoom === 1) {
        // Al volver a 100%, resetear offset
        setOffset({ x: 0, y: 0 });
      }
      return newZoom;
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Cuando cambia el zoom, re-clamp el offset para que no salga de bounds
  useEffect(() => {
    setOffset(prev => clampOffset(prev.x, prev.y));
  }, [zoom, clampOffset]);

  // Wheel zoom (Ctrl+rueda o rueda directa sobre el visor)
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    // Solo zoom si Ctrl está presionado (evita conflicto con scroll del modal)
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.deltaY < 0) {
      setZoom(z => Math.min(MAX_ZOOM, Math.round((z + WHEEL_ZOOM_STEP) * 100) / 100));
    } else {
      setZoom(z => {
        const nz = Math.max(MIN_ZOOM, Math.round((z - WHEEL_ZOOM_STEP) * 100) / 100);
        if (nz === 1) setOffset({ x: 0, y: 0 });
        return nz;
      });
    }
  }, []);

  // Pan handlers
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLImageElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
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
    const clamped = clampOffset(drag.originX + dx, drag.originY + dy);
    setOffset(clamped);
  }, [clampOffset]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLImageElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    dragStateRef.current = null;
    setDragging(false);
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    e.preventDefault();
    e.stopPropagation();
    resetZoom();
  }, [resetZoom]);

  const zoomPercent = Math.round(zoom * 100);
  const canPan = zoom > 1;

  return (
    <div
      ref={viewportRef}
      className={`relative overflow-hidden bg-muted ${className || ''}`}
      style={{ aspectRatio: aspect.replace('/', ' / ') }}
      onWheel={handleWheel}
    >
      {/* Loading skeleton */}
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-muted/50" />
      )}

      {/* The image — positioned absolute, transformed with translate+scale */}
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
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          cursor: canPan ? (dragging ? 'grabbing' : 'grab') : 'default',
          touchAction: 'none',
          willChange: 'transform',
          transformOrigin: 'center center',
        }}
      />

      {/* Zoom controls — positioned bottom-right, semi-transparent, compact */}
      {loaded && (
        <div
          className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-lg p-1 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); zoomOut(); }}
            disabled={zoom <= MIN_ZOOM}
            className="w-7 h-7 flex items-center justify-center text-white hover:bg-white/20 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Alejar"
            title="Alejar"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); resetZoom(); }}
            className="px-2 h-7 flex items-center justify-center text-white text-xs font-bold hover:bg-white/20 rounded transition-colors min-w-[3rem]"
            aria-label="Resetear zoom"
            title="Resetear zoom"
          >
            {zoomPercent}%
          </button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); zoomIn(); }}
            disabled={zoom >= MAX_ZOOM}
            className="w-7 h-7 flex items-center justify-center text-white hover:bg-white/20 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Acercar"
            title="Acercar"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          {zoom !== 1 && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); resetZoom(); }}
              className="w-7 h-7 flex items-center justify-center text-white hover:bg-white/20 rounded transition-colors"
              aria-label="Resetear"
              title="Resetear"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
