import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { IntelligentReceipt } from '@/lib/dexie';
import { ArrowRight, Package, AlertTriangle, CheckCircle2, DollarSign } from 'lucide-react';

interface SimulationPreviewProps {
    receipts: IntelligentReceipt[];
    stockImpact: Map<string, { current: number; simulated: number }>;
    correctedProducts: string[];
}

export function SimulationPreview({ receipts, stockImpact, correctedProducts }: SimulationPreviewProps) {
    const formatCurrency = (cents?: number) => {
        if (cents === undefined) return '-';
        return (cents / 100).toLocaleString('es-ES', { style: 'currency', currency: 'CUP' });
    };

    const totalCostoCents = receipts.reduce((sum, r) => sum + (r.costo_total_cents || 0), 0);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-primary/5 border-primary/20">
                    <CardHeader className="pb-2 px-4">
                        <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                            <Package className="w-3.5 h-3.5" />
                            Recepciones
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <div className="text-2xl font-black">{receipts.length}</div>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase">Movimientos</p>
                    </CardContent>
                </Card>
                <Card className="bg-yellow-500/5 border-yellow-500/20">
                    <CardHeader className="pb-2 px-4">
                        <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-yellow-600">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Corregidos
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <div className="text-2xl font-black text-yellow-600">{correctedProducts.length}</div>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase">Negativos resueltos</p>
                    </CardContent>
                </Card>
                <Card className="bg-green-500/5 border-green-500/20">
                    <CardHeader className="pb-2 px-4">
                        <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-green-600">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Estado
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <div className="text-xl font-black text-green-600 uppercase">Consistente</div>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase">Sin quiebres</p>
                    </CardContent>
                </Card>
                <Card className="bg-blue-500/5 border-blue-500/20 shadow-xl border-2">
                    <CardHeader className="pb-2 px-4">
                        <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-blue-600">
                            <DollarSign className="w-3.5 h-3.5" />
                            Costo Inversión
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <div className="text-xl font-black text-blue-600">{formatCurrency(totalCostoCents)}</div>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase">Total Estimado</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-2 border-primary/5">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-black uppercase tracking-widest">Detalle de Recepciones y Costos</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <ScrollArea className="h-[400px]">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead className="text-[10px] font-black uppercase">Fecha</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase">Producto</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase">Nivel</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase">Qty</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase">C. Unitario</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase">Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {receipts.map((r) => (
                                    <TableRow key={r.id} className="hover:bg-primary/5 transition-colors">
                                        <TableCell className="font-mono text-[10px]">{r.date}</TableCell>
                                        <TableCell className="font-bold text-xs">{r.product_id}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="text-[9px] font-black px-1.5 h-5">{r.level}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-black text-xs">{r.quantity}</TableCell>
                                        <TableCell className="text-right font-mono text-xs text-blue-600 font-bold">
                                            {formatCurrency(r.costo_unitario_cents)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-xs text-blue-700 font-black">
                                            {formatCurrency(r.costo_total_cents)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>

            <Card className="border-2 border-primary/5">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-black uppercase tracking-widest">Impacto en Stock</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <ScrollArea className="h-[300px]">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead className="text-[10px] font-black uppercase">Producto</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase">Actual</TableHead>
                                    <TableHead className="text-center"></TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase">Simulado</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase">Dif.</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {Array.from(stockImpact.entries()).filter(([_, impact]) => impact.simulated !== impact.current).map(([cod, impact]) => (
                                    <TableRow key={cod} className="hover:bg-primary/5 transition-colors">
                                        <TableCell className="font-bold text-xs">{cod}</TableCell>
                                        <TableCell className="text-right font-mono text-xs">{impact.current}</TableCell>
                                        <TableCell className="text-center text-muted-foreground">
                                            <ArrowRight className="w-4 h-4 inline" />
                                        </TableCell>
                                        <TableCell className="text-right font-black text-primary text-xs">{impact.simulated}</TableCell>
                                        <TableCell className="text-right font-mono text-green-600 font-bold text-xs">
                                            +{impact.simulated - impact.current}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}
