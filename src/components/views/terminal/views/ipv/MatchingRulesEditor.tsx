'use client';

import React, { useState } from 'react';
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
import { ResetMatchingModal } from "./ResetMatchingModal";
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
        "scenarios": [
            "Venta de 'Cerveza 355ml': Si el stock virtual es 0, la regla HARD_REF o EXACT_SUM ignorará este producto aunque el precio coincida."
        ],
        "interaction": "Afecta a todas las reglas que asignan productos (HARD_REF, EXACT_SUM, WILDCARDS). Si falla, el monto restante pasa a la siguiente regla.",
        "errors": [
            "Error de inventario: Si el stock real no coincide con el sistema, el matching será incorrecto.",
            "Bloqueo total: Si no hay stock de nada, ninguna regla de producto podrá ejecutarse."
        ]
    },
    "HARD_REF": {
        "trigger": "Se activa cuando una transacción bancaria contiene texto que coincide con el código de un producto o referencia específica.",
        "setup": [
            "Código de producto (SKU) definido en catálogo",
            "Observaciones en el mensaje bancario (ej: 'PAGO REF 102')",
            "Integraciones (Comodia) que envíen la referencia en la metadata"
        ],
        "logic": [
            "Escanea el campo de observaciones de la transacción.",
            "Busca coincidencias exactas con el campo 'cod' de los productos activos.",
            "Calcula cuántas unidades del producto caben en el importe total de la transacción.",
            "Crea una línea de conciliación vinculada a ese producto específico."
        ],
        "result": "Matching inmediato con confianza del 100%. El estado de la transacción cambia a 'COMPLETO' si el importe se cubre totalmente.",
        "scenarios": [
            "Transferencia con nota 'Cerveza-Premium': El sistema detecta el código 'Cerveza-Premium' y asigna la cantidad correspondiente al monto transferido."
        ],
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
            "Transferencia de $1500: El sistema encuentra que Pollo ($1200) + Refresco ($300) = $1500 exactos. Asigna ambos productos."
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
            "Transferencia de $99.50: El producto cuesta $100. Con 0.5% de flexibilidad, el sistema lo acepta como un match válido."
        ],
        "interaction": "Ayuda a EXACT_SUM a finalizar cuando hay diferencias mínimas de céntimos.",
        "errors": [
            "Distorsión de costos: Si el margen es muy alto, los reportes de rentabilidad pueden verse afectados."
        ]
    },
    "CASH_FILL": {
        "trigger": "Se activa para cerrar diferencias residuales mediante inyección de efectivo.",
        "setup": [
            "Productos marcados como 'Elegibles para Cash Filler' en el catálogo",
            "Configuración de límite diario y umbral por transacción"
        ],
        "logic": [
            "Aplica la estrategia de 'Ajuste Óptimo' (Min Fit).",
            "Busca el producto activo que requiera la menor inyección de efectivo posible (Precio - Saldo transferido).",
            "Genera una línea compuesta (Transferencia + Efectivo) para el producto elegido.",
            "Respeta los límites de efectivo diarios configurados por el usuario."
        ],
        "result": "Garantiza que las transacciones queden 100% conciliadas minimizando el uso de efectivo 'artificial'.",
        "scenarios": [
            "Restante de $900: El sistema elige un producto de $950 (inyectando $50) en lugar de uno de $1500 (inyectando $600)."
        ],
        "interaction": "Se ejecuta después de las sumas exactas para cerrar operaciones que de otro modo quedarían parciales.",
        "errors": [
            "Límite excedido: Si se agota el presupuesto de efectivo diario configurado.",
            "Sin productos: Si no hay productos activos cuyos precio sea superior al remante."
        ]
    },
    "WILDCARDS": {
        "trigger": "Se activa como red de seguridad para asignar transferencias a productos genéricos.",
        "setup": [
            "Productos marcados con el flag 'isWildcardCandidate' (ej: 'Venta Diversa')",
            "Stock disponible en el producto comodín"
        ],
        "logic": [
            "Identifica productos comodín en el catálogo.",
            "Calcula la cantidad necesaria para cubrir o acercarse al monto restante.",
            "Prioriza productos con menor stock para balancear inventario."
        ],
        "result": "Evita que el monto transferido quede sin asignar, usando ítems de 'relleno' definidos por el usuario.",
        "scenarios": [
            "Quedan $50 de transferencia: Se asigna 1 unidad de 'Venta Diversa' ($50) para cerrar la operación."
        ],
        "interaction": "Penúltima instancia antes de la auto-suplencia.",
        "errors": [
            "Sin stock: Si los productos comodín también se agotan."
        ]
    },
    "TOLERANCE": {
        "trigger": "Se activa al final del pipeline si queda un residuo despreciable.",
        "setup": [
            "Monto de tolerancia configurado (ej: 100 centavos)"
        ],
        "logic": [
            "Compara el residuo final contra el límite de tolerancia.",
            "Si es menor o igual, marca la transacción como 'COMPLETO'.",
            "No genera líneas adicionales, simplemente acepta la pequeña diferencia."
        ],
        "result": "Limpia ruidos visuales de céntimos en los reportes finales.",
        "scenarios": [
            "Diferencia de $0.05: El sistema la ignora y la transacción pasa a estado Cuadrado."
        ],
        "interaction": "Es el filtro de precisión final.",
        "errors": [
            "Pérdida agregada: Si la tolerancia es muy alta, el acumulado mensual podría desviarse."
        ]
    },
    "AUTO_SUPPLY": {
        "trigger": "Se activa automáticamente cuando la transferencia supera el costo de los productos identificados.",
        "setup": [
            "Regla habilitada en el panel de control",
            "Productos activos con precio > 0"
        ],
        "logic": [
            "Detecta el excedente de dinero en la transferencia bancaria.",
            "Busca productos disponibles en el catálogo para 'agotar' ese saldo sobrante.",
            "Prioriza productos con stock bajo para limpieza de inventario.",
            "Genera líneas de conciliación automáticas marcadas como sobrepago."
        ],
        "result": "Mantiene el balance de caja al 100% incluso en sobrepagos, asignando mercancía de forma inteligente.",
        "scenarios": [
            "Cliente paga $1200 por algo de $1000: El sistema añade un producto de $200 para equilibrar el ingreso."
        ],
        "interaction": "Se ejecuta al final del ciclo de matching solo si hay excedente.",
        "errors": [
            "Sin inventario: Si no hay productos disponibles para cubrir el sobrepago."
        ]
    }
};

