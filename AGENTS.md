# Pick 3 Module Standards (v9.0)

## UI/UX
- All technical terms must have a `Tooltip` providing a layperson's explanation.
- The "Hero Card" is the primary entry point for users, showing exactly WHAT to play and HOW MUCH to bet.
- The "Guía de Usuario" tab is the source of truth for strategy documentation.

## Engine Logic
- Every prediction MUST include a `strategyLabel` to maintain transparency.
- The `BacktestEngine` must track `winningStrategy` during simulations to allow users to verify model performance.

## Testing
- Use `bun test` for rapid verification of `lottery.math.ts` and `backtest.engine.ts`.
