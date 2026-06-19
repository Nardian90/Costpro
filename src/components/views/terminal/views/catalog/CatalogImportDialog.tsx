'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import {
  FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Upload, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { SecondaryButton, PrimaryButton } from '@/components/ui/atomic';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  importCatalogFromExcel,
  importCatalogFromCSV,
  exportCatalogToExcel,
  exportCatalogToCSV,
  type CatalogImportProduct,
  type ImportError,
} from '@/services/catalog-service';

interface CatalogImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess: () => void;
}

export default function CatalogImportDialog({ open, onOpenChange, onImportSuccess }: CatalogImportDialogProps) {
  const { user } = useAuthStore();
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    rows: CatalogImportProduct[];
    errors: ImportError[];
    totalCount: number;
  } | null>(null);
  // CM-4.5: Estado de dry-run — paso de revisión antes de insertar
  const [dryRunDone, setDryRunDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset internal state when dialog closes
  useEffect(() => {
    if (!open) {
      setImportFile(null);
      setImportPreview(null);
      setDryRunDone(false); // CM-4.5
    }
  }, [open]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // CM-3.7: Aceptar Excel y CSV
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv',
    ];
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) {
      toast.error('Solo se permiten archivos Excel (.xlsx, .xls) o CSV (.csv)');
      return;
    }

    setImportFile(file);

    // CM-3.7: Parse según extensión
    try {
      const result = ext === '.csv'
        ? await importCatalogFromCSV(file)
        : await importCatalogFromExcel(file);
      setImportPreview(result);
    } catch (err: any) {
      toast.error(err?.message || 'Error al procesar el archivo');
      setImportPreview(null);
    }

    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!importPreview || !user?.activeStoreId) {
      toast.error('No se pudo preparar la importación. Verifica que tengas una tienda activa.');
      return;
    }

    if (importPreview.rows.length === 0) {
      toast.error('No hay productos válidos para importar.');
      return;
    }

    setIsImporting(true);
    try {
      // Build product rows with all fields — send to server-side API route (bypasses RLS)
      const productsToInsert = importPreview.rows.map((row) => ({
        store_id: user.activeStoreId,
        sku: row.sku,
        name: row.name,
        cost_price: row.cost_price,
        price: row.price,
        image_url: null,
        category: row.category,
        unit_of_measure: row.unit_of_measure,
        description: row.description,
        is_active: true,
        barcode: row.barcode,
        barcode_type: 'EAN13' as const,
        min_stock: row.min_stock,
        supplier: row.supplier,
      }));

      // Get current access token for server-side auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Sesión expirada. Por favor, recarga la página e intenta de nuevo.');
      }

      // Call server-side API route (uses service_role to bypass RLS)
      const res = await fetch('/api/catalog/bulk-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ products: productsToInsert }),
      });

      const result = await res.json();

      if (!res.ok) {
        // RLS 403 — show detailed instructions to user
        if (res.status === 403 && result?.hint) {
          throw new Error(`${result.error}\n\n${result.hint}`);
        }
        throw new Error(result?.error || `Error del servidor (${res.status})`);
      }

      // Notify parent to refresh data
      onImportSuccess();

      const msg = importPreview.errors.length > 0
        ? `${importPreview.rows.length} productos importados con ${importPreview.errors.length} advertencia(s).`
        : `${importPreview.rows.length} productos importados correctamente.`;

      toast.success(msg);
      onOpenChange(false);
    } catch (err: any) {
      console.error('Import error:', err);
      const errMsg = err?.message || 'Error al importar los productos.';
      // For RLS errors with hint, show a longer-lasting toast
      if (errMsg.includes('SUPABASE_SERVICE_ROLE_KEY')) {
        toast.error(errMsg, { duration: 10000 });
      } else {
        toast.error(errMsg);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Importar Catálogo desde Excel
          </DialogTitle>
          <DialogDescription>
            Selecciona un archivo Excel (.xlsx) o CSV (.csv) con los productos a importar.
          </DialogDescription>
        </DialogHeader>

        {/* CM-1.7: Botón dedicado para descargar plantilla limpia */}
        <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10">
          <Download className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs text-muted-foreground flex-1">¿No tienes un archivo? Descarga la plantilla con campos de ejemplo.</span>
          <button
            type="button"
            onClick={() => {
              exportCatalogToExcel([], 'Plantilla_Catalogo').then(() => {
                toast.success('Plantilla Excel descargada');
              }).catch(() => {
                toast.error('Error al descargar plantilla');
              });
            }}
            className="text-xs font-black uppercase tracking-widest text-primary hover:underline shrink-0"
          >
            Excel
          </button>
          {/* CM-3.7: Plantilla CSV */}
          <button
            type="button"
            onClick={() => {
              exportCatalogToCSV([], 'Plantilla_Catalogo');
            }}
            className="text-xs font-black uppercase tracking-widest text-primary hover:underline shrink-0"
          >
            CSV
          </button>
        </div>

        {/* File Drop Zone */}
        <div className="space-y-4">
          {!importPreview && (
            <label
              htmlFor="catalog-import-file"
              className={cn(
                "flex flex-col items-center justify-center gap-4 p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all",
                "border-border hover:border-primary/50 hover:bg-primary/5",
                "group"
              )}
            >
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-black text-sm uppercase tracking-widest">
                  Seleccionar archivo Excel
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  .xlsx, .xls o .csv — Arrastra o haz clic para seleccionar
                </p>
              </div>
              <input
                id="catalog-import-file"
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          )}

          {/* Import Preview */}
          {importPreview && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="p-2 sm:p-3 rounded-xl bg-primary/5 border border-primary/10 text-center">
                  <div className="text-2xl font-black text-primary">{importPreview.rows.length}</div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                    Válidos
                  </div>
                </div>
                <div className="p-2 sm:p-3 rounded-xl bg-destructive/5 border border-destructive/10 text-center">
                  <div className="text-2xl font-black text-destructive">{importPreview.errors.length}</div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                    Errores
                  </div>
                </div>
                <div className="p-2 sm:p-3 rounded-xl bg-muted/50 border border-border text-center">
                  <div className="text-2xl font-black">{importPreview.totalCount}</div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                    Total filas
                  </div>
                </div>
              </div>

              {/* Errors List */}
              {importPreview.errors.length > 0 && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 border-b border-destructive/20">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                    <span className="text-xs font-black uppercase tracking-widest text-destructive">
                      Advertencias ({importPreview.errors.length})
                    </span>
                  </div>
                  <div className="max-h-32 overflow-y-auto p-3 space-y-1">
                    {importPreview.errors.map((err, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs">
                        <span className="font-mono text-muted-foreground shrink-0">Fila {err.row}:</span>
                        <span className="text-destructive/80">{err.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview Table */}
              {importPreview.rows.length > 0 && (
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                      Vista previa — {importPreview.rows.length} producto(s)
                    </span>
                  </div>
                  <div className="max-h-60 overflow-x-auto overflow-y-auto">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-[10px] font-black uppercase tracking-widest h-8">SKU</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest h-8">Nombre</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest h-8 text-right">Costo</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest h-8 text-right">Precio</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest h-8">Categoría</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest h-8">Código de Barras</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importPreview.rows.slice(0, 50).map((row, idx) => (
                          <TableRow key={idx} className="text-xs h-8">
                            <TableCell className="font-mono text-[11px]">{row.sku}</TableCell>
                            <TableCell className="font-bold max-w-[150px] truncate">{row.name}</TableCell>
                            <TableCell className="text-right tabular-nums">{row.cost_price.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-black text-primary tabular-nums">{row.price.toFixed(2)}</TableCell>
                            <TableCell className="text-muted-foreground">{row.category || '—'}</TableCell>
                            <TableCell className="font-mono text-[10px] text-muted-foreground tabular-nums">{row.barcode}</TableCell>
                          </TableRow>
                        ))}
                        {importPreview.rows.length > 50 && (
                          <TableRow className="text-xs h-8 bg-muted/30">
                            <TableCell colSpan={6} className="text-center text-muted-foreground text-[10px] font-bold uppercase tracking-widest">
                              ... y {importPreview.rows.length - 50} productos más
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Change file button */}
              <button
                type="button"
                onClick={() => {
                  setImportPreview(null);
                  setImportFile(null);
                  fileInputRef.current?.click();
                }}
                className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 mx-auto"
              >
                <Upload className="w-3 h-3" />
                Cambiar archivo
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="gap-2 sm:gap-2">
          <SecondaryButton onClick={handleClose} label="Cancelar" className="flex-1" />
          {/* CM-4.5: Flujo dry-run — 2 pasos: Revisar → Confirmar */}
          {!dryRunDone ? (
            <PrimaryButton
              onClick={() => setDryRunDone(true)}
              label={`Revisar ${importPreview?.rows.length || 0} producto(s)`}
              icon={Download}
              disabled={!importPreview || importPreview.rows.length === 0}
              className="flex-1"
            />
          ) : (
            <div className="flex flex-col gap-2 flex-1">
              {/* CM-4.5: Resumen dry-run antes de confirmar */}
              <div className="flex items-center gap-2 p-2 rounded-xl bg-amber-50 border border-amber-300 dark:bg-amber-950/30 dark:border-amber-800">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="text-[10px] text-amber-800 dark:text-amber-300">
                  Se insertarán/actualizarán <strong>{importPreview?.rows.length || 0} productos</strong>.
                  {importPreview && importPreview.rows.length > 0 && (
                    <> SkUs se actualizan si ya existen (upsert).</>
                  )}
                </span>
              </div>
              <div className="flex gap-2">
                <SecondaryButton
                  onClick={() => setDryRunDone(false)}
                  label="Volver"
                  className="flex-1"
                />
                <PrimaryButton
                  onClick={handleConfirmImport}
                  label={isImporting ? 'Importando...' : 'Confirmar e Importar'}
                  icon={isImporting ? Loader2 : Download}
                  disabled={isImporting}
                  className="flex-1"
                />
              </div>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
