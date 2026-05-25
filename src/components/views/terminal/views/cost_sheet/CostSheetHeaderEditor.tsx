'use client';

import React, { useState } from 'react';
import type { CostSheetHeader } from '@/types/cost-sheet';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';

// ── Types ───────────────────────────────────────────────────────────

interface CostSheetHeaderEditorProps {
  header: CostSheetHeader;
  calculatedHeader?: Partial<CostSheetHeader>;
}

interface FieldDef {
  id: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'date';
  readonly?: boolean;
  options?: string[];
  helpText?: string;
  helpExample?: string;
}

interface FieldGroup {
  title: string;
  colorIdx: number;
  fields: FieldDef[];
}

// ── Field Group Definitions ─────────────────────────────────────────

const FIELD_GROUPS: FieldGroup[] = [
  {
    title: 'Identificación del Producto',
    colorIdx: 0,
    fields: [
      { id: 'resolution', label: 'Resolución', type: 'select', options: ['Res 148/2023', 'Otra'], helpText: 'Normativa que regula la ficha de costos', helpExample: 'Res 148/2023' },
      { id: 'code', label: 'Código', helpText: 'Código único del producto o servicio en el sistema de la empresa', helpExample: 'MP-001, SVC-045' },
      { id: 'name', label: 'Nombre Comercial', helpText: 'Denominación oficial del producto o servicio que se está costeando', helpExample: 'Hamburguesa Doble Queso, Servicio de Mantenimiento Industrial' },
    ],
  },
  {
    title: 'Parámetros de Operación',
    colorIdx: 1,
    fields: [
      { id: 'unit', label: 'Unidad de Medida', helpText: 'Unidad en que se expresa la producción (unidad, kg, litro, etc.)', helpExample: 'u, kg, L, m2, m3, pza, docena' },
      { id: 'quantity', label: 'Cantidad Base', helpText: 'Cantidad de referencia para el cálculo del costo unitario', helpExample: '1, 100, 1000' },
      { id: 'production_level', label: 'Nivel de Producción', helpText: 'Volumen de producción mensual o anual utilizado como base de prorrateo', helpExample: '500, 10000' },
      { id: 'capacity_utilization', label: '% Capacidad Instalada', readonly: true, helpText: 'Porcentaje de capacidad utilizada (calculado automáticamente: cantidad/nivel de producción)', helpExample: '85%' },
    ],
  },
  {
    title: 'Financiera',
    colorIdx: 5,
    fields: [
      { id: 'currency', label: 'Moneda', type: 'select', options: ['CUP', 'USD', 'EUR', 'MLC'], helpText: 'Moneda en que se expresan los costos', helpExample: 'CUP, USD, EUR, MLC' },
      { id: 'exchangeRate', label: 'Tasa de Cambio', type: 'number', helpText: 'Tasa para convertir la ficha a otra moneda. 1 USD = N CUP. Dejar vacio para desactivar conversion', helpExample: '540' },
      { id: 'targetCurrency', label: 'Moneda Destino', type: 'select', options: ['USD', 'EUR', 'GBP', 'CUP', 'MLC', 'CAD', 'CHF', 'MXN', 'CNY', 'JPY', 'BRL', 'ARS'], helpText: 'Moneda a la que se convierte la ficha (codigo ISO 4217)', helpExample: 'USD' },
      { id: 'rateType', label: 'Tipo de Tasa', type: 'select', options: ['Cierre', 'Spot', 'Promedio'], helpText: 'Tipo de tasa de cambio segun IAS 21.22', helpExample: 'Cierre' },
      { id: 'rateDate', label: 'Fecha de la Tasa', type: 'date', helpText: 'Fecha de la tasa de cambio (para disclosure IAS 21.22)', helpExample: '2025-05-25' },
      { id: 'rateSource', label: 'Fuente de la Tasa', helpText: 'Origen de la tasa de cambio', helpExample: 'BCC Oficial, Manual, BCC Promedio' },
    ],
  },
  {
    title: 'Entorno Organizativo',
    colorIdx: 2,
    fields: [
      { id: 'company', label: 'Empresa', helpText: 'Nombre de la entidad productiva o prestadora del servicio', helpExample: 'Empresa de Alimentos "La Ideal" EIG' },
      { id: 'organism', label: 'Organismo', helpText: 'Organismo superior al que pertenece la empresa', helpExample: 'MINAL, MINSAP, GECMIN' },
      { id: 'union', label: 'Unión', helpText: 'Organización sindical o(base) de la empresa', helpExample: 'CTC, SNTF' },
      { id: 'destination', label: 'Destino de Producción', type: 'select', options: ['producción', 'servicios'], helpText: 'Indica si el costo se destina a la producción de bienes o a la prestación de servicios', helpExample: 'producción, servicios' },
    ],
  },
  {
    title: 'Comercialización',
    colorIdx: 3,
    fields: [
      { id: 'client', label: 'Cliente Principal', helpText: 'Destinatario principal del producto o servicio', helpExample: 'Grupo CIMEX, MIP, Mercado Interno' },
      { id: 'category', label: 'Categoría de Producto', helpText: 'Clasificación del producto según la normativa vigente', helpExample: 'General, Especial, Estratégico, Sustituto de Importación' },
      { id: 'type', label: 'Tipo de Costo', helpText: 'Clasificación del costo según su naturaleza', helpExample: 'EMPRESA, ESTATAL, MIXTO' },
      { id: 'sale_price', label: 'Precio de Venta Sugerido', helpText: 'Precio propuesto para la venta (puede ser una fórmula que se calcula automáticamente)', helpExample: '=ref(\'14.1\'), 125.50' },
    ],
  },
];

