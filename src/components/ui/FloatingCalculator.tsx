'use client';

import React, { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import {
  Calculator,
  X,
  Delete,
  Plus,
  Minus,
  Divide,
  Equal,
  Move,
  History,
  DollarSign,
  Settings2,
  Trash2,
  Copy,
  Save,
} from 'lucide-react';
import { cn, isDarkTheme, formatCurrency } from "@/lib/utils";
import { useTheme } from 'next-themes';
import { useUIStore } from '@/store';
import { useCalculator, type HistoryEntry } from '@/hooks/useCalculator';

type CalcTab = 'calc' | 'history' | 'cash' | 'config';

interface FloatingCalculatorProps {
  /**
   * FIX-CALC-VIEW (2026-07-10): Cuando es true, la calculadora se renderiza
   * como vista integrada (llena el contenedor padre) en vez de modal flotante.
   * Replica el patrón `embedded` del ChatBot.
   */
  embedded?: boolean;
}

export const FloatingCalculator: React.FC<FloatingCalculatorProps> = ({ embedded = false }) => {
  const { isCalculatorOpen, setIsCalculatorOpen, currentView, setCurrentView } = useUIStore();
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const { resolvedTheme } = useTheme();
  const constraintsRef = useRef(null);
  const [activeTab, setActiveTab] = useState<CalcTab>('calc');

  const calc = useCalculator();

  /* ── Keyboard support (pro ultimate) ─────────────── */
  // FIX-CALC-VIEW: en modo embedded, el teclado siempre está activo.
  // En modo modal, solo cuando está abierto.
  const keyboardActive = embedded ? true : isCalculatorOpen;
  useEffect(() => {
    if (!keyboardActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        if (e.key === 'Escape' && !embedded) { setIsCalculatorOpen(false); return; }
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
      if (key === 'Escape' && !embedded) { e.preventDefault(); setIsCalculatorOpen(false); return; }
      if (key === 'c' || key === 'C') { e.preventDefault(); h.handleClear(); return; }
      if (key === '%') { e.preventDefault(); h.handlePercent(); return; }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyboardActive, setIsCalculatorOpen, calc.handlersRef, embedded]);

  if (!isMounted) return null;

  const isDark = isDarkTheme(resolvedTheme);

  // FIX-BUG-BUTTONS (2026-07-10): remover staggerChildren/delayChildren.
  // Estos causaban que los botones no aparecieran al reabrir la calculadora
  // porque Framer Motion no re-disparaba la animación de children correctamente
  // tras un cycle close→open. Ahora usamos animación simple sin stagger.
  const fanVariants: Variants = {
    closed: {
      opacity: 0, scale: 0.3, rotate: -15, y: 20, filter: "blur(10px)",
      transition: { type: "spring", stiffness: 300, damping: 30 }
    },
    open: {
      opacity: 1, scale: 1, rotate: 0, y: 0, filter: "blur(0px)",
      transition: { type: "spring", stiffness: 150, damping: 15 }
    }
  };

  const closeCalculator = () => setIsCalculatorOpen(false);

  /* ── Modo embedded: render directo sin fixed/draggable ── */
  if (embedded) {
    return (
      <div className="w-full h-full flex flex-col">
        <div className="w-full max-w-md mx-auto rounded-[1.5rem] shadow-[0_16px_32px_-8px_rgba(0,0,0,0.3)] overflow-hidden border flex flex-col bg-card border-primary/20 backdrop-blur-xl">
          {/* Header sin draggable */}
          <div className="p-3 flex items-center justify-between border-b shrink-0 border-border/30 bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-primary/10">
                <Calculator className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h4 className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40 leading-none">CostPro Pro</h4>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Calc</p>
              </div>
            </div>
            {/* Botón para cambiar a modo modal flotante */}
            <button
              type="button"
              onClick={() => { setCurrentView('occ'); setIsCalculatorOpen(true); }}
              className="px-2 py-1 rounded-lg text-[9px] font-black uppercase border border-primary/20 text-primary hover:bg-primary/10 transition-colors"
              title="Abrir como modal flotante"
            >
              ↗ Flotante
            </button>
          </div>
          {/* Tabs */}
          <div className="flex border-b shrink-0 border-border/30">
            <TabButton active={activeTab === 'calc'} onClick={() => setActiveTab('calc')} icon={<Calculator className="w-3 h-3" />} label="Calc" isDark={isDark} />
            <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History className="w-3 h-3" />} label="Hist" isDark={isDark} badge={calc.history.length} />
            <TabButton active={activeTab === 'cash'} onClick={() => setActiveTab('cash')} icon={<DollarSign className="w-3 h-3" />} label="Cash" isDark={isDark} />
            <TabButton active={activeTab === 'config'} onClick={() => setActiveTab('config')} icon={<Settings2 className="w-3 h-3" />} label="Cfg" isDark={isDark} />
          </div>
          {/* Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
            {activeTab === 'calc' && <CalcTabContent calc={calc} isDark={isDark} />}
            {activeTab === 'history' && <HistoryTabContent history={calc.history} onUse={calc.useHistoryResult} onClear={calc.clearHistory} isDark={isDark} />}
            {activeTab === 'cash' && <CashTabContent display={calc.display} isDark={isDark} />}
            {activeTab === 'config' && <ConfigTabContent isDark={isDark} />}
          </div>
        </div>
      </div>
    );
  }

  /* ── Modo modal flotante (default) ── */
  return (
    <div ref={constraintsRef} className="fixed inset-0 z-[10000] pointer-events-none overflow-hidden">
      <AnimatePresence>
        {isCalculatorOpen && (
          <motion.div
            drag
            dragConstraints={constraintsRef}
            dragElastic={0.05}
            dragMomentum={false}
            variants={fanVariants}
            initial="closed"
            animate="open"
            exit="closed"
            role="dialog"
            aria-label="Calculadora CostPro Pro"
            aria-modal="true"
            className={cn(
              "absolute top-24 right-4 sm:right-12 w-[300px] sm:w-[340px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-8rem)] rounded-[2rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] overflow-hidden border flex flex-col pointer-events-auto backdrop-blur-xl",
              isDark
                ? "bg-card/85 border-primary/20 text-foreground"
                : "bg-card/90 border-primary/20 text-foreground"
            )}
          >
            {/* Draggable Handle */}
            <div className="p-3 flex items-center justify-between border-b cursor-move active:cursor-grabbing shrink-0 border-border/30 bg-muted/30">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-primary/10">
                  <Calculator className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h4 className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40 leading-none">CostPro Pro</h4>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 flex items-center gap-1">
                    Calc <Move className="w-2 h-2 opacity-50" />
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* FIX-CALC-VIEW: botón para abrir vista integrada */}
                <button
                  type="button"
                  onClick={() => { setCurrentView('calculator'); }}
                  className="px-2 py-1 rounded-lg text-[9px] font-black uppercase border border-primary/20 text-primary hover:bg-primary/10 transition-colors"
                  title="Abrir como vista integrada"
                >
                  ⛶ Vista
                </button>
                <button
                  type="button"
                  onClick={closeCalculator}
                  aria-label="Cerrar calculadora"
                  className="hover:rotate-90 transition-transform p-1.5 rounded-full hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b shrink-0 border-border/30">
              <TabButton active={activeTab === 'calc'} onClick={() => setActiveTab('calc')} icon={<Calculator className="w-3 h-3" />} label="Calc" isDark={isDark} />
              <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History className="w-3 h-3" />} label="Hist" isDark={isDark} badge={calc.history.length} />
              <TabButton active={activeTab === 'cash'} onClick={() => setActiveTab('cash')} icon={<DollarSign className="w-3 h-3" />} label="Cash" isDark={isDark} />
              <TabButton active={activeTab === 'config'} onClick={() => setActiveTab('config')} icon={<Settings2 className="w-3 h-3" />} label="Cfg" isDark={isDark} />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
              {activeTab === 'calc' && <CalcTabContent calc={calc} isDark={isDark} />}
              {activeTab === 'history' && <HistoryTabContent history={calc.history} onUse={calc.useHistoryResult} onClear={calc.clearHistory} isDark={isDark} />}
              {activeTab === 'cash' && <CashTabContent display={calc.display} isDark={isDark} />}
              {activeTab === 'config' && <ConfigTabContent isDark={isDark} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ─────────────────────────────────────────────────────
 *  Tab Button
 * ───────────────────────────────────────────────────── */
interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  isDark: boolean;
  badge?: number;
}
const TabButton: React.FC<TabButtonProps> = ({ active, onClick, icon, label, isDark, badge }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex-1 py-2 flex flex-col items-center gap-0.5 text-[9px] font-black uppercase tracking-widest border-b-2 -mb-px transition-colors relative",
      active
        ? "border-primary text-primary"
        : "border-transparent text-muted-foreground hover:text-foreground"
    )}
    aria-selected={active}
    role="tab"
  >
    {icon}
    <span>{label}</span>
    {badge !== undefined && badge > 0 && (
      <span className="absolute top-0.5 right-1/2 translate-x-4 px-1 rounded-full text-[7px] tabular-nums bg-muted">
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </button>
);

/* ─────────────────────────────────────────────────────
 *  Calc Tab — Display + Keypad + Memory
 *  FIX-LAYOUT (2026-07-10): grid 5×4 sin row-span para
 *  evitar el bug de botones de números invisibles.
 * ───────────────────────────────────────────────────── */
interface CalcTabContentProps {
  calc: ReturnType<typeof useCalculator>;
  isDark: boolean;
}
const CalcTabContent: React.FC<CalcTabContentProps> = ({ calc, isDark }) => {
  return (
    <>
      {/* Display */}
      <div className="px-4 py-4 flex flex-col items-end justify-center gap-1 min-h-[90px] relative overflow-hidden bg-muted/20">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
             style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '10px 10px' }} />

        <div className="text-[10px] font-mono h-4 uppercase tracking-widest font-bold opacity-40 truncate w-full text-right">
          {calc.equation || '\u00A0'}
        </div>
        <motion.div
          key={calc.display}
          initial={{ y: 5, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={cn(
            "text-3xl font-mono tracking-tighter w-full text-right font-black truncate",
            calc.display === 'Error'
              ? "text-destructive"
              : "text-primary"
          )}
        >
          {calc.display}
        </motion.div>
        {calc.hasMemory && (
          <div className="text-[8px] font-bold text-amber-500 mt-0.5">
            M: {formatCurrency(calc.memory)}
          </div>
        )}
      </div>

      {/* Memory Row */}
      <div className="grid grid-cols-4 gap-1 px-3 pt-2">
        <MemButton label="MC" onClick={calc.handleMemoryClear} disabled={!calc.hasMemory} />
        <MemButton label="MR" onClick={calc.handleMemoryRecall} disabled={!calc.hasMemory} />
        <MemButton label="M-" onClick={calc.handleMemorySubtract} />
        <MemButton label="M+" onClick={calc.handleMemoryAdd} />
      </div>

      {/* FIX-LAYOUT: Keypad 5×4 sin row-span — todos los botones visibles */}
      <div className="p-3 grid grid-cols-4 gap-1.5">
        {/* Row 1: % ± C ⌫ */}
        <CalcButton label="%" onClick={calc.handlePercent} variant="secondary" />
        <CalcButton label="±" onClick={calc.handleToggleSign} variant="secondary" />
        <CalcButton label="C" onClick={calc.handleClear} variant="danger" />
        <CalcButton icon={<Delete className="w-4 h-4" />} onClick={calc.handleBackspace} variant="secondary" />

        {/* Row 2: / * - + */}
        <CalcButton icon={<Divide className="w-4 h-4" />} onClick={() => calc.handleOperator('/')} variant="operator" />
        <CalcButton icon={<X className="w-4 h-4" />} onClick={() => calc.handleOperator('*')} variant="operator" />
        <CalcButton icon={<Minus className="w-4 h-4" />} onClick={() => calc.handleOperator('-')} variant="operator" />
        <CalcButton icon={<Plus className="w-4 h-4" />} onClick={() => calc.handleOperator('+')} variant="operator" />

        {/* Row 3: 7 8 9 = */}
        <CalcButton label="7" onClick={() => calc.handleNumber('7')} />
        <CalcButton label="8" onClick={() => calc.handleNumber('8')} />
        <CalcButton label="9" onClick={() => calc.handleNumber('9')} />
        <CalcButton icon={<Equal className="w-5 h-5" />} onClick={calc.handleCalculate} variant="primary" className="shadow-lg shadow-primary/20" />

        {/* Row 4: 4 5 6 . */}
        <CalcButton label="4" onClick={() => calc.handleNumber('4')} />
        <CalcButton label="5" onClick={() => calc.handleNumber('5')} />
        <CalcButton label="6" onClick={() => calc.handleNumber('6')} />
        <CalcButton label="." onClick={() => calc.handleNumber('.')} />

        {/* Row 5: 1 2 3 0 */}
        <CalcButton label="1" onClick={() => calc.handleNumber('1')} />
        <CalcButton label="2" onClick={() => calc.handleNumber('2')} />
        <CalcButton label="3" onClick={() => calc.handleNumber('3')} />
        <CalcButton label="0" onClick={() => calc.handleNumber('0')} />
      </div>

      {/* Keyboard hint */}
      <div className="px-3 pb-2 pt-1 text-[8px] font-bold uppercase tracking-widest text-center text-muted-foreground opacity-60">
        ⌨ Teclado: 0-9 + − * / Enter ⌫ C % Esc
      </div>
    </>
  );
};

/* ─────────────────────────────────────────────────────
 *  History Tab
 * ───────────────────────────────────────────────────── */
interface HistoryTabContentProps {
  history: HistoryEntry[];
  onUse: (entry: HistoryEntry) => void;
  onClear: () => void;
  isDark: boolean;
}
const HistoryTabContent: React.FC<HistoryTabContentProps> = ({ history, onUse, onClear, isDark }) => {
  if (history.length === 0) {
    return (
      <div className="p-6 text-center space-y-2">
        <History className="w-8 h-8 mx-auto opacity-30" />
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Sin historial
        </p>
        <p className="text-[10px] text-muted-foreground">
          Las operaciones aparecerán aquí. Clic en una para reusarla.
        </p>
      </div>
    );
  }
  return (
    <div className="p-2 space-y-1">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
          {history.length} entrada{history.length !== 1 ? 's' : ''}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-black uppercase hover:opacity-80 text-destructive bg-destructive/10 border border-destructive/20"
        >
          <Trash2 className="w-3 h-3" /> Limpiar
        </button>
      </div>
      <div className="max-h-[400px] overflow-y-auto no-scrollbar space-y-1">
        {history.map(entry => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onUse(entry)}
            className="w-full text-right p-2 rounded-lg border transition-all hover:scale-[1.02] bg-muted/30 border-border/40 hover:bg-muted/60"
          >
            <div className="text-[10px] font-mono opacity-50 truncate">
              {entry.equation}
            </div>
            <div className="text-lg font-mono font-black truncate text-primary">
              = {entry.result}
            </div>
            <div className="text-[8px] opacity-40 mt-0.5">
              {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────
 *  Cash Tab — Desglose de billetes/monedas
 *  FIX-CASH-PRO (2026-07-10): botón limpiar visible +
 *  guardar/clonar desglose como snapshot (historial de
 *  desgloses).
 * ───────────────────────────────────────────────────── */
const CASH_KEY = 'costpro-calc-cash-config';
const SAVED_BREAKDOWNS_KEY = 'costpro-calc-saved-breakdowns';

interface Denomination {
  value: number;
  label: string;
  active: boolean;
}
interface SavedBreakdown {
  id: string;
  name: string;
  amount: number;
  breakdown: Record<string, number>;
  timestamp: number;
}
const DEFAULT_DENOMINATIONS: Denomination[] = [
  { value: 1000, label: '$1000', active: true },
  { value: 500, label: '$500', active: true },
  { value: 200, label: '$200', active: true },
  { value: 100, label: '$100', active: true },
  { value: 50, label: '$50', active: true },
  { value: 20, label: '$20', active: true },
  { value: 10, label: '$10', active: true },
  { value: 5, label: '$5', active: true },
  { value: 1, label: '$1', active: true },
];

function loadDenominations(): Denomination[] {
  if (typeof window === 'undefined') return DEFAULT_DENOMINATIONS;
  try {
    const raw = localStorage.getItem(CASH_KEY);
    if (!raw) return DEFAULT_DENOMINATIONS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_DENOMINATIONS;
  } catch {
    return DEFAULT_DENOMINATIONS;
  }
}

function saveDenominations(denoms: Denomination[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(CASH_KEY, JSON.stringify(denoms)); } catch {}
}

function loadSavedBreakdowns(): SavedBreakdown[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SAVED_BREAKDOWNS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveSavedBreakdowns(items: SavedBreakdown[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(SAVED_BREAKDOWNS_KEY, JSON.stringify(items.slice(0, 20))); } catch {}
}

interface CashTabContentProps {
  display: string;
  isDark: boolean;
}
const CashTabContent: React.FC<CashTabContentProps> = ({ display, isDark }) => {
  const [denominations, setDenominations] = useState<Denomination[]>(DEFAULT_DENOMINATIONS);
  const [breakdown, setBreakdown] = useState<Record<string, number>>({});
  const [showConfig, setShowConfig] = useState(false);
  const [savedBreakdowns, setSavedBreakdowns] = useState<SavedBreakdown[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    setDenominations(loadDenominations());
    setSavedBreakdowns(loadSavedBreakdowns());
  }, []);

  const targetAmount = parseFloat(display) || 0;
  const activeDenoms = denominations.filter(d => d.active).sort((a, b) => b.value - a.value);

  const calculateOptimal = () => {
    if (targetAmount <= 0) return;
    let remaining = targetAmount;
    const result: Record<string, number> = {};
    for (const d of activeDenoms) {
      const count = Math.floor(remaining / d.value);
      if (count > 0) {
        result[String(d.value)] = count;
        remaining = Math.round((remaining - count * d.value) * 100) / 100;
      }
    }
    setBreakdown(result);
  };

  const breakdownTotal = Object.entries(breakdown).reduce((s, [denom, count]) => {
    return s + (parseFloat(denom) * count);
  }, 0);
  const difference = breakdownTotal - targetAmount;

  const toggleDenomination = (value: number) => {
    const next = denominations.map(d => d.value === value ? { ...d, active: !d.active } : d);
    setDenominations(next);
    saveDenominations(next);
  };

  const clearBreakdown = () => setBreakdown({});

  const saveCurrentBreakdown = () => {
    if (Object.keys(breakdown).length === 0) return;
    const saved: SavedBreakdown = {
      id: `bd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: `${formatCurrency(breakdownTotal)} — ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      amount: breakdownTotal,
      breakdown: { ...breakdown },
      timestamp: Date.now(),
    };
    const next = [saved, ...savedBreakdowns].slice(0, 20);
    setSavedBreakdowns(next);
    saveSavedBreakdowns(next);
  };

  const cloneSavedBreakdown = (saved: SavedBreakdown) => {
    setBreakdown({ ...saved.breakdown });
    setShowSaved(false);
  };

  const deleteSavedBreakdown = (id: string) => {
    const next = savedBreakdowns.filter(s => s.id !== id);
    setSavedBreakdowns(next);
    saveSavedBreakdowns(next);
  };

  return (
    <div className="p-3 space-y-2">
      {/* Target amount */}
      <div className="rounded-lg px-3 py-2 flex items-center justify-between bg-muted/30">
        <span className="text-[9px] font-black uppercase text-muted-foreground">Desglosar:</span>
        <span className="text-lg font-mono font-black tabular-nums text-primary">
          {formatCurrency(targetAmount)}
        </span>
      </div>

      {/* Action buttons row */}
      <div className="grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={calculateOptimal}
          disabled={targetAmount <= 0}
          className="h-8 rounded-lg bg-primary text-primary-foreground text-[9px] font-black uppercase hover:opacity-90 disabled:opacity-30 flex items-center justify-center gap-1"
        >
          <DollarSign className="w-3 h-3" /> Óptimo
        </button>
        <button
          type="button"
          onClick={saveCurrentBreakdown}
          disabled={Object.keys(breakdown).length === 0}
          className="h-8 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-500 text-[9px] font-black uppercase hover:bg-amber-500/30 disabled:opacity-30 border border-amber-500/30 flex items-center justify-center gap-1"
          title="Guardar desglose actual"
        >
          <Save className="w-3 h-3" /> Guardar
        </button>
        <button
          type="button"
          onClick={clearBreakdown}
          disabled={Object.keys(breakdown).length === 0}
          className="h-8 rounded-lg bg-destructive/10 text-destructive text-[9px] font-black uppercase hover:bg-destructive/20 disabled:opacity-30 border border-destructive/20 flex items-center justify-center gap-1"
          title="Limpiar desglose"
        >
          <Trash2 className="w-3 h-3" /> Limpiar
        </button>
      </div>

      {/* Saved breakdowns toggle */}
      {savedBreakdowns.length > 0 && (
        <button
          type="button"
          onClick={() => setShowSaved(!showSaved)}
          className="w-full py-1.5 rounded-lg text-[9px] font-black uppercase flex items-center justify-center gap-1 border border-border/40 hover:bg-muted/30"
        >
          <Copy className="w-3 h-3" />
          {showSaved ? 'Ocultar guardados' : `Desgloses guardados (${savedBreakdowns.length})`}
        </button>
      )}

      {/* Saved breakdowns list */}
      {showSaved && savedBreakdowns.length > 0 && (
        <div className="space-y-1 max-h-[150px] overflow-y-auto no-scrollbar border border-border/30 rounded-lg p-1.5 bg-muted/10">
          {savedBreakdowns.map(saved => (
            <div key={saved.id} className="flex items-center gap-1 p-1.5 rounded bg-background/50 border border-border/20">
              <button
                type="button"
                onClick={() => cloneSavedBreakdown(saved)}
                className="flex-1 text-left"
                title="Clonar este desglose"
              >
                <div className="text-[10px] font-bold text-primary">{saved.name}</div>
                <div className="text-[8px] text-muted-foreground">
                  {Object.entries(saved.breakdown).map(([d, c]) => `${c}×$${d}`).join(', ')}
                </div>
              </button>
              <button
                type="button"
                onClick={() => deleteSavedBreakdown(saved.id)}
                className="p-1 rounded text-destructive hover:bg-destructive/10"
                title="Eliminar"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Config toggle */}
      <button
        type="button"
        onClick={() => setShowConfig(!showConfig)}
        className="w-full py-1.5 rounded-lg text-[9px] font-black uppercase flex items-center justify-center gap-1 border border-border/40 hover:bg-muted/30"
      >
        <Settings2 className="w-3 h-3" />
        {showConfig ? 'Ocultar config' : 'Configurar billetes'}
      </button>

      {/* Config panel */}
      {showConfig && (
        <div className="space-y-1 pb-2 border-b border-border/30">
          <p className="text-[8px] text-muted-foreground uppercase font-bold">Activa los billetes que usas:</p>
          <div className="grid grid-cols-3 gap-1">
            {denominations.map(d => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDenomination(d.value)}
                className={cn(
                  "py-1.5 rounded text-[9px] font-bold border transition-all",
                  d.active
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-muted/20 border-border text-muted-foreground"
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Breakdown input list */}
      <div className="space-y-1 max-h-[200px] overflow-y-auto no-scrollbar">
        {activeDenoms.map(d => {
          const count = breakdown[String(d.value)] || 0;
          return (
            <div key={d.value} className="flex items-center gap-1.5">
              <span className="w-12 text-[10px] font-black text-right">{d.label}</span>
              <span className="text-[8px] text-muted-foreground">×</span>
              <input
                type="number"
                min="0"
                value={count || ''}
                onChange={(e) => setBreakdown(prev => {
                  const next = { ...prev };
                  const val = parseInt(e.target.value) || 0;
                  if (val > 0) next[String(d.value)] = val;
                  else delete next[String(d.value)];
                  return next;
                })}
                className="w-12 bg-background border border-border/50 rounded px-1.5 py-1 text-[10px] font-bold text-center"
                placeholder="0"
                aria-label={`Cantidad de ${d.label}`}
              />
              <span className="text-[8px] text-muted-foreground flex-1">
                = {formatCurrency(count * d.value)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="border-t border-border/30 pt-2 space-y-1">
        <div className="flex justify-between text-[10px] font-bold">
          <span>Total contado:</span>
          <span className="text-primary tabular-nums">{formatCurrency(breakdownTotal)}</span>
        </div>
        <div className="flex justify-between text-[10px] font-bold">
          <span>Objetivo:</span>
          <span className="tabular-nums">{formatCurrency(targetAmount)}</span>
        </div>
        <div className="flex justify-between text-sm font-black">
          <span>Diferencia:</span>
          <span className={cn(
            "tabular-nums",
            Math.abs(difference) < 0.01 ? "text-primary"
            : difference > 0 ? "text-amber-500"
            : "text-destructive"
          )}>
            {Math.abs(difference) < 0.01 ? '✓ Exacto' : `${difference > 0 ? '+' : ''}${formatCurrency(difference)}`}
          </span>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────
 *  Config Tab
 * ───────────────────────────────────────────────────── */
interface ConfigTabContentProps {
  isDark: boolean;
}
const ConfigTabContent: React.FC<ConfigTabContentProps> = ({ isDark }) => {
  return (
    <div className="p-4 space-y-3">
      <div>
        <h5 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
          Atajos de teclado
        </h5>
        <div className="space-y-1 text-[10px]">
          {[
            ['0-9', 'Ingresar números'],
            ['.', ',', 'Punto decimal'],
            ['+', '-', '*', '/', 'Operadores'],
            ['Enter / =', 'Calcular'],
            ['Backspace', 'Borrar último'],
            ['C', 'Limpiar todo'],
            ['%', 'Porcentaje'],
            ['Escape', 'Cerrar calculadora'],
          ].map(([keys, desc]) => (
            <div key={desc} className="flex items-center justify-between">
              <span className="text-muted-foreground">{desc}</span>
              <span className="font-mono font-bold px-1.5 py-0.5 rounded text-[9px] bg-muted">
                {keys}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border/30 pt-3">
        <h5 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
          Funciones
        </h5>
        <div className="space-y-1 text-[10px] text-muted-foreground">
          <p>✓ Historial de 50 operaciones (persistente)</p>
          <p>✓ Memoria: M+ M- MR MC</p>
          <p>✓ Desglose de billetes automático</p>
          <p>✓ Guardar/clonar desgloses (20 máx)</p>
          <p>✓ Configuración de billetes activos</p>
          <p>✓ Operador encadenado (9+5-3)</p>
          <p>✓ Signo ± y porcentaje %</p>
        </div>
      </div>

      <div className="border-t border-border/30 pt-3">
        <p className="text-[9px] text-muted-foreground/60 text-center">
          CostPro Pro Calculator v2.1
        </p>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────
 *  Memory Button
 * ───────────────────────────────────────────────────── */
interface MemButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}
const MemButton: React.FC<MemButtonProps> = ({ label, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "h-8 rounded-lg text-[10px] font-black uppercase border transition-all",
      disabled
        ? "opacity-30 cursor-not-allowed bg-muted/20 border-border/30 text-muted-foreground"
        : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-500 border-amber-500/20"
    )}
  >
    {label}
  </button>
);

/* ─────────────────────────────────────────────────────
 *  Calc Button — ahora usa colores del design system (primary)
 *  en vez de verde neón #39FF14
 * ───────────────────────────────────────────────────── */
interface CalcButtonProps {
  label?: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'number' | 'operator' | 'primary' | 'danger' | 'secondary';
  className?: string;
}
const CalcButton: React.FC<CalcButtonProps> = ({ label, icon, onClick, variant = 'number', className }) => {
  const variantStyles = {
    number: "bg-muted/30 hover:bg-muted/60 text-foreground border-border/40",
    operator: "bg-primary/5 hover:bg-primary/20 text-primary border-primary/10",
    primary: "bg-primary hover:bg-primary/90 text-primary-foreground border-primary",
    danger: "bg-destructive/10 hover:bg-destructive/20 text-destructive border-destructive/20",
    secondary: "bg-muted hover:bg-muted/80 text-muted-foreground border-border",
  };

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9, transition: { type: "spring", stiffness: 400, damping: 10 } }}
      onClick={onClick}
      className={cn(
        "h-11 rounded-xl flex items-center justify-center text-sm font-bold border transition-all duration-300",
        variantStyles[variant],
        className
      )}
    >
      {label || icon}
    </motion.button>
  );
};
