import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { withTracing } from '@/lib/observability';
import { withRole, type AuthenticatedSession } from '@/lib/auth-middleware';
import {
  getRetentionPolicies,
  checkRetentionPolicy,
  markPolicyExecuted,
  getExpiredPolicies,
  type RetentionPolicy,
} from '@/lib/data-retention';

// ── Validation ─────────────────────────────────────────

const RetentionRequestSchema = z.object({
  category: z
    .string()
    .optional()
    .describe(
      'Optional: specific category to process. If omitted, all expired policies are processed.'
    ),
});

// ── Helper: Build processed result ─────────────────────

interface ProcessedResult {
  category: string;
  action: RetentionPolicy['action'];
  retentionDays: number;
}

function processPolicy(category: string): ProcessedResult {
  const policies = getRetentionPolicies();
  const policy = policies.find((p) => p.category === category);

  if (!policy) {
    throw new Error(`Unknown retention category: ${category}`);
  }

  // In production, this would execute the actual deletion/anonymization
  // against Supabase/Render. Currently marks the policy as executed.
  markPolicyExecuted(category);

  return {
    category: policy.category,
    action: policy.action,
    retentionDays: policy.retentionDays,
  };
}

// ── Route Handler ──────────────────────────────────────

// FIX-BUG-SEC-001: Replaced manual Bearer check with withRole('admin') for proper auth + RBAC
async function retentionHandler(request: NextRequest, _session: AuthenticatedSession): Promise<Response> {
  // Rate limiting: 30 requests per minute
  const rlResult = await rateLimit('retention-api', {
    windowMs: 60_000,
    maxRequests: 30,
  });

  if (!rlResult.allowed) {
    return NextResponse.json(
      {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        resetAt: rlResult.resetAt.toISOString(),
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rlResult.resetAt.getTime() - Date.now()) / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }



  // Parse request body
  let body: { category?: string };
  try {
    const rawBody = await request.text();
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json(
      {
        error: 'Bad Request',
        message: 'Cuerpo de la solicitud no es JSON válido',
      },
      { status: 400 }
    );
  }

  const parsed = RetentionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Validation Error',
        message: 'Parámetros inválidos',
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const { category } = parsed.data;
  const processed: ProcessedResult[] = [];

  try {
    if (category) {
      // Process specific category
      const check = checkRetentionPolicy(category);
      if (!check.shouldProcess) {
        return NextResponse.json(
          {
            success: true,
            processed: [],
            skipped: [
              {
                category,
                reason: `Policy not yet expired. ${check.daysUntilAction} days remaining.`,
              },
            ],
            timestamp: new Date().toISOString(),
          },
          {
            status: 200,
            headers: { 'X-RateLimit-Remaining': String(rlResult.remaining) },
          }
        );
      }

      const result = processPolicy(category);
      processed.push(result);
    } else {
      // Process all expired policies
      const expired = getExpiredPolicies();
      for (const policy of expired) {
        try {
          const result = processPolicy(policy.category);
          processed.push(result);
        } catch (err) {
          // Log but continue processing remaining policies
          console.error(
            `[retention] Error processing policy ${policy.category}:`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        processed,
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { 'X-RateLimit-Remaining': String(rlResult.remaining) },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      // FIX-SEC-019: Hide error details in production
      {
        error: 'Internal Server Error',
        message: process.env.NODE_ENV !== 'production' ? message : undefined,
      },
      { status: 500 }
    );
  }
}

// ── Export with tracing ────────────────────────────────

export const POST = withTracing(
  withRole('admin', retentionHandler),
  'POST /api/legal/retention'
);
