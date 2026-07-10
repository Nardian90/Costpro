'use client';

import {
  CalcTabContent,
  HistoryTabContent,
  CashTabContent,
  ConfigTabContent,
  TabButton,
} from '@/components/ui/FloatingCalculator';
import { useCalculator } from '@/hooks/useCalculator';
import { useUIStore } from '@/store';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import {
  Calculator,
  History,
  DollarSign,
  Settings2,
  ArrowLeft,
  Maximize2,
} from 'lucide-react';
import { cn, isDarkTheme } from '@/lib/utils';
import { useIsMobile } from '@/hooks/ui/useMobile';

/**
 * CalculatorView — Vista integrada de la Calculadora Pro (layout de 2 paneles).
 *
 * FIX-CALC-VIEW (2026-07-10): En vez de solo centrar la calculadora como el
 * modal flotante (que deja espacio muerto a los lados), esta vista usa un
 * layout de dos paneles que aprovecha todo el ancho disponible:
 *
 *   ┌──────────────────┬──────────────────────────────┐
 *   │                  │ [Historial] [Desglose] [Cfg] │
 *   │   DISPLAY        ├──────────────────────────────┤
 *   │                  │                              │
 *   │   KEYPAD         │  Contenido contextual        │
 *   │   (siempre)      │  según tab activo:           │
 *   │                  │  - Historial → lista de ops  │
 *   │   MEMORY         │  - Desglose  → billetes      │
 *   │                  │  - Config    → atajos/ayuda  │
 *   └──────────────────┴──────────────────────────────┘
 *
 * La calculadora (display + keypad + memoria) está SIEMPRE visible a la
 * izquierda. El panel derecho cambia según el tab seleccionado. Esto elimina
 * el espacio muerto y permite ver el historial mientras se calcula.
 */

type RightTab = 'history' | 'cash' | 'config';

export default function CalculatorView() {
  const { setCurrentView, setIsCalculatorOpen } = useUIStore();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('history');
  const isMobile = useIsMobile();

  const calc = useCalculator();

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

  const isDark = isDarkTheme(resolvedTheme);

  return (
    <div className="relative flex flex-col h-full w-full overflow-hidden bg-background">
      {/* ── Header ── */}
      <div className="shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-border/30 flex items-center justify-between bg-muted/20">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center bg-primary/10 shrink-0">
            <Calculator className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest leading-none truncate">Calculadora Pro</h2>
            <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 hidden sm:block">
              Historial, memoria y desglose de billetes
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Cambiar a modo modal flotante — oculto en móvil (ya es pantalla completa) */}
          {!isMobile && (
            <button
              type="button"
              onClick={() => { setCurrentView('occ'); setIsCalculatorOpen(true); }}
              className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border border-primary/20 text-primary hover:bg-primary/10 transition-colors flex items-center gap-1"
              title="Abrir como modal flotante"
            >
              <Maximize2 className="w-3 h-3" /> Flotante
            </button>
          )}
          {/* Volver */}
          <button
            type="button"
            onClick={() => window.history.length > 1 ? window.history.back() : setCurrentView('occ')}
            className="px-2.5 sm:px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1"
            aria-label="Volver"
          >
            <ArrowLeft className="w-3 h-3" /> <span className="hidden sm:inline">Volver</span>
          </button>
        </div>
      </div>

      {/* ── Layout: 2 paneles (desktop) o apilado vertical (móvil) ──
          FIX-RESPONSIVE (2026-07-10): En móvil (<768px) los paneles se apilan
          verticalmente con la calculadora arriba y el panel contextual abajo.
          En desktop se mantienen lado a lado para aprovechar el ancho. */}
      <div className={cn(
        "flex-1 min-h-0 gap-2 sm:gap-3 p-2 sm:p-3 md:p-4 overflow-hidden",
        isMobile ? "flex flex-col overflow-y-auto" : "flex flex-row"
      )}>

        {/* ═══ LEFT/TOP PANE: Calculator ═══ */}
        <div className={cn(
          "flex flex-col rounded-[1.25rem] sm:rounded-[1.5rem] border border-border/30 bg-card shadow-[0_16px_32px_-8px_rgba(0,0,0,0.2)] overflow-hidden",
          isMobile
            ? "w-full shrink-0"  // móvil: ancho completo, no shrink
            : "w-[300px] sm:w-[340px] shrink-0"  // desktop: ancho fijo
        )}>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <CalcTabContent calc={calc} isDark={isDark} />
          </div>
        </div>

        {/* ═══ RIGHT/BOTTOM PANE: Contextual panel ═══ */}
        <div className={cn(
          "flex flex-col rounded-[1.25rem] sm:rounded-[1.5rem] border border-border/30 bg-card shadow-[0_16px_32px_-8px_rgba(0,0,0,0.2)] overflow-hidden",
          isMobile
            ? "w-full flex-1 min-h-[300px]"  // móvil: ancho completo, mínimo 300px de alto
            : "flex-1 min-w-0"  // desktop: llena el espacio restante
        )}>

          {/* Tab switcher for right pane */}
          <div className="shrink-0 flex border-b border-border/30">
            <TabButton
              active={rightTab === 'history'}
              onClick={() => setRightTab('history')}
              icon={<History className="w-3 h-3" />}
              label="Historial"
              isDark={isDark}
              badge={calc.history.length}
            />
            <TabButton
              active={rightTab === 'cash'}
              onClick={() => setRightTab('cash')}
              icon={<DollarSign className="w-3 h-3" />}
              label="Desglose"
              isDark={isDark}
            />
            <TabButton
              active={rightTab === 'config'}
              onClick={() => setRightTab('config')}
              icon={<Settings2 className="w-3 h-3" />}
              label="Config"
              isDark={isDark}
            />
          </div>

          {/* Right pane content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
            {rightTab === 'history' && (
              <HistoryTabContent
                history={calc.history}
                onUse={calc.useHistoryResult}
                onClear={calc.clearHistory}
                isDark={isDark}
              />
            )}
            {rightTab === 'cash' && (
              <CashTabContent display={calc.display} isDark={isDark} />
            )}
            {rightTab === 'config' && (
              <ConfigTabContent isDark={isDark} />
            )}
          </div>
        </div>
      </div>

      {/* ── Status bar (bottom) — oculto en móvil para ganar espacio ── */}
      {!isMobile && (
        <div className="shrink-0 px-4 py-1.5 border-t border-border/30 bg-muted/20 flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>⌨ Teclado: 0-9 + − * / Enter ⌫ C % Esc</span>
          </div>
          <div className="flex items-center gap-3">
            {calc.hasMemory && (
              <span className="text-amber-500">M: {new Intl.NumberFormat('es-CU').format(calc.memory)}</span>
            )}
            <span>{calc.history.length} ops en historial</span>
          </div>
        </div>
      )}
    </div>
  );
}
