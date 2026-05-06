import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from '@/lib/auth';
import { withTracing } from '@/lib/observability';

async function getHandler(_request: NextRequest) {
  // FIX-SEC-005: Remove service discovery endpoint — require auth
  const session = await getServerSession(_request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({ status: 'ok', service: 'costpro-enterprise' });
}

export const GET = withTracing(getHandler, 'GET /api');