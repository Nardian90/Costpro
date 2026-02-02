
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  FunctionSquare,
  Variable,
  Hash,
  Plus,
  Minus,
  X as CloseIcon,
  Divide,
  CheckCircle2,
  AlertCircle,
  Info,
  ChevronRight,
  Trash2,
  Code,
  Type,
  Parentheses,
  GripVertical,
  LayoutGrid
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from '@/lib/utils';
import { Parser } from 'expr-eval';
import { translateFormulaFromSpanish } from '@/lib/cost-engine/formula-utils';
import { v4 as uuidv4 } from 'uuid';

// Types
export type TokenType = 'function' | 'operator' | 'reference' | 'variable' | 'literal' | 'punctuation';

export interface FormulaToken {
  id: string;
  type: TokenType;
  value: string;
  label: string;
  description?: string;
}

interface FormulaBuilderProps {
  initialValue: string;
  onSave: (value: string) => void;
  suggestions: { label: string; value: string; description?: string }[];
}

const SPANISH_TO_ENGLISH: Record<string, string> = {
  'SUMA': 'sum',
  'PROMEDIO': 'average',
  'MAX': 'max',
  'MIN': 'min',
  'PCT': 'pct',
  'ROUND2': 'round2'
};

const ENGLISH_TO_SPANISH: Record<string, string> = Object.entries(SPANISH_TO_ENGLISH).reduce((acc, [k, v]) => ({ ...acc, [v]: k }), {});

// Helper to tokenize existing formula string
const tokenize = (formula: string, suggestions: any[]): FormulaToken[] => {
  if (!formula) return [];

  let str = formula.trim();
  if (str.startsWith('=')) str = str.substring(1).trim();

  const tokens: FormulaToken[] = [];

  // Very basic tokenizer using regex
  // Matches:
  // 1. ref('...')
  // 2. Anexo[I-V]
  // 3. Words (Functions/Variables)
  // 4. Numbers (Literals)
  // 5. Operators (+ - * /)
  // 6. Punctuation ( ( ) , )
  const regex = /ref\s*\(\s*['"][^'"]*['"]\s*\)|Anexo[A-Z]+|[a-zA-Z_][a-zA-Z0-9_]*|[0-9]+(?:\.[0-9]+)?|[\+\-\*\/\(\),]/g;
  let match;

  while ((match = regex.exec(str)) !== null) {
    const value = match[0];
    let type: TokenType = 'literal';
    let label = value;

    if (value.startsWith('ref')) {
      type = 'reference';
      const refIdMatch = value.match(/['"]([^'"]*)['"]/);
      const refId = refIdMatch ? refIdMatch[1] : '';
      const suggestion = suggestions.find(s => s.value.includes(refId));
      label = suggestion ? suggestion.label : `Fila ${refId}`;
    } else if (value.startsWith('Anexo')) {
      type = 'reference';
      const suggestion = suggestions.find(s => s.value === value || s.value === `Anexo${value.replace('Anexo', '')}`);
      label = suggestion ? suggestion.label : value;
    } else if (SPANISH_TO_ENGLISH[value.toUpperCase()]) {
      type = 'function';
      label = value.toUpperCase();
    } else if (['sum', 'average', 'max', 'min', 'pct', 'round2'].includes(value.toLowerCase())) {
      type = 'function';
      label = ENGLISH_TO_SPANISH[value.toLowerCase()] || value.toUpperCase();
    } else if (['VH', 'BASE_TOTAL', 'COEF'].includes(value.toUpperCase())) {
      type = 'variable';
      label = value.toUpperCase();
    } else if (/[\+\-\*\/]/.test(value)) {
      type = 'operator';
    } else if (/[\(\),]/.test(value)) {
      type = 'punctuation';
    } else if (isNaN(Number(value))) {
        type = 'variable';
    }

    tokens.push({
      id: uuidv4(),
      type,
      value: (type === 'function') ? (SPANISH_TO_ENGLISH[label] || value.toLowerCase()) : value,
      label
    });
  }

  return tokens;
};

