# Fix: Harden Audit Trigger Functions

## Issue
The user reported a `403 (Forbidden)` error and `SET_ACTIVE_STORE_FAILED` when changing the active store. The error message was: `new row violates row-level security policy for table "audit_logs"`.

This occurred because:
1.  Updating the `active_store_id` in the `profiles` table triggers the `audit_profile_changes()` function.
2.  The `audit_profile_changes()` function attempts to `INSERT` into the `audit_logs` table.
3.  The `audit_logs` table has Row Level Security (RLS) enabled and a restrictive policy that prevents direct client-side inserts.
4.  The `audit_profile_changes()` function was NOT defined as `SECURITY DEFINER`, so it ran with the permissions of the authenticated user, which lacks `INSERT` permission on `audit_logs`.

## Solution
I have updated the following audit trigger functions to be `SECURITY DEFINER`:
- `audit_profile_changes()`
- `audit_product_changes()`
- `audit_store_changes()`
- `log_transaction_changes()`
- `audit_store_access_changes()`

By setting them as `SECURITY DEFINER`, they now run with the privileges of the function owner (`postgres`), bypass RLS on `audit_logs`, and can successfully record the audit trail regardless of the user's permissions.

## Verification
I simulated an `authenticated` user updating their own profile `active_store_id` and verified that:
1.  The update succeeds.
2.  A new row is correctly added to the `audit_logs` table.
