'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { HelpCircle, FileText, Edit, DollarSign, Plus, Trash2, RefreshCw } from 'lucide-react';
import ProductImage from '@/components/ui/ProductImage';
import { PrimaryButton, SecondaryButton, IconButton } from '@/components/ui/atomic';
import { getSupabaseUrl, cn } from '@/lib/utils';
import { Product } from '@/types';

interface CatalogModalsProps {
  modals: any;
  handleUpdateProduct: () => Promise<void>;
  handleUpdateImage: (file: File) => Promise<void>;
  handleAddVariant: () => Promise<void>;
  handleDeleteVariant: (id: string) => Promise<void>;
  handleCreateProduct: () => Promise<void>;
  handleDeleteProduct: () => Promise<void>;
  handleToggleActive: () => Promise<void>;
  catalogService: any;
  stores?: any[];
}

export const CatalogModals = ({
  modals,
  handleUpdateProduct,
  handleUpdateImage,
  handleAddVariant,
  handleDeleteVariant,
  handleCreateProduct,
  handleDeleteProduct,
  handleToggleActive,
  catalogService
}: CatalogModalsProps) => {
  return (
    <>
      <Dialog open={modals.isEditProductModalOpen} onOpenChange={modals.setIsEditProductModalOpen}>
        <DialogContent className="max-w-md !rounded-3xl border-white/5 shadow-2xl">
          <DialogHeader><DialogTitle className="text-xl font-black uppercase tracking-tight">Editar Información</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto no-scrollbar pr-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Nombre</label>
              <input type="text" value={modals.editingProduct?.name || ''} onChange={(e) => modals.setEditingProduct({ ...modals.editingProduct, name: e.target.value })} className="neu-input w-full font-bold" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1 flex justify-between">
                  <span>SKU</span>
                  <span className="text-[8px] text-primary/70 italic">Único en tienda</span>
                </label>
                <input type="text" value={modals.editingProduct?.sku || ''} onChange={(e) => modals.setEditingProduct({ ...modals.editingProduct, sku: e.target.value })} className="neu-input w-full" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Categoría</label>
                <input type="text" value={modals.editingProduct?.category || ''} onChange={(e) => modals.setEditingProduct({ ...modals.editingProduct, category: e.target.value })} className="neu-input w-full" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Costo</label>
              <input type="number" value={modals.editingProduct?.cost_price || 0} onChange={(e) => modals.setEditingProduct({ ...modals.editingProduct, cost_price: parseFloat(e.target.value) || 0 })} className="neu-input w-full font-bold" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Precio</label>
              <input type="number" value={modals.editingProduct?.price || 0} onChange={(e) => modals.setEditingProduct({ ...modals.editingProduct, price: parseFloat(e.target.value) || 0 })} className="neu-input w-full font-bold" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Imagen</label>
              <div className="flex flex-col items-center gap-6 p-6 neu-inset-sm bg-background/50 rounded-3xl">
                <div className="neu-raised-sm w-40 h-40 flex items-center justify-center overflow-hidden rounded-3xl">
                  <ProductImage
                    src={modals.editingProduct?.image_url}
                    name={modals.editingProduct?.name || ''}
                    className="w-full h-full"
                    forceShow={true}
                  />
                </div>
                <div className="w-full space-y-2">
                  <input type="text" placeholder="O pegar URL" value={modals.editingProduct?.image_url || ''} onChange={(e) => modals.setEditingProduct({ ...modals.editingProduct, image_url: e.target.value })} className="neu-input w-full text-center text-xs" />
                  <input type="file" id="product-image-upload-cat" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleUpdateImage(file); }} />
                  <label htmlFor="product-image-upload-cat" className="w-full">
                    <SecondaryButton asChild className="w-full cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        <span>Subir Nueva Imagen</span>
                      </div>
                    </SecondaryButton>
                  </label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-3">
            <SecondaryButton onClick={() => modals.setIsEditProductModalOpen(false)} label="Cerrar" className="flex-1" />
            <PrimaryButton onClick={handleUpdateProduct} label="Guardar Cambios" className="flex-1" />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modals.isVariantsModalOpen} onOpenChange={modals.setIsVariantsModalOpen}>
        <DialogContent className="max-w-2xl !rounded-3xl border-white/5 shadow-2xl">
          <DialogHeader><DialogTitle className="text-xl font-black uppercase">Variantes - {modals.editingProduct?.name}</DialogTitle></DialogHeader>
          <div className="space-y-8 py-6">
            <div className="space-y-4">
              <div className="space-y-3 max-h-60 overflow-y-auto no-scrollbar pr-2">
                {modals.editingProduct?.product_variants?.map((v: any) => (
                  <div key={v.id} className="neu-raised-sm !p-4 flex justify-between items-center">
                    <div>
                      <div className="font-black text-sm uppercase">{v.name}</div>
                      <div className="text-[10px] font-bold text-muted-foreground uppercase">Factor: x{v.conversion_factor}</div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="font-black text-xl text-primary">${v.price.toFixed(2)}</div>
                      <IconButton onClick={() => handleDeleteVariant(v.id)} icon={Trash2} className="text-destructive border-destructive/20 hover:bg-destructive/10" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="neu-card !p-6 border border-primary/20 bg-primary/5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input type="text" value={modals.newVariantForm.name} onChange={(e) => modals.setNewVariantForm({ ...modals.newVariantForm, name: e.target.value })} className="neu-input w-full text-xs" placeholder="Nombre" />
                <input type="number" value={modals.newVariantForm.conversion_factor} onChange={(e) => modals.setNewVariantForm({ ...modals.newVariantForm, conversion_factor: parseInt(e.target.value) || 1 })} className="neu-input w-full text-xs" placeholder="Factor" />
              </div>
              <input type="number" value={modals.newVariantForm.price || ''} onChange={(e) => modals.setNewVariantForm({ ...modals.newVariantForm, price: parseFloat(e.target.value) || 0 })} className="neu-input w-full text-xl font-black" placeholder="0.00" />
              <PrimaryButton onClick={handleAddVariant} label="Registrar Variante" icon={Plus} className="w-full !py-4" />
            </div>
          </div>
          <DialogFooter>
            <SecondaryButton onClick={() => modals.setIsVariantsModalOpen(false)} label="Cerrar Panel" className="w-full" />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modals.isCreateProductModalOpen} onOpenChange={modals.setIsCreateProductModalOpen}>
        <DialogContent className="max-w-md !rounded-3xl border-white/5 shadow-2xl">
          <DialogHeader><DialogTitle className="text-xl font-black uppercase">Nuevo Producto</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto no-scrollbar pr-2">
            <div className="space-y-1.5"><label className="text-[10px] font-black uppercase tracking-widest ml-1">Nombre</label><input type="text" value={modals.newProductForm.name} onChange={(e) => modals.setNewProductForm({ ...modals.newProductForm, name: e.target.value })} className="neu-input w-full font-bold" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest ml-1 flex justify-between">
                  <span>SKU</span>
                  <span className="text-[8px] text-primary/70 italic">Único en tienda</span>
                </label>
                <input type="text" value={modals.newProductForm.sku} onChange={(e) => modals.setNewProductForm({ ...modals.newProductForm, sku: e.target.value })} className="neu-input w-full" />
              </div>
              <div className="space-y-1.5"><label className="text-[10px] font-black uppercase tracking-widest ml-1">Categoría</label><input type="text" value={modals.newProductForm.category} onChange={(e) => modals.setNewProductForm({ ...modals.newProductForm, category: e.target.value })} className="neu-input w-full" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><label className="text-[10px] font-black uppercase tracking-widest ml-1">Precio</label><input type="number" value={modals.newProductForm.price || ''} onChange={(e) => modals.setNewProductForm({ ...modals.newProductForm, price: parseFloat(e.target.value) || 0 })} className="neu-input w-full" /></div>
              <div className="space-y-1.5"><label className="text-[10px] font-black uppercase tracking-widest ml-1">Costo</label><input type="number" value={modals.newProductForm.cost_price || ''} onChange={(e) => modals.setNewProductForm({ ...modals.newProductForm, cost_price: parseFloat(e.target.value) || 0 })} className="neu-input w-full" /></div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-3">
            <SecondaryButton onClick={() => modals.setIsCreateProductModalOpen(false)} label="Cancelar" className="flex-1" />
            <PrimaryButton onClick={handleCreateProduct} label="Crear Producto" className="flex-1" />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modals.isHelpModalOpen} onOpenChange={modals.setIsHelpModalOpen}>
        <DialogContent className="max-w-md !rounded-3xl border-white/5 shadow-2xl">
          <DialogHeader><DialogTitle className="text-xl font-black uppercase flex items-center gap-2"><HelpCircle className="w-6 h-6 text-primary" /> Ayuda</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4 text-sm">
            <p>Gestión de Precios y Catálogo.</p>
            <SecondaryButton onClick={() => catalogService.downloadTemplate()} label="Plantilla CSV" icon={FileText} className="w-full" />
          </div>
          <DialogFooter>
            <PrimaryButton onClick={() => modals.setIsHelpModalOpen(false)} label="Entendido" className="w-full" />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Deletion */}
      <Dialog open={modals.isDeleteConfirmOpen} onOpenChange={modals.setIsDeleteConfirmOpen}>
        <DialogContent className="max-w-md !rounded-3xl border-white/5 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase text-danger flex items-center gap-2">
              <Trash2 className="w-6 h-6" /> Confirmar Eliminación
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center space-y-4">
            <p className="font-bold">¿Está seguro de que desea eliminar permanentemente este producto?</p>
            <div className="neu-card !p-4 bg-muted/20 border-white/5">
                <p className="font-black uppercase text-xs tracking-widest text-muted-foreground mb-1">Producto</p>
                <p className="font-bold text-lg">{modals.productToAction?.name}</p>
                <p className="text-xs font-mono text-muted-foreground">{modals.productToAction?.sku || 'S/N'}</p>
            </div>
            <p className="text-xs text-muted-foreground uppercase font-bold tracking-tighter">Esta acción no se puede deshacer.</p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-3">
            <SecondaryButton onClick={() => modals.setIsDeleteConfirmOpen(false)} label="Cancelar" className="flex-1" />
            <PrimaryButton onClick={handleDeleteProduct} label="Eliminar Definitivamente" className="flex-1 bg-danger text-white hover:bg-danger/90 shadow-danger/20" />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Deactivation/Reactivation */}
      <Dialog open={modals.isDeactivateConfirmOpen} onOpenChange={modals.setIsDeactivateConfirmOpen}>
        <DialogContent className="max-w-md !rounded-3xl border-white/5 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase flex items-center gap-2">
              {modals.productToAction?.is_active ? <Trash2 className="w-6 h-6 text-warning" /> : <RefreshCw className="w-6 h-6 text-success" />}
              {modals.productToAction?.is_active ? 'Confirmar Desactivación' : 'Confirmar Reactivación'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center space-y-4">
            <p className="font-bold">
                {modals.productToAction?.is_active
                    ? 'El producto tiene movimientos y no puede eliminarse. ¿Desea desactivarlo?'
                    : '¿Desea reactivar este producto para que vuelva a estar disponible?'}
            </p>
            <div className="neu-card !p-4 bg-muted/20 border-white/5">
                <p className="font-black uppercase text-xs tracking-widest text-muted-foreground mb-1">Producto</p>
                <p className="font-bold text-lg">{modals.productToAction?.name}</p>
            </div>
            {modals.productToAction?.is_active && (
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-tighter">
                    Los productos desactivados no aparecen en el POS ni en reportes de stock.
                </p>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-3">
            <SecondaryButton onClick={() => modals.setIsDeactivateConfirmOpen(false)} label="Cancelar" className="flex-1" />
            <PrimaryButton
                onClick={handleToggleActive}
                label={modals.productToAction?.is_active ? 'Desactivar Producto' : 'Reactivar Producto'}
                className={cn("flex-1", !modals.productToAction?.is_active && "bg-success hover:bg-success/90 shadow-success/20 text-white")}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
