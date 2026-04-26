import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { calculateMRI, DEFAULT_MRI_DATA } from '@/lib/release_gate/mri-engine';
import { calculateSHI } from '@/lib/observability/health-engine';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (req, session) => {
  try {
    const readJson = (relPath: string) => {
      const fullPath = path.join(/*turbopackIgnore: true*/process.cwd(), relPath);
      if (fs.existsSync(fullPath)) {
        return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      }
      return null;
    };

    const audit = readJson('public/architecture_audit.json');
    const reviewQueue = readJson('docs/automation/review_queue.json');

    const architectureHealth = audit?.healthScore || 9.0;
    const documentationCoverage = audit?.documentationScore || 8.5;
    const testCoverage = audit?.testCoverage || 8.0;
    const securityCompliance = audit?.securityScore || 9.5;

    const mri = calculateMRI(
      architectureHealth,
      documentationCoverage,
      testCoverage,
      securityCompliance,
      DEFAULT_MRI_DATA.hardStops
    );

    const metrics = {
      infrastructureSHI: 95,
      operationsSHI: 90,
      securityGRC: 98,
      marketReadinessMRI: mri.score,
      uptime: 99.99,
      latency_p95: 112,
      cpu_usage: 18,
      memory_usage: 38,
      throughput: 15,
      db_integrity: true,
      sync_status: true,
      active_threats: 0,
      failed_logins_1h: 1
    };

    const shi = calculateSHI(metrics);

    return NextResponse.json({
      shi,
      mri,
      auditAlerts: reviewQueue?.queue?.length || 0,
      lastAudit: audit?.lastAudit || new Date().toISOString().split('T')[0],
      version: '5.8.0',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in system-health API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
});
