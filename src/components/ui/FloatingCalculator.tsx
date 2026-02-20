'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calculator, X, Delete, Divide, Plus, Minus, Equal,
  Move, ChevronRight
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { useTheme } from 'next-themes';
import { useUIStore } from '@/store';

export const FloatingCalculator: React.FC = () => {
  const { isCalculatorOpen, setIsCalculatorOpen } = useUIStore();
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const [lastResult, setLastResult] = useState<number | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const closeCalculator = () => setIsCalculatorOpen(false);

  // Calculator Logic
  const handleNumber = (num: string) => {
    if (display === '0' || lastResult !== null) {
      setDisplay(num);
      setLastResult(null);
    } else {
      if (display.length < 12) setDisplay(display + num);
    }
  };

  const handleOperator = (op: string) => {
    setEquation(display + ' ' + op + ' ');
    setLastResult(null);
    setDisplay('0');
  };

  const handleClear = () => {
    setDisplay('0');
    setEquation('');
    setLastResult(null);
  };

  const handleCalculate = () => {
    try {
      if (!equation) return;
      const fullEquation = equation + display;
      const sanitized = fullEquation.replace(/[^-0-9+*/.]/g, '');
      const result = new Function(`return ${sanitized}`)();
      const resultStr = String(Number(result.toFixed(8)));
      setDisplay(resultStr.length > 12 ? result.toExponential(4) : resultStr);
      setEquation('');
      setLastResult(result);
    } catch (e) {
      setDisplay('Error');
    }
  };

  const handleBackspace = () => {
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay('0');
    }
  };

  // Keyboard Support
  useEffect(() => {
    if (!isCalculatorOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (/[0-9]/.test(e.key)) handleNumber(e.key);
      if (['+', '-', '*', '/'].includes(e.key)) handleOperator(e.key);
      if (e.key === 'Enter' || e.key === '=') handleCalculate();
      if (e.key === 'Backspace') handleBackspace();
      if (e.key === 'Escape') handleClear();
      if (e.key === '.') handleNumber('.');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [display, equation, lastResult, isCalculatorOpen]);

  return (
    <AnimatePresence>
      {isCalculatorOpen && (
        <motion.div
          drag
          dragMomentum={false}
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className={cn(
            "fixed bottom-20 right-6 z-[100] w-[320px] overflow-hidden rounded-[2.5rem] border shadow-2xl backdrop-blur-xl transition-colors duration-300",
            isDark ? "bg-background/95 border-primary/20" : "bg-white/95 border-primary/10"
          )}
        >
          {/* Header */}
          <div className={cn(
            "p-4 flex items-center justify-between border-b cursor-move",
            isDark ? "bg-white/5 border-white/5" : "bg-primary/5 border-primary/5"
          )}>
            <div className="flex items-center gap-2">
              <div className={cn(
                "p-1.5 rounded-lg bg-primary/10"
              )}>
                <Calculator className="w-4 h-4 text-primary" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Calculadora</p>
            </div>
            <button
              onClick={closeCalculator}
              className="p-1.5 rounded-full hover:bg-red-500/10 hover:text-red-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Display */}
          <div className={cn(
            "px-6 py-6 flex flex-col items-end justify-center gap-1 min-h-[100px] relative overflow-hidden",
            isDark ? "bg-black/40" : "bg-slate-50/50"
          )}>
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none"
                 style={{ backgroundImage: 'radial-gradient(var(--primary) 1px, transparent 1px)', backgroundSize: '10px 10px' }} />

            <div className="text-[10px] font-mono h-4 uppercase tracking-widest font-bold text-primary/40">
              {equation || '\u00A0'}
            </div>
            <div className="text-4xl font-mono tracking-tighter w-full text-right font-black text-primary">
              {display}
            </div>
          </div>

          {/* Keypad */}
          <div className="p-4 grid grid-cols-4 gap-2 bg-gradient-to-b from-transparent to-primary/5">
            <CalcButton label="C" onClick={handleClear} variant="danger" />
            <CalcButton icon={<Delete className="w-4 h-4" />} onClick={handleBackspace} variant="secondary" />
            <CalcButton icon={<Divide className="w-4 h-4" />} onClick={() => handleOperator('/')} variant="operator" />
            <CalcButton icon={<X className="w-4 h-4" />} onClick={() => handleOperator('*')} variant="operator" />

            {[7, 8, 9].map(num => (
              <CalcButton key={num} label={num.toString()} onClick={() => handleNumber(num.toString())} />
            ))}
            <CalcButton icon={<Minus className="w-4 h-4" />} onClick={() => handleOperator('-')} variant="operator" />

            {[4, 5, 6].map(num => (
              <CalcButton key={num} label={num.toString()} onClick={() => handleNumber(num.toString())} />
            ))}
            <CalcButton icon={<Plus className="w-4 h-4" />} onClick={() => handleOperator('+')} variant="operator" />

            {[1, 2, 3].map(num => (
              <CalcButton key={num} label={num.toString()} onClick={() => handleNumber(num.toString())} />
            ))}
            <CalcButton
              icon={<Equal className="w-5 h-5" />}
              onClick={handleCalculate}
              variant="primary"
              className="row-span-2 h-full"
            />

            <CalcButton label="0" onClick={() => handleNumber('0')} className="col-span-2" />
            <CalcButton label="." onClick={() => handleNumber('.')} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

interface CalcButtonProps {
  label?: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'number' | 'operator' | 'primary' | 'danger' | 'secondary';
  className?: string;
}

const CalcButton: React.FC<CalcButtonProps> = ({ label, icon, onClick, variant = 'number', className }) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const variantStyles = {
    number: isDark
      ? "bg-white/5 hover:bg-white/10 text-white border-white/5"
      : "bg-muted/30 hover:bg-muted/60 text-foreground border-border/40",
    operator: "bg-primary/5 hover:bg-primary/20 text-primary border-primary/10",
    primary: "bg-primary hover:bg-primary/90 text-primary-foreground border-primary",
    danger: "bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/20",
    secondary: isDark
      ? "bg-white/10 hover:bg-white/20 text-white/70 border-white/10"
      : "bg-muted hover:bg-muted/80 text-muted-foreground border-border",
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "h-12 rounded-xl flex items-center justify-center text-sm font-bold border transition-all duration-150 active:scale-90",
        variantStyles[variant],
        className
      )}
    >
      {label || icon}
    </button>
  );
};
