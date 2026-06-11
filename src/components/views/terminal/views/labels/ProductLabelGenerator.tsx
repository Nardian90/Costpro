'use client';

import React, { useState, useRef, useMemo, useCallback } from 'react';
import { useAuthStore } from '@/store';
import { useProducts } from '@/hooks/api/useProducts';
import { toast } from 'sonner';
import { Search, Plus, Minus, Trash2, Tag, FileDown, Loader2 } from 'lucide-react';
import type { Product } from '@/types';
import JsBarcode from 'jsbarcode';
import { createPDFDocument } from '@/lib/export/lazy-pdf';

/** Maximum number of labels per page (2x2 grid on letter paper) */
const MAX_LABELS_PER_PAGE = 4;

/** Letter size in mm */
const PAGE_W = 215.9;
const PAGE_H = 279.4;
const MARGIN = 8;

interface SelectedProduct {
  product: Product;
  quantity: number; // 1-4
}

/**
 * Renders a JsBarcode to an offscreen canvas and returns a data-URL PNG.
 */
function barcodeToDataURL(
  value: string,
  options?: { format?: string }
): string | null {
  const canvas = document.createElement('canvas');
  const format = options?.format === 'EAN13' && value.length === 13 ? 'EAN13' : 'CODE128';
  try {
    JsBarcode(canvas, value, {
      format,
      width: 2,
      height: 60,
      displayValue: true,
      fontSize: 12,
      margin: 4,
      background: '#ffffff',
      lineColor: '#000000',
    });
  } catch {
    try {
      JsBarcode(canvas, value, {
        format: 'CODE128',
        width: 2,
        height: 60,
        displayValue: true,
        fontSize: 12,
        margin: 4,
        background: '#ffffff',
        lineColor: '#000000',
      });
    } catch {
      return null;
    }
  }
  return canvas.toDataURL('image/png');
}