// ── Color Palette (matching FlatTable) ──────────────────────────────

const BG_COLORS = ['bg-primary/5', 'bg-violet-500/5', 'bg-amber-500/5', 'bg-emerald-500/5', 'bg-rose-500/5', 'bg-cyan-500/5'];
const BORDER_COLORS = ['border-l-primary/40', 'border-l-violet-500/40', 'border-l-amber-500/40', 'border-l-emerald-500/40', 'border-l-rose-500/40', 'border-l-cyan-500/40'];

// ── Group Divider Row ───────────────────────────────────────────────

const GroupDividerRow: React.FC<{ group: FieldGroup; isCollapsed: boolean; onToggle: () => void }> = ({
  group,
  isCollapsed,
  onToggle,
}) => {
  const bgColor = BG_COLORS[group.colorIdx % BG_COLORS.length];
  const borderColor = BORDER_COLORS[group.colorIdx % BORDER_COLORS.length];

  return (
    <TableRow
      className={cn(
        'h-8 border-y border-border/30 group hover:bg-primary/5 transition-colors cursor-pointer',
        bgColor
      )}
      onClick={onToggle}
    >
      <TableCell colSpan={4} className="px-3 py-1">
        <div className="flex items-center gap-2">
          <ChevronRight
            className={cn(
              'w-3.5 h-3.5 text-muted-foreground transition-transform duration-200',
              !isCollapsed && 'rotate-90'
            )}
          />
          <div className={cn('w-0.5 h-4 rounded-full border-l-2', borderColor)} />
          <span className="text-[11px] font-black uppercase tracking-[0.15em] text-foreground">
            {group.title}
          </span>
          <span className="text-[9px] text-muted-foreground/60 font-mono ml-2">
            ({group.fields.length} campos)
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
};

// ── Main Component ──────────────────────────────────────────────────

const CostSheetHeaderEditor: React.FC<CostSheetHeaderEditorProps> = ({
  header,
  calculatedHeader,
}) => {
  const { updateValue } = useCostSheetStore();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [editingField, setEditingField] = useState<string | null>(null);

  const toggleGroup = (groupTitle: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupTitle]: !prev[groupTitle] }));
  };

  const handleChange = (fieldId: string, value: string) => {
    updateValue(['header', fieldId], value);
  };

  const handleBlur = (fieldId: string, value: string, type?: string) => {
    setEditingField(null);
    // Convert number fields
    if (type === 'number' && value !== '') {
      const num = Number(value);
      if (!isNaN(num)) {
        updateValue(['header', fieldId], num);
      }
    }
  };

  const handleSelectChange = (fieldId: string, value: string) => {
    updateValue(['header', fieldId], value);
  };

  let globalRowIndex = 0;

  return (
    <div className="border border-border/60 rounded-xl overflow-hidden shadow-sm bg-card">
      <div className="overflow-x-auto">
        <Table className="w-full" style={{ borderSpacing: 0 }}>
          {/* Column Header */}
          <TableHeader className="sticky top-0 z-20">
            <TableRow className="bg-muted/80 hover:bg-transparent border-b border-border/40 h-7">
              <TableHead className="w-[40px] px-1.5 py-0 text-center text-[8px] font-black tracking-widest text-muted-foreground/50 border-r border-border/20">
                #
              </TableHead>
              <TableHead className="px-2 py-0 text-left text-[8px] font-black tracking-widest text-muted-foreground/50 border-r border-border/20">
                CAMPO
              </TableHead>
              <TableHead className="px-2 py-0 text-left text-[8px] font-black tracking-widest text-muted-foreground/50 border-r border-border/20">
                VALOR
              </TableHead>
              <TableHead className="px-2 py-0 text-left text-[8px] font-black tracking-widest text-muted-foreground/50">
                AYUDA
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {FIELD_GROUPS.map((group) => {
              const isCollapsed = !!collapsedGroups[group.title];
              const rows: React.ReactNode[] = [];

              // Group divider
              rows.push(
                <GroupDividerRow
                  key={`divider-${group.title}`}
                  group={group}
                  isCollapsed={isCollapsed}
                  onToggle={() => toggleGroup(group.title)}
                />
              );

              // Field rows (only if expanded)
              if (!isCollapsed) {
                group.fields.forEach((field) => {
                  globalRowIndex++;
                  const isEditing = editingField === field.id;
                  const isFormula = String(header?.[field.id] ?? '').startsWith('=');
                  const isReadonly = field.readonly;
                  const isSelect = field.type === 'select';
                  const isDate = field.type === 'date';

                  // Determine display value
                  // When NOT editing: always prefer the calculated result (even for editable fields with formulas)
                  let displayValue: string;
                  let editRawValue: string;
                  if (isReadonly && calculatedHeader?.[field.id] !== undefined) {
                    displayValue = String(calculatedHeader[field.id] ?? '');
                    editRawValue = displayValue;
                  } else if (isFormula && calculatedHeader?.[field.id] !== undefined) {
                    // Formula field with a computed result → show result, keep raw formula for editing
                    displayValue = String(calculatedHeader[field.id] ?? '');
                    editRawValue = String(header?.[field.id] ?? '');
                  } else {
                    displayValue = String(header?.[field.id] ?? '');
                    editRawValue = displayValue;
                  }

                  rows.push(
                    <TableRow
                      key={field.id}
                      className={cn(
                        'h-7 text-[11px] transition-colors group border-b border-border/15',
                        'hover:bg-primary/[0.03]',
                        globalRowIndex % 2 === 0 && 'bg-muted/[0.15]'
                      )}
                    >
                      {/* Row number */}
                      <TableCell className="w-[40px] px-1.5 py-0 text-center text-[10px] font-mono text-muted-foreground/40 tabular-nums border-r border-border/15">
                        {globalRowIndex}
                      </TableCell>

                      {/* Field label */}
                      <TableCell className="px-1.5 py-0 font-bold uppercase tracking-wider text-muted-foreground text-[10px] border-r border-border/15 min-w-[180px]">
                        {field.label}
                      </TableCell>

                      {/* Value */}
                      <TableCell className="px-1.5 py-0 border-r border-border/15 font-medium text-foreground text-[11px] min-w-[120px]">
                        {isReadonly ? (
                          <span className="text-muted-foreground tabular-nums">{displayValue}</span>
                        ) : isSelect ? (
                          <select
                            value={displayValue}
                            onChange={(e) => handleSelectChange(field.id, e.target.value)}
                            className="h-6 text-[11px] px-1.5 py-0 bg-transparent border border-transparent hover:border-border/30 focus:border-primary/40 focus:outline-none rounded transition-colors appearance-none cursor-pointer text-foreground font-medium"
                            aria-label={field.label}
                          >
                            <option value="">Seleccionar...</option>
                            {(field.options || []).map((opt) => (
                              <option key={opt} value={opt}>
                                {opt.charAt(0).toUpperCase() + opt.slice(1)}
                              </option>
                            ))}
                          </select>
                        ) : isDate ? (
                          <input
                            type="date"
                            value={displayValue || ''}
                            onChange={(e) => {
                              handleChange(field.id, e.target.value);
                              updateValue(['header', field.id], e.target.value);
                            }}
                            className="h-6 text-[11px] px-1.5 py-0 bg-transparent border border-transparent hover:border-border/30 focus:border-primary/40 focus:outline-none rounded transition-colors cursor-pointer text-foreground font-medium"
                            aria-label={field.label}
                          />
                        ) : isEditing ? (
                          <Input
                            autoFocus
                            className={cn(
                              'h-6 text-[11px] px-1.5 py-0 border-primary/40 bg-background',
                              isFormula && 'text-primary'
                            )}
                            value={editRawValue}
                            onChange={(e) => handleChange(field.id, e.target.value)}
                            onBlur={(e) => handleBlur(field.id, e.target.value, field.type)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleBlur(field.id, editRawValue, field.type);
                              if (e.key === 'Escape') setEditingField(null);
                            }}
                            aria-label={field.label}
                          />
                        ) : (
                          <div
                            role="button"
                            tabIndex={0}
                            className={cn(
                              'truncate cursor-text hover:text-primary transition-colors flex items-center gap-1',
                              isFormula && 'text-primary'
                            )}
                            onClick={() => !isReadonly && setEditingField(field.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                if (!isReadonly) setEditingField(field.id);
                              }
                            }}
                          >
                            {displayValue || (
                              <span className="text-muted-foreground/30 italic">—</span>
                            )}
                            {isFormula && (
                              <span className="shrink-0 text-[8px] font-black text-primary bg-primary/10 px-1.5 py-0 rounded uppercase tracking-wider animate-pulse">
                                FX
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Help column with description and example */}
                      <TableCell className="px-2 py-0 min-w-[220px] max-w-[320px]">
                        {(field.helpText || field.helpExample) ? (
                          <div className="space-y-0.5">
                            {field.helpText && (
                              <p className="text-[9px] text-muted-foreground/70 leading-tight">{field.helpText}</p>
                            )}
                            {field.helpExample && (
                              <p className="text-[8px] text-primary/50 italic leading-tight">
                                <span className="font-bold not-italic text-primary/70">Ej:</span> {field.helpExample}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/20 italic text-[9px]">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                });
              }

              return rows;
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default CostSheetHeaderEditor;
