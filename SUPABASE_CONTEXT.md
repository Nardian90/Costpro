# Supabase Context for CostPro Audit System

This document provides a comprehensive overview of the Supabase backend configuration, with a specific focus on the systems and data structures that support the application's audit trail functionality.

## 1. Core Data Structures

The database schema is designed to support a multi-store POS and inventory management system. The key tables relevant to the audit and operational history are:

-   **`public.audit_logs`**: This is the central table for recording all significant system events. It captures the who, what, and when of an action, including:
    -   `user_id`: The user who performed the action.
    -   `table_name`: The database table that was affected.
    -   `record_id`: The specific record that was changed.
    -   `action`: A descriptive string for the event (e.g., `INSERT`, `UPDATE_STATUS`, `VOID`).
    -   `old_data` / `new_data`: JSONB fields that store the state of the data before and after the change, providing a complete history.

-   **`public.business_events`**: A secondary logging table that captures higher-level business process events that may not correspond to a single database record change, such as `user_account_created` or `low_stock_alert`.

-   **`public.stock_movements`**: A detailed ledger (Kardex) that tracks every change in inventory for each product in every store. This table is the source of truth for all stock calculations and history.

-   **`public.transactions`**: Records all sales, including details about the seller, store, payment method, and total amount. Changes to transaction status (e.g., `completed`, `voided`) are a key source of audit events.

-   **`public.profiles`** and **`public.user_store_memberships`**: These tables manage user identity, roles, and access permissions. Changes to these tables (e.g., role change, store assignment) are critical security events that are logged in the audit trail.

## 2. Key Functions & Business Logic (RPC)

The application logic is heavily encapsulated within PostgreSQL functions, which are exposed via the Supabase RPC interface. This centralizes business rules and ensures data integrity.

-   **Audit Triggers**: The primary mechanism for generating audit logs is through trigger functions.
    -   `audit_profile_changes()`: Automatically logs changes to a user's role or active store.
    -   `log_transaction_changes()`: Logs status updates for transactions (e.g., when a sale is voided).
    -   These triggers are attached to their respective tables (`profiles`, `transactions`) and fire automatically on data modification.

-   **Business Logic Functions**: Many functions contain explicit `INSERT` statements into the `audit_logs` or `business_events` tables after performing their primary operation.
    -   `fn_process_sale()`: After creating a sale, it logs a corresponding audit event.
    -   `fn_void_receipt()`: Logs the voiding of a product receipt.
    -   `admin_create_user_account()`: Creates a `user_account_created` business event.

-   **Data Integrity Functions**:
    -   `fn_sync_inventory_on_movement()`: A trigger function on `stock_movements` that ensures the main `inventory` table is always up-to-date.
    -   `prevent_direct_inventory_modification()`: A crucial security trigger that blocks any direct `UPDATE` to the `inventory` table, forcing all changes to go through the audited `stock_movements` ledger.

## 3. Row-Level Security (RLS)

RLS is used extensively to enforce strict data access control and ensure that users can only see the data they are authorized to.

-   **`audit_logs` Table Policies**:
    -   **SELECT**: Access is highly restricted. Only users with the role of `admin`, `manager`, or `encargado` are permitted to view the audit logs. This is enforced by the `Allow admins, managers and encargados to read audit logs` policy.
    -   **INSERT/UPDATE/DELETE**: Direct modification of the audit logs is denied for all users. Logs can only be created by the system itself (i.e., through the trigger functions running with elevated privileges), which ensures the integrity and immutability of the audit trail.

-   **Store-Level Isolation**: Most other tables (`transactions`, `products`, `inventory`, etc.) have RLS policies that restrict access based on the user's `active_store_id` or their memberships in the `user_store_memberships` table. This ensures that a manager or clerk from one store cannot view or modify the data of another store.

-   **Role-Based Access**: Functions like `is_admin()` and `has_role()` are used within RLS policies to create a clear hierarchy of permissions, from clerks up to system administrators.

## 4. Summary of Audit Trail Implementation

The audit system is robust and follows best practices:

1.  **Immutable Ledger**: The `audit_logs` table is treated as an append-only log. RLS policies prevent any user from tampering with historical records.
2.  **Automated & Explicit Logging**: The combination of automated triggers for common events and explicit logging within business functions provides comprehensive coverage of critical system operations.
3.  **Centralized Control**: By embedding logic within PostgreSQL functions and triggers, the database acts as the single source of truth for both data and security, reducing the risk of client-side bypasses.
4.  **Secure by Default**: RLS ensures that sensitive audit data is only accessible to authorized administrative personnel.
