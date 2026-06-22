'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useAuthStore } from '@/store';
import { supabase } from '@/lib/supabaseClient';
import {
  FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Upload, Download,
  ChevronDown, Check, FileText,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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

// ════════════════════════════════════════════════════════════════════════
// Combobox profesional para categoría — busca, filtra y muestra check
// ════════════════════════════════════════════════════════════════════════
function CategoryCombobox({
  value,
  onChange,
  productName,
  categories,
}: {
  value: string | null;
  onChange: (val: string | null) => void;
  productName: string;
  categories: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={`Categoría de ${productName}`}
          className={cn(
            "flex items-center justify-between gap-1 w-full min-w-[150px] px-2.5 py-1.5 rounded-lg text-[11px] font-bold outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer transition-all border",
            value
              ? "bg-primary/10 text-primary border-primary/25 hover:bg-primary/15"
              : "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/15"
          )}
        >
          <span className="truncate flex-1 text-left">
            {value || "⚠ Sin clasificar"}
          </span>
          <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar categoría..." className="h-8 text-xs" />
          <CommandList className="max-h-[200px]">
            <CommandEmpty className="text-xs py-3 text-center text-muted-foreground">
              Sin resultados
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="sin clasificar"
                onSelect={() => { onChange(null); setOpen(false); }}
                className="text-xs cursor-pointer"
              >
                <Check className={cn("mr-2 h-3 w-3", !value ? "opacity-100" : "opacity-0")} />
                ⚠ Sin clasificar
              </CommandItem>
              {categories.map(cat => (
                <CommandItem
                  key={cat}
                  value={cat.toLowerCase()}
                  onSelect={() => { onChange(cat); setOpen(false); }}
                  className="text-xs cursor-pointer"
                >
                  <Check className={cn("mr-2 h-3 w-3", value === cat ? "opacity-100" : "opacity-0")} />
                  {cat}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Combobox profesional para unidad de medida
// ════════════════════════════════════════════════════════════════════════
function UnitCombobox({
  value,
  onChange,
  productName,
  units,
}: {
  value: string;
  onChange: (val: string) => void;
  productName: string;
  units: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={`Unidad de medida de ${productName}`}
          className="flex items-center justify-between gap-1 w-full min-w-[90px] px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-muted/30 text-foreground border border-border/50 hover:bg-muted/50 outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer transition-all"
        >
          <span className="truncate flex-1 text-left">{value}</span>
          <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[160px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar unidad..." className="h-8 text-xs" />
          <CommandList className="max-h-[200px]">
            <CommandEmpty className="text-xs py-3 text-center text-muted-foreground">
              Sin resultados
            </CommandEmpty>
            <CommandGroup>
              {units.map(unit => (
                <CommandItem
                  key={unit}
                  value={unit}
                  onSelect={() => { onChange(unit); setOpen(false); }}
                  className="text-xs cursor-pointer"
                >
                  <Check className={cn("mr-2 h-3 w-3", value === unit ? "opacity-100" : "opacity-0")} />
                  {unit}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
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

  // Cat-Import-Fix: categorías válidas predefinidas
  const VALID_CATEGORIES = [
    'Materiales de Construcción',
    'Revestimientos y Pisos',
    'Electricidad',
    'Iluminación',
    'Plomería',
    'Pinturas e Impermeabilizantes',
    'Carpintería',
    'Mobiliario',
    'Baño y Sanitarios',
    'Limpieza',
    'Ferretería',
    'Jardinería y Exterior',
    'Combustibles',
  ];

  // Cat-Import-Fix: unidades de medida válidas del sistema
  const VALID_UNITS = [
    'unidad', 'kg', 'gramo', 'libra', 'tonelada',
    'litro', 'ml', 'galón', 'm3',
    'metro', 'cm', 'mm', 'pie', 'pulgada', 'yarda',
    'm2', 'm3', 'pie2', 'caja', 'paquete', 'rollo',
    'saco', 'bolsa', 'lata', 'botella', 'docena', 'par', 'juego',
  ];

  // Cat-Import-Fix: normalizar categoría — si no coincide, asignar null (sin clasificar)
  const normalizeCategory = (cat: string | null): string | null => {
    if (!cat || !cat.trim()) return null;
    const trimmed = cat.trim();
    // Buscar match exacto o case-insensitive
    const match = VALID_CATEGORIES.find(v => v.toLowerCase() === trimmed.toLowerCase());
    return match || null; // Si no coincide → null (sin clasificar)
  };

  // Cat-Import-Fix: normalizar unidad de medida
  const normalizeUnit = (unit: string | null): string => {
    if (!unit || !unit.trim()) return 'unidad';
    const trimmed = unit.trim().toLowerCase();
    const match = VALID_UNITS.find(v => v === trimmed);
    return match || 'unidad'; // Si no coincide → unidad (default)
  };

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

      // Cat-Import-Fix: normalizar categorías y unidades en el preview
      result.rows = result.rows.map(row => ({
        ...row,
        category: normalizeCategory(row.category),
        unit_of_measure: normalizeUnit(row.unit_of_measure),
      }));

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
      <DialogContent className="sm:max-w-5xl max-h-[92vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Importar Catálogo desde Excel
          </DialogTitle>
          <DialogDescription>
            Selecciona un archivo Excel (.xlsx) o CSV (.csv) con los productos a importar.
          </DialogDescription>
        </DialogHeader>

        {/* Cat-Import-Fix: Plantillas con botones profesionales */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10 shrink-0">
          <Download className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs text-muted-foreground flex-1">¿No tienes un archivo? Descarga la plantilla:</span>
          <button
            type="button"
            onClick={() => {
              exportCatalogToExcel([], 'Plantilla_Catalogo').then(() => toast.success('Plantilla Excel descargada')).catch(() => toast.error('Error al descargar'));
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/90 text-white dark:text-black border border-success/30 text-[10px] font-black uppercase tracking-widest hover:bg-success transition-all shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel
          </button>
          <button
            type="button"
            onClick={() => exportCatalogToCSV([], 'Plantilla_Catalogo')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-info/15 text-info border border-info/30 text-[10px] font-black uppercase tracking-widest hover:bg-info/25 transition-all shrink-0"
          >
            <FileText className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>

        {/* File Drop Zone + Preview — área scrolleable */}
        <div className="space-y-4 flex-1 overflow-y-auto min-h-0">
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
                  <div className="max-h-60 overflow-y-auto">
                    <div className="overflow-x-auto">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-[10px] font-black uppercase tracking-widest h-8">SKU</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest h-8">Nombre</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest h-8 text-right">Costo</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest h-8 text-right">Precio</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest h-8">Categoría</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest h-8">Unidad</TableHead>
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
                            <TableCell>
                              <CategoryCombobox
                                value={row.category}
                                onChange={(val) => {
                                  const updated = [...importPreview.rows];
                                  updated[idx].category = val;
                                  setImportPreview({ ...importPreview, rows: updated });
                                }}
                                productName={row.name}
                                categories={VALID_CATEGORIES}
                              />
                            </TableCell>
                            <TableCell>
                              <UnitCombobox
                                value={row.unit_of_measure || 'unidad'}
                                onChange={(val) => {
                                  const updated = [...importPreview.rows];
                                  updated[idx].unit_of_measure = val;
                                  setImportPreview({ ...importPreview, rows: updated });
                                }}
                                productName={row.name}
                                units={VALID_UNITS}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-[10px] text-muted-foreground tabular-nums">{row.barcode}</TableCell>
                          </TableRow>
                        ))}
                        {importPreview.rows.length > 50 && (
                          <TableRow className="text-xs h-8 bg-muted/30">
                            <TableCell colSpan={7} className="text-center text-muted-foreground text-[10px] font-bold uppercase tracking-widest">
                              ... y {importPreview.rows.length - 50} productos más
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                    </div>
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

        {/* Footer — fijo en la parte inferior del modal */}
        <DialogFooter className="gap-2 sm:gap-2 shrink-0 border-t border-border/50 pt-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-6 py-2.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-[10px] font-black uppercase tracking-widest hover:bg-destructive/20 transition-all active:scale-95 flex-1"
          >
            Cancelar
          </button>
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
            <div className="flex flex-col gap-2 w-full">
              {/* CM-4.5: Resumen dry-run antes de confirmar */}
              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-300 dark:bg-amber-950/30 dark:border-amber-800">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <span className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300 break-words">
                  Se insertarán/actualizarán <strong>{importPreview?.rows.length || 0} productos</strong>.
                  {importPreview && importPreview.rows.length > 0 && (
                    <> SkUs se actualizan si ya existen (upsert).</>
                  )}
                </span>
              </div>
              {/* Cat-Import-Fix: mostrar advertencias de categorías sin clasificar */}
              {importPreview && (() => {
                const unclassified = importPreview.rows.filter(r => !r.category).length;
                const invalidUnits = importPreview.rows.filter(r => !VALID_UNITS.includes(r.unit_of_measure?.toLowerCase() || '')).length;
                if (unclassified === 0 && invalidUnits === 0) return null;
                return (
                  <div className="flex items-start gap-2 p-2.5 rounded-xl bg-info/10 border border-info/30">
                    <AlertCircle className="w-4 h-4 text-info shrink-0 mt-0.5" />
                    <span className="text-[11px] leading-relaxed text-info break-words">
                      {unclassified > 0 && <>{unclassified} producto(s) sin clasificar (categoría no reconocida). </>}
                      {invalidUnits > 0 && <>{invalidUnits} producto(s) con unidad no estándar (se usará "unidad"). </>}
                      Puedes volver atrás y corregir.
                    </span>
                  </div>
                );
              })()}
              <div className="flex gap-2 w-full">
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
                  className="flex-1 whitespace-nowrap"
                />
              </div>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
