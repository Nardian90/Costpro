import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from '@/lib/rate-limit';
import { withTracing } from '@/lib/observability';

async function getHandler(_request: NextRequest) {
  const clientId = 'anonymous';
  const { allowed } = await rateLimit(clientId);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  return NextResponse.json({ message: "Hello, world!" });
}

export const GET = withTracing(getHandler, 'GET /api');