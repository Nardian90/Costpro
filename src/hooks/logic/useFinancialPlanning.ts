import { useLiveQuery } from 'dexie-react-hooks';
import { db, type YearlyGoals, type MonthlyGoal } from '@/lib/dexie';

export const useFinancialPlanning = (year: number) => {
  const yearlyGoals = useLiveQuery(
    () => db.yearly_goals.where('year').equals(year).first(),
    [year]
  );

  const initYear = async () => {
    if (yearlyGoals) return;

    const months: MonthlyGoal[] = Array.from({ length: 12 }, (_, i) => {
      const month = `${year}-${String(i + 1).padStart(2, "0")}`;
      return {
        month,
        goalAmount: 0,
        strategy: "MIN_STOCK"
      };
    });

    // Use put to avoid constraint errors
    await db.yearly_goals.put({ year, months });
  };

  const updateMonthlyGoal = async (month: string, amount: number, strategy?: "MIN_STOCK" | "MAX_VALUE") => {
    if (!yearlyGoals) return;

    const updatedMonths = yearlyGoals.months.map(m =>
      m.month === month ? { ...m, goalAmount: amount, strategy: strategy || m.strategy } : m
    );

    await db.yearly_goals.update(yearlyGoals.year, { months: updatedMonths });
  };

  return {
    goals: yearlyGoals?.months || [],
    initYear,
    updateMonthlyGoal
  };
};
