/**
 * Custom Server — Fase 5 Realtime
 *
 * Wraps Next.js standalone server with Socket.io attached to the same HTTP
 * server. Used in production (Dockerfile: `bun server.js`).
 *
 * Why a custom server?
 *   - Next.js App Router doesn't expose its HTTP server, so we can't attach
 *     Socket.io directly via instrumentation.
 *   - The Dockerfile already calls `bun server.js` (the Next.js standalone
 *     output). We replace that with this file, which:
 *       1. Creates an HTTP server
 *       2. Attaches Socket.io (realtime-server.ts)
 *       3. Delegates all non-socket requests to Next.js handler
 *
 * Dev mode: `npm run dev` uses `next dev` which doesn't support custom
 * servers in Turbopack. For realtime testing in dev, use `npm run dev:ws`.
 *
 * IMPORTANT: This file is NOT transpiled by Next.js. It runs directly in
 * Node.js / Bun, so use only CommonJS-compatible patterns or Bun's ESM
 * support. We use dynamic imports to access the Next.js handler.
 */

import { createServer } from 'http';
import { parse } from 'url';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const HOSTNAME = process.env.HOSTNAME || '0.0.0.0';

async function main() {
  // Import Next.js handler from the standalone build output.
  // In dev mode (npm run dev:ws), we use next() factory instead.
  const isDev = process.env.NODE_ENV !== 'production';

  let nextRequestHandler: (req: any, res: any) => Promise<void> | void;

  if (isDev) {
    // Dev mode: use next() factory
    const next = (await import('next')).default;
    const app = next({ dev: true, hostname: HOSTNAME, port: PORT });
    await app.prepare();
    nextRequestHandler = app.getRequestHandler();
  } else {
    // Production: use standalone server.js that Next.js built
    // The standalone output expects to be at /server.js — we're at /server.ts
    // so we need to load the Next.js handler via the standalone entrypoint.
    // The standalone build places the handler at .next/standalone/server.js
    // but we replace it with this file. To get the handler, we import the
    // internal Next.js request handler.
    const next = (await import('next')).default;
    const app = next({ dev: false, hostname: HOSTNAME, port: PORT });
    await app.prepare();
    nextRequestHandler = app.getRequestHandler();
  }

  // Create HTTP server
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url || '', true);
    // Let Next.js handle all non-socket requests
    // Next.js handler accepts (req, res, parsedUrl?) in runtime, but the
    // TypeScript signature in some Next versions only declares (req, res).
    // Cast to avoid the type mismatch.
    (nextRequestHandler as any)(req, res, parsedUrl);
  });

  // Attach Socket.io
  try {
    // Dynamic import to avoid bundling issues
    const realtimeModule = await import('./src/lib/whatsapp/realtime-server');
    realtimeModule.attachRealtimeServer(httpServer);
    console.log('[server] Socket.io attached to /api/whatsapp/socket.io');
  } catch (err: any) {
    console.error('[server] Failed to attach Socket.io:', err.message);
    // Don't crash — app still works without realtime (polling fallback)
  }

  httpServer.listen(PORT, HOSTNAME, () => {
    console.log(`[server] Ready on http://${HOSTNAME}:${PORT} (env: ${process.env.NODE_ENV || 'development'})`);
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`[server] ${signal} received, shutting down...`);
    httpServer.close(() => {
      console.log('[server] HTTP server closed');
      process.exit(0);
    });
    // Force exit after 10s if graceful shutdown fails
    setTimeout(() => {
      console.error('[server] Forced shutdown after timeout');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[server] Fatal error:', err);
  process.exit(1);
});
