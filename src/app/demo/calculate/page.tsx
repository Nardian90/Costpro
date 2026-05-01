'use client';
import { useAuthStore } from '@/store';

import React, { useState, useEffect } from 'react';
import { useCalculateFicha, useImportJson } from '@/hooks/logic/useCostEngine';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { toast } from 'sonner';
import localforage from 'localforage';
import demoFixture from '@/lib/cost-engine/fixtures/FC-DEMO-243.json';
import { FichaJSON, FormaCalculo } from '@/lib/cost-engine/types';

export default function CostEngineDemo() {
  const [ficha, setFicha] = useState<FichaJSON>(demoFixture as any);
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(false);

  const calculateMutation = useCalculateFicha();
  const importMutation = useImportJson();

  // Load from local storage on mount
  useEffect(() => {
    const loadSaved = async () => {
        const saved = await localforage.getItem<FichaJSON>('cost-engine-draft');
        if (saved) {
            setFicha(saved);
            toast.info('Borrador cargado desde el almacenamiento local');
        }
    };
    loadSaved();
  }, []);

  // Auto-save logic
  useEffect(() => {
    if (isAutoSaveEnabled) {
        localforage.setItem('cost-engine-draft', ficha);
    }
  }, [ficha, isAutoSaveEnabled]);

  const handleCalculate = () => {
    calculateMutation.mutate(ficha, {
      onSuccess: () => toast.success('Cálculo completado'),
      onError: (err: any) => toast.error(err.message),
    });
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importMutation.mutate(file, {
        onSuccess: (newFicha) => {
          setFicha(newFicha);
          toast.success('JSON importado correctamente');
        },
        onError: (err: any) => toast.error(err.message),
      });
    }
  };

  const handleRowChange = (id: string, field: string, value: any) => {
    setFicha(prev => ({
        ...prev,
        rows: prev.rows.map(row => row.id === id ? { ...row, [field]: value } : row)
    }));
  };

  const downloadJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(ficha, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", `ficha-${ficha.meta.id}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const exportPdf = async () => {
    if (!calculateMutation.data) {
        toast.error('Primero debes calcular la ficha');
        return;
    }
    const response = await fetch('/api/cost-sheets/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ` },
        body: JSON.stringify(calculateMutation.data)
    });
    if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ficha-${ficha.meta.id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } else {
        toast.error('Error al generar PDF');
    }
  };

  const result = calculateMutation.data;

  return (
    <div className="container mx-auto p-8 space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h1 className="text-3xl font-bold">Editor de Ficha de Costo</h1>
            <p className="text-muted-foreground">Motor declarativo JSON-first</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input type="file" id="json-upload" className="hidden" accept=".json" onChange={handleFileImport} aria-label="Cargar archivo JSON" />
          <Button variant="outline" size="sm" onClick={() => document.getElementById('json-upload')?.click()}>
            Cargar Plantilla
          </Button>
          <Button variant="outline" size="sm" onClick={downloadJson}>
            Descargar JSON
          </Button>
          <Button variant="outline" size="sm" onClick={exportPdf} disabled={!result}>
            Exportar PDF
          </Button>
          <Button size="sm" onClick={handleCalculate} disabled={calculateMutation.isPending}>
            {calculateMutation.isPending ? 'Calculando...' : 'Recalcular'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader><CardTitle>Metadatos</CardTitle></CardHeader>
          <CardContent className="space-y-4">
             <div>
                <label htmlFor="ficha-id" className="text-xs font-medium uppercase text-muted-foreground">ID</label>
                <Input id="ficha-id" value={ficha.meta.id} readOnly className="bg-muted" />
             </div>
             <div>
                <label htmlFor="ficha-name" className="text-xs font-medium uppercase text-muted-foreground">Nombre</label>
                <Input id="ficha-name" value={ficha.meta.name} onChange={e => setFicha({...ficha, meta: {...ficha.meta, name: e.target.value}})} />
             </div>
             <div className="flex items-center space-x-2 pt-2">
                <input
                    type="checkbox"
                    id="autosave"
                    checked={isAutoSaveEnabled}
                    onChange={e => setIsAutoSaveEnabled(e.target.checked)}
                    aria-label="Activar auto-guardado local"
                />
                <label htmlFor="autosave" className="text-sm font-medium">Auto-guardado local</label>
             </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-3">
          <CardHeader><CardTitle>Resumen Financiero</CardTitle></CardHeader>
          <CardContent>
            {result ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryBox label="Costo Total" value={result.summary.totalCost} decimals={ficha.meta.decimals} />
                <SummaryBox label="Margen" value={result.summary.totalMargin} decimals={ficha.meta.decimals} />
                <SummaryBox label="Impuestos" value={result.summary.totalTax} decimals={ficha.meta.decimals} />
                <SummaryBox label="Precio Final" value={result.summary.grandTotal} decimals={ficha.meta.decimals} primary />
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">Haz clic en Recalcular para ver resultados</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Estructura de Ficha</CardTitle>
            <Badge variant="secondary">{ficha.rows.length} Filas</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Clasif.</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead className="w-[120px]">Método</TableHead>
                <TableHead className="text-right w-[150px]">V. Histórico</TableHead>
                <TableHead className="text-right w-[120px]">Coeficiente</TableHead>
                <TableHead className="text-right w-[150px]">Resultado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ficha.rows.map((row) => {
                const rowResult = result?.rows.find(r => r.id === row.id);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.classification}</TableCell>
                    <TableCell>
                        <div className="font-medium">{row.label}</div>
                        <div className="text-xs text-muted-foreground uppercase">{row.type}</div>
                    </TableCell>
                    <TableCell>
                        <Select
                            value={row.formaCalculo}
                            onValueChange={(val: FormaCalculo) => handleRowChange(row.id, 'formaCalculo', val)}
                        >
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="FIJO">Fijo</SelectItem>
                                <SelectItem value="IMPORTAR_ANEXO">Anexo</SelectItem>
                                <SelectItem value="PRORRATEO">Prorrateo</SelectItem>
                                <SelectItem value="COEFICIENTE">Coef.</SelectItem>
                                <SelectItem value="FORMULA">Fórmula</SelectItem>
                            </SelectContent>
                        </Select>
                    </TableCell>
                    <TableCell className="text-right">
                        <Input
                            type="number"
                            step="0.01"
                            className="h-8 text-right font-mono"
                            value={row.valorHistorico || 0}
                            onChange={e => handleRowChange(row.id, 'valorHistorico', parseFloat(e.target.value) || 0)}
                        />
                    </TableCell>
                    <TableCell className="text-right">
                        {row.formaCalculo === 'COEFICIENTE' ? (
                            <Input
                                type="number"
                                step="0.001"
                                className="h-8 text-right font-mono"
                                value={row.coeficiente || 0}
                                onChange={e => handleRowChange(row.id, 'coeficiente', parseFloat(e.target.value) || 0)}
                            />
                        ) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-bold text-primary tabular-nums">
                        {rowResult ? rowResult.total.toFixed(ficha.meta.decimals) : '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {result && result.audits.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Bitácora de Cálculo (Auditoría Explicable)</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-4">
              {result.audits.map((audit: any, i: number) => (
                <div key={i} className="group flex gap-4 p-3 border rounded-lg text-sm items-start hover:bg-muted/50 transition-colors">
                   <div className="mt-1">
                       <StatusBadge type={audit.type} />
                   </div>
                   <div className="flex-1">
                     <div className="flex items-center gap-2">
                        <span className="font-bold">Fila {audit.rowId}</span>
                        <span className="text-xs text-muted-foreground uppercase">{ficha.rows.find(r => r.id === audit.rowId)?.label}</span>
                     </div>
                     <p className="text-muted-foreground text-xs mt-1">{audit.note}</p>
                     {audit.prev !== undefined && (
                        <div className="mt-2 font-mono text-xs bg-background p-1.5 rounded border inline-block">
                          <span className="text-muted-foreground">{audit.prev}</span>
                          <span className="mx-2">→</span>
                          <span className="text-primary font-bold">{audit.now}</span>
                        </div>
                     )}
                   </div>
                   <div className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                     {new Date(audit.ts).toLocaleTimeString()}
                   </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryBox({ label, value, decimals, primary = false }: any) {
    return (
        <div className={`p-4 rounded-lg text-center ${primary ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
            <div className={`text-xs uppercase font-medium ${primary ? 'opacity-80' : 'text-muted-foreground'}`}>{label}</div>
            <div className="text-2xl font-black tabular-nums">{value.toFixed(decimals)}</div>
        </div>
    );
}

function StatusBadge({ type }: any) {
    switch (type) {
        case 'ERROR': return <Badge variant="destructive">ERROR</Badge>;
        case 'WARNING': return <Badge className="bg-amber-500 text-foreground">WARN</Badge>;
        case 'RULE_APPLIED': return <Badge className="bg-green-600 text-foreground">RULE</Badge>;
        case 'CYCLE_DETECTED': return <Badge className="bg-purple-500 text-foreground">CYCLE</Badge>;
        default: return <Badge variant="secondary">INFO</Badge>;
    }
}
