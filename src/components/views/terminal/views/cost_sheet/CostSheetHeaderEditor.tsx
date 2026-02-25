'use client';

import React, { useState } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, LayoutGrid, ClipboardEdit } from 'lucide-react';

interface CostSheetHeaderEditorProps {
  header: any;
  calculatedHeader?: any;
}

const CostSheetHeaderEditor: React.FC<CostSheetHeaderEditorProps> = ({
  header,
  calculatedHeader
}) => {
  const { updateValue } = useCostSheetStore();
  const [isOpen, setIsOpen] = useState(true);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    updateValue(['header', name], value);
  };

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-[2.5rem] border border-border overflow-hidden shadow-sm">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-8 py-6 flex items-center justify-between hover:bg-muted/30 transition-colors group"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-2xl group-hover:scale-110 transition-transform">
              <ClipboardEdit className="w-5 h-5 text-primary" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Configuración General</h3>
              <p className="text-xs text-muted-foreground font-bold uppercase mt-0.5">Metadatos y Parámetros Operativos</p>
            </div>
          </div>
          {isOpen ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
        </button>

        {isOpen && (
        <div className="px-8 pb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-top-4 duration-300">
          {[
            { id: 'code', label: 'Código' },
            { id: 'name', label: 'Nombre del Producto' },
            { id: 'description', label: 'Descripción' },
            { id: 'unit', label: 'Unidad de Medida' },
            { id: 'quantity', label: 'Cantidad', type: 'text', isFormula: true },
            { id: 'currency', label: 'Moneda' },
            { id: 'company', label: 'Empresa' },
            { id: 'organism', label: 'Organismo' },
            { id: 'union', label: 'Unión' },
            { id: 'destination', label: 'Destino', type: 'select', options: ['producción', 'servicios'] },
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
                <label htmlFor={item.id} className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground block px-1 group-focus-within:text-primary transition-colors">
                  {item.label}
                  {isFormula && !isEditing && <span className="ml-2 text-primary font-black animate-pulse">fx</span>}
                </label>
                {(item as any).type === 'select' ? (
                  <select
                    id={item.id}
                    name={item.id}
                    value={displayValue}
                    onChange={(e) => {
                      updateValue(['header', item.id], e.target.value);
                    }}
                    className={cn(
                      "w-full px-4 py-3 text-sm font-bold border rounded-2xl focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all outline-none shadow-sm text-foreground bg-muted/20 border-border hover:border-primary/30 appearance-none"
                    )}
                  >
                    <option value="">Seleccionar...</option>
                    {((item as any).options || []).map((opt: string) => (
                      <option key={opt} value={opt} className="dark:bg-background">{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
                    ))}
                  </select>
                ) : (
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
                          ? "bg-muted/50 text-muted-foreground border-border cursor-not-allowed"
                          : "text-foreground bg-muted/20 border-border hover:border-primary/30",
                      isFormula && !isEditing && "text-primary dark:text-[currentColor] drop-shadow-[0_0_8px_hsl(var(--primary)/0.2)]"
                    )}
                  />
                )}
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
