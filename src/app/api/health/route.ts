import { NextResponse } from 'next/server';
import { withTracing } from '@/lib/observability';

export const dynamic = 'force-dynamic';

async function healthHandler() {
  const startTime = Date.now();

  return NextResponse.json({
    status: 'ok',
    service: 'costpro-enterprise',
    timestamp: new Date().toISOString(),
    // FIX-SEC-003: Hide version and uptime in production to reduce info disclosure
    version: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' ? (process.env.npm_package_version || '1.0.0') : undefined,
    uptime: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' ? process.uptime() : undefined,
    responseTime: Date.now() - startTime,
  });
}

export const GET = withTracing(healthHandler, 'GET /api/health');
