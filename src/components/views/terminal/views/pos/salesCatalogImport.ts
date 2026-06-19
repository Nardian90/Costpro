import * as XLSX from 'xlsx-js-style';
import { Product, PaymentMethod } from '@/types';
import { SalesCatalogRow, calcSubtotal } from './salesCatalogHelpers';

// ── Public types ──────────────────────────────────────────────

export interface ImportResult {
  nextRows: Map<string, SalesCatalogRow>;
  warnings: string[];
  updated: number;
  skipped: number;
}

// ── readSheetNames ────────────────────────────────────────────
// Reads an .xlsx file and returns its sheet names. Returns [] when
// the workbook has a single sheet or when the file cannot be parsed.
// Stateless: takes a File, returns a Promise<string[]>.

export function readSheetNames(file: File): Promise<string[]> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        resolve(wb.SheetNames.length > 1 ? wb.SheetNames : []);
      } catch {
        resolve([]);
      }
    };
    reader.onerror = () => resolve([]);
    reader.readAsArrayBuffer(file);
  });
}

// ── parseImportFile ───────────────────────────────────────────
// Parses an .xlsx file containing IPV rows and returns the new rows
// map plus warnings. Stateless: takes inputs, returns a Promise.

export function parseImportFile(
  file: File,
  sheetName: string | null,
  products: Product[],
  currentRows: Map<string, SalesCatalogRow>,
): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = sheetName || wb.SheetNames[0];
        const ws = wb.Sheets[sheet];

        // Detect header row: look for known column names in rows 0–3
        const HEADER_KEYWORDS = ['Producto', 'SKU', 'Cantidad', '_product_id'];
        let headerRowIndex = -1;
        for (let probeRow = 0; probeRow <= 3; probeRow++) {
          const rowObj = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
            range: probeRow,
            defval: '',
          })[0];
          if (!rowObj) continue;
          const keys = Object.keys(rowObj);
          const matchCount = HEADER_KEYWORDS.filter((k) => keys.includes(k)).length;
          if (matchCount >= 2) {
            headerRowIndex = probeRow;
            break;
          }
        }

        // Fallback: if no CostPro-style headers found, assume row 0 is the header
        const rangeStart = headerRowIndex >= 0 ? headerRowIndex : 0;
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
          range: rangeStart,
          defval: '',
        });

        // If we found a CostPro header row, the first element of json IS the header row itself — skip it
        const dataRows = headerRowIndex >= 0 ? json.slice(1) : json;

        if (dataRows.length === 0) {
          throw new Error('El archivo Excel está vacío o no se encontraron columnas válidas.');
        }

        // Build product lookup maps
        const productMap = new Map<string, Product>();
        const skuMap = new Map<string, Product>();
        const nameMap = new Map<string, Product>();
        products.forEach((p) => {
          productMap.set(p.id, p);
          if (p.sku) skuMap.set(p.sku.trim().toLowerCase(), p);
          nameMap.set(p.name.trim().toLowerCase(), p);
        });

        let updated = 0;
        let skipped = 0;
        const warnings: string[] = [];
        const nextRows = new Map(currentRows);

        for (let i = 0; i < dataRows.length; i++) {
          const raw = dataRows[i];
          const rowIdx = i + rangeStart + 2; // +2 because Excel row 1 = header, row 2 = first data

          // Skip separator column marker
          const sepMarker = String(raw['--- NO EDITAR DEBAJO ---'] ?? '').trim();
          if (sepMarker) continue;

          // Resolve product: _product_id → SKU → name
          let product: Product | undefined;
          const pid = String(raw['_product_id'] ?? '').trim();
          const sku = String(raw['SKU'] ?? '').trim().toLowerCase();
          const name = String(raw['Producto'] ?? '').trim().toLowerCase();

          if (pid && productMap.has(pid)) product = productMap.get(pid)!;
          else if (sku && skuMap.has(sku)) product = skuMap.get(sku)!;
          else if (name && nameMap.has(name)) product = nameMap.get(name)!;

          if (!product) {
            skipped++;
            warnings.push(`Fila ${rowIdx}: "${String(raw['Producto'] ?? `fila ${rowIdx}`)}" no encontrado en catálogo`);
            continue;
          }

          // Parse quantity — supports up to 4 decimal places (e.g. 1.0835 kg, 0.5 m)
          const rawQty = Number(raw['Cantidad'] ?? 0);
          let quantity = 0;
          if (Number.isFinite(rawQty) && rawQty >= 0) {
            // Clamp to 4 decimal places
            quantity = Math.round(rawQty * 10000) / 10000;
          }
          if (!Number.isFinite(rawQty) || rawQty < 0) {
            warnings.push(`Fila ${rowIdx}: "${product.name}" cantidad inválida ("${raw['Cantidad']}"), tratada como 0`);
          }

          // Parse sale price
          const rawPrice = Number(raw['Precio Venta'] ?? (product.price || 0));
          const price = Number.isFinite(rawPrice) ? Math.max(0, rawPrice) : (product.price || 0);

          // Validate price vs cost
          if (price > 0 && price < (product.cost_price || 0) * 0.5) {
            warnings.push(`Fila ${rowIdx}: "${product.name}" precio ($${price}) < 50% del costo ($${product.cost_price})`);
          }

          // Parse discount
          const discountTypeStr = String(raw['Tipo Desc.'] ?? '').trim();
          const rawDiscountVal = Number(raw['Descuento'] ?? 0);
          let discountType: 'percentage' | 'fixed' | null = null;
          let discountValue = Number.isFinite(rawDiscountVal) ? Math.max(0, rawDiscountVal) : 0;
          if (discountTypeStr === '%') discountType = 'percentage';
          else if (discountTypeStr === '$') discountType = 'fixed';
          if (discountType === 'percentage' && discountValue > 100) {
            warnings.push(`Fila ${rowIdx}: "${product.name}" descuento ${discountValue}% > 100%, ajustado a 100`);
            discountValue = 100;
          }

          // Parse payment — smart detection
          const rawCash = Number(raw['Efectivo'] ?? 0);
          const rawTransfer = Number(raw['Transferencia'] ?? 0);
          const cashPaid = Number.isFinite(rawCash) ? Math.max(0, rawCash) : 0;
          const transferPaid = Number.isFinite(rawTransfer) ? Math.max(0, rawTransfer) : 0;

          const formPagoLabel = String(raw['Forma Pago'] ?? '').trim().toLowerCase();
          let paymentMethod: PaymentMethod;

          if (quantity === 0) {
            paymentMethod = 'cash';
          } else if (formPagoLabel.includes('efectivo') || formPagoLabel === 'cash') {
            paymentMethod = 'cash';
          } else if (formPagoLabel.includes('trans') || formPagoLabel === 'transfer') {
            paymentMethod = 'transfer';
          } else if (formPagoLabel.includes('tarjeta') || formPagoLabel === 'card') {
            paymentMethod = 'card';
          } else if (formPagoLabel.includes('mixto') || formPagoLabel === 'mixed') {
            paymentMethod = 'mixed';
          } else {
            // Infer from column values
            if (cashPaid > 0 && transferPaid > 0) paymentMethod = 'mixed';
            else if (cashPaid > 0) paymentMethod = 'cash';
            else if (transferPaid > 0) paymentMethod = 'transfer';
            else paymentMethod = 'cash';
          }

          // Parse variant
          const vid = String(raw['_variant_id'] ?? '').trim();
          const selectedVariant = vid
            ? product.product_variants?.find((v) => v.id === vid) ?? null
            : null;

          // Check stock limit
          const convFactor = selectedVariant?.conversion_factor || 1;
          const stockLimit = (product.stock_current ?? 999999) / convFactor;
          if (quantity > stockLimit) {
            warnings.push(`Fila ${rowIdx}: "${product.name}" cantidad (${quantity}) > stock (${product.stock_current ?? 0}), ajustada a ${Math.round(stockLimit * 10000) / 10000}`);
          }
          const finalQty = Math.min(quantity, stockLimit);
          // Round to 4 decimal places for storage
          const storedQty = Math.round(finalQty * 10000) / 10000;

          // Build base row for subtotal calculation
          const baseRow: SalesCatalogRow = {
            product,
            selectedVariantId: selectedVariant?.id || null,
            selectedVariant,
            quantity: storedQty,
            price,
            cost: product.cost_price || 0,
            discountType,
            discountValue,
            paymentMethod,
            cashPaid: 0,
            transferPaid: 0,
          };

          // Auto-assign cash/transfer for non-mixed methods
          let resolvedCashPaid = cashPaid;
          let resolvedTransferPaid = transferPaid;
          if (paymentMethod !== 'mixed' && finalQty > 0) {
            const sub = calcSubtotal(baseRow);
            resolvedCashPaid = paymentMethod === 'cash' ? sub : 0;
            resolvedTransferPaid = paymentMethod === 'transfer' ? sub : 0;
          }

          const newRow: SalesCatalogRow = {
            ...baseRow,
            cashPaid: resolvedCashPaid,
            transferPaid: resolvedTransferPaid,
          };

          // Validate mixed payment discrepancy
          if (paymentMethod === 'mixed' && finalQty > 0) {
            const sub = calcSubtotal(newRow);
            if (Math.abs(newRow.cashPaid + newRow.transferPaid - sub) > 0.01) {
              warnings.push(`Fila ${rowIdx}: "${product.name}" pago mixto discrepancia: efectivo (${newRow.cashPaid}) + transfer (${newRow.transferPaid}) != subtotal (${sub.toFixed(2)})`);
            }
          }

          nextRows.set(product.id, newRow);
          updated++;
        }

        resolve({ nextRows, warnings, updated, skipped });
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Formato no válido'));
      }
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsArrayBuffer(file);
  });
}
