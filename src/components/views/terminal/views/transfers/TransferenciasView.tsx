'use client';
// src/components/views/terminal/views/transfers/TransferenciasView.tsx

import { useState } from 'react';
import { useAuthStore } from '@/store';
import {
  ArrowLeftRight,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  RefreshCcw,
  Clock,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { useIncomingTransfers, useOutgoingTransfers } from '@/hooks/api/useTransfers';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { cn } from '@/lib/utils';
import { format, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import CreateTransferModal from './CreateTransferModal';
import TransferDetailsModal from './TransferDetailsModal';

export default function TransferenciasView() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'outgoing' | 'incoming'>('outgoing');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);

  const {
    data: incomingTransfers,
    isLoading: isLoadingIncoming,
    error: errorIncoming,
    refetch: refetchIncoming
  } = useIncomingTransfers(user?.activeStoreId);

  const {
    data: outgoingTransfers,
    isLoading: isLoadingOutgoing,
    error: errorOutgoing,
    refetch: refetchOutgoing
  } = useOutgoingTransfers(user?.activeStoreId);

  const actions: Action[] = [
    {
      id: 'refresh',
      label: 'Actualizar',
      icon: RefreshCcw,
      onClick: () => activeTab === 'incoming' ? refetchIncoming() : refetchOutgoing(),
    },
    {
      id: 'create',
      label: 'Nueva Transferencia',
      icon: Plus,
      onClick: () => setIsCreateModalOpen(true),
      variant: 'primary',
    },
  ];

  const currentData = activeTab === 'incoming' ? incomingTransfers : outgoingTransfers;
  const isLoading = activeTab === 'incoming' ? isLoadingIncoming : isLoadingOutgoing;
  const error = activeTab === 'incoming' ? errorIncoming : errorOutgoing;

  const tabs = [
    { id: 'outgoing', label: 'Salientes', icon: ArrowUpRight },
    { id: 'incoming', label: 'Entrantes', icon: ArrowDownLeft }
  ] as const;

  const handleTabKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    if (e.key === 'ArrowRight') {
      const next = (currentIndex + 1) % tabs.length;
      setActiveTab(tabs[next].id);
      document.getElementById(`tab-${tabs[next].id}`)?.focus();
    }
    if (e.key === 'ArrowLeft') {
      const prev = (currentIndex - 1 + tabs.length) % tabs.length;
      setActiveTab(tabs[prev].id);
      document.getElementById(`tab-${tabs[prev].id}`)?.focus();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDIENTE':
        return <span className="flex items-center gap-1 text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-widest"><Clock className="w-3 h-3" /> Pendiente</span>;
      case 'CONFIRMADA':
        return <span className="flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-widest"><CheckCircle2 className="w-3 h-3" /> Confirmada</span>;
      case 'CANCELADA':
        return <span className="flex items-center gap-1 text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-widest"><XCircle className="w-3 h-3" /> Cancelada</span>;
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-[clamp(1.25rem,4vw,1.75rem)] font-black border-l-4 border-primary pl-4 uppercase tracking-tighter flex items-center gap-3 text-primary">
          <ArrowLeftRight className="w-8 h-8 text-primary" />
          Transferencias entre Almacenes
        </h2>
        <ActionMenu actions={actions} />
      </div>

      <div
        role="tablist"
        aria-label="Filtrar transferencias por dirección"
        className="flex gap-2 p-1 bg-white/5 rounded-2xl w-fit"
      >
        {tabs.map((tab, idx) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(e) => handleTabKeyDown(e, idx)}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
              activeTab === tab.id ? "bg-primary text-primary-foreground shadow-lg scale-105" : "hover:bg-white/5 text-muted-foreground"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={0}
      >
        <StateRenderer
          isLoading={isLoading}
          error={error as Error}
          data={currentData}
          emptyComponent={
            <div className="py-24 text-center neu-card bg-white/2 space-y-4">
               <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                  <ArrowLeftRight className="w-10 h-10 text-muted-foreground opacity-20" />
               </div>
               <div>
                  <p className="text-xs font-black uppercase text-primary/70 tracking-[0.2em]">No hay transferencias</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    {activeTab === 'incoming' ? 'No tienes solicitudes de transferencia pendientes por recibir.' : 'No has realizado ninguna solicitud de transferencia recientemente.'}
                  </p>
               </div>
            </div>
          }
        >
          {(transfers) => (
            <div className="grid grid-cols-1 gap-4">
              {transfers.map((t: any) => (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedTransferId(t.id)}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedTransferId(t.id)}
                  aria-label={`Ver detalles de transferencia ${activeTab === 'outgoing' ? 'hacia' : 'desde'} ${activeTab === 'outgoing' ? t.destination_store?.name : t.origin_store?.name}. Estado: ${t.status}`}
                  className="neu-card hover:border-primary/30 transition-all cursor-pointer group !p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4">
                     <div className={cn(
                       "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                       activeTab === 'outgoing' ? "bg-amber-500/10" : "bg-green-600/10"
                     )}>
                        {activeTab === 'outgoing' ? <ArrowUpRight className="w-6 h-6 text-amber-500" /> : <ArrowDownLeft className="w-6 h-6 text-green-600" />}
                     </div>
                     <div>
                        <div className="flex items-center gap-2">
                           <span className="text-sm font-black uppercase tracking-tight">
                              {activeTab === 'outgoing' ? `Hacia: ${t.destination_store?.name}` : `Desde: ${t.origin_store?.name}`}
                           </span>
                           {getStatusBadge(t.status)}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground font-medium uppercase tracking-wider">
                           <span>ID: {t.id.split('-')[0]}</span>
                           <span>•</span>
                           <span>Solicitado por: {t.creator?.full_name}</span>
                           <span>•</span>
                           <span>{isValid(new Date(t.created_at)) ? format(new Date(t.created_at), 'PPPp', { locale: es }) : '—'}</span>
                        </div>
                     </div>
                  </div>

                  <div className="flex items-center gap-6">
                     <div className="text-right">
                        <p className="text-xs font-black uppercase text-muted-foreground tracking-widest">Productos</p>
                        <p className="text-sm font-black text-primary group-hover:scale-110 transition-transform origin-right">VER DETALLE</p>
                     </div>
                     <ArrowLeftRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </StateRenderer>
      </div>

      <CreateTransferModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      <TransferDetailsModal
        transferId={selectedTransferId}
        onClose={() => setSelectedTransferId(null)}
      />
    </div>
  );
}
