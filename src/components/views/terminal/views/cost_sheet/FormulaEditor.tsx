'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calculator,
  HelpCircle,
  X,
  Info,
  Check,
  Command,
  Sparkles,
  Code,
  History,
  Maximize2,
  ChevronRight,
  Plus,
  Terminal
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { FormulaBuilder } from './FormulaBuilder';
import { HorizontalScroll } from '@/components/ui/horizontal-scroll';

interface FormulaEditorProps {
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
  className?: string;
  suggestions?: { label: string; value: string; description?: string }[];
}

export const FormulaEditor: React.FC<FormulaEditorProps> = ({
  initialValue,
  onSave,
  onCancel,
  className,
  suggestions = []
}) => {
  const [value, setValue] = useState(initialValue);
  const [isFocused, setIsFocused] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mode, setMode] = useState<'assisted' | 'expert'>('assisted');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleSave = (val: string) => {
    onSave(val);
    setIsFocused(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave(value);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const isFormula = value.startsWith('=');

  return (
    <div className="relative group/formula">
      <motion.div
        layout
        className={cn(
          "flex items-center gap-2 p-1 rounded-lg border transition-all min-h-[38px]",
          isFocused ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border bg-muted/30",
          className
        )}
      >
        <div className="flex-1 flex items-center gap-2 pl-2">
          <Calculator className={cn("w-3.5 h-3.5", isFormula ? "text-primary" : "text-muted-foreground")} />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-xs font-mono py-1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            onKeyDown={handleKeyDown}
            placeholder="f(x) = ..."
          />
        </div>

        {isFocused && (
          <div className="flex items-center gap-1 pr-1 animate-in fade-in slide-in-from-right-2 duration-200">
             <Popover>
                <PopoverTrigger asChild>
                  <button className="p-1 hover:bg-primary/20 text-primary rounded" title="Ayuda">
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" className="w-64 p-3 z-[250]">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 border-b pb-2">
                      <Info className="w-4 h-4 text-primary" />
                      <h4 className="font-bold text-sm">Ayuda de Fórmulas</h4>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ejemplos Comunes</p>
                      <div className="space-y-1 text-[11px] font-mono bg-muted p-2 rounded">
                        <p className="text-primary">= SUMA(hijos) <span className="text-[9px] text-muted-foreground opacity-70 ml-1">// Suma todos los sub-elementos</span></p>
                        <p className="text-primary">= ref('1.1') + ref('2.1')</p>
                        <p className="text-primary">= PCT(ref('12'), 10) <span className="text-[9px] text-muted-foreground opacity-70 ml-1">// 10% del total de sección 12</span></p>
                        <p className="text-primary">= ref('12') / cantidad</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Funciones y Variables</p>
                      <ul className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                        <li><span className="font-bold">SUMA</span>(a, b...)</li>
                        <li><span className="font-bold">hijos</span> <span className="text-[9px] opacity-60">(Sub-filas)</span></li>
                        <li><span className="font-bold">PCT</span>(valor, %)</li>
                        <li><span className="font-bold">ROUND2</span>(valor)</li>
                        <li><span className="font-bold">cantidad</span></li>
                        <li><span className="font-bold">ref</span>('ID')</li>
                      </ul>
                    </div>
                  </div>
                </PopoverContent>
             </Popover>

             <button
               onMouseDown={(e) => { e.preventDefault(); setIsModalOpen(true); }}
               className="p-1 hover:bg-primary/20 text-primary rounded"
               title="Editor Avanzado"
             >
                <Maximize2 className="w-3.5 h-3.5" />
             </button>

             <button
               onMouseDown={(e) => { e.preventDefault(); handleSave(value); }}
               className="p-1 hover:bg-green-500/20 text-green-600 rounded"
               title="Guardar (Enter)"
             >
                <Check className="w-3.5 h-3.5" />
             </button>
             <button
               onMouseDown={(e) => { e.preventDefault(); onCancel(); }}
               className="p-1 hover:bg-red-500/20 text-red-600 rounded"
               title="Cancelar (Esc)"
             >
                <X className="w-3.5 h-3.5" />
             </button>
          </div>
        )}
      </motion.div>


      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[800px] z-[200] p-0 overflow-hidden rounded-3xl border-none shadow-2xl flex flex-col max-h-[90vh] bg-[#020617] text-slate-200">
          {/* Custom Header based on Design */}
          <div className="px-6 pt-6 pb-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#39FF14]/10 border border-[#39FF14]/30 flex items-center justify-center text-[#39FF14] shadow-[0_0_15px_rgba(57,255,20,0.2)]">
                <Terminal className="w-6 h-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black uppercase tracking-tighter italic text-white leading-none">Editor de Cálculo</DialogTitle>
                <DialogDescription className="sr-only">
                  Editor avanzado para configurar fórmulas y cálculos personalizados en la ficha de costo.
                </DialogDescription>
                <p className="text-[10px] font-black text-[#39FF14] uppercase tracking-[0.25em] mt-1.5 opacity-90">v5.7.22 • Motor de Costos Avanzado</p>
              </div>
            </div>

            <button
              onClick={() => setIsModalOpen(false)}
              className="w-10 h-10 rounded-full bg-slate-800/50 flex items-center justify-center hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Subheader with Mode Switcher and Icons */}
          <div className="px-6 py-2 flex items-center justify-between border-b border-white/5">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setMode('assisted')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                  mode === 'assisted'
                    ? "bg-[#16a34a] text-white shadow-[0_0_12px_rgba(22,163,74,0.4)]"
                    : "bg-slate-800/50 text-slate-400 hover:text-slate-200"
                )}
              >
                <Sparkles className="w-3 h-3" />
                Asistido
              </button>

              <button
                onClick={() => setMode('expert')}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  mode === 'expert' ? "text-[#39FF14]" : "text-slate-500 hover:text-slate-300"
                )}
              >
                <Code className="w-4 h-4" />
              </button>

              <button className="p-2 rounded-lg text-slate-500 hover:text-slate-300 transition-all">
                <History className="w-4 h-4" />
              </button>
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-0"> {/* FormulaBuilder will handle padding */}
            {mode === 'assisted' ? (
              <div className="animate-in fade-in zoom-in-95 duration-300">
                <FormulaBuilder
                    initialValue={value}
                    suggestions={suggestions}
                    onSave={setValue}
                />
              </div>
            ) : (
              <div className="p-6 space-y-4 animate-in fade-in zoom-in-95 duration-300">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <Code className="w-3 h-3" />
                        Código de Fórmula
                    </label>
                    <Badge variant="outline" className="text-[9px] font-mono border-slate-700 text-slate-500">expr-eval enabled</Badge>
                  </div>
                  <textarea
                    className="w-full h-64 p-6 font-mono text-base bg-slate-900/50 border border-slate-800 rounded-2xl focus:ring-4 focus:ring-[#39FF14]/10 focus:border-[#39FF14]/50 outline-none resize-none transition-all text-slate-200"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Escriba su fórmula aquí (ej. = AnexoI + AnexoII)"
                    autoFocus
                  />
                </div>

                <div className="bg-[#39FF14]/5 p-4 rounded-xl border border-[#39FF14]/10">
                    <div className="flex items-center gap-2 mb-2 text-[#39FF14] font-black text-[10px] uppercase tracking-wider">
                        <Info className="w-3.5 h-3.5" />
                        Guía de Referencia Rápida
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
                        <div className="flex justify-between items-center py-1 border-b border-white/5">
                            <span className="font-medium text-slate-400">Suma de Hijos</span>
                            <code className="bg-slate-800 text-slate-200 px-1.5 py-0.5 rounded font-mono">SUMA(hijos)</code>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-white/5">
                            <span className="font-medium text-slate-400">Uso de Anexos</span>
                            <code className="bg-slate-800 text-slate-200 px-1.5 py-0.5 rounded font-mono text-[9px]">AnexoI + AnexoII</code>
                        </div>
                    </div>
                </div>
              </div>
            )}
            </div>
          </ScrollArea>

          {/* Footer based on Design */}
          <div className="px-6 py-6 bg-slate-900/20 flex items-center justify-end gap-4 border-t border-white/5 shrink-0">
            <button
              onClick={() => setIsModalOpen(false)}
              className="px-8 h-12 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-white transition-all border border-slate-800 hover:border-slate-600"
            >
              Cancelar
            </button>
            <button
              onClick={() => { onSave(value); setIsModalOpen(false); }}
              className="px-10 h-12 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] bg-[#39FF14] text-black shadow-[0_0_25px_rgba(57,255,20,0.4)] hover:shadow-[0_0_35px_rgba(57,255,20,0.6)] transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Guardar Cambios
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
