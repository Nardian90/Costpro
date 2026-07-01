# ── Stage 1: Dependencies ──
# FIX-INF-032: Bun 1.x is actively maintained; pin to specific minor if reproducibility issues arise
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production=false

# ── Stage 2: Build ──
FROM oven/bun:1 AS builder
# FIX-INF-032: Bun 1.x is actively maintained; pin to specific minor if reproducibility issues arise
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN bun run build

# ── Stage 3: Production ──
FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user for security (CIS Docker Benchmark 4.1)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# Health check (Docker native)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["bun", "server.js"]
