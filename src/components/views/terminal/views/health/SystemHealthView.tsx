'use client';

import React, { useState } from 'react';
import { useHealthIndex } from '@/components/HealthDashboard/hooks/useHealthIndex';
import { useComponentHealth } from '@/components/HealthDashboard/hooks/useComponentHealth';
import { useLiveScan } from '@/components/HealthDashboard/hooks/useLiveScan';
import { ObservabilityHeader } from '@/components/HealthDashboard/ObservabilityHeader';
import { GlobalMetricsCards } from '@/components/HealthDashboard/GlobalMetricsCards';
import { InfrastructurePanel } from '@/components/HealthDashboard/InfrastructurePanel';
import { SecurityGRCPanel } from '@/components/HealthDashboard/SecurityGRCPanel';
import { ApplicationDataPanel } from '@/components/HealthDashboard/ApplicationDataPanel';
import { IntelligenceMap } from '@/components/HealthDashboard/IntelligenceMap';
import { ArchitecturePipelineTabs } from '@/components/HealthDashboard/ArchitecturePipelineTabs';
import { ViewNavigation } from '@/components/HealthDashboard/ViewNavigation';
import { AuditResults } from '@/components/HealthDashboard/AuditResults';
import { ReleaseGateGovernance } from '@/components/HealthDashboard/ReleaseGateGovernance';
import { AISystemObserver } from '@/components/HealthDashboard/AISystemObserver';
import { IntelligenceConsole } from '@/components/HealthDashboard/IntelligenceConsole';
import { MetricsGuide } from '@/components/HealthDashboard/MetricsGuide';
import { CostProLoader } from '@/components/ui/CostProLoader';
import { ReleaseGatePdfExporter } from '@/lib/release_gate/ReleaseGatePdfExporter';

export default function SystemHealthView() {
  const [scanFrequency, setScanFrequency] = useState('30S');
  const pollingInterval = scanFrequency === '30S' ? 30000 : (scanFrequency === '60S' ? 60000 : 300000);

  const { data, loading, refetch } = useHealthIndex(pollingInterval);
  const { components, loading: componentsLoading } = useComponentHealth();
  const liveTimestamp = useLiveScan();

  if (loading || componentsLoading) {
    return <CostProLoader text="Sincronizando con el cerebro del sistema..." />;
  }

  const shi = data?.shi;
  const mri = data?.mri;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* SECCIÓN 1 — OBSERVABILITY HEADER */}
      <ObservabilityHeader
        score={shi?.score || 0}
        status={shi?.status || 'HEALTHY'}
        version={data?.version || '5.8.0'}
        scanFrequency={scanFrequency}
        setScanFrequency={setScanFrequency}
      />

      {/* SECCIÓN 2 — GLOBAL METRICS CARDS */}
      <GlobalMetricsCards
        archHealth={mri?.architectureHealth || 0}
        vistasAuditadas={data?.vistasAuditadas || 46}
        alertasAuditor={data?.auditAlerts || 0}
        ultimaAuditoria={data?.lastAudit || '2026-03-16'}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* SECCIÓN 3 — INFRAESTRUCTURA */}
        <InfrastructurePanel
          uptime={shi?.metrics?.uptime || 99.99}
          cpu={shi?.metrics?.cpu_usage || 18}
          trends={shi?.trends || []}
        />

        {/* SECCIÓN 4 — SEGURIDAD & GRC */}
        <SecurityGRCPanel
          threats={shi?.metrics?.active_threats || 0}
          failedLogins={shi?.metrics?.failed_logins_1h || 0}
        />
      </div>

      {/* SECCIÓN 5 — APLICACIÓN & DATOS */}
      <ApplicationDataPanel
        throughput={shi?.metrics?.throughput || 15}
        recon={shi?.metrics?.reconciliation_health || 99.8}
      />

      {/* SECCIÓN 6 — MAPA DE INTELIGENCIA DEL SISTEMA */}
      <IntelligenceMap components={components} />

      <ArchitecturePipelineTabs />

      {/* SECCIÓN 7 — NAVEGACIÓN DE VISTAS */}
      <ViewNavigation />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* SECCIÓN 8 — RESULTADOS DE AUDITORÍA */}
        <AuditResults />

        {/* SECCIÓN 9 — RELEASE GATE GOVERNANCE */}
        <ReleaseGateGovernance
          mri={mri?.score || 0}
          status={mri?.status || 'GO'}
          hardStops={mri?.hardStops || []}
        />
      </div>

      {/* SECCIÓN 10 — AI SYSTEM OBSERVER */}
      <AISystemObserver />

      {/* SECCIÓN 11 — CONSOLA DE INTELIGENCIA & ALERTAS */}
      <IntelligenceConsole
        timestamp={liveTimestamp}
        alerts={shi?.alerts || []}
        onSync={refetch}
        onExport={() => ReleaseGatePdfExporter.exportHealthReport(data)}
      />

      {/* SECCIÓN 12 — GUÍA DE INTERPRETACIÓN DE MÉTRICAS */}
      <MetricsGuide />
    </div>
  );
}
