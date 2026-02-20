'use client';

import React, { useState, useEffect } from 'react';
import { motion, Variants } from 'framer-motion';
import { Calculator, X, Delete, Divide, Plus, Minus, Equal } from 'lucide-react';
import { cn } from "@/lib/utils";
import { useTheme } from 'next-themes';

export const CostSheetCalculator: React.FC = () => {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const [lastResult, setLastResult] = useState<number | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

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

  const handleCalculate = () => {
    try {
      if (!equation) return;
      const fullEquation = equation + display;
      const sanitized = fullEquation.replace(/[^-0-9+*/.]/g, '');
      const result = new Function(`return ${sanitized}`)();
      const resultStr = String(Number(result.toFixed(8)));
      setDisplay(resultStr.length > 15 ? result.toExponential(4) : resultStr);
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
    <div className="flex flex-col h-full bg-transparent overflow-hidden">
      {/* Display - Optimized for ergonomics */}
      <div className={cn(
        "px-6 py-6 flex flex-col items-end justify-center gap-1 min-h-[100px] shrink-0 relative overflow-hidden",
        isDark ? "bg-black/40" : "bg-slate-50/50"
      )}>
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
             style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '12px 12px' }} />

        <motion.div className="text-[10px] font-mono h-4 uppercase tracking-[0.2em] font-bold opacity-30">
          {equation || '\u00A0'}
        </motion.div>
        <motion.div
          key={display}
          initial={{ y: 5, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={cn(
            "text-4xl font-mono tracking-tighter w-full text-right font-black",
            isDark
              ? "text-[#39FF14] drop-shadow-[0_0_10px_rgba(57,255,20,0.4)]"
              : "text-primary"
          )}
        >
          {display}
        </motion.div>
      </div>

      {/* Keypad - Compact for no scroll */}
      <div className="flex-1 p-4 grid grid-cols-4 gap-2 bg-gradient-to-b from-transparent to-black/5 overflow-hidden">
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
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const variantStyles = {
    number: isDark
      ? "bg-white/5 hover:bg-white/10 text-white border-white/5"
      : "bg-muted/30 hover:bg-muted/60 text-foreground border-border/40",
    operator: isDark
      ? "bg-[#39FF14]/5 hover:bg-[#39FF14]/20 text-[#39FF14] border-[#39FF14]/10"
      : "bg-primary/5 hover:bg-primary/20 text-primary border-primary/10",
    primary: isDark
      ? "bg-[#39FF14] hover:bg-[#39FF14]/90 text-black border-[#39FF14]"
      : "bg-primary hover:bg-primary/90 text-white border-primary",
    danger: isDark
      ? "bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/20"
      : "bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/20",
    secondary: isDark
      ? "bg-white/10 hover:bg-white/20 text-white/70 border-white/10"
      : "bg-muted hover:bg-muted/80 text-muted-foreground border-border",
  };

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        "h-11 rounded-xl flex items-center justify-center text-sm font-black border transition-all duration-200",
        variantStyles[variant],
        className
      )}
    >
      {label || icon}
    </motion.button>
  );
};
