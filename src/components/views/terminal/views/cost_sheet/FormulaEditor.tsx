
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Command, HelpCircle, Maximize2, Check, X as XIcon, Info, Sparkles, Code } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormulaBuilder } from './FormulaBuilder';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HorizontalScroll } from '@/components/ui/HorizontalScroll';
import { Badge } from "@/components/ui/badge";

interface FormulaEditorProps {
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
  suggestions: { label: string; value: string; description?: string }[];
  className?: string;
}

export const FormulaEditor: React.FC<FormulaEditorProps> = ({
  initialValue,
  onSave,
  onCancel,
  suggestions,
  className
}) => {
  const [value, setValue] = useState(initialValue || '');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mode, setMode] = useState<'assisted' | 'expert'>('assisted');
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const hasSavedRef = useRef(false);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      setIsFocused(true);
    }
  }, []);

  const filteredSuggestions = suggestions.filter(s => {
    const lastWord = value.slice(0, cursorPosition).split(/[\s+\-*/()%,]/).pop() || '';
    if (!lastWord) return false;
    return s.value && s.value.toLowerCase().includes(lastWord.toLowerCase()) && s.value.toLowerCase() !== lastWord.toLowerCase();
  });

  useEffect(() => {
    if (filteredSuggestions.length > 0) {
      setShowSuggestions(true);
      setSelectedIndex(0);
    } else {
      setShowSuggestions(false);
    }
  }, [value, cursorPosition, filteredSuggestions.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (showSuggestions && filteredSuggestions.length > 0) {
        e.preventDefault();
        applySuggestion(filteredSuggestions[selectedIndex]);
      } else {
        handleSave(value);
      }
    } else if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'ArrowDown' && showSuggestions) {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredSuggestions.length);
    } else if (e.key === 'ArrowUp' && showSuggestions) {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
    } else if (e.key === 'Tab' && showSuggestions && filteredSuggestions.length > 0) {
      e.preventDefault();
      applySuggestion(filteredSuggestions[selectedIndex]);
    }
  };

  const handleSave = React.useCallback((val: string) => {
    if (hasSavedRef.current) return;
    hasSavedRef.current = true;
    onSave(val);
  }, [onSave]);

  const applySuggestion = (suggestion: { value: string }) => {
    const before = value.slice(0, cursorPosition);
    const after = value.slice(cursorPosition);
    const lastWordMatch = before.match(/[\s+\-*/()%,]([^\s+\-*/()%,]*)$/) || [null, before];
    const lastWord = lastWordMatch[1] || before;

    const newValue = before.slice(0, before.length - lastWord.length) + suggestion.value + after;
    setValue(newValue);
    setShowSuggestions(false);

    // Set focus back and move cursor
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newPos = before.length - lastWord.length + suggestion.value.length;
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    if (newVal !== value) {
      setValue(newVal);
    }
    setCursorPosition(e.target.selectionStart || 0);
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Delay blur to allow clicking suggestions or interacting with help/modal
    setTimeout(() => {
        const activeElement = document.activeElement;
        const isInteractingWithSuggestions = suggestionsRef.current?.contains(activeElement);

        // If we are opening the modal, don't trigger save/blur logic here
        // as the modal handles its own state
        if (!isInteractingWithSuggestions && !isModalOpen) {
            setIsFocused(false);
            handleSave(value);
        }
    }, 200);
  };

  return (
    <div className={cn("relative w-full flex justify-end h-8", className)}>
      <motion.div
        className="absolute right-0 z-40 bg-white dark:bg-slate-800 border-2 border-primary rounded-md shadow-xl flex items-center"
        initial={false}
        animate={{
            width: isFocused ? (typeof window !== 'undefined' && window.innerWidth < 640 ? 'calc(100vw - 40px)' : '400px') : '100%',
            boxShadow: isFocused ? '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' : '0 4px 6px -1px rgb(0 0 0 / 0.1)'
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className="pl-2 pr-1 text-primary shrink-0">
            {value.startsWith('=') ? <Command className="w-3.5 h-3.5" /> : <span className="text-xs font-bold">$</span>}
        </div>
        <div className="flex-1 relative h-full flex items-center min-w-0">
            <input
              ref={inputRef}
              type="text"
              className="w-full h-8 px-1 py-1 text-sm bg-transparent border-none outline-none focus:ring-0 font-mono"
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              onFocus={() => setIsFocused(true)}
              onClick={(e) => setCursorPosition((e.target as HTMLInputElement).selectionStart || 0)}
            />

            <AnimatePresence>
                {showSuggestions && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        ref={suggestionsRef}
                        className="absolute z-50 top-full left-0 w-full mt-1 bg-white dark:bg-slate-800 border border-border rounded-md shadow-2xl max-h-48 overflow-y-auto"
                    >
                        {filteredSuggestions.map((s, i) => (
                            <button
                                key={s.value || i}
                                className={cn(
                                    "w-full text-left px-3 py-2 text-xs hover:bg-primary/10 flex flex-col gap-0.5 transition-colors",
                                    i === selectedIndex && "bg-primary/20"
                                )}
                                onClick={() => applySuggestion(s)}
                                onMouseDown={(e) => e.preventDefault()} // Prevent blur
                            >
                                <div className="font-bold text-primary">{s.label}</div>
                                {s.description && <div className="text-[10px] text-muted-foreground">{s.description}</div>}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        {isFocused && (
          <div className="flex items-center gap-1 px-1 border-l border-border bg-muted/30 shrink-0">
             <Popover>
                <PopoverTrigger asChild>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    className="p-1 hover:bg-primary/20 text-primary rounded"
                    title="Ayuda de Fórmulas"
                  >
                      <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-4 z-[100]" side="top" align="end">
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

                    <div className="text-[10px] text-muted-foreground italic border-top pt-2 leading-tight">
                      Use <span className="font-bold text-primary">vh('ID')</span> para referenciar valores históricos de otras filas.
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
                <XIcon className="w-3.5 h-3.5" />
             </button>
          </div>
        )}
      </motion.div>


      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[700px] z-[200] p-0 overflow-hidden rounded-2xl border-none shadow-2xl flex flex-col max-h-[90vh]">
          <div className="bg-primary/10 px-6 py-4 flex items-center justify-between border-b border-primary/10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                <Command className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black uppercase tracking-tight italic">Editor de Cálculo</DialogTitle>
                <DialogDescription className="sr-only">
                  Editor avanzado para configurar fórmulas y cálculos personalizados en la ficha de costo.
                </DialogDescription>
                <p className="text-[10px] font-bold text-primary/60 uppercase tracking-widest leading-none">v5.7.22 • Motor de Costos Avanzado</p>
              </div>
            </div>

            <Tabs value={mode} onValueChange={(v: any) => setMode(v)} className="w-auto">
              <HorizontalScroll containerClassName="bg-black/5 rounded-xl p-1 border border-black/5">
                <TabsList className="flex bg-transparent border-none w-max min-w-full h-auto p-0 gap-1">
                  <TabsTrigger value="assisted" className="rounded-lg px-4 py-2 gap-2 text-[10px] font-black uppercase tracking-wider data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all shrink-0">
                    <Sparkles className="w-3 h-3" />
                    Asistido
                  </TabsTrigger>
                  <TabsTrigger value="expert" className="rounded-lg px-4 py-2 gap-2 text-[10px] font-black uppercase tracking-wider data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all shrink-0">
                    <Code className="w-3 h-3" />
                    Experto
                  </TabsTrigger>
                </TabsList>
              </HorizontalScroll>
            </Tabs>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-6">
            {mode === 'assisted' ? (
              <div className="animate-in fade-in zoom-in-95 duration-300">
                <FormulaBuilder
                    initialValue={value}
                    suggestions={suggestions}
                    onSave={setValue}
                />
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <Code className="w-3 h-3" />
                        Código de Fórmula
                    </label>
                    <Badge variant="outline" className="text-[9px] font-mono opacity-50">expr-eval enabled</Badge>
                  </div>
                  <textarea
                    className="w-full h-64 p-6 font-mono text-base bg-muted/30 border-2 border-border rounded-2xl focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none resize-none transition-all shadow-inner"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Escriba su fórmula aquí (ej. = AnexoI + AnexoII)"
                    autoFocus
                  />
                </div>

                <div className="bg-amber-500/5 p-4 rounded-xl border border-amber-500/20">
                    <div className="flex items-center gap-2 mb-2 text-amber-700 font-black text-[10px] uppercase tracking-wider">
                        <Info className="w-3.5 h-3.5" />
                        Guía de Referencia Rápida
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
                        <div className="flex justify-between items-center py-1 border-b border-amber-500/10">
                            <span className="font-medium text-amber-900/60">Suma de Hijos</span>
                            <code className="bg-amber-500/10 text-amber-700 px-1.5 py-0.5 rounded font-bold">SUMA(hijos)</code>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-amber-500/10">
                            <span className="font-medium text-amber-900/60">Uso de Anexos</span>
                            <code className="bg-amber-500/10 text-amber-700 px-1.5 py-0.5 rounded font-bold">AnexoI + AnexoII</code>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-amber-500/10">
                            <span className="font-medium text-amber-900/60">Ref. a Fila</span>
                            <code className="bg-amber-500/10 text-amber-700 px-1.5 py-0.5 rounded font-bold">ref('1.1')</code>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-amber-500/10">
                            <span className="font-medium text-amber-900/60">Cálculo %</span>
                            <code className="bg-amber-500/10 text-amber-700 px-1.5 py-0.5 rounded font-bold">PCT(total, 15)</code>
                        </div>
                    </div>
                </div>
              </div>
            )}
            </div>
          </ScrollArea>

          <div className="px-6 py-4 bg-muted/30 flex items-center justify-between border-t border-border shrink-0">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium italic">
                <Info className="w-3 h-3" />
                Los cambios se aplican al cerrar o guardar.
            </div>
            <div className="flex gap-3">
                <Button variant="ghost" className="rounded-xl h-11 px-6 font-bold uppercase tracking-widest text-[10px]" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button className="rounded-xl h-11 px-8 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20" onClick={() => { onSave(value); setIsModalOpen(false); }}>
                    Aplicar Fórmula
                </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
