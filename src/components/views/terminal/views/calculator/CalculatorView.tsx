'use client';

import {
  CalcTabContent,
  HistoryTabContent,
  CashTabContent,
  ConfigTabContent,
  SciTabContent,
  ConvertTabContent,
  UnitsTabContent,
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
  FlaskConical,
  Coins,
  Ruler,
  X,
} from 'lucide-react';
import { cn, isDarkTheme } from '@/lib/utils';
import { useIsMobile } from '@/hooks/ui/useMobile';

/**
 * CalculatorView — Vista integrada Pro Ultimate.
 *
 * FIX-CALC-PRO (2026-07-10): Rediseño completo con 3 zonas:
 *   1. Panel izquierdo: Calculadora básica (display + keypad + memoria) — siempre visible
 *   2. Panel derecho: Tabs contextuales con herramientas avanzadas:
 *      - Historial: operaciones previas
 *      - Desglose: billetes/monedas
 *      - Científico: sin/cos/tan/log/√/x²/etc
 *      - Monedas: conversión CUP/USD/EUR/MLC
 *      - Unidades: longitud/peso/temperatura
 *   3. Modal de Configuración (accesible con botón al lado de "Volver")
 *
 * Referencia: Samsung Calculator Pro, PCalc, Calc++ — calculadoras avanzadas
 * que mantienen la simplicidad del modal pero añaden poder en vista ampliada.
 */

type RightTab = 'history' | 'cash' | 'sci' | 'convert' | 'units';

