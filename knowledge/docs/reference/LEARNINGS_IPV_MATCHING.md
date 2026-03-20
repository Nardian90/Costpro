# Learnings - IPV Matching System v8.0

## Copiloto Inteligente Logic
- The 'Copiloto Inteligente' setting overrides user-defined rules with `DEFAULT_MATCHING_RULES` in the matching engine.
- This logic must be applied at the entry point of matching (both batch and single-transaction).
- `IPVView.tsx` handles the high-level coordination and worker messaging.

## Initialization Strategy
- Using `useEffect` with `useLiveQuery` to check for empty tables ensures data consistency when the app is first loaded.
- `db.matching_rules.bulkPut(DEFAULT_MATCHING_RULES)` is the standard way to reset/initialize the engine rules.
