import { Pick3Result } from '@/types/pick3';

// Mock generating 90 days of Miami Pick 3 results (Midday & Evening)
export function generateSeedData(): Pick3Result[] {
  const results: Pick3Result[] = [];
  const today = new Date();

  for (let i = 90; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    // Midday
    results.push({
      date: dateStr,
      draw_time: 'midday',
      result: [
        Math.floor(Math.random() * 10),
        Math.floor(Math.random() * 10),
        Math.floor(Math.random() * 10)
      ] as [number, number, number]
    });

    // Evening
    results.push({
      date: dateStr,
      draw_time: 'evening',
      result: [
        Math.floor(Math.random() * 10),
        Math.floor(Math.random() * 10),
        Math.floor(Math.random() * 10)
      ] as [number, number, number]
    });
  }

  return results;
}

export const MIAMI_PICK3_HISTORICAL: Pick3Result[] = generateSeedData();
