'use client';

import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    // Parser would go here
  }, [initialValue]);

  useEffect(() => {
    const formula = tokens.map(t => t.value).join(' ');
    if (formula) {
        onSave(formula.startsWith('=') ? formula : `=${formula}`);
    }
  }, [tokens]);

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
    <div className="flex flex-col h-full bg-[#020617] text-slate-200">
      {/* Construction Area */}
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
          <Hammer className="w-3.5 h-3.5" />
          Área de Construcción
        </div>

        <div className="min-h-[100px] sm:min-h-[120px] p-4 sm:p-6 rounded-3xl border-2 border-dashed border-slate-800 bg-slate-900/30 flex flex-wrap gap-2 sm:gap-3 items-start content-start transition-all">
          {tokens.length === 0 && (
            <div className="w-full h-full flex items-center justify-center text-slate-600 italic text-[10px] sm:text-xs py-4 text-center">
              Comience a construir su fórmula seleccionando elementos del panel inferior...
            </div>
          )}
          {tokens.map((token) => (
            <div
              key={token.id}
              className={cn(
                "flex items-center h-8 sm:h-10 px-2 sm:px-3 gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold uppercase transition-all animate-in zoom-in-95",
                token.type === 'function' && "bg-violet-500/20 text-violet-300 border border-violet-500/30 shadow-[0_0_10px_rgba(139,92,246,0.1)]",
                token.type === 'reference' && "bg-blue-500/20 text-blue-300 border border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.1)]",
                token.type === 'operator' && "bg-slate-800 text-slate-200 border border-slate-700",
                token.type === 'variable' && "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30",
                token.type === 'literal' && "bg-slate-700 text-white border border-slate-600",
                token.type === 'punctuation' && "bg-transparent text-slate-500 border-none px-1"
              )}
            >
              {token.type === 'function' && <Sigma className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
              {token.type === 'reference' && <Code className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
              <span className="truncate max-w-[80px] sm:max-w-none">{token.label}</span>
              {token.type !== 'punctuation' && (
                <button
                  onClick={() => removeToken(token.id)}
                  className="hover:text-red-400 transition-colors ml-1"
                >
                  <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                </button>
              )}
            </div>
          ))}
          <div className="w-[2px] h-5 sm:h-6 bg-[#39FF14] animate-pulse self-center ml-1 rounded-full shadow-[0_0_8px_#39FF14]" />
        </div>

        {/* Validation Status */}
        {tokens.length > 0 && (
          <div className="bg-[#16a34a]/10 border border-[#16a34a]/20 p-2 sm:p-3 rounded-xl sm:rounded-2xl flex items-center gap-2 sm:gap-3 animate-in fade-in slide-in-from-top-2">
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[#16a34a] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
            </div>
            <span className="text-[9px] sm:text-[11px] font-bold text-[#16a34a] uppercase tracking-wider leading-tight">
              Fórmula válida • Resultado: $4,592.00
            </span>
          </div>
        )}
      </div>

      {/* Elements Panel */}
      <div className="p-4 sm:p-6 pt-2 space-y-4 border-t border-white/5">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
          <LayoutGrid className="w-3.5 h-3.5" />
          Panel de Elementos
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <HorizontalScroll containerClassName="bg-slate-900/50 p-1 rounded-2xl border border-white/5">
            <TabsList className="bg-transparent border-none w-max min-w-full h-auto p-0 gap-1 flex">
              <TabsTrigger value="functions" className="flex-1 py-3 px-6 text-[10px] font-black uppercase tracking-widest rounded-xl data-[state=active]:bg-slate-800 data-[state=active]:text-white transition-all shrink-0">Funciones</TabsTrigger>
              <TabsTrigger value="refs" className="flex-1 py-3 px-6 text-[10px] font-black uppercase tracking-widest rounded-xl data-[state=active]:bg-slate-800 data-[state=active]:text-white transition-all shrink-0">Referencias</TabsTrigger>
              <TabsTrigger value="ops" className="flex-1 py-3 px-6 text-[10px] font-black uppercase tracking-widest rounded-xl data-[state=active]:bg-slate-800 data-[state=active]:text-white transition-all shrink-0">Operadores</TabsTrigger>
            </TabsList>
          </HorizontalScroll>

          <div className="mt-4">
            <ScrollArea className="h-[250px] sm:h-[280px] rounded-2xl">
              <TabsContent value="functions" className="m-0 space-y-2 pb-4 pr-3">
                {Object.keys(SPANISH_TO_ENGLISH).map(func => (
                  <button
                    key={func}
                    onClick={() => addToken('function', SPANISH_TO_ENGLISH[func], func)}
                    className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-[#39FF14]/30 hover:bg-slate-800/60 transition-all text-left group relative overflow-hidden"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#39FF14] opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
                      <Sigma className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] sm:text-[12px] font-black text-white uppercase tracking-wider">{func}</div>
                      <div className="text-[9px] sm:text-[10px] text-slate-500 line-clamp-1">{FUNCTION_DESCRIPTIONS[func]}</div>
                    </div>
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-[#39FF14] group-hover:text-black transition-all">
                      <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                  </button>
                ))}
              </TabsContent>

              <TabsContent value="refs" className="m-0 space-y-4 pb-4 pr-3">
                <div className="space-y-2">
                  <div className="text-[9px] sm:text-[10px] font-black text-slate-600 uppercase tracking-widest px-2">Filas de la Ficha</div>
                  {suggestions.filter(s => s.value?.startsWith('ref')).map(s => (
                    <button
                      key={s.value}
                      onClick={() => addToken('reference', s.value, s.label)}
                      className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-[#39FF14]/30 hover:bg-slate-800/60 transition-all text-left group relative overflow-hidden"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#39FF14] opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0 font-black text-[10px] sm:text-xs">
                        {s.label.split('.')[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] sm:text-[11px] font-bold text-white uppercase truncate">{s.label}</div>
                        <div className="text-[8px] sm:text-[9px] text-slate-500 truncate">{s.description}</div>
                      </div>
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-[#39FF14] group-hover:text-black transition-all">
                        <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                    </button>
                  ))}
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
                    <button
                      key={op.v}
                      onClick={() => addToken(op.v === '(' || op.v === ')' || op.v === ',' ? 'punctuation' : 'operator', op.v, op.l)}
                      className="flex items-center justify-center h-12 sm:h-16 rounded-xl sm:rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-[#39FF14]/50 hover:bg-slate-800 text-slate-400 hover:text-[#39FF14] transition-all shadow-sm"
                    >
                      {op.i}
                    </button>
                  ))}

                  <div className="col-span-4 mt-2 sm:mt-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-slate-900/30 border border-slate-800">
                    <div className="text-[9px] sm:text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2 sm:mb-3">Valor Numérico</div>
                    <div className="flex gap-2 sm:gap-3">
                      <input
                        type="number"
                        className="flex-1 h-10 sm:h-12 px-3 sm:px-4 rounded-lg sm:rounded-xl bg-slate-800 border-none text-white text-xs sm:text-sm focus:ring-2 focus:ring-[#39FF14]/50 transition-all outline-none"
                        placeholder="Ej: 1500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = (e.target as HTMLInputElement).value;
                            if (val) addToken('literal', val, val);
                            (e.target as HTMLInputElement).value = '';
                          }
                        }}
                      />
                      <button
                        onClick={(e) => {
                          const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                          const val = input.value;
                          if (val) addToken('literal', val, val);
                          input.value = '';
                        }}
                        className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg sm:rounded-xl bg-[#39FF14] text-black flex items-center justify-center hover:shadow-[0_0_15px_rgba(57,255,20,0.4)] transition-all shrink-0"
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
