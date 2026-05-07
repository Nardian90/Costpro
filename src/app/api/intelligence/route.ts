import { NextRequest, NextResponse } from 'next/server';
import { withRole } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const handler = withRole('admin', async (req: NextRequest) => {
    // BUG-032: Restrict architecture details to development
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({
            healthSummary: {
                timestamp: new Date().toISOString(),
                status: 'STABLE',
                message: 'Información de arquitectura restringida en producción.'
            }
        });
    }

    const readJson = (relPath: string) => {
        try {
            const fullPath = path.join(process.cwd(), relPath);
            if (!fs.existsSync(fullPath)) return null;
            return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        } catch {
            return null;
        }
    };

    const data = {
        audit: readJson('docs/architecture_audit.json'),
        metrics: readJson('knowledge/architecture/architecture_metrics.json'),
        graph: readJson('knowledge/architecture/architecture_graph.json'),
        system: readJson('knowledge/architecture/system_architecture.json')
    };

    return NextResponse.json(data);
});

export const GET = withTracing(handler, 'GET /api/intelligence');
