'use client';

/**
 * CP-PLANTILLAS-FASE2 — Diálogo «GUARDAR COMO PLANTILLA».
 * ============================================================================
 * Orden FASE 2 §4: acción claramente identificada en el editor de fichas de
 * costo que diferencia tres procesos:
 *
 *   GUARDAR FICHA        → persiste una ficha en cost_sheets (biblioteca).
 *   GUARDAR COMO PLANTILLA (este diálogo) → guarda un MODELO reutilizable
 *                                          en el Explorador de Plantillas.
 *   EXPORTAR JSON        → descarga un archivo local.
 *
 * Destinos:
 *   · PRIVADA (predeterminado) — Mi cuenta en COSTPRO (cost_sheet_templates,
 *     type='private', created_by=auth.uid(), store_id=NULL). Persiste en el
 *     servidor: disponible desde cualquier dispositivo al volver a iniciar
 *     sesión, sin depender de localStorage ni carpetas locales.
 *   · PÚBLICA — solo admin/superadmin; compartida con otras tiendas
 *     autorizadas (todas o una concreta).
 *
 * Si la ficha activa proviene de una plantilla privada propia previamente
 * cargada, ofrece «Actualizar plantilla existente» (con confirmación previa,
 * nunca sobrescribe en silencio) o «Guardar como nueva plantilla».
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  LayoutTemplate,
  Lock as LockIcon,
  Globe,
  Store as StoreIcon,
  RefreshCw,
  Info,
  CloudUpload,
  Cloud,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { isAdminLevel } from '@/lib/roles';
import { Store } from '@/types';
import { storeApiClient } from '@/services/store-api-client';
import {
  createPrivateTemplate,
  createPublicTemplate,
  getTemplate,
  updatePrivateTemplate,
  TemplateServiceError,
} from '@/services/cost-sheet-template-service';
import { ConfirmDialog } from './ConfirmDialog';

export interface SaveAsTemplateResult {
  action: 'created' | 'updated';
  destination: 'private' | 'public';
}

interface CostSheetSaveAsTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Destino preseleccionado. Por defecto PRIVADA (orden §4). */
  defaultDestination?: 'private' | 'public';
  /** Notifica al contenedor (p. ej. refrescar el Explorador). */
  onSaved?: (result: SaveAsTemplateResult) => void;
}

type SaveMode = 'new' | 'update-existing';

