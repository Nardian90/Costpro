import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportService } from '../report-service';
import { supabase } from '@/lib/supabaseClient';

const createMockQueryBuilder = (config: { data?: any, error?: any, count?: number | null } = {}) => {
  const builder = {
    select: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation(function(this: any, callback: any) {
      const result = {
        data: config.data,
        error: config.error,
        count: config.count !== undefined ? config.count : (Array.isArray(config.data) ? config.data.length : (config.data ? 1 : 0))
      };
      if (callback) return Promise.resolve(result).then(callback);
      return Promise.resolve(result);
    }),
  };
  return builder;
};

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}));

describe('reportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('obtiene definiciones de reportes', async () => {
    const mockData = [{ id: '1', store_id: 's1' }];
    vi.mocked(supabase.from).mockReturnValue(createMockQueryBuilder({ data: mockData }) as any);

    const result = await reportService.getDefinitions('s1');
    expect(result).toEqual(mockData);
  });

  it('guarda una definición de reporte', async () => {
    const mockData = { id: '1', name: 'R1' };
    vi.mocked(supabase.from).mockReturnValue(createMockQueryBuilder({ data: mockData }) as any);

    const result = await reportService.saveDefinition({ name: 'R1' });
    expect(result).toEqual(mockData);
  });

  it('obtiene ejecuciones (runs) de reportes', async () => {
    const mockData = [{ id: 'run1' }];
    vi.mocked(supabase.from).mockReturnValue(createMockQueryBuilder({ data: mockData }) as any);

    const result = await reportService.getRuns('def1');
    expect(result).toEqual(mockData);
  });

  describe('fetchReportData', () => {
    const storeId = 's1';
    const dateRange = { from: '2023-01-01', to: '2023-01-31' };

    it('obtiene datos de ventas (rpc)', async () => {
      const mockData = [{ id: 't1' }];
      vi.mocked(supabase.rpc).mockResolvedValue({ data: mockData, error: null } as any);

      const result = await reportService.fetchReportData('sales', {}, dateRange, storeId);
      expect(result).toEqual(mockData);
      expect(supabase.rpc).toHaveBeenCalledWith('get_transactions', expect.any(Object));
    });

    it('obtiene datos de inventario (rpc)', async () => {
      const mockData = [{ id: 'p1' }];
      vi.mocked(supabase.rpc).mockResolvedValue({ data: mockData, error: null } as any);

      const result = await reportService.fetchReportData('inventory', { category: 'cat1' }, dateRange, storeId);
      expect(result).toEqual(mockData);
      expect(supabase.rpc).toHaveBeenCalledWith('get_paginated_products', expect.objectContaining({ p_category: 'cat1' }));
    });

    it('obtiene datos de kardex (rpc)', async () => {
        const mockData = [{ id: 'k1' }];
        vi.mocked(supabase.rpc).mockResolvedValue({ data: mockData, error: null } as any);

        const result = await reportService.fetchReportData('kardex', { product_id: 'p1' }, dateRange, storeId);
        expect(result).toEqual(mockData);
        expect(supabase.rpc).toHaveBeenCalledWith('get_product_stock_ledger_paginated', expect.any(Object));
      });

    it('obtiene datos de compras (table)', async () => {
      const mockData = [{ id: 'rec1' }];
      vi.mocked(supabase.from).mockReturnValue(createMockQueryBuilder({ data: mockData }) as any);

      const result = await reportService.fetchReportData('purchases', {}, dateRange, storeId);
      expect(result).toEqual(mockData);
      expect(supabase.from).toHaveBeenCalledWith('receipts');
    });

    it('obtiene datos de auditoría (rpc)', async () => {
        const mockData = [{ id: 'a1' }];
        vi.mocked(supabase.rpc).mockResolvedValue({ data: mockData, error: null } as any);

        const result = await reportService.fetchReportData('audit', {}, dateRange, storeId);
        expect(result).toEqual(mockData);
        expect(supabase.rpc).toHaveBeenCalledWith('get_audit_logs', expect.any(Object));
    });

    it('obtiene datos de utilidad (rpc)', async () => {
        const mockData = [{ id: 'pr1' }];
        vi.mocked(supabase.rpc).mockResolvedValue({ data: mockData, error: null } as any);

        const result = await reportService.fetchReportData('profit', {}, dateRange, storeId);
        expect(result).toEqual(mockData);
        expect(supabase.rpc).toHaveBeenCalledWith('get_profit_report', expect.any(Object));
    });

    it('obtiene ingresos diarios (rpc)', async () => {
        const mockData = [{ date: '2023-01-01', total_income: 100 }];
        vi.mocked(supabase.rpc).mockResolvedValue({ data: mockData, error: null } as any);

        const result = await reportService.fetchReportData('daily_income', {}, dateRange, storeId);
        expect(result).toEqual(mockData);
        expect(supabase.rpc).toHaveBeenCalledWith('get_daily_income_aggregated', expect.any(Object));
    });

    it('obtiene gastos diarios (rpc)', async () => {
        const mockData = [{ date: '2023-01-01', total_expenses: 50 }];
        vi.mocked(supabase.rpc).mockResolvedValue({ data: mockData, error: null } as any);

        const result = await reportService.fetchReportData('daily_expenses', {}, dateRange, storeId);
        expect(result).toEqual(mockData);
        expect(supabase.rpc).toHaveBeenCalledWith('get_daily_expenses_aggregated', expect.any(Object));
    });

    it('obtiene transferencias (rpc)', async () => {
        const mockData = [{ id: 'tr1' }];
        vi.mocked(supabase.rpc).mockResolvedValue({ data: mockData, error: null } as any);

        const result = await reportService.fetchReportData('transfer', {}, dateRange, storeId);
        expect(result).toEqual(mockData);
        expect(supabase.rpc).toHaveBeenCalledWith('get_transfers', expect.any(Object));
    });

    it('obtiene cierres de caja (rpc)', async () => {
        const mockData = [{ id: 'c1' }];
        vi.mocked(supabase.rpc).mockResolvedValue({ data: mockData, error: null } as any);

        const result = await reportService.fetchReportData('cash', {}, dateRange, storeId);
        expect(result).toEqual(mockData);
        expect(supabase.rpc).toHaveBeenCalledWith('get_cash_closures', expect.any(Object));
    });

    it('lanza error para tipo no soportado', async () => {
      await expect(reportService.fetchReportData('invalid' as any, {}, {}, 's1')).rejects.toThrow('no soportado');
    });

    it('respeta el límite de resultados', async () => {
      const mockData = [1, 2, 3, 4, 5].map(i => ({ id: i }));
      vi.mocked(supabase.rpc).mockResolvedValue({ data: mockData, error: null } as any);

      const result = await reportService.fetchReportData('sales', {}, {}, 's1', 2);
      expect(result).toHaveLength(2);
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });
  });
});
