/**
 * Market Readiness Index (MRI) Engine v8.0
 * Implements a weighted scoring model across Architecture, Documentation, Testing, and Security.
 */

export interface HardStop {
  id: string;
  name: string;
  passed: boolean;
  critical: boolean;
}

export interface MRIResult {
  score: number;
  status: 'DEVELOPMENT' | 'BETA' | 'PRODUCTION_READY' | 'ENTERPRISE_READY';
  architectureHealth: number;
  documentationCoverage: number;
  testCoverage: number;
  securityCompliance: number;
  hardStops: HardStop[];
  timestamp: string;
}

export function calculateMRI(
  architectureHealth: number,
  documentationCoverage: number,
  testCoverage: number,
  securityCompliance: number,
  hardStops: HardStop[]
): MRIResult {
  const mriScore = (
    architectureHealth * 0.40 +
    documentationCoverage * 0.30 +
    testCoverage * 0.20 +
    securityCompliance * 0.10
  );

  let status: MRIResult['status'] = 'DEVELOPMENT';
  if (mriScore >= 9.0) status = 'ENTERPRISE_READY';
  else if (mriScore >= 8.5) status = 'PRODUCTION_READY';
  else if (mriScore >= 7.0) status = 'BETA';

  return {
    score: Number(mriScore.toFixed(1)),
    status,
    architectureHealth,
    documentationCoverage,
    testCoverage,
    securityCompliance,
    hardStops,
    timestamp: new Date().toISOString(),
  };
}

export const DEFAULT_MRI_DATA: MRIResult = {
  score: 8.8,
  status: 'PRODUCTION_READY',
  architectureHealth: 9.0,
  documentationCoverage: 8.5,
  testCoverage: 8.0,
  securityCompliance: 9.5,
  hardStops: [
    { id: 'vulnerabilities', name: 'VULNERABILIDADES CRÍTICAS', passed: true, critical: true },
    { id: 'rollback', name: 'PLAN DE ROLLBACK', passed: true, critical: true },
    { id: 'coverage', name: 'COBERTURA > 60%', passed: true, critical: true },
    { id: 'backup', name: 'BACKUP VERIFICADO', passed: true, critical: true },
  ],
  timestamp: new Date().toISOString(),
};
