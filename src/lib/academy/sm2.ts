export interface SM2Result {
  ease_factor: number;
  interval_days: number;
  repetitions: number;
}

export function calculateSM2(
  quality: number, // 0-5
  previous_ease_factor: number = 2.5,
  previous_interval_days: number = 1,
  previous_repetitions: number = 0
): SM2Result {
  let ease_factor = previous_ease_factor;
  let interval_days = previous_interval_days;
  let repetitions = previous_repetitions;

  // EF = EF + (0.1 − (5 − q) × (0.08 + (5 − q) × 0.02))
  // The formula in the doc: EF = EF + (0.1 − (5 − q) × (0.08 + (5 − q) × 0.02))
  ease_factor = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  // Standard SM-2 keeps EF >= 1.3
  if (ease_factor < 1.3) ease_factor = 1.3;

  if (quality < 3) {
    repetitions = 0;
    interval_days = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) {
      interval_days = 1;
    } else if (repetitions === 2) {
      interval_days = 6;
    } else {
      interval_days = Math.round(interval_days * ease_factor);
    }
  }

  return {
    ease_factor,
    interval_days,
    repetitions,
  };
}
