import sys

with open('src/lib/ipv/engine.ts', 'r') as f:
    content = f.read()

# Replace hardcoded fallbacks
content = content.replace(
    'const maxAbs = priceFlexRule.meta?.max_variation_cents || 10;',
    'const maxAbs = priceFlexRule.meta?.max_variation_cents ?? 10;'
)
content = content.replace(
    'const maxPercent = priceFlexRule.meta?.max_variation_percent || 20;',
    'const maxPercent = priceFlexRule.meta?.max_variation_percent ?? 20;'
)
content = content.replace(
    'const toleranceCents = toleranceRule.meta?.tolerance_cents || toleranceRule.tolerancia_cents || 0;',
    'const toleranceCents = toleranceRule.meta?.tolerance_cents ?? toleranceRule.tolerancia_cents ?? 0;'
)
content = content.replace(
    'const dailyLimit = cashFillRule.meta?.daily_limit || Infinity;',
    'const dailyLimit = cashFillRule.meta?.daily_limit ?? Infinity;'
)

# Replace MAX_DEPTH and TIMEOUT_MS in findExactCombination
old_exact_config = """    const MAX_DEPTH = 12;
    const TIMEOUT_MS = 2000;"""
new_exact_config = """    const exactSumRule = this.rules.find(r => r.tipo === 'EXACT_SUM');
    const MAX_DEPTH = exactSumRule?.meta?.max_depth ?? 12;
    const TIMEOUT_MS = exactSumRule?.meta?.timeout_ms ?? 2000;"""
content = content.replace(old_exact_config, new_exact_config)

# Add logging logic in matchTransaction
# First, add startTime at the beginning of matchTransaction
content = content.replace(
    '  async matchTransaction(transaction: BankTransaction, current_reconciled_cents: number = 0): Promise<MatchingResult> {',
    '  async matchTransaction(transaction: BankTransaction, current_reconciled_cents: number = 0): Promise<MatchingResult> {\n    const startTime = Date.now();'
)

# Then, insert logMatchingResult before the final return in matchTransaction
# This is tricky because there are multiple returns. We want the main one at the end of the function.
# The main return in matchTransaction is around line 413.

insertion_marker = """    const resultMovements = [...this.pendingMovements];
    this.pendingMovements = [];

    return {"""

logging_logic = """    const resultMovements = [...this.pendingMovements];
    this.pendingMovements = [];

    const durationMs = Date.now() - startTime;
    const isComplete = Math.abs(remaining_cents) < 0.001;

    // Persist log
    (async () => {
      try {
        const { MatchingLogService } = await import('@/services/matching-log-service');
        await MatchingLogService.logMatchingResult(
          transaction.referencia_origen,
          isComplete ? 'COMPLETO' : (lines.length > 0 ? 'PARCIAL' : 'PENDIENTE'),
          trace,
          appliedRules,
          matchingConfidence,
          failReason,
          lines.length,
          durationMs,
          this.rules.filter(r => r.activo).map(r => r.tipo)
        );
      } catch (error) {
        console.error('Error logging matching result:', error);
      }
    })();

    return {"""

content = content.replace(insertion_marker, logging_logic)

with open('src/lib/ipv/engine.ts', 'w') as f:
    f.write(content)
