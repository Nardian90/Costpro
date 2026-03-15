# Code Review Request: IPV Improvements

## Summary
1. **Configurable Matching Rules**: Replaced hardcoded parameters in `engine.ts` with values from a new `meta` field in `MatchingRule`. Added a `RuleMetaEditor` component for UI configuration.
2. **Matching Audit & Persistence**: Created a `MatchingLog` table in Dexie to persist matching results. Implemented `MatchingLogService` and a `MatchingAuditView` dashboard to visualize stats and execution history.

## Changes
- `src/lib/dexie.ts`: Added `MatchingLog` interface and updated `MatchingRule`. Incremented DB version to 14.
- `src/lib/ipv/engine.ts`: Integrated logging and used `meta` parameters.
- `src/services/matching-log-service.ts`: Logic for DB persistence and stats calculation.
- `src/components/views/terminal/views/ipv/RuleMetaEditor.tsx`: New component for rule configuration.
- `src/components/views/terminal/views/ipv/MatchingRulesEditor.tsx`: Integration of `RuleMetaEditor`.
- `src/components/views/terminal/views/ipv/MatchingAuditView.tsx`: New audit dashboard.
- `src/components/views/terminal/views/ipv/IPVView.tsx`: Added "Auditoría Matching" tab.

## Verification
- Unit tests for `MatchingEngine` passed.
- Code integrity verified.
- Frontend verification attempted (blocked by authentication, but code structure is correct).
