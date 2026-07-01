import { supabase } from '@/lib/supabaseClient';
import { CashClosure } from '@/types';
import { getSalesSinceLastClosureParamsSchema } from '@/validation/schemas';

export const cashService = {
  async getSalesSinceLastClosure(storeId: string) {
    const params = getSalesSinceLastClosureParamsSchema.parse({ p_store_id: storeId });
    const { data, error } = await supabase.rpc('get_sales_since_last_closure', params);
    if (error) throw error;
    // FIX-LOG-001: Guard against empty/missing RPC result
    if (!data || data.length === 0) {
      return { total_sales: 0, total_cash: 0, total_transfer: 0, last_closure_at: '' };
    }
    return data[0] as {
      total_sales: number;
      total_cash: number;
      total_transfer: number;
      last_closure_at: string;
    };
  },

  async createClosure(closure: Partial<CashClosure>) {
    const { data, error } = await supabase
      .from('cash_closures')
      .insert(closure)
      .select()
      .single();
    if (error) {
      // FIX F3-02: traducir error de UNIQUE constraint a mensaje amigable
      if (error.code === '23505') {
        throw new Error('Ya existe un turno pendiente para esta tienda. Cierra el turno actual antes de abrir uno nuevo.');
      }
      throw error;
    }
    return data as CashClosure;
  },

  async updateClosure(id: string, closure: Partial<CashClosure>) {
    const { data, error } = await supabase
      .from('cash_closures')
      .update(closure)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as CashClosure;
  },

  async getClosures(storeId: string, _isAdmin: boolean = false) {
    // C2: Always scope by storeId — never return unscoped data
    if (!storeId) return [];

    const query = supabase
      .from('cash_closures')
      .select('*, profile:profiles(full_name)')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return data as CashClosure[];
  }
};
