# Audit & Remediation Evidence Package

This package contains the findings, artifacts, and remediation tools from the Technical Audit of the Commercial Flow.

## Contents
- `AUDIT_REPORT.md`: Initial audit findings.
- `REMEDIATION_REPORT.md`: Final remediation report with 10/10 certification.
- `scripts/stress_remediation.js`: A k6 script to simulate concurrent transactions on the hardened system.
- `scripts/reconcile_inventory.sql`: SQL script to detect discrepancies.
- `scripts/idempotency_test.sh`: Shell script to validate idempotency.

## How to Apply Remediation
Execute the content of `supabase/migrations/20260324_total_remediation.sql` in your Supabase SQL Editor.

## How to Verify
Execute the content of `supabase/remediation_verification.sql` to run automated unit tests for RBAC, WAC, and Idempotency.