export default function ProductLabelGenerator() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId;

  const { data: productsData = [], isLoading: isLoadingProducts } = useProducts(storeId);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [repeatMode, setRepeatMode] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const previewBarcodeRefs = useRef<Map<string, SVGSVGElement>>(new Map());

  // Available products (not yet selected)
  const availableProducts = useMemo(() => {
    const selectedIds = new Set(selectedProducts.map(sp => sp.product.id));
    return (productsData || [])
      .filter(p => !selectedIds.has(p.id))
      .filter(p =>
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.barcode?.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [productsData, selectedProducts, searchTerm]);

  // Build the label slots (max 4 per page)
  const labelSlots: (SelectedProduct | null)[] = useMemo(() => {
    if (repeatMode && selectedProducts.length === 1) {
      return Array(MAX_LABELS_PER_PAGE).fill(selectedProducts[0]);
    }

    const slots: (SelectedProduct | null)[] = [];
    for (const sp of selectedProducts) {
      for (let i = 0; i < Math.min(sp.quantity, MAX_LABELS_PER_PAGE - slots.length); i++) {
        slots.push(sp);
      }
    }
    while (slots.length < MAX_LABELS_PER_PAGE) {
      slots.push(null);
    }
    return slots;
  }, [selectedProducts, repeatMode]);

  // Render preview barcodes (SVG only, for on-screen display)
  const previewSlots = useMemo(() => labelSlots, [labelSlots]);

  // We need useEffect for rendering barcodes into preview SVGs
  React.useEffect(() => {
    previewSlots.forEach((slot, index) => {
      if (!slot) return;
      const svgEl = previewBarcodeRefs.current.get(`barcode-${index}`);
      if (!svgEl) return;

      const barcodeValue = slot.product.barcode || slot.product.sku || slot.product.id;
      const isEAN = slot.product.barcode && slot.product.barcode.length === 13;
      try {
        JsBarcode(svgEl, barcodeValue, {
          format: isEAN ? 'EAN13' : 'CODE128',
          width: 1.5,
          height: 40,
          displayValue: true,
          fontSize: 10,
          margin: 0,
          background: 'transparent',
          lineColor: '#1a1a1a',
        });
      } catch {
        try {
          JsBarcode(svgEl, barcodeValue, {
            format: 'CODE128',
            width: 1.5,
            height: 40,
            displayValue: true,
            fontSize: 10,
            margin: 0,
            background: 'transparent',
            lineColor: '#1a1a1a',
          });
        } catch {
          // Silently fail
        }
      }
    });
  }, [previewSlots]);

  const totalLabelCount = useMemo(() => {
    if (repeatMode && selectedProducts.length === 1) return MAX_LABELS_PER_PAGE;
    return selectedProducts.reduce((sum, sp) => sum + sp.quantity, 0);
  }, [selectedProducts, repeatMode]);

  const canAddMore = selectedProducts.length < 1 || (selectedProducts.length < MAX_LABELS_PER_PAGE && !repeatMode);

  const addProduct = useCallback((product: Product) => {
    if (!canAddMore) return;
    setSelectedProducts(prev => [...prev, { product, quantity: 1 }]);
    setSearchTerm('');
  }, [canAddMore]);

  const removeProduct = useCallback((productId: string) => {
    setSelectedProducts(prev => prev.filter(sp => sp.product.id !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, delta: number) => {
    setSelectedProducts(prev =>
      prev.map(sp => {
        if (sp.product.id !== productId) return sp;
        const newQty = Math.max(1, Math.min(MAX_LABELS_PER_PAGE, sp.quantity + delta));
        return { ...sp, quantity: newQty };
      })
    );
  }, []);

  const storeName = user?.memberships?.find(m => m.store_id === user.activeStoreId)?.store?.name || 'Mi Tienda';

  /**
   * Generate a PDF with product labels using jsPDF (same library as cost sheets).
   * Barcode is rendered via JsBarcode to an offscreen Canvas, then embedded as PNG.
   */
  const handleExportPDF = useCallback(async () => {
    if (totalLabelCount === 0) {
      toast.error('Selecciona al menos un producto');
      return;
    }

    setIsGeneratingPDF(true);
    try {
      const doc = await createPDFDocument('p', 'mm', 'letter');

      const usableW = PAGE_W - MARGIN * 2;
      const usableH = PAGE_H - MARGIN * 2;
      const labelW = (usableW - 4) / 2; // 2 columns with 4mm gap
      const labelH = (usableH - 4) / 2; // 2 rows with 4mm gap

      let labelIndex = 0;
      let firstPage = true;

      for (const slot of labelSlots) {
        if (!slot) {
          labelIndex++;
          continue;
        }

        // Add new page if we wrapped past 4 labels (but skip for the first page)
        if (labelIndex > 0 && labelIndex % MAX_LABELS_PER_PAGE === 0) {
          doc.addPage();
        }

        if (firstPage && labelIndex === 0) {
          firstPage = false;
        }

        const col = labelIndex % 2;
        const row = Math.floor(labelIndex / 2) % 2;
        const x = MARGIN + col * (labelW + 4);
        const y = MARGIN + row * (labelH + 4);
        const p = slot.product;

        // --- Label border ---
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.roundedRect(x, y, labelW, labelH, 2, 2, 'S');

        // --- Store header ---
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(storeName.toUpperCase(), x + labelW / 2, y + 8, { align: 'center' });

        // Header line
        doc.setLineWidth(0.4);
        doc.line(x + 4, y + 11, x + labelW - 4, y + 11);

        // --- Product name ---
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        const nameLines = doc.splitTextToSize(p.name?.toUpperCase() || 'SIN NOMBRE', labelW - 12);
        doc.text(nameLines, x + labelW / 2, y + 18, { align: 'center' });

        let currentY = y + 18 + nameLines.length * 5;

        // --- Category ---
        if (p.category) {
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(120, 120, 120);
          doc.text(p.category.toUpperCase(), x + labelW / 2, currentY + 2, { align: 'center' });
          currentY += 6;
        }

        // --- SKU ---
        doc.setFontSize(8);
        doc.setFont('courier', 'normal');
        doc.setTextColor(120, 120, 120);
        doc.text(p.sku || '', x + labelW / 2, currentY + 2, { align: 'center' });
        currentY += 8;

        // --- Price ---
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        const priceStr = `$${(p.price || 0).toFixed(2)}`;
        doc.text(priceStr, x + labelW / 2, currentY + 6, { align: 'center' });
        currentY += 12;

        // --- Unit ---
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 120, 120);
        doc.text((p.unit_of_measure || 'C/U').toUpperCase(), x + labelW / 2, currentY, { align: 'center' });
        currentY += 5;

        // --- Separator ---
        doc.setLineWidth(0.15);
        doc.setDrawColor(200, 200, 200);
        doc.line(x + 8, currentY, x + labelW - 8, currentY);
        currentY += 3;

        // --- Barcode (rendered to canvas, exported as PNG, added to PDF) ---
        const barcodeValue = p.barcode || p.sku || p.id;
        const isEAN = p.barcode && p.barcode.length === 13;
        const barcodeDataUrl = barcodeToDataURL(barcodeValue, { format: isEAN ? 'EAN13' : 'CODE128' });

        if (barcodeDataUrl) {
          // Calculate barcode dimensions: fit within label width with padding
          const barcodeMaxW = labelW - 16;
          const barcodeMaxH = y + labelH - currentY - 4;
          if (barcodeMaxH > 10) {
            doc.addImage(barcodeDataUrl, 'PNG', x + (labelW - barcodeMaxW) / 2, currentY + 1, barcodeMaxW, barcodeMaxH);
          }
        }

        labelIndex++;
      }

      const filename = `etiquetas_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);
      toast.success(`${totalLabelCount} etiqueta(s) exportada(s) a PDF`);
    } catch (error) {
      console.error('Error generating labels PDF:', error);
      toast.error('Error al generar el PDF de etiquetas');
    } finally {
      setIsGeneratingPDF(false);
    }
  }, [labelSlots, totalLabelCount, storeName]);

  return (
    <div className="space-y-6 px-4 sm:px-0">
      {/* ===== HEADER ===== */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tighter uppercase">Etiquetas de Producto</h2>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
            Genera etiquetas con codigo de barras para exhibicion — hasta 4 por hoja carta
          </p>
        </div>
      </div>

      {/* ===== CONTROLS ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Product Search */}
        <div className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Seleccionar Productos</h3>

          {canAddMore && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre, SKU o codigo..."
                className="neu-input w-full !pl-9"
                aria-label="Buscar productos"
              />
            </div>
          )}

          {/* Selected Products */}
          <div className="space-y-2">
            {selectedProducts.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-border rounded-xl">
                <Tag className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground font-semibold uppercase">Sin productos seleccionados</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Busca y agrega hasta 4 productos</p>
              </div>
            ) : (
              selectedProducts.map(sp => (
                <div key={sp.product.id} className="flex items-center gap-2 p-3 rounded-xl border border-border bg-card">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs truncate">{sp.product.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{sp.product.sku}</div>
                    <div className="text-xs font-black text-primary mt-0.5">
                      ${sp.product.price?.toFixed(2) || '0.00'}
                    </div>
                  </div>
                  {!repeatMode && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateQuantity(sp.product.id, -1)}
                        disabled={sp.quantity <= 1}
                        className="w-11 h-11 rounded-md border border-border flex items-center justify-center hover:bg-muted disabled:opacity-30"
                        aria-label="Reducir cantidad"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-black">{sp.quantity}</span>
                      <button
                        onClick={() => updateQuantity(sp.product.id, 1)}
                        disabled={sp.quantity >= 4}
                        className="w-11 h-11 rounded-md border border-border flex items-center justify-center hover:bg-muted disabled:opacity-30"
                        aria-label="Aumentar cantidad"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => removeProduct(sp.product.id)}
                    className="w-11 h-11 rounded-md flex items-center justify-center text-destructive hover:bg-destructive/10"
                    aria-label="Eliminar producto"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Repeat Mode Toggle */}
          {selectedProducts.length === 1 && (
            <label className="flex items-center gap-2 p-2 rounded-lg border border-primary/20 bg-primary/5 cursor-pointer">
              <input
                type="checkbox"
                checked={repeatMode}
                onChange={(e) => setRepeatMode(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs font-bold text-primary">Repetir 4 veces el mismo producto</span>
            </label>
          )}

          {/* Search Results Dropdown */}
          {searchTerm && availableProducts.length > 0 && (
            <div className="border border-border rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              {availableProducts.slice(0, 10).map(product => (
                <button
                  key={product.id}
                  onClick={() => addProduct(product)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 text-left transition-colors border-b border-border/50 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">{product.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{product.sku}</div>
                  </div>
                  <div className="text-xs font-black text-primary">
                    ${product.price?.toFixed(2) || '0.00'}
                  </div>
                  <Plus className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                </button>
              ))}
            </div>
          )}

          {searchTerm && availableProducts.length === 0 && !isLoadingProducts && (
            <p className="text-xs text-muted-foreground text-center py-2">No se encontraron productos</p>
          )}
        </div>

        {/* Export Button */}
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="text-center space-y-2">
            <div className="text-4xl font-black text-primary">{totalLabelCount}</div>
            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Etiquetas en Hoja Carta
            </div>
            <div className="text-[10px] text-muted-foreground/60">
              {selectedProducts.length === 1 && repeatMode
                ? `4x ${selectedProducts[0].product.name}`
                : `${selectedProducts.length} producto(s) seleccionado(s)`}
            </div>
          </div>
          <button
            onClick={handleExportPDF}
            disabled={totalLabelCount === 0 || isGeneratingPDF}
            className="flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground font-black rounded-xl hover:opacity-90 transition-opacity text-xs uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isGeneratingPDF ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileDown className="w-4 h-4" />
            )}
            {isGeneratingPDF ? 'Generando PDF...' : 'Exportar a PDF'}
          </button>
        </div>
      </div>

      {/* ===== SCREEN PREVIEW ===== */}
      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
          Vista Previa
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {labelSlots.map((slot, index) => {
            if (!slot) {
              return (
                <div
                  key={`preview-empty-${index}`}
                  className="border-2 border-dashed border-border/30 rounded-xl flex items-center justify-center p-6 min-h-[140px]"
                >
                  <span className="text-xs text-muted-foreground/40 uppercase">Vacio</span>
                </div>
              );
            }

            const p = slot.product;
            return (
              <div
                key={`preview-${index}`}
                className="border-2 border-primary/20 rounded-xl p-3 flex flex-col justify-between bg-card min-h-[140px]"
              >
                <div>
                  <div className="font-black text-[10px] text-primary/60 uppercase tracking-wider">{storeName}</div>
                  <div className="font-black text-xs uppercase leading-tight mt-1 line-clamp-2">{p.name}</div>
                  <div className="text-[9px] text-muted-foreground font-mono">{p.sku}</div>
                </div>
                <div className="font-black text-xl text-foreground text-center my-1">
                  ${p.price?.toFixed(2) || '0.00'}
                </div>
                <div className="flex flex-col items-center">
                  <svg
                    ref={(el) => {
                      if (el) previewBarcodeRefs.current.set(`barcode-${index}`, el);
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
