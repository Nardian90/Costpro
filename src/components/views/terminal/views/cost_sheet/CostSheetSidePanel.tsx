'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calculator, Bot, X as XIcon, ChevronRight, LayoutGrid,
  Minimize2, Maximize2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { CospiChat } from './CospiChat';
import { CostSheetCalculator } from './CostSheetCalculator';

interface CostSheetSidePanelProps {
  isOpen: boolean;
  onOpen: (mode: 'calculator' | 'ai' | 'both') => void;
  onClose: () => void;
  mode: 'calculator' | 'ai' | 'both';
  sheetData: any;
  onAIClick?: () => void;
}

export const CostSheetSidePanel: React.FC<CostSheetSidePanelProps> = ({
  isOpen,
  onOpen,
  onClose,
  mode,
  sheetData,
  onAIClick
}) => {
  const [isTriggerExpanded, setIsTriggerExpanded] = useState(false);
  const [isFullView, setIsFullView] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const isMobile = useIsMobile();

  const indicatorVariants = {
    initial: { x: -10, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    hover: { scale: 1.05 }
  };

  const panelVariants = {
    closed: { x: '-100%', opacity: 0 },
    open: {
        x: 0,
        opacity: 1,
        transition: { type: 'spring', damping: 25, stiffness: 200 }
    }
  };

  const renderContent = () => {
    // On mobile, if both selected, stack them or just show AI if both selected on mobile.
    if (mode === 'both' && isMobile) {
        return (
            <div className="h-full overflow-y-auto no-scrollbar pb-10">
                <div className="h-[400px] border-b border-border/10">
                    <CostSheetCalculator />
                </div>
                <div className="h-[500px]">
                    <CospiChat
                      sheetData={sheetData}
                      isFullView={false}
                    />
                </div>
            </div>
        )
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

  const handleOpenAI = () => {
    if (onAIClick) {
        onAIClick();
        onClose();
    } else {
        onOpen('ai');
    }
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
            onMouseEnter={() => !isMobile && setIsTriggerExpanded(true)}
            onMouseLeave={() => !isMobile && setIsTriggerExpanded(false)}
            onClick={() => isMobile && setIsTriggerExpanded(!isTriggerExpanded)}
            variants={indicatorVariants}
            className={cn(
                "fixed left-0 z-[45] flex flex-col items-stretch overflow-hidden rounded-r-[1.5rem] border-y border-r transition-all duration-500 shadow-2xl",
                isMobile ? "top-[70%] -translate-y-1/2" : "top-1/2 -translate-y-1/2",
                isDark
                    ? "bg-background border-primary/30 shadow-primary/10"
                    : "bg-white border-primary/20 backdrop-blur-xl shadow-primary/5"
            )}
          >
            <div className={cn("flex flex-col gap-4", isMobile ? "py-4 px-2" : "py-6 px-3")}>
                <button
                    onClick={() => onOpen('calculator')}
                    className={cn(
                        "group flex items-center gap-3 transition-all",
                        isTriggerExpanded ? "w-full" : "w-auto"
                    )}
                >
                    <div className={cn(
                        "rounded-xl flex items-center justify-center transition-all",
                        isMobile ? "w-7 h-7" : "w-8 h-8",
                        "bg-primary/10 text-primary",
                        "hover:scale-110 active:scale-95"
                    )}>
                        <Calculator className={isMobile ? "w-3.5 h-3.5" : "w-4 h-4"} />
                    </div>
                    {isTriggerExpanded && (
                        <span className="text-[9px] font-black uppercase tracking-widest opacity-80 whitespace-nowrap">Calc</span>
                    )}
                </button>

                <button
                    onClick={handleOpenAI}
                    className={cn(
                        "group flex items-center gap-3 transition-all",
                        isTriggerExpanded ? "w-full" : "w-auto"
                    )}
                >
                    <div className={cn(
                        "rounded-xl flex items-center justify-center transition-all",
                        isMobile ? "w-7 h-7" : "w-8 h-8",
                        "bg-primary/10 text-primary",
                        "hover:scale-110 active:scale-95"
                    )}>
                        <Bot className={isMobile ? "w-3.5 h-3.5" : "w-4 h-4"} />
                    </div>
                    {isTriggerExpanded && (
                        <span className="text-[9px] font-black uppercase tracking-widest opacity-80 whitespace-nowrap">Cospi</span>
                    )}
                </button>

                {!isMobile && (
                    <button
                        onClick={() => onOpen('both')}
                        className={cn(
                            "group flex items-center gap-3 transition-all",
                            isTriggerExpanded ? "w-full" : "w-auto"
                        )}
                    >
                        <div className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center transition-all",
                            "bg-primary/10 text-primary",
                            "hover:scale-110 active:scale-95"
                        )}>
                            <LayoutGrid className="w-4 h-4" />
                        </div>
                        {isTriggerExpanded && (
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-80 whitespace-nowrap">Dual</span>
                        )}
                    </button>
                )}
            </div>

            <div className={cn(
                "h-8 flex items-center justify-center border-t",
                "border-primary/10"
            )}>
                 <ChevronRight className={cn("w-3 h-3 animate-pulse opacity-40", "text-primary")} />
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
              className="fixed inset-0 bg-black/60 backdrop-blur-[4px] z-[90]"
            />

            {/* Side Panel */}
            <motion.aside
              variants={panelVariants}
              initial="closed"
              animate="open"
              exit="closed"
              className={cn(
                "fixed z-[100] flex flex-col overflow-hidden transition-all duration-500 rounded-[2.5rem] border shadow-2xl",
                isDark ? "bg-background border-primary/30 shadow-primary/10" : "bg-white border-primary/20",
                isMobile
                    ? "inset-x-4 bottom-4 h-[85vh] rounded-t-[3rem] rounded-b-[2rem]"
                    : (mode === 'both' ? "w-[850px] max-w-[95vw] left-4 top-1/2" : (isFullView ? "w-[85vw] h-[85vh] left-[7.5vw] top-[7.5vh]" : "w-[400px] left-4 top-1/2")),
                !isMobile && (isFullView || mode === 'both' ? "" : "h-[680px] max-h-[92vh]")
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
                    "bg-primary/5 text-primary"
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
                    {mode === 'ai' && !isMobile && (
                        <button
                            onClick={() => setIsFullView(!isFullView)}
                            className={cn(
                                "p-2.5 rounded-2xl transition-all active:scale-90",
                                "hover:bg-primary/10 text-primary/50"
                            )}
                        >
                            {isFullView ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className={cn(
                            "p-2.5 rounded-2xl transition-all active:scale-90",
                            "hover:bg-red-500/10 text-red-500/50 hover:text-red-500"
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
                        {mode === 'both' ? 'Productividad Máxima' : (mode === 'calculator' ? 'Teclado Numérico Soportado' : 'Ref: Resolución 148/2023')}
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
