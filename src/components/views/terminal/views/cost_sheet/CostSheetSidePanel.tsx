'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence, Variants, useReducedMotion } from 'framer-motion';
import { X as XIcon, Calculator, Bot, ChevronRight, Maximize2, Minimize2, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DarianEditor } from './DarianEditor';
import { CostSheetCalculator } from './CostSheetCalculator';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { useFocusTrap } from '@/hooks/ui/useFocusTrap';
import type { CostSheetData } from '@/types/cost-sheet';

interface CostSheetSidePanelProps {
  isOpen: boolean;
  onOpen: (mode: 'calculator' | 'ai' | 'both') => void;
  onClose: () => void;
  onExpand?: () => void;
  mode: 'calculator' | 'ai' | 'both';
  sheetData?: CostSheetData;
}

export const CostSheetSidePanel: React.FC<CostSheetSidePanelProps> = ({
  isOpen,
  onOpen,
  onClose,
  mode,
  sheetData,
  onExpand
}) => {
  const prefersReducedMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const [isFullView, setIsFullView] = useState(false);
  const [isTriggerExpanded, setIsTriggerExpanded] = useState(false);
  const panelRef = useFocusTrap(isOpen);

  const panelVariants: Variants = {
    closed: {
      x: isMobile ? '0%' : '-100%',
      y: isMobile ? '100%' : '-50%',
      opacity: 0,
      scale: 0.95,
      transition: {
        type: 'spring',
        damping: 30,
        stiffness: 300
      }
    },
    open: {
      x: isMobile ? '0%' : '0%',
      y: isMobile ? '0%' : '-50%',
      opacity: 1,
      scale: 1,
      transition: {
        type: 'spring',
        damping: 25,
        stiffness: 200,
        staggerChildren: 0.1
      }
    }
  };

  const indicatorVariants: Variants = {
    collapsed: { width: isMobile ? '40px' : '48px' },
    expanded: { width: isMobile ? '140px' : '180px' }
  };

  const renderContent = () => {
    if (mode === 'both' && !isMobile) {
      return (
        <div className="flex h-full divide-x divide-border/20 overflow-hidden">
          <div className="w-1/2 h-full overflow-hidden">
             <CostSheetCalculator />
          </div>
          <div className="w-1/2 h-full overflow-hidden">
            <DarianEditor
              sheetData={sheetData}
              isFullView={false}
              onToggleFullView={undefined}
            />
          </div>
        </div>
      );
    }

    // In mobile, "both" just shows AI for now or stacks them, but AI is more useful.
    // Let's stack them or just show AI if both selected on mobile.
    if (mode === 'both' && isMobile) {
        return (
            <div className="h-full overflow-y-auto no-scrollbar pb-10">
                <div className="h-[400px] border-b border-border/10">
                    <CostSheetCalculator />
                </div>
                <div className="h-[500px]">
                    <DarianEditor
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
      <DarianEditor
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
            animate={prefersReducedMotion ? { opacity: 1 } : { x: 0, opacity: 1 }}
            exit={prefersReducedMotion ? {} : { x: -20, opacity: 0 }}
            onMouseEnter={() => !isMobile && setIsTriggerExpanded(true)}
            onMouseLeave={() => !isMobile && setIsTriggerExpanded(false)}
            onClick={() => isMobile && setIsTriggerExpanded(!isTriggerExpanded)}
            variants={indicatorVariants}
            className={cn(
                "fixed left-0 z-[45] flex flex-col items-stretch overflow-hidden rounded-r-[1.5rem] border-y border-r transition-all duration-500 shadow-2xl",
                isMobile ? "top-[70%] -translate-y-1/2" : "top-1/2 -translate-y-1/2",
                "bg-background border-primary/20 backdrop-blur-xl shadow-primary/5 dark:border-[hsl(var(--primary))]/30 dark:shadow-[hsl(var(--primary))]/10"
            )}
          >
            <div className={cn("flex flex-col gap-4", isMobile ? "py-4 px-2" : "py-6 px-3")}>
                <button type="button"
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

                <button type="button"
                    onClick={() => onOpen('ai')}
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
                        <span className="text-[9px] font-black uppercase tracking-widest opacity-80 whitespace-nowrap">Darian</span>
                    )}
                </button>

                {!isMobile && (
                    <button type="button"
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
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1 }}
              exit={prefersReducedMotion ? {} : { opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/60 backdrop-blur-[4px] z-[90]"
            />

            {/* Side Panel */}
            <motion.aside
              ref={panelRef}
              variants={prefersReducedMotion ? {} : panelVariants}
              initial="closed"
              animate="open"
              exit="closed"
              className={cn(
                "fixed z-[100] flex flex-col overflow-hidden transition-all duration-500 rounded-[2.5rem] border shadow-2xl",
                "bg-background border-primary/20 dark:border-[hsl(var(--primary))]/30 dark:shadow-[hsl(var(--primary))]/10",
                isMobile
                    ? "inset-x-4 bottom-4 h-[85vh] rounded-t-[3rem] rounded-b-[2rem]"
                    : (mode === 'both' ? "w-[850px] max-w-[95vw] left-4 top-1/2" : (isFullView ? "w-[85vw] h-[85vh] left-[7.5vw] top-[7.5vh]" : "w-[400px] left-4 top-1/2")),
                !isMobile && (isFullView || mode === 'both' ? "" : "h-[680px] max-h-[92vh]")
              )}
              role="dialog"
              aria-modal="true"
              aria-label={mode === 'both' ? 'Centro de control multitarea' : (mode === 'calculator' ? 'Calculadora Pro' : 'Asistente Darian')}
            >
              {/* Header */}
              <div className={cn(
                "p-6 flex items-center justify-between border-b shrink-0",
                "bg-muted/30 dark:bg-white/5 border-border/50 dark:border-white/5"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2.5 rounded-2xl",
                    "bg-primary/5 dark:bg-white/5 text-primary dark:text-[hsl(var(--primary))]"
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
                        {mode === 'both' ? 'Centro de Control' : (mode === 'calculator' ? 'Calculadora Pro' : 'Darian')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                    {!isMobile && (
                        <button type="button"
                            onClick={onExpand ? onExpand : () => setIsFullView(!isFullView)}
                            className={cn(
                                "p-2.5 rounded-2xl transition-all active:scale-90",
                                "hover:bg-primary/10 dark:hover:bg-white/10 text-primary/50 dark:text-[hsl(var(--primary))]/50"
                            )}
                            title={onExpand ? "Ampliar a vista completa" : (isFullView ? "Reducir" : "Ampliar")}
                        >
                            {isFullView ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                    )}
                    <button type="button"
                        onClick={onClose}
                        className={cn(
                            "p-2.5 rounded-2xl transition-all active:scale-90",
                            "hover:bg-destructive/10 text-destructive/50 hover:text-destructive"
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
                    "bg-muted/20 dark:bg-black/20 border-border/50 dark:border-white/5"
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
