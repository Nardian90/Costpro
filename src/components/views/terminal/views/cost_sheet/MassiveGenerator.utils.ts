import JSZip from 'jszip';
import { toast } from 'sonner';
import { useAuthStore } from '@/store';
import { calculateFicha } from '@/lib/cost-engine';
import { FichaJSON, CostRow, RowSemanticType, FormaCalculo, BaseRef } from '@/lib/cost-engine/types';
import { MassiveResult, ProductItem, RunMassiveGenerationParams } from './MassiveGenerator.types';

// --- prepareFichaForProduct (pure function, no React hooks) ---

export function prepareFichaForProduct(
  baseSheet: Record<string, unknown>,
  product: ProductItem
): FichaJSON {
  const engineRows: CostRow[] = [];

  // Helper for VH sums (from useCostSheetCalculator)
  const vhSums: Record<string, number> = {};
  const calculateVH = (rows: Record<string, unknown>[]) => {
    (rows || []).forEach((r) => {
      const children = r.children as Record<string, unknown>[] | undefined;
      if (children && children.length > 0) {
        calculateVH(children);
        vhSums[r.id as string] = children.reduce(
          (sum: number, child: Record<string, unknown>) => {
            const val =
              vhSums[child.id as string] ??
              (child.valorHistorico as number | undefined) ??
              (child.value as number | undefined) ??
              0;
            return sum + val;
          },
          0
        );
      } else {
        vhSums[r.id as string] =
          (r.valorHistorico as number | undefined) ??
          (r.value as number | undefined) ??
          0;
      }
    });
  };
  const sections = baseSheet?.sections as Record<string, unknown>[] | undefined;
  (sections || []).forEach((s: Record<string, unknown>) =>
    calculateVH(s?.rows as Record<string, unknown>[] ?? [])
  );

  const flatten = (uiRows: Record<string, unknown>[], parentId?: string) => {
    (uiRows || []).forEach((r) => {
      let type: RowSemanticType = 'COST';
      const rId = r.id as string;
      if (['13', '13.1'].includes(rId)) type = 'MARGIN';
      if (rId === '13.2') type = 'TAX';
      if (['14', '12', '5', '11'].includes(rId)) type = 'TOTAL';

      let formula = (r.formula as string | undefined) || (r.totalFormula as string | undefined);
      const children = r.children as Record<string, unknown>[] | undefined;
      const hasChildren = !!(children && children.length > 0);
      const isPercent = (r.isPercent as boolean | undefined) ?? (r.is_percent as boolean | undefined);

      if (!formula && hasChildren && r.calculationMethod !== 'ValorFijo') {
        formula = '=sum(children)';
      }

      let formaCalculo: FormaCalculo = 'FIJO';
      if (r.calculationMethod === 'Prorrateo') formaCalculo = 'PRORRATEO';
      if (isPercent) formaCalculo = 'COEFICIENTE';
      if (formula) formaCalculo = 'FORMULA';

      let baseCalculo: BaseRef | null = null;
      const baseRefId = (r.baseDeCalculoRef as string | undefined) || (r.base_ref as string | undefined);
      if (baseRefId) {
        const annexes = (baseSheet?.annexes || []) as Record<string, unknown>[];
        const isAnnex =
          annexes.some((a: Record<string, unknown>) => a.id === baseRefId) ||
          /^[IVXLC]+$/.test(baseRefId);
        if (isAnnex) {
          baseCalculo = { type: 'ANEXO', anexoId: baseRefId };
          if (
            r.calculationMethod !== 'Prorrateo' &&
            !r.formula &&
            !r.totalFormula
          ) {
            formaCalculo = 'IMPORTAR_ANEXO';
          }
        } else {
          baseCalculo = { type: 'FILA', classification: baseRefId };
        }
      }

      // Standardize formula for engine
      let finalFormula = formula;
      if (finalFormula?.trim() === '=sum(children)' && children) {
        const childRefs = children
          .map((c: Record<string, unknown>) => `ref('${c.id}')`)
          .join(', ');
        finalFormula = `sum(${childRefs})`;
      }

      engineRows.push({
        id: rId,
        parentId,
        classification: rId,
        label: r.label as string,
        type,
        formaCalculo,
        valorHistorico:
          vhSums[rId] ??
          (r.valorHistorico as number | undefined) ??
          (r.value as number | undefined) ??
          0,
        baseCalculo,
        coeficiente: isPercent
          ? ((r.value as number | undefined) ?? (r.valorHistorico as number | undefined) ?? 0)
          : ((r.coeficiente as number | undefined) ?? 0),
        formula: finalFormula,
      });

      if (hasChildren) flatten(children, rId);
    });
  };
  (sections || []).forEach((s: Record<string, unknown>) =>
    flatten(s?.rows as Record<string, unknown>[] ?? [])
  );

  // Prepare Anexo I for this product
  const baseAnnexes = (baseSheet?.annexes || []) as Record<string, unknown>[];
  const annexes = baseAnnexes.map((a: Record<string, unknown>) => {
    const aId = a.id as string;
    if (aId === 'I' || aId === '1') {
      const aData = (a.data || []) as Record<string, unknown>[];
      const existingRows = aData.map((d: Record<string, unknown>) => ({
        ...d,
        classification: String(
          d.classification || d.label || ''
        )
          .split(' - ')[0]
          .trim(),
        importe:
          (d.total as number | undefined) ||
          (d.amount as number | undefined) ||
          (d.depreciation_cost as number | undefined) ||
          (d.price_total as number | undefined) ||
          0,
      }));

      const basePrice = (product.cost as number | undefined) || (product.price as number | undefined) || 0;
      const prodQty = (product.quantity as number | undefined) || 1;
      const prodUm =
        (product.um as string | undefined) ||
        (product.unit_of_measure as string | undefined) ||
        'u';

      return {
        ...a,
        rows: [
          ...existingRows,
          {
            classification: '1.1',
            code: product.sku || '',
            description: product.name || '',
            um: prodUm,
            consumption_norm: prodQty,
            price: basePrice,
            importe: basePrice * prodQty,
            total: basePrice * prodQty,
          },
        ],
      };
    }

    const aData = (a.data || []) as Record<string, unknown>[];
    return {
      ...a,
      rows: aData.map((d: Record<string, unknown>) => ({
        classification: String(
          d.classification || d.label || ''
        )
          .split(' - ')[0]
          .trim(),
        importe:
          (d.total as number | undefined) ||
          (d.amount as number | undefined) ||
          (d.depreciation_cost as number | undefined) ||
          (d.price_total as number | undefined) ||
          0,
      })),
    };
  });

  const header = (baseSheet?.header || {}) as Record<string, unknown>;

  return {
    meta: {
      ...header,
      id: product.sku || 'export',
      name: `Ficha: ${product.name}`,
      currency: (header.currency as string) || 'CUP',
      decimals: 2,
      quantity: 1,
      settings: { allowFormulas: true },
    },
    anexos: annexes.map((a: Record<string, unknown>) => ({
      id: a.id as string,
      name: a.title as string,
      rows: (a.rows as Record<string, unknown>[]) ?? [],
    })) as any,
    rows: engineRows,
  };
}

