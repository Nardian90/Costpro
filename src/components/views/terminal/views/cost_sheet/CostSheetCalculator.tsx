'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calculator, Delete, Divide, Plus, Minus, Equal, X } from 'lucide-react';
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
    <div className={cn(
        "flex flex-col h-full overflow-hidden transition-colors duration-500",
        isDark ? "bg-[#010203]" : "bg-transparent"
    )}>
      {/* Display */}
      <div className={cn(
        "px-8 py-8 flex flex-col items-end justify-center gap-1 min-h-[120px] shrink-0 relative overflow-hidden",
        isDark ? "bg-black/60" : "bg-slate-50/50"
      )}>
        {/* Neon Grid Effect */}
        <div className={cn(
            "absolute inset-0 opacity-[0.05] pointer-events-none",
            isDark ? "bg-[radial-gradient(#39FF14_1px,transparent_1px)] bg-[size:20px_20px]" : "bg-[radial-gradient(#000_1px,transparent_1px)] bg-[size:20px_20px]"
        )} />

        <motion.div className={cn(
            "text-[10px] font-mono h-4 uppercase tracking-[0.2em] font-black",
            isDark ? "text-[#39FF14]/40" : "text-muted-foreground/40"
        )}>
          {equation || '\u00A0'}
        </motion.div>
        <motion.div
          key={display}
          initial={{ y: 5, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={cn(
            "text-5xl font-mono tracking-tighter w-full text-right font-black",
            isDark
              ? "text-[#39FF14] drop-shadow-[0_0_15px_rgba(57,255,20,0.5)]"
              : "text-primary"
          )}
        >
          {display}
        </motion.div>
      </div>

      {/* Keypad */}
      <div className={cn(
          "flex-1 p-6 grid grid-cols-4 gap-3 overflow-hidden",
          isDark ? "bg-gradient-to-b from-black/0 to-[#39FF14]/5" : "bg-gradient-to-b from-transparent to-black/5"
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
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const variantStyles = {
    number: isDark
      ? "bg-white/5 hover:bg-white/10 text-white border-white/5 shadow-inner"
      : "bg-muted/30 hover:bg-muted/60 text-foreground border-border/40 shadow-sm",
    operator: isDark
      ? "bg-[#39FF14]/5 hover:bg-[#39FF14]/20 text-[#39FF14] border-[#39FF14]/20"
      : "bg-primary/5 hover:bg-primary/20 text-primary border-primary/10",
    primary: isDark
      ? "bg-[#39FF14] hover:bg-[#39FF14]/90 text-black border-[#39FF14] shadow-lg shadow-[#39FF14]/30"
      : "bg-primary hover:bg-primary/90 text-white border-primary shadow-lg shadow-primary/20",
    danger: isDark
      ? "bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/20"
      : "bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/20",
    secondary: isDark
      ? "bg-white/10 hover:bg-white/20 text-white/70 border-white/10"
      : "bg-muted hover:bg-muted/80 text-muted-foreground border-border",
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.95, transition: { type: "spring", stiffness: 400, damping: 10 } }}
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
