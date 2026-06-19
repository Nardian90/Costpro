'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useAuthStore } from '@/store';
import { useStores } from '@/hooks/api/useStores';
import { useOfertaDetail, useDeleteOferta } from '@/hooks/api/useOfertas';
import {
  OfertaFactory,
  OfertaSuministradorFactory,
  type OfertaContract,
} from '@/contracts/oferta';
import type { Oferta, OfertaStatus } from '@/types/oferta';
import OfertaListPanel from './OfertaListPanel';
import OfertaFormPanel from './OfertaFormPanel';
import ConfirmDialog from './ConfirmDialog';

export default function OfertasView() {
  const { user } = useAuthStore();
  const storeId = user?.activeStoreId || '';

  // Fetch stores to pre-fill suministrador data
  const isAdmin = user?.role === 'admin';
  const isEncargado = user?.role === 'encargado' || user?.role === 'manager';
  const { data: stores = [] } = useStores(user?.id || '', isAdmin, isEncargado);
  const activeStore = useMemo(() => stores.find(s => s.id === storeId), [stores, storeId]);

  // List state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<OfertaStatus | 'all'>('all');
  const [selectedOfertaId, setSelectedOfertaId] = useState<string | null>(null);

  // Form state
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<OfertaContract>(OfertaFactory.create());

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Unsaved changes guard
  const [isDirty, setIsDirty] = useState(false);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: '', message: '', onConfirm: () => {} });

  // Queries
  const { data: detailData, isLoading: detailLoading } = useOfertaDetail(selectedOfertaId);

  // ─── Filter handlers with page reset ──────────────────────────────────────────

  const handleSearchChange = useCallback((term: string) => {
    setSearchTerm(term);
    setCurrentPage(1);
  }, []);

  const handleStatusFilterChange = useCallback((filter: OfertaStatus | 'all') => {
    setStatusFilter(filter);
    setCurrentPage(1);
  }, []);

  // ─── Dirty Guard ────────────────────────────────────────────────────────────────

  const confirmIfDirty = useCallback((action: () => void) => {
    if (isDirty) {
      setConfirmDialog({
        open: true,
        title: 'Cambios sin guardar',
        message: 'Tiene cambios sin guardar. ¿Desea descartarlos y continuar?',
        onConfirm: () => {
          setIsDirty(false);
          action();
        },
      });
    } else {
      action();
    }
  }, [isDirty]);

  // ─── Navigation Handlers ────────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setFormData(OfertaFactory.create());
    setIsCreating(false);
    setSelectedOfertaId(null);
    setIsDirty(false);
  }, []);

  const handleSelectOferta = useCallback((oferta: Oferta) => {
    confirmIfDirty(() => {
      setSelectedOfertaId(oferta.id);
      setIsCreating(true);
    });
  }, [confirmIfDirty]);

  const handleNewOferta = useCallback(() => {
    confirmIfDirty(() => {
      const suministradorFromStore = activeStore ? {
        empresa: activeStore.name || '',
        codigo_reup: activeStore.reeup || '',
        codigo_nit: activeStore.nit || '',
        direccion: activeStore.address || '',
        telefono: activeStore.phone || '',
        cuenta_bancaria: activeStore.bank_account || '',
        email: activeStore.email || '',
      } : OfertaSuministradorFactory.create();

      setFormData({
        ...OfertaFactory.create(),
        suministrador: suministradorFromStore,
        stamp_url: activeStore?.stamp_url || '',
        sign_url: activeStore?.signature_url || '',
      });
      setIsCreating(true);
      setSelectedOfertaId(null);
      setIsDirty(false);
    });
  }, [activeStore, confirmIfDirty]);

  const handleDeleteOferta = useCallback((ofertaId: string) => {
    // Delete is now handled directly in OfertaListPanel with its own confirmation
    // This callback is kept for any additional cleanup needed
    if (selectedOfertaId === ofertaId) {
      resetForm();
    }
  }, [selectedOfertaId, resetForm]);

  // ─── Populate form from detail data ─────────────────────────────────────────────

  React.useEffect(() => {
    if (selectedOfertaId && detailData?.data) {
      const oferta = detailData.data;
      setFormData({
        id: oferta.id,
        store_id: oferta.store_id,
        numero: oferta.numero,
        fecha: oferta.fecha,
        objeto: oferta.objeto,
        suministrador: {
          empresa: oferta.suministrador?.empresa || '',
          codigo_reup: oferta.suministrador?.codigo_reup || '',
          codigo_nit: oferta.suministrador?.codigo_nit || '',
          direccion: oferta.suministrador?.direccion || '',
          telefono: oferta.suministrador?.telefono || '',
          cuenta_bancaria: oferta.suministrador?.cuenta_bancaria || '',
          email: oferta.suministrador?.email || '',
        },
        cliente: {
          empresa: oferta.cliente?.empresa || '',
          codigo_reup: oferta.cliente?.codigo_reup || '',
          codigo_nit: oferta.cliente?.codigo_nit || '',
          direccion: oferta.cliente?.direccion || '',
          telefono: oferta.cliente?.telefono || '',
          email: oferta.cliente?.email || '',
          contacto: oferta.cliente?.contacto || '',
        },
        productos: (oferta.productos || []).map((p: any) => ({
          ...p,
          _uid: p._uid || `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        })),
        status: oferta.status,
        stamp_url: oferta.stamp_url || null,
        sign_url: oferta.sign_url || null,
        stamp_scale: oferta.stamp_scale || 100,
        sign_scale: oferta.sign_scale || 100,
        subtotal: oferta.subtotal || 0,
        descuento: oferta.descuento || 0,
        impuesto_rate: oferta.itbis || 0,
        total: oferta.total || 0,
        moneda: oferta.moneda || 'CUP',
        validez: oferta.validez || '30 días',
        condiciones_pago: oferta.condiciones_pago || '',
        condiciones_entrega: oferta.condiciones_entrega || '',
        notas: oferta.notas || '',
        created_by: oferta.created_by,
        created_at: oferta.created_at,
        updated_at: oferta.updated_at,
      });
    }
  }, [selectedOfertaId, detailData]);

  // ─── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
      {/* LEFT PANEL: List */}
      <OfertaListPanel
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilterChange}
        selectedOfertaId={selectedOfertaId}
        onSelectOferta={handleSelectOferta}
        onNewOferta={handleNewOferta}
        onDeleteOferta={handleDeleteOferta}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
      />

      {/* RIGHT PANEL: Form */}
      <div className="flex-1 min-w-0">
        <OfertaFormPanel
          formData={formData}
          setFormData={setFormData}
          isCreating={isCreating}
          selectedOfertaId={selectedOfertaId}
          detailLoading={detailLoading}
          isDirty={isDirty}
          setIsDirty={setIsDirty}
          onReset={resetForm}
          onConfirmIfDirty={confirmIfDirty}
          storeId={storeId}
        />
      </div>

      {/* Unsaved changes confirmation dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={() => {
          const fn = confirmDialog.onConfirm;
          setConfirmDialog(d => ({ ...d, open: false }));
          fn();
        }}
        onCancel={() => setConfirmDialog(d => ({ ...d, open: false }))}
      />
    </div>
  );
}