// --- runMassiveGeneration (standalone async function) ---

export async function runMassiveGeneration(params: RunMassiveGenerationParams): Promise<void> {
  const {
    isQuickAction,
    products,
    selectedIds,
    currentSheet,
    mappingConfig,
    exportOptions,
    setIsProcessing,
    isProcessingRef,
    setResults,
    setCurrentIndex,
    setProgress,
  } = params;

  if (products.length === 0) {
    toast.error('No hay productos cargados para procesar.');
    return;
  }

  setIsProcessing(true);
  isProcessingRef.current = true;

  const initialResults: MassiveResult[] = products.map((p) => ({
    sku: p.sku || 'N/A',
    name: p.name || '',
    cost: 0,
    salePrice: 0,
    utility: 0,
    status: 'pending' as const,
  }));
  setResults(initialResults);

  const zip = new JSZip();
  const blobs: { name: string; blob: Blob }[] = [];

  const itemsToProcess = products.filter((p) => selectedIds.has(p.sku || ''));

  for (let i = 0; i < itemsToProcess.length; i++) {
    if (!isProcessingRef.current) {
      toast.info('Proceso cancelado por el usuario');
      break;
    }

    setCurrentIndex(i);
    const product = itemsToProcess[i];

    try {
      setResults((prev) =>
        prev.map((r) =>
          r.sku === (product.sku || '')
            ? { ...r, status: 'processing' as const }
            : r
        )
      );

      // 1. Prepare
      const ficha = prepareFichaForProduct(currentSheet, product);

      // 2. Calculate
      let result = calculateFicha(ficha);

      // 3. Smart Adjustment if Target Price is set
      const targetPrice =
        (product.salePrice as number | undefined) ||
        (product.sale_price as number | undefined);
      if (
        (mappingConfig.targetColumn === 'price' ||
          mappingConfig.targetColumn === 'sale_price') &&
        targetPrice &&
        targetPrice > 0
      ) {
        const modRowId = mappingConfig.modificationRow || '13.1';
        let currentPrice = result.summary.grandTotal;

        if (Math.abs(currentPrice - targetPrice) > 0.01) {
          const rowIndex = ficha.rows.findIndex(
            (r) => r.id === modRowId || r.classification === modRowId
          );
          if (rowIndex !== -1) {
            // Try sensitivity via valorHistorico
            const originalVal = ficha.rows[rowIndex].valorHistorico;
            ficha.rows[rowIndex].valorHistorico = (originalVal || 0) + 10;
            const result2 = calculateFicha(ficha);
            const price2 = result2.summary.grandTotal;
            const sensitivity = (price2 - currentPrice) / 10;

            if (Math.abs(sensitivity) > 0.0001) {
              const adjustment = (targetPrice - currentPrice) / sensitivity;
              ficha.rows[rowIndex].valorHistorico = (originalVal || 0) + adjustment;
              result = calculateFicha(ficha);
            } else {
              // Try sensitivity via coefficient
              const originalCoef = ficha.rows[rowIndex].coeficiente;
              ficha.rows[rowIndex].coeficiente = (originalCoef || 0) + 0.1;
              const result3 = calculateFicha(ficha);
              const price3 = result3.summary.grandTotal;
              const sensitivityCoef = (price3 - currentPrice) / 0.1;

              if (Math.abs(sensitivityCoef) > 0.0001) {
                const adjustment = (targetPrice - currentPrice) / sensitivityCoef;
                ficha.rows[rowIndex].coeficiente = (originalCoef || 0) + adjustment;
                result = calculateFicha(ficha);
              }
            }
          }
        }
      }

      // Sanity check
      const isInvalid =
        isNaN(result.summary.grandTotal) || result.summary.grandTotal === 0;
      if (isInvalid && result.validationErrors && result.validationErrors.length > 0) {
        throw new Error(`Error de cálculo: ${result.validationErrors[0]}`);
      }

      // 4. Export PDF
      const response = await fetch('/api/cost-sheets/export-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${useAuthStore.getState().token}`,
        },
        body: JSON.stringify({
          ...result,
          sections: (currentSheet as Record<string, unknown>).sections,
          exportOptions: isQuickAction
            ? {
                ...exportOptions,
                pdfFormat: 'standard',
                includeAudit: false,
                includeFC: true,
                alwaysZip: false,
              }
            : exportOptions,
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const fileName = `${product.sku || product.name || 'ficha'}.pdf`;
        blobs.push({ name: fileName, blob });
      } else {
        throw new Error('Failed to generate PDF');
      }

      // 5. Update Result
      setResults((prev) =>
        prev.map((r) =>
          r.sku === (product.sku || '')
            ? {
                ...r,
                status: 'completed' as const,
                cost: result.summary.totalCost,
                salePrice: result.summary.grandTotal,
                utility: result.summary.totalMargin,
              }
            : r
        )
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error processing ${product.name}:`, error);
      setResults((prev) =>
        prev.map((r) =>
          r.sku === (product.sku || '')
            ? { ...r, status: 'error' as const, error: message }
            : r
        )
      );
    }

    setProgress(((i + 1) / itemsToProcess.length) * 100);

    // Small delay to prevent blocking the UI thread
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Process Downloads
  const shouldZip = (isQuickAction ? true : exportOptions.alwaysZip) || blobs.length > 2;

  if (shouldZip && blobs.length > 0) {
    toast.info('Comprimiendo fichas en un archivo ZIP...');
    blobs.forEach((item) => {
      zip.file(item.name, item.blob);
    });
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = window.URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Fichas_Costo_Masivas_${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    toast.success('Archivo ZIP descargado con éxito');
  } else {
    blobs.forEach((item) => {
      const url = window.URL.createObjectURL(item.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    });
  }

  setIsProcessing(false);
  isProcessingRef.current = false;
  toast.success('Generación masiva finalizada');
}
