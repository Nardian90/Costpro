import React, { useState, useEffect, useRef } from 'react';
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
    DollarSign,
    RotateCcw
} from 'lucide-react';
import { useFinancialPlanning } from '@/hooks/logic/useFinancialPlanning';
import { formatCurrencyCents } from '@/lib/utils';
import { db } from '@/lib/dexie';
import { MatchingEngine } from '@/lib/ipv/engine';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { debounce } from 'lodash';

const VERSION = "2.0";

export const FinancialPlanningView: React.FC = () => {
    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(currentYear);
    const { goals, realData, initYear, updateMonthlyGoal } = useFinancialPlanning(year);
    const products = useLiveQuery(() => db.products.toArray());
    const rules = useLiveQuery(() => db.matching_rules.toArray());
    const [editingGoal, setEditingGoal] = useState<{month: string, amount: string, strategy: "MIN_STOCK" | "MAX_VALUE"} | null>(null);

    const [simulations, setSimulations] = useState<Record<string, string>>(() => {
        try {
            const saved = localStorage.getItem('IPV_PLANEACION_SIMULATIONS_V' + VERSION);
            return saved ? JSON.parse(saved) : {};
        } catch {
            return {};
        }
    });

    const debouncedFnRef = useRef(debounce((newSims: Record<string, string>) => {
        localStorage.setItem('IPV_PLANEACION_SIMULATIONS_V' + VERSION, JSON.stringify(newSims));
    }, 300));

    const handleSimulationChange = (month: string, value: string) => {
        const newSims = { ...simulations, [month]: value };
        setSimulations(newSims);
        debouncedFnRef.current(newSims);
    };

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

    const handleSimulateMonthGoal = async (month: string, amount: number) => {
        if (!products || amount <= 0) return;

        toast.loading('Ejecutando simulación...', { id: 'month-sim' });
        try {
            const engine = new MatchingEngine(products as any, rules || []);
            const transactions = await db.bank_statements.where('fecha').startsWith(month).toArray();
            const dates = Array.from(new Set(transactions.map(t => t.fecha)));

            if (dates.length === 0) {
                toast.error('No hay transacciones para simular', { id: 'month-sim' });
                return;
            }

            const monthReal = realData.get(month) || { total: 0 };
            const extraLines = await engine.distributeGlobalGoal(amount, monthReal.total, dates);

            if (extraLines.length > 0) {
                await db.reconciliation_lines.bulkAdd(extraLines);
                toast.success(`${extraLines.length} líneas generadas`, { id: 'month-sim' });
            } else {
                toast.warning('Objetivo ya alcanzado', { id: 'month-sim' });
            }
        } catch (error) {
            toast.error('Error en simulación', { id: 'month-sim' });
        }
    };

    const handleResetMonthSimulation = async (month: string) => {
        toast.loading('Reiniciando...', { id: 'reset-sim' });
        try {
            const linesToDelete = await db.reconciliation_lines
                .where('fecha_operacion')
                .startsWith(month)
                .filter(l => l.source_type === 'REAL_CASH_GOAL' || l.transaction_ref.startsWith('GOAL-'))
                .toArray();

            if (linesToDelete.length > 0) {
                await db.reconciliation_lines.bulkDelete(linesToDelete.map(l => l.id));
                toast.success('Simulación reiniciada', { id: 'reset-sim' });
            } else {
                toast.info('Sin líneas para eliminar', { id: 'reset-sim' });
            }
        } catch (error) {
            toast.error('Error al reiniciar', { id: 'reset-sim' });
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
                </div>

                <Card className="flex items-center gap-2 p-1 bg-muted/50 border-none shadow-inner rounded-xl">
                    <Button variant="ghost" size="icon" onClick={() => setYear(year - 1)} className="h-8 w-8">
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="px-4 font-black text-sm">{year}</span>
                    <Button variant="ghost" size="icon" onClick={() => setYear(year + 1)} className="h-8 w-8">
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6 bg-primary/5 border-primary/10 flex flex-col justify-between rounded-2xl">
                    <div>
                        <p className="text-[10px] font-black uppercase text-primary/60 mb-1">Objetivo Anual</p>
                        <h3 className="text-4xl font-black tracking-tighter text-primary">
                            {formatCurrencyCents(totalYearly)}
                        </h3>
                    </div>
                </Card>

                <Card className="md:col-span-2 p-6 bg-muted/5 border-none rounded-2xl">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {goals.map((g) => {
                            const monthName = new Date(g.month + "-01").toLocaleDateString('es-ES', { month: 'long' });
                            const isEditing = editingGoal?.month === g.month;
                            const monthReal = realData.get(g.month) || { total: 0, efectivo: 0, transferencia: 0 };

                            return (
                                <Card key={g.month} className="p-4 hover:shadow-md transition-all group relative overflow-hidden flex flex-col gap-3 rounded-xl">
                                    <div className="flex justify-between items-start">
                                        <p className="text-[10px] font-black uppercase text-muted-foreground">{monthName}</p>
                                        <Button variant="ghost" size="sm" className="h-5 px-1 hover:text-red-500" onClick={() => handleResetMonthSimulation(g.month)}>
                                            <RotateCcw className="w-3 h-3" />
                                        </Button>
                                    </div>

                                    <div className="space-y-1 bg-muted/30 p-2 rounded-lg text-[10px] font-black uppercase">
                                        <div className="flex justify-between">
                                            <span className="opacity-50">Real Total</span>
                                            <span>{formatCurrencyCents(monthReal.total)}</span>
                                        </div>
                                        <div className="flex justify-between opacity-50">
                                            <span>Efectivo</span>
                                            <span>{formatCurrencyCents(monthReal.efectivo)}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-2 pt-2 border-t">
                                        {isEditing ? (
                                            <div className="space-y-2">
                                                <Input
                                                    type="number"
                                                    value={editingGoal.amount}
                                                    onChange={(e) => setEditingGoal({...editingGoal, amount: e.target.value})}
                                                    className="h-8 text-[11px] font-black"
                                                />
                                                <div className="flex gap-1">
                                                    <Button size="sm" className="h-7 flex-1 text-[9px] font-black uppercase" onClick={() => { handleSimulationChange(g.month, editingGoal.amount); handleSaveGoal(g.month); }}>Guardar</Button>
                                                    <Button size="sm" variant="outline" className="h-7 text-[9px] font-black uppercase" onClick={() => setEditingGoal(null)}>X</Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <div role="button" tabIndex={0} className="flex justify-between items-baseline cursor-pointer hover:bg-muted/40 active:scale-[0.98] rounded-lg -mx-1 px-1 transition-all" onClick={() => setEditingGoal({month: g.month, amount: (simulations[g.month] || g.goalAmount).toString(), strategy: g.strategy || "MIN_STOCK"})} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditingGoal({month: g.month, amount: (simulations[g.month] || g.goalAmount).toString(), strategy: g.strategy || "MIN_STOCK"}); } }}>
                                                    <p className="text-xs font-black">{formatCurrencyCents(Number(simulations[g.month]) || g.goalAmount)}</p>
                                                </div>
                                                <Button variant="outline" className="w-full h-8 text-[10px] font-black uppercase border-primary/30" onClick={() => handleSimulateMonthGoal(g.month, Number(simulations[g.month]) || g.goalAmount)}>
                                                    Simular
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                </Card>
            </div>
        </div>
    );
};
