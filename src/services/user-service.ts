import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';
import { Profile, UserRole } from '@/types';
import { profileSchema } from '@/validation/schemas';
import { validateResponse } from '@/lib/rpc-validator';

export const userService = {
  async setActiveStore(userId: string, storeId: string) {
    logger.info('DATABASE', 'SET_ACTIVE_STORE', { userId, storeId });

    // FIX CRITICAL-001: Validate membership before setting active store
    const { data: membership, error: membershipError } = await supabase
      .from('user_store_memberships')
      .select('id, status, store:stores(id, is_active)')
      .eq('user_id', userId)
      .eq('store_id', storeId)
      .limit(1);

    if (membershipError) {
      logger.error('DATABASE', 'SET_ACTIVE_STORE_MEMBERSHIP_CHECK_FAILED', { userId, storeId, error: membershipError });
      throw new Error('Error al verificar membresía de tienda');
    }

    const membershipRecord = membership?.[0];
    if (!membershipRecord) {
      logger.warn('DATABASE', 'SET_ACTIVE_STORE_NO_MEMBERSHIP', { userId, storeId });
      throw new Error('No tienes acceso a esta tienda. Membresía no encontrada.');
    }

    if (membershipRecord.status !== 'active') {
      logger.warn('DATABASE', 'SET_ACTIVE_STORE_MEMBERSHIP_REVOKED', { userId, storeId });
      throw new Error('Tu membresía a esta tienda ha sido revocada.');
    }

    const storeData = (membershipRecord.store as unknown as Array<{ id: string; is_active: boolean }> | null)?.[0];
    if (storeData && storeData.is_active === false) {
      logger.warn('DATABASE', 'SET_ACTIVE_STORE_INACTIVE', { userId, storeId });
      throw new Error('Esta tienda está desactivada. No se puede seleccionar.');
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ active_store_id: storeId })
      .eq('id', userId);

    if (error) {
      logger.error('DATABASE', 'SET_ACTIVE_STORE_FAILED', { userId, storeId, error });
      throw error;
    }

    return data;
  },

  async logout() {
    logger.info('DATABASE', 'LOGOUT');
    const { error } = await supabase.auth.signOut();
    if (error) {
      logger.error('DATABASE', 'LOGOUT_FAILED', { error });
      throw error;
    }
  },

  async updateAISettings(currentUserId: string, userId: string, provider: string, apiKey: string) {
    if (userId !== currentUserId) {
      throw new Error('No puedes modificar la configuración de otro usuario');
    }
    logger.info('DATABASE', 'UPDATE_AI_SETTINGS', { userId, provider });

    const updates: { ai_provider: string; ai_api_key?: string } = { ai_provider: provider };
    if (apiKey && apiKey.trim().length > 0) {
      updates.ai_api_key = apiKey;
    }

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);

    if (error) {
      logger.error('DATABASE', 'UPDATE_AI_SETTINGS_FAILED', { userId, error });
      throw error;
    }
  },

  /**
   * Obtiene el perfil completo del usuario, resuelve el store activo
   * y determina los roles efectivos basados en la membresía.
   */
  async getUserProfile(userId: string): Promise<Profile | null> {
    // Incluimos tanto 'role' como 'role_id' para compatibilidad con diferentes versiones del esquema
    const profileColumns = 'id, full_name, email, role, role_id, roles, active_store_id, logo_url, is_active, store_id, created_at, ai_provider, ai_api_key';
    const storeColumns = 'id, name, address, logo_url, is_active, created_at';

    // Fetch profiles and memberships separately to avoid "memberships column not found" cache errors
    let result = await supabase
      .from('profiles')
      .select(profileColumns)
      .eq('id', userId)
      .single();

    // Fallback if full column set fails (e.g. migration not fully applied)
    if (result.error && result.error.code === '42703') {
      logger.warn('DATABASE', 'GET_USER_PROFILE_COLUMN_MISSING_FALLBACK', { userId });
      // Versión ultra-minimalista para asegurar el acceso si hay columnas en transición
      result = await supabase
        .from('profiles')
        .select(`id, full_name, email, is_active, store_id, active_store_id, created_at`)
        .eq('id', userId)
        .single();
    }

    const { data: profileDataRaw, error } = result;

    if (error || !profileDataRaw) {
      logger.error('DATABASE', 'GET_USER_PROFILE_FAILED', { userId, error });
      return null;
    }

    // Fetch memberships separately
    // FIX-LOG-009: Proper typed interface instead of any[]
    interface UserMembership {
      store_id: string;
      role: string;
      status?: string;
      [key: string]: unknown;
    }
    let memberships: UserMembership[] = [];
    try {
      // FIX MEDIUM-005: Filter memberships by active status AND active stores server-side
      const { data: membershipsData, error: membershipsError } = await supabase
        .from('user_store_memberships')
        .select(`id, user_id, store_id, role, status, created_at, updated_at, store:stores(${storeColumns})`)
        .eq('user_id', userId)
        .eq('status', 'active');

      if (!membershipsError && membershipsData) {
        // Also filter out memberships with inactive stores (defense in depth)
        memberships = membershipsData.filter(
          (m: { store?: Array<{ is_active: boolean }>; [key: string]: unknown }) => !m.store || m.store[0]?.is_active !== false
        );
      }
    } catch (err) {
      logger.warn('DATABASE', 'GET_USER_PROFILE_MEMBERSHIPS_FAILED_SILENT', { userId, err });
    }

    // Correctly typed object including memberships
    const profileData = {
      ...profileDataRaw,
      // FIX-LOG-010: Warn when role is null instead of silently downgrading
      role: profileDataRaw.role || (() => { console.warn('[UserService] User role is null for', userId, '— defaulting to clerk'); return 'clerk'; })(),
      memberships
    } as Profile;

    if (!profileData.is_active) {
      return null;
    }

    let effectiveActiveStoreId = profileData.active_store_id || profileData.store_id;

    // FIX HIGH-006: AUTO-SELECT STORE - Only consider active memberships with active stores
    if (!effectiveActiveStoreId && profileData.memberships && profileData.memberships.length > 0) {
      const validMemberships = profileData.memberships.filter(
        (m) => m.status === 'active' && (!m.store || (m.store as { is_active?: boolean })?.is_active !== false)
      );
      if (validMemberships.length > 0) {
        effectiveActiveStoreId = validMemberships[0].store_id ?? null;
      }
    }

    let activeRoles: UserRole[] = profileData.roles || [profileData.role];
    if (effectiveActiveStoreId) {
      const { data: membershipRows } = await supabase
        .from('user_store_memberships')
        .select('role')
        .eq('user_id', profileData.id)
        .eq('store_id', effectiveActiveStoreId)
        .limit(1);

      const membershipData = membershipRows?.[0];
      if (membershipData?.role) {
        activeRoles = [membershipData.role as UserRole];
      } else if (profileData.role === 'admin') {
        activeRoles = ['admin'];
      }
    }

    const userData = {
      ...profileData,
      roles: activeRoles,
      active_store_id: effectiveActiveStoreId,
      store_id: effectiveActiveStoreId || profileData.store_id,
    };

    return await validateResponse(userData, profileSchema, 'getUserProfile');
  }
};
