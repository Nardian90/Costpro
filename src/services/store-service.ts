import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { Store } from '@/types';

// QUAL-001: Single source of truth for store mutation roles
const STORE_MUTATION_ROLES = ['admin', 'manager', 'encargado'] as const;

export const storeService = {
  /**
   * @deprecated Use useStores() hook instead — this method is kept only for
   * server-side contexts where hooks are unavailable.
   */
  async getStores(): Promise<Store[]> {
    const { data, error } = await supabase
      .from('stores')
      .select('id, name, address, logo_url, reeup, bank_account, phone, email, is_active, slug, plantilla, created_at')
      .eq('is_active', true)
      .order('name');

    if (error) {
      logger.error('DATABASE', 'GET_STORES_FAILED', { error });
      throw error;
    }

    return data as Store[];
  },

  async createStore(
    userRole: string,
    name: string,
    address: string,
    createdBy?: string,
    maxStoresLimit?: number,
    additionalData?: Partial<Store>
  ): Promise<Store> {
    if (!STORE_MUTATION_ROLES.includes(userRole as typeof STORE_MUTATION_ROLES[number])) {
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

    // Whitelist extra fields for create (same as updateStore)
    const whitelistedData: Partial<Store> = {};
    if (additionalData) {
      if (additionalData.logo_url !== undefined && additionalData.logo_url !== '') whitelistedData.logo_url = additionalData.logo_url;
      if (additionalData.reeup !== undefined && additionalData.reeup !== '') whitelistedData.reeup = additionalData.reeup;
      if (additionalData.bank_account !== undefined && additionalData.bank_account !== '') whitelistedData.bank_account = additionalData.bank_account;
      if (additionalData.phone !== undefined && additionalData.phone !== '') whitelistedData.phone = additionalData.phone;
      if (additionalData.email !== undefined && additionalData.email !== '') whitelistedData.email = additionalData.email;
      if (additionalData.slug !== undefined && additionalData.slug !== '') whitelistedData.slug = additionalData.slug;
      if (additionalData.plantilla !== undefined) whitelistedData.plantilla = additionalData.plantilla;
    }

    const { data, error } = await supabase
      .from('stores')
      .insert({
        name,
        address,
        created_by: createdBy,
        is_active: true,
        ...whitelistedData
      })
      .select()
      .single();

    if (error) {
      logger.error('DATABASE', 'CREATE_STORE_FAILED', { error });
      throw error;
    }

    return data as Store;
  },

  async updateStore(
    userRole: string,
    storeId: string,
    name: string,
    address: string,
    additionalData?: Partial<Store>
  ): Promise<Store> {
    if (!STORE_MUTATION_ROLES.includes(userRole as typeof STORE_MUTATION_ROLES[number])) {
      throw new Error('No tienes permisos para realizar esta operación');
    }
    logger.info('DATABASE', 'UPDATE_STORE', { storeId, name, address });

    // FIX BAJO-002: Whitelist allowed fields in additionalData to prevent CWE-915
    const whitelistedData: Partial<Store> = {};
    if (additionalData) {
      if (additionalData.is_active !== undefined) whitelistedData.is_active = additionalData.is_active;
      if (additionalData.logo_url !== undefined) whitelistedData.logo_url = additionalData.logo_url;
      if (additionalData.reeup !== undefined) whitelistedData.reeup = additionalData.reeup;
      if (additionalData.bank_account !== undefined) whitelistedData.bank_account = additionalData.bank_account;
      if (additionalData.phone !== undefined) whitelistedData.phone = additionalData.phone;
      if (additionalData.email !== undefined) whitelistedData.email = additionalData.email;
      if (additionalData.slug !== undefined) whitelistedData.slug = additionalData.slug;
      if (additionalData.plantilla !== undefined) whitelistedData.plantilla = additionalData.plantilla;
    }

    const { data, error } = await supabase
      .from('stores')
      .update({ name, address, ...whitelistedData })
      .eq('id', storeId)
      .select()
      .single();

    if (error) {
      logger.error('DATABASE', 'UPDATE_STORE_FAILED', { storeId, error });
      throw error;
    }

    return data as Store;
  },

  async deleteStore(userRole: string, storeId: string): Promise<void> {
    if (!STORE_MUTATION_ROLES.includes(userRole as typeof STORE_MUTATION_ROLES[number])) {
      throw new Error('No tienes permisos para realizar esta operación');
    }
    logger.info('DATABASE', 'DELETE_STORE (SOFT)', { storeId });

    // FIX HIGH-003: Warn about dependent data before soft-delete (silent count check)
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
        logger.warn('DATABASE', 'DELETE_STORE_DEPENDENT_DATA', {
          storeId,
          transactions: txCount,
          cashClosures: ccCount,
          transfers: trCount,
        });
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
      await supabase
        .from('user_store_memberships')
        .update({ status: 'revoked' })
        .eq('store_id', storeId);

      await supabase
        .from('profiles')
        .update({ active_store_id: null })
        .eq('active_store_id', storeId);

      logger.info('DATABASE', 'SOFT_DELETE_CLEANUP_COMPLETED', { storeId });
    } catch (cleanupError: unknown) {
      logger.error('DATABASE', 'SOFT_DELETE_CLEANUP_FAILED', { storeId, error: cleanupError });
    }
  },

  async resetStore(userRole: string, storeId: string): Promise<void> {
    if (!STORE_MUTATION_ROLES.includes(userRole as typeof STORE_MUTATION_ROLES[number])) {
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
        const notifications = activeSessions.map((m: { user_id: string }) => ({
          user_id: m.user_id,
          store_id: storeId,
          type: 'store_reset_warning',
          title: 'Reinicio de Tienda Programado',
          message: 'La tienda está siendo reiniciada. Todos los datos de ventas, inventario y movimientos serán eliminados. Por favor guarda tu trabajo y recarga la página.',
          is_read: false,
        }));

        const { error: notifError } = await supabase
          .from('store_notifications')
          .insert(notifications);

        if (notifError) {
          logger.warn('DATABASE', 'RESET_NOTIFICATION_FAILED', { storeId, error: notifError });
        } else {
          logger.info('DATABASE', 'RESET_NOTIFICATIONS_SENT', { storeId, count: activeSessions.length });
        }
      }
    } catch (notifErr: unknown) {
      logger.warn('DATABASE', 'RESET_NOTIFICATION_EXCEPTION', { storeId, error: notifErr });
    }

    // Audit log: reset initiated
    try {
      await supabase.from('audit_logs').insert({
        action: 'store_reset_initiated',
        table_name: 'stores',
        record_id: storeId,
        store_id: storeId,
        metadata: {
          initiated_at: new Date().toISOString(),
          warning: 'Full store data reset initiated by admin — all historical data will be deleted'
        }
      });
    } catch (auditErr: unknown) {
      logger.error('DATABASE', 'RESET_AUDIT_SNAPSHOT_FAILED', { storeId, error: auditErr });
    }

    // Ejecutar el reset via RPC
    const { error } = await supabase.rpc('reset_store_data', {
      target_store_id: storeId
    });

    if (error) {
      logger.error('DATABASE', 'RESET_STORE_FAILED', { storeId, error });
      throw error;
    }

    // Audit log: reset completed
    try {
      await supabase.from('audit_logs').insert({
        action: 'store_reset_completed',
        table_name: 'stores',
        record_id: storeId,
        store_id: storeId,
        metadata: { completed_at: new Date().toISOString() }
      });
    } catch (auditErr: unknown) {
      logger.error('DATABASE', 'RESET_AUDIT_COMPLETE_FAILED', { storeId, error: auditErr });
    }
  },

  async updateStorefront(userRole: string, storeId: string, data: { slug?: string; plantilla?: string }): Promise<Store> {
    if (!STORE_MUTATION_ROLES.includes(userRole as typeof STORE_MUTATION_ROLES[number])) {
      throw new Error('No tienes permisos para realizar esta operación');
    }
    logger.info('DATABASE', 'UPDATE_STOREFRONT', { storeId, ...data });

    const updateData: Record<string, any> = {};
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.plantilla !== undefined) updateData.plantilla = data.plantilla;

    const { data: store, error } = await supabase
      .from('stores')
      .update(updateData)
      .eq('id', storeId)
      .select('id, name, slug, plantilla, logo_url')
      .single();

    if (error) {
      logger.error('DATABASE', 'UPDATE_STOREFRONT_FAILED', { storeId, error });
      throw error;
    }

    return store as Store;
  },
};
