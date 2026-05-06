import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { withTracing } from '@/lib/observability';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';

// ── Zod schema for request body ──
const incidentSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title must be at most 200 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(5000, 'Description must be at most 5000 characters'),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  reporter: z.string().max(100, 'Reporter name must be at most 100 characters').optional(),
});

type Severity = 'critical' | 'high' | 'medium' | 'low';

// ── Types ──
interface IncidentRecord {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  reporter?: string;
  status: 'open';
  timestamp: string;
  actionsTaken: string[];
  resolution: string | null;
  timeline: Array<{ event: string; timestamp: string }>;
}

interface IncidentFile {
  incidents: IncidentRecord[];
  metadata: {
    created: string;
    description: string;
  };
}

// ── Helpers ──
function generateIncidentId(): string {
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  // FIX-BUG-SEC-006: Use cryptographically secure randomUUID instead of Math.random
  const random = randomUUID().slice(0, 8).toUpperCase();
  return `INC-${dateStr}-${random}`;
}

const INCIDENTS_FILE_PATH = path.join(process.cwd(), 'data', 'incidents.json');

async function readIncidentsFile(): Promise<IncidentFile> {
  try {
    const raw = await fs.readFile(INCIDENTS_FILE_PATH, 'utf-8');
    return JSON.parse(raw) as IncidentFile;
  } catch {
    // If file doesn't exist or is corrupt, return empty structure
    return {
      incidents: [],
      metadata: {
        created: new Date().toISOString(),
        description: 'Security incident log for CostPro Enterprise',
      },
    };
  }
}

async function writeIncidentsFile(data: IncidentFile): Promise<void> {
  await fs.mkdir(path.dirname(INCIDENTS_FILE_PATH), { recursive: true });
  await fs.writeFile(INCIDENTS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// ── POST handler ──
async function postHandler(request: NextRequest) {
  // Rate limiting: 5 requests per minute, identified by IP
  // FIX-SEC-014: TODO — Rate limit by user ID after auth is added (currently IP-only)
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
  const rlResult = await rateLimit(`incidents:${clientIp}`, {
    windowMs: 60_000,
    maxRequests: 5,
  });

  if (!rlResult.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((rlResult.resetAt.getTime() - Date.now()) / 1000),
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

  // Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body. Expected a valid JSON object.' },
      { status: 400 }
    );
  }

  const parseResult = incidentSchema.safeParse(body);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    return NextResponse.json(
      { success: false, error: 'Validation failed', details: errors },
      { status: 400 }
    );
  }

  const data = parseResult.data;
  const incidentId = generateIncidentId();
  const timestamp = new Date().toISOString();

  const incident: IncidentRecord = {
    id: incidentId,
    title: data.title,
    description: data.description,
    severity: data.severity,
    reporter: data.reporter,
    status: 'open',
    timestamp,
    actionsTaken: ['Incident reported via API endpoint'],
    resolution: null,
    timeline: [
      {
        event: 'Incident created via /api/legal/incidents',
        timestamp,
      },
    ],
  };

  // Store in JSON file
  try {
    const file = await readIncidentsFile();
    file.incidents.push(incident);
    await writeIncidentsFile(file);
  } catch (error) {
    console.error('[INCIDENTS] Failed to write incident to file:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error. Could not store incident.' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      incidentId,
      timestamp,
    },
    {
      status: 201,
      headers: {
        'X-RateLimit-Remaining': String(rlResult.remaining),
      },
    }
  );
}

export const POST = withTracing(postHandler, 'POST /api/legal/incidents');
