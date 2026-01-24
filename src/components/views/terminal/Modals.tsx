'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { X, Loader2 } from 'lucide-react';
import UserForm, { UserFormData } from './UserForm';
import { Transaction, Store, TransactionItem, Product } from '@/types';
import { UserContract } from '@/contracts/user';

type ExtendedTransactionItem = TransactionItem & {
  products?: Pick<Product, 'name' | 'sku'>;
  unit_price: number; // The RPC/Table might return this
};

interface ModalsProps {
  selectedTransaction: Transaction | null;
  setSelectedTransactionId: (id: string | null) => void;
  loadingDetails: boolean;
  transactionItems: ExtendedTransactionItem[];

  isEditStoreModalOpen: boolean;
  setIsEditStoreModalOpen: (open: boolean) => void;
  editingStore: Store | null;
  setEditingStore: (store: Store | null) => void;
  handleUpdateStore: (id: string, name: string, address: string) => Promise<boolean>;

  userFormMode: 'create' | 'edit' | null;
  setUserFormMode: (mode: 'create' | 'edit' | null) => void;
  selectedUserContract: UserContract | null;
  stores: Store[];
  handleUserFormSubmit: (mode: 'create' | 'edit' | null, data: UserFormData, id?: string) => Promise<boolean>;
  isSubmittingUser: boolean;
}

export const Modals = ({
  selectedTransaction,
  setSelectedTransactionId,
  loadingDetails,
  transactionItems,

  isEditStoreModalOpen,
  setIsEditStoreModalOpen,
  editingStore,
  setEditingStore,
  handleUpdateStore,

  userFormMode,
  setUserFormMode,
  selectedUserContract,
  stores,
  handleUserFormSubmit,
  isSubmittingUser
}: ModalsProps) => {
  return (
    <>
      {selectedTransaction && (
        <Dialog open={!!selectedTransaction} onOpenChange={(open) => !open && setSelectedTransactionId(null)}>
          <DialogContent className="max-w-2xl !rounded-3xl p-0 overflow-hidden bg-background">
            <div className="flex justify-between items-center p-8 border-b border-border bg-primary/5">
              <div>
                <h3 className="text-2xl font-black text-primary uppercase tracking-tighter">Detalle de Operación</h3>
                <p className="text-[10px] text-muted-foreground font-black uppercase mt-1">ID: {selectedTransaction.id}</p>
              </div>
              <button onClick={() => setSelectedTransactionId(null)} className="p-2 hover:text-destructive transition-colors"><X /></button>
            </div>
            <div className="p-8 max-h-[70vh] overflow-y-auto">
              {loadingDetails ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin" /></div> : (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl border border-border bg-muted/20">
                      <div className="text-[9px] font-black uppercase text-muted-foreground mb-1">Fecha</div>
                      <div className="text-xs font-bold">{new Date(selectedTransaction.created_at).toLocaleString()}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-border bg-muted/20">
                      <div className="text-[9px] font-black uppercase text-muted-foreground mb-1">Método</div>
                      <div className="text-xs font-bold uppercase">{selectedTransaction.payment_method}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-border bg-muted/20">
                      <div className="text-[9px] font-black uppercase text-muted-foreground mb-1">Estado</div>
                      <div className="text-xs font-bold uppercase text-green-600">{selectedTransaction.status}</div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-[0.3em] text-primary border-b border-primary/20 pb-2 mb-6">Artículos de la Venta</h4>
                    <div className="overflow-x-auto table-to-cards rounded-2xl">
                      <table className="w-full text-sm">
                        <thead className="sticky-header">
                          <tr className="border-b border-white/5 text-muted-foreground font-black uppercase text-[9px] tracking-widest text-left">
                            <th className="pb-4">Descripción</th>
                            <th className="pb-4 text-center">Cant.</th>
                            <th className="pb-4 text-right">Precio Unit.</th>
                            <th className="pb-4 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transactionItems.map((item) => (
                            <tr key={item.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                              <td className="py-4">
                                <div className="font-bold text-primary">{item.products?.name}</div>
                                <div className="text-[10px] text-muted-foreground font-medium">{item.products?.sku}</div>
                              </td>
                              <td className="py-4 text-center font-black">{item.quantity}</td>
                              <td className="py-4 text-right font-medium">${item.unit_price.toFixed(2)}</td>
                              <td className="py-4 text-right font-black text-primary">${(item.quantity * item.unit_price).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex justify-end pt-4">
                        <div className="w-64 p-4 bg-primary text-white rounded-2xl shadow-xl">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-black uppercase">Total Final</span>
                            <span className="text-2xl font-black">${selectedTransaction.total_amount.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Store Modal */}
      <Dialog open={isEditStoreModalOpen} onOpenChange={setIsEditStoreModalOpen}>
        <DialogContent className="!rounded-3xl border-border">
          <DialogHeader><DialogTitle className="font-black uppercase">Configurar Sucursal</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <input
              type="text"
              value={editingStore?.name || ''}
              onChange={e => setEditingStore(editingStore ? { ...editingStore, name: e.target.value } : null)}
              className="w-full p-3 rounded-lg border border-border bg-background font-bold"
              placeholder="Nombre"
            />
            <input
              type="text"
              value={editingStore?.address || ''}
              onChange={e => setEditingStore(editingStore ? { ...editingStore, address: e.target.value } : null)}
              className="w-full p-3 rounded-lg border border-border bg-background text-sm"
              placeholder="Dirección"
            />
          </div>
          <DialogFooter>
            <button onClick={() => setIsEditStoreModalOpen(false)} className="px-4 py-2 font-black uppercase text-xs">Cerrar</button>
            <button
              onClick={async () => {
                if (editingStore) {
                  const success = await handleUpdateStore(editingStore.id, editingStore.name, editingStore.address || '');
                  if (success) setIsEditStoreModalOpen(false);
                }
              }}
              className="px-6 py-2 bg-primary text-white rounded-lg font-black uppercase text-xs"
            >
              Guardar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Management Modal */}
      <Dialog open={!!userFormMode} onOpenChange={(open) => !open && setUserFormMode(null)}>
        <DialogContent className="!rounded-3xl border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black uppercase tracking-tighter text-2xl">
              {userFormMode === 'create' ? 'Nuevo Usuario' : 'Editar Usuario'}
            </DialogTitle>
          </DialogHeader>
          <UserForm
            mode={userFormMode || 'create'}
            initialData={selectedUserContract}
            stores={stores}
            onSubmit={async (data) => {
              const success = await handleUserFormSubmit(userFormMode, data, selectedUserContract?.id);
              if (success) setUserFormMode(null);
            }}
            onCancel={() => setUserFormMode(null)}
            isSubmitting={isSubmittingUser}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
