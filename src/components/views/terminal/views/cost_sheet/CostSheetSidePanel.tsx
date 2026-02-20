'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { X as XIcon, Calculator, Bot, ChevronRight, Maximize2, Minimize2, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { CospiChat } from './CospiChat';
import { CostSheetCalculator } from './CostSheetCalculator';

interface CostSheetSidePanelProps {
  isOpen: boolean;
  onOpen: (mode: 'calculator' | 'ai' | 'both') => void;
  onClose: () => void;
  mode: 'calculator' | 'ai' | 'both';
  sheetData: any;
}

export const CostSheetSidePanel: React.FC<CostSheetSidePanelProps> = ({
  isOpen,
  onOpen,
  onClose,
  mode,
  sheetData,
}) => {
  const [isFullView, setIsFullView] = useState(false);
  const [isTriggerExpanded, setIsTriggerExpanded] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const panelVariants: Variants = {
    closed: {
      x: '-100%',
      opacity: 0,
      scale: 0.9,
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
      transition: {
        type: 'spring',
        damping: 20,
        stiffness: 150,
        staggerChildren: 0.1
      }
    }
  };

  const indicatorVariants: Variants = {
    collapsed: { width: '48px' },
    expanded: { width: '180px' }
  };

  const renderContent = () => {
    if (mode === 'both') {
      return (
        <div className="flex h-full divide-x divide-border/20 overflow-hidden">
          <div className="w-1/2 h-full overflow-hidden">
             <CostSheetCalculator />
          </div>
          <div className="w-1/2 h-full overflow-hidden">
            <CospiChat
              sheetData={sheetData}
              isFullView={false}
              onToggleFullView={undefined}
            />
          </div>
        </div>
      );
    }

    if (mode === 'calculator') {
      return (
        <div className="h-full overflow-hidden">
           <CostSheetCalculator />
        </div>
      );
    }

    return (
      <CospiChat
        sheetData={sheetData}
        isFullView={isFullView}
        onToggleFullView={() => setIsFullView(!isFullView)}
      />
    );
  };

  return (
    <>
      {/* Interactive Trigger Tab */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -20, opacity: 0 }}
            onMouseEnter={() => setIsTriggerExpanded(true)}
            onMouseLeave={() => setIsTriggerExpanded(false)}
            variants={indicatorVariants}
            className={cn(
                "fixed left-0 top-1/2 -translate-y-1/2 z-[45] flex flex-col items-stretch overflow-hidden rounded-r-[2rem] border-y border-r transition-all duration-500 shadow-2xl shadow-primary/10",
                isDark
                    ? "bg-[#010203]/90 border-[#39FF14]/20 backdrop-blur-xl"
                    : "bg-white/90 border-primary/20 backdrop-blur-xl"
            )}
          >
            <div className="py-6 px-3 flex flex-col gap-4">
                <button
                    onClick={() => onOpen('calculator')}
                    className={cn(
                        "group flex items-center gap-3 transition-all",
                        isTriggerExpanded ? "w-full" : "w-auto"
                    )}
                >
                    <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center transition-all",
                        isDark ? "bg-[#39FF14]/10 text-[#39FF14]" : "bg-primary/10 text-primary",
                        "hover:scale-110 active:scale-95"
                    )}>
                        <Calculator className="w-4 h-4" />
                    </div>
                    {isTriggerExpanded && (
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-70 whitespace-nowrap">Calculadora</span>
                    )}
                </button>

                <button
                    onClick={() => onOpen('ai')}
                    className={cn(
                        "group flex items-center gap-3 transition-all",
                        isTriggerExpanded ? "w-full" : "w-auto"
                    )}
                >
                    <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center transition-all",
                        isDark ? "bg-[#39FF14]/10 text-[#39FF14]" : "bg-primary/10 text-primary",
                        "hover:scale-110 active:scale-95"
                    )}>
                        <Bot className="w-4 h-4" />
                    </div>
                    {isTriggerExpanded && (
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-70 whitespace-nowrap">Cospi AI</span>
                    )}
                </button>

                <button
                    onClick={() => onOpen('both')}
                    className={cn(
                        "group flex items-center gap-3 transition-all",
                        isTriggerExpanded ? "w-full" : "w-auto"
                    )}
                >
                    <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center transition-all",
                        isDark ? "bg-[#39FF14]/10 text-[#39FF14]" : "bg-primary/10 text-primary",
                        "hover:scale-110 active:scale-95"
                    )}>
                        <LayoutGrid className="w-4 h-4" />
                    </div>
                    {isTriggerExpanded && (
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-70 whitespace-nowrap">Vista Dual</span>
                    )}
                </button>
            </div>

            <div className={cn(
                "h-12 flex items-center justify-center border-t",
                isDark ? "border-[#39FF14]/10" : "border-primary/10"
            )}>
                 <ChevronRight className={cn("w-3 h-3 animate-pulse opacity-30", isDark ? "text-[#39FF14]" : "text-primary")} />
            </div>
          </motion.div>
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
                mode === 'both' ? "w-[850px] max-w-[95vw]" : (isFullView ? "w-[85vw] h-[85vh] left-[7.5vw] top-[7.5vh] -translate-y-0" : "w-[400px]"),
                "h-[680px] max-h-[92vh]"
              )}
            >
              {/* Header */}
              <div className={cn(
                "p-6 flex items-center justify-between border-b shrink-0",
                isDark ? "bg-white/5 border-white/5" : "bg-muted/30 border-border/50"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2.5 rounded-2xl",
                    isDark ? "bg-white/5 text-[#39FF14]" : "bg-primary/5 text-primary"
                  )}>
                    {mode === 'calculator' && <Calculator className="w-5 h-5" />}
                    {mode === 'ai' && <Bot className="w-5 h-5" />}
                    {mode === 'both' && <LayoutGrid className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 leading-none mb-1">
                        {mode === 'both' ? 'Multitarea' : (mode === 'calculator' ? 'Herramienta' : 'Asistente')}
                    </h3>
                    <p className="text-sm font-black uppercase tracking-widest italic">
                        {mode === 'both' ? 'Centro de Control' : (mode === 'calculator' ? 'Calculadora Pro' : 'Cospi AI')}
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
                {renderContent()}
              </div>

              {/* Footer */}
              {!isFullView && (
                <div className={cn(
                    "p-4 border-t text-center shrink-0",
                    isDark ? "bg-black/20 border-white/5" : "bg-muted/20 border-border/50"
                )}>
                    <p className="text-[9px] font-bold uppercase tracking-[0.4em] opacity-30">
                        {mode === 'both' ? 'Productividad Máxima' : (mode === 'calculator' ? 'Compatible con teclado numérico' : 'Resolución 148/2023 Training')}
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
