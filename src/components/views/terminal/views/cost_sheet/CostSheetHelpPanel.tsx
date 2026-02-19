'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X as XIcon, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CostSheetFormulaGuide } from './CostSheetFormulaGuide';

interface CostSheetHelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CostSheetHelpPanel: React.FC<CostSheetHelpPanelProps> = ({
  isOpen,
  onClose,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          />

          {/* Panel */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={cn(
              "fixed right-0 top-0 h-screen w-80 sm:w-96 bg-sidebar/95 backdrop-blur-2xl border-l border-sidebar-border shadow-2xl z-50 flex flex-col overflow-hidden"
            )}
          >
            {/* Header */}
            <div className="p-6 border-b border-sidebar-border/50 flex items-center justify-between bg-sidebar/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <HelpCircle className="w-5 h-5 text-primary" />
                </div>
                <span className="text-xs font-black uppercase tracking-[0.2em] text-foreground">Ayuda y Guía</span>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-primary/10 text-muted-foreground transition-colors active:scale-95"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-8 no-scrollbar">
              <div className="px-2">
                <CostSheetFormulaGuide />
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-sidebar-border/50 bg-sidebar/5">
               <p className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground/50 text-center">
                  Manual de Referencia Técnica
               </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
