import { db } from '@/lib/dexie';
import { useAuthStore } from '@/store';

export interface AuditAction {
  type: string;
  entity: string;
  before?: any;
  after?: any;
  context?: any;
}

function getCurrentUser(): string {
  try {
    const user = useAuthStore.getState().user;
    return user?.fullName || user?.email || 'SISTEMA';
  } catch (e) {
    return 'SISTEMA';
  }
}

export async function logAction(action: AuditAction) {
  try {
    await db.audit_logs.add({
      timestamp: new Date().toISOString(),
      actor: getCurrentUser(),
      action: action.type,
      entity: action.entity,
      prev_value: action.before,
      new_value: action.after,
      metadata: action.context
    });
  } catch (error) {
    console.error('Error logging audit action:', error);
  }
}

export async function exportAuditLogsJSON() {
  try {
    const logs = await db.audit_logs.toArray();
    const json = JSON.stringify(logs, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting audit logs:', error);
  }
}
