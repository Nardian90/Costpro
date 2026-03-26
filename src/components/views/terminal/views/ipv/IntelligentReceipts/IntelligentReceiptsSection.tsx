import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Play, RotateCcw, Save, Loader2, Wand2, History, Settings2, Calculator, AlertCircle, Info, Printer, Download, Warehouse, Truck, FileCheck, Building2 } from 'lucide-react';
import { reconstruirRecepciones, aplicarRecepciones, SimulationResult, generarRecepcionDesdeSaldoInicial } from '@/lib/ipv/intelligentEngine';
import { calculateCosts, validateMargins, CostEngineConfig, CostEngineMode } from '@/lib/ipv/costEngine';
import { SimulationPreview } from './SimulationPreview';
import { AppliedReceiptsHistory } from './AppliedReceiptsHistory';
import { toast } from 'sonner';
import { recalculateIPVReportsChain } from '@/lib/ipv/utils';
import { db, Product, SC204Metadata, IPVSettings } from '@/lib/dexie';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SC204Preview } from '../SC204Preview';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { generateLegalPdf } from '../../legal/LegalPdfExporter';

export function IntelligentReceiptsSection() {
    const [mode, setMode] = useState<'A' | 'B' | 'C'>('B');
    const [isSimulating, setIsSimulating] = useState(false);
    const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
    const [isApplying, setIsApplying] = useState(false);
    const [showSC204, setShowSC204] = useState(false);
    const [settings, setSettings] = useState<IPVSettings | null>(null);
    const [sc204Metadata, setSc204Metadata] = useState<SC204Metadata>({
        proveedor_nombre: '',
        proveedor_codigo: '',
        documento_tipo: 'Factura',
        documento_numero: '',
        transportador_nombre: '',
        transportador_ci: '',
        chapa: ''
    });

    // Cost Engine State
    const [costMode, setCostMode] = useState<CostEngineMode>('PERCENTAGE');
    const [costValue, setCostValue] = useState<string>("0.60");
    const [isCalculatingCosts, setIsCalculatingCosts] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [marginValidations, setMarginValidations] = useState<{isValid: boolean, message?: string, type: string}[]>([]);

    useEffect(() => {
        db.products.toArray().then(setProducts);
        db.ipv_settings.get('current').then(s => setSettings(s || null));
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

    const handleSimulateInitial = async () => {
        setIsSimulating(true);
        try {
            const result = await generarRecepcionDesdeSaldoInicial();
            setSimulationResult(result);
            setMarginValidations([]);
            toast.success("Simulación desde saldo inicial cargada");
        } catch (error) {
            toast.error("Error al cargar saldo inicial");
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
                usuario_id: "system"
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

    const handleExportSC204 = async () => {
        if (!simulationResult || !settings) return;
        try {
            const model = { code: 'SC-2-04', name: 'INFORME DE RECEPCIÓN' };
            const data = {
                entidad_nombre: settings.entidad_nombre,
                entidad_codigo: settings.entidad_codigo,
                almacen_nombre: settings.almacen_nombre || 'ALMACÉN PRINCIPAL',
                almacen_codigo: settings.almacen_codigo || 'ALM-01',
                fecha_emision: new Date().toLocaleDateString(),
                numero_consecutivo: String(settings.consecutivo_inicio || 1).padStart(6, '0'),
                metadata: sc204Metadata,
                productos: simulationResult.receipts.map(r => ({
                    product: products.find(p => p.cod === r.product_id)!,
                    quantity: r.quantity,
                    total_units: r.total_units,
                    unit_price_cents: r.costo_unitario_cents || 0,
                    total_price_cents: r.costo_total_cents || 0,
                    stock_after: (simulationResult.stockImpact.get(r.product_id)?.simulated || 0)
                })),
                total_importe_cents: simulationResult.receipts.reduce((sum, r) => sum + (r.costo_total_cents || 0), 0),
                logo_url: settings.logo_url,
                paper_size: settings.paper_size || 'LETTER'
            };
            await generateLegalPdf(model, data);
            toast.success("Reporte SC-2-04 generado");
        } catch (error) {
            toast.error("Error al generar PDF");
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
            setSimulationResult(null);
            toast.success("Cambios aplicados correctamente");
        } catch (error) {
            toast.error("Error al aplicar cambios");
        } finally {
            setIsApplying(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-muted/30 p-6 rounded-[2.5rem] border-2 border-primary/5 shadow-inner">
                <div className="space-y-1">
                    <h2 className="text-2xl font-black tracking-tighter uppercase flex items-center gap-3">
                        <Wand2 className="w-8 h-8 text-primary" />
                        Recepciones Inteligentes
                    </h2>
                    <p className="text-muted-foreground text-sm font-medium">Reconstrucción automatizada de inventario basado en demanda.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <Button
                        variant="outline"
                        onClick={handleSimulateInitial}
                        disabled={isSimulating}
                        className="h-12 px-6 rounded-2xl font-black uppercase tracking-widest text-xs gap-3 border-2 hover:bg-primary/5"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Saldo Inicial
                    </Button>

                    <Button
                        variant="outline"
                        onClick={() => {
                            setSimulationResult(null);
                            setMarginValidations([]);
                        }}
                        disabled={!simulationResult}
                        className="h-12 px-4 rounded-2xl font-black uppercase tracking-widest text-xs gap-3"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </Button>
                    <Button
                        onClick={handleSimulate}
                        disabled={isSimulating}
                        className="h-12 px-8 rounded-2xl font-black uppercase tracking-widest text-xs gap-3 shadow-xl active:scale-95 transition-all"
                    >
                        {isSimulating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        1. Simular Demanda
                    </Button>

                    <Dialog open={showSC204} onOpenChange={setShowSC204}>
                        <DialogTrigger asChild>
                            <Button
                                variant="outline"
                                disabled={!simulationResult || simulationResult.receipts.length === 0}
                                className="h-12 px-6 rounded-2xl font-black uppercase tracking-widest text-xs gap-3 border-2 border-blue-500/50 text-blue-600 hover:bg-blue-50"
                            >
                                <Printer className="w-4 h-4" />
                                Exportar SC-2-04
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-widest text-sm">
                                    <FileCheck className="w-5 h-5 text-primary" />
                                    Formalización de Recepción (SC-2-04)
                                </DialogTitle>
                            </DialogHeader>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                                <div className="space-y-4 border-r pr-6">
                                    <div className="flex items-center gap-2 text-primary mb-2">
                                        <Building2 className="w-4 h-4" />
                                        <span className="text-xs font-black uppercase tracking-widest">Proveedor</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <Label className="text-[10px] uppercase font-bold opacity-60">Nombre</Label>
                                            <Input value={sc204Metadata.proveedor_nombre} onChange={e => setSc204Metadata({...sc204Metadata, proveedor_nombre: e.target.value})} className="h-9 text-xs font-bold" />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[10px] uppercase font-bold opacity-60">Código</Label>
                                            <Input value={sc204Metadata.proveedor_codigo} onChange={e => setSc204Metadata({...sc204Metadata, proveedor_codigo: e.target.value})} className="h-9 text-xs font-bold" />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-primary mt-6 mb-2">
                                        <Truck className="w-4 h-4" />
                                        <span className="text-xs font-black uppercase tracking-widest">Transportador</span>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <Label className="text-[10px] uppercase font-bold opacity-60">Nombre Completo</Label>
                                            <Input value={sc204Metadata.transportador_nombre} onChange={e => setSc204Metadata({...sc204Metadata, transportador_nombre: e.target.value})} className="h-9 text-xs font-bold" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <Label className="text-[10px] uppercase font-bold opacity-60">C.I.</Label>
                                                <Input value={sc204Metadata.transportador_ci} onChange={e => setSc204Metadata({...sc204Metadata, transportador_ci: e.target.value})} className="h-9 text-xs font-bold" />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[10px] uppercase font-bold opacity-60">Chapa</Label>
                                                <Input value={sc204Metadata.chapa} onChange={e => setSc204Metadata({...sc204Metadata, chapa: e.target.value})} className="h-9 text-xs font-bold" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="pt-6">
                                        <Button onClick={handleExportSC204} className="w-full h-11 uppercase font-black tracking-widest text-[10px] gap-2 shadow-lg">
                                            <Download className="w-4 h-4" />
                                            Generar PDF Oficial
                                        </Button>
                                    </div>
                                </div>
                                <div className="bg-muted/30 rounded-2xl p-4 overflow-hidden border border-primary/5">
                                    <div className="flex items-center gap-2 text-primary mb-4">
                                        <Warehouse className="w-4 h-4" />
                                        <span className="text-xs font-black uppercase tracking-widest">Previsualización</span>
                                    </div>
                                    <div className="scale-[0.55] origin-top-left -mr-[100%]">
                                        {simulationResult && settings && (
                                            <SC204Preview
                                                data={{
                                                    entidad_nombre: settings.entidad_nombre,
                                                    entidad_codigo: settings.entidad_codigo,
                                                    almacen_nombre: settings.almacen_nombre || 'ALMACÉN PRINCIPAL',
                                                    almacen_codigo: settings.almacen_codigo || 'ALM-01',
                                                    fecha_emision: new Date().toLocaleDateString(),
                                                    numero_consecutivo: String(settings.consecutivo_inicio || 1).padStart(6, '0'),
                                                    metadata: sc204Metadata,
                                                    productos: simulationResult.receipts.map(r => ({
                                                        product: products.find(p => p.cod === r.product_id)!,
                                                        quantity: r.quantity,
                                                        total_units: r.total_units,
                                                        unit_price_cents: r.costo_unitario_cents || 0,
                                                        total_price_cents: r.costo_total_cents || 0,
                                                        stock_after: (simulationResult.stockImpact.get(r.product_id)?.simulated || 0)
                                                    })),
                                                    total_importe_cents: simulationResult.receipts.reduce((sum, r) => sum + (r.costo_total_cents || 0), 0),
                                                    logo_url: settings.logo_url
                                                }}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>

                    <Button
                        onClick={handleApply}
                        disabled={!simulationResult || simulationResult.receipts.length === 0 || isApplying}
                        className="h-12 px-8 rounded-2xl font-black uppercase tracking-widest text-xs gap-3 shadow-xl active:scale-95 transition-all bg-green-600 text-white hover:bg-green-700 disabled:bg-muted disabled:text-muted-foreground"
                    >
                        {isApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
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
