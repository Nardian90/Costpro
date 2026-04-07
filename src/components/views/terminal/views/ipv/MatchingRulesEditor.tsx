'use client';

import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, MatchingRule } from '@/lib/dexie';
import { DEFAULT_MATCHING_RULES } from '@/lib/ipv/engine';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from "@/components/ui/badge";
import { GripVertical, Sparkles, Bot, ShieldCheck, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
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
import { RuleMetaEditor } from './RuleMetaEditor';
import { cn } from '@/lib/utils';

interface SortableRuleItemProps {
    rule: MatchingRule;
    toggleRule: (id: string, active: boolean) => Promise<void>;
    updateRuleMeta: (id: string, meta: any) => Promise<void>;
    updatePriority: (id: string, newPriority: number) => Promise<void>;
    totalRules: number;
    usageCount?: number;
}

function SortableRuleItem({ rule, toggleRule, updateRuleMeta, updatePriority, totalRules, usageCount = 0 }: SortableRuleItemProps) {
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
            case 'STOCK_LIMIT': return 'Límites de Stock';
            case 'HARD_REF': return 'Referencia Exacta';
            case 'EXACT_SUM': return 'Suma Exacta (Combinatoria)';
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

    const getExample = (tipo: string) => {
        switch (tipo) {
            case 'STOCK_LIMIT': return 'Ej: No vender "Cerveza 355ml" si el stock virtual es 0.';
            case 'HARD_REF': return 'Ej: Transferencia con nota "PAGO REF: 102" hace match con Producto 102.';
            case 'EXACT_SUM': return 'Ej: Transferencia de $1500 -> Match con (Pollo $1200 + Refresco $300).';
            case 'PRICE_FLEX': return 'Ej: Transferencia de $99.50 -> Match con Producto de $100 (ajustando 0.5%).';
            case 'WILDCARDS': return 'Ej: Si no hay match, usa "Venta Genérica" para cubrir el monto.';
            case 'TOLERANCE': return 'Ej: Diferencia de $0.05 se ignora y la transacción queda "COMPLETA".';
            case 'CASH_FILL': return 'Ej: Cubre faltantes con línea "Efectivo" o maneja excedentes (Pago Mixto).';
            case 'GOAL_WITH_TOLERANCE': return 'Ej: Ajusta cantidades para alcanzar $1,000,000 con ±$5,000 de error.';
            default: return '';
        }
    };

    return (
        <div ref={setNodeRef} style={style} className="group">
            <Card className={cn(
                "p-4 transition-all border-2",
                rule.activo ? 'border-primary/20 bg-card/50' : 'border-transparent bg-muted/30 opacity-60'
            )}>
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
                                    className="h-7 text-xs font-black border rounded bg-background px-2 outline-none"
                                >
                                    {Array.from({ length: totalRules }, (_, i) => i + 1).map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="hidden sm:block flex-1 space-y-1">
                        <div className="flex items-center justify-between">
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
                            {rule.activo && (
                                <Badge variant="secondary" className="text-[10px] font-black uppercase px-2 py-0.5 bg-primary/10 text-primary border-none">
                                    Esta regla cuadró {usageCount} transacciones
                                </Badge>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground max-w-xl">{getDescription(rule.tipo)}</p>
                        <p className="text-[10px] text-primary/70 font-medium italic mt-1">{getExample(rule.tipo)}</p>
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
                    <div className="pt-4 border-t border-border/50 mt-4">
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
  const settings = useLiveQuery(() => db.ipv_settings.get("current"));

  // Conteo de transacciones por estado
  const stats = useLiveQuery(async () => {
    const transactions = await db.bank_statements.toArray();
    return {
        total: transactions.length,
        pendientes: transactions.filter(t => t.estado_conciliacion === 'PENDIENTE').length,
        parciales: transactions.filter(t => t.estado_conciliacion === 'PARCIAL').length,
        completas: transactions.filter(t => t.estado_conciliacion === 'COMPLETO').length
    };
  });

  // Conteo de uso de reglas desde logs
  const ruleUsage = useLiveQuery(async () => {
    const logs = await db.matching_logs.toArray();
    const counts: Record<string, number> = {};
    logs.forEach(log => {
        log.applied_rules?.forEach(ruleType => {
            counts[ruleType] = (counts[ruleType] || 0) + 1;
        });
    });
    return counts;
  });

  const toggleCopiloto = async (active: boolean) => {
    const exists = await db.ipv_settings.get("current");
    if (!exists) {
      await db.ipv_settings.put({
        id: 'current',
        updated_at: new Date().toISOString(),
        paper_size: 'LETTER',
        entidad_nombre: 'ENTIDAD POR DEFECTO',
        entidad_codigo: '0000',
        persona_entrega: 'RESPONSABLE',
        consecutivo_inicio: 1,
        agrupacion_modo: 'GLOBAL',
        desglose_modo: 'TRANSACCION',
        copiloto_activo: active
      });
    } else {
      await db.ipv_settings.update("current", { copiloto_activo: active });
    }
    toast.success(active ? "Copiloto activado: El sistema usará la lógica optimizada (>90% match)." : "Copiloto desactivado: Se aplicará su configuración manual.");
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const initializeDefaultRules = async () => {
    const defaults = DEFAULT_MATCHING_RULES;
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
      {/* Resumen de Estados */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 border-2 border-primary/10 bg-primary/5 flex items-center justify-between">
            <div className="space-y-1">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total Transacciones</p>
                <h3 className="text-2xl font-black">{stats?.total || 0}</h3>
            </div>
            <HelpCircle className="w-8 h-8 text-primary/20" />
        </Card>
        <Card className="p-4 border-2 border-emerald-500/10 bg-emerald-500/5 flex items-center justify-between">
            <div className="space-y-1">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Cuadradas</p>
                <h3 className="text-2xl font-black text-emerald-500">{stats?.completas || 0}</h3>
            </div>
            <CheckCircle2 className="w-8 h-8 text-emerald-500/20" />
        </Card>
        <Card className="p-4 border-2 border-amber-500/10 bg-amber-500/5 flex items-center justify-between">
            <div className="space-y-1">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">En Proceso (Parcial)</p>
                <h3 className="text-2xl font-black text-amber-500">{stats?.parciales || 0}</h3>
            </div>
            <AlertCircle className="w-8 h-8 text-amber-500/20" />
        </Card>
        <Card className="p-4 border-2 border-red-500/10 bg-red-500/5 flex items-center justify-between">
            <div className="space-y-1">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Pendientes</p>
                <h3 className="text-2xl font-black text-red-500">{stats?.pendientes || 0}</h3>
            </div>
            <AlertCircle className="w-8 h-8 text-red-500/20" />
        </Card>
      </div>

      <Card className={`p-6 border-2 transition-all ${settings?.copiloto_activo ? "border-primary bg-primary/5 shadow-lg" : "border-border bg-card"}`}>
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl ${settings?.copiloto_activo ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground"}`}>
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black uppercase tracking-tight">Copiloto Inteligente</h3>
                {settings?.copiloto_activo && (
                  <Badge className="bg-primary text-[10px] font-black uppercase animate-none">Optimizado</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground max-w-md">
                {settings?.copiloto_activo
                  ? "El motor de matching está operando en modo automático de alta precisión (>90%). Sus reglas manuales están en pausa."
                  : "Modo manual activado. El sistema utilizará estrictamente el orden y configuración de las reglas que usted defina debajo."}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-3">
              <Label htmlFor="copiloto-mode" className="text-xs font-black uppercase cursor-pointer">
                {settings?.copiloto_activo ? "Activo" : "Inactivo"}
              </Label>
              <Switch
                id="copiloto-mode"
                checked={settings?.copiloto_activo ?? false}
                onCheckedChange={toggleCopiloto}
                className="data-[state=checked]:bg-primary"
              />
            </div>
            {settings?.copiloto_activo && (
               <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase bg-primary/10 px-2 py-0.5 rounded-full">
                 <Sparkles className="w-3 h-3" />
                 Pipeline Pro v2.5
               </div>
            )}
          </div>
        </div>
      </Card>

      <div className={`space-y-6 transition-all ${settings?.copiloto_activo ? "opacity-40 grayscale pointer-events-none" : "opacity-100"}`}>
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
               <h3 className="text-lg font-black uppercase tracking-tight">Motor de Decisiones</h3>
               {settings?.copiloto_activo && <ShieldCheck className="w-4 h-4 text-muted-foreground" />}
            </div>
            <p className="text-sm text-muted-foreground">Define el orden y comportamiento del algoritmo de matching.</p>
          </div>
          <div className="flex items-center gap-2">
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
                    usageCount={ruleUsage?.[rule.tipo] || 0}
                    updateRuleMeta={updateRuleMeta}
                    updatePriority={updatePriorityManually}
                    totalRules={rules.length}
                />
                ))}
            </SortableContext>
            </div>
        </DndContext>
      </div>
    </div>
  );
}
