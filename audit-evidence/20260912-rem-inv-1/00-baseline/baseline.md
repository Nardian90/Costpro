# REM-INV-1 — 00-baseline

- Fecha de auditoría: 2026-09-12 (UTC)
- Repositorio: Nardian90/Costpro · rama main
- HEAD == origin/main == `493ebc9555c6e10519ac78940f3bfbae7b49d672`
- Worktree: CLEAN · `gate-closure-check.sh` → CLOSURE OK (verificado en clon fresco)
- Next.js ^16.1.1 · React ^19.0.0 · TypeScript ^5 · Vitest ^4.1.5 · @supabase/supabase-js ^2.105.1
- DB live: PostgreSQL 17.6 (Supabase, proyecto wthkddeleylijmonclxg) — acceso READ-ONLY exclusivo (SELECT vía Management API)
- Migraciones en repo: 437 archivos (2024-01-23 → 2026-09-11). REM-SEC-1 (`20260911000000`) y REM-PO-1 (`20260911000100`) presentes.
- Tablas con CREATE TABLE en migraciones: 96. **Tablas base** (products, stores, inventory, stock_movements, transactions, receipts, purchase_orders, kardex_entries, wac_change_log, payment_transactions, business_events, audit_logs, purchase_items, …) **sin DDL en el repo** → fuente: catálogo live (drift repo↔live no verificable estáticamente; hallazgo estructural documentado en 01-schema-map).
- Volúmenes (pg_stat): stock_movements 1,021 · kardex_entries 1,021 · transaction_items 633 · transactions 597 · products 367 · inventory 277 · receipt_items 219 · production_orders 89 · receipts 63 · devolutions 25 · transfers 8.
- Tiendas de producción (§3 intocables): Puerto Padre VITALLCONS (`43a4dabc…`), ENERVIDA-VITALLCONS (`5e6fe821…`), TIENDA CENTRAL COSTPRO (`d1c4ba0e…`).
- Zero-touch: fingerprint económico BEFORE == AFTER (sha256 `489aa0f8fca10f57…`) → PASS.
- Regresión: test:security 134/134 (0 violaciones) · tsc 0 errores · eslint 0 errors/1291 warnings · vitest 2058 passed/0 failed/24 skipped — idénticos al baseline REM-PO-1. Build: INFRASTRUCTURE BLOCKER OOM (ver 16-test-results).
