'use client';
import { SyncStatusBadge } from '@/components/ui/SyncStatusBadge';
import { SyncConflictModal } from '@/components/modals/SyncConflictModal';
export default function TestSyncPage() {
  return (
    <div className="p-20 space-y-10">
      <h1 className="text-3xl font-bold">Sync Component Test</h1>
      <div className="flex gap-4 items-center">
        <span>Status Badge:</span>
        <SyncStatusBadge />
      </div>
      <SyncConflictModal />
    </div>
  );
}
