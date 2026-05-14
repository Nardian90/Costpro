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
  type?: 'text' | 'number' | 'select';
  readonly?: boolean;
  options?: string[];
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
      { id: 'resolution', label: 'Resolución', type: 'select', options: ['Res 148/2023', 'Otra'] },
      { id: 'code', label: 'Código' },
      { id: 'name', label: 'Nombre Comercial' },
    ],
  },
  {
    title: 'Parámetros de Operación',
    colorIdx: 1,
    fields: [
      { id: 'unit', label: 'Unidad de Medida' },
      { id: 'quantity', label: 'Cantidad Base', type: 'number' },
      { id: 'production_level', label: 'Nivel de Producción', type: 'number' },
      { id: 'currency', label: 'Moneda' },
      { id: 'capacity_utilization', label: '% Capacidad Instalada', readonly: true },
    ],
  },
  {
    title: 'Entorno Organizativo',
    colorIdx: 2,
    fields: [
      { id: 'company', label: 'Empresa' },
      { id: 'organism', label: 'Organismo' },
      { id: 'union', label: 'Unión' },
      { id: 'destination', label: 'Destino de Producción', type: 'select', options: ['producción', 'servicios'] },
    ],
  },
  {
    title: 'Comercialización',
    colorIdx: 3,
    fields: [
      { id: 'client', label: 'Cliente Principal' },
      { id: 'category', label: 'Categoría de Producto' },
      { id: 'type', label: 'Tipo de Costo' },
      { id: 'sale_price', label: 'Precio de Venta Sugerido' },
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
      <TableCell colSpan={3} className="px-3 py-1">
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
              <TableHead className="px-2 py-0 text-left text-[8px] font-black tracking-widest text-muted-foreground/50">
                VALOR
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
                      <TableCell className="px-1.5 py-0 font-medium text-foreground text-[11px]">
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
