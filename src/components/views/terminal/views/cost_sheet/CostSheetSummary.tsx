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
  Target
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

export const CostSheetSummary: React.FC = () => {
  const { data, updateUtilityFormula, updateIndirectConfig } = useCostSheetStore();
  const { calculatedValues } = useCostSheetCalculator(data);

  // Local state for "Precio de Venta Objetivo" simulation
  const [targetPrice, setTargetPrice] = useState<string>('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [tempUtility, setTempUtility] = useState<number>(0);

  const utilityRow = useMemo(() => {
    for (const section of data.sections) {
      const row = section.rows.find(r => r.id === '13');
      if (row) return row;
    }
    return null;
  }, [data]);

  const currentUtilityPercent = useMemo(() => {
    if (!utilityRow?.formula) return 0;
    const match = utilityRow.formula.match(/\*\s*([0-9.]+)/);
    return match ? parseFloat(match[1]) * 100 : 0;
  }, [utilityRow]);

  useEffect(() => {
    if (!isSimulating) {
      setTempUtility(currentUtilityPercent);
    }
  }, [currentUtilityPercent, isSimulating]);

  const totalCost = calculatedValues['12']?.total || 0;
  const salePrice = calculatedValues['14']?.total || 0;
  const utilityValue = calculatedValues['13']?.total || 0;

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
  };

  const cancelSimulation = () => {
    setIsSimulating(false);
    setTargetPrice('');
    setTempUtility(currentUtilityPercent);
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" />
              Precio de Venta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {formatCurrency(salePrice)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Final al consumidor
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calculator className="w-4 h-4 text-blue-500" />
              Costo Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalCost)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Base acumulada (Sección 12)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Percent className="w-4 h-4 text-green-500" />
              % de Utilidad
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {isSimulating ? tempUtility.toFixed(2) : currentUtilityPercent.toFixed(2)}%
            </div>
            <Progress value={Math.min(100, isSimulating ? tempUtility : currentUtilityPercent)} className="h-1.5 mt-2" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Simulador de Margen y Precio
            </CardTitle>
            <CardDescription>
              Ajuste el % de utilidad o defina un precio objetivo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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

            {isSimulating && (
              <div className="flex gap-2 pt-2">
                <Button className="flex-1 gap-2" size="sm" onClick={applySimulation}>
                  <Check className="w-4 h-4" /> Aplicar
                </Button>
                <Button variant="outline" className="flex-1 gap-2" size="sm" onClick={cancelSimulation}>
                  <X className="w-4 h-4" /> Cancelar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-blue-500" />
              Gastos Indirectos
            </CardTitle>
            <CardDescription>
              Configuración de coeficientes y prorrateo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                {data.sections.filter(s => s.id !== '13' && s.id !== '14').map(section => (
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
