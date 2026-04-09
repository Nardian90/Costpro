import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { db } from '@/lib/dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { History, FileText } from 'lucide-react';

export function AppliedReceiptsHistory() {
    const history = useLiveQuery(async () => {
        const results = await db.intelligent_receipts.where('applied').equals(1).toArray();
        return results.sort((a, b) => b.created_at.localeCompare(a.created_at));
    });

    if (!history || history.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground opacity-50">
                <History className="w-12 h-12 mb-4" />
                <p>No hay historial de recepciones inteligentes aplicadas.</p>
            </div>
        );
    }

    return (
        <Card className="animate-in fade-in duration-500">
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Historial de Aplicaciones
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[500px]">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Aplicado en</TableHead>
                                <TableHead>Fecha Lógica</TableHead>
                                <TableHead>Producto</TableHead>
                                <TableHead>Nivel</TableHead>
                                <TableHead className="text-right">Cantidad</TableHead>
                                <TableHead>Modo</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {history.map((r) => (
                                <TableRow key={r.id}>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {new Date(r.created_at).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{r.date}</TableCell>
                                    <TableCell className="font-bold">{r.product_id}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{r.level}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-black">{r.quantity}</TableCell>
                                    <TableCell>
                                        <Badge variant="secondary">Modo {r.mode}</Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
