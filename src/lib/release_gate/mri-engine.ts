/**
 * Market Readiness Index (MRI) Engine
 * Implements a 1-10 scoring model across a domain-weighted framework.
 */

export interface MRIDomain {
  id: string;
  name: string;
  score: number; // 1-10
  weight: number; // 0-1
  observations: string[];
}

export interface HardStop {
  id: string;
  name: string;
  passed: boolean;
  critical: boolean;
}

export interface MRIResult {
  score: number;
  status: 'GO' | 'GO_OBSERVATIONS' | 'NO_GO' | 'ENTERPRISE_READY';
  domains: MRIDomain[];
  hardStops: HardStop[];
  timestamp: string;
}

export const MRI_WEIGHTS: Record<string, number> = {
  architecture: 0.10,
  code_quality: 0.10,
  testing: 0.15,
  security: 0.15,
  performance: 0.10,
  devops: 0.10,
  db: 0.10,
  ux: 0.10,
  observability: 0.05,
  compliance: 0.05,
};

export const MRI_THRESHOLDS = {
  NO_GO: 6.0,
  GO_OBSERVATIONS: 7.5,
  GO: 9.0,
  ENTERPRISE_READY: 10.0,
};

export function calculateMRI(domains: MRIDomain[], hardStops: HardStop[]): MRIResult {
  const anyHardStopFailed = hardStops.some(hs => hs.critical && !hs.passed);

  let totalScore = 0;
  let totalWeight = 0;

  domains.forEach(domain => {
    totalScore += domain.score * domain.weight;
    totalWeight += domain.weight;
  });

  const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0;

  let status: MRIResult['status'] = 'NO_GO';

  if (anyHardStopFailed || finalScore < MRI_THRESHOLDS.NO_GO) {
    status = 'NO_GO';
  } else if (finalScore < MRI_THRESHOLDS.GO_OBSERVATIONS) {
    status = 'GO_OBSERVATIONS';
  } else if (finalScore < MRI_THRESHOLDS.GO) {
    status = 'GO';
  } else {
    status = 'ENTERPRISE_READY';
  }

  return {
    score: Number(finalScore.toFixed(2)),
    status,
    domains,
    hardStops,
    timestamp: new Date().toISOString(),
  };
}

// Default mock data for v5.8.6
export const DEFAULT_MRI_DATA: MRIResult = {
  score: 8.8,
  status: 'GO',
  domains: [
    { id: 'architecture', name: 'Arquitectura', score: 9.0, weight: 0.10, observations: ['Clean Architecture implementada'] },
    { id: 'code_quality', name: 'Calidad de Código', score: 8.5, weight: 0.10, observations: ['Linting estricto'] },
    { id: 'testing', name: 'Testing', score: 8.0, weight: 0.15, observations: ['Unitarias al 70%', 'Faltan E2E completas'] },
    { id: 'security', name: 'Seguridad', score: 9.5, weight: 0.15, observations: ['RLS verificado', 'RBAC sólido'] },
    { id: 'performance', name: 'Rendimiento', score: 8.8, weight: 0.10, observations: ['LCP < 2.5s'] },
    { id: 'devops', name: 'DevOps', score: 9.0, weight: 0.10, observations: ['CI/CD automatizado'] },
    { id: 'db', name: 'Base de Datos', score: 9.2, weight: 0.10, observations: ['Índices optimizados'] },
    { id: 'ux', name: 'UX/UI', score: 8.5, weight: 0.10, observations: ['Responsive verificado'] },
    { id: 'observability', name: 'Observabilidad', score: 8.5, weight: 0.05, observations: ['Dashboard de Salud implementado v2'] },
    { id: 'compliance', name: 'Cumplimiento', score: 9.5, weight: 0.05, observations: ['Modelos SC actualizados'] },
  ],
  hardStops: [
    { id: 'vulnerabilities', name: 'Vulnerabilidades Críticas', passed: true, critical: true },
    { id: 'rollback', name: 'Plan de Rollback', passed: true, critical: true },
    { id: 'coverage', name: 'Cobertura > 60%', passed: true, critical: true },
    { id: 'backup', name: 'Backup Verificado', passed: true, critical: true },
  ],
  timestamp: new Date().toISOString(),
};
