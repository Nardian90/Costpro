# Technical Attack Report — Multi-Tenant Isolation & Logic Penetration

## 1. Attack Report

| Attack Vector | Target Table/Function | Impact | Status | Severity |
| :--- | :--- | :--- | :--- | :--- |
| Cross-tenant SELECT (Direct) | `products`, `stores`, `cost_sheets` | Data Leakage | **BLOCKED** | - |
| Cross-tenant SELECT (Indirect Join) | `products` x `stores` | Data Leakage | **BLOCKED** | - |
| Cross-tenant INSERT | `products` | Data Pollution | **BLOCKED** | - |
| Cross-tenant UPDATE | `products` | Data Corruption | **BLOCKED** | - |
| Role Escalation (DELETE Profile) | `profiles` | Unauthorized Data Removal | **BLOCKED** | - |
| Role Escalation (Admin Creation) | `managed_create_user` | Full System Compromise | **VULNERABLE** | **CRITICAL** |
| Function Identity Bypass | `fn_process_sale` | Fraud / Impersonation | **BLOCKED** | - |
| Anon Enumeration | Root Tables | Metadata Leakage | **BLOCKED** | - |

## 2. Isolation Matrix (REAL)

| Test Case | Result | Status |
| :--- | :--- | :--- |
| Cross-tenant SELECT | PASS | RLS enforces `has_store_access` and `tenant_id` checks correctly. |
| Cross-tenant WRITE | PASS | Policies for INSERT/UPDATE/DELETE prevent unauthorized writes. |
| Role escalation | **FAIL** | Logic in `managed_create_user` allows an 'encargado' to create an 'admin'. |
| Function bypass | PASS | `fn_process_sale` includes strict `auth.uid()` validation. |
| View leakage | PASS | No public views found; base tables are protected. |
| Enumeration | PASS | Anon role is restricted at the schema and RLS level. |

## 3. Vulnerability Map

### [CRITICAL] Role Escalation in `managed_create_user`
- **Description**: The function allows users with the 'encargado' role to create new users with the 'admin' role.
- **Root Cause**: Missing check to ensure that only admins can assign the 'admin' role.
- **Impact**: An 'encargado' user could create a secondary admin account to bypass all tenant and store restrictions.

### [HIGH] Function Overload Inconsistency
- **Description**: Multiple overloads for `managed_create_user` exist with slightly different security checks.
- **Root Cause**: Organic growth of the database schema without centralizing user creation logic.
- **Impact**: Maintenance nightmare and high probability of regression where one overload might be more permissive than another.

### [LOW] Profile SELECT Policy (`profiles_select_v2`)
- **Description**: The policy allows selecting profiles if `is_managed_user(id)` is true.
- **Check**: Verified that `is_managed_user` correctly checks store membership. Currently safe, but complex.

## 4. Remediation Plan (Automatic Fixes)
- Refactor `managed_create_user` to include role hierarchy checks.
- Consolidate overloads into a single, robust function.
- Add explicit `SECURITY DEFINER` path hardening where missing.


## 5. Security Patches Applied
- **Function Consolidation**: Removed multiple overloads of `managed_create_user` to prevent logic drift and bypasses.
- **Role Hierarchy Enforcement**: Patched `managed_create_user` to strictly forbid non-admins from creating admin accounts.
- **Membership Validation**: Added `public.has_store_access` checks within `managed_create_user` for both store assignment and membership management.
- **Store Creation Hardening**: Updated `managed_create_store` to explicitly verify the requester's role before processing.
- **Path Hardening**: Ensured all `SECURITY DEFINER` functions have an explicit `SET search_path`.
