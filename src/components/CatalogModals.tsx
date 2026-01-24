'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { HelpCircle, FileText, Edit, DollarSign, Plus, Trash2 } from 'lucide-react';
import ImageWithFallback from './ui/ImageWithFallback';
import { getSupabaseUrl } from '@/lib/utils';
import { Product } from '@/types';

interface CatalogModalsProps {
  modals: any;
  handleUpdateProduct: () => Promise<void>;
  handleUpdateImage: (file: File) => Promise<void>;
  handleAddVariant: () => Promise<void>;
  handleDeleteVariant: (id: string) => Promise<void>;
  handleCreateProduct: () => Promise<void>;
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
                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">SKU</label>
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
                  <ImageWithFallback src={modals.editingProduct?.image_url?.includes('http') ? modals.editingProduct.image_url : getSupabaseUrl('product-images', modals.editingProduct?.image_url)} alt={modals.editingProduct?.name || ''} name={modals.editingProduct?.name || ''} className="w-full h-full object-cover" />
                </div>
                <div className="w-full space-y-2">
                  <input type="text" placeholder="O pegar URL" value={modals.editingProduct?.image_url || ''} onChange={(e) => modals.setEditingProduct({ ...modals.editingProduct, image_url: e.target.value })} className="neu-input w-full text-center text-xs" />
                  <input type="file" id="product-image-upload-cat" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleUpdateImage(file); }} />
                  <label htmlFor="product-image-upload-cat" className="neu-btn !px-8 text-[10px] font-black uppercase tracking-widest cursor-pointer w-full text-center block">Subir Nueva Imagen</label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-3">
            <button onClick={() => modals.setIsEditProductModalOpen(false)} className="neu-btn !py-3 flex-1 font-black text-xs">Cerrar</button>
            <button onClick={handleUpdateProduct} className="neu-btn-primary !py-3 flex-1 font-black text-xs">Guardar</button>
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
                      <button onClick={() => handleDeleteVariant(v.id)} className="p-2 text-danger"><Trash2 className="w-5 h-5" /></button>
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
              <button onClick={handleAddVariant} className="neu-btn-primary w-full !py-4 flex items-center justify-center gap-2 font-black text-[10px]"><Plus className="w-4 h-4" /> Registrar</button>
            </div>
          </div>
          <DialogFooter><button onClick={() => modals.setIsVariantsModalOpen(false)} className="neu-btn w-full !py-3 font-black text-xs">Cerrar Panel</button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modals.isCreateProductModalOpen} onOpenChange={modals.setIsCreateProductModalOpen}>
        <DialogContent className="max-w-md !rounded-3xl border-white/5 shadow-2xl">
          <DialogHeader><DialogTitle className="text-xl font-black uppercase">Nuevo Producto</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto no-scrollbar pr-2">
            <div className="space-y-1.5"><label className="text-[10px] font-black uppercase tracking-widest ml-1">Nombre</label><input type="text" value={modals.newProductForm.name} onChange={(e) => modals.setNewProductForm({ ...modals.newProductForm, name: e.target.value })} className="neu-input w-full font-bold" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><label className="text-[10px] font-black uppercase tracking-widest ml-1">SKU</label><input type="text" value={modals.newProductForm.sku} onChange={(e) => modals.setNewProductForm({ ...modals.newProductForm, sku: e.target.value })} className="neu-input w-full" /></div>
              <div className="space-y-1.5"><label className="text-[10px] font-black uppercase tracking-widest ml-1">Categoría</label><input type="text" value={modals.newProductForm.category} onChange={(e) => modals.setNewProductForm({ ...modals.newProductForm, category: e.target.value })} className="neu-input w-full" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><label className="text-[10px] font-black uppercase tracking-widest ml-1">Precio</label><input type="number" value={modals.newProductForm.price || ''} onChange={(e) => modals.setNewProductForm({ ...modals.newProductForm, price: parseFloat(e.target.value) || 0 })} className="neu-input w-full" /></div>
              <div className="space-y-1.5"><label className="text-[10px] font-black uppercase tracking-widest ml-1">Costo</label><input type="number" value={modals.newProductForm.cost_price || ''} onChange={(e) => modals.setNewProductForm({ ...modals.newProductForm, cost_price: parseFloat(e.target.value) || 0 })} className="neu-input w-full" /></div>
            </div>
          </div>
          <DialogFooter className="gap-3">
            <button onClick={() => modals.setIsCreateProductModalOpen(false)} className="neu-btn !py-3 flex-1 font-black text-xs">Cancelar</button>
            <button onClick={handleCreateProduct} className="neu-btn-primary !py-3 flex-1 font-black text-xs">Crear</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modals.isHelpModalOpen} onOpenChange={modals.setIsHelpModalOpen}>
        <DialogContent className="max-w-md !rounded-3xl border-white/5 shadow-2xl">
          <DialogHeader><DialogTitle className="text-xl font-black uppercase flex items-center gap-2"><HelpCircle className="w-6 h-6 text-primary" /> Ayuda</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4 text-sm">
            <p>Gestión de Precios y Catálogo.</p>
            <button onClick={() => catalogService.downloadTemplate()} className="w-full neu-btn !py-2 flex items-center justify-center gap-2 text-[10px] font-black uppercase"><FileText className="w-4 h-4" /> Plantilla CSV</button>
          </div>
          <DialogFooter><button onClick={() => modals.setIsHelpModalOpen(false)} className="neu-btn-primary w-full !py-3 font-black text-xs">Entendido</button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
