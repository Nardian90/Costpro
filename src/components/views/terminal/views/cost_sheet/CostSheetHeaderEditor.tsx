'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { CostSheetHeader } from '@/types/cost-sheet';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { cn } from '@/lib/utils';
import { ChevronRight, RefreshCw, Loader2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

import { useTranslations } from 'next-intl';
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
  /** P2: Marca el campo como obligatorio — muestra * visual + aria-required + validación inline */
  required?: boolean;
  /** P2: Función de validación inline — retorna mensaje de error o null si es válido */
  validate?: (value: string) => string | null;
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
      {
        id: 'resolution', label: 'Resolución', type: 'select', options: ['Res 148/2023', 'Otra'],
        helpText: 'Normativa que regula la ficha de costos', helpExample: 'Res 148/2023',
        required: true,
        validate: (v) => !v ? 'La resolución es obligatoria' : null,
      },
      {
        id: 'code', label: 'Código',
        helpText: 'Código único del producto o servicio en el sistema de la empresa', helpExample: 'MP-001, SVC-045',
        required: true,
        validate: (v) => !v?.trim() ? 'El código es obligatorio' : null,
      },
      {
        id: 'name', label: 'Nombre Comercial',
        helpText: 'Denominación oficial del producto o servicio que se está costeando', helpExample: 'Hamburguesa Doble Queso, Servicio de Mantenimiento Industrial',
        required: true,
        validate: (v) => !v?.trim() ? 'El nombre es obligatorio' : null,
      },
    ],
  },
  {
    title: 'Parámetros de Operación',
    colorIdx: 1,
    fields: [
      {
        id: 'unit', label: 'Unidad de Medida',
        helpText: 'Unidad en que se expresa la producción (unidad, kg, litro, etc.)', helpExample: 'u, kg, L, m2, m3, pza, docena',
        required: true,
        validate: (v) => !v?.trim() ? 'La unidad es obligatoria' : null,
      },
      {
        id: 'quantity', label: 'Cantidad Base', type: 'number',
        helpText: 'Cantidad de referencia para el cálculo del costo unitario', helpExample: '1, 100, 1000',
        required: true,
        validate: (v) => {
          if (!v || v === '') return 'La cantidad es obligatoria';
          const n = Number(v);
          if (isNaN(n) || n <= 0) return 'Debe ser un número mayor a 0';
          return null;
        },
      },
      { id: 'production_level', label: 'Nivel de Producción', helpText: 'Volumen de producción mensual o anual utilizado como base de prorrateo', helpExample: '500, 10000' },
      { id: 'capacity_utilization', label: '% Capacidad Instalada', readonly: true, helpText: 'Porcentaje de capacidad utilizada (calculado automáticamente: cantidad/nivel de producción)', helpExample: '85%' },
    ],
  },
  {
    title: 'Financiera',
    colorIdx: 5,
    fields: [
      { id: 'currency', label: 'Moneda', type: 'select', options: ['CUP', 'USD', 'EUR', 'MLC'], helpText: 'Moneda en que se expresan los costos', helpExample: 'CUP, USD, EUR, MLC' },
      {
        id: 'exchangeRate', label: 'Tasa de Cambio', type: 'number',
        helpText: 'Tasa para convertir la ficha a otra moneda. 1 USD = N CUP. Dejar vacio para desactivar conversion', helpExample: '540',
        validate: (v) => {
          if (!v) return null;  // Opcional
          const n = Number(v);
          if (isNaN(n) || n <= 0) return 'La tasa debe ser un número mayor a 0';
          return null;
        },
      },
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

const BG_COLORS = ['bg-primary/5', 'bg-violet-500/5', 'bg-warning/5', 'bg-success/5', 'bg-rose-500/5', 'bg-cyan-500/5'];
const BORDER_COLORS = ['border-l-primary/40', 'border-l-violet-500/40', 'border-l-warning/40', 'border-l-success/40', 'border-l-rose-500/40', 'border-l-cyan-500/40'];

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
          <span className="text-xs font-black uppercase tracking-[0.15em] text-foreground">
            {group.title}
          </span>
          <span className="text-xs text-muted-foreground/70 font-mono ml-2">
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
  // P2: Estado de errores de validación inline por fieldId.
  // Solo se muestra el error después del blur, no mientras el usuario escribe.
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  // P2: Track de campos "touched" — solo validamos después del primer blur.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  // F4.1: Auto-fetch exchange rate from exchange_rates table
  const [fetchingRate, setFetchingRate] = useState(false);

  const fetchLatestRate = useCallback(async () => {
    setFetchingRate(true);
    try {
      const res = await fetch('/api/exchange-rates?currency=USD&source=BCC&segment=3&days=1');
      if (!res.ok) {
        // FIX-TASA-ERROR (2026-07-04): manejar 401 (sesión expirada) y otros
        // errores HTTP con mensajes claros en vez del genérico "API error".
        if (res.status === 401) {
          throw new Error('Sesión expirada. Recarga la página para volver a iniciar sesión.');
        }
        if (res.status === 500) {
          throw new Error('Error del servidor al consultar tasas.');
        }
        throw new Error(`Error HTTP ${res.status}`);
      }
      const data = await res.json();
      // FIX-F03: la API devuelve { rates: [...] } no un array directo.
      if (data?.rates && data.rates.length > 0) {
        const latest = data.rates[0];
        updateValue(['header', 'exchangeRate'], latest.rate);
        updateValue(['header', 'rateSource'], `BCC MIPYMES (seg 3)`);
        updateValue(['header', 'rateDate'], latest.rate_date);
        updateValue(['header', 'rateType'], 'Cierre');
        toast.success(`Tasa actualizada: ${latest.rate} CUP/USD (${latest.rate_date})`);
      } else {
        toast.warning('No hay tasas disponibles. Ejecute "Actualizar BD" en Inteligencia Cambiaria.');
      }
    } catch (e: any) {
      // No mostrar toast si es error de red (fetch falló) — puede ser ruido
      if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
        console.warn('[fetchLatestRate] Error de red:', e.message);
      } else {
        toast.error('Error al obtener tasa: ' + e.message);
      }
    } finally {
      setFetchingRate(false);
    }
  }, [updateValue]);

  // Auto-fetch on mount if exchangeRate is empty
  useEffect(() => {
    if (!header.exchangeRate && !fetchingRate) {
      fetchLatestRate();
    }
  }, []);

  const toggleGroup = (groupTitle: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupTitle]: !prev[groupTitle] }));
  };

  const handleChange = (fieldId: string, value: string) => {
    updateValue(['header', fieldId], value);
  };

  const handleBlur = (fieldId: string, value: string, type?: string, validate?: (v: string) => string | null) => {
    setEditingField(null);
    // P2: Marcar como touched y validar
    setTouched(prev => ({ ...prev, [fieldId]: true }));
    if (validate) {
      const error = validate(value);
      setErrors(prev => ({ ...prev, [fieldId]: error }));
    }
    // Convert number fields
    if (type === 'number' && value !== '') {
      const num = Number(value);
      if (!isNaN(num)) {
        updateValue(['header', fieldId], num);
      }
    }
  };

  const handleSelectChange = (fieldId: string, value: string, validate?: (v: string) => string | null) => {
    updateValue(['header', fieldId], value);
    // P2: Validar selects inmediatamente al cambiar
    setTouched(prev => ({ ...prev, [fieldId]: true }));
    if (validate) {
      const error = validate(value);
      setErrors(prev => ({ ...prev, [fieldId]: error }));
    }
  };

  let globalRowIndex = 0;

  return (
    <div className="border border-border/60 rounded-xl overflow-hidden shadow-sm bg-card">
      <div className="overflow-x-auto">
        <Table className="w-full" style={{ borderSpacing: 0 }}>
          {/* Column Header */}
          <TableHeader className="sticky top-0 z-20">
            <TableRow className="bg-muted/80 hover:bg-transparent border-b border-border/40 h-9">
              <TableHead className="w-[40px] px-1.5 py-0 text-center text-xs font-black tracking-widest text-muted-foreground/70 border-r border-border/20">
                #
              </TableHead>
              <TableHead className="px-2 py-0 text-left text-xs font-black tracking-widest text-muted-foreground/70 border-r border-border/20">
                CAMPO
              </TableHead>
              <TableHead className="px-2 py-0 text-left text-xs font-black tracking-widest text-muted-foreground/70 border-r border-border/20">
                VALOR
              </TableHead>
              <TableHead className="px-2 py-0 text-left text-xs font-black tracking-widest text-muted-foreground/70">
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
                        'h-9 text-xs transition-colors group border-b border-border/15',
                        'hover:bg-primary/[0.03]',
                        globalRowIndex % 2 === 0 && 'bg-muted/[0.15]'
                      )}
                    >
                      {/* Row number */}
                      <TableCell className="w-[40px] px-1.5 py-0 text-center text-xs font-mono text-muted-foreground/70 tabular-nums border-r border-border/15">
                        {globalRowIndex}
                      </TableCell>

                      {/* Field label — P2: muestra * rojo si required */}
                      <TableCell className="px-1.5 py-0 font-bold uppercase tracking-wider text-muted-foreground text-xs border-r border-border/15 min-w-[180px]">
                        {field.label}
                        {field.required && (
                          <span className="text-destructive ml-0.5 font-black" aria-hidden="true">*</span>
                        )}
                      </TableCell>

                      {/* Value */}
                      <TableCell className="px-1.5 py-0 border-r border-border/15 font-medium text-foreground text-xs min-w-[120px]">
                        {isReadonly ? (
                          <span className="text-muted-foreground tabular-nums">{displayValue}</span>
                        ) : isSelect ? (
                          <div className="space-y-0.5">
                            <select
                              value={displayValue}
                              onChange={(e) => handleSelectChange(field.id, e.target.value, field.validate)}
                              className={cn(
                                "h-9 text-xs px-1.5 py-0 bg-transparent border focus:outline-none rounded transition-colors appearance-none cursor-pointer text-foreground font-medium",
                                touched[field.id] && errors[field.id]
                                  ? "border-destructive/60 focus:border-destructive"
                                  : "border-transparent hover:border-border/30 focus:border-primary/40"
                              )}
                              aria-label={field.label}
                              aria-required={field.required || undefined}
                              aria-invalid={touched[field.id] && !!errors[field.id] || undefined}
                            >
                              <option value="">Seleccionar...</option>
                              {(field.options || []).map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                                </option>
                              ))}
                            </select>
                            {/* P2: Error inline bajo el campo */}
                            {touched[field.id] && errors[field.id] && (
                              <p role="alert" className="text-destructive text-xs font-bold flex items-center gap-1">
                                <span aria-hidden="true">⚠</span> {errors[field.id]}
                              </p>
                            )}
                          </div>
                        ) : isDate ? (
                          <input
                            type="date"
                            value={displayValue || ''}
                            onChange={(e) => {
                              handleChange(field.id, e.target.value);
                              updateValue(['header', field.id], e.target.value);
                            }}
                            className="h-9 text-xs px-1.5 py-0 bg-transparent border border-transparent hover:border-border/30 focus:border-primary/40 focus:outline-none rounded transition-colors cursor-pointer text-foreground font-medium"
                            aria-label={field.label}
                            aria-required={field.required || undefined}
                          />
                        ) : isEditing ? (
                          <div className="space-y-0.5">
                            <Input
                              autoFocus
                              className={cn(
                                'h-9 text-xs px-1.5 py-0 bg-background',
                                isFormula && 'text-primary',
                                touched[field.id] && errors[field.id]
                                  ? 'border-destructive/60 focus-visible:ring-destructive/30'
                                  : 'border-primary/40'
                              )}
                              value={editRawValue}
                              onChange={(e) => handleChange(field.id, e.target.value)}
                              onBlur={(e) => handleBlur(field.id, e.target.value, field.type, field.validate)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleBlur(field.id, editRawValue, field.type, field.validate);
                                if (e.key === 'Escape') setEditingField(null);
                              }}
                              aria-label={field.label}
                              aria-required={field.required || undefined}
                              aria-invalid={touched[field.id] && !!errors[field.id] || undefined}
                            />
                            {/* P2: Error inline bajo el campo */}
                            {touched[field.id] && errors[field.id] && (
                              <p role="alert" className="text-destructive text-xs font-bold flex items-center gap-1">
                                <span aria-hidden="true">⚠</span> {errors[field.id]}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div
                            role="button"
                            tabIndex={0}
                            className={cn(
                              'truncate cursor-text hover:text-primary transition-colors flex items-center gap-1',
                              isFormula && 'text-primary',
                              // P2: Resaltar campos requeridos vacíos con borde sutil
                              field.required && !displayValue && 'border border-dashed border-warning/40 rounded px-1'
                            )}
                            onClick={() => !isReadonly && setEditingField(field.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                if (!isReadonly) setEditingField(field.id);
                              }
                            }}
                            aria-label={field.label + (field.required ? ' (obligatorio)' : '')}
                          >
                            {displayValue || (
                              <span className="text-muted-foreground/70 italic">—</span>
                            )}
                            {isFormula && (
                              <span className="shrink-0 text-xs font-black text-primary bg-primary/10 px-1.5 py-0 rounded uppercase tracking-wider animate-pulse">
                                FX
                              </span>
                            )}
                            {/* F4.1: Auto-fetch rate button */}
                            {field.id === 'exchangeRate' && !isEditing && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); fetchLatestRate(); }}
                                disabled={fetchingRate}
                                className="shrink-0 ml-1 p-1 rounded hover:bg-primary/10 text-primary transition-colors"
                                title="Obtener tasa actual del BCC"
                                aria-label="Obtener tasa actual"
                              >
                                {fetchingRate ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Help column with description and example */}
                      <TableCell className="px-2 py-0 min-w-[220px] max-w-[320px]">
                        {(field.helpText || field.helpExample) ? (
                          <div className="space-y-0.5">
                            {field.helpText && (
                              <p className="text-xs text-muted-foreground/70 leading-tight">{field.helpText}</p>
                            )}
                            {field.helpExample && (
                              <p className="text-xs text-primary/70 italic leading-tight">
                                <span className="font-bold not-italic text-primary/70">Ej:</span> {field.helpExample}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/70 italic text-xs">—</span>
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