export const CostSheetSaveAsTemplateDialog: React.FC<CostSheetSaveAsTemplateDialogProps> = ({
  open,
  onOpenChange,
  defaultDestination = 'private',
  onSaved,
}) => {
  const { data: currentSheetData } = useCostSheetStore();
  const activeTemplateId = useCostSheetStore((s) => s.activeTemplateId);
  const setActiveTemplateId = useCostSheetStore((s) => s.setActiveTemplateId);
  const user = useAuthStore((state) => state.user);
  const isAdmin = isAdminLevel(user?.role);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [destination, setDestination] = useState<'private' | 'public'>(defaultDestination);
  const [storeId, setStoreId] = useState<string>('all');
  const [stores, setStores] = useState<Store[]>([]);
  const [saveMode, setSaveMode] = useState<SaveMode>('new');
  const [linkedTemplateName, setLinkedTemplateName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingTemplate, setIsCheckingTemplate] = useState(false);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const isSubmittingRef = useRef(false);
  // Ref al handleSave vigente: evita que el botón «Reintentar» del toast
  // capture un closure obsoleto (useCallback([]) congelaría el primer render).
  const handleSaveRef = useRef<() => void>(() => {});

  // Prefill al abrir + resolución de plantilla vinculada.
  useEffect(() => {
    if (!open) return;
    const sheetName = currentSheetData?.header?.name || currentSheetData?.name || '';
    setName(sheetName);
    setDescription('');
    setDestination(defaultDestination);
    setStoreId('all');
    setConfirmUpdate(false);
    setSaveMode('new');
    setLinkedTemplateName(null);

    // ¿La ficha activa proviene de una plantilla privada propia?
    if (activeTemplateId) {
      setIsCheckingTemplate(true);
      getTemplate(activeTemplateId)
        .then((tpl) => {
          if (tpl && tpl.type === 'private' && user && tpl.created_by === user.id) {
            setLinkedTemplateName(tpl.name);
            setSaveMode('update-existing');
          }
        })
        .catch(() => {
          // Plantilla vinculada inaccesible (eliminada / sin permiso) → solo «nueva».
        })
        .finally(() => setIsCheckingTemplate(false));
    }
  }, [open, defaultDestination, activeTemplateId]);

  // Tiendas para el destino público (solo admins, mismo cliente que el Explorador).
  useEffect(() => {
    if (!open || !isAdmin) return;
    storeApiClient
      .fetchStores()
      .then(setStores)
      .catch(() => {
        /* el select simplemente mostrará solo «Todas las tiendas» */
      });
  }, [open, isAdmin]);

  const canSubmit = useMemo(
    () => name.trim().length > 0 && !isSubmitting && !isCheckingTemplate,
    [name, isSubmitting, isCheckingTemplate],
  );

  const reportError = useCallback((error: unknown, fallback: string) => {
    if (error instanceof TemplateServiceError) {
      toast.error(error.message, {
        description:
          error.kind === 'permission'
            ? 'Tu cuenta no tiene permisos para esta operación.'
            : 'Verifica tu conexión e inténtalo de nuevo.',
        action: { label: 'Reintentar', onClick: () => handleSaveRef.current() },
      });
    } else {
      toast.error(fallback, {
        description: 'Verifica tu conexión e inténtalo de nuevo.',
        action: { label: 'Reintentar', onClick: () => handleSaveRef.current() },
      });
    }
  }, []);

  const doSavePrivateNew = useCallback(async () => {
    try {
      const created = await createPrivateTemplate({
        name,
        description,
        data: currentSheetData!,
      });
      setActiveTemplateId(created.id);
      toast.success('Plantilla guardada correctamente en Mis plantillas privadas de COSTPRO');
      onSaved?.({ action: 'created', destination: 'private' });
      onOpenChange(false);
    } catch (error) {
      reportError(error, 'No se pudo guardar la plantilla privada');
    }
  }, [name, description, currentSheetData, setActiveTemplateId, onSaved, onOpenChange, reportError]);

  const doUpdateExisting = useCallback(async () => {
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await updatePrivateTemplate(activeTemplateId!, {
        name: name.trim(),
        description,
        data: currentSheetData!,
      });
      toast.success(`Plantilla "${name.trim()}" actualizada correctamente`);
      onSaved?.({ action: 'updated', destination: 'private' });
      onOpenChange(false);
    } catch (error) {
      reportError(error, 'No se pudo actualizar la plantilla');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setConfirmUpdate(false);
    }
  }, [activeTemplateId, name, description, currentSheetData, onSaved, onOpenChange, reportError]);

  const doSavePublic = useCallback(async () => {
    try {
      await createPublicTemplate({
        name,
        description,
        data: currentSheetData!,
        storeId: storeId === 'all' ? null : storeId,
      });
      toast.success(
        storeId === 'all'
          ? 'Plantilla publicada con éxito (visible para todas las tiendas)'
          : 'Plantilla publicada con éxito (visible para la tienda seleccionada)',
      );
      onSaved?.({ action: 'created', destination: 'public' });
      onOpenChange(false);
    } catch (error) {
      reportError(error, 'No se pudo publicar la plantilla');
    }
  }, [name, description, storeId, currentSheetData, onSaved, onOpenChange, reportError]);

  const handleSave = useCallback(() => {
    if (isSubmittingRef.current) return; // anti doble-click (orden §7D)
    if (!currentSheetData) {
      toast.error('No hay ninguna ficha activa para guardar como plantilla.');
      return;
    }
    if (!name.trim()) {
      toast.error('El nombre de la plantilla es obligatorio.');
      return;
    }

    if (destination === 'private' && saveMode === 'update-existing') {
      // Confirmación explícita antes de sobrescribir (orden §4).
      setConfirmUpdate(true);
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    const run = destination === 'public' ? doSavePublic : doSavePrivateNew;
    run().finally(() => {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    });
  }, [destination, saveMode, name, currentSheetData, doSavePublic, doSavePrivateNew]);

  // Mantener el ref apuntando al handleSave vigente (para «Reintentar»). 
  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[520px] rounded-[2rem] border-primary/10 bg-sidebar/95 backdrop-blur-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter italic text-primary flex items-center gap-3">
              <LayoutTemplate className="w-6 h-6" />
              Guardar como Plantilla
            </DialogTitle>
            <DialogDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Guarda la ficha actual como un modelo reutilizable en el Explorador de Plantillas
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-4">
            {/* Nombre */}
            <div className="space-y-3">
              <label htmlFor="tpl-name" className="text-xs font-black uppercase tracking-widest text-primary ml-1">
                Nombre de la Plantilla
              </label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Ficha Base de Carpintería"
                className="h-12 rounded-2xl bg-primary/5 border-primary/10 font-bold text-xs uppercase tracking-widest"
              />
            </div>

            {/* Descripción */}
            <div className="space-y-3">
              <label htmlFor="tpl-description" className="text-xs font-black uppercase tracking-widest text-primary ml-1">
                Descripción (Opcional)
              </label>
              <Textarea
                id="tpl-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe para qué sirve este modelo..."
                className="min-h-[80px] rounded-2xl bg-primary/5 border-primary/10 font-bold text-xs uppercase tracking-widest resize-none"
              />
            </div>

            {/* Actualizar existente vs nueva (solo destino privado con plantilla vinculada) */}
            {destination === 'private' && linkedTemplateName && (
              <div className="space-y-3 rounded-2xl border border-primary/10 bg-primary/5 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-primary">
                  Esta ficha proviene de una plantilla tuya
                </p>
                <div className="grid gap-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="save-mode"
                      checked={saveMode === 'update-existing'}
                      onChange={() => setSaveMode('update-existing')}
                      className="mt-1 accent-primary"
                    />
                    <span className="text-xs font-bold">
                      Actualizar plantilla existente: «{linkedTemplateName}»
                      <span className="block text-muted-foreground font-medium normal-case tracking-normal">
                        Sobrescribe el contenido de la plantilla con la ficha actual (se pedirá confirmación).
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="save-mode"
                      checked={saveMode === 'new'}
                      onChange={() => setSaveMode('new')}
                      className="mt-1 accent-primary"
                    />
                    <span className="text-xs font-bold">
                      Guardar como una nueva plantilla
                      <span className="block text-muted-foreground font-medium normal-case tracking-normal">
                        La plantilla original queda intacta.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* Destino de almacenamiento */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-widest text-primary ml-1">
                  Destino de Almacenamiento
                </span>
                <Info className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
              </div>

              <label
                className={`flex items-start gap-3 rounded-2xl border p-4 cursor-pointer transition-colors ${
                  destination === 'private'
                    ? 'border-primary/40 bg-primary/10'
                    : 'border-sidebar-border/50 hover:border-primary/20'
                }`}
              >
                <input
                  type="radio"
                  name="tpl-destination"
                  checked={destination === 'private'}
                  onChange={() => setDestination('private')}
                  className="mt-1 accent-primary"
                />
                <span className="flex-1">
                  <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest">
                    <LockIcon className="w-4 h-4 text-primary" aria-hidden="true" />
                    Privada — Mi cuenta en COSTPRO
                  </span>
                  <span className="block mt-1 text-muted-foreground text-xs font-medium normal-case tracking-normal">
                    Se guarda en el servidor, asociada a tu usuario. Solo tú podrás verla y
                    utilizarla, desde cualquier dispositivo.
                  </span>
                </span>
              </label>

              {isAdmin && (
                <label
                  className={`flex items-start gap-3 rounded-2xl border p-4 cursor-pointer transition-colors ${
                    destination === 'public'
                      ? 'border-primary/40 bg-primary/10'
                      : 'border-sidebar-border/50 hover:border-primary/20'
                  }`}
                >
                  <input
                    type="radio"
                    name="tpl-destination"
                    checked={destination === 'public'}
                    onChange={() => setDestination('public')}
                    className="mt-1 accent-primary"
                  />
                  <span className="flex-1">
                    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest">
                      <Globe className="w-4 h-4 text-primary" aria-hidden="true" />
                      Pública — Compartida con otras tiendas
                    </span>
                    <span className="block mt-1 text-muted-foreground text-xs font-medium normal-case tracking-normal">
                      Requiere permisos administrativos. Visible según el ámbito de publicación elegido.
                    </span>
                  </span>
                </label>
              )}
            </div>

            {/* Ámbito de publicación (solo destino público) */}
            {destination === 'public' && isAdmin && (
              <div className="space-y-3">
                <span className="text-xs font-black uppercase tracking-widest text-primary ml-1">
                  Ámbito de Publicación
                </span>
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger className="h-12 rounded-2xl bg-primary/5 border-primary/10 font-bold text-xs uppercase tracking-widest">
                    <SelectValue placeholder="Selecciona visibilidad" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-primary/10 bg-sidebar/95 backdrop-blur-2xl">
                    <SelectItem value="all" className="text-xs font-bold uppercase tracking-widest focus:bg-primary/10">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-primary" />
                        Todas las tiendas
                      </div>
                    </SelectItem>
                    {stores.map((store) => (
                      <SelectItem
                        key={store.id}
                        value={store.id}
                        className="text-xs font-bold uppercase tracking-widest focus:bg-primary/10"
                      >
                        <div className="flex items-center gap-2">
                          <StoreIcon className="w-4 h-4 text-primary" />
                          Solo Tienda: {store.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Aclaración de alcance (orden §4: dónde se guarda y quién puede usarla) */}
            <div className="rounded-2xl bg-primary/5 border border-primary/10 px-4 py-3 text-xs font-medium text-muted-foreground">
              {destination === 'private' ? (
                <span className="flex items-start gap-2">
                  <Cloud className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
                  Se guardará en <strong className="text-foreground">Mis plantillas privadas de COSTPRO</strong> (servidor).
                  No es un archivo local: la recuperarás al iniciar sesión desde cualquier dispositivo.
                </span>
              ) : (
                <span className="flex items-start gap-2">
                  <CloudUpload className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
                  Se publicará en <strong className="text-foreground">Plantillas Públicas</strong> para{' '}
                  {storeId === 'all' ? 'todas las tiendas autorizadas' : 'la tienda seleccionada'}.
                  Otros usuarios podrán cargarla para crear sus fichas.
                </span>
              )}
            </div>
          </div>

          <DialogFooter className="flex gap-3">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-2xl h-12 font-black uppercase tracking-widest text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={!canSubmit}
              className="flex-1 rounded-2xl h-12 bg-primary text-primary-foreground font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20"
            >
              {isSubmitting ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <LayoutTemplate className="w-4 h-4 mr-2" />
              )}
              {destination === 'public'
                ? 'Publicar Plantilla'
                : saveMode === 'update-existing'
                  ? 'Actualizar Plantilla'
                  : 'Guardar Plantilla'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación antes de sobrescribir una plantilla existente (orden §4). */}
      <ConfirmDialog
        open={confirmUpdate}
        title="Sobrescribir plantilla"
        message={`¿Estás seguro de que deseas sobrescribir la plantilla "${linkedTemplateName ?? name}" con los datos actuales del editor? Las versiones anteriores del contenido se reemplazan.`}
        variant="default"
        confirmLabel="Sí, sobrescribir"
        cancelLabel="Cancelar"
        onConfirm={() => {
          setConfirmUpdate(false);
          void doUpdateExisting();
        }}
        onCancel={() => setConfirmUpdate(false)}
      />
    </>
  );
};

export default CostSheetSaveAsTemplateDialog;
