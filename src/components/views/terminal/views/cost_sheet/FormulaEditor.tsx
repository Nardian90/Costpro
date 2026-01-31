
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Command, HelpCircle, Maximize2, Check, X, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  const [value, setValue] = useState(initialValue);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

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
    return s.value.toLowerCase().includes(lastWord.toLowerCase()) && s.value.toLowerCase() !== lastWord.toLowerCase();
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
        onSave(value);
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
    setValue(e.target.value);
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
            onSave(value);
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
                                key={s.value}
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
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ejemplos</p>
                      <div className="space-y-1 text-[11px] font-mono bg-muted p-2 rounded">
                        <p className="text-primary">= AnexoI + AnexoII</p>
                        <p className="text-primary">= SUMA(AnexoI, AnexoII)</p>
                        <p className="text-primary">= BASE_TOTAL * 0.12</p>
                        <p className="text-primary">= VH * 1.05</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Funciones soportadas</p>
                      <ul className="grid grid-cols-2 gap-1 text-[11px]">
                        <li><span className="font-bold">SUMA</span>(a, b...)</li>
                        <li><span className="font-bold">PROMEDIO</span>(a, b...)</li>
                        <li><span className="font-bold">MAX</span> / <span className="font-bold">MIN</span></li>
                        <li><span className="font-bold">PCT</span>(val, %)</li>
                        <li><span className="font-bold">ROUND2</span>(val)</li>
                      </ul>
                    </div>

                    <div className="text-[10px] text-muted-foreground italic border-top pt-2">
                      Use "ref('ID')" para referenciar otras filas de la ficha.
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
               onMouseDown={(e) => { e.preventDefault(); onSave(value); }}
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
        <DialogContent className="sm:max-w-[600px] z-[200]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Command className="w-5 h-5 text-primary" />
              Editor de Fórmula Avanzado
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Fórmula</label>
              <textarea
                className="w-full h-48 p-4 font-mono text-base bg-muted/50 border rounded-lg focus:ring-2 focus:ring-primary outline-none resize-none"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Escriba su fórmula aquí (ej. = AnexoI + AnexoII)"
                autoFocus
              />
            </div>

            <div className="bg-primary/5 p-4 rounded-lg border border-primary/10">
                <div className="flex items-center gap-2 mb-2 text-primary font-bold text-xs uppercase">
                    <Info className="w-3 h-3" />
                    Sugerencias rápidas
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                    <div className="flex justify-between"><span>Suma:</span> <code className="bg-white px-1 rounded">SUMA(a, b)</code></div>
                    <div className="flex justify-between"><span>Promedio:</span> <code className="bg-white px-1 rounded">PROMEDIO(a, b)</code></div>
                    <div className="flex justify-between"><span>Anexos:</span> <code className="bg-white px-1 rounded">AnexoI, AnexoII...</code></div>
                    <div className="flex justify-between"><span>Ref Fila:</span> <code className="bg-white px-1 rounded">ref('1.1')</code></div>
                </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={() => { onSave(value); setIsModalOpen(false); }}>
                Aplicar Fórmula
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
