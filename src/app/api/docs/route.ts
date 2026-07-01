import { NextRequest, NextResponse } from 'next/server';
import { createOpenAPISpec } from '@/lib/api-docs/openapi-spec';
import { withTracing } from '@/lib/observability';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/docs — Returns the OpenAPI 3.0.3 specification as JSON.
 *
 * This endpoint dynamically generates the spec by importing Zod schemas
 * and converting them to JSON Schema format.
 *
 * Available at: GET /api/docs
 * Content-Type: application/json
 */
async function getHandler(_request: NextRequest) {
  // FIX-SEC-004: Restrict API docs to authenticated users
  const session = await getServerSession(_request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const spec = createOpenAPISpec();

    return new NextResponse(JSON.stringify(spec, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('[API DOCS] Error generating spec:', error);
    return NextResponse.json(
      { error: 'Failed to generate OpenAPI specification' },
      { status: 500 },
    );
  }
}

export const GET = withTracing(getHandler, 'GET /api/docs');
