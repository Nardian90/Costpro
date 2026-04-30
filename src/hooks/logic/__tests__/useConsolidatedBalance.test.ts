import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useConsolidatedBalance, usePeriodClosure } from '../useConsolidatedBalance';
import { db } from '@/lib/dexie';

describe('useConsolidatedBalance', () => {
  beforeEach(async () => {
    await db.consolidated_accounts.clear();
    await db.period_closures.clear();
    await db.matching_logs.clear();
  });

  it('updates opening balance correctly and logs the change', async () => {
    const period = '2024-01';
    const { result } = renderHook(() => useConsolidatedBalance(period));
    await act(async () => {
      await result.current.updateOpeningBalance(1500);
    });
    await waitFor(() => {
        expect(result.current.account?.openingBalance).toBe(1500);
    });
    const logs = await db.matching_logs.toArray();
    expect(logs).toHaveLength(1);
  });

  it('updates bank balance correctly', async () => {
    const period = '2024-01';
    const { result } = renderHook(() => useConsolidatedBalance(period));
    await act(async () => {
      await result.current.updateBankBalance(3500);
    });
    await waitFor(() => {
        expect(result.current.account?.bankStatementBalance).toBe(3500);
    });
  });
});

describe('usePeriodClosure', () => {
  beforeEach(async () => {
    await db.period_closures.clear();
  });

  it('toggles closure status', async () => {
    const period = '2024-01';
    const { result } = renderHook(() => usePeriodClosure(period));

    expect(result.current.status).toBe('OPEN');

    await act(async () => {
      await result.current.toggleClosure();
    });

    await waitFor(() => expect(result.current.status).toBe('CLOSED'));

    await act(async () => {
      await result.current.toggleClosure();
    });

    await waitFor(() => expect(result.current.status).toBe('OPEN'));
  });
});
