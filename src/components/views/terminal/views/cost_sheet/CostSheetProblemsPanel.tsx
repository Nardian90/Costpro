'use client';
import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { ValidationError } from '@/lib/cost-engine/types';

interface CostSheetProblemsPanelProps {
  problems: ValidationError[];
  onGoTo?: (rowId: string) => void;
}

export const CostSheetProblemsPanel = ({ problems, onGoTo }: CostSheetProblemsPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  // Only show CRITICAL and WARNING — INFO messages (cross-section links, unresolved refs) are noise
  const actionableProblems = problems?.filter((p) => p.type !== 'INFO') ?? [];
  if (!actionableProblems.length) return null;
  const critical = actionableProblems.filter((p) => p.type === 'CRITICAL').length;
  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-24 right-6 h-14 w-14 rounded-full backdrop-blur-xl border-2 shadow-lg flex items-center justify-center hover:scale-110 transition-all duration-300 z-[55]",
          critical > 0
            ? "bg-red-500/15 border-red-500/30 text-red-500 shadow-red-500/15"
            : "bg-amber-500/15 border-amber-500/30 text-amber-500 shadow-amber-500/15"
        )}
        aria-label={`${problems.length} problemas de validación`}
      >
        <div className="relative">
          <AlertCircle className="w-6 h-6" />
          <span className={cn(
            "absolute -top-3 -right-3 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-background",
            critical > 0
              ? "bg-gradient-to-br from-red-400 to-red-600 text-white shadow-red-500/30"
              : "bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-amber-500/30"
          )}>
            {actionableProblems.length}
          </span>
        </div>
        {critical > 0 && (
          <span className="absolute inset-0 rounded-full animate-pulse bg-red-500/10" />
        )}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="fixed bottom-40 right-6 w-80 backdrop-blur-xl bg-card/90 border border-border/50 shadow-2xl rounded-2xl z-[55] overflow-hidden flex flex-col max-h-96">
            <div className="p-4 border-b flex items-center justify-between bg-muted/30">
              <h4 className="text-xs font-bold uppercase">Problemas de Validación</h4>
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}><X className="w-4 h-4"/></Button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {actionableProblems.map((p, i: number) => (
                <div key={i} className={cn("p-2 rounded-lg border text-xs flex gap-2", p.type === 'CRITICAL' ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800/50" : "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/50")}>
                  {p.type === 'CRITICAL' ? <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                  <div className="flex-1">
                    <p>{p.message}</p>
                    {p.rowId && onGoTo && <Button variant="link" className="p-0 h-auto text-[10px]" onClick={() => { onGoTo(p.rowId); setIsOpen(false); }}>Ir a fila <ArrowRight className="w-2 h-2 ml-1"/></Button>}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
