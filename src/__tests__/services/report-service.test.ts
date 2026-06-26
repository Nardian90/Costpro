import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportService } from '@/services/report-service';
import { supabase } from '@/lib/supabaseClient';
import { fetchReportData, fetchReportDataPaginated } from '@/lib/reports/data-fetcher';

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    })),
  },
}));

vi.mock('@/lib/reports/data-fetcher', () => ({
  fetchReportData: vi.fn(),
  fetchReportDataPaginated: vi.fn(),
}));

describe('reportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getDefinitions fetches data', async () => {
    const mockData = [{ id: '1', store_id: 's1' }];
    const mockFrom = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    };
    (supabase.from as any).mockReturnValue(mockFrom);

    const result = await reportService.getDefinitions('s1');
    expect(result).toEqual(mockData);
  });

  it('saveDefinition upserts data', async () => {
    const mockData = { id: '1', title: 'R1' };
    const mockFrom = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    };
    (supabase.from as any).mockReturnValue(mockFrom);

    const result = await reportService.saveDefinition({ title: 'R1' });
    expect(result).toEqual(mockData);
  });

  it('deleteDefinition deletes data', async () => {
    const mockFrom = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    (supabase.from as any).mockReturnValue(mockFrom);

    await reportService.deleteDefinition('1');
    expect(supabase.from).toHaveBeenCalledWith('report_definitions');
  });

  it('getRuns fetches runs', async () => {
    const mockData = [{ id: 'run1' }];
    const mockFrom = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    };
    (supabase.from as any).mockReturnValue(mockFrom);

    const result = await reportService.getRuns('def1');
    expect(result).toEqual(mockData);
  });

  it('getStoreRuns fetches runs for store', async () => {
    const mockData = [{ id: 'run1' }];
    const mockFrom = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    };
    (supabase.from as any).mockReturnValue(mockFrom);

    const result = await reportService.getStoreRuns('s1');
    expect(result).toEqual(mockData);
  });

  it('logRun inserts run', async () => {
    const mockFrom = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    };
    (supabase.from as any).mockReturnValue(mockFrom);

    await reportService.logRun({
      store_id: 's1',
      executed_by: 'u1',
      parameters_snapshot: {},
      status: 'completed',
    });
    expect(supabase.from).toHaveBeenCalledWith('report_runs');
  });

  it('saveScheduleConfig updates definition', async () => {
    const mockFrom = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    (supabase.from as any).mockReturnValue(mockFrom);

    await reportService.saveScheduleConfig('d1', {
      enabled: true,
      frequency: 'daily',
      time: '09:00',
      active: true,
    });
    expect(supabase.from).toHaveBeenCalledWith('report_definitions');
  });

  it('fetchReportData calls library function', async () => {
    const mockRows = [{ col: 'val' }];
    (fetchReportData as any).mockResolvedValue(mockRows);

    const result = await reportService.fetchReportData('sales', {}, {}, 's1');
    expect(result).toEqual(mockRows);
    expect(fetchReportData).toHaveBeenCalled();
  });

  it('fetchChartData aggregates data', async () => {
    const mockRows = [
      { date: '2023-01-01', total_amount: 100 },
      { date: '2023-01-01', total_amount: 50 },
      { date: '2023-01-02', total_amount: 200 },
    ];
    (fetchReportData as any).mockResolvedValue(mockRows);

    const result = await reportService.fetchChartData('sales', 's1', {});
    expect(result).toEqual([
      { label: '2023-01-01', value: 150 },
      { label: '2023-01-02', value: 200 },
    ]);
  });

  it('fetchReportDataPaginated calls library function', async () => {
    const mockRows = [{ col: 'val' }];
    (fetchReportDataPaginated as any).mockResolvedValue(mockRows);

    const result = await reportService.fetchReportDataPaginated('sales', {}, {}, 's1');
    expect(result).toEqual(mockRows);
    expect(fetchReportDataPaginated).toHaveBeenCalled();
  });
});
