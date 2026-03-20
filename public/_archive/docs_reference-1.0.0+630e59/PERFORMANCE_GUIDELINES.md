# Performance Guidelines & Data Access Budget (Over-Fetching Zero)

This document outlines the executive rules for maintaining high performance and optimal data access in the CostPro system.

## 1. Data Access Layer (DAL) Rules

### Explicit Selects
- **Rule:** Never use `select('*')`.
- **Reason:** Reduces payload size, network latency, and database CPU usage.
- **Action:** Always list only the columns required for the specific view or component.

### Isolated Hooks
- **Rule:** Every major domain/view should have its own data fetching hook file (e.g., `useTransactions.ts`).
- **Reason:** Prevents circular dependencies, improves maintainability, and allows for view-specific optimizations.

### RPC vs. Table Queries
- **Rule:** Use RPCs for complex operations (joins, aggregations, pagination) and Table Queries for simple CRUD.
- **Action:** Ensure RPCs are also selective in the columns they return.

## 2. Caching Strategy

### Stale Time
- **Static Data:** (Stores, User Profiles) `staleTime: 5 * 60 * 1000` (5 minutes).
- **Operational Data:** (Products, Transactions) `staleTime: 30 * 1000` (30 seconds).
- **Audit/Logs:** `staleTime: 60 * 1000` (1 minute).

### Invalidation
- **Rule:** Use granular invalidation.
- **Action:** When a mutation occurs, invalidate only the specific query keys related to the change (e.g., `['products', storeId]`) instead of global keys.

## 3. Performance Budget

| Metric | Target | Maximum |
|--------|--------|---------|
| Initial Page Load (LCP) | < 1.5s | 2.5s |
| View Transition Time | < 200ms | 500ms |
| Data Payload (List) | < 50KB | 200KB |
| Queries per View | < 3 | 5 |

## 4. Progressive Loading & UX

### Skeletons
- Every view must provide a `Skeleton` component that mirrors the actual layout during initial load.
- Use `StateRenderer` to manage loading, error, and empty states consistently.

### Smart Prefetching
- Prefetch critical data on user intent (e.g., `onMouseEnter` on sidebar items).
- Prefetch essential context data (Products, Dashboard) upon terminal initialization.

---

*Note: This document is part of the system's maturity model. Regressions against these rules must be documented and justified.*
