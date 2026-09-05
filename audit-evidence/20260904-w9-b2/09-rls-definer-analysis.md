════════════════════════════════════════════════════════════════════
W9.5 — B-2 · 09-rls-definer-analysis.md
GATE 10 — ¿SECURITY DEFINER permite saltarse RLS? Análisis y alcance
════════════════════════════════════════════════════════════════════

## Cadena de privilegios

caller (authenticated/anon — PostgREST verifica JWT y ACL EXECUTE)
  ↓
void_transaction  — SECURITY DEFINER, owner=postgres, search_path=pg_catalog,public
  ↓ (dentro de la fn, current_user = postgres = OWNER de las tablas)
tables: transactions (SELECT FOR UPDATE / UPDATE), transaction_items (SELECT),
        product_variants (SELECT), audit_logs (INSERT), stock_movements+inventory+
        products (vía register_stock_movement, también SECURITY DEFINER)
  ↓
RLS: owner de tabla NO aplica sus policies (salvo FORCE ROW LEVEL SECURITY)

## Estado LIVE (pg_class / pg_policies — 12 tablas tocadas directa o indirectamente)

tabla                    | owner     | RLS   | FORCE | policies
transactions             | postgres  | true  | false | 7
transaction_items        | postgres  | true  | false | 2
payment_transactions     | postgres  | true  | false | 5
stock_movements          | postgres  | true  | TRUE  | 6
kardex_entries           | postgres  | true  | false | 3
inventory                | postgres  | true  | false | 5
products                 | postgres  | true  | false | 8
product_variants         | postgres  | true  | false | 5
audit_logs               | postgres  | true  | false | 3
user_store_memberships   | postgres  | true  | false | 4
profiles                 | postgres  | true  | false | 4
stores                   | postgres  | true  | false | 8

## Conclusión técnica

1. SÍ — SECURITY DEFINER BYPASSA RLS en 11/12 tablas (owner=postgres sin FORCE).
   En stock_movements (FORCE=true) el owner SÍ queda sujeto a policies, y los
   probes demuestran que los INSERTs del definer prosperan (P1: +1 movement) ⇒
   las policies de stock_movements contemplan al definer (operatividad probada).
2. Este bypass NO es una debilidad de void_transaction: es el patrón de TODA la
   familia void/reverse (reverse_transaction_v2, reverse_receipt_v2,
   void_inventory_adjustment, void_pending_reception, …) y es NECESARIO: la fn
   debe leer memberships/transacciones sin depender de las policies del caller y
   debe escribir audit/stock de forma atómica.
3. El bypass NO otorga nada al cliente: el cliente solo llega a la función; lo
   que la función hace EN SU NOMBRE queda delimitado por la autorización interna
   (auth.uid() + has_store_access_as), auditada en 03/05/06/07/08.
4. El lock (FOR UPDATE) tampoco convierte el bypass en vector: solo serializa la
   fila objetivo (H5-B3 ya lo probó con sesiones concurrentes reales).
5. search_path endurecido ('pg_catalog','public') — sin riesgo de hijacking de
   auth.uid()/has_store_access_as vía pg_temp (patrón fijado en commits 033e05d9
   y 2f7af7db, verificados en proconfig).

## Riesgo residual (registrado, fuera de alcance)

Si en el futuro se añade lógica a void_transaction/has_store_access_as sin
mantener la verificación de membresía, el definer operaría sin red de RLS.
Sugerencia de defensa en profundidad (BACKLOG, no ejecutada): policy FORCE en
audit_logs/stock_movements ya existente es el patrón a replicar en las tablas
críticas de mutación.
