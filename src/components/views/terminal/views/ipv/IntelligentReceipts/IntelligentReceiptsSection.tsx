import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Play, RotateCcw, Save, Loader2, Wand2, History, Settings2, Calculator, AlertCircle, Info } from 'lucide-react';
import { reconstruirRecepciones, aplicarRecepciones, SimulationResult } from '@/lib/ipv/intelligentEngine';
import { calculateCosts, validateMargins, CostEngineConfig, CostEngineMode } from '@/lib/ipv/costEngine';
import { SimulationPreview } from './SimulationPreview';
import { AppliedReceiptsHistory } from './AppliedReceiptsHistory';
import { toast } from 'sonner';
import { recalculateIPVReportsChain } from '@/lib/ipv/utils';
import { db, Product } from '@/lib/dexie';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function IntelligentReceiptsSection() {
    const [mode, setMode] = useState<'A' | 'B' | 'C'>('B');
    const [isSimulating, setIsSimulating] = useState(false);
    const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
    const [isApplying, setIsApplying] = useState(false);

    // Cost Engine State
    const [costMode, setCostMode] = useState<CostEngineMode>('PERCENTAGE');
    const [costValue, setCostValue] = useState<string>("0.60");
    const [isCalculatingCosts, setIsCalculatingCosts] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [marginValidations, setMarginValidations] = useState<{isValid: boolean, message?: string, type: string}[]>([]);

    useEffect(() => {
        db.products.toArray().then(setProducts);
    }, []);

    const handleSimulate = async () => {
        setIsSimulating(true);
        try {
            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];

            const result = await reconstruirRecepciones(startDate, endDate, mode);
            setSimulationResult(result);
            setMarginValidations([]);
            toast.success("Simulación de stock completada");
        } catch (error) {
            console.error(error);
            toast.error("Error al ejecutar la simulación");
        } finally {
            setIsSimulating(false);
        }
    };

    const handleCalculateCosts = () => {
        if (!simulationResult) return;
        setIsCalculatingCosts(true);
        try {
            const config: CostEngineConfig = {
                type: costMode,
                value: parseFloat(costValue),
                usuario_id: "system" // Fallback as decided
            };

            const receiptsWithCosts = calculateCosts(simulationResult.receipts, products, config);
            const validations = validateMargins(receiptsWithCosts, products);

            setSimulationResult({
                ...simulationResult,
                receipts: receiptsWithCosts
            });
            setMarginValidations(validations);

            if (validations.some(v => v.type === 'ERROR')) {
                toast.error("Se detectaron márgenes negativos. Operación bloqueada.");
            } else {
                toast.success("Costos calculados y validados");
            }
        } catch (error: any) {
            toast.error(error.message || "Error al calcular costos");
        } finally {
            setIsCalculatingCosts(false);
        }
    };

    const handleApply = async () => {
        if (!simulationResult || simulationResult.receipts.length === 0) return;

        // Verificar que se hayan calculado los costos
        const hasCosts = simulationResult.receipts.every(r => r.costo_unitario_cents !== undefined);
        if (!hasCosts) {
            toast.error("Debe calcular los costos antes de aplicar la recepción.");
            return;
        }

        // Bloquear si hay errores críticos
        if (marginValidations.some(v => v.type === 'ERROR')) {
            toast.error("No se puede aplicar con márgenes negativos.");
            return;
        }

        setIsApplying(true);
        try {
            await aplicarRecepciones(simulationResult.receipts);
            await recalculateIPVReportsChain(db);
            toast.success(`${simulationResult.receipts.length} recepciones aplicadas correctamente con sus costos`);
            setSimulationResult(null);
            setMarginValidations([]);
        } catch (error) {
            console.error(error);
            toast.error("Error al aplicar las recepciones");
        } finally {
            setIsApplying(false);
        }
    };

    const isBlockedByMargin = marginValidations.some(v => v.type === 'ERROR');

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                    <h2 className="text-3xl font-black tracking-tight">Recepciones Inteligentes</h2>
                    <p className="text-muted-foreground">Motor de ingeniería inversa para reconstrucción de inventario y costeo.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { setSimulationResult(null); setMarginValidations([]); }} disabled={isSimulating || isApplying}>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reset
                    </Button>
                    <Button
                        onClick={handleSimulate}
                        disabled={isSimulating || isApplying}
                        className="bg-primary text-primary-foreground font-bold"
                    >
                        {isSimulating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                        1. Simular Stock
                    </Button>
                    <Button
                        variant="default"
                        onClick={handleApply}
                        disabled={!simulationResult || isApplying || simulationResult.receipts.length === 0 || isBlockedByMargin}
                        className="font-bold bg-green-600 hover:bg-green-700 text-white"
                    >
                        {isApplying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        3. Aplicar Cambios
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="engine" className="w-full">
                <TabsList className="grid w-full grid-cols-2 max-w-md">
                    <TabsTrigger value="engine" className="font-bold">
                        <Wand2 className="w-4 h-4 mr-2" />
                        Motor
                    </TabsTrigger>
                    <TabsTrigger value="history" className="font-bold">
                        <History className="w-4 h-4 mr-2" />
                        Historial
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="engine" className="space-y-6 mt-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="border-2 border-primary/10 shadow-lg">
                            <CardHeader className="pb-3">
                                <div className="flex items-center gap-2">
                                    <Settings2 className="w-5 h-5 text-primary" />
                                    <CardTitle>Configuración del Motor</CardTitle>
                                </div>
                                <CardDescription>
                                    Seleccione el modo de operación para la simulación de stock.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-sm font-bold uppercase tracking-tighter opacity-70">Modo de Operación</Label>
                                        <Select value={mode} onValueChange={(v: any) => setMode(v)}>
                                            <SelectTrigger className="h-12 border-2 font-bold">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="A" className="font-bold">Modo A: Solo Ventas (Clean Slate)</SelectItem>
                                                <SelectItem value="B" className="font-bold">Modo B: Ventas + Recepciones (Diferencial)</SelectItem>
                                                <SelectItem value="C" className="font-bold">Modo C: Objetivo de Stock (Cuadre Final)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-[11px] text-muted-foreground">
                                            {mode === 'A' && "Ignora recepciones manuales. Reconstruye todo desde ventas."}
                                            {mode === 'B' && "Respeta recepciones manuales. Solo corrige faltantes (negativos)."}
                                            {mode === 'C' && "Ajusta inventario para alcanzar un stock objetivo al final del periodo."}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-muted/50 p-3 rounded-xl border border-dashed">
                                            <div className="text-[10px] font-black text-primary uppercase mb-1">Redondeo</div>
                                            <p className="text-[10px] leading-tight">Múltiplos de 10 sobre demanda total.</p>
                                        </div>
                                        <div className="bg-muted/50 p-3 rounded-xl border border-dashed">
                                            <div className="text-[10px] font-black text-primary uppercase mb-1">Jerarquía</div>
                                            <p className="text-[10px] leading-tight">Prioriza unidades mayores (BOX/PACK).</p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-2 border-primary/10 shadow-lg">
                            <CardHeader className="pb-3">
                                <div className="flex items-center gap-2">
                                    <Calculator className="w-5 h-5 text-primary" />
                                    <CardTitle>Motor de Costos</CardTitle>
                                </div>
                                <CardDescription>
                                    Defina las reglas de cálculo de costos para esta recepción.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-sm font-bold uppercase tracking-tighter opacity-70">Método</Label>
                                            <Select value={costMode} onValueChange={(v: any) => setCostMode(v)}>
                                                <SelectTrigger className="h-11 border-2 font-bold">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="PERCENTAGE" className="font-bold">Porcentaje</SelectItem>
                                                    <SelectItem value="TARGET_PROFIT" className="font-bold">Utilidad Objetivo</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-sm font-bold uppercase tracking-tighter opacity-70">
                                                {costMode === 'PERCENTAGE' ? 'Porcentaje (0-1)' : 'Monto (Cents)'}
                                            </Label>
                                            <Input
                                                type="number"
                                                step={costMode === 'PERCENTAGE' ? "0.01" : "100"}
                                                value={costValue}
                                                onChange={(e) => setCostValue(e.target.value)}
                                                className="h-11 border-2 font-bold"
                                            />
                                        </div>
                                    </div>

                                    <Button
                                        onClick={handleCalculateCosts}
                                        disabled={!simulationResult || isCalculatingCosts}
                                        className="w-full h-12 font-black uppercase tracking-widest text-xs gap-2"
                                    >
                                        <Calculator className="w-4 h-4" />
                                        2. Calcular y Validar Costos
                                    </Button>

                                    {marginValidations.length > 0 && (
                                        <div className="space-y-2 max-h-[100px] overflow-y-auto">
                                            {marginValidations.map((v, i) => (
                                                <div key={i} className={`text-[10px] font-bold p-2 rounded-lg flex items-center gap-2 ${v.type === 'ERROR' ? 'bg-destructive/10 text-destructive' : 'bg-yellow-500/10 text-yellow-600'}`}>
                                                    {v.type === 'ERROR' ? <AlertCircle className="w-3 h-3" /> : <Info className="w-3 h-3" />}
                                                    {v.message}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {simulationResult ? (
                        <SimulationPreview
                            receipts={simulationResult.receipts}
                            stockImpact={simulationResult.stockImpact}
                            correctedProducts={simulationResult.correctedProducts}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground bg-muted/20 rounded-3xl border-2 border-dashed border-muted">
                            <Wand2 className="w-16 h-16 mb-4 opacity-20" />
                            <h3 className="text-xl font-bold">Sin Simulación Activa</h3>
                            <p className="text-sm">Configure el modo y haga clic en "Simular" para previsualizar los cambios.</p>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                    <AppliedReceiptsHistory />
                </TabsContent>
            </Tabs>
        </div>
    );
}
