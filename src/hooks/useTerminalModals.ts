import { useState, useMemo } from 'react';
import { useTransactionDetails, useUserStoreAccess } from '@/hooks/useQueries';
import { Transaction, Store, Profile } from '@/types';
import { UserContract, mapProfileToContract, UserContractFactory } from '@/contracts/user';

export function useTerminalModals(transactions: Transaction[]) {
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const selectedTransaction = useMemo(() =>
    transactions.find(t => t.id === selectedTransactionId) || null,
    [transactions, selectedTransactionId]
  );
  const { data: transactionItems = [], isLoading: loadingDetails } = useTransactionDetails(selectedTransactionId || undefined);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { data: userStoreAccess = [] } = useUserStoreAccess(selectedUserId || undefined);

  const [isEditStoreModalOpen, setIsEditStoreModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [isCreateStoreModalOpen, setIsCreateStoreModalOpen] = useState(false);
  const [newStore, setNewStore] = useState({ name: '', address: '' });

  const [userFormMode, setUserFormMode] = useState<'create' | 'edit' | null>(null);
  const [selectedUserContract, setSelectedUserContract] = useState<UserContract | null>(null);

  const [isDeleteStoreModalOpen, setIsDeleteStoreModalOpen] = useState(false);
  const [deletingStore, setDeletingStore] = useState<Store | null>(null);

  const handleViewTransactionDetails = (txn: Transaction) => {
    setSelectedTransactionId(txn.id);
  };

  const handleEditUser = (u: Profile) => {
    setSelectedUserContract(mapProfileToContract(u));
    setUserFormMode('edit');
  };

  const handleCreateUser = () => {
    setSelectedUserContract(UserContractFactory.createEmpty());
    setUserFormMode('create');
  };

  return {
    selectedTransactionId,
    setSelectedTransactionId,
    selectedTransaction,
    transactionItems,
    loadingDetails,

    selectedUserId,
    setSelectedUserId,
    userStoreAccess,

    isEditStoreModalOpen,
    setIsEditStoreModalOpen,
    editingStore,
    setEditingStore,

    isCreateStoreModalOpen,
    setIsCreateStoreModalOpen,
    newStore,
    setNewStore,

    userFormMode,
    setUserFormMode,
    selectedUserContract,
    setSelectedUserContract,

    isDeleteStoreModalOpen,
    setIsDeleteStoreModalOpen,
    deletingStore,
    setDeletingStore,

    handleViewTransactionDetails,
    handleEditUser,
    handleCreateUser
  };
}
