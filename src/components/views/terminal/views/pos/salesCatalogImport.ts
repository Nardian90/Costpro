import * as XLSX from "@e965/xlsx";
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

export async function readSheetNames(file: File): Promise<string[]> {
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

        // PR-4.4D: constantes para importación histórica
        const DEFAULT_USD_RATE = 680; // CUP/USD
        const MAX_HISTORICAL_DAYS = 60; // 2 meses
        const today = new Date();
        const minDate = new Date(today.getTime() - MAX_HISTORICAL_DAYS * 24 * 60 * 60 * 1000);

        // PR-4.4D: helper para parsear fecha dd/mm/yyyy → ISO
        const parseDate = (dateStr: string): string | null => {
          if (!dateStr || !dateStr.trim()) return null;
          const s = dateStr.trim();
          // dd/mm/yyyy
          const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if (m) {
            const dd = m[1].padStart(2, '0');
            const mm = m[2].padStart(2, '0');
            const yyyy = m[3];
            return `${yyyy}-${mm}-${dd}T12:00:00.000Z`;
          }
          // yyyy-mm-dd (ISO)
          const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (m2) return `${s}T12:00:00.000Z`;
          return null;
        };

        // PR-4.4D: helper para parsear número que puede ser "-" o vacío
        const parseNum = (val: unknown): number => {
          if (val === null || val === undefined) return 0;
          const s = String(val).trim();
          if (s === '' || s === '-') return 0;
          const n = Number(s.replace(/,/g, ''));
          return Number.isFinite(n) ? n : 0;
        };

        for (let i = 0; i < dataRows.length; i++) {
          const raw = dataRows[i];
          const rowIdx = i + rangeStart + 2;

          const sepMarker = String(raw['--- NO EDITAR DEBAJO ---'] ?? '').trim();
          if (sepMarker) continue;

          // Resolve product
          let product: Product | undefined;
          const pid = String(raw['_product_id'] ?? '').trim();
          const sku = String(raw['SKU'] ?? raw['Código'] ?? '').trim().toLowerCase();
          const name = String(raw['Producto'] ?? raw['Descripción'] ?? '').trim().toLowerCase();

          if (pid && productMap.has(pid)) product = productMap.get(pid)!;
          else if (sku && skuMap.has(sku)) product = skuMap.get(sku)!;
          else if (name && nameMap.has(name)) product = nameMap.get(name)!;

          if (!product) {
            skipped++;
            warnings.push(`Fila ${rowIdx}: "${String(raw['Producto'] ?? raw['Descripción'] ?? `fila ${rowIdx}`)}" no encontrado en catálogo`);
            continue;
          }

          // PR-4.4D: parse quantity con soporte decimal (0.50, 65.50, etc.)
          const rawQty = parseNum(raw['Cantidad']);
          let quantity = 0;
          if (rawQty >= 0) {
            quantity = Math.round(rawQty * 10000) / 10000;
          } else {
            warnings.push(`Fila ${rowIdx}: "${product.name}" cantidad inválida ("${raw['Cantidad']}"), tratada como 0`);
          }

          // PR-4.4D: parse fecha histórica (columna 'Fecha')
          const dateStr = String(raw['Fecha'] ?? '').trim();
          const operationDate = parseDate(dateStr);
          if (dateStr && !operationDate) {
            warnings.push(`Fila ${rowIdx}: "${product.name}" fecha inválida "${dateStr}", se usará fecha actual`);
          }
          if (operationDate) {
            const opDate = new Date(operationDate);
            if (opDate < minDate) {
              warnings.push(`Fila ${rowIdx}: "${product.name}" fecha ${dateStr} fuera de ventana (mínimo ${minDate.toLocaleDateString()}), se usará fecha actual`);
            } else if (opDate > today) {
              warnings.push(`Fila ${rowIdx}: "${product.name}" fecha ${dateStr} futura, se usará fecha actual`);
            }
          }

          // PR-4.4D: parse USD + Zelle + Tasa USD
          const usdOriginal = Math.max(0, parseNum(raw['USD']));
          const usdRateRaw = parseNum(raw['Tasa USD']);
          const usdExchangeRate = usdRateRaw > 0 ? usdRateRaw : DEFAULT_USD_RATE;
          const zelleDirect = Math.max(0, parseNum(raw['Zelle']));
          // zellePaid total = zelle directo + USD convertido
          const zellePaid = zelleDirect + (usdOriginal * usdExchangeRate);

          // PR-4.4D: parse documento (para agrupación)
          const documentNumber = String(raw['Documento'] ?? '').trim() || null;

          // PR-4.4D: parse price — si no viene en Excel, usar precio del catálogo
          const rawPrice = parseNum(raw['Precio Venta']);
          let price: number;
          let priceDiffersFromCatalog = false;
          if (rawPrice > 0) {
            price = rawPrice;
            // WARNING: precio histórico ≠ catálogo (no bloquea)
            if (product.price > 0 && Math.abs(price - product.price) > 0.01) {
              priceDiffersFromCatalog = true;
              warnings.push(`Fila ${rowIdx}: "${product.name}" precio histórico (${price}) ≠ precio catálogo (${product.price}) — WARNING, venta permitida`);
            }
          } else {
            price = product.price || 0;
          }

          // Validate price vs cost (warning, no bloquea)
          if (price > 0 && price < (product.cost_price || 0) * 0.5) {
            warnings.push(`Fila ${rowIdx}: "${product.name}" precio (${price}) < 50% del costo (${product.cost_price})`);
          }

          // Parse discount
          const discountTypeStr = String(raw['Tipo Desc.'] ?? '').trim();
          const rawDiscountVal = parseNum(raw['Descuento']);
          let discountType: 'percentage' | 'fixed' | null = null;
          let discountValue = Math.max(0, rawDiscountVal);
          if (discountTypeStr === '%') discountType = 'percentage';
          else if (discountTypeStr === '$') discountType = 'fixed';
          if (discountType === 'percentage' && discountValue > 100) {
            warnings.push(`Fila ${rowIdx}: "${product.name}" descuento ${discountValue}% > 100%, ajustado a 100`);
            discountValue = 100;
          }

          // PR-4.4D: parse payments con soporte USD/Zelle
          const cashPaid = Math.max(0, parseNum(raw['Efectivo']));
          const transferPaid = Math.max(0, parseNum(raw['Transferencia']));

          // Determine payment method
          const formPagoLabel = String(raw['Forma Pago'] ?? '').trim().toLowerCase();
          let paymentMethod: PaymentMethod;
          const paymentCount = [cashPaid > 0, transferPaid > 0, zellePaid > 0].filter(Boolean).length;

          if (quantity === 0) {
            paymentMethod = 'cash';
          } else if (formPagoLabel.includes('mixto') || formPagoLabel === 'mixed' || paymentCount >= 2) {
            paymentMethod = 'mixed';
          } else if (formPagoLabel.includes('zelle') || (zellePaid > 0 && paymentCount === 1)) {
            paymentMethod = 'zelle';
          } else if (formPagoLabel.includes('trans') || (transferPaid > 0 && paymentCount === 1)) {
            paymentMethod = 'transfer';
          } else if (formPagoLabel.includes('efectivo') || (cashPaid > 0 && paymentCount === 1)) {
            paymentMethod = 'cash';
          } else {
            paymentMethod = 'cash';
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
          const storedQty = Math.round(finalQty * 10000) / 10000;

          // Build row with PR-4.4D fields
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
            zellePaid: 0,
            usdOriginal,
            usdExchangeRate,
            operationDate,
            documentNumber,
            priceDiffersFromCatalog,
          };

          // Auto-assign for non-mixed methods
          let resolvedCashPaid = cashPaid;
          let resolvedTransferPaid = transferPaid;
          let resolvedZellePaid = zellePaid;
          if (paymentMethod !== 'mixed' && finalQty > 0) {
            const sub = calcSubtotal(baseRow);
            if (paymentMethod === 'cash') {
              resolvedCashPaid = sub;
              resolvedTransferPaid = 0;
              resolvedZellePaid = 0;
            } else if (paymentMethod === 'transfer') {
              resolvedCashPaid = 0;
              resolvedTransferPaid = sub;
              resolvedZellePaid = 0;
            } else if (paymentMethod === 'zelle') {
              resolvedCashPaid = 0;
              resolvedTransferPaid = 0;
              resolvedZellePaid = sub;
            }
          }

          const newRow: SalesCatalogRow = {
            ...baseRow,
            cashPaid: resolvedCashPaid,
            transferPaid: resolvedTransferPaid,
            zellePaid: resolvedZellePaid,
          };

          // Validate mixed payment discrepancy (cash + transfer + zelle = subtotal)
          if (paymentMethod === 'mixed' && finalQty > 0) {
            const sub = calcSubtotal(newRow);
            const totalPaid = resolvedCashPaid + resolvedTransferPaid + resolvedZellePaid;
            if (Math.abs(totalPaid - sub) > 0.01) {
              warnings.push(`Fila ${rowIdx}: "${product.name}" pago mixto discrepancia: cash (${resolvedCashPaid}) + transfer (${resolvedTransferPaid}) + zelle (${resolvedZellePaid}) = ${totalPaid} ≠ subtotal (${sub.toFixed(2)})`);
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
