'use client';

import React, { useState, useRef, useEffect, useSyncExternalStore } from 'react'; // FIX-ACC-006
import { motion, AnimatePresence, Variants } from 'framer-motion';
import {
  Calculator,
  X,
  Delete,
  Plus,
  Minus,
  Divide,
  Equal,
  Move
} from 'lucide-react';
import { cn, isDarkTheme } from "@/lib/utils";
import { useTheme } from 'next-themes';
import { useUIStore } from '@/store';

export const FloatingCalculator: React.FC = () => {
  const { isCalculatorOpen, setIsCalculatorOpen } = useUIStore();
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const [lastResult, setLastResult] = useState<number | null>(null);
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const { resolvedTheme } = useTheme();
  const constraintsRef = useRef(null);

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
      // Sanitize input
      const sanitized = fullEquation.replace(/[^-0-9+*/.]/g, '');
      // Use Function constructor instead of eval for slightly better practice
      const result = new Function(`return ${sanitized}`)();
      if (result === undefined || result === null || isNaN(result)) {
        throw new Error('Invalid result');
      }
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

  const closeCalculator = () => {
    setIsCalculatorOpen(false);
  };

  // FIX-ACC-006: Escape key handler to close calculator dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isCalculatorOpen) closeCalculator();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCalculatorOpen, closeCalculator]);

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
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 30
      }
    },
    open: {
      opacity: 1,
      scale: 1,
      rotate: 0,
      y: 0,
      filter: "blur(0px)",
      transition: {
        type: "spring",
        stiffness: 150,
        damping: 15,
        staggerChildren: 0.03,
        delayChildren: 0.1
      }
    }
  };

  const itemVariants: Variants = {
    closed: { opacity: 0, scale: 0.5, rotate: -20, y: 10 },
    open: { opacity: 1, scale: 1, rotate: 0, y: 0 }
  };

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
            role="dialog" /* FIX-ACC-006 */
            aria-label="Calculadora CostPro"
            aria-modal="true"
            className={cn(
              "absolute top-24 right-4 sm:right-12 w-[280px] sm:w-[320px] max-w-[calc(100vw-2rem)] rounded-[2rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] overflow-hidden border flex flex-col pointer-events-auto",
              isDark
                ? "bg-[#010203]/95 border-[#39FF14]/30 text-foreground"
                : "bg-white/95 border-primary/30 text-foreground"
            )}
          >
            {/* Draggable Handle */}
            <div className={cn(
              "p-4 flex items-center justify-between border-b cursor-move active:cursor-grabbing",
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
                  <h4 className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40 leading-none">CostPro</h4>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 flex items-center gap-1">
                    Calc <Move className="w-2 h-2 opacity-50" />
                  </p>
                </div>
              </div>
              <button
                type="button" /* FIX-ACC-020 */
                onClick={closeCalculator}
                aria-label="Cerrar calculadora" /* FIX-ACC-003 */
                className={cn(
                  "hover:rotate-90 transition-transform p-1.5 rounded-full",
                  isDark ? "hover:bg-white/10" : "hover:bg-black/5"
                )}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Display */}
            <div className={cn(
              "px-6 py-6 flex flex-col items-end justify-center gap-1 min-h-[100px] relative overflow-hidden",
              isDark ? "bg-black/40" : "bg-slate-50/50"
            )}>
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                   style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '10px 10px' }} />

              <motion.div className="text-[10px] font-mono h-4 uppercase tracking-widest font-bold opacity-40">
                {equation || '\u00A0'}
              </motion.div>
              <motion.div
                key={display}
                initial={{ y: 5, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className={cn(
                  "text-4xl font-mono tracking-tighter w-full text-right font-black",
                  isDark
                    ? "text-[#39FF14] drop-shadow-[0_0_10px_rgba(57,255,20,0.3)]"
                    : "text-primary"
                )}
              >
                {display}
              </motion.div>
            </div>

            {/* Keypad */}
            <div className="p-4 grid grid-cols-4 gap-2 bg-gradient-to-b from-transparent to-black/5">
              <CalcButton variants={itemVariants} label="C" onClick={handleClear} variant="danger" />
              <CalcButton variants={itemVariants} icon={<Delete className="w-4 h-4" />} onClick={handleBackspace} variant="secondary" />
              <CalcButton variants={itemVariants} icon={<Divide className="w-4 h-4" />} onClick={() => handleOperator('/')} variant="operator" />
              <CalcButton variants={itemVariants} icon={<X className="w-4 h-4" />} onClick={() => handleOperator('*')} variant="operator" />

              {[7, 8, 9].map(num => (
                <CalcButton key={num} variants={itemVariants} label={num.toString()} onClick={() => handleNumber(num.toString())} />
              ))}
              <CalcButton variants={itemVariants} icon={<Minus className="w-4 h-4" />} onClick={() => handleOperator('-')} variant="operator" />

              {[4, 5, 6].map(num => (
                <CalcButton key={num} variants={itemVariants} label={num.toString()} onClick={() => handleNumber(num.toString())} />
              ))}
              <CalcButton variants={itemVariants} icon={<Plus className="w-4 h-4" />} onClick={() => handleOperator('+')} variant="operator" />

              {[1, 2, 3].map(num => (
                <CalcButton key={num} variants={itemVariants} label={num.toString()} onClick={() => handleNumber(num.toString())} />
              ))}
              <CalcButton
                variants={itemVariants}
                icon={<Equal className="w-5 h-5" />}
                onClick={handleCalculate}
                variant="primary"
                className="row-span-2 h-full shadow-lg shadow-primary/20"
              />

              <CalcButton variants={itemVariants} label="0" onClick={() => handleNumber('0')} className="col-span-2" />
              <CalcButton variants={itemVariants} label="." onClick={() => handleNumber('.')} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface CalcButtonProps {
  label?: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'number' | 'operator' | 'primary' | 'danger' | 'secondary';
  className?: string;
  variants?: Variants;
}

const CalcButton: React.FC<CalcButtonProps> = ({ label, icon, onClick, variant = 'number', className, variants }) => {
  const { resolvedTheme } = useTheme();
  const isDark = isDarkTheme(resolvedTheme);

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
      type="button" /* FIX-ACC-020 */
      variants={variants}
      whileTap={{ scale: 0.9, transition: { type: "spring", stiffness: 400, damping: 10 } }}
      onClick={onClick}
      className={cn(
        "h-12 rounded-xl flex items-center justify-center text-sm font-bold border transition-all duration-300",
        variantStyles[variant],
        className
      )}
    >
      {label || icon}
    </motion.button>
  );
};
