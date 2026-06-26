'use client';

import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X as XIcon, HelpCircle, BookOpen, AlertCircle, Zap, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CostSheetFormulaGuide } from './CostSheetFormulaGuide';
import { getHelpContent } from '@/lib/cost-engine/help-provider';
import { useFocusTrap } from '@/hooks/ui/useFocusTrap';

import { useTranslations } from 'next-intl';
interface CostSheetHelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
  contextId?: string | null;
}

export const CostSheetHelpPanel: React.FC<CostSheetHelpPanelProps> = ({
  isOpen,
  onClose,
  contextId,
}) => {
  const t = useTranslations('costSheet');
  const prefersReducedMotion = useReducedMotion();
  const help = contextId ? getHelpContent(contextId) : null;
  const panelRef = useFocusTrap(isOpen);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1 }}
            exit={prefersReducedMotion ? {} : { opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100] lg:hidden"
          />

          {/* Panel */}
          <motion.aside
            ref={panelRef}
            initial={{ x: '100%' }}
            animate={prefersReducedMotion ? { x: 0 } : { x: 0 }}
            exit={prefersReducedMotion ? {} : { x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={cn(
              "fixed right-0 top-0 h-screen w-80 sm:w-96 bg-sidebar/95 backdrop-blur-2xl border-l border-sidebar-border shadow-2xl z-[101] flex flex-col overflow-hidden"
            )}
            role="dialog"
            aria-modal="true"
            aria-label={help ? 'Ayuda contextual de la ficha de costos' : 'Ayuda y guía de fichas de costos'}
          >
            {/* Header */}
            <div className="p-6 border-b border-sidebar-border/50 flex items-center justify-between bg-sidebar/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <HelpCircle className="w-5 h-5 text-primary" />
                </div>
                <span className="text-xs font-black uppercase tracking-[0.2em] text-foreground">
                  {help ? 'Ayuda Contextual' : 'Ayuda y Guía'}
                </span>
              </div>
              <button type="button"
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-primary/10 text-muted-foreground transition-colors active:scale-95"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
              {help ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                  <section className="space-y-3">
                    <div className="flex items-center gap-2 text-primary">
                      <BookOpen className="w-4 h-4" />
                      <h4 className="text-xs font-black uppercase tracking-[0.2em]">Qué es</h4>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed font-medium">
                      {help.definition}
                    </p>
                  </section>

                  <section className="space-y-3">
                    <div className="flex items-center gap-2 text-primary">
                      <Target className="w-4 h-4" />
                      <h4 className="text-xs font-black uppercase tracking-[0.2em]">Para qué sirve</h4>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed font-medium">
                      {help.purpose}
                    </p>
                  </section>

                  <section className="space-y-3 bg-primary/5 p-4 rounded-2xl border border-primary/10">
                    <div className="flex items-center gap-2 text-primary">
                      <Zap className="w-4 h-4" />
                      <h4 className="text-xs font-black uppercase tracking-[0.2em]">Guía Operativa</h4>
                    </div>
                    <p className="text-sm text-foreground/90 leading-relaxed font-bold">
                      {help.operation}
                    </p>
                  </section>

                  <section className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Impacto en Resultados</h4>
                    <div className="p-4 bg-muted/30 rounded-2xl border border-border/50 italic text-xs text-muted-foreground">
                      {help.impact}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="w-4 h-4" />
                      <h4 className="text-xs font-black uppercase tracking-[0.2em]">Errores Comunes</h4>
                    </div>
                    <ul className="space-y-2">
                      {help.commonErrors.map((error, idx) => (
                        <li key={idx} className="text-xs text-destructive/80 font-medium flex items-start gap-2">
                          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-destructive/30 shrink-0" />
                          {error}
                        </li>
                      ))}
                    </ul>
                  </section>

                  <button type="button"
                    onClick={() => onClose()}
                    className="w-full mt-8 p-4 rounded-2xl bg-primary text-primary-foreground font-black uppercase tracking-[0.2em] text-xs hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-primary/20"
                  >
                    Entendido
                  </button>
                </div>
              ) : (
                <div className="px-2">
                  <CostSheetFormulaGuide />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-sidebar-border/50 bg-sidebar/5">
               <p className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground/70 text-center">
                  Manual de Referencia Técnica
               </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
