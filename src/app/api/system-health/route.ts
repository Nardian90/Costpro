import { NextResponse } from 'next/server';
import { calculateMRI, DEFAULT_MRI_DATA } from '@/lib/release_gate/mri-engine';
import { calculateSHI, MOCK_SYSTEM_HEALTH_V2 } from '@/lib/observability/health-engine';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const mriResult = DEFAULT_MRI_DATA;
  const shiResult = calculateSHI({
    ...MOCK_SYSTEM_HEALTH_V2,
    mri_score: mriResult.score,
    hard_stops_active: mriResult.hardStops.filter(hs => hs.critical && !hs.passed).length
  });

  return NextResponse.json({
    shi: shiResult,
    mri: mriResult,
    timestamp: new Date().toISOString(),
    version: '5.7.25',
    environment: 'enterprise-ready',
  });
}
