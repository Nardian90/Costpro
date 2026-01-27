import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * Endpoint for receiving and persisting client-side logs in production.
 */
export async function POST(request: Request) {
  try {
    const { context, error } = await request.json();
    const logEntry = `[${new Date().toISOString()}] [${context}] ${JSON.stringify(error)}\n`;

    const filePath = path.join(process.cwd(), 'ERROR_LOGS.md');
    fs.appendFileSync(filePath, logEntry);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
