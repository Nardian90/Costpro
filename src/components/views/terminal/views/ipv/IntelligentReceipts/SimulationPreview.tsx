import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { IntelligentReceipt } from '@/lib/dexie';
import { ArrowRight, Package, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface SimulationPreviewProps {
    receipts: IntelligentReceipt[];
    stockImpact: Map<string, { current: number; simulated: number }>;
    correctedProducts: string[];
}

export function SimulationPreview({ receipts, stockImpact, correctedProducts }: SimulationPreviewProps) {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-primary/5 border-primary/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Package className="w-4 h-4" />
                            Recepciones Propuestas
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black">{receipts.length}</div>
                        <p className="text-xs text-muted-foreground">Movimientos a generar</p>
                    </CardContent>
                </Card>
                <Card className="bg-yellow-500/5 border-yellow-500/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2 text-yellow-600">
                            <AlertTriangle className="w-4 h-4" />
                            Productos Corregidos
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-yellow-600">{correctedProducts.length}</div>
                        <p className="text-xs text-muted-foreground">Productos con stock negativo resuelto</p>
                    </CardContent>
                </Card>
                <Card className="bg-green-500/5 border-green-500/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2 text-green-600">
                            <CheckCircle2 className="w-4 h-4" />
                            Estado Final
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-green-600">CONSISTENTE</div>
                        <p className="text-xs text-muted-foreground">Sin quiebres de stock detectados</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Detalle de Recepciones</CardTitle>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[400px]">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Producto</TableHead>
                                    <TableHead>Nivel</TableHead>
                                    <TableHead className="text-right">Cantidad</TableHead>
                                    <TableHead className="text-right">Unidades Totales</TableHead>
                                    <TableHead>Tipo</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {receipts.map((r) => (
                                    <TableRow key={r.id}>
                                        <TableCell className="font-mono text-xs">{r.date}</TableCell>
                                        <TableCell className="font-bold">{r.product_id}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{r.level}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-black">{r.quantity}</TableCell>
                                        <TableCell className="text-right font-mono">{r.total_units}</TableCell>
                                        <TableCell>
                                            <Badge variant={r.type === 'CORRECTIVE' ? 'destructive' : 'default'} className="text-[10px]">
                                                {r.type}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Impacto en Stock</CardTitle>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[300px]">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Producto</TableHead>
                                    <TableHead className="text-right">Stock Actual</TableHead>
                                    <TableHead className="text-center"></TableHead>
                                    <TableHead className="text-right">Stock Simulado</TableHead>
                                    <TableHead className="text-right">Diferencia</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {Array.from(stockImpact.entries()).filter(([_, impact]) => impact.simulated !== impact.current).map(([cod, impact]) => (
                                    <TableRow key={cod}>
                                        <TableCell className="font-bold">{cod}</TableCell>
                                        <TableCell className="text-right font-mono">{impact.current}</TableCell>
                                        <TableCell className="text-center text-muted-foreground">
                                            <ArrowRight className="w-4 h-4 inline" />
                                        </TableCell>
                                        <TableCell className="text-right font-black text-primary">{impact.simulated}</TableCell>
                                        <TableCell className="text-right font-mono text-green-600">
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