// Sortable Token Component
const SortableToken = ({ token, onRemove }: { token: FormulaToken; onRemove: (id: string) => void }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: token.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto'
  };

  const getIcon = () => {
    switch (token.type) {
      case 'function': return <FunctionSquare className="w-3 h-3" />;
      case 'variable': return <Variable className="w-3 h-3" />;
      case 'reference': return <ChevronRight className="w-3 h-3" />;
      case 'operator': return <Plus className="w-3 h-3" />;
      case 'literal': return <Hash className="w-3 h-3" />;
      case 'punctuation': return <Parentheses className="w-3 h-3" />;
      default: return null;
    }
  };

  const getColor = () => {
    switch (token.type) {
      case 'function': return 'bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800';
      case 'variable': return 'bg-purple-500/10 text-purple-600 border-purple-200 dark:border-purple-800';
      case 'reference': return 'bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800';
      case 'operator': return 'bg-slate-500/10 text-slate-600 border-slate-200 dark:border-slate-800';
      case 'literal': return 'bg-green-500/10 text-green-600 border-green-200 dark:border-green-800';
      case 'punctuation': return 'bg-slate-400/10 text-slate-500 border-slate-200 dark:border-slate-800';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-bold transition-all group",
        getColor(),
        isDragging && "shadow-lg scale-105"
      )}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="w-3 h-3 opacity-30 group-hover:opacity-100 transition-opacity" />
      </div>
      {getIcon()}
      <span>{token.label}</span>
      <button
        onClick={() => onRemove(token.id)}
        className="ml-1 hover:bg-black/10 rounded-full p-0.5 transition-colors"
      >
        <CloseIcon className="w-2.5 h-2.5" />
      </button>
    </div>
  );
};

