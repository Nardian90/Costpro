
'use client'

import React from 'react';
import { useAuditLogsView } from './useAuditLogsView';
import AuditLogsViewComponent from '@/components/views/terminal/AuditLogsView';

export default function AuditLogsView() {
  const {
    searchTerm,
    setSearchTerm,
    dateRange,
    setDateRange,
    logs,
    isLoading,
  } = useAuditLogsView();

  if (isLoading) {
    return <div>Cargando registros de auditoría...</div>;
  }

  return (
    <AuditLogsViewComponent
      logs={logs}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
    />
  );
}
