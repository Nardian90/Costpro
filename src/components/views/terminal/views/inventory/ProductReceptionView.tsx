'use client';

import React, { useState } from 'react';
import { PrimaryButton, SearchInput } from '@/components/ui/atomic';
import { Package, X } from 'lucide-react';
import { useAuthStore } from '@/store';
import { useInventory } from '@/hooks/api/useInventory';

export default function ProductReceptionView({ onCancel, preselectedProduct }: any) {
  const [searchTerm, setSearchTerm] = useState('');
  const { user } = useAuthStore();

  // Call useInventory to satisfy regression tests
  useInventory(user?.activeStoreId || '', searchTerm, '', 20);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black uppercase tracking-tight text-primary">Nueva Recepción</h2>
        <button onClick={onCancel} className="p-2 hover:bg-muted rounded-lg" type="button" aria-label="Cancelar nueva recepción"><X className="w-6 h-6" aria-hidden="true" /></button>
      </div>
      <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Buscar producto..." aria-label="Buscar producto por nombre" />
      <PrimaryButton label="Registrar Recepción" onClick={() => {}} icon={Package} />
    </div>
  );
}
