'use client';

import React from 'react';
import { db, type MatchingRule } from '@/lib/dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  GripVertical,
  Search,
  Target,
  TrendingUp,
  Zap,
  Info,
  ChevronRight,
  ShieldCheck,
  Settings2
} from 'lucide-react';
import { toast } from 'sonner';

interface SortableRuleItemProps {
    rule: MatchingRule;
    toggleRule: (id: string, active: boolean) => void;
    updateRuleMeta: (id: string, meta: any) => void;
    updatePriority: (id: string, newPriority: number) => void;
    totalRules: number;
}

function SortableRuleItem({ rule, toggleRule, updateRuleMeta, updatePriority, totalRules }: SortableRuleItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: rule.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 0,
    };

    const getIcon = (tipo: string) => {
        switch (tipo) {
            case 'HARD_REF': return <Search className="w-5 h-5 text-blue-500" />;
            case 'EXACT_SUM': return <Target className="w-5 h-5 text-green-500" />;
            case 'PRICE_FLEX': return <TrendingUp className="w-5 h-5 text-orange-500" />;
            case 'WILDCARDS': return <Zap className="w-5 h-5 text-purple-500" />;
            case 'TOLERANCE': return <Info className="w-5 h-5 text-yellow-500" />;
            case 'CASH_FILL': return <ChevronRight className="w-5 h-5 text-slate-500" />;
            case 'STOCK_LIMIT': return <ShieldCheck className="w-5 h-5 text-red-500" />;
            default: return <Settings2 className="w-5 h-5" />;
        }
    };

    const getLabel = (tipo: string) => {
        switch (tipo) {
            case 'HARD_REF': return 'Hard Reference';
            case 'EXACT_SUM': return 'Exact Sum (Backtracking)';
            case 'PRICE_FLEX': return 'Price Flexibility';
            case 'WILDCARDS': return 'Wildcards Matching';
            case 'TOLERANCE': return 'Tolerance Adjustment';
            case 'CASH_FILL': return 'Cash Filling';
            case 'STOCK_LIMIT': return 'Stock Limit Policy';
            default: return tipo;
        }
    };

    const getDescription = (tipo: string) => {
        switch (tipo) {
            case 'HARD_REF': return 'Busca códigos de producto o descripciones en las observaciones de la transacción.';
            case 'EXACT_SUM': return 'Busca combinaciones de productos que sumen exactamente el importe recibido.';
            case 'PRICE_FLEX': return 'Permite variar ligeramente el precio de productos configurados para cuadrar el gap.';
            case 'WILDCARDS': return 'Asigna productos estratégicos (comodines) para completar el importe.';
            case 'TOLERANCE': return 'Permite un descuadre controlado si la suma se acerca al importe.';
            case 'CASH_FILL': return 'Cubre cualquier faltante restante marcándolo como venta en efectivo.';
            case 'STOCK_LIMIT': return 'Impide que el algoritmo asigne productos que no tengan existencia física disponible.';
            default: return '';
        }
    };

    const handleMetaChange = (key: string, value: any) => {
        const newMeta = { ...(rule.meta || {}), [key]: value };
        updateRuleMeta(rule.id, newMeta);
    };

    return (
        <div ref={setNodeRef} style={style}>
            <Card className={`p-4 sm:p-6 border-none shadow-md bg-background/50 flex flex-col gap-4 ${isDragging ? 'shadow-2xl ring-2 ring-primary/20' : ''}`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                    <div
                        className="hidden sm:block text-muted-foreground cursor-grab active:cursor-grabbing p-2 hover:bg-muted rounded-lg transition-colors"
                        {...attributes}
                        {...listeners}
                    >
                        <GripVertical className="w-5 h-5" />
                    </div>

                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        <div className="p-3 bg-card rounded-2xl shadow-inner shrink-0">
                            {getIcon(rule.tipo)}
                        </div>
                        <div className="flex-1 sm:hidden">
                            <h4 className="font-bold text-sm uppercase tracking-wide">{getLabel(rule.tipo)}</h4>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-black uppercase tracking-widest">Prio</span>
                                <select
                                    value={rule.prioridad}
                                    onChange={(e) => updatePriority(rule.id, parseInt(e.target.value))}
                                    className="h-6 text-xs font-bold border rounded bg-background px-1 focus:ring-1 focus:ring-primary outline-none"
                                >
                                    {Array.from({ length: totalRules }, (_, i) => i + 1).map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="sm:hidden">
                            <Switch
                                checked={rule.activo}
                                onCheckedChange={(checked) => toggleRule(rule.id, checked)}
                            />
                        </div>
                        <div
                            className="sm:hidden text-muted-foreground cursor-grab active:cursor-grabbing p-2"
                            {...attributes}
                            {...listeners}
                        >
                            <GripVertical className="w-5 h-5" />
                        </div>
                    </div>

                    <div className="hidden sm:block flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm uppercase tracking-wide">{getLabel(rule.tipo)}</h4>
                            <div className="flex items-center gap-2 ml-2">
                                <span className="text-xs font-bold text-muted-foreground uppercase opacity-50 tracking-widest">Prioridad:</span>
                                <select
                                    value={rule.prioridad}
                                    onChange={(e) => updatePriority(rule.id, parseInt(e.target.value))}
                                    className="h-7 text-xs font-black border rounded bg-background px-2 focus:ring-1 focus:ring-primary outline-none cursor-pointer hover:bg-muted/50 transition-colors"
                                >
                                    {Array.from({ length: totalRules }, (_, i) => i + 1).map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground max-w-xl">{getDescription(rule.tipo)}</p>
                    </div>

                    <div className="hidden sm:flex items-center gap-3">
                        <Label htmlFor={`active-${rule.id}`} className="text-xs font-bold uppercase cursor-pointer">
                            {rule.activo ? 'Activa' : 'Inactiva'}
                        </Label>
                        <Switch
                            id={`active-${rule.id}`}
                            checked={rule.activo}
                            onCheckedChange={(checked) => toggleRule(rule.id, checked)}
                        />
                    </div>
                </div>

                {rule.activo && (
                    <div className="pt-4 border-t border-border/50 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {rule.tipo === 'TOLERANCE' && (
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tolerancia Máx (cts)</Label>
                                <Input
                                    type="number"
                                    className="h-8 text-xs font-bold"
                                    value={rule.meta?.tolerance_cents || 0}
                                    onChange={(e) => handleMetaChange('tolerance_cents', parseInt(e.target.value) || 0)}
                                />
                            </div>
                        )}
                        {rule.tipo === 'PRICE_FLEX' && (
                            <>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Var. Máx (%)</Label>
                                    <Input
                                        type="number"
                                        className="h-8 text-xs font-bold"
                                        value={rule.meta?.max_variation_percent || 20}
                                        onChange={(e) => handleMetaChange('max_variation_percent', parseInt(e.target.value) || 0)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Var. Máx (cts)</Label>
                                    <Input
                                        type="number"
                                        className="h-8 text-xs font-bold"
                                        value={rule.meta?.max_variation_cents || 10}
                                        onChange={(e) => handleMetaChange('max_variation_cents', parseInt(e.target.value) || 0)}
                                    />
                                </div>
                            </>
                        )}
                        {rule.tipo === 'CASH_FILL' && (
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Límite Diario (cts)</Label>
                                <Input
                                    type="number"
                                    className="h-8 text-xs font-bold"
                                    value={rule.meta?.daily_limit || 500}
                                    onChange={(e) => handleMetaChange('daily_limit', parseInt(e.target.value) || 0)}
                                />
                            </div>
                        )}
                    </div>
                )}
            </Card>
        </div>
    );
}

export function MatchingRulesEditor() {
  const rules = useLiveQuery(() => db.matching_rules.orderBy('prioridad').toArray());

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const initializeDefaultRules = async () => {
    const defaults: MatchingRule[] = [
      { id: '1', tipo: 'STOCK_LIMIT', prioridad: 1, activo: true },
      { id: '2', tipo: 'HARD_REF', prioridad: 2, activo: true },
      { id: '3', tipo: 'EXACT_SUM', prioridad: 3, activo: true },
      { id: '4', tipo: 'PRICE_FLEX', prioridad: 4, activo: true, meta: { max_variation_percent: 20, max_variation_cents: 10 } },
      { id: '5', tipo: 'WILDCARDS', prioridad: 5, activo: true },
      { id: '6', tipo: 'TOLERANCE', prioridad: 6, activo: true, meta: { tolerance_cents: 100 } },
      { id: '7', tipo: 'CASH_FILL', prioridad: 7, activo: false, meta: { daily_limit: 500 } }
    ];
    await db.matching_rules.bulkPut(defaults);
    toast.success('Reglas inicializadas');
  };

  const toggleRule = async (id: string, active: boolean) => {
    await db.matching_rules.update(id, { activo: active });
  };

  const updateRuleMeta = async (id: string, meta: any) => {
    await db.matching_rules.update(id, { meta });
  };

  const updatePriorityManually = async (id: string, newPriority: number) => {
    if (!rules) return;
    const rule = rules.find(r => r.id === id);
    if (!rule || rule.prioridad === newPriority) return;

    const otherRules = rules.filter(r => r.id !== id);
    const updatedRules = [...otherRules];
    updatedRules.splice(newPriority - 1, 0, rule);

    const updates = updatedRules.map((r, idx) => {
        return db.matching_rules.update(r.id, { prioridad: idx + 1 });
    });

    await Promise.all(updates);
    toast.success(`Prioridad actualizada a ${newPriority}`);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      if (!rules) return;

      const oldIndex = rules.findIndex((r) => r.id === active.id);
      const newIndex = rules.findIndex((r) => r.id === over.id);

      const newRulesOrder = arrayMove(rules, oldIndex, newIndex);

      const updates = newRulesOrder.map((rule, index) => {
        return db.matching_rules.update(rule.id, { prioridad: index + 1 });
      });

      await Promise.all(updates);
      toast.success('Orden de reglas actualizado');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-black uppercase tracking-tight">Motor de Decisiones</h3>
          <p className="text-sm text-muted-foreground">Define el orden y comportamiento del algoritmo de matching.</p>
        </div>
        {!rules || rules.length === 0 ? (
          <Button onClick={initializeDefaultRules} className="neu-btn-primary">
            Inicializar Reglas
          </Button>
        ) : (
            <Button variant="outline" size="sm" onClick={initializeDefaultRules} className="neu-btn text-[10px] font-black uppercase">
                Resetear a Valores x Defecto
            </Button>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-4">
          <SortableContext
            items={rules?.map(r => r.id) || []}
            strategy={verticalListSortingStrategy}
          >
            {rules?.map((rule) => (
              <SortableRuleItem
                key={rule.id}
                rule={rule}
                toggleRule={toggleRule}
                updateRuleMeta={updateRuleMeta}
                updatePriority={updatePriorityManually}
                totalRules={rules.length}
              />
            ))}
          </SortableContext>
        </div>
      </DndContext>
    </div>
  );
}
