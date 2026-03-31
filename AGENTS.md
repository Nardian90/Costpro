# CostPro Development & Deployment Rules

## Deployment (Render)
- **Runtime:** `bun`
- **Build Command:** `bun install && bun x prisma generate && bun run build`
- **Start Command:** `bun .next/standalone/server.js`
- **Environment:**
  - `NODE_ENV=production`
  - Ensure `DATABASE_URL` is configured for Prisma.
  - Supabase variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are mandatory.

## Testing
- Use `bun test` for general unit tests.
- Use `vitest` for the IpV module (src/lib/ipv/__tests__) to support Dexie/vi mocking correctly.

## Repository Standards
- Always run `bun run build` before submitting changes to catch build-time regressions.
- All documentation artifacts must be registered in `public/_meta/`.
