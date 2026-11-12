'use client';

/**
 * FCTemplatePicker — Panel selector de plantillas de Ficha de Costo
 * DISPONIBLES para el usuario, con las tres procedencias (FC-SYS-TEMPLATES
 * 2026-11-13 — misión «Fichas de Costo: auditoría integral»):
 *
 *   - Privadas: guardadas por el usuario en el servidor (cost_sheet_templates,
 *     RLS owner — «Mis Plantillas Guardadas en COSTPRO»).
 *   - Públicas: compartidas y visibles según RLS (globales o de tiendas con acceso).
 *   - Sistema: catálogo incorporado por COSTPRO (13 plantillas oficiales).
 *
 * FC-USR-TEMPLATE (misión 2026-11-10): reemplaza el dead-end «Sin plantilla
 * configurada para esta tienda» del Inventario por un selector funcional.
 *
 * Es un PANEL (sin wrapper Dialog) pensado para emeberse dentro del cuerpo de
 * FCPreviewModal, tanto para la primera conexión (sin_fc) como para cambiar
 * la ficha de un producto con FC vigente.
 *
 * Comportamiento:
 *  - Lista las plantillas disponibles (privadas + públicas + sistema;
 *    la RLS del navegador filtra por cuenta — nunca plantillas ajenas).
 *  - Cada opción muestra su categoría de procedencia con etiqueta visible.
 *  - Búsqueda/filtrado por nombre, descripción y categoría.
 *  - Selección única + confirmación explícita (botón Conectar/Cambiar).
 *  - Modalidad opcional (adaptación de CONTEXTO — ver ayuda en línea; la
 *    plantilla original no se toca y NO altera cálculos ni estructura).
 *  - Marca la plantilla ya conectada al producto para evitar duplicados.
 *  - Estados de carga y error comprensibles; mobile-first (targets ≥44px).
 *
 * NO muestra IDs técnicos: identificación por nombre + categoría + fecha.
 */

import React, { useMemo, useState } from 'react';
import { Loader2, Search, FileText, AlertCircle, Check, Circle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useFCTemplateOptions, useGenerateFCFromTemplate } from '@/hooks/api/useProductCostSheet';
import type { CostSheetTemplateRecord } from '@/services/cost-sheet-template-service';
import { FC_MODALIDAD_LABELS, FC_MODALIDADES, type FCModalidad } from '@/contracts/store-cost-template';

// ============================================
// Props
// ============================================

export interface FCTemplatePickerProps {
  productId: string;
  productName: string;
  storeId: string;
  /** template_id de la FC activa del producto (para marcar «Actual») */
  currentTemplateId?: string | null;
  /** Modo: primera conexión vs cambio de ficha existente */
  mode: 'connect' | 'change';
  /** Se dispara cuando la asociación se guardó correctamente en el servidor */
  onConnected?: (result: {
    template_id: string;
    template_name?: string | null;
    cost_price?: number;
  }) => void;
  className?: string;
}

// ============================================
// Helpers de presentación
// ============================================

