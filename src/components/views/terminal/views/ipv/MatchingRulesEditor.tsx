'use client';

import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, MatchingRule } from '@/lib/dexie';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { GripVertical } from 'lucide-react';
import { toast } from 'sonner';
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
import { RuleMetaEditor } from "./RuleMetaEditor";

interface SortableRuleItemProps {
  rule: MatchingRule;
  toggleRule: (id: string, active: boolean) => Promise<void>;
  updateRuleMeta: (id: string, meta: any) => Promise<void>;
  updatePriority: (id: string, newPriority: number) => Promise<void>;
  totalRules: number;
}

function SortableRuleItem({ rule, toggleRule, updateRuleMeta, updatePriority, totalRules }: SortableRuleItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: rule.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const getLabel = (tipo: string) => {
        switch (tipo) {
            case 'STOCK_LIMIT': return 'Límite de Stock';
            case 'HARD_REF': return 'Referencia Exacta';
            case 'EXACT_SUM': return 'Suma Combinada';
            case 'PRICE_FLEX': return 'Flexibilidad de Precio';
            case 'WILDCARDS': return 'Comodines';
            case 'TOLERANCE': return 'Tolerancia de Cuadre';
            case 'CASH_FILL': return 'Inyección de Efectivo';
            case 'GOAL_WITH_TOLERANCE': return 'Meta con Tolerancia';
            default: return tipo;
        }
    };

    const getDescription = (tipo: string) => {
        switch (tipo) {
            case 'STOCK_LIMIT': return 'Prioriza productos con bajo stock o según su jerarquía virtual.';
            case 'HARD_REF': return 'Busca referencias exactas entre el mensaje bancario y el catálogo.';
            case 'EXACT_SUM': return 'Busca combinaciones de productos que sumen el importe exacto de la transacción.';
            case 'PRICE_FLEX': return 'Permite pequeñas variaciones de precio para lograr un cuadre exacto.';
            case 'WILDCARDS': return 'Aplica productos comodín si no se encuentra un match específico.';
            case 'TOLERANCE': return 'Acepta diferencias mínimas (centavos) para cerrar el cuadre.';
            case 'CASH_FILL': return 'Completa el cuadre inyectando líneas de efectivo virtuales.';
            case 'GOAL_WITH_TOLERANCE': return 'Distribuye metas de venta con márgenes de error permitidos.';
            default: return '';
        }
    };

    return (
        <div ref={setNodeRef} style={style} className="group">
            <Card className={`p-4 transition-all border-2 ${rule.activo ? 'border-primary/20 bg-card/50' : 'border-transparent bg-muted/30 opacity-60'}`}>
                <div className="flex items-start gap-4">
                    <div
                        className="hidden sm:flex text-muted-foreground cursor-grab active:cursor-grabbing mt-1 p-1 hover:bg-muted rounded"
                        {...attributes}
                        {...listeners}
                    >
                        <GripVertical className="w-5 h-5" />
                    </div>

                    <div className="flex-1 sm:hidden">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="font-bold text-sm uppercase">{getLabel(rule.tipo)}</h4>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black opacity-50 uppercase">PRIO:</span>
                                <select
                                    value={rule.prioridad}
                                    onChange={(e) => updatePriority(rule.id, parseInt(e.target.value))}
                                    className="h-6 text-[10px] border rounded bg-background px-1"
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
                    <div className="pt-4 border-t border-border/50">
                        <RuleMetaEditor
                            rule={rule}
                            onSave={updateRuleMeta}
                        />
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
