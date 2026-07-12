# ── Stage 1: Dependencies ──
# FIX-INF-032: Bun 1.x is actively maintained; pin to specific minor if reproducibility issues arise
FROM oven/bun:1 AS deps
WORKDIR /app
# FIX-DEPLOY (2026-07-10): usar bun.lock (no bun.lockb que no existe)
COPY package.json bun.lock ./
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
# FASE 5: Copy custom server (enables Socket.io for WhatsApp realtime)
COPY --from=builder --chown=nextjs:nodejs /app/server.ts ./server.ts
# FASE 5: socket.io + socket.io-client need to be in production node_modules
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/socket.io ./node_modules/socket.io
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/socket.io-parser ./node_modules/socket.io-parser
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/socket.io-adapter ./node_modules/socket.io-adapter
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/engine.io ./node_modules/engine.io
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@types/socket.io ./node_modules/@types/socket.io
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs

EXPOSE 3000

# Health check (Docker native)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# FASE 5: Custom server attaches Socket.io for WhatsApp realtime.
# Falls back gracefully if Socket.io fails to attach (app still serves HTTP).
CMD ["bun", "server.ts"]
