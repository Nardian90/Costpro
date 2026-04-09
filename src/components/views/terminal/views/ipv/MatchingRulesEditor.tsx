'use client';

import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, MatchingRule } from '@/lib/dexie';
import { DEFAULT_MATCHING_RULES } from '@/lib/ipv/engine';
import { Card } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from "@/components/ui/badge";
import { GripVertical, Sparkles, Bot, ShieldCheck, CheckCircle2, AlertCircle, HelpCircle, Info, Zap, Settings2, Workflow, Eye, Target, RefreshCcw, AlertTriangle } from 'lucide-react';
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


const RULE_DESCRIPTIONS: Record<string, any> = {
    "STOCK_LIMIT": {
        "trigger": "Se activa globalmente si la regla está habilitada en el motor de matching.",
        "setup": [
            "Control de stock habilitado en configuración",
            "Productos con stock inicial cargado (stock_inicial_manual)",
            "Configuración 'allow_negative' (Permitir stock negativo)"
        ],
        "logic": [
            "El sistema intercepta cada intento de matching.",
            "Verifica el 'Stock Virtual' (Stock inicial - movimientos ya aplicados en esta sesión).",
            "Si el stock es insuficiente, intenta una 'Descomposición' (ej: de un combo a sus partes).",
            "Si persiste la falta de stock y 'allow_negative' es falso, bloquea la asignación del producto."
        ],
        "result": "Evita que el sistema asigne productos que físicamente no deberían estar disponibles, forzando al motor a buscar otras combinaciones o usar comodines.",
        "interaction": "Afecta a todas las reglas de búsqueda de productos (HARD_REF, EXACT_SUM, WILDCARDS).",
        "errors": [
            "Stock desfasado: Si el inventario real no coincide con el digital, se pueden bloquear ventas legítimas."
        ]
    },
    "HARD_REF": {
        "trigger": "Se activa cuando el código de un producto coincide exactamente con la referencia de la transferencia o aparece en las observaciones del banco.",
        "setup": [
            "Códigos de producto únicos y consistentes",
            "Formatos de referencia bancaria legibles"
        ],
        "logic": [
            "Busca el código del producto dentro del texto de la transacción.",
            "Si hay coincidencia, asigna automáticamente la cantidad que cubra el monto (o 1 unidad si es mayor).",
            "Genera una línea de 'Transferencia' vinculada al producto."
        ],
        "result": "Conciliación inmediata y precisa para clientes que especifican qué están pagando en la referencia correspondiente al monto transferido.",
        "interaction": "Es una regla de alta prioridad. Si tiene éxito, reduce el 'monto restante' para las reglas posteriores o finaliza el proceso.",
        "errors": [
            "Ambigüedad: Si el código de un producto es un número común (ej: '100'), puede haber falsos positivos.",
            "Referencia incompleta: Si el usuario escribe mal el código en la transferencia."
        ]
    },
    "EXACT_SUM": {
        "trigger": "Se activa para transacciones que no han sido resueltas por referencias directas (HARD_REF).",
        "setup": [
            "Catálogo de productos con precios actualizados",
            "Parámetros de profundidad (depth) y tiempo límite (timeout) configurados en la meta de la regla"
        ],
        "logic": [
            "Inicia un algoritmo combinatorio (Backtracking/Subset Sum).",
            "Busca entre los productos activos combinaciones cuyos precios sumen exactamente el importe de la transacción.",
            "Respeta los límites de stock si la regla STOCK_LIMIT está activa.",
            "Si encuentra una combinación válida, genera las líneas de productos correspondientes."
        ],
        "result": "Desglose automático de ventas complejas (ej: varios productos en una sola transferencia). Las columnas de 'Transferencia' se pueblan con los productos hallados.",
        "scenarios": [
            "Transferencia de 500: El sistema encuentra que Pollo (200) + Refresco (00) = 500 exactos. Asigna ambos productos."
        ],
        "interaction": "Consume el monto total. Si no encuentra una suma exacta, no aplica ningún producto y delega en WILDCARDS o CASH_FILL.",
        "errors": [
            "Timeout: En transacciones muy grandes con muchos productos, el sistema puede rendirse para evitar bloqueos.",
            "Múltiples soluciones: El sistema elige la primera combinación óptima encontrada."
        ]
    },
    "PRICE_FLEX": {
        "trigger": "Se activa cuando no hay un match exacto por suma, permitiendo un margen de error en el precio unitario.",
        "setup": [
            "Rango de variación permitido (ej: 10%)",
            "Límite máximo de variación en centavos"
        ],
        "logic": [
            "Evalúa productos cuyo precio sea cercano al monto restante.",
            "Ajusta virtualmente el precio del producto (dentro del rango) para forzar el match.",
            "Si el ajuste logra cuadrar la transacción, se acepta el producto."
        ],
        "result": "Permite cerrar transacciones donde hubo pequeños errores de redondeo o cambios de precio no reportados.",
        "scenarios": [
            "Transferencia de 9.50: El producto cuesta 00. Con 0.5% de flexibilidad, el sistema lo acepta como un match válido."
        ],
        "interaction": "Ayuda a EXACT_SUM a finalizar cuando hay diferencias mínimas de céntimos.",
        "errors": [
            "Distorsión de costos: Si el margen es muy alto, los reportes de rentabilidad pueden verse afectados."
        ]
    },
    "WILDCARDS": {
        "trigger": "Se activa como último recurso antes de la inyección de efectivo pura.",
        "setup": [
            "Productos marcados con el flag 'isWildcardCandidate' (ej: 'Venta Genérica')",
            "Precio definido para el comodín (puede ser  o un valor base)"
        ],
        "logic": [
            "Busca productos 'Comodín' en el catálogo.",
            "Calcula la cantidad necesaria del comodín para cubrir o acercarse al monto restante.",
            "Prioriza el comodín que minimice el residuo final."
        ],
        "result": "Asegura que el monto transferido esté respaldado por al menos un ítem de catálogo, aunque sea genérico.",
        "scenarios": [
            "Monto de 43 sin match: Usa el producto 'Venta Granel' x 743 unidades (si vale ) para justificar el ingreso."
        ],
        "interaction": "Reduce drásticamente la necesidad de usar CASH_FILL, manteniendo la integridad del inventario genérico.",
        "errors": [
            "Falta de especificidad: No permite saber qué se vendió realmente, solo que hubo una venta."
        ]
    },
    "TOLERANCE": {
        "trigger": "Se activa al final del pipeline si queda un residuo muy pequeño.",
        "setup": [
            "Monto de tolerancia configurado (ej: 100 centavos / )"
        ],
        "logic": [
            "Compara el residuo final contra el límite de tolerancia.",
            "Si es menor o igual, marca la transacción como 'COMPLETA'.",
            "No genera líneas adicionales, simplemente ignora la diferencia."
        ],
        "result": "Limpia ruidos visuales de céntimos en los reportes de conciliación.",
        "scenarios": [
            "Diferencia de -bash.05: El sistema la ignora y la transacción pasa a verde (Cuadrada)."
        ],
        "interaction": "Es el 'filtro de belleza' final. Evita que transacciones casi perfectas queden en estado 'PARCIAL'.",
        "errors": [
            "Acumulación: Si se usa una tolerancia muy alta, se pueden perder montos significativos en el agregado mensual."
        ]
    },
    "CASH_FILL": {
        "trigger": "Regla de cierre obligatoria para garantizar el cuadre de todas las operaciones.",
        "setup": [
            "Límite diario de inyección (para control de riesgos)",
            "Clasificación configurada como 'Efectivo' o 'Transferencia Filler'"
        ],
        "logic": [
            "Caso A (Excedente): Los productos exceden la transferencia -> Crea línea de 'Efectivo' (Pago Mixto).",
            "Caso B (Faltante): La transferencia excede los productos -> Crea línea de 'Transferencia' de ajuste.",
            "Registra la observación: 'Pago mixto' o 'Cuadre automático'."
        ],
        "result": "Garantiza que toda transacción tenga una contrapartida, reflejando fielmente la naturaleza mixta de los cobros reales.",
        "scenarios": [
            "Venta de 000 con transferencia de 00: Genera línea de 00 como 'Efectivo' automáticamente."
        ],
        "interaction": "Es la red de seguridad final. Sin esta regla, el sistema dejaría muchas transacciones como 'PARCIAL'.",
        "errors": [
            "Abuso de la regla: Puede ocultar problemas de carga de catálogo si se inyecta demasiado efectivo sin control."
        ]
    }
};

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




    const info = RULE_DESCRIPTIONS[rule.tipo] || {
        trigger: "Sin descripción disponible.",
        setup: [],
        logic: [],
        result: "",
        scenarios: [],
        interaction: "",
        errors: []
    };

    return (
        <div ref={setNodeRef} style={style} className="group">
            <Card className={cn(
                "transition-all border-2 overflow-hidden",
                rule.activo ? 'border-primary/20 bg-card/50 shadow-sm' : 'border-transparent bg-muted/30 opacity-60'
            )}>
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="details" className="border-none">
                        <div className="flex items-center px-4 py-2 bg-muted/20 border-b border-border/50">
                            <div
                                className="text-muted-foreground cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded mr-2"
                                {...attributes}
                                {...listeners}
                            >
                                <GripVertical className="w-4 h-4" />
                            </div>

                            <div className="flex-1 flex items-center gap-3">
                                <Badge variant="outline" className="font-black text-[10px] w-6 h-6 flex items-center justify-center rounded-full p-0 bg-background">
                                    {rule.prioridad}
                                </Badge>
                                <h4 className="font-bold text-xs uppercase tracking-wider">{getLabel(rule.tipo)}</h4>
                                {usageCount > 0 && (
                                    <Badge variant="secondary" className="text-[9px] font-bold px-1.5 py-0 bg-emerald-500/10 text-emerald-600 border-none">
                                        {usageCount} USOS
                                    </Badge>
                                )}
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black text-muted-foreground uppercase opacity-50">Prioridad:</span>
                                    <select
                                        value={rule.prioridad}
                                        onChange={(e) => updatePriority(rule.id, parseInt(e.target.value))}
                                        className="h-6 text-[10px] font-black border rounded bg-background px-1 outline-none cursor-pointer"
                                    >
                                        {Array.from({ length: totalRules }, (_, i) => i + 1).map(p => (
                                            <option key={p} value={p}>{p}</option>
                                        ))}
                                    </select>
                                </div>
                                <Switch
                                    checked={rule.activo}
                                    onCheckedChange={(checked) => toggleRule(rule.id, checked)}
                                    className="scale-75"
                                />
                            </div>
                        </div>

                        <AccordionTrigger className="px-4 py-3 hover:no-underline group-data-[state=open]:bg-primary/5 transition-colors">
                            <div className="flex items-center gap-2 text-left">
                                <Info className="w-3.5 h-3.5 text-primary/60" />
                                <span className="text-xs text-muted-foreground font-medium line-clamp-1">
                                    {info.trigger}
                                </span>
                            </div>
                        </AccordionTrigger>

                        <AccordionContent className="px-6 pb-6 pt-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                                {/* Columna Izquierda: Definición y Configuración */}
                                <div className="space-y-6">
                                    <section>
                                        <div className="flex items-center gap-2 mb-2 text-primary">
                                            <Zap className="w-4 h-4" />
                                            <h5 className="text-[10px] font-black uppercase tracking-widest">Trigger (Origen)</h5>
                                        </div>
                                        <p className="text-sm text-foreground/80 leading-relaxed pl-6 border-l-2 border-primary/10 italic">
                                            "{info.trigger}"
                                        </p>
                                    </section>

                                    <section>
                                        <div className="flex items-center gap-2 mb-3 text-amber-500">
                                            <Settings2 className="w-4 h-4" />
                                            <h5 className="text-[10px] font-black uppercase tracking-widest">Configuración en Catálogo</h5>
                                        </div>
                                        <ul className="space-y-2 pl-6">
                                            {info.setup.map((s: string, i: number) => (
                                                <li key={i} className="text-xs flex items-center gap-2 text-muted-foreground">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500/40" />
                                                    {s}
                                                </li>
                                            ))}
                                        </ul>
                                    </section>

                                    <section>
                                        <div className="flex items-center gap-2 mb-3 text-emerald-500">
                                            <Eye className="w-4 h-4" />
                                            <h5 className="text-[10px] font-black uppercase tracking-widest">Resultado Operativo</h5>
                                        </div>
                                        <div className="pl-6 py-2 px-3 bg-emerald-500/5 rounded-lg border border-emerald-500/10">
                                            <p className="text-xs text-emerald-700 font-medium">
                                                {info.result}
                                            </p>
                                        </div>
                                    </section>
                                </div>

                                {/* Columna Derecha: Lógica e Interacción */}
                                <div className="space-y-6">
                                    <section>
                                        <div className="flex items-center gap-2 mb-3 text-blue-500">
                                            <Workflow className="w-4 h-4" />
                                            <h5 className="text-[10px] font-black uppercase tracking-widest">Lógica del Sistema</h5>
                                        </div>
                                        <div className="space-y-3 pl-2">
                                            {info.logic.map((l: string, i: number) => (
                                                <div key={i} className="flex gap-3">
                                                    <span className="text-[10px] font-black text-blue-500/50 mt-0.5">{i+1}.</span>
                                                    <p className="text-xs leading-normal text-muted-foreground">{l}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </section>

                                    <section>
                                        <div className="flex items-center gap-2 mb-3 text-purple-500">
                                            <Target className="w-4 h-4" />
                                            <h5 className="text-[10px] font-black uppercase tracking-widest">Escenario Real</h5>
                                        </div>
                                        <div className="pl-6 border-l-2 border-purple-500/20">
                                            {info.scenarios.map((s: string, i: number) => (
                                                <p key={i} className="text-xs text-muted-foreground leading-relaxed">
                                                    {s}
                                                </p>
                                            ))}
                                        </div>
                                    </section>

                                    <div className="grid grid-cols-2 gap-4">
                                        <section>
                                            <div className="flex items-center gap-2 mb-2 text-slate-500">
                                                <RefreshCcw className="w-3.5 h-3.5" />
                                                <h5 className="text-[9px] font-black uppercase tracking-widest">Interacción</h5>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground leading-tight">
                                                {info.interaction}
                                            </p>
                                        </section>
                                        <section>
                                            <div className="flex items-center gap-2 mb-2 text-red-500">
                                                <AlertTriangle className="w-3.5 h-3.5" />
                                                <h5 className="text-[9px] font-black uppercase tracking-widest">Errores Comunes</h5>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground leading-tight">
                                                {info.errors[0] || "N/A"}
                                            </p>
                                        </section>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 pt-4 border-t border-border/50">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
                                        <span className="text-[10px] font-black uppercase text-muted-foreground">Configuración Avanzada (JSON)</span>
                                    </div>
                                </div>
                                <div className="mt-3">
                                    <RuleMetaEditor
                                        rule={rule}

                                        onSave={async (id, meta) => await updateRuleMeta(id, meta)}
                                    />
                                </div>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
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
