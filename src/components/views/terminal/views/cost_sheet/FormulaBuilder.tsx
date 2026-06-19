'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Sigma,
  ChevronRight,
  Plus,
  X,
  Code,
  Variable,
  CheckCircle2,
  Hammer,
  LayoutGrid,
  Divide,
  Minus,
  Calculator
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";
import { HorizontalScroll } from '@/components/ui/HorizontalScroll';

interface Token {
  id: string;
  type: 'function' | 'reference' | 'operator' | 'literal' | 'variable' | 'punctuation';
  value: string;
  label: string;
}

interface FormulaBuilderProps {
  initialValue: string;
  onSave: (value: string) => void;
  suggestions?: { label: string; value: string; description?: string }[];
}

const SPANISH_TO_ENGLISH: Record<string, string> = {
  'SUMA': 'SUM',
  'PROMEDIO': 'AVG',
  'MAX': 'MAX',
  'MIN': 'MIN',
  'PCT': 'PCT',
  'ROUND2': 'ROUND2'
};

const ENGLISH_TO_SPANISH = Object.fromEntries(
  Object.entries(SPANISH_TO_ENGLISH).map(([k, v]) => [v, k])
);

const FUNCTION_DESCRIPTIONS: Record<string, string> = {
  'SUMA': 'Suma todos los valores en un rango.',
  'PROMEDIO': 'Calcula la media aritmética de los argumentos.',
  'MAX': 'Devuelve el valor máximo de un conjunto.',
  'PCT': 'Calcula el porcentaje relativo pct(v, %).',
  'ROUND2': 'Redondea a 2 decimales de precisión.'
};

