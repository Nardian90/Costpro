'use client';

import React, { useState } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useExpertModeState } from '@/hooks/ui/useExpertModeState';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronUp,
  ClipboardEdit,
  Tag,
  Settings2,
  Building2,
  TrendingUp,
  HelpCircle,
  Hash,
  Globe,
  Briefcase,
  Users,
  Target,
  DollarSign,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CostSheetHeaderEditorProps {
  header: any;
  calculatedHeader?: any;
}

const CostSheetHeaderEditor: React.FC<CostSheetHeaderEditorProps> = ({
  header,
  calculatedHeader
}) => {
  const { updateValue } = useCostSheetStore();
  const { expandedSections, toggleSection, setHelpContext } = useExpertModeState();
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const isOpen = expandedSections.includes('header');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    updateValue(['header', name], value);
  };

  const renderField = (item: {
    id: string;
    label: string;
    type?: string;
    isFormula?: boolean;
    readonly?: boolean;
    options?: string[];
    className?: string;
    icon?: any;
  }) => {
    const isEditing = focusedField === item.id;
    const displayValue = (isEditing || !calculatedHeader)
        ? (header?.[item.id] ?? '')
        : (calculatedHeader?.[item.id] ?? header?.[item.id] ?? '');

    const isFormula = String(header?.[item.id]).startsWith('=');
    const Icon = item.icon;

    return (
      <div key={item.id} className={cn("space-y-1.5 group", item.className)}>
        <label htmlFor={item.id} className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5 px-1 group-focus-within:text-primary transition-colors">
          {Icon && <Icon className="w-3 h-3" />}
          {item.label}
          {isFormula && !isEditing && <span className="ml-1 text-primary font-black animate-pulse text-[8px]">FX</span>}
        </label>
        <div className="relative">
            {item.type === 'select' ? (
              <select
                id={item.id}
                name={item.id}
                value={displayValue}
                onChange={(e) => {
                  updateValue(['header', item.id], e.target.value);
                }}
                className={cn(
                  "w-full px-4 py-2.5 text-sm font-semibold border rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all outline-none shadow-sm text-foreground bg-muted/10 border-border/50 hover:border-primary/30 appearance-none"
                )}
              >
                <option value="">Seleccionar...</option>
                {(item.options || []).map((opt: string) => (
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
                  "w-full px-4 py-2.5 text-sm font-semibold border rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all outline-none shadow-sm",
                  item.readonly
                      ? "bg-muted/40 text-muted-foreground border-border/40 cursor-not-allowed"
                      : "text-foreground bg-muted/10 border-border/50 hover:border-primary/30",
                  isFormula && !isEditing && "text-primary dark:text-[currentColor] drop-shadow-[0_0_8px_hsl(var(--primary)/0.2)]"
                )}
              />
            )}
            {item.type === 'select' && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground/50">
                    <ChevronDown className="w-4 h-4" />
                </div>
            )}
        </div>
      </div>
    );
  };

  const SectionHeader = ({ icon: Icon, title, subtitle }: { icon: any, title: string, subtitle: string }) => (
    <div className="col-span-full flex items-center gap-4 mb-4 mt-6 first:mt-0">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border/50 to-transparent" />
      <div className="flex items-center gap-2.5 px-4">
        <Icon className="w-4 h-4 text-primary" />
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-foreground">{title}</span>
      </div>
      <div className="h-px flex-1 bg-gradient-to-r from-border/50 via-border/50 to-transparent" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className={cn(
        "bg-card rounded-[2.5rem] border border-border overflow-hidden shadow-sm transition-all duration-300",
        isOpen ? "ring-1 ring-primary/10 shadow-md" : "hover:border-primary/30"
      )}>
        <div
          className={cn(
            "w-full px-8 py-6 flex items-center justify-between transition-colors group cursor-pointer",
            isOpen ? "bg-muted/5" : "hover:bg-muted/30"
          )}
          onClick={() => toggleSection('header')}
        >
          <div className="flex items-center gap-4">
            <div className={cn(
              "p-3 rounded-2xl transition-all duration-300",
              isOpen ? "bg-primary text-primary-foreground scale-105 shadow-lg shadow-primary/20" : "bg-primary/5 text-primary"
            )}>
              <ClipboardEdit className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Configuración General</h3>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5 opacity-70">Metadatos y Parámetros Operativos</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-xl hover:bg-primary/10 text-primary transition-all "
              onClick={(e) => {
                e.stopPropagation();
                setHelpContext('header');
              }}
            >
              <HelpCircle className="w-5 h-5" />
            </Button>
            <div className="p-2 rounded-xl bg-muted/10 group-hover:bg-primary/10 transition-colors">
                {isOpen ? <ChevronUp className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </div>
        </div>

        {isOpen && (
          <div className="px-10 pb-10 space-y-2 animate-in fade-in slide-in-from-top-4 duration-500">
            {/* Group 1: Identificación */}
            <div className="grid grid-cols-12 gap-x-8 gap-y-6">
              <SectionHeader
                icon={Tag}
                title="Identificación del Producto"
                subtitle=""
              />
              {renderField({ id: 'code', label: 'Código', className: 'col-span-12 md:col-span-3', icon: Hash })}
              {renderField({ id: 'name', label: 'Nombre Comercial', className: 'col-span-12 md:col-span-9', icon: ClipboardEdit })}
              {renderField({ id: 'description', label: 'Descripción Detallada', className: 'col-span-12', icon: Info })}
            </div>

            {/* Group 2: Parámetros de Operación */}
            <div className="grid grid-cols-12 gap-x-8 gap-y-6">
              <SectionHeader
                icon={Settings2}
                title="Parámetros de Operación"
                subtitle=""
              />
              {renderField({ id: 'unit', label: 'Unidad de Medida', className: 'col-span-6 md:col-span-3', icon: Tag })}
              {renderField({ id: 'quantity', label: 'Cantidad Base', className: 'col-span-6 md:col-span-3', icon: Hash })}
              {renderField({ id: 'production_level', label: 'Nivel de Producción', type: 'number', className: 'col-span-6 md:col-span-3', icon: Target })}
              {renderField({ id: 'currency', label: 'Moneda', className: 'col-span-6 md:col-span-3', icon: Globe })}
              {renderField({ id: 'capacity_utilization', label: '% Capacidad Instalada', readonly: true, className: 'col-span-12 md:col-span-3', icon: TrendingUp })}
            </div>

            {/* Group 3: Entorno Organizativo */}
            <div className="grid grid-cols-12 gap-x-8 gap-y-6">
              <SectionHeader
                icon={Building2}
                title="Entorno Organizativo"
                subtitle=""
              />
              {renderField({ id: 'company', label: 'Empresa', className: 'col-span-12 md:col-span-4', icon: Building2 })}
              {renderField({ id: 'organism', label: 'Organismo', className: 'col-span-12 md:col-span-4', icon: Briefcase })}
              {renderField({ id: 'union', label: 'Unión', className: 'col-span-12 md:col-span-4', icon: Users })}
              {renderField({ id: 'destination', label: 'Destino de Producción', type: 'select', options: ['producción', 'servicios'], className: 'col-span-12 md:col-span-6', icon: Target })}
            </div>

            {/* Group 4: Clasificación y Comercialización */}
            <div className="grid grid-cols-12 gap-x-8 gap-y-6">
              <SectionHeader
                icon={TrendingUp}
                title="Comercialización"
                subtitle=""
              />
              {renderField({ id: 'client', label: 'Cliente Principal', className: 'col-span-12 md:col-span-4', icon: Users })}
              {renderField({ id: 'category', label: 'Categoría de Producto', className: 'col-span-12 md:col-span-4', icon: Tag })}
              {renderField({ id: 'type', label: 'Tipo de Costo', className: 'col-span-12 md:col-span-4', icon: Info })}
              {renderField({ id: 'sale_price', label: 'Precio de Venta Sugerido', isFormula: true, className: 'col-span-12 md:col-span-6', icon: DollarSign })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CostSheetHeaderEditor;
