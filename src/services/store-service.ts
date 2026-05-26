import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { Store } from '@/types';

export const storeService = {
  async getStores() {
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      logger.error('DATABASE', 'GET_STORES_FAILED', { error });
      throw error;
    }

    return data as Store[];
  },

  async createStore(userRole: string, name: string, address: string, createdBy?: string, maxStoresLimit?: number) {
    if (!['admin', 'manager', 'encargado'].includes(userRole)) {
      throw new Error('No tienes permisos para realizar esta operación');
    }
    logger.info('DATABASE', 'CREATE_STORE', { name, address, createdBy });

    // LOW-002: Enforce max stores limit before creating
    if (maxStoresLimit !== undefined) {
      const { count, error: countError } = await supabase
        .from('stores')
        .select('id', { count: 'exact', head: true });

      if (countError) {
        logger.error('DATABASE', 'COUNT_STORES_FAILED', { error: countError });
        throw countError;
      }

      if (count !== null && count >= maxStoresLimit) {
        const err = new Error(`Se ha alcanzado el límite de ${maxStoresLimit} tiendas permitidas por tu plan.`);
        logger.warn('DATABASE', 'STORE_LIMIT_REACHED', { count, maxStoresLimit });
        throw err;
      }
    }

    const { data, error } = await supabase
      .from('stores')
      .insert({
        name,
        address,
        created_by: createdBy,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      logger.error('DATABASE', 'CREATE_STORE_FAILED', { error });
      throw error;
    }

    return data as Store;
  },

  async updateStore(userRole: string, storeId: string, name: string, address: string, additionalData?: Partial<Store>) {
    if (!['admin', 'manager', 'encargado'].includes(userRole)) {
      throw new Error('No tienes permisos para realizar esta operación');
    }
    logger.info('DATABASE', 'UPDATE_STORE', { storeId, name, address });
    const { data, error } = await supabase
      .from('stores')
      .update({ name, address, ...additionalData })
      .eq('id', storeId)
      .select()
      .single();

    if (error) {
      logger.error('DATABASE', 'UPDATE_STORE_FAILED', { storeId, error });
      throw error;
    }

    return data as Store;
  },

  async deleteStore(userRole: string, storeId: string) {
    if (!['admin', 'manager', 'encargado'].includes(userRole)) {
      throw new Error('No tienes permisos para realizar esta operación');
    }
    logger.info('DATABASE', 'DELETE_STORE (SOFT)', { storeId });

    // FIX HIGH-003: Warn about dependent data before soft-delete
    try {
      const [txResult, ccResult, trResult] = await Promise.all([
        supabase.from('sales').select('id', { count: 'exact', head: true }).eq('store_id', storeId),
        supabase.from('cash_closures').select('id', { count: 'exact', head: true }).eq('store_id', storeId),
        supabase.from('transfers').select('id', { count: 'exact', head: true }).eq('store_id', storeId),
      ]);
      const txCount = txResult.count ?? 0;
      const ccCount = ccResult.count ?? 0;
      const trCount = trResult.count ?? 0;
      if (txCount > 0 || ccCount > 0 || trCount > 0) {
        console.warn(
          `[deleteStore] Store ${storeId} has dependent data — transactions: ${txCount}, cash_closures: ${ccCount}, transfers: ${trCount}. Proceeding with soft-delete as admin requested.`
        );
      }
    } catch (warnErr) {
      logger.warn('DATABASE', 'DELETE_STORE_DEPENDENCY_CHECK_FAILED', { storeId, error: warnErr });
    }

    // FIX HIGH-003: Use soft-delete instead of hard delete
    const { error } = await supabase
      .from('stores')
      .update({ is_active: false })
      .eq('id', storeId);

    if (error) {
      logger.error('DATABASE', 'SOFT_DELETE_STORE_FAILED', { storeId, error });
      throw error;
    }

    // FIX MEDIUM-007: Clean up references — revoke memberships and clear active_store_id
    try {
      // Revoke all memberships for this store
      await supabase
        .from('user_store_memberships')
        .update({ status: 'revoked' })
        .eq('store_id', storeId);

      // Clear active_store_id for users who had this store as active
      await supabase
        .from('profiles')
        .update({ active_store_id: null })
        .eq('active_store_id', storeId);

      logger.info('DATABASE', 'SOFT_DELETE_CLEANUP_COMPLETED', { storeId });
    } catch (cleanupError: any) {
      logger.error('DATABASE', 'SOFT_DELETE_CLEANUP_FAILED', { storeId, error: cleanupError });
      // Non-blocking: store is already deactivated
    }
  },

  async resetStore(userRole: string, storeId: string) {
    if (!['admin', 'manager', 'encargado'].includes(userRole)) {
      throw new Error('No tienes permisos para realizar esta operación');
    }
    logger.info('DATABASE', 'RESET_STORE_INITIATED', { storeId });

    // FIX MEDIUM-004: Notify active users of the store before resetting
    try {
      const { data: activeSessions } = await supabase
        .from('user_store_memberships')
        .select('user_id, profiles!inner(full_name, email)')
        .eq('store_id', storeId)
        .eq('status', 'active');

      if (activeSessions && activeSessions.length > 0) {
        // Insert store notification records for all active members
        const notifications = activeSessions.map((m: any) => ({
          user_id: m.user_id,
          store_id: storeId,
          type: 'store_reset_warning',
          title: 'Reinicio de Tienda Programado',
          message: `La tienda está siendo reiniciada. Todos los datos de ventas, inventario y movimientos serán eliminados. Por favor guarda tu trabajo y recarga la página.`,
          is_read: false,
        }));

        const { error: notifError } = await supabase
          .from('store_notifications')
          .insert(notifications);

        if (notifError) {
          logger.warn('DATABASE', 'RESET_NOTIFICATION_FAILED', { storeId, error: notifError });
          // Non-blocking: proceed with reset even if notifications fail
        } else {
          logger.info('DATABASE', 'RESET_NOTIFICATIONS_SENT', { storeId, count: activeSessions.length });
        }
      }
    } catch (notifErr: any) {
      logger.warn('DATABASE', 'RESET_NOTIFICATION_EXCEPTION', { storeId, error: notifErr });
      // Non-blocking: proceed with reset
    }

    // FIX-BUG-SEC-008: Await audit log insert to catch failures instead of fire-and-forget
    try {
      const { error: auditError } = await supabase.from('audit_logs').insert({
        action: 'store_reset_initiated',
        table_name: 'stores',
        record_id: storeId,
        store_id: storeId,
        metadata: {
          initiated_at: new Date().toISOString(),
          warning: 'Full store data reset initiated by admin — all historical data will be deleted'
        }
      });
      if (auditError) logger.error('DATABASE', 'RESET_AUDIT_SNAPSHOT_FAILED', { storeId, error: auditError });
    } catch (auditErr) {
      logger.error('DATABASE', 'RESET_AUDIT_SNAPSHOT_EXCEPTION', { storeId, error: auditErr });
    }

    // Ejecutar el reset
    const { error } = await supabase.rpc('reset_store_data', {
      target_store_id: storeId
    });

    if (error) {
      logger.error('DATABASE', 'RESET_STORE_FAILED', { storeId, error });
      throw error;
    }

    // FIX-BUG-SEC-008: Await audit log insert to catch failures instead of fire-and-forget
    try {
      const { error: auditError } = await supabase.from('audit_logs').insert({
        action: 'store_reset_completed',
        table_name: 'stores',
        record_id: storeId,
        store_id: storeId,
        metadata: { completed_at: new Date().toISOString() }
      });
      if (auditError) logger.error('DATABASE', 'RESET_AUDIT_COMPLETE_FAILED', { storeId, error: auditError });
    } catch (auditErr) {
      logger.error('DATABASE', 'RESET_AUDIT_COMPLETE_EXCEPTION', { storeId, error: auditErr });
    }
  }
};
