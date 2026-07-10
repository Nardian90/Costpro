'use client';

import { FloatingCalculator } from '@/components/ui/FloatingCalculator';
import { useUIStore } from '@/store';
import { useEffect, useState } from 'react';

/**
 * CalculatorView — Vista integrada de la Calculadora Pro.
 *
 * FIX-CALC-VIEW (2026-07-10): Replica el patrón de ChatBotView.
 * Renderiza el mismo componente FloatingCalculator pero con `embedded=true`,
 * lo que desactiva el posicionamiento fixed/draggable y lo hace llenar
 * todo el contenedor padre.
 *
 * El botón flotante del sidebar sigue disponible para acceso rápido desde
 * cualquier otra vista (abre el modal). Esta vista integrada ofrece más
 * espacio y comodidad para uso prolongado.
 */
export default function CalculatorView() {
  const { setCurrentView } = useUIStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="text-sm text-muted-foreground animate-pulse">Cargando calculadora...</div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full w-full overflow-hidden bg-background">
      {/* Contenedor centrado con max-width para que la calculadora no quede
          demasiado ancha en pantallas grandes. */}
      <div className="flex-1 min-h-0 flex items-start justify-center p-4 sm:p-6 overflow-y-auto">
        <div className="w-full max-w-md">
          <FloatingCalculator embedded />
        </div>
      </div>

      {/* Botón flotante para volver a la vista anterior */}
      <button
        type="button"
        onClick={() => window.history.length > 1 ? window.history.back() : setCurrentView('occ')}
        className="absolute bottom-4 left-4 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted border border-border/40 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors z-10"
        aria-label="Volver"
      >
        ← Volver
      </button>
    </div>
  );
}
