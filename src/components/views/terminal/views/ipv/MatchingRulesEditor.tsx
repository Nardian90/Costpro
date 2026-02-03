'use client';

import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type MatchingRule } from '@/lib/dexie';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  GripVertical,
  Info,
  ShieldCheck,
  Zap,
  Percent,
  Coins,
  Box
} from 'lucide-react';
import { toast } from 'sonner';

// Dnd Kit Imports
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

interface SortableRuleItemProps {
    rule: MatchingRule;
    toggleRule: (id: string, active: boolean) => Promise<void>;
    updateTolerance: (id: string, value: string) => Promise<void>;
    updatePriority: (id: string, priority: number) => Promise<void>;
    totalRules: number;
}

function SortableRuleItem({ rule, toggleRule, updateTolerance, updatePriority, totalRules }: SortableRuleItemProps) {
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
        zIndex: isDragging ? 50 : 'auto',
        opacity: isDragging ? 0.5 : 1,
    };

    const getIcon = (tipo: string) => {
        switch (tipo) {
            case 'HARD_REF': return <ShieldCheck className="text-blue-500" />;
            case 'EXACT_SUM': return <Zap className="text-yellow-500" />;
            case 'TOLERANCE': return <Percent className="text-green-500" />;
            case 'CASH_FILL': return <Coins className="text-orange-500" />;
            case 'STOCK_LIMIT': return <Box className="text-purple-500" />;
            default: return <Info />;
        }
    };

    const getLabel = (tipo: string) => {
        switch (tipo) {
            case 'HARD_REF': return 'Referencia Directa';
            case 'EXACT_SUM': return 'Suma Exacta (Greedy)';
            case 'TOLERANCE': return 'Margen de Tolerancia';
            case 'CASH_FILL': return 'Ajuste Automático Efectivo';
            case 'STOCK_LIMIT': return 'Control de Inventario';
            default: return tipo;
        }
    };

    const getDescription = (tipo: string) => {
        switch (tipo) {
            case 'HARD_REF': return 'Busca códigos de producto o descripciones en las observaciones de la transacción.';
            case 'EXACT_SUM': return 'Busca combinaciones de productos que sumen exactamente el importe recibido.';
            case 'TOLERANCE': return 'Permite un descuadre controlado si la suma se acerca al importe.';
            case 'CASH_FILL': return 'Cubre cualquier faltante restante marcándolo como venta en efectivo.';
            case 'STOCK_LIMIT': return 'Impide que el algoritmo asigne productos que no tengan existencia física disponible.';
            default: return '';
        }
    };

    return (
        <div ref={setNodeRef} style={style}>
            <Card className={`p-4 sm:p-6 border-none shadow-md bg-background/50 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 ${isDragging ? 'shadow-2xl ring-2 ring-primary/20' : ''}`}>
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
                    <div className="sm:hidden flex-1">
                        <h4 className="font-bold text-sm uppercase tracking-wide">{getLabel(rule.tipo)}</h4>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-black uppercase tracking-widest">Prio</span>
                            <select
                                value={rule.prioridad}
                                onChange={(e) => updatePriority(rule.id, parseInt(e.target.value))}
                                className="h-6 text-[10px] font-bold border rounded bg-background px-1 focus:ring-1 focus:ring-primary outline-none"
                                onClick={(e) => e.stopPropagation()}
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
                    {/* Reordering handle for mobile */}
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
                            <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-50 tracking-widest">Prioridad:</span>
                            <select
                                value={rule.prioridad}
                                onChange={(e) => updatePriority(rule.id, parseInt(e.target.value))}
                                className="h-7 text-[10px] font-black border rounded bg-background px-2 focus:ring-1 focus:ring-primary outline-none cursor-pointer hover:bg-muted/50 transition-colors"
                            >
                                {Array.from({ length: totalRules }, (_, i) => i + 1).map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground max-w-xl">{getDescription(rule.tipo)}</p>
                </div>

                <p className="sm:hidden text-xs text-muted-foreground">
                    {getDescription(rule.tipo)}
                </p>

                <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                    {rule.tipo === 'TOLERANCE' && (
                        <div className="flex items-center gap-2 mr-auto sm:mr-4">
                            <Label className="text-[10px] sm:text-xs font-bold uppercase">Max ($):</Label>
                            <Input
                                type="number"
                                className="w-16 sm:w-20 h-8 text-xs"
                                defaultValue={(rule.tolerancia_cents || 0)}
                                onBlur={(e) => updateTolerance(rule.id, e.target.value)}
                            />
                        </div>
                    )}

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
      { id: '4', tipo: 'TOLERANCE', prioridad: 4, activo: true, tolerancia_cents: 1 }, // $1.00
      { id: '5', tipo: 'CASH_FILL', prioridad: 5, activo: false }
    ];
    await db.matching_rules.bulkPut(defaults);
    toast.success('Reglas inicializadas');
  };

  const toggleRule = async (id: string, active: boolean) => {
    await db.matching_rules.update(id, { activo: active });
  };

  const updateTolerance = async (id: string, value: string) => {
    const val = parseFloat(value);
    if (!isNaN(val)) {
        await db.matching_rules.update(id, { tolerancia_cents: val });
    }
  };

  const updatePriorityManually = async (id: string, newPriority: number) => {
    if (!rules) return;
    const rule = rules.find(r => r.id === id);
    if (!rule || rule.prioridad === newPriority) return;

    // Logic: move item to new position and shift others
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

      // Actualizar prioridades en la base de datos
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
        ) : null}
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
                updateTolerance={updateTolerance}
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
