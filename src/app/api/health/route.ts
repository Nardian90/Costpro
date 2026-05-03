import { NextResponse } from 'next/server';
import { withTracing } from '@/lib/observability';

export const dynamic = 'force-dynamic';

async function healthHandler() {
  const startTime = Date.now();

  return NextResponse.json({
    status: 'ok',
    service: 'costpro-enterprise',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    responseTime: Date.now() - startTime,
  });
}

export const GET = withTracing(healthHandler, 'GET /api/health');
