'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Delete, Divide, Plus, Minus, Equal, X } from 'lucide-react';
import { cn } from "@/lib/utils";
import { createSafeParser } from '@/lib/cost-engine/parser-factory';

export const CostSheetCalculator: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const [lastResult, setLastResult] = useState<number | null>(null);
  // Calculator Logic
  const handleNumber = (num: string) => {
    if (display === '0' || lastResult !== null) {
      setDisplay(num);
      setLastResult(null);
    } else {
      if (display.length < 15) {
        setDisplay(display + num);
      }
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

  // Sandboxed parser instance — safe alternative to eval/new Function
  const safeParser = useMemo(() => createSafeParser(), []);

  const handleCalculate = () => {
    try {
      if (!equation) return;
      const fullEquation = equation + display;
      const sanitized = fullEquation.replace(/[^-0-9+*/.()]/g, '');
      const result = safeParser.evaluate(sanitized);
      const num = typeof result === 'number' ? result : Number(result);
      const resultStr = String(Number(num.toFixed(8)));
      setDisplay(resultStr.length > 15 ? num.toExponential(4) : resultStr);
      setEquation('');
      setLastResult(num);
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
  }, [display, equation, lastResult]);

  return (
    <div className={cn(
        "flex flex-col h-full overflow-hidden transition-colors duration-500",
        "bg-transparent dark:bg-[var(--background)]"
    )}>
      {/* Display */}
      <div className={cn(
        "px-8 py-8 flex flex-col items-end justify-center gap-1 min-h-[120px] shrink-0 relative overflow-hidden",
        "bg-slate-50/50 dark:bg-black/60"
      )}>
        {/* Neon Grid Effect */}
        <div className={cn(
            "absolute inset-0 opacity-[0.05] pointer-events-none",
            "bg-[radial-gradient(#000_1px,transparent_1px)] bg-[size:20px_20px] dark:bg-[radial-gradient(hsl(var(--primary))_1px,transparent_1px)]"
        )} />

        <motion.div className={cn(
            "text-[10px] font-mono h-4 uppercase tracking-[0.2em] font-black",
            "text-muted-foreground/40 dark:text-[hsl(var(--primary))]/40"
        )}>
          {equation || '\u00A0'}
        </motion.div>
        <motion.div
          key={display}
          initial={{ y: 5, opacity: 0 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
          className={cn(
            "text-[clamp(2.25rem,12vw,3rem)] font-mono tracking-tighter w-full text-right font-black",
            "text-primary dark:text-[hsl(var(--primary))] dark:drop-shadow-[0_0_15px_rgba(22,163,74,0.5)]"
          )}
        >
          {display}
        </motion.div>
      </div>

      {/* Keypad */}
      <div className={cn(
          "flex-1 p-6 grid grid-cols-4 gap-3 overflow-hidden",
          "bg-gradient-to-b from-transparent to-black/5 dark:from-black/0 dark:to-[hsl(var(--primary))]/5"
      )}>
        <CalcButton label="C" onClick={handleClear} variant="danger" />
        <CalcButton icon={<Delete className="w-5 h-5" />} onClick={handleBackspace} variant="secondary" />
        <CalcButton icon={<Divide className="w-5 h-5" />} onClick={() => handleOperator('/')} variant="operator" />
        <CalcButton icon={<X className="w-5 h-5" />} onClick={() => handleOperator('*')} variant="operator" />

        {[7, 8, 9].map(num => (
          <CalcButton key={num} label={num.toString()} onClick={() => handleNumber(num.toString())} />
        ))}
        <CalcButton icon={<Minus className="w-5 h-5" />} onClick={() => handleOperator('-')} variant="operator" />

        {[4, 5, 6].map(num => (
          <CalcButton key={num} label={num.toString()} onClick={() => handleNumber(num.toString())} />
        ))}
        <CalcButton icon={<Plus className="w-5 h-5" />} onClick={() => handleOperator('+')} variant="operator" />

        {[1, 2, 3].map(num => (
          <CalcButton key={num} label={num.toString()} onClick={() => handleNumber(num.toString())} />
        ))}
        <CalcButton
          icon={<Equal className="w-6 h-6" />}
          onClick={handleCalculate}
          variant="primary"
          className="row-span-2 h-full shadow-2xl shadow-primary/40"
        />

        <CalcButton label="0" onClick={() => handleNumber('0')} className="col-span-2" />
        <CalcButton label="." onClick={() => handleNumber('.')} />
      </div>
    </div>
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
  const prefersReducedMotion = useReducedMotion();
  const variantStyles = {
    number: "bg-muted/30 hover:bg-muted/60 text-foreground border-border/40 shadow-sm dark:bg-white/5 dark:hover:bg-white/10 dark:border-white/5 dark:shadow-inner",
    operator: "bg-primary/5 hover:bg-primary/20 text-primary border-primary/10",
    primary: "bg-primary hover:bg-primary/90 text-foreground border-primary shadow-lg shadow-primary/20 dark:shadow-[hsl(var(--primary))]/30",
    danger: "bg-destructive/10 hover:bg-destructive/20 text-destructive border-destructive/20",
    secondary: "bg-muted hover:bg-muted/80 text-muted-foreground border-border dark:bg-white/10 dark:hover:bg-white/20 dark:text-white/70 dark:border-white/10",
  };

  return (
    <motion.button
      type="button"
      whileHover={prefersReducedMotion ? {} : { scale: 1.02 }}
      whileTap={prefersReducedMotion ? {} : { scale: 0.95, transition: { type: "spring", stiffness: 400, damping: 10 } }}
      onClick={onClick}
      className={cn(
        "h-14 rounded-2xl flex items-center justify-center text-lg font-black border transition-all duration-200",
        variantStyles[variant],
        className
      )}
    >
      {label || icon}
    </motion.button>
  );
};
