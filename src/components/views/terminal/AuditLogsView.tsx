'use client';

import React, { useState, useMemo } from 'react';
import type { AuditLog } from '@/types';
import AuditFilters from './audit/AuditFilters';
import AuditTimeline from './audit/AuditTimeline';
import { AuditCategory, getAuditCategory } from './audit/AuditEventIcon';

interface AuditLogsViewProps {
  logs: AuditLog[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
  dateRange: { from: string; to: string };
  onDateRangeChange: (range: { from: string; to: string }) => void;
}

export default function AuditLogsView({
  logs,
  searchTerm,
  onSearchChange,
  dateRange,
  onDateRangeChange
}: AuditLogsViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<AuditCategory | 'all'>('all');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [selectedStore, setSelectedStore] = useState<string>('all');

  const { availableUsers, availableStores } = useMemo(() => {
    const users = new Set<string>();
    const stores = new Set<string>();
    logs.forEach(log => {
      if (log.profile?.full_name) users.add(log.profile.full_name);
      const sName = log.metadata?.store_name || log.new_data?.store_name || log.old_data?.store_name;
      if (sName) stores.add(sName);
    });
    return {
      availableUsers: Array.from(users).sort(),
      availableStores: Array.from(stores).sort()
    };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Search term filter
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm ||
        log.table_name.toLowerCase().includes(searchLower) ||
        log.action.toLowerCase().includes(searchLower) ||
        log.profile?.full_name?.toLowerCase().includes(searchLower) ||
        JSON.stringify(log.new_data).toLowerCase().includes(searchLower) ||
        JSON.stringify(log.old_data).toLowerCase().includes(searchLower);

      // Category filter
      const category = getAuditCategory(log.table_name, log.action);
      const matchesCategory = selectedCategory === 'all' || category === selectedCategory;

      // User filter
      const matchesUser = selectedUser === 'all' || log.profile?.full_name === selectedUser;

      // Store filter
      const sName = log.metadata?.store_name || log.new_data?.store_name || log.old_data?.store_name;
      const matchesStore = selectedStore === 'all' || sName === selectedStore;

      // Date filter
      const logDate = new Date(log.created_at);
      const matchesDateFrom = !dateRange.from || logDate >= new Date(dateRange.from);
      const matchesDateTo = !dateRange.to || logDate <= new Date(dateRange.to + 'T23:59:59');

      return matchesSearch && matchesCategory && matchesUser && matchesStore && matchesDateFrom && matchesDateTo;
    });
  }, [logs, searchTerm, selectedCategory, selectedUser, selectedStore, dateRange]);

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-1">
        <h2 className="text-4xl font-black text-foreground tracking-tight uppercase italic">Auditoría</h2>
        <p className="text-sm text-muted-foreground font-medium">Historial operativo y de control del sistema</p>
      </div>

      <AuditFilters
        searchTerm={searchTerm}
        onSearchChange={onSearchChange}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        availableUsers={availableUsers}
        selectedUser={selectedUser}
        onUserChange={setSelectedUser}
        availableStores={availableStores}
        selectedStore={selectedStore}
        onStoreChange={setSelectedStore}
      />

      <div className="mt-8">
        <AuditTimeline logs={filteredLogs} />
      </div>
    </div>
  );
}
