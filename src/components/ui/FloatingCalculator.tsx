'use client';

import React, { useState, useRef, useEffect, useSyncExternalStore, useMemo } from 'react';
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
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { cn, isDarkTheme, formatCurrency } from "@/lib/utils";
import { useTheme } from 'next-themes';
import { useUIStore } from '@/store';
import { useCalculator, type HistoryEntry } from '@/hooks/useCalculator';

type CalcTab = 'calc' | 'history' | 'cash' | 'config';

export const FloatingCalculator: React.FC = () => {
  const { isCalculatorOpen, setIsCalculatorOpen } = useUIStore();
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
  useEffect(() => {
    if (!isCalculatorOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // No interferir si el foco está en un input/select/textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        // Permitir Escape para cerrar
        if (e.key === 'Escape') { setIsCalculatorOpen(false); return; }
        return;
      }

      const key = e.key;
      const h = calc.handlersRef.current;

      // Digits 0-9
      if (/^[0-9]$/.test(key)) { e.preventDefault(); h.handleNumber(key); return; }
      // Decimal point
      if (key === '.' || key === ',') { e.preventDefault(); h.handleNumber('.'); return; }
      // Operators
      if (key === '+') { e.preventDefault(); h.handleOperator('+'); return; }
      if (key === '-') { e.preventDefault(); h.handleOperator('-'); return; }
      if (key === '*') { e.preventDefault(); h.handleOperator('*'); return; }
      if (key === '/') { e.preventDefault(); h.handleOperator('/'); return; }
      // Enter or = → calculate
      if (key === 'Enter' || key === '=') { e.preventDefault(); h.handleCalculate(); return; }
      // Backspace → delete last digit
      if (key === 'Backspace') { e.preventDefault(); h.handleBackspace(); return; }
      // Escape → close
      if (key === 'Escape') { e.preventDefault(); setIsCalculatorOpen(false); return; }
      // 'c' or 'C' → clear
      if (key === 'c' || key === 'C') { e.preventDefault(); h.handleClear(); return; }
      // '%' → percent
      if (key === '%') { e.preventDefault(); h.handlePercent(); return; }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCalculatorOpen, setIsCalculatorOpen, calc.handlersRef]);

  if (!isMounted) return null;

  const isDark = isDarkTheme(resolvedTheme);

  // Enhanced "Abanico" (Fan) Variants
  const fanVariants: Variants = {
    closed: {
      opacity: 0,
      scale: 0.3,
      rotate: -15,
      y: 20,
      filter: "blur(10px)",
      transition: { type: "spring", stiffness: 300, damping: 30 }
    },
    open: {
      opacity: 1,
      scale: 1,
      rotate: 0,
      y: 0,
      filter: "blur(0px)",
      transition: { type: "spring", stiffness: 150, damping: 15, staggerChildren: 0.03, delayChildren: 0.1 }
    }
  };

  const itemVariants: Variants = {
    closed: { opacity: 0, scale: 0.5, rotate: -20, y: 10 },
    open: { opacity: 1, scale: 1, rotate: 0, y: 0 }
  };

  const closeCalculator = () => setIsCalculatorOpen(false);

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
              "absolute top-24 right-4 sm:right-12 w-[300px] sm:w-[340px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-8rem)] rounded-[2rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] overflow-hidden border flex flex-col pointer-events-auto",
              isDark
                ? "bg-[#010203]/95 border-[#39FF14]/30 text-foreground"
                : "bg-white/95 border-primary/30 text-foreground"
            )}
          >
            {/* Draggable Handle */}
            <div className={cn(
              "p-3 flex items-center justify-between border-b cursor-move active:cursor-grabbing shrink-0",
              isDark ? "bg-white/5 border-white/10" : "bg-muted/50 border-border/50"
            )}>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-8 h-8 rounded-xl flex items-center justify-center",
                  isDark ? "bg-[#39FF14]/10" : "bg-primary/10"
                )}>
                  <Calculator className={cn("w-4 h-4", isDark ? "text-[#39FF14]" : "text-primary")} />
                </div>
                <div>
                  <h4 className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40 leading-none">CostPro Pro</h4>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 flex items-center gap-1">
                    Calc <Move className="w-2 h-2 opacity-50" />
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeCalculator}
                aria-label="Cerrar calculadora"
                className={cn(
                  "hover:rotate-90 transition-transform p-1.5 rounded-full",
                  isDark ? "hover:bg-white/10" : "hover:bg-black/5"
                )}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className={cn(
              "flex border-b shrink-0",
              isDark ? "border-white/10" : "border-border/50"
            )}>
              <TabButton active={activeTab === 'calc'} onClick={() => setActiveTab('calc')} icon={<Calculator className="w-3 h-3" />} label="Calc" isDark={isDark} />
              <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History className="w-3 h-3" />} label="Hist" isDark={isDark} badge={calc.history.length} />
              <TabButton active={activeTab === 'cash'} onClick={() => setActiveTab('cash')} icon={<DollarSign className="w-3 h-3" />} label="Cash" isDark={isDark} />
              <TabButton active={activeTab === 'config'} onClick={() => setActiveTab('config')} icon={<Settings2 className="w-3 h-3" />} label="Cfg" isDark={isDark} />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
              {activeTab === 'calc' && (
                <CalcTabContent calc={calc} isDark={isDark} itemVariants={itemVariants} />
              )}
              {activeTab === 'history' && (
                <HistoryTabContent history={calc.history} onUse={calc.useHistoryResult} onClear={calc.clearHistory} isDark={isDark} />
              )}
              {activeTab === 'cash' && (
                <CashTabContent display={calc.display} isDark={isDark} />
              )}
              {activeTab === 'config' && (
                <ConfigTabContent isDark={isDark} />
              )}
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
        ? (isDark ? "border-[#39FF14] text-[#39FF14]" : "border-primary text-primary")
        : (isDark ? "border-transparent text-white/40 hover:text-white/70" : "border-transparent text-muted-foreground hover:text-foreground")
    )}
    aria-selected={active}
    role="tab"
  >
    {icon}
    <span>{label}</span>
    {badge !== undefined && badge > 0 && (
      <span className={cn(
        "absolute top-0.5 right-1/2 translate-x-4 px-1 rounded-full text-[7px] tabular-nums",
        active ? "bg-current/20" : "bg-muted"
      )}>
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </button>
);

/* ─────────────────────────────────────────────────────
 *  Calc Tab — Display + Keypad + Memory
 * ───────────────────────────────────────────────────── */
interface CalcTabContentProps {
  calc: ReturnType<typeof useCalculator>;
  isDark: boolean;
  itemVariants: Variants;
}
const CalcTabContent: React.FC<CalcTabContentProps> = ({ calc, isDark, itemVariants }) => {
  return (
    <>
      {/* Display */}
      <div className={cn(
        "px-4 py-4 flex flex-col items-end justify-center gap-1 min-h-[90px] relative overflow-hidden",
        isDark ? "bg-black/40" : "bg-slate-50/50"
      )}>
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
             style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '10px 10px' }} />

        <motion.div className="text-[10px] font-mono h-4 uppercase tracking-widest font-bold opacity-40 truncate w-full text-right">
          {calc.equation || '\u00A0'}
        </motion.div>
        <motion.div
          key={calc.display}
          initial={{ y: 5, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={cn(
            "text-3xl font-mono tracking-tighter w-full text-right font-black truncate",
            calc.display === 'Error'
              ? "text-red-500"
              : (isDark ? "text-[#39FF14] drop-shadow-[0_0_10px_rgba(57,255,20,0.3)]" : "text-primary")
          )}
        >
          {calc.display}
        </motion.div>
        {/* Memory indicator */}
        {calc.hasMemory && (
          <div className="text-[8px] font-bold text-amber-500 mt-0.5">
            M: {formatCurrency(calc.memory)}
          </div>
        )}
      </div>

      {/* Memory Row */}
      <div className="grid grid-cols-4 gap-1 px-3 pt-2">
        <MemButton label="MC" onClick={calc.handleMemoryClear} disabled={!calc.hasMemory} isDark={isDark} />
        <MemButton label="MR" onClick={calc.handleMemoryRecall} disabled={!calc.hasMemory} isDark={isDark} />
        <MemButton label="M-" onClick={calc.handleMemorySubtract} isDark={isDark} />
        <MemButton label="M+" onClick={calc.handleMemoryAdd} isDark={isDark} />
      </div>

      {/* Extra Row: %, ±, C, ⌫ */}
      <div className="grid grid-cols-4 gap-1 px-3 pt-1">
        <CalcButton variants={itemVariants} label="%" onClick={calc.handlePercent} variant="secondary" isDark={isDark} />
        <CalcButton variants={itemVariants} label="±" onClick={calc.handleToggleSign} variant="secondary" isDark={isDark} />
        <CalcButton variants={itemVariants} label="C" onClick={calc.handleClear} variant="danger" isDark={isDark} />
        <CalcButton variants={itemVariants} icon={<Delete className="w-4 h-4" />} onClick={calc.handleBackspace} variant="secondary" isDark={isDark} />
      </div>

      {/* Main Keypad */}
      <div className="p-3 grid grid-cols-4 gap-1.5 bg-gradient-to-b from-transparent to-black/5">
        <CalcButton variants={itemVariants} icon={<Divide className="w-4 h-4" />} onClick={() => calc.handleOperator('/')} variant="operator" isDark={isDark} />
        <CalcButton variants={itemVariants} icon={<X className="w-4 h-4" />} onClick={() => calc.handleOperator('*')} variant="operator" isDark={isDark} />
        <CalcButton variants={itemVariants} icon={<Minus className="w-4 h-4" />} onClick={() => calc.handleOperator('-')} variant="operator" isDark={isDark} />
        <CalcButton variants={itemVariants} icon={<Plus className="w-4 h-4" />} onClick={() => calc.handleOperator('+')} variant="operator" isDark={isDark} />

        {[7, 8, 9].map(num => (
          <CalcButton key={num} variants={itemVariants} label={num.toString()} onClick={() => calc.handleNumber(num.toString())} isDark={isDark} />
        ))}
        <CalcButton variants={itemVariants} label="0" onClick={() => calc.handleNumber('0')} isDark={isDark} />

        {[4, 5, 6].map(num => (
          <CalcButton key={num} variants={itemVariants} label={num.toString()} onClick={() => calc.handleNumber(num.toString())} isDark={isDark} />
        ))}
        <CalcButton variants={itemVariants} label="." onClick={() => calc.handleNumber('.')} isDark={isDark} />

        {[1, 2, 3].map(num => (
          <CalcButton key={num} variants={itemVariants} label={num.toString()} onClick={() => calc.handleNumber(num.toString())} isDark={isDark} />
        ))}
        <CalcButton
          variants={itemVariants}
          icon={<Equal className="w-5 h-5" />}
          onClick={calc.handleCalculate}
          variant="primary"
          isDark={isDark}
          className="row-span-2 h-full shadow-lg shadow-primary/20"
        />
      </div>

      {/* Keyboard hint */}
      <div className={cn(
        "px-3 pb-2 pt-1 text-[8px] font-bold uppercase tracking-widest text-center opacity-50",
        isDark ? "text-white/40" : "text-muted-foreground"
      )}>
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
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded text-[9px] font-black uppercase hover:opacity-80",
            "text-destructive bg-destructive/10 border border-destructive/20"
          )}
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
            className={cn(
              "w-full text-right p-2 rounded-lg border transition-all hover:scale-[1.02]",
              isDark
                ? "bg-white/5 border-white/10 hover:bg-white/10"
                : "bg-muted/30 border-border/40 hover:bg-muted/60"
            )}
          >
            <div className="text-[10px] font-mono opacity-50 truncate">
              {entry.equation}
            </div>
            <div className={cn(
              "text-lg font-mono font-black truncate",
              isDark ? "text-[#39FF14]" : "text-primary"
            )}>
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
 *  Calcula cuántos billetes de cada denominación suman al display actual
 * ───────────────────────────────────────────────────── */
const CASH_KEY = 'costpro-calc-cash-config';
interface Denomination {
  value: number;
  label: string;
  active: boolean;
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
  try {
    localStorage.setItem(CASH_KEY, JSON.stringify(denoms));
  } catch {
    // ignore
  }
}

interface CashTabContentProps {
  display: string;
  isDark: boolean;
}
const CashTabContent: React.FC<CashTabContentProps> = ({ display, isDark }) => {
  const [denominations, setDenominations] = useState<Denomination[]>(DEFAULT_DENOMINATIONS);
  const [breakdown, setBreakdown] = useState<Record<string, number>>({});
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    setDenominations(loadDenominations());
  }, []);

  const targetAmount = parseFloat(display) || 0;
  const activeDenoms = denominations.filter(d => d.active).sort((a, b) => b.value - a.value);

  // Auto-calcular desglose óptimo (greedy)
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

  return (
    <div className="p-3 space-y-2">
      {/* Target amount */}
      <div className={cn(
        "rounded-lg px-3 py-2 flex items-center justify-between",
        isDark ? "bg-black/40" : "bg-slate-50"
      )}>
        <span className="text-[9px] font-black uppercase text-muted-foreground">Desglosar:</span>
        <span className={cn(
          "text-lg font-mono font-black tabular-nums",
          isDark ? "text-[#39FF14]" : "text-primary"
        )}>
          {formatCurrency(targetAmount)}
        </span>
      </div>

      {/* Toggle config */}
      <button
        type="button"
        onClick={() => setShowConfig(!showConfig)}
        className={cn(
          "w-full py-1.5 rounded-lg text-[9px] font-black uppercase flex items-center justify-center gap-1 border",
          isDark ? "border-white/10 hover:bg-white/5" : "border-border/40 hover:bg-muted/30"
        )}
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

      {/* Auto-calc button */}
      <button
        type="button"
        onClick={calculateOptimal}
        disabled={targetAmount <= 0}
        className="w-full h-9 rounded-lg bg-success text-white text-[10px] font-black uppercase hover:opacity-90 disabled:opacity-30 flex items-center justify-center gap-1"
      >
        <DollarSign className="w-3.5 h-3.5" /> Calcular óptimo
      </button>

      {/* Breakdown input list */}
      <div className="space-y-1 max-h-[250px] overflow-y-auto no-scrollbar">
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
          <span className="text-success tabular-nums">{formatCurrency(breakdownTotal)}</span>
        </div>
        <div className="flex justify-between text-[10px] font-bold">
          <span>Objetivo:</span>
          <span className="tabular-nums">{formatCurrency(targetAmount)}</span>
        </div>
        <div className="flex justify-between text-sm font-black">
          <span>Diferencia:</span>
          <span className={cn(
            "tabular-nums",
            Math.abs(difference) < 0.01 ? "text-success"
            : difference > 0 ? "text-amber-500"
            : "text-destructive"
          )}>
            {Math.abs(difference) < 0.01 ? '✓ Exacto' : `${difference > 0 ? '+' : ''}${formatCurrency(difference)}`}
          </span>
        </div>
      </div>

      {/* Clear breakdown */}
      {Object.keys(breakdown).length > 0 && (
        <button
          type="button"
          onClick={() => setBreakdown({})}
          className="w-full py-1.5 rounded-lg text-[9px] font-black uppercase text-destructive bg-destructive/10 border border-destructive/20 hover:bg-destructive/20"
        >
          Limpiar desglose
        </button>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────────────
 *  Config Tab — Configuración general
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
              <span className={cn(
                "font-mono font-bold px-1.5 py-0.5 rounded text-[9px]",
                isDark ? "bg-white/10" : "bg-muted"
              )}>
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
          <p>✓ Configuración de billetes activos</p>
          <p>✓ Operador encadenado (9+5-3)</p>
          <p>✓ Signo ± y porcentaje %</p>
        </div>
      </div>

      <div className="border-t border-border/30 pt-3">
        <p className="text-[9px] text-muted-foreground/60 text-center">
          CostPro Pro Calculator v2.0
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
  isDark: boolean;
}
const MemButton: React.FC<MemButtonProps> = ({ label, onClick, disabled, isDark }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "h-8 rounded-lg text-[10px] font-black uppercase border transition-all",
      disabled
        ? "opacity-30 cursor-not-allowed"
        : (isDark
          ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border-amber-500/20"
          : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border-amber-500/20")
    )}
  >
    {label}
  </button>
);

/* ─────────────────────────────────────────────────────
 *  Calc Button (extended with isDark prop)
 * ───────────────────────────────────────────────────── */
interface CalcButtonProps {
  label?: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'number' | 'operator' | 'primary' | 'danger' | 'secondary';
  className?: string;
  variants?: Variants;
  isDark: boolean;
}
const CalcButton: React.FC<CalcButtonProps> = ({ label, icon, onClick, variant = 'number', className, variants, isDark }) => {
  const variantStyles = {
    number: isDark
      ? "bg-white/5 hover:bg-white/10 text-foreground border-white/5"
      : "bg-muted/30 hover:bg-muted/60 text-foreground border-border/40",
    operator: isDark
      ? "bg-[#39FF14]/5 hover:bg-[#39FF14]/20 text-[#39FF14] border-[#39FF14]/10"
      : "bg-primary/5 hover:bg-primary/20 text-primary border-primary/10",
    primary: isDark
      ? "bg-[#39FF14] hover:bg-[#39FF14]/90 text-foreground border-[#39FF14]"
      : "bg-primary hover:bg-primary/90 text-foreground border-primary",
    danger: isDark
      ? "bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/20"
      : "bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/20",
    secondary: isDark
      ? "bg-white/10 hover:bg-white/20 text-white/70 border-white/10"
      : "bg-muted hover:bg-muted/80 text-muted-foreground border-border",
  };

  return (
    <motion.button
      type="button"
      variants={variants}
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
