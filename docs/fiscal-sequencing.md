# Fiscal Document Sequencing — Gaps Policy

## Overview

CostPro uses `next_document_number` RPC to generate sequential document numbers per store, document type, and year. The sequence is managed via `document_sequences` table with `SELECT FOR UPDATE` + `UPDATE ... RETURNING` for atomicity.

## Gap Policy

**Gaps in the numbering are expected and accepted.** Numbers are NOT reused.

### How gaps occur

When a transaction that consumed a document number does ROLLBACK (e.g., `create_sale_v2` calls `next_document_number` and gets `FAC-000005-2026`, but then fails validation of stock → the entire transaction rolls back → the number 5 is consumed in `document_sequences` but no `transactions` row is created with that number → the next sale gets `FAC-000006-2026`).

### Why gaps are acceptable

- **Fiscal regulations in most jurisdictions (including Cuba ONAT)** accept gaps in sequential numbering as long as they are documented and justified.
- **International standards** (IFRS, GAAP) also accept gaps when caused by system errors or failed transactions.
- **Reusing numbers** would be a far more serious violation — it would create duplicate documents and break audit trails.

### Justification for auditors

In case of a fiscal audit, gaps are justified with:
1. The `document_sequences` table shows the last number consumed (which may be higher than the last number in `transactions`).
2. The `audit_logs` table shows failed `CREATE_SALE_V2` attempts that consumed numbers but did not persist transactions.
3. The difference between `document_sequences.last_number` and `COUNT(transactions WHERE invoice_number IS NOT NULL)` represents the number of failed attempts.

## Document Types

| Type | Prefix | Format | Example |
|------|--------|--------|---------|
| `invoice` | FAC | `FAC-NNNNNN-YYYY` | FAC-000001-2026 |
| `credit_note` | NC | `NC-NNNNNN-YYYY` | NC-000001-2026 |
| `quotation` | COT | `COT-NNNNNN-YYYY` | COT-000001-2026 |
| `z_report` | ZR | `ZR-NNNNNN-YYYY` | ZR-000001-2026 |

## Historical Data

Transactions created before the fiscal iteration (190 existing) have `invoice_number = NULL`. These are accepted as historical data without fiscal numbering. Only new transactions receive sequential numbers.

Devolutions created before the fiscal iteration (25 existing) have `devolution_number` in the old format `DEV-YYYY-NNNNNN` (epoch-based). These are accepted as historical data.
