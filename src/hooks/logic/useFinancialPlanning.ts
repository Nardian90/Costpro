import { useLiveQuery } from 'dexie-react-hooks';
import { db, type YearlyGoals, type MonthlyGoal } from '@/lib/dexie';

export interface MonthlyRealData {
  total: number;
  efectivo: number;
  transferencia: number;
}

export const useFinancialPlanning = (year: number) => {
  const yearlyGoals = useLiveQuery(
    () => db.yearly_goals.where('year').equals(year).first(),
    [year]
  );

  const realData = useLiveQuery(
    async () => {
      const yearStr = year.toString();
      const lines = await db.reconciliation_lines
        .where('fecha_operacion')
        .startsWith(yearStr)
        .toArray();

      const stats = new Map<string, MonthlyRealData>();

      // Initialize all months
      for (let i = 1; i <= 12; i++) {
        const monthKey = `${yearStr}-${String(i).padStart(2, '0')}`;
        stats.set(monthKey, { total: 0, efectivo: 0, transferencia: 0 });
      }

      lines.forEach(line => {
        const monthKey = line.fecha_operacion.substring(0, 7);
        if (stats.has(monthKey)) {
          const current = stats.get(monthKey)!;
          const amount = (line.importe_linea_cents || 0);

          current.total += amount;
          if (line.clasificacion === 'Efectivo') {
            current.efectivo += amount;
          } else {
            current.transferencia += amount;
          }
        }
      });

      return stats;
    },
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
    realData: realData || new Map<string, MonthlyRealData>(),
    initYear,
    updateMonthlyGoal
  };
};
