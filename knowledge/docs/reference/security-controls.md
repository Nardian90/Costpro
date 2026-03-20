# AI Security Controls

## Authentication & Authorization
- **RBAC**: Every AI tool has an `allowedRoles` list. `executeTool` rejects any action not permitted for the user's role.
- **Store Isolation**: All database queries are strictly scoped to the user's `store_id`.

## Resilience
- **Iteration Limits**: Maximum 5 tool-calling loops per request to prevent infinite cycles.
- **Size Limits**: Input messages capped at 10,000 characters.
- **Retries**: Exponential backoff for LLM provider failures.

## Injection Prevention
- **SQL Sanitization**: Search queries automatically escape wildcard characters (`%`, `_`).
- **Parameter Validation**: All tool arguments are validated against Zod schemas before execution.

## Idempotency
- **Form Submission**: Prevents duplicate submissions of identical data within a 30-second window using audit log checks.
