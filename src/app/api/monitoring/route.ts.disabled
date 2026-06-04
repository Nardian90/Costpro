/**
 * Sentry Tunnel API Route
 *
 * This route acts as a proxy for Sentry events, sending them through the same origin.
 * This avoids ad-blockers and browser extensions that block Sentry's external endpoint.
 *
 * Events are forwarded to Sentry's ingestion endpoint (US region by default).
 * Rate limiting is applied to prevent abuse.
 */

import { NextRequest, NextResponse } from 'next/server';

const SENTRY_HOST = 'o4511340700434432.ingest.us.sentry.io';
const SENTRY_PROJECT_ID = '4511340719964160';

// Simple rate limit per IP (100 events per minute)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW = 60_000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// Cleanup old entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now > entry.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }, 300_000);
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (isRateLimited(ip)) {
      return new NextResponse('Rate limited', { status: 429 });
    }

    // Validate the envelope
    const envelope = await request.text();
    if (!envelope || !envelope.startsWith('{')) {
      return new NextResponse('Invalid envelope', { status: 400 });
    }

    // Construct the Sentry ingestion URL
    const sentryUrl = `https://${SENTRY_HOST}/api/${SENTRY_PROJECT_ID}/envelope/`;

    // Forward the envelope to Sentry
    const response = await fetch(sentryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
      },
      body: envelope,
    });

    if (!response.ok) {
      console.error(`[Sentry Tunnel] Failed to forward: ${response.status} ${response.statusText}`);
    }

    return new NextResponse(null, { status: response.status });
  } catch (error) {
    console.error('[Sentry Tunnel] Error:', error);
    return new NextResponse('Internal error', { status: 500 });
  }
}

// Block all other methods
export async function GET() {
  return new NextResponse('Method not allowed', { status: 405 });
}
