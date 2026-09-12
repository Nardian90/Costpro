# 02 — ACTIVACIÓN P-1 + EFECTIVIDAD RUNTIME (FASES 2-3)

## FASE 2 — Activación por el mecanismo real del proyecto (entorno)

`.env` (NO trackeado; `git ls-files .env*` = `.env.example` únicamente):

```text
NEXT_PUBLIC_USE_V2_CHECKOUT=true
NEXT_PUBLIC_USE_V2_REVERSE=true
ENABLE_DEV_BYPASS=false
NODE_ENV=development
PORT=3000
CSRF_ALLOWED_DOMAINS=.space-z.ai,localhost
```

(Valores de credenciales Supabase/NextAuth NO se reproducen aquí — secreto 0 en evidence.)

**Plataforma (producción deploy):** al desplegar este commit, fijar las mismas 2 variables en Vercel/Platform (build-time para el cliente). El default fail-closed de features.ts garantiza V1-fallback seguro si alguna plataforma carece de las vars.

## FASE 3 — El runtime REALMENTE selecciona V2 (no basta el texto `=true`)

### E1 — Cliente: valor inlinado en el chunk servido por el servidor vivo
`.next/dev/static/chunks/src_02n00jw._.js` (compilado dev del server pm2, Turbopack):

```text
USE_V2_CHECKOUT: ("TURBOPACK compile-time value", "true") === 'true' || false   → evalúa TRUE
USE_V2_REVERSE:  ("TURBOPACK compile-time value", "true") === 'true' || false   → evalúa TRUE
```

### E2 — Cadena CHECKOUT (ruta viva + binding + runtime)
- Estático: `src/app/api/pos/checkout/route.ts:126` → `supabaseAdmin.rpc('create_sale_v2', ...)` (V2 **incondicional** — recálculo server-side, supervisor, auditoría).
- UI: `SalesCatalogView → useSalesCatalog.confirmCheckout → POST /api/pos/checkout` (pin contract test: "useSalesCatalog despacha online a /api/pos/checkout (P-2, path V2 canónico)"). POS clásico: `usePOSCheckout` gated por `shouldUseV2Checkout` (true con flag activa y pilot stores vacío → todas las tiendas).
- Probe vivo (sin mutación): `POST /api/pos/checkout` body inválido → **HTTP 401** (`withAuth` precede a toda operación) — ruta viva y cableada en el proceso pm2.
- Runtime RPC (fixture aislada PG efímero): S-01..S-06 **PASS** (ver 03-checkout-smoke) — create_sale_v2 ejecutado con forma exacta de la ruta.

### E3 — Cadena REVERSE (ruta viva + binding + runtime)
- Estático: `src/app/api/reverse/route.ts:164` → `FEATURES.USE_V2_REVERSE ? RPC_MAP_V2 : RPC_MAP_V1`; `RPC_MAP_V2.receipt → reverse_receipt_v2` (route.ts:47); params exactos route.ts:171-175 (`p_receipt_id, p_reason, p_user_id`).
- Boundary B-10: route.ts:139-142 consulta `can_reverse_document(actor, store, type)` → 403 si false (route.ts:151-158).
- Probe vivo: `POST /api/reverse` sin sesión → **HTTP 401** (auth gate antes de DB; sin mutación posible).
- Runtime RPC (fixture aislada): V-01/V-02 **PASS** + B-01..B-05 (ver 04/05) — reverse_receipt_v2 ejecutado con forma exacta de la ruta.

### E4 — Contract test (12/12 PASS) fija las cadenas completas
`scripts/v2-only-contract-test.cjs`: POS principal gated V2 ✓; sync offline usa create_sale_v2 ✓; SalesCatalog → /api/pos/checkout ✓; useInvertDocument → /api/reverse ✓; /api/reverse y /api/devolutions seleccionan por FEATURES.USE_V2_REVERSE ✓.

**Veredicto FASE 3:** el runtime efectivamente selecciona V2 en ambas cadenas (evidencia E1-E4).

Generado: 2026-09-12T07:20:43Z
