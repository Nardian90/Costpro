import { useState, useCallback } from 'react';
import { db, MonthlyGoal, YearlyGoals, DailyIPVReport, ReconciliationLine } from '@/lib/dexie';
import { toast } from 'sonner';

export function useFinancialPlanning(year: number) {
  const [goals, setGoals] = useState<MonthlyGoal[]>([]);
  const [realData, setRealData] = useState<Map<string, { total: number; efectivo: number; transferencia: number }>>(new Map());

  const initYear = useCallback(async () => {
    try {
      let yearly = await db.yearly_goals.get(year);
      if (!yearly) {
        yearly = {
          year,
          months: Array.from({ length: 12 }, (_, i) => ({
            month: `${year}-${(i + 1).toString().padStart(2, '0')}`,
            goalAmount: 0,
            strategy: 'MIN_STOCK'
          }))
        };
        await db.yearly_goals.add(yearly);
      }
      setGoals(yearly.months);

      // Load real data from IPV reports or reconciliation lines
      const lines = await db.reconciliation_lines.toArray();
      const stats = new Map();

      lines.forEach(l => {
        const month = l.fecha_operacion.substring(0, 7);
        if (!stats.has(month)) stats.set(month, { total: 0, efectivo: 0, transferencia: 0 });
        const s = stats.get(month);
        s.total += l.total_amount_cents;
        s.efectivo += l.cash_amount_cents;
        s.transferencia += l.transfer_amount_cents;
      });

      setRealData(stats);
    } catch (error) {
      console.error(error);
    }
  }, [year]);

  const updateMonthlyGoal = async (month: string, amount: number, strategy: "MIN_STOCK" | "MAX_VALUE") => {
    const yearly = await db.yearly_goals.get(year);
    if (!yearly) return;

    const newMonths = yearly.months.map(m =>
      m.month === month ? { ...m, goalAmount: amount, strategy } : m
    );

    await db.yearly_goals.update(year, { months: newMonths });
    setGoals(newMonths);
  };

  return { goals, realData, initYear, updateMonthlyGoal };
}
