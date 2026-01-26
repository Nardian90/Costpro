
'use client'

import React from 'react';
import { usePOSView } from './usePOSView';
import  POSViewComponent from '@/components/views/terminal/POSView';

export default function POSView() {
  const {
    searchTerm,
    setSearchTerm,
    posLayoutMode,
    setPosLayoutMode,
    products,
    isLoadingProducts,
    items,
    handleAddItem,
    removeItem,
    updateQuantity,
    clearCart,
    getTotal,
    getSubtotal,
    getItemCount,
    handleCheckout,
    isProcessingSale,
  } = usePOSView();

  return (
    <POSViewComponent
      products={products}
      isLoading={isLoadingProducts}
      error={null} // Error handling can be added to usePOSView if needed
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      items={items}
      onAddItem={handleAddItem}
      onRemoveItem={removeItem}
      onUpdateQuantity={updateQuantity}
      onClearCart={clearCart}
      getTotal={getTotal}
      getSubtotal={getSubtotal}
      getItemCount={getItemCount}
      isProcessing={isProcessingSale}
      onCheckout={handleCheckout}
      viewMode={posLayoutMode}
      onViewModeChange={setPosLayoutMode}
    />
  );
}
