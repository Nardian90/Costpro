'use client';

/**
 * CP-UX-ORG-STORES-001 — StoreSettingsView: pestaña «Configuración» del hub
 * Gestión de Tiendas (OPERACIÓN).
 *
 * RESPONSABILIDAD ÚNICA (separación de la misión): configurar la SUCURSAL
 * ACTIVA con la que trabaja el usuario — nunca la estructura de organizaciones
 * (eso vive en SISTEMA → Organizaciones, con el listado de tiendas de cada
 * empresa). La vista SIEMPRE opera sobre `user.activeStoreId` (contexto real
 * del perfil, no una selección visual), lo que impide modificar otra sucursal
 * por error; el backend re-valida con canManageStore + RLS en cada PATCH.
 *
 * Reutiliza el formulario único StoreEditForm (extraído de EditStoreModal):
 * mismos campos, mismas validaciones, mismo camino de guardado
 * (useStoreEdit.editStoreWithFC). Sin campos nuevos en la base de datos.
 *
 * Estados contemplados (misión §4): carga · sin tienda activa (CTA a
 * Organizaciones para admin / hint del selector para el resto) · tienda activa
 * no disponible (archivada/desactivada) · error con reintento · solo lectura
 * (sin canManageStore) · edición.
 */

import React, { useMemo, useState } from 'react';
import { Loader2, AlertTriangle, RotateCcw, Store as StoreIcon, ShieldAlert } from 'lucide-react';
import { useAuthStore, useUIStore } from '@/store';
import { isAdminLevel, canManageStore } from '@/lib/roles';
import { useStores } from '@/hooks/api/useStores';
import { useStoreEdit } from '@/hooks/views/useStoreEdit';
import { StoreEditForm } from './StoreEditForm';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Store } from '@/types';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

export default function StoreSettingsView() {
  const t = useTranslations('stores');
  const { user } = useAuthStore();
  const setCurrentView = useUIStore(s => s.setCurrentView);
  const activeStoreId = user?.activeStoreId || null;

  // Misma fuente de datos que el resto de vistas de tiendas (useStores):
  // la API filtra por rol server-side y el store activo viene del perfil.
  const isEncargado = user?.role === 'encargado' || user?.role === 'manager' || user?.memberships?.some(m => m.role === 'encargado');
  const { data: stores = [], isLoading, isError, refetch } = useStores(
    user?.id || '',
    isAdminLevel(user?.role),
    isEncargado || false
  );

  const activeStore: Store | null = useMemo(
    () => stores.find(s => s.id === activeStoreId) ?? null,
    [stores, activeStoreId]
  );

  const storeEdit = useStoreEdit();
  const [isSaving, setIsSaving] = useState(false);
  // Al guardar, la query refresca y el objeto de la tienda cambia de identidad
  // (mismo id) → el token fuerza la recarga del formulario con los datos reales.
  const [resetToken, setResetToken] = useState(0);

  const canManage = activeStoreId ? canManageStore(user, activeStoreId) : false;

  const handleSubmit = async (data: Partial<Store>) => {
    if (!activeStore) return;
    setIsSaving(true);
    try {
      const fcWasActive = activeStore.cost_template?.is_active === true;
      await storeEdit.editStoreWithFC(activeStore.id, data, fcWasActive);
      toast.success(t('updateSuccess'));
      setResetToken(v => v + 1);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t('operationError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    // Restaurar el formulario con los datos guardados de la tienda activa.
    setResetToken(v => v + 1);
  };

  // ── Estados de contexto (misión §4) ──
  if (!activeStoreId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-border rounded-xl bg-muted/10 px-4">
        <StoreIcon className="w-14 h-14 text-muted-foreground/30 mb-4" aria-hidden="true" />
        <p className="font-black uppercase tracking-widest text-sm text-foreground mb-2">{t('settingsNoStore')}</p>
        <p className="text-sm text-muted-foreground font-bold max-w-md">{t('settingsNoStoreHint')}</p>
        {isAdminLevel(user?.role) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentView('organizations')}
            className="mt-5 uppercase text-xs font-black tracking-widest"
          >
            {t('settingsNoStoreAdminCta')}
          </Button>
        )}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 border-2 border-destructive/30 rounded-xl bg-destructive/5">
        <AlertTriangle className="w-12 h-12 text-destructive/60" aria-hidden="true" />
        <p className="font-black uppercase text-sm text-destructive">Error al cargar la configuración</p>
        <button
          onClick={() => refetch()}
          className="min-h-[44px] px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90 flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" /> Reintentar
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4" role="status" aria-label="Cargando configuración de la tienda">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-12 rounded-lg" />
      </div>
    );
  }

  if (!activeStore) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-border rounded-xl bg-muted/10 px-4">
        <AlertTriangle className="w-12 h-12 text-amber-500/70 mb-4" aria-hidden="true" />
        <p className="font-black uppercase tracking-widest text-sm text-foreground mb-2">{t('settingsUnavailableStore')}</p>
        <p className="text-sm text-muted-foreground font-bold max-w-md">{t('settingsUnavailableHint')}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="mt-5 uppercase text-xs font-black tracking-widest gap-2"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="store-settings-view">
      {/* Solo lectura: el usuario ve la configuración pero no puede modificarla
          (canManageStore es el mismo criterio que autoriza el PATCH server-side). */}
      {!canManage && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-xl border border-amber-500/40 bg-amber-500/10"
          role="note"
          aria-label={t('settingsReadOnly')}
        >
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
          <p className="text-xs font-black uppercase tracking-widest text-foreground">{t('settingsReadOnly')}</p>
        </div>
      )}

      <StoreEditForm
        store={activeStore}
        onSubmit={handleSubmit}
        isSubmitting={isSaving}
        onCancel={handleCancel}
        idPrefix="store-settings"
        resetToken={resetToken}
        readOnly={!canManage}
      />
    </div>
  );
}
