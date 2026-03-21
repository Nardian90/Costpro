import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ConsolidatedAccount, type PeriodClosure } from '@/lib/dexie';
import { v4 as uuidv4 } from 'uuid';

export const useConsolidatedBalance = (period: string) => {
  const account = useLiveQuery(
    () => db.consolidated_accounts.where('period').equals(period).first(),
    [period]
  );

  const closure = useLiveQuery(
    () => db.period_closures.where('period').equals(period).first(),
    [period]
  );

  const isClosed = closure?.status === 'CLOSED';

  const updateOpeningBalance = async (newBalance: number) => {
    if (isClosed) {
      throw new Error("Cannot update opening balance of a closed period.");
    }

    const previousValue = account?.openingBalance ?? 0;

    if (account?.id) {
      await db.consolidated_accounts.update(account.id, {
        openingBalance: newBalance,
        updatedAt: new Date().toISOString()
      });
    } else {
      await db.consolidated_accounts.add({
        accountId: 'main',
        period,
        openingBalance: newBalance,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    // Audit Log
    await db.matching_logs.add({
      id: uuidv4(),
      type: "AUDIT",
      event_type: "OPENING_BALANCE_UPDATED",
      payload: {
        accountId: 'main',
        period,
        previousValue,
        newValue: newBalance
      },
      created_at: new Date().toISOString()
    });
  };

  const updateBankBalance = async (bankBalance: number) => {
     if (account?.id) {
      await db.consolidated_accounts.update(account.id, {
        bankStatementBalance: bankBalance,
        updatedAt: new Date().toISOString()
      });
    } else {
       await db.consolidated_accounts.add({
        accountId: 'main',
        period,
        openingBalance: 0,
        bankStatementBalance: bankBalance,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }

  return {
    account,
    isClosed,
    updateOpeningBalance,
    updateBankBalance
  };
};

export const usePeriodClosure = (period: string) => {
  const closure = useLiveQuery(
    () => db.period_closures.where('period').equals(period).first(),
    [period]
  );

  const toggleClosure = async () => {
    if (closure?.id) {
      await db.period_closures.update(closure.id, {
        status: closure.status === 'CLOSED' ? 'OPEN' : 'CLOSED',
        closedAt: closure.status === 'OPEN' ? new Date().toISOString() : undefined
      });
    } else {
      await db.period_closures.add({
        period,
        status: 'CLOSED',
        closedAt: new Date().toISOString()
      });
    }
  };

  return {
    status: closure?.status || 'OPEN',
    toggleClosure
  };
};
