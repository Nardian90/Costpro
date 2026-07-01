"use client";

import React, { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, Upload, X, Loader2, CheckCircle2, AlertCircle,
  FileText, Plus, RotateCcw,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { POSPortalModal } from "@/components/views/terminal/views/pos/POSPortalModal";

interface ExtractedItem {
  name: string;
  sku: string | null;
  quantity: number;
  unit_cost: number;
  unit_of_measure: string;
  sale_price: number | null;
}

interface OCRResult {
  success: boolean;
  items: ExtractedItem[];
  supplier: string | null;
  invoice_number: string | null;
  total_detected: number;
  confidence: string;
}

interface InvoiceOCRModalProps {
  open: boolean;
  onClose: () => void;
  onImportItems: (items: ExtractedItem[], supplier?: string | null, invoiceNumber?: string | null) => void;
}

/**
 * EM-R4: OCR de factura paper impresa.
 *
 * Flujo:
 * 1. Usuario sube/foto una factura (drag-drop o file picker o camera)
 * 2. Imagen se envía al endpoint /api/inventory/ocr-receipt
 * 3. VLM extrae items y retorna JSON estructurado
 * 4. Usuario revisa items detectados con confianza (high/medium/low)
 * 5. Clic "Importar N items" → se agregan a la recepción
 *
 * Si el VLM detecta proveedor y/o número de factura, los autocompleta.
 */
export function InvoiceOCRModal({ open, onClose, onImportItems }: InvoiceOCRModalProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten imágenes");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("La imagen no puede pesar más de 10MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      setResult(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleProcess = async () => {
    if (!imagePreview) return;
    setIsProcessing(true);
    setError(null);

    try {
      const response = await fetch("/api/inventory/ocr-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imagePreview }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Error al procesar la factura");
        return;
      }

      setResult(data);
      if (data.items.length === 0) {
        toast.warning("No se detectaron items en la factura");
      } else {
        toast.success(`${data.items.length} items detectados (confianza: ${data.confidence})`);
      }
    } catch (err: any) {
      setError(err.message || "Error de conexión");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = () => {
    if (!result || result.items.length === 0) return;
    onImportItems(result.items, result.supplier, result.invoice_number);
    handleReset();
    onClose();
  };

  const handleReset = () => {
    setImagePreview(null);
    setResult(null);
    setError(null);
  };

  const confidenceColor = {
    high: "text-success bg-success/10 border-success/20",
    medium: "text-warning bg-warning/10 border-warning/20",
    low: "text-destructive bg-destructive/10 border-destructive/20",
  };

  return (
    <POSPortalModal
      open={open}
      onClose={() => {
        handleReset();
        onClose();
      }}
      title="Escanear Factura"
      maxWidth="lg"
    >
      <div className="space-y-4">
        {!imagePreview && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground text-center">
              Sube una foto de la factura impresa del proveedor. El sistema extraerá automáticamente los items.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center gap-2 p-6 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors"
              >
                <Camera className="w-8 h-8 text-primary" />
                <span className="text-xs font-black uppercase tracking-widest text-primary">Tomar Foto</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-2 p-6 rounded-xl border-2 border-dashed border-border hover:bg-muted transition-colors"
              >
                <Upload className="w-8 h-8 text-muted-foreground" />
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Subir Archivo</span>
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
          </div>
        )}

        {imagePreview && (
          <div className="space-y-3">
            {/* Preview */}
            <div className="relative">
              <img
                src={imagePreview}
                alt="Factura"
                className="w-full max-h-64 object-contain rounded-xl border border-border bg-muted/20"
              />
              <button
                type="button"
                onClick={handleReset}
                className="absolute top-2 right-2 p-2 rounded-lg bg-background/80 backdrop-blur hover:bg-background"
                aria-label="Quitar imagen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Acciones */}
            {!result && !isProcessing && (
              <button
                type="button"
                onClick={handleProcess}
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" />
                Extraer Items
              </button>
            )}

            {isProcessing && (
              <div className="flex items-center justify-center py-6 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Analizando factura...</span>
              </div>
            )}

            {/* Resultado */}
            {result && (
              <div className="space-y-3">
                {/* Confidence badge */}
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider",
                      confidenceColor[result.confidence as keyof typeof confidenceColor] || confidenceColor.medium,
                    )}
                  >
                    {result.confidence === "high" && <CheckCircle2 className="w-3 h-3" />}
                    {result.confidence === "low" && <AlertCircle className="w-3 h-3" />}
                    Confianza: {result.confidence}
                  </span>
                  {result.total_detected > 0 && (
                    <span className="text-xs font-bold text-muted-foreground">
                      Total detectado: {formatCurrency(result.total_detected)}
                    </span>
                  )}
                </div>

                {/* Supplier + invoice autocompletados */}
                {(result.supplier || result.invoice_number) && (
                  <div className="p-2 rounded-lg bg-muted/30 border border-border text-xs space-y-1">
                    {result.supplier && (
                      <p><span className="font-bold text-muted-foreground">Proveedor:</span> {result.supplier}</p>
                    )}
                    {result.invoice_number && (
                      <p><span className="font-bold text-muted-foreground">Factura:</span> {result.invoice_number}</p>
                    )}
                  </div>
                )}

                {/* Items detectados */}
                {result.items.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                    {result.items.map((item, idx) => (
                      <div key={idx} className="p-2 flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{item.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {item.sku && <span>{item.sku} · </span>}
                            {item.quantity} {item.unit_of_measure} · {formatCurrency(item.unit_cost)}
                          </p>
                        </div>
                        <span className="text-sm font-black text-primary tabular-nums shrink-0">
                          {formatCurrency(item.quantity * item.unit_cost)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-center text-muted-foreground py-4">
                    No se detectaron items. Intenta con una foto más nítida.
                  </p>
                )}

                {/* Acciones */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="flex-1 h-10 rounded-lg border border-border text-xs font-black uppercase tracking-widest hover:bg-muted flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Otra foto
                  </button>
                  {result.items.length > 0 && (
                    <button
                      type="button"
                      onClick={handleImport}
                      className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:opacity-90 flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Importar {result.items.length} items
                    </button>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Error al procesar</p>
                  <p className="mt-0.5">{error}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </POSPortalModal>
  );
}