function formatFecha(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

function typeLabel(t: CostSheetTemplateRecord['type']): string {
  switch (t) {
    case 'private': return 'Privada';
    case 'public': return 'Pública';
    case 'system': return 'Sistema';
    default: return t;
  }
}

/** Colores de la etiqueta de procedencia — distinguibles por color Y texto. */
const TYPE_CHIP_CLASS: Record<CostSheetTemplateRecord['type'], string> = {
  private: 'bg-primary/10 text-primary',
  public: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  system: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
};

/** Descripción corta de cada procedencia (tooltip title). */
const TYPE_CHIP_TITLE: Record<CostSheetTemplateRecord['type'], string> = {
  private: 'Plantilla guardada por ti — solo visible para tu cuenta',
  public: 'Plantilla compartida — disponible según permisos',
  system: 'Plantilla incorporada por COSTPRO — catálogo oficial',
};

// ============================================
// Component
// ============================================

export function FCTemplatePicker({
  productId,
  productName,
  storeId,
  currentTemplateId,
  mode,
  onConnected,
  className,
}: FCTemplatePickerProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalidad, setModalidad] = useState<'' | FCModalidad>('');

  const { data: templates = [], isLoading, isError, refetch } = useFCTemplateOptions();
  const generateMutation = useGenerateFCFromTemplate();

  // Filtrado cliente (la lista ya viene filtrada por RLS en el servidor)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(t =>
      t.name?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      t.category?.toLowerCase().includes(q)
    );
  }, [templates, search]);

  const selected = useMemo(
    () => templates.find(t => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  const isCurrent = (t: CostSheetTemplateRecord) =>
    !!currentTemplateId && t.id === currentTemplateId;

  const handleConfirm = async () => {
    if (!selectedId) return;
    try {
      const result = await generateMutation.mutateAsync({
        product_id: productId,
        store_id: storeId,
        template_id: selectedId,
        ...(modalidad ? { modalidad } : {}),
      });
      // La asociación se guardó en el servidor (product_cost_sheets +
      // products.cost_sheet_id) — notificar al caller para refrescar la vista.
      if (result.data?.generated) {
        onConnected?.({
          template_id: selectedId,
          template_name: result.data.template_name ?? selected?.name ?? null,
          cost_price: result.data.cost_price,
        });
      }
    } catch {
      // El error se renderiza desde generateMutation.error
    }
  };

  const busy = generateMutation.isPending;

  return (
    <div className={cn('flex flex-col gap-3 min-h-0', className)} data-testid="fc-template-picker">
      {/* Aviso cuando se reemplazará una FC existente */}
      {mode === 'change' && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 flex items-start gap-2">
          <AlertCircle className="size-4 text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-foreground/90 font-medium">
            Al confirmar se <strong>reemplazará</strong> la Ficha de Costo actual de
            «{productName}». El costo unitario del producto se actualizará con el nuevo cálculo.
          </p>
        </div>
      )}

      {/* Búsqueda */}
      <div className="relative shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, categoría o descripción…"
          className="pl-10 h-11"
          aria-label="Buscar plantillas"
          disabled={isLoading || busy}
        />
      </div>

      {/* Lista de plantillas
          FC-E2E-PR1598: min-h-0 (antes min-h-[200px]) — la altura forzada rompía
          el shrink del flex en viewports ajustados (≤720px) y empujaba el botón
          de Confirmar fuera del contenedor, solapándolo con los botones de
          respaldo («Ir a Plantillas de Fichas»/«Ajustes de la tienda») — botón
          inaccesible. La lista ahora cede espacio y hace scroll propio;
          modalidad y confirmación quedan siempre visibles y clicables. */}
      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Cargando plantillas disponibles…</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <p className="text-sm font-semibold text-foreground">No se pudieron cargar las plantillas</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Verifica tu conexión e inténtalo de nuevo. Tus plantillas siguen guardadas en el servidor.
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Reintentar
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <FileText className="size-8 text-muted-foreground/50" />
            <p className="text-sm font-semibold text-foreground">
              {templates.length === 0 ? 'Sin plantillas disponibles' : 'Sin resultados'}
            </p>
            <p className="text-xs text-muted-foreground max-w-sm">
              {templates.length === 0
                ? 'No hay plantillas disponibles para tu cuenta en este momento.'
                : 'Ninguna plantilla coincide con la búsqueda. Prueba otros términos.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-2" role="listbox" aria-label="Plantillas disponibles">
            {filtered.map(t => {
              const selectedFlag = selectedId === t.id;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedFlag}
                    onClick={() => !isCurrent(t) && !busy && setSelectedId(t.id)}
                    disabled={isCurrent(t) || busy}
                    className={cn(
                      'w-full text-left rounded-xl border p-3 min-h-[64px] transition-colors flex items-start gap-3',
                      selectedFlag
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                        : 'border-border bg-card hover:border-primary/30 hover:bg-muted/30',
                      isCurrent(t) && 'opacity-70 cursor-default',
                    )}
                  >
                    <span className="shrink-0 mt-0.5" aria-hidden="true">
                      {selectedFlag ? (
                        <Check className="size-5 text-primary" />
                      ) : (
                        <Circle className="size-5 text-muted-foreground/40" />
                      )}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-foreground truncate">{t.name}</span>
                        <span
                          className={cn(
                            'text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded',
                            TYPE_CHIP_CLASS[t.type] ?? 'bg-muted text-muted-foreground',
                          )}
                          title={TYPE_CHIP_TITLE[t.type] ?? undefined}
                        >
                          {typeLabel(t.type)}
                        </span>
                        {isCurrent(t) && (
                          <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            Actual
                          </span>
                        )}
                      </span>
                      {t.description && (
                        <span className="block text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</span>
                      )}
                      <span className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground/80 flex-wrap">
                        {t.category && <span className="font-bold uppercase tracking-wide">{t.category}</span>}
                        {t.updated_at && <span>· Act. {formatFecha(t.updated_at)}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Modalidad (opcional — adaptación por contexto, no modifica la plantilla)
          FC-MODALIDAD-HELP (misión 2026-11-13): la «Modalidad» clasifica la
          ficha según la Res. 148/2023 (A: Producción, B: Servicios, C:
          Comercialización). Se registra en el ENCABEZADO de la ficha resultante
          (product_cost_sheets.modalidad) para trazabilidad — NO altera los
          cálculos, la estructura ni los componentes de la ficha. Vacía = se usa
          la modalidad definida en la plantilla (o Producción por defecto). */}
      {filtered.length > 0 && (
        <div className="shrink-0 pt-1">
          <label htmlFor={`fc-picker-modalidad-${productId}`} className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">
            Modalidad (opcional)
          </label>
          <select
            id={`fc-picker-modalidad-${productId}`}
            value={modalidad}
            onChange={(e) => setModalidad(e.target.value as typeof modalidad)}
            disabled={busy}
            className="h-11 w-full bg-muted/20 border border-primary/10 focus:border-primary/30 transition-all font-bold rounded-lg px-3 text-sm"
          >
            <option value="">Automática (según la plantilla)</option>
            {FC_MODALIDADES.map(m => (
              <option key={m} value={m}>{FC_MODALIDAD_LABELS[m]}</option>
            ))}
          </select>
          <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground" data-testid="fc-modalidad-help">
            <Info className="size-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Clasifica la ficha según la Res. 148/2023 (destino de producción).
              Se registra en el encabezado del documento para trazabilidad —
              <strong className="font-bold"> no cambia los cálculos ni la estructura</strong>.
              Si la dejas sin seleccionar, se usa la modalidad de la plantilla.
            </span>
          </p>
        </div>
      )}

      {/* Error de generación */}
      {generateMutation.error && (
        <div className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 flex items-start gap-2" role="alert">
          <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive font-medium break-words">
            {generateMutation.error.message || 'No se pudo conectar la Ficha de Costo. Inténtalo de nuevo.'}
          </p>
        </div>
      )}

      {/* Acción */}
      <div className="shrink-0 flex justify-end gap-2 pt-1">
        <Button
          onClick={handleConfirm}
          disabled={!selectedId || busy}
          className="min-h-[44px]"
          aria-label="Confirmar conexión de la Ficha de Costo"
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Guardando asociación…
            </>
          ) : (
            <>
              <Check className="size-4" />
              {mode === 'change' ? 'Cambiar Ficha' : 'Conectar Ficha'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default FCTemplatePicker;
