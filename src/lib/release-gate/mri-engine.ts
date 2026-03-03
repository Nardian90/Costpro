export interface DomainScore {
  id: string;
  label: string;
  weight: number;
  score: number;
  criteria: string[];
}

export const MRI_DOMAINS: DomainScore[] = [
  {
    id: 'architecture',
    label: 'Arquitectura & Diseño',
    weight: 0.15,
    score: 0,
    criteria: ['Modularidad', 'Separación de capas', 'Gestión de dependencias', 'Documentación', 'Manejo de errores', 'Escalabilidad']
  },
  {
    id: 'code_quality',
    label: 'Calidad de Código',
    weight: 0.15,
    score: 0,
    criteria: ['Estándares definidos', 'Code review', 'Complejidad ciclomática', 'Código muerto', 'Pruebas', 'Análisis estático']
  },
  {
    id: 'testing',
    label: 'Testing & Cobertura',
    weight: 0.15,
    score: 0,
    criteria: ['Unit testing', 'Integración', 'E2E', 'Regresión', 'Stress testing', 'Evidencia']
  },
  {
    id: 'security',
    label: 'Seguridad',
    weight: 0.15,
    score: 0,
    criteria: ['OWASP Top 10', 'Autenticación', 'RBAC', 'Encriptación', 'Secretos', 'Logs auditables']
  },
  {
    id: 'performance',
    label: 'Rendimiento & Escalabilidad',
    weight: 0.10,
    score: 0,
    criteria: ['SLA definidos', 'Tests de carga', 'Concurrencia', 'Cache', 'Escalado horizontal']
  },
  {
    id: 'devops',
    label: 'DevOps & Deploy',
    weight: 0.10,
    score: 0,
    criteria: ['CI/CD', 'Build reproducible', 'Rollback probado', 'IaC', 'Entornos alineados']
  },
  {
    id: 'database',
    label: 'Base de Datos',
    weight: 0.05,
    score: 0,
    criteria: ['Índices optimizados', 'Migraciones', 'Backups probados', 'Plan DRP']
  },
  {
    id: 'ux_ui',
    label: 'UX/UI & Producto',
    weight: 0.05,
    score: 0,
    criteria: ['Flujos críticos', 'Consistencia visual', 'Accesibilidad', 'Feedback Beta']
  },
  {
    id: 'observability',
    label: 'Observabilidad & Soporte',
    weight: 0.05,
    score: 0,
    criteria: ['Logs centralizados', 'Métricas de negocio', 'Alertas', 'Dashboard operativo']
  },
  {
    id: 'compliance',
    label: 'Cumplimiento Legal',
    weight: 0.05,
    score: 0,
    criteria: ['Privacidad', 'Licencias', 'T&C', 'Regulaciones']
  }
];

export interface HardStop {
  id: string;
  label: string;
  active: boolean;
}

export const HARD_STOPS: HardStop[] = [
  { id: 'security_vuln', label: 'Vulnerabilidad crítica abierta', active: false },
  { id: 'no_rollback', label: 'No existe rollback probado', active: false },
  { id: 'low_coverage', label: 'Cobertura < 60%', active: false },
  { id: 'no_backup', label: 'No hay backup probado', active: false }
];

export type Dictamen = 'NO GO' | 'GO CON OBSERVACIONES' | 'GO' | 'ENTERPRISE READY';

export const calculateMRI = (domainScores: Record<string, number>): number => {
  return MRI_DOMAINS.reduce((acc, domain) => {
    const score = domainScores[domain.id] || 0;
    return acc + (score * domain.weight);
  }, 0);
};

export const getDictamen = (mri: number, hardStops: Record<string, boolean>): Dictamen => {
  const hasHardStop = Object.values(hardStops).some(val => val === true);
  if (hasHardStop || mri < 6) return 'NO GO';
  if (mri < 7.5) return 'GO CON OBSERVACIONES';
  if (mri < 9) return 'GO';
  return 'ENTERPRISE READY';
};

export const getDictamenColor = (dictamen: Dictamen): string => {
  switch (dictamen) {
    case 'NO GO': return 'text-danger bg-danger/10 border-danger/20';
    case 'GO CON OBSERVACIONES': return 'text-warning bg-warning/10 border-warning/20';
    case 'GO': return 'text-primary bg-primary/10 border-primary/20';
    case 'ENTERPRISE READY': return 'text-success bg-success/10 border-success/20';
    default: return 'text-muted-foreground bg-muted/10 border-muted/20';
  }
};
