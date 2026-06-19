'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Calculator,
  HelpCircle,
  Info,
  Check,
  X as XIcon,
  Maximize2,
  Terminal,
  Code,
  Sparkles,
  History,
  X
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from "@/lib/utils";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { FormulaBuilder } from './FormulaBuilder';
import { RESERVED_FORMULA_NAMES } from '@/lib/cost-engine/formula-utils';
import { APP_DISPLAY_VERSION } from '@/config/app';

interface FormulaEditorProps {
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
  className?: string;
  suggestions?: { label: string; value: string; description?: string }[];
  onPendingChange?: (value: string | null) => void;
}

export const FormulaEditor: React.FC<FormulaEditorProps> = ({
  initialValue,
  onSave,
  onCancel,
  className,
  suggestions = [],
  onPendingChange
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [value, setValue] = useState(initialValue);
  const [isFocused, setIsFocused] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mode, setMode] = useState<'assisted' | 'expert'>('assisted');
  const inputRef = useRef<HTMLInputElement>(null);
  const isSavingRef = useRef(false);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  // Auto-focus input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const handleSave = (val: string) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    onPendingChange?.(null);
    onSave(val);
    setIsFocused(false);
    setTimeout(() => { isSavingRef.current = false; }, 300);
  };

  const handleCancel = () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    onPendingChange?.(null);
    onCancel();
    setTimeout(() => { isSavingRef.current = false; }, 300);
  };

  const modalOpeningRef = useRef(false);

  const handleBlur = () => {
    // Delay to allow mouse clicks on buttons to register and to avoid
    // racing with the save lock timeout (300ms). Must be > 300ms so that
    // a save-triggered blur always sees isSavingRef as true and bails out.
    setTimeout(() => {
      // If the modal is opening, do NOT cancel — the user clicked Advanced Editor
      if (modalOpeningRef.current) {
        modalOpeningRef.current = false;
        return;
      }
      if (isSavingRef.current) return;
      // Auto-save if value changed from initial
      if (value.trim() !== initialValue.trim()) {
        handleSave(value);
      } else {
        // Value unchanged — just close without saving
        setIsFocused(false);
        onPendingChange?.(null);
        onCancel();
      }
    }, 400);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave(value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const handleValueChange = (newValue: string) => {
    setValue(newValue);
    onPendingChange?.(newValue);
  };

  const isFormula = value.startsWith('=');

  // C15: Detect bare reserved identifiers in the formula that could conflict
  const reservedWarning = useMemo(() => {
    if (!isFormula || !value) return null;
    // Strip leading '=' and extract word-boundary tokens
    const stripped = value.replace(/^=\s*/, '');
    // Match bare word tokens that are not inside ref('...') or vh('...')
    const tokens = stripped.match(/\b([a-zA-Z_]\w*)\b/g) || [];
    // Filter to only those NOT inside quotes (approximate: skip tokens preceded by '(' and followed by ')')
    for (const token of tokens) {
      if (RESERVED_FORMULA_NAMES.has(token)) {
        return `"${token}" es una función o constante reservada del motor.`;
      }
    }
    // Check for single-char identifiers (not inside function calls)
    const bareSingles = stripped.match(/(?<![a-zA-Z_'"])\b([a-zA-Z])\b(?![a-zA-Z_'")\w])/g) || [];
    if (bareSingles.length > 0) {
      return `Identificador de 1 carácter detectado: "${bareSingles[0]}". Use ref('id') explícito para evitar conflictos.`;
    }
    return null;
  }, [value, isFormula]);

  return (
    <div className="relative group/formula">
      <motion.div
        layout
        className={cn(
          "flex items-center gap-0.5 p-0.5 rounded-lg border transition-all min-h-[34px]",
          isFocused ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border bg-muted/30",
          className
        )}
      >
        <div className="flex-1 flex items-center gap-1 pl-1.5 min-w-0">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="p-1 hover:bg-primary/20 rounded-lg transition-colors shrink-0"
          >
            <Calculator className={cn("w-3.5 h-3.5", isFormula ? "text-primary" : "text-muted-foreground")} />
          </button>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-xs font-mono py-1 min-w-0"
            value={value}
            onChange={(e) => handleValueChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder="f(x) = ..."
            aria-label="Código de fórmula"
          />
        </div>

        {/* C15: Inline warning for reserved name conflicts */}
        {reservedWarning && (
          <div className="absolute -bottom-6 left-2 right-2 z-10 text-[10px] text-warning dark:text-amber-400 font-medium truncate animate-in fade-in slide-in-from-top-1 duration-200" title={reservedWarning}>
            ⚠ {reservedWarning}
          </div>
        )}

        {isFocused && (
          <div className="flex items-center justify-end gap-0.5 pr-0.5 pb-0.5 sm:pb-0 animate-in fade-in slide-in-from-right-2 duration-200 shrink-0">
             <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="p-1 hover:bg-primary/20 text-primary rounded" title="Ayuda">
                    <HelpCircle className="w-3 h-3.5" />
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
                      <div className="space-y-1 text-xs font-mono bg-muted p-2 rounded">
                        <p className="text-primary">= SUMA(hijos) <span className="text-xs text-muted-foreground opacity-70 ml-1">{'//'} Suma todos los sub-elementos</span></p>
                        <p className="text-primary">= ref('1.1') + ref('2.1')</p>
                        <p className="text-primary">= PCT(ref('12'), 10) <span className="text-xs text-muted-foreground opacity-70 ml-1">{'//'} 10% del total de sección 12</span></p>
                        <p className="text-primary">= ref('12') / cantidad</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Funciones y Variables</p>
                      <ul className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                        <li><span className="font-bold">SUMA</span>(a, b...)</li>
                        <li><span className="font-bold">hijos</span> <span className="text-xs opacity-60">(Sub-filas)</span></li>
                        <li><span className="font-bold">PCT</span>(valor, %)</li>
                        <li><span className="font-bold">ROUND2</span>(valor)</li>
                        <li><span className="font-bold">cantidad</span></li>
                        <li><span className="font-bold">ref</span>('ID')</li>
                      </ul>
                    </div>
                  </div>
                </PopoverContent>
             </Popover>

             <button type="button"
               onMouseDown={(e) => { e.preventDefault(); modalOpeningRef.current = true; setIsModalOpen(true); }}
               className="p-1 hover:bg-primary/20 text-primary rounded"
               title="Editor Avanzado"
             >
                <Maximize2 className="w-3 h-3.5" />
             </button>

             <button type="button"
               onMouseDown={(e) => { e.preventDefault(); handleSave(value); }}
               className="p-1 hover:bg-success/20 text-success rounded"
               title="Guardar (Enter)"
             >
                <Check className="w-3 h-3.5" />
             </button>
             <button type="button"
               onMouseDown={(e) => { e.preventDefault(); handleCancel(); }}
               className="p-1 hover:bg-destructive/20 text-destructive rounded"
               title="Cancelar (Esc)"
             >
                <XIcon className="w-3 h-3.5" />
             </button>
          </div>
        )}
      </motion.div>


      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent
          showCloseButton={false}
          className="w-[calc(100%-1rem)] sm:w-full sm:max-w-[800px] z-[200] p-0 overflow-hidden rounded-[2rem] sm:rounded-2xl border-none shadow-2xl max-h-[95vh] bg-background dark:bg-background text-foreground dark:text-foreground transition-all flex flex-col"
        >
          {/* Custom Header based on Design */}
          <div className="px-4 sm:px-6 pt-6 pb-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 sm:gap-4 overflow-hidden">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shadow-sm dark:shadow-sm shrink-0">
                <Terminal className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-[clamp(1.125rem,4vw,1.25rem)] font-black uppercase tracking-tighter italic leading-none truncate">Editor de Cálculo</DialogTitle>
                <DialogDescription className="sr-only">
                  Editor avanzado para configurar fórmulas y cálculos personalizados en la ficha de costo.
                </DialogDescription>
                <p className="text-xs sm:text-xs font-black text-primary uppercase tracking-[0.25em] mt-1.5 opacity-90 truncate">{APP_DISPLAY_VERSION} • Motor de Costos Avanzado</p>
              </div>
            </div>

            <button type="button"
              onClick={() => setIsModalOpen(false)}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-muted dark:bg-muted/50 flex items-center justify-center hover:bg-muted-foreground/10 dark:hover:bg-accent transition-colors shrink-0 ml-2"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground dark:text-muted-foreground" />
            </button>
          </div>

          {/* Subheader with Mode Switcher and Icons */}
          <div className="px-4 sm:px-6 py-2 flex items-center justify-between border-b border-border dark:border-white/5">
            <div className="flex items-center gap-3 sm:gap-4">
              <button type="button"
                onClick={() => setMode('assisted')}
                className={cn(
                  "flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-xs font-black uppercase tracking-widest transition-all",
                  mode === 'assisted' ? "bg-primary text-primary-foreground dark:text-foreground shadow-md dark:shadow-md"
                    : "bg-muted dark:bg-muted/50 text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground"
                )}
              >
                <Sparkles className="w-3 h-3" />
                Asistido
              </button>

              <button type="button"
                onClick={() => setMode('expert')}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  mode === 'expert' ? "text-primary" : "text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground"
                )}
              >
                <Code className="w-4 h-4" />
              </button>

              <button type="button" className="p-2 rounded-lg text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground transition-all">
                <History className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-0 flex-1 min-h-0 overflow-y-auto">
            {mode === 'assisted' ? (
              <div className="animate-in fade-in zoom-in-95 duration-300">
                <FormulaBuilder
                    initialValue={value}
                    suggestions={suggestions}
                    onSave={setValue}
                />
              </div>
            ) : (
              <div className="p-4 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-300">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="formula-code" className="text-xs font-black uppercase tracking-widest text-muted-foreground dark:text-muted-foreground flex items-center gap-2">
                      <Code className="w-3 h-3" />
                      Código de Fórmula
                    </label>
                    <Badge variant="outline" className="text-xs font-mono border-border dark:border-border text-muted-foreground dark:text-muted-foreground">expr-eval enabled</Badge>
                  </div>
                  <textarea
                    id="formula-code"
                    aria-label="Código de Fórmula"
                    className="w-full h-48 sm:h-64 p-4 sm:p-6 font-mono text-sm sm:text-base bg-muted/30 dark:bg-muted/50 border border-border dark:border-border rounded-2xl focus:ring-4 focus:ring-primary/10 dark:focus:ring-primary/10 focus:border-primary/50 dark:focus-ring-primary/50 outline-none resize-none transition-all text-foreground dark:text-foreground"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Escriba su fórmula aquí (ej. = AnexoI + AnexoII)"
                    autoFocus
                  />
                </div>

                <div className="bg-primary/5 p-3 sm:p-4 rounded-xl border border-primary/10">
                  <div className="flex items-center gap-2 mb-2 text-primary font-black text-xs uppercase tracking-wider">
                    <Info className="w-3.5 h-3.5" />
                    Guía de Referencia Rápida
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs sm:text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-border dark:border-white/5">
                      <span className="font-medium text-muted-foreground dark:text-muted-foreground">Suma de Hijos</span>
                      <code className="bg-muted dark:bg-muted text-foreground dark:text-foreground px-1.5 py-0.5 rounded font-mono">SUMA(hijos)</code>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-border dark:border-white/5">
                      <span className="font-medium text-muted-foreground dark:text-muted-foreground">Uso de Anexos</span>
                      <code className="bg-muted dark:bg-muted text-foreground dark:text-foreground px-1.5 py-0.5 rounded font-mono text-xs">AnexoI + AnexoII</code>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer based on Design */}
          <div className="px-4 sm:px-6 py-4 sm:py-6 bg-muted/20 dark:bg-muted/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 sm:gap-4 border-t border-border dark:border-white/5 shrink-0">
            <button type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 sm:px-8 h-11 sm:h-12 rounded-2xl text-xs sm:text-xs font-black uppercase tracking-[0.2em] text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground transition-all border border-border dark:border-border hover:border-muted-foreground/30 dark:hover:border-border"
            >
              Cancelar
            </button>
            <button type="button"
              onClick={() => { handleSave(value); setIsModalOpen(false); }}
              className="px-6 sm:px-10 h-11 sm:h-12 rounded-2xl text-xs sm:text-xs font-black uppercase tracking-[0.2em] bg-primary text-primary-foreground dark:text-foreground shadow-lg dark:shadow-lg  transition-all "
            >
              Guardar Cambios
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
