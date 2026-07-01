import * as XLSX from "@e965/xlsx";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { Product, PaymentMethod } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { SalesCatalogRow, calcSubtotal, PAYMENT_METHODS } from './salesCatalogHelpers';

// ── Public types ──────────────────────────────────────────────

export interface SalesCatalogTotals {
  itemCount: number;
  subtotal: number;
  cashTotal: number;
  transferTotal: number;
}

export interface ExportExcelParams {
  products: Product[];
  rows: Map<string, SalesCatalogRow>;
  activeRows: SalesCatalogRow[];
  totals: SalesCatalogTotals;
  confirmedSaleId: string | null;
}

export interface ExportPDFParams {
  activeRows: SalesCatalogRow[];
  confirmedSaleId: string | null;
}

// ── Export Excel (ALL products, styled) ───────────────────────

export function exportSalesCatalogExcel(params: ExportExcelParams): void {
  const { products, rows, activeRows, totals, confirmedSaleId } = params;
  const title = confirmedSaleId ? 'IPV CONFIRMADO' : 'IPV en proceso';
  const filename = confirmedSaleId
    ? `ipv-confirmado-${Date.now()}.xlsx`
    : `ipv-en-proceso-${Date.now()}.xlsx`;

  // ── Header names ──
  const HEADERS = [
    'Producto', 'SKU', 'UM', 'Stock', 'Costo', 'Cantidad',
    'Precio Venta', 'Tipo Desc.', 'Descuento', 'Forma Pago',
    'Efectivo', 'Transferencia', 'Valor Venta',
    '--- NO EDITAR DEBAJO ---', '_product_id', '_variant_id',
  ];

  // Column color groups: 0=readonly, 1=editable, 2=mixed-only, 3=system
  const COL_GROUP = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 0, 3, 3, 3];

  // Build data rows
  const dataRows = products.map((product) => {
    const existing = rows.get(product.id);
    const row: SalesCatalogRow = existing || {
      product,
      selectedVariantId: null,
      selectedVariant: null,
      quantity: 0,
      price: product.price || 0,
      cost: product.cost_price || 0,
      discountType: null as 'percentage' | 'fixed' | null,
      discountValue: 0,
      paymentMethod: 'mixed' as PaymentMethod,
      cashPaid: 0,
      transferPaid: 0,
    };
    const sub = calcSubtotal(row);
    const isMixed = row.quantity > 0;
    return [
      row.product.name,
      row.product.sku || '',
      row.selectedVariant?.name || row.product.unit_of_measure || 'ud',
      row.product.stock_current ?? 0,
      row.cost,
      row.quantity,
      row.price,
      row.discountType === 'percentage' ? '%' : row.discountType === 'fixed' ? '$' : '',
      row.discountValue,
      PAYMENT_METHODS.find((pm) => pm.value === row.paymentMethod)?.label || 'Mixto',
      isMixed ? row.cashPaid : '',
      isMixed ? row.transferPaid : '',
      row.quantity > 0 ? sub : '',
      '',
      row.product.id,
      row.selectedVariant?.id || '',
    ];
  });

  // ── Style palette ──
  const thinBorder = (color: string) => ({
    top: { style: 'thin' as const, color: { rgb: color } },
    bottom: { style: 'thin' as const, color: { rgb: color } },
    left: { style: 'thin' as const, color: { rgb: color } },
    right: { style: 'thin' as const, color: { rgb: color } },
  });
  const BORDER = thinBorder('CBD5E1');

  const HEADER_READONLY: any = {
    font: { bold: true, sz: 10, color: { rgb: '475569' } },
    fill: { patternType: 'solid', fgColor: { rgb: '94A3B8' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: BORDER,
  };

  const HEADER_EDITABLE: any = {
    font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '16A34A' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: BORDER,
  };

  const HEADER_MIXED: any = {
    font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '2563EB' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: BORDER,
  };

  const HEADER_SYSTEM: any = {
    font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'DC2626' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: BORDER,
  };

  const headerStyles = [HEADER_READONLY, HEADER_EDITABLE, HEADER_MIXED, HEADER_SYSTEM];

  const ROW_READONLY_EVEN: any = {
    font: { sz: 10, color: { rgb: '475569' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F8FAFC' } },
    alignment: { vertical: 'center' },
    border: BORDER,
  };
  const ROW_READONLY_ODD: any = {
    font: { sz: 10, color: { rgb: '475569' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
    alignment: { vertical: 'center' },
    border: BORDER,
  };

  const ROW_EDITABLE_EVEN: any = {
    font: { sz: 10, color: { rgb: '1E293B' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F0FDF4' } },
    alignment: { vertical: 'center' },
    border: BORDER,
  };
  const ROW_EDITABLE_ODD: any = {
    font: { sz: 10, color: { rgb: '1E293B' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'DCFCE7' } },
    alignment: { vertical: 'center' },
    border: BORDER,
  };

  const ROW_MIXED_EVEN: any = {
    font: { sz: 10, color: { rgb: '1E3A5F' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'EFF6FF' } },
    alignment: { vertical: 'center' },
    border: BORDER,
  };
  const ROW_MIXED_ODD: any = {
    font: { sz: 10, color: { rgb: '1E3A5F' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'DBEAFE' } },
    alignment: { vertical: 'center' },
    border: BORDER,
  };

  const ROW_SYSTEM: any = {
    font: { sz: 9, color: { rgb: '94A3B8' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
    alignment: { vertical: 'center' },
    border: thinBorder('E2E8F0'),
  };

  // Active row (quantity > 0) highlight
  const ROW_ACTIVE_READONLY: any = {
    font: { bold: true, sz: 10, color: { rgb: '475569' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'ECFDF5' } },
    alignment: { vertical: 'center' },
    border: thinBorder('86EFAC'),
  };
  const ROW_ACTIVE_EDITABLE: any = {
    font: { bold: true, sz: 10, color: { rgb: '166534' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'BBF7D0' } },
    alignment: { vertical: 'center' },
    border: thinBorder('4ADE80'),
  };
  const ROW_ACTIVE_MIXED: any = {
    font: { bold: true, sz: 10, color: { rgb: '1E40AF' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'BFDBFE' } },
    alignment: { vertical: 'center' },
    border: thinBorder('60A5FA'),
  };

  // ── Build worksheet manually ──
  const ws = XLSX.utils.aoa_to_sheet([]);

  // Row 0: Title bar
  const titleAddr = XLSX.utils.encode_cell({ r: 0, c: 0 });
  ws[titleAddr] = {
    v: title + (confirmedSaleId ? ` — Venta #${confirmedSaleId}` : '') + ` — ${new Date().toLocaleString()}`,
    t: 's',
    s: {
      font: { bold: true, sz: 13, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '0F766E' } },
      alignment: { vertical: 'center' },
      border: BORDER,
    },
  };
  // Fill remaining title cells with same style
  for (let c = 1; c < 16; c++) {
    ws[XLSX.utils.encode_cell({ r: 0, c })] = {
      v: '', t: 's',
      s: {
        fill: { patternType: 'solid', fgColor: { rgb: '0F766E' } },
        border: BORDER,
      },
    };
  }

  // Row 1: Column headers
  for (let c = 0; c < HEADERS.length; c++) {
    ws[XLSX.utils.encode_cell({ r: 1, c })] = {
      v: HEADERS[c], t: 's',
      s: headerStyles[COL_GROUP[c]],
    };
  }

  // Data rows (row 2 onwards)
  for (let i = 0; i < dataRows.length; i++) {
    const data = dataRows[i];
    const qty = Number(data[5]) || 0; // Cantidad column
    const isActive = qty > 0;
    const isEven = i % 2 === 0;

    for (let c = 0; c < HEADERS.length; c++) {
      let style: any;
      const group = COL_GROUP[c];

      if (isActive) {
        if (group === 0) style = ROW_ACTIVE_READONLY;
        else if (group === 1) style = ROW_ACTIVE_EDITABLE;
        else if (group === 2) style = ROW_ACTIVE_MIXED;
        else style = ROW_SYSTEM;
      } else {
        if (group === 0) style = isEven ? ROW_READONLY_EVEN : ROW_READONLY_ODD;
        else if (group === 1) style = isEven ? ROW_EDITABLE_EVEN : ROW_EDITABLE_ODD;
        else if (group === 2) style = isEven ? ROW_MIXED_EVEN : ROW_MIXED_ODD;
        else style = ROW_SYSTEM;
      }

      const val = data[c];
      ws[XLSX.utils.encode_cell({ r: i + 2, c })] = {
        v: val,
        t: typeof val === 'number' ? 'n' : 's',
        s: style,
      };
    }
  }

  // Row totals row
  const totalRowIdx = dataRows.length + 2;
  ws[XLSX.utils.encode_cell({ r: totalRowIdx, c: 0 })] = {
    v: `TOTALES: ${activeRows.length} productos activos`,
    t: 's',
    s: {
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '0F766E' } },
      alignment: { vertical: 'center' },
      border: BORDER,
    },
  };
  // Qty total
  ws[XLSX.utils.encode_cell({ r: totalRowIdx, c: 5 })] = {
    v: totals.itemCount,
    t: 'n',
    s: {
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '16A34A' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: BORDER,
    },
  };
  // Subtotal total
  ws[XLSX.utils.encode_cell({ r: totalRowIdx, c: 12 })] = {
    v: totals.subtotal,
    t: 'n',
    s: {
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '16A34A' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: BORDER,
      numFmt: '#,##0.00',
    },
  };
  // Cash total
  ws[XLSX.utils.encode_cell({ r: totalRowIdx, c: 10 })] = {
    v: totals.cashTotal || '',
    t: totals.cashTotal ? 'n' : 's',
    s: {
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '2563EB' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: BORDER,
    },
  };
  // Transfer total
  ws[XLSX.utils.encode_cell({ r: totalRowIdx, c: 11 })] = {
    v: totals.transferTotal || '',
    t: totals.transferTotal ? 'n' : 's',
    s: {
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '2563EB' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: BORDER,
    },
  };
  // Fill remaining cells in totals row
  for (let c = 1; c < 16; c++) {
    const addr = XLSX.utils.encode_cell({ r: totalRowIdx, c });
    if (!ws[addr]) {
      ws[addr] = {
        v: '', t: 's',
        s: {
          fill: { patternType: 'solid', fgColor: { rgb: '0F766E' } },
          border: BORDER,
        },
      };
    }
  }

  // Update !ref
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRowIdx, c: 15 } });

  // Merges for title row
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 15 } },
  ];

  // Freeze panes: freeze header row + product name column
  ws['!freeze'] = { xSplit: 1, ySplit: 2 };

  // Column widths
  ws['!cols'] = [
    { wch: 32 }, // Producto
    { wch: 14 }, // SKU
    { wch: 10 }, // UM
    { wch: 8 },  // Stock
    { wch: 10 }, // Costo
    { wch: 10 }, // Cantidad
    { wch: 12 }, // Precio Venta
    { wch: 10 }, // Tipo Desc.
    { wch: 10 }, // Descuento
    { wch: 12 }, // Forma Pago
    { wch: 12 }, // Efectivo
    { wch: 14 }, // Transferencia
    { wch: 12 }, // Valor Venta
    { wch: 28 }, // Separator
    { wch: 36 }, // _product_id
    { wch: 36 }, // _variant_id
  ];

  // ── Build "Ayuda" (Help) sheet with professional styling ──
  const COL = ['Columna', 'Descripcion', 'Editable?', 'Ejemplo / Notas'];
  const helpWs = XLSX.utils.aoa_to_sheet([COL]);

  // Helper: write row and optionally style it
  const writeRow = (
    ws: any,
    rowIdx: number,
    values: (string | number | null)[],
    style?: any,
  ) => {
    for (let c = 0; c < 4; c++) {
      const val = c < values.length ? values[c] : null;
      const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
      if (val !== null && val !== undefined) {
        ws[addr] = { v: val, t: 's', s: style || {} };
      } else {
        ws[addr] = { v: '', t: 's', s: style || {} };
      }
    }
  };

  // ── Style constants ──
  const TITLE_STYLE: any = {
    font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '0F766E' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: thinBorder('0F766E'),
  };

  const SUBTITLE_STYLE: any = {
    font: { sz: 11, color: { rgb: '475569' }, italic: true },
    fill: { patternType: 'solid', fgColor: { rgb: 'F0FDFA' } },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
    border: thinBorder('CCFBF1'),
  };

  const SECTION_HEADER_STYLE: any = {
    font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '1E293B' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: thinBorder('334155'),
  };

  const SECTION_GREEN_STYLE: any = {
    font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '16A34A' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: thinBorder('166534'),
  };

  const SECTION_RED_STYLE: any = {
    font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'DC2626' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: thinBorder('991B1B'),
  };

  const SECTION_BLUE_STYLE: any = {
    font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '2563EB' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: thinBorder('1D4ED8'),
  };

  const COL_HEADER_STYLE: any = {
    font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '475569' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: thinBorder('334155'),
  };

  const ROW_EVEN: any = {
    font: { sz: 10, color: { rgb: '1E293B' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F8FAFC' } },
    alignment: { vertical: 'center', wrapText: true },
    border: thinBorder('E2E8F0'),
  };

  const ROW_ODD: any = {
    font: { sz: 10, color: { rgb: '1E293B' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } },
    alignment: { vertical: 'center', wrapText: true },
    border: thinBorder('E2E8F0'),
  };

  const COL_NAME_EDITABLE: any = {
    font: { bold: true, sz: 10, color: { rgb: '166534' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F0FDF4' } },
    alignment: { vertical: 'center' },
    border: thinBorder('BBF7D0'),
  };

  const COL_NAME_READONLY: any = {
    font: { bold: true, sz: 10, color: { rgb: '475569' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F1F5F9' } },
    alignment: { vertical: 'center' },
    border: thinBorder('CBD5E1'),
  };

  const COL_NAME_DANGER: any = {
    font: { bold: true, sz: 10, color: { rgb: '991B1B' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FEF2F2' } },
    alignment: { vertical: 'center' },
    border: thinBorder('FECACA'),
  };

  const BADGE_YES: any = {
    font: { bold: true, sz: 9, color: { rgb: '166534' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'DCFCE7' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: thinBorder('86EFAC'),
  };

  const BADGE_NO: any = {
    font: { bold: true, sz: 9, color: { rgb: 'DC2626' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FEE2E2' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: thinBorder('FCA5A5'),
  };

  const EXAMPLE_STYLE: any = {
    font: { sz: 10, color: { rgb: '7C3AED' }, italic: true },
    fill: { patternType: 'solid', fgColor: { rgb: 'FAF5FF' } },
    alignment: { vertical: 'center', wrapText: true },
    border: thinBorder('E9D5FF'),
  };

  const STEP_NUM_STYLE: any = {
    font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '2563EB' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: thinBorder('1D4ED8'),
  };

  const WARNING_STYLE: any = {
    font: { bold: true, sz: 10, color: { rgb: '92400E' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FFFBEB' } },
    alignment: { vertical: 'center', wrapText: true },
    border: thinBorder('FDE68A'),
  };

  const BLANK_ROW: any = {
    fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } },
    border: thinBorder('FFFFFF'),
  };

  // ── Build rows ──
  let r = 0;

  // Row 0: Title (merged later)
  writeRow(helpWs, r, ['TABLA IPV — GUÍA DE USO DEL EXCEL', '', '', ''], TITLE_STYLE);

  // Row 1: Subtitle
  r++; writeRow(helpWs, r, ['', 'Esta hoja explica cada columna del Excel para que puedas editarlo', '', ''], SUBTITLE_STYLE);
  r++; writeRow(helpWs, r, ['', 'y volverlo a importar correctamente en CostPro.', '', ''], SUBTITLE_STYLE);
  r++; writeRow(helpWs, r, ['', '', '', ''], BLANK_ROW);

  // ── Section: Column headers reminder ──
  r++; writeRow(helpWs, r, ['LEYENDA DE COLORES', 'Identifica rapidamente que puedes y que no puedes editar', '', ''], SECTION_HEADER_STYLE);
  r++; writeRow(helpWs, r, ['', '', '', ''], BLANK_ROW);
  r++;
  // Legend items
  const legendStyle = (bg: string, fg: string): any => ({
    font: { bold: true, sz: 10, color: { rgb: fg } },
    fill: { patternType: 'solid', fgColor: { rgb: bg } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: thinBorder('E2E8F0'),
  });
  const legendText: any = { font: { sz: 10, color: { rgb: '1E293B' } }, alignment: { vertical: 'center' }, border: thinBorder('E2E8F0') };

  helpWs[XLSX.utils.encode_cell({ r, c: 0 })] = { v: 'SI puedes editar', t: 's', s: legendStyle('DCFCE7', '166534') };
  helpWs[XLSX.utils.encode_cell({ r, c: 1 })] = { v: 'Fondo verde = columna que puedes modificar para preparar tu venta.', t: 's', s: legendText };
  helpWs[XLSX.utils.encode_cell({ r, c: 2 })] = { v: '', t: 's', s: BLANK_ROW };
  helpWs[XLSX.utils.encode_cell({ r, c: 3 })] = { v: 'Ej: Cantidad, Precio Venta, Descuento, Forma Pago', t: 's', s: legendText };
  r++;

  helpWs[XLSX.utils.encode_cell({ r, c: 0 })] = { v: 'NO puedes editar', t: 's', s: legendStyle('FEE2E2', 'DC2626') };
  helpWs[XLSX.utils.encode_cell({ r, c: 1 })] = { v: 'Fondo rojo/gris = columna de solo lectura o del sistema.', t: 's', s: legendText };
  helpWs[XLSX.utils.encode_cell({ r, c: 2 })] = { v: '', t: 's', s: BLANK_ROW };
  helpWs[XLSX.utils.encode_cell({ r, c: 3 })] = { v: 'Ej: Producto, SKU, _product_id, _variant_id', t: 's', s: legendText };
  r++;

  helpWs[XLSX.utils.encode_cell({ r, c: 0 })] = { v: 'Ejemplo / Notas', t: 's', s: legendStyle('FAF5FF', '7C3AED') };
  helpWs[XLSX.utils.encode_cell({ r, c: 1 })] = { v: 'Texto en morado = ejemplos de como llenar la columna.', t: 's', s: legendText };
  helpWs[XLSX.utils.encode_cell({ r, c: 2 })] = { v: '', t: 's', s: BLANK_ROW };
  helpWs[XLSX.utils.encode_cell({ r, c: 3 })] = { v: 'Copia estos formatos para evitar errores al importar.', t: 's', s: legendText };
  r++; r++;

  // ── Section: Editable columns ──
  writeRow(helpWs, r, ['COLUMNAS EDITABLES', 'Estas son las columnas que DEBES llenar para registrar tu venta', '', ''], SECTION_GREEN_STYLE);
  r++; writeRow(helpWs, r, ['', '', '', ''], BLANK_ROW);

  // Column header row
  r++;
  for (let c = 0; c < 4; c++) {
    helpWs[XLSX.utils.encode_cell({ r, c })] = { v: COL[c], t: 's', s: COL_HEADER_STYLE };
  }
  r++;

  const editableColumns: [string, string, string, string][] = [
    ['Producto', 'Nombre del producto. Solo lectura — NO lo modifiques. El sistema lo usa para buscar el producto al importar.', 'NO', 'Barras de Acero, Banqueticas, Pintura Blanca 5L'],
    ['SKU', 'Codigo unico del producto. Solo lectura. Se usa como respaldo para buscar el producto si el nombre cambia.', 'NO', 'PROD-031, SKU-0042'],
    ['UM', 'Unidad de medida. Solo lectura. Indica en que se vende: unidades, metros, kilos, litros, etc.', 'NO', 'ud, metros, kg, L, paquete'],
    ['Stock', 'Cantidad disponible en inventario. Solo lectura informativo para que sepas cuanto tienes antes de vender.', 'NO', '18, 4, 0'],
    ['Costo', 'Costo de compra del producto. Solo lectura. Te ayuda a saber tu margen de ganancia.', 'NO', '960, 1500, 250'],
    ['Cantidad', 'CANTIDAD QUE QUIERES VENDER. Esta es la columna PRINCIPAL que debes llenar. Escribe cuantas unidades vas a vender. Si dejas en 0, el producto no se incluira en la venta.', 'SI', 'Escribe 5 para vender 5 uds. Deja 0 para omitir.'],
    ['Precio Venta', 'Precio unitario de venta. Puedes modificarlo para aplicar un precio diferente. Si lo dejas en 0, se usa el precio original.', 'SI', '45000. Vacio = precio original del producto.'],
    ['Tipo Desc.', 'Tipo de descuento. Escribe "%" para porcentual o "$" para monto fijo. Deja vacio si no hay descuento.', 'SI', '% = 10% de descuento. $ = $500 de descuento.'],
    ['Descuento', 'Valor del descuento. Si "Tipo Desc." es "%" sera un porcentaje (1-100). Si "$" sera un monto en dinero.', 'SI', '10 (si %). 500 (si $). 0 = sin descuento.'],
    ['Forma Pago', 'Metodo de pago para este producto.', 'SI', 'Efectivo, Transf., Tarjeta, Mixto'],
    ['Efectivo', 'Monto a pagar en EFECTIVO. Solo se usa si "Forma Pago" es "Mixto". El sistema calcula automaticamente si es solo "Efectivo".', 'SI (Mixto)', 'Total $45000, pagas $20000 en efectivo.'],
    ['Transferencia', 'Monto a pagar por TRANSFERENCIA. Solo si "Forma Pago" es "Mixto". Debe sumar con Efectivo = subtotal.', 'SI (Mixto)', 'Total $45000, efectivo $20000, esta = $25000.'],
    ['Valor Venta', 'Subtotal calculado: Cantidad x Precio Venta - Descuento. Solo lectura, se calcula al importar.', 'NO', '5 uds x $45000 = $225000'],
  ];

  let dataIdx = 0;
  for (const [colName, desc, editable, example] of editableColumns) {
    const isRowEven = dataIdx % 2 === 0;
    const baseStyle = isRowEven ? ROW_EVEN : ROW_ODD;
    const isEditable = editable.startsWith('SI');
    const isSystem = colName.startsWith('_') || colName.startsWith('---');

    // Column name with color coding
    helpWs[XLSX.utils.encode_cell({ r, c: 0 })] = {
      v: colName,
      t: 's',
      s: isSystem ? COL_NAME_DANGER : isEditable ? COL_NAME_EDITABLE : COL_NAME_READONLY,
    };
    // Description
    helpWs[XLSX.utils.encode_cell({ r, c: 1 })] = { v: desc, t: 's', s: baseStyle };
    // Editable badge
    helpWs[XLSX.utils.encode_cell({ r, c: 2 })] = {
      v: editable,
      t: 's',
      s: isEditable ? BADGE_YES : BADGE_NO,
    };
    // Example
    helpWs[XLSX.utils.encode_cell({ r, c: 3 })] = { v: example, t: 's', s: EXAMPLE_STYLE };
    r++;
    dataIdx++;
  }

  r++; writeRow(helpWs, r, ['', '', '', ''], BLANK_ROW);

  // ── Section: System columns ──
  r++;
  writeRow(helpWs, r, ['COLUMNAS DEL SISTEMA', 'Estas columnas son internas de CostPro — NO las modifiques bajo ningun concepto', '', ''], SECTION_RED_STYLE);
  r++; writeRow(helpWs, r, ['', '', '', ''], BLANK_ROW);
  r++;
  for (let c = 0; c < 4; c++) {
    helpWs[XLSX.utils.encode_cell({ r, c })] = { v: COL[c], t: 's', s: COL_HEADER_STYLE };
  }
  r++;

  const systemColumns: [string, string, string, string][] = [
    ['--- NO EDITAR DEBAJO ---', 'SEPARADOR VISUAL. Todo lo que esta a la derecha de esta columna son datos internos del sistema. NO modifiques nada.', 'NO', 'Si ves esta columna, lo que esta a la derecha es del sistema.'],
    ['_product_id', 'Identificador interno del producto (UUID). CostPro lo usa para encontrar el producto exacto al importar. Si lo borras, el sistema busca por SKU o nombre como respaldo.', 'NO', 'bef328c3-1ff9-42ca-8b82-0a0fafb06a46'],
    ['_variant_id', 'Identificador interno de la variante del producto (tamano, color, presentacion). Vacio = sin variantes.', 'NO', 'Vacio = sin variantes. Con valor = variante especifica.'],
  ];

  dataIdx = 0;
  for (const [colName, desc, editable, example] of systemColumns) {
    const isRowEven = dataIdx % 2 === 0;
    const baseStyle = isRowEven ? ROW_EVEN : ROW_ODD;
    helpWs[XLSX.utils.encode_cell({ r, c: 0 })] = { v: colName, t: 's', s: COL_NAME_DANGER };
    helpWs[XLSX.utils.encode_cell({ r, c: 1 })] = { v: desc, t: 's', s: baseStyle };
    helpWs[XLSX.utils.encode_cell({ r, c: 2 })] = { v: editable, t: 's', s: BADGE_NO };
    helpWs[XLSX.utils.encode_cell({ r, c: 3 })] = { v: example, t: 's', s: EXAMPLE_STYLE };
    r++;
    dataIdx++;
  }

  r++; writeRow(helpWs, r, ['', '', '', ''], BLANK_ROW);

  // ── Section: Import steps ──
  r++;
  writeRow(helpWs, r, ['COMO IMPORTAR EL EXCEL', 'Paso a paso para cargar tus datos de vuelta en CostPro', '', ''], SECTION_BLUE_STYLE);
  r++; writeRow(helpWs, r, ['', '', '', ''], BLANK_ROW);
  r++;
  for (let c = 0; c < 4; c++) {
    helpWs[XLSX.utils.encode_cell({ r, c })] = { v: COL[c], t: 's', s: COL_HEADER_STYLE };
  }
  r++;

  const steps: [string, string, string, string][] = [
    ['Paso 1', 'Haz clic en "Export Excel" en la Tabla IPV de CostPro para descargar el archivo.', '', 'Se descarga un .xlsx con todos tus productos.'],
    ['Paso 2', 'Abre el archivo en Excel, Google Sheets o LibreOffice Calc.', '', 'Ve a la hoja "Ayuda" para consultar esta guia.'],
    ['Paso 3', 'Modifica SOLO las columnas verdes: Cantidad, Precio Venta, Tipo Desc., Descuento, Forma Pago, Efectivo, Transferencia.', '', 'NO toques las rojas/grises. NO cambies nombres ni IDs.'],
    ['Paso 4', 'Guarda el archivo en formato .xlsx (NO .csv ni .xls antiguo).', '', 'Google Sheets: Archivo > Descargar > Microsoft Excel (.xlsx).'],
    ['Paso 5', 'Vuelve a CostPro y haz clic en el boton "Importar" en el menu de la Tabla IPV.', '', 'Selecciona el archivo modificado. Veras un resumen de la importacion.'],
    ['Paso 6', 'Revisa los resultados. Si algo salio mal, usa "Deshacer Importacion" para restaurar los datos anteriores.', '', 'El boton "Deshacer" solo aparece despues de importar.'],
  ];

  for (let i = 0; i < steps.length; i++) {
    const [step, desc, , example] = steps[i];
    const isRowEven = i % 2 === 0;
    const baseStyle = isRowEven ? ROW_EVEN : ROW_ODD;

    helpWs[XLSX.utils.encode_cell({ r, c: 0 })] = { v: step, t: 's', s: STEP_NUM_STYLE };
    helpWs[XLSX.utils.encode_cell({ r, c: 1 })] = { v: desc, t: 's', s: baseStyle };
    helpWs[XLSX.utils.encode_cell({ r, c: 2 })] = { v: '', t: 's', s: baseStyle };
    helpWs[XLSX.utils.encode_cell({ r, c: 3 })] = { v: example, t: 's', s: EXAMPLE_STYLE };
    r++;
  }

  r++; writeRow(helpWs, r, ['', '', '', ''], BLANK_ROW);

  // ── Warning / Important note ──
  r++;
  for (let c = 0; c < 4; c++) {
    helpWs[XLSX.utils.encode_cell({ r, c })] = {
      v: c === 0 ? 'IMPORTANTE' : c === 1
        ? 'Si borras filas de productos, esos productos simplemente no se incluiran en la venta (no se eliminan del inventario). Solo se procesan los productos con Cantidad > 0.'
        : c === 3 ? 'Para omitir un producto, deja Cantidad en 0 o borra la fila.' : '',
      t: 's',
      s: c === 0
        ? { font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'D97706' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: thinBorder('B45309') }
        : c === 3 ? WARNING_STYLE : WARNING_STYLE,
    };
  }

  // ── Update !ref to include all written cells ──
  helpWs['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r, c: 3 } });

  // ── Final styling ──
  // Column widths
  helpWs['!cols'] = [
    { wch: 28 },
    { wch: 72 },
    { wch: 16 },
    { wch: 42 },
  ];

  // Row heights for key rows
  helpWs['!rows'] = [{ hpt: 32 }]; // Title row taller

  // Merge title across all 4 columns
  helpWs['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, // Title
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }, // Subtitle line 1
    { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } }, // Subtitle line 2
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title);
  XLSX.utils.book_append_sheet(wb, helpWs, 'Ayuda');
  XLSX.writeFile(wb, filename);
  toast.success(`Excel exportado: ${products.length} productos (incluye hoja de ayuda con estilos)`);
}

// ── Export PDF ────────────────────────────────────────────────

export function exportSalesCatalogPDF(params: ExportPDFParams): void {
  const { activeRows, confirmedSaleId } = params;
  const title = confirmedSaleId ? 'IPV CONFIRMADO' : 'IPV en proceso';
  const filename = confirmedSaleId
    ? `ipv-confirmado-${Date.now()}.pdf`
    : `ipv-en-proceso-${Date.now()}.pdf`;
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(16);
  doc.text(title, 14, 20);
  doc.setFontSize(10);
  doc.text(`Generado: ${new Date().toLocaleString()}`, 14, 28);

  const tableData = activeRows.map((row) => [
    row.product.name,
    row.product.sku || '',
    row.quantity,
    formatCurrency(row.price),
    PAYMENT_METHODS.find((pm) => pm.value === row.paymentMethod)?.label || '',
    formatCurrency(calcSubtotal(row)),
  ]);

  autoTable(doc, {
    startY: 35,
    head: [['Producto', 'SKU', 'Cantidad', 'Precio', 'Forma Pago', 'Total']],
    body: tableData,
    theme: 'grid',
    styles: { fontSize: 8 },
  });

  if (confirmedSaleId) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`ID de Venta: ${confirmedSaleId}`, 14, 34);
  }
  doc.save(filename);
  toast.success('PDF exportado correctamente');
}
