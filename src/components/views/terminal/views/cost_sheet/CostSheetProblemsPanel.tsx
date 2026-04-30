'use client';
import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export const CostSheetProblemsPanel = ({
  problems,
  onGoTo,
  alwaysVisible = false
}: {
  problems: any[];
  onGoTo: (rowId: string) => void;
  alwaysVisible?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!alwaysVisible && !problems?.length) return null;

  const critical = problems.filter((p: any) => p.type === 'CRITICAL').length;

  const fabColor = critical > 0
    ? 'bg-red-500 hover:bg-red-600'
    : problems.length > 0
    ? 'bg-amber-500 hover:bg-amber-600'
    : 'bg-muted hover:bg-muted/80 text-muted-foreground';

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className={cn("fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl z-50 transition-colors duration-300", fabColor)}
      >
        <div className="relative">
          <AlertCircle className={cn("w-6 h-6", problems.length === 0 ? "text-muted-foreground" : "text-white")}/>
          {problems.length > 0 && (
            <span className="absolute -top-3 -right-3 bg-white text-black text-[10px] font-bold h-5 w-5 rounded-full flex items-center justify-center border-2 border-current">
              {problems.length}
            </span>
          )}
        </div>
      </Button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 right-6 w-80 bg-card border shadow-2xl rounded-2xl z-50 overflow-hidden flex flex-col max-h-96"
          >
            <div className="p-4 border-b flex items-center justify-between bg-muted/30">
              <h4 className="text-xs font-bold uppercase">Problemas de Validación</h4>
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                <X className="w-4 h-4"/>
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {problems.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <div className="bg-green-500/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto">
                    <AlertCircle className="w-6 h-6 text-green-500" />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Sin problemas</p>
                  <p className="text-[10px] text-muted-foreground/60 leading-relaxed">No se han detectado errores ni advertencias de validación en esta ficha.</p>
                </div>
              ) : (
                problems.map((p: any, i: number) => (
                  <div key={i} className={cn("p-2 rounded-lg border text-xs flex gap-2", p.type === 'CRITICAL' ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200")}>
                    {p.type === 'CRITICAL' ? <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                    <div className="flex-1">
                      <p>{p.message}</p>
                      {p.rowId && <Button variant="link" className="p-0 h-auto text-[10px]" onClick={() => { onGoTo(p.rowId); setIsOpen(false); }}>Ir a fila <ArrowRight className="w-2 h-2 ml-1"/></Button>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
