import { usageService } from '@/services/usage-service';
import { UserContract } from '@/contracts/user';

export async function checkActionLimit(user: UserContract | null, action: 'fc_create' | 'fc_export' | 'fc_import'): Promise<{ allowed: boolean }> {
  if (!user) return { allowed: true }; // Should not happen in terminal

  const { allowed } = await usageService.checkQuota(user.id, action, user.plan, user.role);
  return { allowed };
}

export async function recordActionUsage(user: UserContract | null, action: 'fc_create' | 'fc_export' | 'fc_import') {
  if (!user) return;
  await usageService.trackUsage(user.id, action, user.plan, user.role);
}