export default function CalculatorView() {
  const { setCurrentView, setIsCalculatorOpen } = useUIStore();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('history');
  const [showConfig, setShowConfig] = useState(false);
  const isMobile = useIsMobile();

  const calc = useCalculator();

  useEffect(() => {
    setMounted(true);
  }, []);

  // FIX-KEYBOARD-VIEW (2026-07-10): listener de teclado para la vista integrada.
  // Antes el teclado solo funcionaba en el modal flotante (FloatingCalculator),
  // no en esta vista. Ahora captura digits/operators/Enter/Backspace/C/%/Esc
  // y los envía al hook useCalculator via handlersRef.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // No interferir si el foco está en un input/select/textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const key = e.key;
      const h = calc.handlersRef.current;

      if (/^[0-9]$/.test(key)) { e.preventDefault(); h.handleNumber(key); return; }
      if (key === '.' || key === ',') { e.preventDefault(); h.handleNumber('.'); return; }
      if (key === '+') { e.preventDefault(); h.handleOperator('+'); return; }
      if (key === '-') { e.preventDefault(); h.handleOperator('-'); return; }
      if (key === '*') { e.preventDefault(); h.handleOperator('*'); return; }
      if (key === '/') { e.preventDefault(); h.handleOperator('/'); return; }
      if (key === 'Enter' || key === '=') { e.preventDefault(); h.handleCalculate(); return; }
      if (key === 'Backspace') { e.preventDefault(); h.handleBackspace(); return; }
      if (key === 'c' || key === 'C') { e.preventDefault(); h.handleClear(); return; }
      if (key === '%') { e.preventDefault(); h.handlePercent(); return; }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [calc.handlersRef]);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="text-sm text-muted-foreground animate-pulse">Cargando calculadora...</div>
      </div>
    );
  }

  const isDark = isDarkTheme(resolvedTheme);

  const rightTabs = [
    { id: 'history' as RightTab, label: 'Historial', icon: History, badge: calc.history.length },
    { id: 'cash' as RightTab, label: 'Desglose', icon: DollarSign },
    { id: 'sci' as RightTab, label: 'Científico', icon: FlaskConical },
    { id: 'convert' as RightTab, label: 'Monedas', icon: Coins },
    { id: 'units' as RightTab, label: 'Unidades', icon: Ruler },
  ];

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
              Científica · Monedas · Unidades · Historial
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Config — botón al lado de Volver (abre modal) */}
          <button
            type="button"
            onClick={() => setShowConfig(true)}
            className="px-2.5 sm:px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1"
            title="Configuración y atajos"
            aria-label="Configuración"
          >
            <Settings2 className="w-3 h-3" /> <span className="hidden sm:inline">Config</span>
          </button>
          {/* Flotante — oculto en móvil */}
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

      {/* ── Layout: 2 paneles (desktop) o apilado (móvil) ── */}
      <div className={cn(
        "flex-1 min-h-0 gap-2 sm:gap-3 p-2 sm:p-3 md:p-4 overflow-hidden",
        isMobile ? "flex flex-col overflow-y-auto" : "flex flex-row"
      )}>

        {/* ═══ LEFT/TOP PANE: Calculator ═══ */}
        <div className={cn(
          "flex flex-col rounded-[1.25rem] sm:rounded-[1.5rem] border border-border/30 bg-card shadow-[0_16px_32px_-8px_rgba(0,0,0,0.2)] overflow-hidden",
          isMobile ? "w-full shrink-0" : "w-[300px] sm:w-[340px] shrink-0"
        )}>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            <CalcTabContent calc={calc} isDark={isDark} />
          </div>
        </div>

        {/* ═══ RIGHT/BOTTOM PANE: Advanced tools ═══ */}
        <div className={cn(
          "flex flex-col rounded-[1.25rem] sm:rounded-[1.5rem] border border-border/30 bg-card shadow-[0_16px_32px_-8px_rgba(0,0,0,0.2)] overflow-hidden",
          isMobile ? "w-full flex-1 min-h-[400px]" : "flex-1 min-w-0"
        )}>
          {/* Tab switcher — scrollable en móvil */}
          <div className="shrink-0 flex border-b border-border/30 overflow-x-auto no-scrollbar">
            {rightTabs.map(tab => {
              const Icon = tab.icon;
              return (
                <TabButton
                  key={tab.id}
                  active={rightTab === tab.id}
                  onClick={() => setRightTab(tab.id)}
                  icon={<Icon className="w-3 h-3" />}
                  label={tab.label}
                  isDark={isDark}
                  badge={tab.badge}
                />
              );
            })}
          </div>

          {/* Right pane content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
            {rightTab === 'history' && (
              <HistoryTabContent history={calc.history} onUse={calc.useHistoryResult} onClear={calc.clearHistory} isDark={isDark} />
            )}
            {rightTab === 'cash' && (
              <CashTabContent display={calc.display} isDark={isDark} />
            )}
            {rightTab === 'sci' && (
              <SciTabContent calc={calc} isDark={isDark} />
            )}
            {rightTab === 'convert' && (
              <ConvertTabContent display={calc.display} isDark={isDark} />
            )}
            {rightTab === 'units' && (
              <UnitsTabContent display={calc.display} isDark={isDark} />
            )}
          </div>
        </div>
      </div>

      {/* ── Status bar — oculto en móvil ── */}
      {!isMobile && (
        <div className="shrink-0 px-4 py-1.5 border-t border-border/30 bg-muted/20 flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          <span>⌨ Teclado: 0-9 + − * / Enter ⌫ C % Esc</span>
          <div className="flex items-center gap-3">
            {calc.hasMemory && <span className="text-amber-500">M: {new Intl.NumberFormat('es-CU').format(calc.memory)}</span>}
            <span>{calc.history.length} ops en historial</span>
          </div>
        </div>
      )}

      {/* ── Modal de Configuración ── */}
      {showConfig && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
          onClick={() => setShowConfig(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Configuración de calculadora"
        >
          <div
            className="w-full max-w-md bg-card border border-border/50 rounded-2xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between p-3 border-b border-border/30 bg-muted/20">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-black uppercase tracking-widest">Configuración</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfig(false)}
                className="p-1.5 rounded-full hover:bg-muted"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar">
              <ConfigTabContent isDark={isDark} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
