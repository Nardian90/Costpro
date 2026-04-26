import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * Endpoint for receiving and persisting client-side logs in production.
 */
const handler = withAuth(async (req, session) => {
  try {
    const { context, error } = await req.json();
    const logEntry = `[${new Date().toISOString()}] [${context}] ${JSON.stringify(error)}\n`;

    try {
      const filePath = path.join(/*turbopackIgnore: true*/process.cwd(), 'docs/logs/ERROR_LOGS.md');
      fs.appendFileSync(filePath, logEntry);
    } catch (fsError) {
      console.error('[API LOGS] Failed to write to file (expected in some serverless envs):', fsError);
      console.error(logEntry);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API LOGS CRITICAL ERROR]', err);
    // NEVER return 500 to avoid blocking the client flow
    return NextResponse.json({ success: false, error: 'Silently ignored' }, { status: 200 });
  }
});

export async function POST(req: NextRequest) {
  return handler(req);
}
