'use client';

import React from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { Button } from '@/components/ui/button';
import { Download, Upload } from 'lucide-react';
import { exportHeaderToExcel, importHeaderFromExcel } from '@/services/excel-service';
import { cn } from '@/lib/utils';

interface CostSheetHeaderEditorProps {
    compact?: boolean;
    calculatedHeader?: any;
}

const CostSheetHeaderEditor: React.FC<CostSheetHeaderEditorProps> = ({ compact = false, calculatedHeader }) => {
  const { data, updateValue, updateValues } = useCostSheetStore();
  const header = data?.header;
  const [focusedField, setFocusedField] = React.useState<string | null>(null);

  if (!header) return null;

  const headerInputRef = React.useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;

    // If it starts with =, it's a formula, store as string
    if (typeof value === 'string' && value.startsWith('=')) {
        updateValue(['header', name], value);
        return;
    }

    const finalValue = type === 'number' ? parseFloat(value) || 0 : value;
    updateValue(['header', name], finalValue);
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const newHeader = await importHeaderFromExcel(file);
        const updates = Object.keys(newHeader).map(key => ({
          path: ['header', key],
          value: (newHeader as any)[key]
        }));
        updateValues(updates);
      } catch (err) {
        console.error(err);
      }
    }
    e.target.value = '';
  };

  return (
    <div className={cn(
        "bg-white/80 dark:bg-[#0B0F19]/80 backdrop-blur-xl rounded-[2.5rem] border border-slate-200 dark:border-primary/10 shadow-2xl animate-in slide-in-from-top duration-700",
        compact ? "p-4" : "p-8"
    )}>
      <div className={cn("flex flex-col", compact ? "gap-2" : "gap-6")}>
        {!compact && (
            <div className="flex justify-end gap-2 mb-2">
                <Button
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-xl font-bold gap-2 text-[10px] uppercase tracking-wider bg-white/50 dark:bg-slate-900/50"
                    onClick={() => exportHeaderToExcel(header)}
                >
                    <Download className="w-3.5 h-3.5 text-primary" />
                    Exportar Excel
                </Button>
                <div className="relative">
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-9 rounded-xl font-bold gap-2 text-[10px] uppercase tracking-wider bg-white/50 dark:bg-slate-900/50"
                        onClick={() => headerInputRef.current?.click()}
                    >
                        <Upload className="w-3.5 h-3.5 text-primary" />
                        Importar Excel
                    </Button>
                    <input
                        type="file"
                        ref={headerInputRef}
                        className="hidden"
                        accept=".xlsx,.xls"
                        onChange={handleImportExcel}
                    />
                </div>
            </div>
        )}
        <div className={cn("flex flex-col gap-4", compact && "sm:flex-row sm:items-center sm:justify-between")}>
          <div className="flex-1">
            {!compact && (
                <label htmlFor="name" className="text-[10px] font-black uppercase tracking-[0.3em] text-primary block mb-2 px-1">
                    Nombre del Recurso
                    {String(header?.name).startsWith('=') && focusedField !== 'name' && <span className="ml-2 text-primary animate-pulse font-black">fx</span>}
                </label>
            )}
            <input
                id="name"
                name="name"
                type="text"
                value={(focusedField === 'name' || !calculatedHeader) ? (header?.name || '') : (calculatedHeader?.name || header?.name || '')}
                onChange={handleChange}
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField(null)}
                placeholder="Nombre del Recurso"
                className={cn(
                    "w-full px-4 py-3 font-black text-slate-900 dark:text-white bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200 dark:border-primary/20 rounded-2xl focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all outline-none shadow-sm",
                    compact ? "text-sm bg-transparent border-none py-1 px-1 shadow-none" : "text-2xl sm:text-3xl lg:text-4xl tracking-tight",
                    String(header?.name).startsWith('=') && focusedField !== 'name' && "text-primary dark:text-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.3)]"
                )}
            />
          </div>
          {compact && (
              <div className="flex items-center gap-4 px-4 py-1 bg-primary/10 rounded-full">
                  <span className="text-[10px] font-black text-primary uppercase tracking-widest">{header?.code}</span>
                  <span className="text-[10px] font-bold text-muted-foreground">{header?.unit}</span>
              </div>
          )}
        </div>

        {!compact && (
          <div className="grid grid-cols-1 gap-y-6">
          {[
            { id: 'code', label: 'No. FC' },
            { id: 'product_code', label: 'Cod. Producto', isFormula: true },
            { id: 'date', label: 'Fecha', type: 'date' },
            { id: 'unit', label: 'UM', isFormula: true },
            { id: 'quantity', label: 'Cantidad', type: 'text', isFormula: true },
            { id: 'currency', label: 'Moneda' },
            { id: 'company', label: 'Empresa' },
            { id: 'organism', label: 'Organismo' },
            { id: 'union', label: 'Unión' },
            { id: 'destination', label: 'Destino' },
            { id: 'production_level', label: 'Nivel Prod.', type: 'number' },
            { id: 'capacity_utilization', label: '% Capacidad', type: 'text', readonly: true },
            { id: 'sale_price', label: 'Precio Venta', type: 'text', isFormula: true },
            { id: 'client', label: 'Cliente' },
            { id: 'category', label: 'Categoría' },
            { id: 'type', label: 'Tipo' },
          ].map((item) => {
            const isEditing = focusedField === item.id;
            const displayValue = (isEditing || !calculatedHeader)
                ? (header?.[item.id] ?? '')
                : (calculatedHeader?.[item.id] ?? header?.[item.id] ?? '');

            const isFormula = String(header?.[item.id]).startsWith('=');

            return (
              <div key={item.id} className="space-y-2 group">
                <label htmlFor={item.id} className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 block px-1 group-focus-within:text-primary transition-colors">
                  {item.label}
                  {isFormula && !isEditing && <span className="ml-2 text-primary font-black animate-pulse">fx</span>}
                </label>
                <input
                  id={item.id}
                  name={item.id}
                  type={(isEditing || isFormula) ? 'text' : (item.type || 'text')}
                  value={displayValue}
                  onChange={handleChange}
                  onFocus={() => setFocusedField(item.id)}
                  onBlur={() => setFocusedField(null)}
                  readOnly={item.readonly}
                  className={cn(
                    "w-full px-4 py-3 text-sm font-bold border rounded-2xl focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all outline-none shadow-sm",
                    item.readonly
                        ? "bg-slate-200 dark:bg-slate-900/80 text-slate-500 border-slate-300 dark:border-slate-800 cursor-not-allowed"
                        : "text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-primary/10 hover:border-primary/30",
                    isFormula && !isEditing && "text-primary dark:text-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.2)]"
                  )}
                />
              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
};

export default CostSheetHeaderEditor;