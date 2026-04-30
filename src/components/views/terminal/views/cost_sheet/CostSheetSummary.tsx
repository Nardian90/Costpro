import React, { useMemo, useRef, useState } from 'react';
import {
  Calculator,
  RotateCcw,
  Wand2,
  Search,
  ChevronDown,
  Check,
  XCircle,
  ArrowRight,
  Info,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useCostSheetCalculator } from '@/hooks/logic/useCostSheetCalculator';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { solveForTarget } from '@/lib/cost-engine/solver';
import { buildEngineFicha } from '@/lib/cost-engine/build-ficha';
import { calculateFicha } from '@/lib/cost-engine';
import { CostSheetRow, CostSheetData } from '@/types/cost-sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { BaseModal } from "@/components/ui/BaseModal";
import { Badge } from "@/components/ui/badge";
import { produce } from 'immer';

interface SolverResultData {
  found: boolean;
  value: number;
  targetRow: string;
  variableRow: string;
  variableRowLabel: string;
  targetRowLabel: string;
  variableRowPath: (string | number)[];
  originalFormula: string | null;
  originalCalcMethod: string | null;
  originalVH: number;
  targetValue: number;
  simulatedTargetTotal: number;
}

export const CostSheetSummary: React.FC = () => {
  const { data, updateValues } = useCostSheetStore();
  const { calculatedValues } = useCostSheetCalculator(data);

  // Solver state
  const [solverTargetRow, setSolverTargetRow] = useState<string>('14.1');
  const [solverVariableRow, setSolverVariableRow] = useState<string>('13.1');
  const [solverTargetValue, setSolverTargetValue] = useState<string>('');
  const [isSolverRunning, setIsSolverRunning] = useState(false);

  const [targetSearch, setTargetSearch] = useState('');
  const [variableSearch, setVariableSearch] = useState('');

  const [solverResult, setSolverResult] = useState<SolverResultData | null>(null);
  const [showSolverDialog, setShowSolverDialog] = useState(false);

  // Ref guard to prevent double solver invocations (e.g. rapid clicks, Strict Mode edge cases)
  const isSolvingRef = useRef(false);
  const isConfirmingRef = useRef(false);

  // Memos for KPI cards
  const utilityRow = useMemo(() => {
    for (const section of data.sections) {
      const row = section.rows.find(r => ['13', '13.1'].includes(r.id));
      if (row) return row;
    }
    return null;
  }, [data.sections]);

  const totalCost = useMemo(() => {
    const costRow = data.sections.flatMap(s => s.rows).find(r => ['12', '12.1'].includes(r.id));
    return costRow ? (calculatedValues[costRow.id]?.total || 0) : 0;
  }, [data.sections, calculatedValues]);

  // All rows flattened for search/select
  const allRows = useMemo(() => {
    const flattened: { id: string; label: string; cls: string }[] = [];
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

  // Find the current formula of the selected variable row (for info display)
  const variableRowInfo = useMemo(() => {
    for (const section of data.sections) {
      const row = section.rows.find(r =>
        r.id === solverVariableRow || r.classification === solverVariableRow
      );
      if (row) {
        return {
          formula: row.formula || row.totalFormula || null,
          calcMethod: row.calculationMethod || 'ValorFijo',
          label: row.label,
        };
      }
    }
    return null;
  }, [data.sections, solverVariableRow]);

  // Helper: simulate a value through the FULL engine pipeline to verify solver result.
  // CRITICAL: This must replicate EXACTLY what handleSolverConfirm does + the normal
  // calculation pipeline (useCostSheetCalculator). Uses buildEngineFicha which is the
  // same mapping logic as the hook.
  const simulateForVerification = (
    uiData: CostSheetData,
    targetRowId: string,
    variableRowId: string,
    variableValue: number
  ): number => {
    const findAndModifyRow = (rows: CostSheetRow[], id: string, val: number): boolean => {
      for (const row of rows) {
        if (row.id === id || row.classification === id) {
          // Replicate exactly what handleSolverConfirm sets
          row.valorHistorico = val;
          row.value = val;
          row.formula = undefined;
          (row as any).totalFormula = undefined;
          row.calculationMethod = 'ValorFijo';
          row.isPercent = false;
          (row as any).is_percent = false;
          return true;
        }
        if (row.children && findAndModifyRow(row.children, id, val)) return true;
      }
      return false;
    };

    const simulatedData = produce(uiData, (draft: any) => {
      for (const section of draft.sections) {
        if (findAndModifyRow(section.rows, variableRowId, variableValue)) break;
      }
    });

    // Use the SAME engine pipeline as useCostSheetCalculator
    const engineFicha = buildEngineFicha(simulatedData);

    const calcResult = calculateFicha(engineFicha);
    const targetRowResult = calcResult.rows.find(
      (r: any) => r.id === targetRowId || r.classification === targetRowId
    );
    return targetRowResult ? targetRowResult.total : calcResult.summary.grandTotal;
  };

  // Run solver
  const handleRunAdvancedSolver = () => {
    const numericTarget = parseFloat(solverTargetValue);
    if (isNaN(numericTarget)) {
      toast.error('Por favor, ingrese un valor objetivo válido');
      return;
    }

    // Guard: prevent double invocation if already solving
    if (isSolvingRef.current) {
      console.warn('[CostSheetSummary] Solver already running, skipping duplicate call.');
      return;
    }
    isSolvingRef.current = true;
    setIsSolverRunning(true);

    // Use setTimeout to let UI update before heavy computation
    setTimeout(() => {
      try {
        // 1. Find the variable row and back up its original state
        let variableRowPath: (string | number)[] | null = null;
        let originalFormula: string | null = null;
        let originalCalcMethod: string | null = null;
        let originalVH = 0;
        let variableRowLabel = solverVariableRow;

        for (let sIdx = 0; sIdx < data.sections.length; sIdx++) {
          const section = data.sections[sIdx];
          for (let rIdx = 0; rIdx < section.rows.length; rIdx++) {
            const row = section.rows[rIdx];
            if (row.id === solverVariableRow || row.classification === solverVariableRow) {
              variableRowPath = ['sections', sIdx, 'rows', rIdx];
              originalFormula = row.formula || row.totalFormula || null;
              originalCalcMethod = row.calculationMethod || null;
              originalVH = row.valorHistorico ?? row.value ?? 0;
              variableRowLabel = row.label || solverVariableRow;
              break;
            }
          }
          if (variableRowPath) break;
        }

        if (!variableRowPath) {
          toast.error(`No se pudo encontrar la fila variable "${solverVariableRow}"`);
          setIsSolverRunning(false);
          isSolvingRef.current = false;
          return;
        }

        // 2. Find target row label
        let targetRowLabel = solverTargetRow;
        for (const section of data.sections) {
          const row = section.rows.find(r => r.id === solverTargetRow || r.classification === solverTargetRow);
          if (row) {
            targetRowLabel = row.label || solverTargetRow;
            break;
          }
        }

        // 3. Run solver
        const result = solveForTarget(data, solverTargetRow, numericTarget, solverVariableRow);

        // 4. Verify result with full engine calculation
        const simulatedTargetTotal = simulateForVerification(data, solverTargetRow, solverVariableRow, result);
        const achievedDiff = Math.abs(simulatedTargetTotal - numericTarget);

        // Warn if result is too far off (variable may not affect target)
        if (achievedDiff > Math.abs(numericTarget) * 0.05 && Math.abs(result) < 0.01) {
          toast.warning('La variable seleccionada puede no tener efecto suficiente sobre la fila objetivo.');
        }

        // 5. Show result dialog
        setSolverResult({
          found: true,
          value: result,
          targetRow: solverTargetRow,
          variableRow: solverVariableRow,
          variableRowLabel,
          targetRowLabel,
          variableRowPath,
          originalFormula,
          originalCalcMethod,
          originalVH,
          targetValue: numericTarget,
          simulatedTargetTotal,
        });

        setShowSolverDialog(true);
        toast.success(`Solver completado: ${variableRowLabel} → ${result.toFixed(4)}`);
      } catch (e: any) {
        console.error('Solver error:', e);
        toast.error(`Error al ejecutar el solver: ${e.message || 'Error desconocido'}`);
        // Reset solver state to prevent stale UI on error
        setSolverResult(null);
        setShowSolverDialog(false);
      } finally {
        setIsSolverRunning(false);
        isSolvingRef.current = false;
      }
    }, 50);
  };

  // Save: permanently replace formula with fixed value
  const handleSolverConfirm = () => {
    if (!solverResult?.variableRowPath) return;

    // Guard: prevent double-confirm (e.g. rapid clicks on the confirm button)
    if (isConfirmingRef.current) {
      console.warn('[CostSheetSummary] Solver confirm already in progress, skipping duplicate.');
      return;
    }
    isConfirmingRef.current = true;

    const path = solverResult.variableRowPath;
    const val = solverResult.value;

    updateValues([
      { path: [...path, 'valorHistorico'], value: val },
      { path: [...path, 'value'], value: val },
      { path: [...path, 'formula'], value: null },
      { path: [...path, 'totalFormula'], value: null },
      { path: [...path, 'calculationMethod'], value: 'ValorFijo' },
      { path: [...path, 'isPercent'], value: false },
      { path: [...path, 'is_percent'], value: false },
    ]);

    setShowSolverDialog(false);
    setSolverResult(null);
    isConfirmingRef.current = false;
    toast.success(
      `Cambio guardado permanentemente: ${solverResult.variableRowLabel} = ${formatCurrency(val)} (fórmula removida)`
    );
  };

  // Cancel: restore, do nothing
  const handleSolverCancel = () => {
    setShowSolverDialog(false);
    setSolverResult(null);
    toast.info('Operación cancelada. La fórmula original se mantiene intacta.');
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase font-bold tracking-widest text-primary/60">
              Costo Directo
            </CardDescription>
            <CardTitle className="text-2xl font-black font-mono">
              {formatCurrency(totalCost)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-green-50/50 border-green-100 dark:bg-green-950/20 dark:border-green-900/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase font-bold tracking-widest text-green-600/60 dark:text-green-400/60">
              Utilidad Bruta
            </CardDescription>
            <CardTitle className="text-2xl font-black font-mono text-green-700 dark:text-green-400">
              {formatCurrency(calculatedValues[utilityRow?.id || '13.1']?.total || 0)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-blue-50/50 border-blue-100 dark:bg-blue-950/20 dark:border-blue-900/30">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] uppercase font-bold tracking-widest text-blue-600/60 dark:text-blue-400/60">
              Precio Final (100%)
            </CardDescription>
            <CardTitle className="text-2xl font-black font-mono text-blue-700 dark:text-blue-400">
              {formatCurrency(calculatedValues['14.1']?.total || calculatedValues['14']?.total || 0)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Solver Avanzado */}
      <Card className="overflow-hidden border-2 border-primary/10">
        <CardHeader className="bg-primary/5 border-b border-primary/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-primary/10 rounded-lg">
                <Wand2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Solver Avanzado</CardTitle>
                <CardDescription className="text-[10px]">
                  Defina un objetivo y la variable a ajustar. El solver encontrará el valor
                  (positivo o negativo) que hace la fila objetivo igual al valor deseado.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-[9px] uppercase tracking-wider font-bold hidden sm:flex">
              Goal Seek
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          {/* Info: current formula of variable row */}
          {variableRowInfo?.formula && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3 flex items-start gap-3">
              <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-[10px] text-amber-800 dark:text-amber-200 leading-relaxed">
                <span className="font-bold uppercase tracking-wider">Fórmula actual en {variableRowInfo.label} ({solverVariableRow}):</span>
                <code className="block mt-1 bg-amber-100 dark:bg-amber-900/40 px-2 py-1 rounded font-mono text-[10px]">
                  {variableRowInfo.formula}
                </code>
                <span className="block mt-1 opacity-75">
                  El solver reemplazará esta fórmula por un valor fijo si confirma el cambio.
                </span>
              </div>
            </div>
          )}

          {/* Target Row + Desired Value */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">
                Fila Objetivo
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-between font-mono text-xs h-9"
                  >
                    <span className="truncate">{solverTargetRow}</span>
                    <ChevronDown className="w-3 h-3 opacity-50 shrink-0 ml-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[240px]" align="start">
                  <div className="flex items-center border-b p-2">
                    <Search className="w-3 h-3 mr-2 opacity-50" />
                    <input
                      className="bg-transparent text-xs outline-none w-full"
                      placeholder="Buscar fila..."
                      value={targetSearch}
                      onChange={(e) => setTargetSearch(e.target.value)}
                    />
                  </div>
                  <ScrollArea className="h-48">
                    {filteredTargetRows.map((r) => (
                      <button
                        key={r.id}
                        className="w-full text-left p-2 hover:bg-muted text-xs flex flex-col transition-colors"
                        onClick={() => {
                          setSolverTargetRow(r.id);
                          setTargetSearch('');
                        }}
                      >
                        <span className="font-bold font-mono text-[10px]">{r.cls}</span>
                        <span className="text-muted-foreground truncate text-[11px]">{r.label}</span>
                      </button>
                    ))}
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">
                Valor Objetivo Deseado
              </Label>
              <Input
                type="number"
                placeholder="Ej: 1500.00"
                className="h-9 text-xs font-mono"
                value={solverTargetValue}
                onChange={(e) => setSolverTargetValue(e.target.value)}
              />
            </div>
          </div>

          {/* Variable to Adjust */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">
              Variable a Ajustar (se eliminará su fórmula)
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between font-mono text-xs h-9"
                >
                  <span className="truncate">{solverVariableRow}</span>
                  <ChevronDown className="w-3 h-3 opacity-50 shrink-0 ml-1" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[240px]" align="start">
                <div className="flex items-center border-b p-2">
                  <Search className="w-3 h-3 mr-2 opacity-50" />
                  <input
                    className="bg-transparent text-xs outline-none w-full"
                    placeholder="Buscar variable..."
                    value={variableSearch}
                    onChange={(e) => setVariableSearch(e.target.value)}
                  />
                </div>
                <ScrollArea className="h-48">
                  {filteredVariableRows.map((r) => (
                    <button
                      key={r.id}
                      className="w-full text-left p-2 hover:bg-muted text-xs flex flex-col transition-colors"
                      onClick={() => {
                        setSolverVariableRow(r.id);
                        setVariableSearch('');
                      }}
                    >
                      <span className="font-bold font-mono text-[10px]">{r.cls}</span>
                      <span className="text-muted-foreground truncate text-[11px]">{r.label}</span>
                    </button>
                  ))}
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>

          {/* Visual flow indicator */}
          <div className="flex items-center justify-center gap-2 py-1 text-[10px] text-muted-foreground">
            <span className="font-mono bg-muted px-2 py-0.5 rounded">{solverVariableRow}</span>
            <ArrowRight className="w-3 h-3" />
            <span className="font-mono bg-primary/10 text-primary px-2 py-0.5 rounded font-bold">
              {solverTargetValue || '???'}
            </span>
            <ArrowRight className="w-3 h-3" />
            <span className="font-mono bg-muted px-2 py-0.5 rounded">{solverTargetRow}</span>
          </div>

          {/* Execute Button */}
          <Button
            variant="default"
            size="sm"
            className="w-full gap-2 text-xs font-black uppercase tracking-widest h-10"
            disabled={isSolverRunning || !solverTargetValue}
            onClick={handleRunAdvancedSolver}
          >
            {isSolverRunning ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" />
                Calculando...
              </>
            ) : (
              <>
                <Calculator className="w-4 h-4" />
                Ejecutar Solver
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Solver Result Confirmation Dialog */}
      <BaseModal
        open={showSolverDialog}
        onOpenChange={(open) => {
          if (!open) {
            handleSolverCancel();
          }
        }}
        title="Resultado del Solver"
        footer={
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={handleSolverCancel}
              className="flex-1 sm:flex-none gap-2"
            >
              <XCircle className="w-3.5 h-3.5" />
              Cancelar (Restaurar)
            </Button>
            <Button
              variant="default"
              onClick={handleSolverConfirm}
              className="flex-1 sm:flex-none gap-2"
            >
              <Check className="w-3.5 h-3.5" />
              Guardar Permanentemente
            </Button>
          </div>
        }
      >
        {solverResult && (
          <div className="space-y-4">
            {/* Result Summary */}
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  Solución Encontrada
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">Variable</span>
                  <span className="font-bold font-mono text-sm">
                    {solverResult.variableRowLabel} ({solverResult.variableRow})
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">Valor Propuesto</span>
                  <span className="font-black font-mono text-lg text-primary">
                    {formatCurrency(solverResult.value)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">Objetivo en {solverResult.targetRowLabel}</span>
                  <span className="font-bold font-mono text-sm">
                    {formatCurrency(solverResult.targetValue)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-xs text-muted-foreground">Valor Alcanzado</span>
                  <span className="font-bold font-mono text-sm">
                    {formatCurrency(solverResult.simulatedTargetTotal)}
                  </span>
                </div>
                {Math.abs(solverResult.simulatedTargetTotal - solverResult.targetValue) > 0.01 && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-lg p-2">
                    <span className="text-[10px] text-amber-700 dark:text-amber-300 font-medium">
                      Aproximación: diferencia de {formatCurrency(Math.abs(solverResult.simulatedTargetTotal - solverResult.targetValue))} con el objetivo exacto.
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Original Formula Info */}
            {solverResult.originalFormula && (
              <div className="bg-muted/30 border border-border/50 rounded-xl p-4 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Fórmula Original (se eliminará si guarda)
                </span>
                <code className="block bg-background px-3 py-2 rounded-lg border font-mono text-xs text-foreground">
                  {solverResult.originalFormula}
                </code>
              </div>
            )}

            {/* Warning text */}
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              <strong>Guardar:</strong> La fórmula será reemplazada permanentemente por el valor fijo{' '}
              <code className="bg-muted px-1 py-0.5 rounded font-mono">
                {solverResult.value.toFixed(4)}
              </code>.
              <br />
              <strong>Cancelar:</strong> Se mantiene la fórmula original sin cambios.
            </p>
          </div>
        )}
      </BaseModal>
    </div>
  );
};

export default CostSheetSummary;
