'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useCalculateFicha, useImportJson } from '@/hooks/logic/useCostEngine';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import localforage from 'localforage';
import { Settings2, Calculator, Save, Download, FileJson, FileType, Plus } from 'lucide-react';
import demoFixture from '@/lib/cost-engine/fixtures/FC-DEMO-243.json';
import { FichaJSON, FormaCalculo, CostRow, BaseRef } from '@/lib/cost-engine/types';

export default function CostEngineDemo() {
  const [ficha, setFicha] = useState<FichaJSON>(demoFixture as any);
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);

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

  const handleRowUpdate = (id: string, updates: Partial<CostRow>) => {
    setFicha(prev => ({
        ...prev,
        rows: prev.rows.map(row => row.id === id ? { ...row, ...updates } : row)
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
    const response = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  // Options for Base de Cálculo
  const baseOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string; type: 'ANEXO' | 'FILA' }> = [];
    ficha.anexos.forEach(a => opts.push({ value: `ANEXO:${a.id}`, label: `Anexo ${a.id}: ${a.name || ''}`, type: 'ANEXO' }));

    // Group rows by classification to avoid duplicates in list
    const seenClasses = new Set<string>();
    ficha.rows.forEach(r => {
        if (!seenClasses.has(r.classification)) {
            opts.push({ value: `FILA:${r.classification}`, label: `Fila ${r.classification}: ${r.label}`, type: 'FILA' });
            seenClasses.add(r.classification);
        }
    });
    return opts;
  }, [ficha]);

  const editingRow = ficha.rows.find(r => r.id === editingRowId);

  return (
    <div className="container mx-auto p-8 space-y-8 pb-32">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
            <h1 className="text-4xl font-black tracking-tight text-primary uppercase">Motor de Costos Pro</h1>
            <p className="text-muted-foreground font-medium">Declarativo • JSON-first • Auditable</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <input type="file" id="json-upload" className="hidden" accept=".json" onChange={handleFileImport} />
          <Button variant="outline" className="rounded-xl" onClick={() => document.getElementById('json-upload')?.click()}>
            <FileJson className="w-4 h-4 mr-2" />
            Importar JSON
          </Button>
          <Button variant="outline" className="rounded-xl" onClick={downloadJson}>
            <Download className="w-4 h-4 mr-2" />
            Exportar JSON
          </Button>
          <Button variant="secondary" className="rounded-xl" onClick={exportPdf} disabled={!result}>
            <FileType className="w-4 h-4 mr-2" />
            PDF Ministerial
          </Button>
          <Button size="lg" className="rounded-xl shadow-lg shadow-primary/20" onClick={handleCalculate} disabled={calculateMutation.isPending}>
            <Calculator className="w-4 h-4 mr-2" />
            {calculateMutation.isPending ? 'Procesando...' : 'Recalcular Ficha'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <Card className="rounded-3xl border-none shadow-xl bg-muted/30">
          <CardHeader><CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground">Configuración</CardTitle></CardHeader>
          <CardContent className="space-y-6">
             <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">ID de la Ficha</Label>
                <Input value={ficha.meta.id} readOnly className="rounded-xl bg-background border-none" />
             </div>
             <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Nombre del Producto/Servicio</Label>
                <Input
                    value={ficha.meta.name}
                    onChange={e => setFicha({...ficha, meta: {...ficha.meta, name: e.target.value}})}
                    className="rounded-xl bg-background border-none focus-visible:ring-primary"
                />
             </div>
             <div className="flex items-center space-x-3 p-4 bg-background rounded-2xl">
                <input
                    type="checkbox"
                    id="autosave"
                    className="w-5 h-5 rounded-lg border-primary text-primary focus:ring-primary"
                    checked={isAutoSaveEnabled}
                    onChange={e => setIsAutoSaveEnabled(e.target.checked)}
                />
                <Label htmlFor="autosave" className="text-sm font-bold">Auto-guardado (IndexedDB)</Label>
             </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 rounded-3xl border-none shadow-xl">
          <CardHeader><CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground">Resumen de Totales</CardTitle></CardHeader>
          <CardContent>
            {result ? (
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
                <SummaryBox label="Costos" value={result.summary.totalCost} decimals={ficha.meta.decimals} />
                <SummaryBox label="Utilidad" value={result.summary.totalMargin} decimals={ficha.meta.decimals} />
                <SummaryBox label="Impuestos" value={result.summary.totalTax} decimals={ficha.meta.decimals} />
                <SummaryBox label="Total General" value={result.summary.grandTotal} decimals={ficha.meta.decimals} primary />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Calculator className="w-12 h-12 mb-4 opacity-20" />
                  <p className="font-bold">El motor está listo</p>
                  <p className="text-xs">Presiona "Recalcular" para procesar los datos</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-3xl border-none shadow-2xl overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="border-none">
                <TableHead className="w-[80px] font-black uppercase text-[10px] pl-6">Clasif.</TableHead>
                <TableHead className="font-black uppercase text-[10px]">Concepto</TableHead>
                <TableHead className="w-[140px] font-black uppercase text-[10px]">Método</TableHead>
                <TableHead className="text-right w-[160px] font-black uppercase text-[10px]">V. Histórico</TableHead>
                <TableHead className="text-right w-[140px] font-black uppercase text-[10px]">Coeficiente</TableHead>
                <TableHead className="text-right w-[160px] font-black uppercase text-[10px] pr-6">Total Calculado</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ficha.rows.map((row) => {
                const rowResult = result?.rows.find(r => r.id === row.id);
                return (
                  <TableRow key={row.id} className="hover:bg-muted/30 transition-colors border-muted/50">
                    <TableCell className="font-mono text-xs pl-6">{row.classification}</TableCell>
                    <TableCell>
                        <div className="font-bold text-sm">{row.label}</div>
                        <div className="text-[10px] text-muted-foreground font-black uppercase tracking-tighter">{row.type}</div>
                    </TableCell>
                    <TableCell>
                        <Badge variant="outline" className="rounded-md font-black text-[9px] px-2 py-0 h-6 bg-background">
                            {row.formaCalculo}
                        </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                        <Input
                            type="number"
                            step="0.01"
                            className="h-9 text-right font-mono font-bold bg-muted/20 border-none rounded-xl focus-visible:ring-primary"
                            value={row.valorHistorico || 0}
                            onChange={e => handleRowUpdate(row.id, { valorHistorico: parseFloat(e.target.value) || 0 })}
                        />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {row.formaCalculo === 'COEFICIENTE' && typeof row.coeficiente === 'number' ? (
                            <span className="font-bold text-primary">{row.coeficiente.toFixed(4)}</span>
                        ) : (rowResult && typeof rowResult.total === 'number' && row.valorHistorico && row.valorHistorico > 0 ? (rowResult.total / row.valorHistorico).toFixed(4) : '-')}
                    </TableCell>
                    <TableCell className="text-right font-black text-lg text-primary tabular-nums pr-6">
                        {rowResult && typeof rowResult.total === 'number' ? `$ ${rowResult.total.toFixed(ficha.meta.decimals)}` : '-'}
                    </TableCell>
                    <TableCell className="pr-6">
                        <Button variant="ghost" size="icon" onClick={() => setEditingRowId(row.id)} className="rounded-xl hover:bg-primary/10 hover:text-primary">
                            <Settings2 className="w-4 h-4" />
                        </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Configuration Modal */}
      <Dialog open={!!editingRowId} onOpenChange={(open) => !open && setEditingRowId(null)}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Configurar Fila {editingRow?.classification}</DialogTitle>
          </DialogHeader>

          {editingRow && (
            <div className="grid gap-6 py-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Concepto</Label>
                <Input value={editingRow.label} onChange={e => handleRowUpdate(editingRow.id, { label: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground">Forma de Cálculo</Label>
                    <Select
                        value={editingRow.formaCalculo}
                        onValueChange={(val: FormaCalculo) => handleRowUpdate(editingRow.id, { formaCalculo: val })}
                    >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="FIJO">Valor Fijo</SelectItem>
                            <SelectItem value="IMPORTAR_ANEXO">Importar Anexo</SelectItem>
                            <SelectItem value="PRORRATEO">Prorrateo</SelectItem>
                            <SelectItem value="COEFICIENTE">Coeficiente</SelectItem>
                            <SelectItem value="FORMULA">Fórmula Sandboxed</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground">Tipo Semántico</Label>
                    <Select
                        value={editingRow.type}
                        onValueChange={(val: any) => handleRowUpdate(editingRow.id, { type: val })}
                    >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="COST">Costo</SelectItem>
                            <SelectItem value="MARGIN">Margen/Utilidad</SelectItem>
                            <SelectItem value="TAX">Impuesto</SelectItem>
                            <SelectItem value="INFO">Informativo</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Base de Cálculo</Label>
                <Select
                    value={editingRow.baseCalculo ? `${editingRow.baseCalculo.type}:${editingRow.baseCalculo.type === 'ANEXO' ? editingRow.baseCalculo.anexoId : editingRow.baseCalculo.classification}` : 'NONE'}
                    onValueChange={(val) => {
                        if (val === 'NONE') {
                            handleRowUpdate(editingRow.id, { baseCalculo: null });
                            return;
                        }
                        const [type, refId] = val.split(':');
                        const baseRef: BaseRef = type === 'ANEXO'
                            ? { type: 'ANEXO', anexoId: refId }
                            : { type: 'FILA', classification: refId };
                        handleRowUpdate(editingRow.id, { baseCalculo: baseRef });
                    }}
                >
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Seleccionar base..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="NONE">Sin Base</SelectItem>
                        {baseOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
              </div>

              {editingRow.formaCalculo === 'COEFICIENTE' && (
                <div className="space-y-2 animate-in slide-in-from-top-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground">Coeficiente (ej. 0.20)</Label>
                    <Input
                        type="number"
                        step="0.001"
                        value={editingRow.coeficiente || 0}
                        onChange={e => handleRowUpdate(editingRow.id, { coeficiente: parseFloat(e.target.value) || 0 })}
                    />
                </div>
              )}

              {editingRow.formaCalculo === 'FORMULA' && (
                <div className="space-y-2 animate-in slide-in-from-top-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground">Expresión (Variables: VH, BASE_TOTAL, COEF)</Label>
                    <Input
                        placeholder="VH * 1.1 + BASE_TOTAL * COEF"
                        value={editingRow.formula || ''}
                        onChange={e => handleRowUpdate(editingRow.id, { formula: e.target.value })}
                        className="font-mono text-xs"
                    />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button className="w-full rounded-2xl py-6 font-black uppercase tracking-widest" onClick={() => setEditingRowId(null)}>
              Listo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {result && result.audits.length > 0 && (
        <Card className="rounded-3xl border-none shadow-xl bg-slate-900 text-white">
          <CardHeader><CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Trazabilidad Algorítmica (Auditoría)</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
              {result.audits.map((audit: any, i: number) => (
                <div key={i} className="group flex gap-4 p-4 border border-white/10 rounded-2xl text-sm items-start hover:bg-white/5 transition-colors">
                   <div className="mt-1">
                       <StatusBadge type={audit.type} />
                   </div>
                   <div className="flex-1">
                     <div className="flex items-center gap-3">
                        <span className="font-black text-primary">TRANSICIÓN</span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase">{new Date(audit.ts).toLocaleTimeString()}</span>
                     </div>
                     <p className="text-slate-300 text-xs mt-1 font-medium">{audit.note}</p>
                     {typeof audit.prev === 'number' && typeof audit.now === 'number' && (
                        <div className="mt-3 font-mono text-[10px] bg-black/40 p-2 rounded-xl border border-white/5 flex items-center gap-3 w-fit">
                          <span className="text-slate-500">{audit.prev.toFixed(ficha.meta.decimals)}</span>
                          <span className="text-primary font-black">→</span>
                          <span className="text-white font-black">{audit.now.toFixed(ficha.meta.decimals)}</span>
                        </div>
                     )}
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
        <div className={`p-6 rounded-3xl text-center transition-all hover:scale-105 ${primary ? 'bg-primary text-primary-foreground shadow-2xl shadow-primary/40' : 'bg-muted/50 border border-muted'}`}>
            <div className={`text-[10px] uppercase font-black tracking-[0.2em] mb-2 ${primary ? 'opacity-70' : 'text-muted-foreground'}`}>{label}</div>
            <div className="text-3xl font-black tabular-nums tracking-tighter">$ {value.toLocaleString(undefined, { minimumFractionDigits: decimals })}</div>
        </div>
    );
}

function StatusBadge({ type }: any) {
    switch (type) {
        case 'ERROR': return <Badge variant="destructive" className="font-black px-2 py-0">ERROR</Badge>;
        case 'WARNING': return <Badge className="bg-amber-500 text-white font-black px-2 py-0">WARN</Badge>;
        case 'RULE_APPLIED': return <Badge className="bg-blue-500 text-white font-black px-2 py-0">RULE</Badge>;
        case 'CYCLE_DETECTED': return <Badge className="bg-purple-500 text-white font-black px-2 py-0">CYCLE</Badge>;
        default: return <Badge variant="secondary" className="font-black px-2 py-0">INFO</Badge>;
    }
}
