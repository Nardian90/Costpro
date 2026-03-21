import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    TrendingUp,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Save,
    PlayCircle,
    Target,
    BarChart3,
    Database,
    Package
} from 'lucide-react';
import { useFinancialPlanning } from '@/hooks/logic/useFinancialPlanning';
import { useSimulationConfig } from '@/hooks/logic/useSimulationConfig';
import { formatCurrency } from '@/lib/utils';
import { db, type Product, type MatchingRule } from '@/lib/dexie';
import { MatchingEngine } from '@/lib/ipv/engine';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';

export const FinancialPlanningView: React.FC = () => {
    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(currentYear);
    const { goals, initYear, updateMonthlyGoal } = useFinancialPlanning(year);
    const products = useLiveQuery(() => db.products.toArray());
    const rules = useLiveQuery(() => db.matching_rules.toArray());
    const [editingGoal, setEditingGoal] = useState<{month: string, amount: string, strategy: "MIN_STOCK" | "MAX_VALUE"} | null>(null);

    useEffect(() => {
        initYear();
    }, [year]);

    const handleSaveGoal = async (month: string) => {
        if (!editingGoal) return;
        try {
            await updateMonthlyGoal(month, Number(editingGoal.amount), editingGoal.strategy);
            setEditingGoal(null);
            toast.success('Objetivo actualizado');
        } catch (error) {
            toast.error('Error al actualizar objetivo');
        }
    };

    const handleSimulateMonthGoal = async (month: string, amount: number, strategy: "MIN_STOCK" | "MAX_VALUE" = "MIN_STOCK") => {
        if (!products || amount <= 0) return;

        toast.loading('Ejecutando simulación global para el mes...', { id: 'month-sim' });
        try {
            const engine = new MatchingEngine(products as any, rules || []);
            // Encontrar días del mes con transferencias
            const transactions = await db.bank_statements
                .where('fecha')
                .startsWith(month)
                .toArray();

            const dates = Array.from(new Set(transactions.map(t => t.fecha)));
            if (dates.length === 0) {
                toast.error('No hay transacciones en el periodo para simular', { id: 'month-sim' });
                return;
            }

            const currentTotal = 0; // Se puede mejorar calculando el total actual conciliado del mes
            const extraLines = await engine.distributeGlobalGoal(amount, currentTotal, dates, { strategy });

            if (extraLines.length > 0) {
                await db.reconciliation_lines.bulkAdd(extraLines);
                toast.success(`${extraLines.length} líneas generadas para cuadrar el mes`, { id: 'month-sim' });
            } else {
                toast.warning('No se pudo distribuir el objetivo', { id: 'month-sim' });
            }
        } catch (error) {
            console.error(error);
            toast.error('Error en simulación global', { id: 'month-sim' });
        }
    };

    const totalYearly = goals.reduce((acc, g) => acc + g.goalAmount, 0);

    return (
        <div className="p-6 space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase flex items-center gap-3">
                        <Target className="w-8 h-8 text-primary" />
                        Planeación Financiera
                    </h2>
                    <p className="text-muted-foreground font-bold uppercase text-xs tracking-widest">
                        Gestión de objetivos anuales y mensuales
                    </p>
                </div>

                <Card className="flex items-center gap-2 p-1 bg-muted/50 border-none shadow-inner">
                    <Button variant="ghost" size="icon" onClick={() => setYear(year - 1)} className="h-8 w-8 hover:bg-background">
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="px-4 font-black text-sm">{year}</span>
                    <Button variant="ghost" size="icon" onClick={() => setYear(year + 1)} className="h-8 w-8 hover:bg-background">
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6 bg-primary/5 border-primary/10 flex flex-col justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase text-primary/60 mb-1">Objetivo Total Anual</p>
                        <h3 className="text-4xl font-black tracking-tighter text-primary">
                            {formatCurrency(totalYearly)}
                        </h3>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-xs font-bold text-primary/60 uppercase">
                        <BarChart3 className="w-4 h-4" />
                        Basado en {goals.length} meses
                    </div>
                </Card>

                <Card className="md:col-span-2 p-6 bg-muted/5 border-none">
                    <div className="flex items-center gap-2 mb-4">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Distribución Mensual</h4>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {goals.map((g) => {
                            const monthName = new Date(g.month + "-01").toLocaleDateString('es-ES', { month: 'long' });
                            const isEditing = editingGoal?.month === g.month;

                            return (
                                <Card key={g.month} className="p-3 hover:shadow-md transition-all group relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary transition-colors" />
                                    <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">{monthName}</p>

                                    {isEditing ? (
                                        <div className="space-y-2">
                                            <Input
                                                type="number"
                                                value={editingGoal.amount}
                                                onChange={(e) => setEditingGoal({...editingGoal, amount: e.target.value})}
                                                className="h-8 text-[10px] font-black"
                                                autoFocus
                                            />
                                            <select
                                                value={editingGoal.strategy}
                                                onChange={(e) => setEditingGoal({...editingGoal, strategy: e.target.value as any})}
                                                className="w-full h-8 rounded-md border border-input bg-background px-2 py-1 text-[10px] font-bold uppercase"
                                            >
                                                <option value="MIN_STOCK">MIN EXISTENCIA</option>
                                                <option value="MAX_VALUE">MAX SALDO</option>
                                            </select>
                                            <div className="flex gap-1">
                                                <Button size="sm" className="h-6 flex-1 text-[9px] font-black uppercase" onClick={() => handleSaveGoal(g.month)}>
                                                    <Save className="w-3 h-3 mr-1" /> Guardar
                                                </Button>
                                                <Button size="sm" variant="outline" className="h-6 flex-1 text-[9px] font-black uppercase" onClick={() => setEditingGoal(null)}>
                                                    X
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <p className="text-sm font-black cursor-pointer" onClick={() => setEditingGoal({month: g.month, amount: g.goalAmount.toString(), strategy: g.strategy || "MIN_STOCK"})}>
                                                {formatCurrency(g.goalAmount)}
                                            </p>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[8px] font-black text-muted-foreground uppercase opacity-60">
                                                    {g.strategy === 'MAX_VALUE' ? 'MAX SALDO' : 'MIN EXISTENCIA'}
                                                </span>
                                                <Button
                                                    variant="ghost"
                                                    className="w-full h-7 text-[10px] font-black uppercase gap-1 hover:bg-primary/10 text-primary"
                                                    onClick={() => handleSimulateMonthGoal(g.month, g.goalAmount, g.strategy)}
                                                    disabled={g.goalAmount <= 0}
                                                >
                                                    <PlayCircle className="w-3 h-3" /> Simular
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </Card>
                            );
                        })}
                    </div>
                </Card>
            </div>

            <Card className="p-8 border-dashed flex flex-col items-center justify-center text-center space-y-4 bg-muted/5">
                <div className="p-4 bg-primary/10 rounded-full">
                    <TrendingUp className="w-8 h-8 text-primary" />
                </div>
                <div className="max-w-md">
                    <h3 className="font-black uppercase text-sm">Integridad Predictiva</h3>
                    <p className="text-xs text-muted-foreground font-medium">
                        Define tus objetivos mensuales para alimentar el motor de simulación.
                        La simulación se aplicará al periodo de transacciones correspondiente.
                    </p>
                </div>
            </Card>
        </div>
    );
};
