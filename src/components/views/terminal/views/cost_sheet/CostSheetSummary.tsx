import React, { useMemo, useState, useEffect } from 'react';
import {
  TrendingUp,
  DollarSign,
  Percent,
  AlertCircle,
  Info,
  Calculator,
  Save,
  RotateCcw,
  Check,
  X,
  Settings2,
  Layers,
  Target,
  Wand2,
  Search,
  ChevronDown
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useCostSheetCalculator } from '@/hooks/logic/useCostSheetCalculator';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { solveForTarget } from '@/lib/cost-engine/solver';
import { CostSheetRow } from '@/types/cost-sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

export const CostSheetSummary: React.FC = () => {
  const { data, updateUtilityFormula, updateIndirectConfig, updateValue } = useCostSheetStore();
  const { calculatedValues } = useCostSheetCalculator(data);

  // Local state for "Precio de Venta Objetivo" simulation
  const [targetPrice, setTargetPrice] = useState<string>('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [tempUtility, setTempUtility] = useState<number>(0);

  // Advanced Solver State
  const [solverTargetRow, setSolverTargetRow] = useState<string>('14.1');
  const [solverVariableRow, setSolverVariableRow] = useState<string>('13.1');
  const [solverTargetValue, setSolverTargetValue] = useState<string>('');
  const [isSolverRunning, setIsSolverRunning] = useState(false);

  const [targetSearch, setTargetSearch] = useState('');
  const [variableSearch, setVariableSearch] = useState('');

  const utilityRow = useMemo(() => {
    for (const section of data.sections) {
      const row = section.rows.find(r => ['13', '13.1'].includes(r.id));
      if (row) return row;
    }
    return null;
  }, [data.sections]);

  const currentUtilityPercent = useMemo(() => {
    if (!utilityRow || !utilityRow.formula) return 0;
    const match = utilityRow.formula.match(/\*\s*([\d.]+)/);
    return match ? parseFloat(match[1]) * 100 : 0;
  }, [utilityRow]);

  useEffect(() => {
    if (!isSimulating) {
      setTempUtility(currentUtilityPercent);
    }
  }, [currentUtilityPercent, isSimulating]);

  const totalCost = useMemo(() => {
    const costRow = data.sections.flatMap(s => s.rows).find(r => ['12', '12.1'].includes(r.id));
    return costRow ? (calculatedValues[costRow.id]?.total || 0) : 0;
  }, [data.sections, calculatedValues]);

  const handleTargetPriceChange = (value: string) => {
    setTargetPrice(value);
    const numericPrice = parseFloat(value);
    if (!isNaN(numericPrice) && totalCost > 0) {
      const neededUtility = ((numericPrice / totalCost) - 1) * 100;
      setTempUtility(Math.max(0, neededUtility));
      setIsSimulating(true);
    }
  };

  const applySimulation = () => {
    updateUtilityFormula(tempUtility);
    setIsSimulating(false);
    setTargetPrice('');
    toast.success('Simulación aplicada correctamente');
  };

  const cancelSimulation = () => {
    setIsSimulating(false);
    setTargetPrice('');
    setTempUtility(currentUtilityPercent);
  };

  const handleRunAdvancedSolver = () => {
    const numericTarget = parseFloat(solverTargetValue);
    if (isNaN(numericTarget)) {
      toast.error('Por favor, ingrese un valor objetivo válido');
      return;
    }

    setIsSolverRunning(true);
    setTimeout(() => {
      try {
        const result = solveForTarget(data, solverTargetRow, numericTarget, solverVariableRow);

        // Find where the variable row is and update it in the store
        let path: (string | number)[] | null = null;
        data.sections.forEach((section, sIdx) => {
          section.rows.forEach((row, rIdx) => {
            if (row.id === solverVariableRow || row.classification === solverVariableRow) {
              path = ['sections', sIdx, 'rows', rIdx, row.hasOwnProperty('valorHistorico') ? 'valorHistorico' : 'value'];
            }
            // Check children if any
            if (row.children) {
              row.children.forEach((child, cIdx) => {
                if (child.id === solverVariableRow || child.classification === solverVariableRow) {
                  path = ['sections', sIdx, 'rows', rIdx, 'children', cIdx, child.hasOwnProperty('valorHistorico') ? 'valorHistorico' : 'value'];
                }
              });
            }
          });
        });

        if (path) {
          updateValue(path, result);
          setIsSimulating(true);
          toast.success(`Solver completado. Variable ajustada a ${result.toFixed(4)}`);
        } else {
          toast.error('No se pudo encontrar la fila variable');
        }
      } catch (e) {
        toast.error('Error al ejecutar el solver');
      } finally {
        setIsSolverRunning(false);
      }
    }, 100);
  };

  const handleAutoCalculateCoefficient = () => {
    const selectedIds = data.indirectConfig?.selectedSections || [];
    const baseSectionId = data.indirectConfig?.baseSection || '2';

    const indirectTotal = selectedIds.reduce((sum, id) => sum + (calculatedValues[id]?.total || 0), 0);
    const baseTotal = calculatedValues[baseSectionId]?.total || 0;

    if (baseTotal > 0) {
      const newCoef = indirectTotal / baseTotal;
      updateIndirectConfig({ coefficient: Number(newCoef.toFixed(4)) });
    }
  };

  const handleIndirectSectionToggle = (sectionId: string) => {
    const current = data.indirectConfig?.selectedSections || [];
    const updated = current.includes(sectionId)
      ? current.filter(id => id !== sectionId)
      : [...current, sectionId];
    updateIndirectConfig({ selectedSections: updated });
  };

  const allRows = useMemo(() => {
    const flattened: { id: string, label: string, cls: string }[] = [];
    const processRows = (rows: CostSheetRow[]) => {
      rows.forEach(r => {
        flattened.push({ id: r.id, label: r.label, cls: r.classification || r.id });
        if (r.children) processRows(r.children);
      });
    };
    data.sections.forEach(s => processRows(s.rows));
    return flattened;
  }, [data.sections]);

  const filteredTargetRows = allRows.filter(r =>
    r.label.toLowerCase().includes(targetSearch.toLowerCase()) ||
    r.cls.includes(targetSearch)
  ).slice(0, 10);

  const filteredVariableRows = allRows.filter(r =>
    r.label.toLowerCase().includes(variableSearch.toLowerCase()) ||
    r.cls.includes(variableSearch)
  ).slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase font-bold tracking-widest text-primary/60">Costo Directo</CardDescription>
            <CardTitle className="text-2xl font-black font-mono">{formatCurrency(totalCost)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-green-50/50 border-green-100">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase font-bold tracking-widest text-green-600/60">Utilidad Bruta</CardDescription>
            <CardTitle className="text-2xl font-black font-mono text-green-700">
              {formatCurrency(calculatedValues[utilityRow?.id || '13.1']?.total || 0)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-blue-50/50 border-blue-100">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase font-bold tracking-widest text-blue-600/60">Precio Final (100%)</CardDescription>
            <CardTitle className="text-2xl font-black font-mono text-blue-700">
              {formatCurrency(calculatedValues['14.1']?.total || calculatedValues['14']?.total || 0)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="overflow-hidden border-2 border-primary/5">
          <CardHeader className="bg-primary/5 border-b border-primary/10">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Simulador de Margen y Precio
            </CardTitle>
            <CardDescription>
              Ajuste el % de utilidad o defina un precio objetivo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium">% de Utilidad</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    className="w-20 h-8 text-right"
                    value={tempUtility.toFixed(2)}
                    onChange={(e) => {
                      setTempUtility(parseFloat(e.target.value) || 0);
                      setIsSimulating(true);
                    }}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <Slider
                value={[tempUtility]}
                max={300}
                step={0.5}
                onValueChange={([val]) => {
                  setTempUtility(val);
                  setIsSimulating(true);
                }}
              />
            </div>

            <div className="pt-4 border-t space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium">Precio de Venta Objetivo</label>
                <div className="relative">
                  <DollarSign className="w-3 h-3 absolute left-2 top-2.5 text-muted-foreground" />
                  <Input
                    type="number"
                    placeholder="Ej: 5000"
                    className="w-32 h-9 pl-6 text-right"
                    value={targetPrice}
                    onChange={(e) => handleTargetPriceChange(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Advanced Solver Mini-Panel */}
            <div className="pt-6 border-t space-y-4">
               <div className="flex items-center gap-2 mb-2">
                 <Wand2 className="w-4 h-4 text-primary" />
                 <span className="text-xs font-black uppercase tracking-widest text-primary/70">Solver Avanzado</span>
               </div>

               <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase text-muted-foreground">Objetivo (Fila)</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full justify-between font-mono text-[10px]">
                          {solverTargetRow}
                          <ChevronDown className="w-3 h-3 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-[200px]" align="start">
                        <div className="flex items-center border-b p-2">
                          <Search className="w-3 h-3 mr-2 opacity-50" />
                          <input
                            className="bg-transparent text-xs outline-none w-full"
                            placeholder="Buscar fila..."
                            value={targetSearch}
                            onChange={e => setTargetSearch(e.target.value)}
                          />
                        </div>
                        <ScrollArea className="h-40">
                          {filteredTargetRows.map(r => (
                            <button
                              key={r.id}
                              className="w-full text-left p-2 hover:bg-muted text-[10px] flex flex-col"
                              onClick={() => { setSolverTargetRow(r.id); setTargetSearch(''); }}
                            >
                              <span className="font-bold">{r.cls}</span>
                              <span className="text-muted-foreground truncate">{r.label}</span>
                            </button>
                          ))}
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase text-muted-foreground">Valor Deseado</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      className="h-8 text-[10px] font-mono"
                      value={solverTargetValue}
                      onChange={e => setSolverTargetValue(e.target.value)}
                    />
                  </div>
               </div>

               <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase text-muted-foreground">Variable a Ajustar</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full justify-between font-mono text-[10px]">
                        {solverVariableRow}
                        <ChevronDown className="w-3 h-3 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[200px]" align="start">
                      <div className="flex items-center border-b p-2">
                        <Search className="w-3 h-3 mr-2 opacity-50" />
                        <input
                          className="bg-transparent text-xs outline-none w-full"
                          placeholder="Buscar variable..."
                          value={variableSearch}
                          onChange={e => setVariableSearch(e.target.value)}
                        />
                      </div>
                      <ScrollArea className="h-40">
                        {filteredVariableRows.map(r => (
                          <button
                            key={r.id}
                            className="w-full text-left p-2 hover:bg-muted text-[10px] flex flex-col"
                            onClick={() => { setSolverVariableRow(r.id); setVariableSearch(''); }}
                          >
                            <span className="font-bold">{r.cls}</span>
                            <span className="text-muted-foreground truncate">{r.label}</span>
                          </button>
                        ))}
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
               </div>

               <Button
                variant="secondary"
                size="sm"
                className="w-full gap-2 text-[10px] font-black uppercase tracking-widest"
                disabled={isSolverRunning}
                onClick={handleRunAdvancedSolver}
               >
                 {isSolverRunning ? (
                   <RotateCcw className="w-3 h-3 animate-spin" />
                 ) : (
                   <Calculator className="w-3 h-3" />
                 )}
                 Ejecutar Solver
               </Button>
            </div>

            {isSimulating && (
              <div className="flex gap-2 pt-2 animate-in fade-in slide-in-from-bottom-2">
                <Button className="flex-1 gap-2" size="sm" onClick={applySimulation}>
                  <Check className="w-4 h-4" /> Aplicar Cambios
                </Button>
                <Button variant="outline" className="flex-1 gap-2" size="sm" onClick={cancelSimulation}>
                  <X className="w-4 h-4" /> Descartar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 border-blue-500/5">
          <CardHeader className="bg-blue-500/5 border-b border-blue-500/10">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-blue-500" />
              Gastos Indirectos
            </CardTitle>
            <CardDescription>
              Configuración de coeficientes y prorrateo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-lg mb-4">
              <Button
                variant={data.indirectConfig?.mode !== 'fixed' ? 'secondary' : 'ghost'}
                size="sm"
                className="flex-1 h-8 text-[10px] uppercase font-bold"
                onClick={() => updateIndirectConfig({ mode: 'coefficient' })}
              >
                <Percent className="w-3 h-3 mr-1" /> Coeficiente
              </Button>
              <Button
                variant={data.indirectConfig?.mode === 'fixed' ? 'secondary' : 'ghost'}
                size="sm"
                className="flex-1 h-8 text-[10px] uppercase font-bold"
                onClick={() => updateIndirectConfig({ mode: 'fixed' })}
              >
                <DollarSign className="w-3 h-3 mr-1" /> Monto Fijo
              </Button>
            </div>

            {data.indirectConfig?.mode === 'fixed' ? (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Monto Indirecto Total</label>
                  <div className="relative">
                    <DollarSign className="w-3 h-3 absolute left-2 top-2.5 text-muted-foreground" />
                    <Input
                      type="number"
                      className="w-32 h-9 pl-6 text-right font-mono"
                      value={data.indirectConfig?.fixedAmount || 0}
                      onChange={(e) => updateIndirectConfig({ fixedAmount: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Coeficiente de Gastos</label>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-6 w-6" title="Auto-calcular basado en selección" onClick={handleAutoCalculateCoefficient}>
                      <Calculator className="w-3 h-3" />
                    </Button>
                    <Badge variant="outline" className="text-blue-600 font-mono">
                      x {data.indirectConfig?.coefficient?.toFixed(4) || "1.0000"}
                    </Badge>
                  </div>
                </div>
                <Slider
                  value={[data.indirectConfig?.coefficient || 1]}
                  min={0.5}
                  max={2.0}
                  step={0.0001}
                  onValueChange={([val]) => updateIndirectConfig({ coefficient: val })}
                />
              </div>
            )}

            <div className="pt-4 border-t space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-xs uppercase text-muted-foreground flex items-center gap-2">
                  <Layers className="w-3 h-3" /> Secciones Afectadas
                </Label>
                <Badge variant="secondary" className="text-[9px] uppercase tracking-tighter">
                  {data.indirectConfig?.selectedSections?.length || 0} Seleccionadas
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                {data.sections.filter(s => !['13', '13.1', '13.2', '13.3', '14', '14.1'].includes(s.id)).map(section => (
                  <div key={section.id} className="flex items-center space-x-2 border rounded-md p-2 hover:bg-muted/50 transition-colors">
                    <Checkbox
                      id={`section-${section.id}`}
                      checked={data.indirectConfig?.selectedSections?.includes(section.id)}
                      onCheckedChange={() => handleIndirectSectionToggle(section.id)}
                    />
                    <label
                      htmlFor={`section-${section.id}`}
                      className="text-[10px] font-bold uppercase leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 truncate"
                    >
                      {section.label || `Sección ${section.id}`}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t space-y-3">
               <div className="flex justify-between items-center">
                  <Label className="text-xs uppercase text-muted-foreground flex items-center gap-2">
                    <Target className="w-3 h-3" /> Sección Base (Auto-calc)
                  </Label>
               </div>
               <div className="grid grid-cols-1 gap-2">
                  <select
                    className="w-full h-9 bg-background border rounded-md px-3 text-xs font-medium"
                    value={data.indirectConfig?.baseSection || '2'}
                    onChange={(e) => updateIndirectConfig({ baseSection: e.target.value })}
                  >
                    {data.sections.map(s => (
                      <option key={s.id} value={s.id}>{s.label || `Sección ${s.id}`}</option>
                    ))}
                  </select>
               </div>
            </div>

            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex gap-3">
              <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-blue-700 leading-relaxed uppercase font-medium">
                {data.indirectConfig?.mode === 'fixed'
                  ? 'El monto fijo se prorrateará entre las secciones seleccionadas según su peso relativo.'
                  : 'El coeficiente se aplica como un multiplicador directo a las secciones seleccionadas.'
                }
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="w-4 h-4" />
          <span>Fórmula de utilidad actual: </span>
          <code className="bg-background px-2 py-0.5 rounded border text-xs">
            {utilityRow?.formula || 'No definida'}
          </code>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <RotateCcw className="w-4 h-4" /> Resetear
          </Button>
          <Button size="sm" className="gap-2">
            <Save className="w-4 h-4" /> Guardar Cambios
          </Button>
        </div>
      </div>
    </div>
  );
};
export default CostSheetSummary;