export const FormulaBuilder: React.FC<FormulaBuilderProps> = ({
  initialValue,
  onSave,
  suggestions = []
}) => {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [activeTab, setActiveTab] = useState('functions');
  const isInternalUpdate = useRef(false);

  // Parser to turn initial string into tokens
  useEffect(() => {
    if (isInternalUpdate.current) {
        isInternalUpdate.current = false;
        return;
    }

    if (!initialValue) {
        setTokens([]);
        return;
    }

    let str = initialValue.startsWith('=') ? initialValue.substring(1).trim() : initialValue.trim();
    if (!str) {
        setTokens([]);
        return;
    }

    // Regex to match tokens
    const tokenRegex = /(ref\(['"][^'"]+['"]\))|([A-Z][A-Z0-9_]*)|(\d+(?:\.\d+)*)|([\+\-\*\/\(\),])|(\s+)/gi;

    const parsedTokens: Token[] = [];
    let match;

    while ((match = tokenRegex.exec(str)) !== null) {
        const [full, ref, func, literal, punct, whitespace] = match;

        if (whitespace) continue;

        const id = Math.random().toString(36).substr(2, 9);

        if (ref) {
            const label = ref.match(/['"]([^'"]+)['"]/)?.[1] || ref;
            parsedTokens.push({ id, type: 'reference', value: ref, label });
        } else if (func) {
            const upperFunc = func.toUpperCase();
            const label = ENGLISH_TO_SPANISH[upperFunc] || upperFunc;
            const value = SPANISH_TO_ENGLISH[label] || upperFunc;
            parsedTokens.push({ id, type: 'function', value, label });
        } else if (literal) {
            parsedTokens.push({ id, type: 'literal', value: literal, label: literal });
        } else if (punct) {
            const type = ['(', ')', ','].includes(punct) ? 'punctuation' : 'operator';
            const label = punct === '*' ? '×' : punct === '/' ? '÷' : punct;
            parsedTokens.push({ id, type, value: punct, label });
        }
    }

    // Only update if tokens have actually changed (simple check)
    const currentFormula = tokens.map(t => t.value).join(' ');
    const newFormula = parsedTokens.map(t => t.value).join(' ');
    if (currentFormula !== newFormula) {
        setTokens(parsedTokens);
    }
  }, [initialValue]);

  // Update parent whenever tokens change (debounced 300ms to avoid excessive updates)
  useEffect(() => {
    if (!tokens || tokens.length === 0) return;
    const formula = tokens.map(t => t.value).join(' ');
    const normalizedFormula = formula ? (formula.startsWith('=') ? formula : `=${formula}`) : '';

    if (normalizedFormula === initialValue) return;

    const timer = setTimeout(() => {
        isInternalUpdate.current = true;
        onSave(normalizedFormula);
    }, 300);

    return () => clearTimeout(timer);
  }, [tokens, onSave, initialValue]);

  const addToken = (type: Token['type'], value: string, label: string) => {
    const newToken: Token = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      value,
      label
    };
    setTokens([...tokens, newToken]);
  };

  const removeToken = (id: string) => {
    setTokens(tokens.filter(t => t.id !== id));
  };

  return (
    <div className="flex flex-col h-full bg-background dark:bg-background text-foreground dark:text-foreground transition-colors">
      {/* Construction Area */}
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-muted-foreground dark:text-muted-foreground">
          <Hammer className="w-3.5 h-3.5" />
          Área de Construcción
        </div>

        <div className="min-h-[100px] sm:min-h-[120px] p-4 sm:p-6 rounded-3xl border-2 border-dashed border-border dark:border-border bg-muted/30 dark:bg-background/30 flex flex-wrap gap-2 sm:gap-3 items-start content-start transition-all relative overflow-hidden">
          {tokens.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6 text-center">
              <span className="text-xs sm:text-sm italic text-muted-foreground dark:text-muted-foreground font-medium tracking-tight">Comience a construir su fórmula seleccionando elementos del panel inferior</span>
            </div>
          )}
          {tokens.map((token) => (
            <div
              key={token.id}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs sm:text-xs font-bold transition-all animate-in zoom-in-95 duration-200",
                token.type === 'function' && "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20 shadow-[0_2px_8px_rgba(139,92,246,0.1)]",
                token.type === 'reference' && "bg-primary/10 text-primary dark:text-blue-400 border-primary/20 shadow-[0_2px_8px_rgba(59,130,246,0.1)]",
                token.type === 'operator' && "bg-muted/10 text-slate-600 dark:text-muted-foreground border-muted/20",
                token.type === 'literal' && "bg-primary/10 text-primary border-primary/20",
                token.type === 'punctuation' && "bg-transparent text-muted-foreground dark:text-muted-foreground border-none px-1"
              )}
            >
              {token.type === 'function' && <Sigma className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
              {token.type === 'reference' && <Code className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
              <span className="truncate max-w-[80px] sm:max-w-none">{token.label}</span>
              {token.type !== 'punctuation' && (
                <button type="button"
                  onClick={() => removeToken(token.id)}
                  className="hover:text-destructive transition-colors ml-1"
                >
                  <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                </button>
              )}
            </div>
          ))}
          <div className="w-[2px] h-5 sm:h-6 bg-primary  self-center ml-1 rounded-full shadow-none dark:shadow-none" />
        </div>

        {/* Validation Status */}
        {tokens.length > 0 && (
          <div className="bg-primary/10 bg-primary/5 border border-primary/20 border-primary/20 p-2 sm:p-3 rounded-xl sm:rounded-xl flex items-center gap-2 sm:gap-3 animate-in fade-in slide-in-from-top-2">
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-3 h-3 sm:w-4 h-4 text-foreground" />
            </div>
            <span className="text-xs sm:text-xs font-bold text-primary uppercase tracking-wider leading-tight">
              Fórmula válida • Resultado: (Evaluando...)
            </span>
          </div>
        )}
      </div>

      {/* Elements Panel */}
      <div className="p-4 sm:p-6 pt-2 space-y-4 border-t border-border dark:border-white/5">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-muted-foreground dark:text-muted-foreground">
          <LayoutGrid className="w-3.5 h-3.5" />
          Panel de Elementos
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <HorizontalScroll containerClassName="bg-muted dark:bg-background/50 p-1 rounded-xl border border-border dark:border-white/10 overflow-hidden">
            <TabsList className="bg-transparent border-none w-max min-w-full h-auto p-0 gap-1 flex overflow-visible">
              <TabsTrigger value="functions" className="py-2.5 px-5 sm:px-8 text-xs font-black uppercase tracking-widest rounded-xl data-[state=active]:bg-background dark:data-[state=active]:bg-muted data-[state=active]:text-foreground dark:data-[state=active]:text-primary transition-all shrink-0 border border-transparent data-[state=active]:border-border dark:data-[state=active]:border-primary/20 shadow-none outline-none">Funciones</TabsTrigger>
              <TabsTrigger value="refs" className="py-2.5 px-5 sm:px-8 text-xs font-black uppercase tracking-widest rounded-xl data-[state=active]:bg-background dark:data-[state=active]:bg-muted data-[state=active]:text-foreground dark:data-[state=active]:text-primary transition-all shrink-0 border border-transparent data-[state=active]:border-border dark:data-[state=active]:border-primary/20 shadow-none outline-none">Referencias</TabsTrigger>
              <TabsTrigger value="annexes" className="py-2.5 px-5 sm:px-8 text-xs font-black uppercase tracking-widest rounded-xl data-[state=active]:bg-background dark:data-[state=active]:bg-muted data-[state=active]:text-foreground dark:data-[state=active]:text-primary transition-all shrink-0 border border-transparent data-[state=active]:border-border dark:data-[state=active]:border-primary/20 shadow-none outline-none">Anexos</TabsTrigger>
              <TabsTrigger value="ops" className="py-2.5 px-5 sm:px-8 text-xs font-black uppercase tracking-widest rounded-xl data-[state=active]:bg-background dark:data-[state=active]:bg-muted data-[state=active]:text-foreground dark:data-[state=active]:text-primary transition-all shrink-0 border border-transparent data-[state=active]:border-border dark:data-[state=active]:border-primary/20 shadow-none outline-none">Operadores</TabsTrigger>
            </TabsList>
          </HorizontalScroll>

          <div className="mt-4 overflow-hidden">
            <ScrollArea className="h-[250px] sm:h-[300px] rounded-xl">
              <TabsContent value="functions" className="m-0 space-y-2 pb-4 pr-3 outline-none">
                {Object.keys(SPANISH_TO_ENGLISH).map(func => (
                  <button type="button"
                    key={func}
                    onClick={() => addToken('function', SPANISH_TO_ENGLISH[func], func)}
                    className="w-full flex items-center gap-3 sm:gap-4 p-2 sm:p-3 rounded-xl bg-transparent hover:bg-muted/10 dark:hover:bg-white/5 border border-border/50 dark:border-white/5 hover:border-primary dark:hover:border-primary/30 hover:bg-muted dark:hover:bg-accent/60 transition-all text-left group relative overflow-hidden"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-600 dark:text-violet-400 shrink-0">
                      <Sigma className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs sm:text-[12px] font-black text-foreground dark:text-foreground uppercase tracking-wider">{func}</div>
                      <div className="text-xs sm:text-xs text-muted-foreground dark:text-muted-foreground line-clamp-1">{FUNCTION_DESCRIPTIONS[func]}</div>
                    </div>
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-border dark:bg-muted flex items-center justify-center text-muted-foreground dark:text-muted-foreground group-hover:bg-primary dark:group-hover:bg-primary group-hover:text-primary-foreground dark:group-hover:text-foreground transition-all">
                      <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                  </button>
                ))}
              </TabsContent>

              <TabsContent value="refs" className="m-0 space-y-4 pb-4 pr-3 outline-none">
                <div className="space-y-2">
                  <div className="text-xs sm:text-xs font-black text-muted-foreground dark:text-muted-foreground uppercase tracking-widest px-2 mb-2">Filas de la Ficha</div>
                  {suggestions.filter(s => s.value?.startsWith('ref') || s.value?.startsWith('vh')).map(s => (
                    <button type="button"
                      key={s.value}
                      onClick={() => addToken('reference', s.value, s.label)}
                      className="w-full flex items-center gap-3 sm:gap-4 p-2 sm:p-3 rounded-xl bg-transparent hover:bg-muted/10 dark:hover:bg-white/5 border border-border/50 dark:border-white/5 hover:border-primary dark:hover:border-primary/30 hover:bg-muted dark:hover:bg-accent/60 transition-all text-left group relative overflow-hidden"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary dark:text-blue-400 shrink-0 font-black text-xs sm:text-xs">
                        {s.label.includes(' ') ? s.label.split(' ')[1] : s.label}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs sm:text-xs font-bold text-foreground dark:text-foreground uppercase truncate">{s.label}</div>
                        <div className="text-xs sm:text-xs text-muted-foreground dark:text-muted-foreground truncate">{s.description}</div>
                      </div>
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-border dark:bg-muted flex items-center justify-center text-muted-foreground dark:text-muted-foreground group-hover:bg-primary dark:group-hover:bg-primary group-hover:text-primary-foreground dark:group-hover:text-foreground transition-all">
                        <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                    </button>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="annexes" className="m-0 space-y-4 pb-4 pr-3 outline-none">
                <div className="space-y-2">
                  <div className="text-xs sm:text-xs font-black text-muted-foreground dark:text-muted-foreground uppercase tracking-widest px-2 mb-2">Referencias a Anexos</div>
                  {suggestions.filter(s => s.value?.startsWith('Anexo')).map(s => (
                    <button type="button"
                      key={s.value}
                      onClick={() => addToken('reference', s.value, s.label)}
                      className="w-full flex items-center gap-3 sm:gap-4 p-2 sm:p-3 rounded-xl bg-transparent hover:bg-muted/10 dark:hover:bg-white/5 border border-border/50 dark:border-white/5 hover:border-primary dark:hover:border-primary/30 hover:bg-muted dark:hover:bg-accent/60 transition-all text-left group relative overflow-hidden"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-warning/10 flex items-center justify-center text-warning dark:text-amber-400 shrink-0 font-black text-xs sm:text-xs">
                        {s.label.split(' ')[1] || 'AX'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs sm:text-xs font-bold text-foreground dark:text-foreground uppercase truncate">{s.label}</div>
                        <div className="text-xs sm:text-xs text-muted-foreground dark:text-muted-foreground truncate">{s.description}</div>
                      </div>
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-border dark:bg-muted flex items-center justify-center text-muted-foreground dark:text-muted-foreground group-hover:bg-primary dark:group-hover:bg-primary group-hover:text-primary-foreground dark:group-hover:text-foreground transition-all">
                        <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                    </button>
                  ))}
                  {suggestions.filter(s => s.value?.startsWith('Anexo')).length === 0 && (
                    <div className="p-8 text-center border-2 border-dashed border-border dark:border-white/5 rounded-3xl">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">No hay anexos configurados</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="ops" className="m-0 pb-4 pr-3">
                <div className="grid grid-cols-4 gap-2 sm:gap-3">
                  {[
                    { v: '+', l: '+', i: <Plus className="w-4 h-4 sm:w-5 sm:h-5" /> },
                    { v: '-', l: '-', i: <Minus className="w-4 h-4 sm:w-5 sm:h-5" /> },
                    { v: '*', l: '×', i: <Plus className="w-4 h-4 sm:w-5 sm:h-5 rotate-45" /> },
                    { v: '/', l: '÷', i: <Divide className="w-4 h-4 sm:w-5 sm:h-5" /> },
                    { v: '(', l: '(', i: <span className="text-lg sm:text-xl font-bold">(</span> },
                    { v: ')', l: ')', i: <span className="text-lg sm:text-xl font-bold">)</span> },
                    { v: ',', l: ',', i: <span className="text-xl sm:text-2xl font-black">,</span> },
                  ].map(op => (
                    <button type="button"
                      key={op.v}
                      onClick={() => addToken(op.v === '(' || op.v === ')' || op.v === ',' ? 'punctuation' : 'operator', op.v, op.l)}
                      className="flex items-center justify-center h-12 sm:h-16 rounded-xl sm:rounded-xl bg-muted/50 dark:bg-background/50 border border-border dark:border-border hover:border-primary/50 dark:hover:border-primary/50 hover:bg-muted dark:hover:bg-accent text-muted-foreground dark:text-muted-foreground hover:text-primary dark:hover:text-primary transition-all shadow-sm"
                    >
                      {op.i}
                    </button>
                  ))}

                  <div className="col-span-4 mt-2 sm:mt-4 p-2 sm:p-3 rounded-xl sm:rounded-xl bg-muted/30 dark:bg-background/30 border border-border dark:border-border">
                    <div className="text-xs sm:text-xs font-black text-muted-foreground dark:text-muted-foreground uppercase tracking-widest mb-2 sm:mb-3">Valor Numérico</div>
                    <div className="flex gap-2 sm:gap-3">
                      <input
                        type="number"
                        className="flex-1 h-11 sm:h-12 px-3 sm:px-4 rounded-lg sm:rounded-xl bg-background dark:bg-muted border-none text-foreground dark:text-foreground text-xs sm:text-sm focus:ring-2 focus:ring-primary/50 dark:focus:ring-primary/50 transition-all outline-none"
                        placeholder="Ej: 1500"
                        aria-label="Valor numérico"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = (e.target as HTMLInputElement).value;
                            if (val) addToken('literal', val, val);
                            (e.target as HTMLInputElement).value = '';
                          }
                        }}
                      />
                      <button type="button"
                        onClick={(e) => {
                          const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                          const val = input.value;
                          if (val) addToken('literal', val, val);
                          input.value = '';
                        }}
                        className="h-11 w-11 sm:h-12 sm:w-12 rounded-lg sm:rounded-xl bg-primary text-primary-foreground dark:text-foreground flex items-center justify-center  transition-all shrink-0"
                      >
                        <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </ScrollArea>
          </div>
        </Tabs>
      </div>
    </div>
  );
};
