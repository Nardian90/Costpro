'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X as XIcon, Calculator, Bot, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { CospiChat } from './CospiChat';
import { CostSheetCalculator } from './CostSheetCalculator';

interface CostSheetSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'calculator' | 'ai';
  sheetData: any;
}

export const CostSheetSidePanel: React.FC<CostSheetSidePanelProps> = ({
  isOpen,
  onClose,
  mode,
  sheetData,
}) => {
  const [isFullView, setIsFullView] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const panelVariants = {
    closed: {
      x: '-100%',
      opacity: 0,
      scale: 0.9,
      rotateY: -20,
      transition: {
        type: 'spring',
        damping: 30,
        stiffness: 300
      }
    },
    open: {
      x: 0,
      opacity: 1,
      scale: 1,
      rotateY: 0,
      transition: {
        type: 'spring',
        damping: 20,
        stiffness: 150,
        staggerChildren: 0.1
      }
    }
  };

  const indicatorVariants = {
    closed: { x: 0, opacity: 1 },
    open: { x: -20, opacity: 0 }
  };

  return (
    <>
      {/* Closed Indicator / Trigger Tab */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial="open"
            animate="closed"
            exit="open"
            variants={indicatorVariants}
            onClick={() => {}} // This should probably trigger open if we had a toggle
            className={cn(
                "fixed left-0 top-1/2 -translate-y-1/2 z-[45] group flex flex-col items-center gap-4 py-6 px-1.5 rounded-r-3xl border-y border-r transition-all duration-500",
                isDark
                    ? "bg-[#010203]/80 border-[#39FF14]/20 hover:border-[#39FF14]/50 backdrop-blur-md"
                    : "bg-white/80 border-primary/20 hover:border-primary/50 backdrop-blur-md"
            )}
          >
            <div className={cn(
                "w-1 h-8 rounded-full mb-2",
                isDark ? "bg-[#39FF14]/30" : "bg-primary/30"
            )} />
            <div className="flex flex-col gap-3">
                 <Calculator className={cn("w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity", isDark ? "text-[#39FF14]" : "text-primary")} />
                 <Bot className={cn("w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity", isDark ? "text-[#39FF14]" : "text-primary")} />
            </div>
            <ChevronRight className={cn("w-3 h-3 mt-2 opacity-20", isDark ? "text-[#39FF14]" : "text-primary")} />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[90]"
            />

            {/* Side Panel */}
            <motion.aside
              variants={panelVariants}
              initial="closed"
              animate="open"
              exit="closed"
              className={cn(
                "fixed left-4 top-1/2 -translate-y-1/2 z-[100] flex flex-col overflow-hidden transition-all duration-500 rounded-[3rem] border shadow-[0_32px_128px_-16px_rgba(0,0,0,0.5)]",
                isDark ? "bg-[#010203]/95 border-[#39FF14]/20" : "bg-white/95 border-primary/20",
                isFullView
                    ? "w-[85vw] h-[85vh] left-[7.5vw] top-[7.5vh] -translate-y-0"
                    : "w-[400px] h-[650px] max-h-[90vh]"
              )}
            >
              {/* Header */}
              <div className={cn(
                "p-6 flex items-center justify-between border-b",
                isDark ? "bg-white/5 border-white/5" : "bg-muted/30 border-border/50"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2.5 rounded-2xl",
                    isDark ? "bg-white/5 text-[#39FF14]" : "bg-primary/5 text-primary"
                  )}>
                    {mode === 'calculator' ? <Calculator className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 leading-none mb-1">
                        {mode === 'calculator' ? 'Herramienta' : 'Asistente'}
                    </h3>
                    <p className="text-sm font-black uppercase tracking-widest italic">
                        {mode === 'calculator' ? 'Calculadora Pro' : 'Cospi AI'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                    {mode === 'ai' && (
                        <button
                            onClick={() => setIsFullView(!isFullView)}
                            className={cn(
                                "p-2.5 rounded-2xl transition-all active:scale-90",
                                isDark ? "hover:bg-white/10 text-[#39FF14]/50" : "hover:bg-primary/10 text-primary/50"
                            )}
                        >
                            {isFullView ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className={cn(
                            "p-2.5 rounded-2xl transition-all active:scale-90",
                            isDark ? "hover:bg-red-500/10 text-red-500/50 hover:text-red-500" : "hover:bg-red-500/10 text-red-500/50 hover:text-red-500"
                        )}
                    >
                        <XIcon className="w-5 h-5" />
                    </button>
                </div>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-hidden relative">
                {mode === 'calculator' ? (
                  <div className="h-full overflow-y-auto no-scrollbar">
                     <CostSheetCalculator />
                  </div>
                ) : (
                  <CospiChat
                    sheetData={sheetData}
                    isFullView={isFullView}
                    onToggleFullView={() => setIsFullView(!isFullView)}
                  />
                )}
              </div>

              {/* Footer */}
              {!isFullView && (
                <div className={cn(
                    "p-4 border-t text-center",
                    isDark ? "bg-black/20 border-white/5" : "bg-muted/20 border-border/50"
                )}>
                    <p className="text-[9px] font-bold uppercase tracking-[0.4em] opacity-30">
                        {mode === 'calculator' ? 'Compatible con teclado numérico' : 'Resolución 148/2023 Training'}
                    </p>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
