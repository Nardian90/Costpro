'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import {
  Calculator,
  X,
  Divide,
  Minus,
  Plus,
  Equal,
  RotateCcw,
  GripHorizontal,
  Delete,
  ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';

interface Position {
  x: number;
  y: number;
}

export const FloatingCalculator: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const [lastResult, setLastResult] = useState<number | null>(null);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [isMounted, setIsMounted] = useState(false);
  const { resolvedTheme } = useTheme();
  const dragControls = useDragControls();
  const constraintsRef = useRef<HTMLDivElement>(null);

  // Persistence
  useEffect(() => {
    const savedPos = localStorage.getItem('floating-calc-pos');
    if (savedPos) {
      try {
        setPosition(JSON.parse(savedPos));
      } catch (e) {
        console.error('Failed to parse calc position', e);
      }
    }
    setIsMounted(true);
  }, []);

  const handleDragEnd = useCallback((_: any, info: any) => {
    setPosition(prev => {
      const newPos = {
        x: prev.x + info.offset.x,
        y: prev.y + info.offset.y
      };
      localStorage.setItem('floating-calc-pos', JSON.stringify(newPos));
      return newPos;
    });
  }, []);

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
      // eslint-disable-next-line no-eval
      const result = eval(sanitized);
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

  if (!isMounted) return null;

  const isDark = resolvedTheme === 'dark';

  const containerVariants = {
    closed: {
      scale: 0,
      opacity: 0,
      rotate: -15,
      originX: "90%",
      originY: "90%",
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 30,
        staggerChildren: 0.01,
        staggerDirection: -1,
        when: "afterChildren"
      }
    },
    open: {
      scale: 1,
      opacity: 1,
      rotate: 0,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 25,
        staggerChildren: 0.02,
        delayChildren: 0.05
      }
    }
  };

  const itemVariants = {
    closed: { opacity: 0, scale: 0.5, rotate: -20, y: 10 },
    open: { opacity: 1, scale: 1, rotate: 0, y: 0 }
  };

  return (
    <>
      <div className="fixed inset-4 pointer-events-none z-[9999]" ref={constraintsRef} />

      <div className="fixed inset-0 pointer-events-none z-[9999]">
        <motion.div
          drag
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={constraintsRef}
          dragMomentum={false}
          onDragEnd={handleDragEnd}
          style={{ x: position.x, y: position.y }}
          className="absolute pointer-events-auto flex flex-col items-end"
          style={{
            right: 24,
            bottom: 84,
            x: position.x,
            y: position.y
          }}
        >
          <AnimatePresence mode="wait">
            {isOpen && (
              <motion.div
                variants={containerVariants}
                initial="closed"
                animate="open"
                exit="closed"
                className={cn(
                  "mb-4 w-72 rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] overflow-hidden border-2 flex flex-col transition-colors duration-500 backdrop-blur-xl",
                  isDark
                    ? "bg-[#010203]/90 border-[#39FF14]/30 text-white"
                    : "bg-white/90 border-primary/30 text-foreground"
                )}
              >
                {/* Header / Drag Handle */}
                <div
                  onPointerDown={(e) => dragControls.start(e)}
                  className={cn(
                    "p-5 flex items-center justify-between cursor-grab active:cursor-grabbing border-b",
                    isDark ? "bg-white/5 border-white/10" : "bg-muted/50 border-border/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center",
                      isDark ? "bg-[#39FF14]/10" : "bg-primary/10"
                    )}>
                      <Calculator className={cn("w-4 h-4", isDark ? "text-[#39FF14]" : "text-primary")} />
                    </div>
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 leading-none">C-Pro</h4>
                      <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Calculadora</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <GripHorizontal className="w-4 h-4 opacity-20" />
                    <button
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        "hover:rotate-90 transition-transform p-1.5 rounded-full",
                        isDark ? "hover:bg-white/10" : "hover:bg-black/5"
                      )}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* LCD Display */}
                <div className={cn(
                  "px-6 py-8 flex flex-col items-end justify-center gap-1 min-h-[120px] relative overflow-hidden",
                  isDark ? "bg-black/40" : "bg-slate-50/50"
                )}>
                  <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                       style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '10px 10px' }} />

                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 0.4, x: 0 }}
                    className="text-[11px] font-mono h-4 uppercase tracking-widest font-bold"
                  >
                    {equation || '\u00A0'}
                  </motion.div>
                  <motion.div
                    key={display}
                    initial={{ scale: 0.95, opacity: 0.8 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={cn(
                      "text-4xl font-mono tracking-tighter overflow-hidden text-ellipsis w-full text-right font-black",
                      isDark
                        ? "text-[#39FF14] drop-shadow-[0_0_12px_rgba(57,255,20,0.5)]"
                        : "text-primary"
                    )}
                  >
                    {display}
                  </motion.div>
                </div>

                {/* Keypad */}
                <div className="p-5 grid grid-cols-4 gap-3 bg-gradient-to-b from-transparent to-black/5">
                  <CalcButton variants={itemVariants} label="C" onClick={handleClear} variant="danger" />
                  <CalcButton variants={itemVariants} icon={<Delete className="w-4 h-4" />} onClick={handleBackspace} variant="secondary" />
                  <CalcButton variants={itemVariants} icon={<Divide className="w-4 h-4" />} onClick={() => handleOperator('/')} variant="operator" />
                  <CalcButton variants={itemVariants} icon={<X className="w-4 h-4" />} onClick={() => handleOperator('*')} variant="operator" />

                  <CalcButton variants={itemVariants} label="7" onClick={() => handleNumber('7')} />
                  <CalcButton variants={itemVariants} label="8" onClick={() => handleNumber('8')} />
                  <CalcButton variants={itemVariants} label="9" onClick={() => handleNumber('9')} />
                  <CalcButton variants={itemVariants} icon={<Minus className="w-4 h-4" />} onClick={() => handleOperator('-')} variant="operator" />

                  <CalcButton variants={itemVariants} label="4" onClick={() => handleNumber('4')} />
                  <CalcButton variants={itemVariants} label="5" onClick={() => handleNumber('5')} />
                  <CalcButton variants={itemVariants} label="6" onClick={() => handleNumber('6')} />
                  <CalcButton variants={itemVariants} icon={<Plus className="w-4 h-4" />} onClick={() => handleOperator('+')} variant="operator" />

                  <CalcButton variants={itemVariants} label="1" onClick={() => handleNumber('1')} />
                  <CalcButton variants={itemVariants} label="2" onClick={() => handleNumber('2')} />
                  <CalcButton variants={itemVariants} label="3" onClick={() => handleNumber('3')} />
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

          <motion.button
            whileHover={{ scale: 1.05, rotate: 5 }}
            whileTap={{ scale: 0.9, rotate: -5 }}
            onClick={() => setIsOpen(!isOpen)}
            className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all z-20 border-2 relative group overflow-hidden",
              isOpen
                ? (isDark ? "bg-[#010203] border-[#39FF14] text-[#39FF14]" : "bg-white border-primary text-primary")
                : (isDark ? "bg-[#39FF14] border-[#39FF14] text-black" : "bg-primary border-primary text-white")
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />

            <AnimatePresence mode="wait">
              {isOpen ? (
                <motion.div
                  key="close"
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                >
                  <ChevronDown className="w-7 h-7" />
                </motion.div>
              ) : (
                <motion.div
                  key="open"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                >
                  <Calculator className="w-7 h-7" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </motion.div>
      </div>
    </>
  );
};

interface CalcButtonProps {
  label?: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'number' | 'operator' | 'primary' | 'danger' | 'secondary';
  className?: string;
  variants?: any;
}

const CalcButton: React.FC<CalcButtonProps> = ({ label, icon, onClick, variant = 'number', className, variants }) => {
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
      variants={variants}
      whileTap={{ scale: 0.9, transition: { type: "spring", stiffness: 400, damping: 10 } }}
      onClick={onClick}
      className={cn(
        "h-14 rounded-2xl flex items-center justify-center text-base font-bold border transition-all duration-300",
        variantStyles[variant],
        className
      )}
    >
      {label || icon}
    </motion.button>
  );
};