interface SortableRuleItemProps {
    rule: MatchingRule;
    toggleRule: (id: string, active: boolean) => Promise<void>;
    usageCount: number;
    updateRuleMeta: (id: string, meta: any) => Promise<void>;
    updatePriority: (id: string, newPriority: number) => Promise<void>;
    totalRules: number;
}

function SortableRuleItem({ rule, toggleRule, usageCount, updateRuleMeta, updatePriority, totalRules }: SortableRuleItemProps) {
    const info = RULE_DESCRIPTIONS[rule.tipo.replace(' ', '_')] || { trigger: "N/A", setup: [], logic: [], result: "N/A", scenarios: [], interaction: "N/A", errors: [] };

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
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} className={cn(
            "group relative mb-4 last:mb-0",
            isDragging && "z-50 opacity-50"
        )}>
            <Card className={cn(
                "overflow-hidden border-primary/10 shadow-sm hover:shadow-md transition-all duration-300",
                !rule.activo && "opacity-60 bg-muted/30 grayscale-[0.5]",
                rule.activo && "hover:border-primary/30"
            )}>
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value={rule.id} className="border-none">
                        <div className="flex items-center gap-4 px-4 py-3 bg-muted/20 border-b border-primary/5">
                            <div {...listeners} className="cursor-grab active:cursor-grabbing p-1.5 hover:bg-primary/10 rounded-md transition-colors">
                                <GripVertical className="w-4 h-4 text-muted-foreground/60" />
                            </div>

                            <div className="flex flex-col flex-1">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-black uppercase tracking-wide text-foreground">
                                        { {
                                        'STOCK_LIMIT': 'Límites de Inventario',
                                        'HARD_REF': 'Referencia Exacta',
                                        'EXACT_SUM': 'Suma Combinatoria',
                                        'CASH_FILL': 'Inyección de Efectivo',
                                        'WILDCARDS': 'Comodines Genéricos',
                                        'PRICE_FLEX': 'Flexibilidad de Precio',
                                        'AUTO_SUPPLY': 'Auto-Suplencia',
                                        'TOLERANCE': 'Tolerancia de Cuadre'
                                    }[rule.tipo.replace(/\s+/g, "_").toUpperCase()] || rule.tipo }
                                    </h4>                                    {info.logic.length > 0 && (
                                        <Badge variant="outline" className="ml-2 border-emerald-500/30 text-emerald-600 bg-emerald-500/5 text-[8px] font-black uppercase py-0 px-1">
                                            Documentado
                                        </Badge>
                                    )}
                                    {rule.id.includes('copiloto') && (
                                        <Badge variant="outline" className="bg-primary/5 text-primary text-[9px] h-4 border-primary/20 px-1 font-black">
                                            COPILOTO
                                        </Badge>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 bg-background/50 px-2 py-1 rounded-md border border-primary/5">
                                    <span className="text-[10px] font-black text-muted-foreground uppercase">Uso</span>
                                    <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] font-mono h-5">
                                        {usageCount}
                                    </Badge>
                                </div>

                                <div className="flex items-center gap-2 bg-background/50 px-2 py-1 rounded-md border border-primary/5">
                                    <span className="text-[10px] font-black text-muted-foreground uppercase">Prioridad</span>
                                    <select
                                        value={rule.prioridad}
                                        onChange={(e) => updatePriority(rule.id, Number(e.target.value))}
                                        className="text-xs font-mono bg-transparent outline-none border-none cursor-pointer text-primary"
                                    >
                                        {Array.from({ length: Math.max(10, totalRules) }, (_, i) => i + 1).map(p => (
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
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const rules = useLiveQuery(() => db.matching_rules.orderBy('prioridad').toArray());
  const settings = useLiveQuery(() => db.ipv_settings.get("current"));

  // Conteo de transacciones por estado
  const stats = useLiveQuery(async () => {
    const transactions = await db.bank_statements.filter(t => t.tipo !== "Db").toArray();
    return {
        total: transactions.length,
        pendientes: transactions.filter(t => t.estado_conciliacion === "PENDIENTE" && (!t.applied_rules || t.applied_rules.length === 0)).length,
        parciales: transactions.filter(t => t.estado_conciliacion === "PARCIAL" || (t.estado_conciliacion === "PENDIENTE" && (t.applied_rules?.length ?? 0) > 0)).length,
        completas: transactions.filter(t => t.estado_conciliacion === "COMPLETO").length
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
      {/* Herramientas de Gestión */}
      <Card className="p-4 bg-muted/30 border-dashed border-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
            <div className="p-2 bg-background rounded-lg border shadow-sm">
                <Workflow className="w-5 h-5 text-primary" />
            </div>
            <div>
                <h4 className="text-xs font-black uppercase tracking-tight">Herramientas de Gestión</h4>
                <p className="text-[10px] text-muted-foreground">Mantenimiento y limpieza del motor de conciliación.</p>
            </div>
        </div>
        <div className="flex items-center gap-2">
            <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsResetModalOpen(true)}
                className="neu-btn text-[10px] font-black uppercase flex items-center gap-2 shadow-sm"
            >
                <RefreshCcw className="w-3 h-3" />
                Resetear Matching
            </Button>
            <div className="w-px h-6 bg-border mx-2" />
             <Button
                variant="outline"
                size="sm"
                onClick={initializeDefaultRules}
                className="neu-btn text-[10px] font-black uppercase"
            >
                Reinstalar Reglas de Fábrica
            </Button>
        </div>
      </Card>


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
            {!rules || rules.length === 0 && (
              <Button onClick={initializeDefaultRules} className="neu-btn-primary">
                Inicializar Motor
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
