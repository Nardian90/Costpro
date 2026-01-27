import { useState } from 'react';

export function useCatalogModals() {
  const [isEditProductModalOpen, setIsEditProductModalOpen] = useState(false);
  const [isVariantsModalOpen, setIsVariantsModalOpen] = useState(false);
  const [isCreateProductModalOpen, setIsCreateProductModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeactivateConfirmOpen, setIsDeactivateConfirmOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [productToAction, setProductToAction] = useState<any>(null);

  const [newVariantForm, setNewVariantForm] = useState({ name: '', price: 0, conversion_factor: 1 });
  const [newProductForm, setNewProductForm] = useState({
    name: '',
    sku: '',
    category: '',
    price: 0,
    cost_price: 0,
    unit_of_measure: 'unidad',
    description: ''
  });

  return {
    isEditProductModalOpen,
    setIsEditProductModalOpen,
    isVariantsModalOpen,
    setIsVariantsModalOpen,
    isCreateProductModalOpen,
    setIsCreateProductModalOpen,
    isHelpModalOpen,
    setIsHelpModalOpen,
    isDeleteConfirmOpen,
    setIsDeleteConfirmOpen,
    isDeactivateConfirmOpen,
    setIsDeactivateConfirmOpen,
    editingProduct,
    setEditingProduct,
    productToAction,
    setProductToAction,
    newVariantForm,
    setNewVariantForm,
    newProductForm,
    setNewProductForm
  };
}
