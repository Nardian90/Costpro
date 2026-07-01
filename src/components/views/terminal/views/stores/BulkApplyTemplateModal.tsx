'use client';

import React, { useState } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { Store } from '@/types';
import { useStoreEdit } from '@/hooks/views/useStoreEdit';
import { Loader2, FileText, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

/**
 * F4-T03: Modal para aplicar una plantilla FC a múltiples tiendas seleccionadas.
 *
 * Se abre desde la barra de bulk actions cuando hay ≥1 tienda seleccionada.
 * El admin elige modalidad + formato PDF + template_id, y al confirmar
 * se aplica a todas las tiendas seleccionadas usando el hook useStoreEdit
 * (que a su vez dispara F3-T05: invalidación automática de FCs existentes).
 *
 * Combina con F3-T05: tras aplicar la plantilla, las FCs existentes de cada
 * tienda se marcan como pendientes de regeneración automáticamente.
 */

interface BulkApplyTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedStores: Store[];
}

export function BulkApplyTemplateModal({
  isOpen,
  onClose,
  selectedStores,
}: BulkApplyTemplateModalProps) {
  const t = useTranslations('stores');
  const storeEdit = useStoreEdit();
  const [modalidad, setModalidad] = useState<'produccion' | 'servicios' | 'comercializacion'>('produccion');
  const [pdfFormat, setPdfFormat] = useState<'res148' | 'res190'>('res148');
  const [templateId, setTemplateId] = useState('costpro-reinicio');
  const [applying, setApplying] = useState(false);

  const handleApply = async () => {
    if (selectedStores.length === 0) return;
    setApplying(true);
    let succeeded = 0;
    let failed = 0;

    // Aplicar a cada tienda en secuencia (no paralelo para no saturar Supabase).
    // useStoreEdit.saveFCTemplate dispara F3-T05 (invalidación automática de FCs).
    for (const store of selectedStores) {
      const ok = await storeEdit.saveFCTemplate(store.id, {
        template_id: templateId,
        modalidad,
        pdf_format: pdfFormat,
        is_active: true,
      });
      if (ok) succeeded++;
      else failed++;
    }

    setApplying(false);
    if (succeeded > 0) {
      toast.success(
        `Plantilla FC aplicada a ${succeeded} tienda${succeeded === 1 ? '' : 's'}`,
        {
          description: failed > 0
            ? `${failed} tienda(s) no pudieron procesarse. Las FCs existentes se marcaron como pendientes.`
            : 'Las FCs existentes se marcaron como pendientes de regeneración.',
          duration: 8000,
        }
      );
    }
    if (succeeded === 0 && failed > 0) {
      toast.error('No se pudo aplicar la plantilla a ninguna tienda');
    }
    storeEdit.invalidateStoreQueries();
    onClose();
  };

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => !open && !applying && onClose()}
      aria-label={`Aplicar plantilla FC a ${selectedStores.length} tiendas`}
      title={
        <span className="text-[clamp(1.25rem,4vw,1.5rem)] font-black uppercase tracking-tighter text-primary flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Aplicar Plantilla FC
        </span>
      }
      description={
        <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground/70">
          {selectedStores.length} tienda{selectedStores.length === 1 ? '' : 's'} seleccionada{selectedStores.length === 1 ? '' : 's'}
        </span>
      }
      footer={
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={applying}
            className="flex-1 sm:flex-none h-11"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            disabled={applying || selectedStores.length === 0}
            className="flex-1 sm:flex-none h-11 font-bold uppercase tracking-widest text-sm"
          >
            {applying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Aplicando...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-2" />
                Aplicar a {selectedStores.length} tienda{selectedStores.length === 1 ? '' : 's'}
              </>
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-4">
        {/* Advertencia sobre invalidación de FCs */}
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
            Al aplicar esta plantilla, las fichas de costo existentes de las tiendas
            seleccionadas se marcarán como <strong>pendientes de regeneración</strong>.
            Deberás regenerarlas desde el tablero de costos.
          </p>
        </div>

        {/* Lista de tiendas afectadas */}
        <div className="max-h-32 overflow-y-auto rounded-xl border border-border divide-y divide-border">
          {selectedStores.map(store => (
            <div key={store.id} className="flex items-center gap-2 p-2 text-sm">
              <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="font-bold truncate">{store.name}</span>
              {store.cost_template?.is_active && (
                <span className="text-sm font-black uppercase px-1.5 py-0.5 rounded bg-success/10 text-success">
                  FC actual
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Configuración de la plantilla */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-black uppercase tracking-widest text-muted-foreground">
              Template ID
            </label>
            <input
              type="text"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              maxLength={100}
              className="w-full px-3 py-2 h-11 rounded-lg border border-border bg-background text-sm font-mono outline-none focus:ring-1 focus:ring-primary"
              placeholder="costpro-reinicio"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-black uppercase tracking-widest text-muted-foreground">
              {t('modalidadLabel')}
            </label>
            <select
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value as typeof modalidad)}
              className="w-full px-3 py-2 h-11 rounded-lg border border-border bg-background text-sm font-bold outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="produccion">{t('modalidadProduccion')}</option>
              <option value="servicios">{t('modalidadServicios')}</option>
              <option value="comercializacion">{t('modalidadComercializacion')}</option>
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-black uppercase tracking-widest text-muted-foreground">
              {t('formatoPdfLabel')}
            </label>
            <select
              value={pdfFormat}
              onChange={(e) => setPdfFormat(e.target.value as typeof pdfFormat)}
              className="w-full px-3 py-2 h-11 rounded-lg border border-border bg-background text-sm font-bold outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="res148">Res. 148/2023</option>
              <option value="res190">Res. 190/2021</option>
            </select>
          </div>
        </div>
      </div>
    </BaseModal>
  );
}