export const FormulaBuilder: React.FC<FormulaBuilderProps> = ({
  initialValue,
  onSave,
  suggestions
}) => {
  const [tokens, setTokens] = useState<FormulaToken[]>(() => tokenize(initialValue, suggestions));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [validation, setValidation] = useState<{ status: 'ok' | 'error' | 'warning', message?: string }>({ status: 'ok' });

  const sensors = useSensors(
    useSensor(PointerSensor, {
        activationConstraint: {
            distance: 5,
        },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const formulaString = useMemo(() => {
    if (tokens.length === 0) return '';
    return '=' + tokens.map(t => {
        if (t.type === 'operator' || t.type === 'punctuation' || t.type === 'literal') return t.value;
        if (t.type === 'function') return ENGLISH_TO_SPANISH[t.value] || t.value.toUpperCase();
        return t.value;
    }).join(' ');
  }, [tokens]);

  useEffect(() => {
    // Validate in real-time
    if (tokens.length === 0) {
        setValidation({ status: 'ok' });
        return;
    }

    try {
      const parser = new Parser();
      // Add custom functions to parser for validation
      parser.functions.sum = () => 0;
      parser.functions.average = () => 0;
      parser.functions.max = () => 0;
      parser.functions.min = () => 0;
      parser.functions.pct = () => 0;
      parser.functions.round2 = () => 0;
      parser.functions.ref = () => 0;
      parser.functions.SUM_ANEXO = () => 0;

      const rawFormula = tokens.map(t => t.value).join(' ');
      const translated = translateFormulaFromSpanish(rawFormula);
      parser.parse(translated);
      setValidation({ status: 'ok', message: 'Fórmula válida' });
    } catch (e: any) {
      setValidation({ status: 'error', message: e.message });
    }
  }, [tokens]);

  useEffect(() => {
      onSave(formulaString);
  }, [formulaString, onSave]);

  // Sync tokens when initialValue changes externally (e.g. from Expert Mode)
  useEffect(() => {
    if (initialValue !== formulaString) {
      setTokens(tokenize(initialValue, suggestions));
    }
  }, [initialValue, suggestions, formulaString]);

  const addToken = (type: TokenType, value: string, label: string) => {
    setTokens(prev => [...prev, { id: uuidv4(), type, value, label }]);
  };

  const removeToken = (id: string) => {
    setTokens(prev => prev.filter(t => t.id !== id));
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      setTokens((items) => {
        const oldIndex = items.findIndex(t => t.id === active.id);
        const newIndex = items.findIndex(t => t.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const clearTokens = () => setTokens([]);

  const activeToken = tokens.find(t => t.id === activeId);

  return (
    <div className="flex flex-col gap-4">
      {/* Construction Area */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Code className="w-3 h-3" />
                Área de Construcción
            </label>
            <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10 font-bold uppercase"
                onClick={clearTokens}
            >
                <Trash2 className="w-3 h-3 mr-1" />
                Limpiar
            </Button>
        </div>
        <div className={cn(
            "min-h-[100px] p-4 bg-muted/30 border-2 border-dashed rounded-xl flex flex-wrap gap-2 items-start transition-colors",
            validation.status === 'error' ? "border-destructive/30 bg-destructive/5" : "border-primary/20 hover:border-primary/40"
        )}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={tokens.map(t => t.id)} strategy={horizontalListSortingStrategy}>
              {tokens.map((token) => (
                <SortableToken key={token.id} token={token} onRemove={removeToken} />
              ))}
            </SortableContext>
            <DragOverlay dropAnimation={{
                sideEffects: defaultDropAnimationSideEffects({
                    styles: {
                        active: {
                            opacity: '0.5',
                        },
                    },
                }),
            }}>
              {activeId ? (
                <div className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-bold bg-white shadow-xl scale-105",
                    activeToken?.type === 'function' && "text-blue-600 border-blue-200",
                    activeToken?.type === 'variable' && "text-purple-600 border-purple-200",
                    activeToken?.type === 'reference' && "text-amber-600 border-amber-200"
                )}>
                  <GripVertical className="w-3 h-3 opacity-30" />
                  <span>{activeToken?.label}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {tokens.length === 0 && (
            <div className="w-full h-full flex flex-col items-center justify-center py-4 text-muted-foreground animate-in fade-in duration-500">
                <Info className="w-5 h-5 mb-1 opacity-20" />
                <p className="text-[10px] font-medium italic">Haga clic en los elementos de abajo para construir su fórmula</p>
            </div>
          )}
        </div>

        {/* Validation Bar */}
        <div className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium transition-all animate-in fade-in slide-in-from-top-1",
            validation.status === 'ok' ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive"
        )}>
            {validation.status === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            <span className="flex-1 truncate">{validation.message || (validation.status === 'ok' ? 'Fórmula válida' : 'Error en la fórmula')}</span>
            <div className="font-mono bg-black/5 px-1.5 py-0.5 rounded text-[10px] opacity-70">
                {formulaString || '= 0'}
            </div>
        </div>
      </div>

      {/* Selection Panel */}
      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <LayoutGrid className="w-3 h-3" />
            Panel de Elementos
        </label>

        <Tabs defaultValue="functions" className="w-full">
            <TabsList className="w-full grid grid-cols-4 h-9 bg-muted/50 p-1 rounded-lg">
                <TabsTrigger value="functions" className="text-[10px] font-bold uppercase tracking-tight data-[state=active]:bg-background data-[state=active]:shadow-sm">Funciones</TabsTrigger>
                <TabsTrigger value="refs" className="text-[10px] font-bold uppercase tracking-tight data-[state=active]:bg-background data-[state=active]:shadow-sm">Referencias</TabsTrigger>
                <TabsTrigger value="ops" className="text-[10px] font-bold uppercase tracking-tight data-[state=active]:bg-background data-[state=active]:shadow-sm">Operadores</TabsTrigger>
                <TabsTrigger value="vars" className="text-[10px] font-bold uppercase tracking-tight data-[state=active]:bg-background data-[state=active]:shadow-sm">Variables</TabsTrigger>
            </TabsList>

            <ScrollArea className="h-48 mt-2 border rounded-xl bg-muted/10">
                <TabsContent value="functions" className="p-3 m-0">
                    <div className="grid grid-cols-2 gap-2">
                        {Object.keys(SPANISH_TO_ENGLISH).map(func => (
                            <button
                                key={func}
                                onClick={() => addToken('function', SPANISH_TO_ENGLISH[func], func)}
                                className="flex flex-col items-start p-2 rounded-lg border bg-background hover:border-blue-400 hover:bg-blue-50 transition-all text-left group"
                            >
                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600">
                                    <FunctionSquare className="w-3 h-3" />
                                    {func}
                                </div>
                                <span className="text-[9px] text-muted-foreground group-hover:text-blue-500/70 truncate w-full">
                                    {func === 'PCT' ? 'Porcentaje: pct(v, %)' : `Función ${func.toLowerCase()}`}
                                </span>
                            </button>
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="refs" className="p-3 m-0">
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-[9px] font-black uppercase text-muted-foreground mb-2 px-1">Filas de la Ficha</h4>
                            <div className="grid grid-cols-1 gap-1.5">
                                {suggestions.filter(s => s.value.startsWith('ref')).map(s => (
                                    <button
                                        key={s.value}
                                        onClick={() => addToken('reference', s.value, s.label)}
                                        className="flex items-center gap-2 p-2 rounded-lg border bg-background hover:border-amber-400 hover:bg-amber-50 transition-all text-left group"
                                    >
                                        <ChevronRight className="w-3 h-3 text-amber-600" />
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[11px] font-bold text-amber-700 truncate">{s.label}</span>
                                            <span className="text-[9px] text-muted-foreground truncate">{s.description}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h4 className="text-[9px] font-black uppercase text-muted-foreground mb-2 px-1">Anexos</h4>
                            <div className="grid grid-cols-2 gap-2">
                                {suggestions.filter(s => s.value.startsWith('Anexo')).map(s => (
                                    <button
                                        key={s.value}
                                        onClick={() => addToken('reference', s.value, s.label)}
                                        className="flex items-center gap-2 p-2 rounded-lg border bg-background hover:border-amber-400 hover:bg-amber-50 transition-all text-left group"
                                    >
                                        <ChevronRight className="w-3 h-3 text-amber-600" />
                                        <span className="text-[11px] font-bold text-amber-700 truncate">{s.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="ops" className="p-3 m-0">
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { v: '+', l: '+', i: <Plus className="w-4 h-4" /> },
                            { v: '-', l: '-', i: <Minus className="w-4 h-4" /> },
                            { v: '*', l: '×', i: <CloseIcon className="w-4 h-4" /> },
                            { v: '/', l: '÷', i: <Divide className="w-4 h-4" /> },
                            { v: '(', l: '(', i: <Parentheses className="w-4 h-4" /> },
                            { v: ')', l: ')', i: <Parentheses className="w-4 h-4" /> },
                            { v: ',', l: ',', i: <span className="font-bold text-lg">,</span> },
                        ].map(op => (
                            <button
                                key={op.v}
                                onClick={() => addToken(op.v === '(' || op.v === ')' || op.v === ',' ? 'punctuation' : 'operator', op.v, op.l)}
                                className="flex items-center justify-center h-12 rounded-lg border bg-background hover:border-slate-400 hover:bg-slate-50 transition-all text-slate-600 hover:text-slate-900"
                                title={op.l}
                            >
                                {op.i}
                            </button>
                        ))}
                        <div className="col-span-4 mt-2">
                            <h4 className="text-[9px] font-black uppercase text-muted-foreground mb-2 px-1">Valores Numéricos</h4>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    className="flex-1 h-9 px-3 rounded-lg border text-xs bg-background"
                                    placeholder="Ingrese un valor..."
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const val = (e.target as HTMLInputElement).value;
                                            if (val) addToken('literal', val, val);
                                            (e.target as HTMLInputElement).value = '';
                                        }
                                    }}
                                />
                                <Button
                                    size="sm"
                                    className="h-9 px-3 rounded-lg"
                                    onClick={(e) => {
                                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                        const val = input.value;
                                        if (val) addToken('literal', val, val);
                                        input.value = '';
                                    }}
                                >
                                    <Plus className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="vars" className="p-3 m-0">
                    <div className="grid grid-cols-1 gap-2">
                        {[
                            { v: 'VH', l: 'VH', d: 'Valor Histórico de la fila' },
                            { v: 'BASE_TOTAL', l: 'BASE_TOTAL', d: 'Total acumulado de la base de cálculo' },
                            { v: 'COEF', l: 'COEF', d: 'Coeficiente definido para la fila' }
                        ].map(v => (
                            <button
                                key={v.v}
                                onClick={() => addToken('variable', v.v, v.l)}
                                className="flex items-center gap-3 p-3 rounded-lg border bg-background hover:border-purple-400 hover:bg-purple-50 transition-all text-left group"
                            >
                                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                                    <Variable className="w-4 h-4 text-purple-600" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">{v.l}</span>
                                    <span className="text-[9px] text-muted-foreground">{v.d}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </TabsContent>
            </ScrollArea>
        </Tabs>
      </div>
    </div>
  );
};
