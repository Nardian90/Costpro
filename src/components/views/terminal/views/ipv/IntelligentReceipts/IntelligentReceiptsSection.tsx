import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Play, RotateCcw, Save, Loader2, Wand2 } from 'lucide-react';
import { reconstruirRecepciones, aplicarRecepciones, SimulationResult } from '@/lib/ipv/intelligentEngine';
import { SimulationPreview } from './SimulationPreview';
import { AppliedReceiptsHistory } from './AppliedReceiptsHistory';
import { toast } from 'sonner';
import { recalculateIPVReportsChain } from '@/lib/ipv/utils';
import { db } from '@/lib/dexie';

export function IntelligentReceiptsSection() {
    const [mode, setMode] = useState<'A' | 'B' | 'C'>('B');
    const [isSimulating, setIsSimulating] = useState(false);
    const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
    const [isApplying, setIsApplying] = useState(false);

    const handleSimulate = async () => {
        setIsSimulating(true);
        try {
            // Get date range from current context? Or let user pick?
            // For now, use last 30 days as default or current period
            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];

            const result = await reconstruirRecepciones(startDate, endDate, mode);
            setSimulationResult(result);
            toast.success("Simulación completada con éxito");
        } catch (error) {
            console.error(error);
            toast.error("Error al ejecutar la simulación");
        } finally {
            setIsSimulating(false);
        }
    };

    const handleApply = async () => {
        if (!simulationResult || simulationResult.receipts.length === 0) return;

        setIsApplying(true);
        try {
            await aplicarRecepciones(simulationResult.receipts);
            await recalculateIPVReportsChain(db);
            toast.success(`${simulationResult.receipts.length} recepciones aplicadas correctamente`);
            setSimulationResult(null);
        } catch (error) {
            console.error(error);
            toast.error("Error al aplicar las recepciones");
        } finally {
            setIsApplying(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                    <h2 className="text-3xl font-black tracking-tight">Recepciones Inteligentes</h2>
                    <p className="text-muted-foreground">Motor de ingeniería inversa para reconstrucción de inventario.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSimulationResult(null)} disabled={isSimulating || isApplying}>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reset
                    </Button>
                    <Button
                        onClick={handleSimulate}
                        disabled={isSimulating || isApplying}
                        className="bg-primary text-primary-foreground font-bold"
                    >
                        {isSimulating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                        Simular
                    </Button>
                    <Button
                        variant="default"
                        onClick={handleApply}
                        disabled={!simulationResult || isApplying || simulationResult.receipts.length === 0}
                        className="font-bold bg-green-600 hover:bg-green-700 text-white"
                    >
                        {isApplying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        Aplicar Cambios
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
                    <Card className="border-2 border-primary/10 shadow-lg">
                        <CardHeader>
                            <CardTitle>Configuración del Motor</CardTitle>
                            <CardDescription>
                                Seleccione el modo de operación antes de ejecutar la simulación.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

                                <div className="bg-muted/50 p-4 rounded-xl space-y-2 border border-dashed flex flex-col justify-center">
                                    <div className="flex items-center gap-2 text-xs font-black text-primary uppercase">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Regla de Redondeo
                                    </div>
                                    <p className="text-xs">
                                        Se aplica redondeo a múltiplos de 10 sobre la demanda total detectada para optimizar logística.
                                    </p>
                                </div>

                                <div className="bg-muted/50 p-4 rounded-xl space-y-2 border border-dashed flex flex-col justify-center">
                                    <div className="flex items-center gap-2 text-xs font-black text-primary uppercase">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Jerarquía Greedy
                                    </div>
                                    <p className="text-xs">
                                        El sistema prioriza unidades mayores (Cajas/Paquetes) para minimizar movimientos operativos.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

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

function History({ className }: { className?: string }) {
    return <RotateCcw className={className} />;
}

function CheckCircle2({ className }: { className?: string }) {
    return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
}
