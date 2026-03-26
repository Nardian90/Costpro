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
    return user?.name || user?.email || 'SISTEMA';
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
