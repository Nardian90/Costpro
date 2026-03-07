'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, RefreshCw, AlertCircle, FileText,
  Settings, Clock, ShieldCheck, ChevronDown, Info,
  LayoutGrid, Share2, History, ShieldAlert, Cpu, Database, Server
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import { HealthStatusHeader } from './HealthStatusHeader';
import { InfrastructureMetrics } from './InfrastructureMetrics';
import { ApplicationMetrics } from './ApplicationMetrics';
import { SecurityMetrics } from './SecurityMetrics';
import { ReleaseGateStatus } from './ReleaseGateStatus';
import { CostProLoader } from '@/components/ui/CostProLoader';
import { ReleaseGatePdfExporter } from '@/lib/release_gate/ReleaseGatePdfExporter';

import { AuditSummary } from './AuditSummary';
import { ViewNavigator } from './ViewNavigator';
import { ArchitectureAuditTable } from './ArchitectureAuditTable';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { HealthAgentLogs } from './HealthAgentLogs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from '@/components/ui/badge';

export default function SystemHealthView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [pollingInterval, setPollingInterval] = useState(30000); // Default 30s
  const [auditSummary, setAuditSummary] = useState<any>(null);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/system-health');
      const json = await res.json();
      setData(json);
      setLastUpdate(new Date());

      // Fetch audit summary
      const auditRes = await fetch('/system_health.json');
      const auditJson = await auditRes.json();
      setAuditSummary(auditJson);
    } catch (error) {
      console.error('Error fetching health:', error);
      toast.error('Error al conectar con el motor de observabilidad');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    if (pollingInterval > 0) {
      const interval = setInterval(fetchHealth, pollingInterval);
      return () => clearInterval(interval);
    }
  }, [pollingInterval]);

  if (loading || !data) {
    return (
      <div className="h-[60vh] w-full flex flex-col items-center justify-center">
        <CostProLoader size={200} text="OBSERVABILIDAD" subtext="Escaneando salud del sistema..." />
      </div>
    );
  }

  const { shi, mri, timestamp, version } = data;

  return (
    <div className="space-y-12 animate-in fade-in duration-700 pb-20">
      {/* Top Banner */}
      <HealthStatusHeader
        score={shi.score}
        status={shi.status}
        version={version}
      />

      {/* Control Bar & Quick Stats */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-xl bg-card border border-border/50 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Frecuencia de Escaneo:</span>
            <DropdownMenu>
              <DropdownMenuTrigger className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1 hover:opacity-80 transition-opacity">
                {pollingInterval === 0 ? 'Manual' : `${pollingInterval/1000}s`}
                <ChevronDown className="w-3 h-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-sidebar/90 backdrop-blur-xl border-primary/10 rounded-xl">
                <DropdownMenuItem onClick={() => setPollingInterval(30000)} className="text-[10px] font-black uppercase tracking-widest">30 Segundos</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPollingInterval(60000)} className="text-[10px] font-black uppercase tracking-widest">60 Segundos</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPollingInterval(300000)} className="text-[10px] font-black uppercase tracking-widest">5 Minutos</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPollingInterval(0)} className="text-[10px] font-black uppercase tracking-widest">Manual</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Engine: Active</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Region: us-east-1</span>
          </div>
        </div>
      </div>

      {/* Audit Agent Summary Section */}
      {auditSummary && (
        <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-1 bg-primary/10 border border-primary/20 rounded-[32px] p-6 flex flex-col items-center justify-center text-center">
             <ShieldAlert className="w-10 h-10 text-primary mb-3" />
             <div className="text-3xl font-black text-primary mb-1">{auditSummary.systemHealth.toFixed(1)}</div>
             <div className="text-[10px] font-black uppercase tracking-widest opacity-60">Global Architecture Health</div>
          </div>

          <div className="md:col-span-3 bg-card/30 border border-border/50 rounded-[32px] p-6 grid grid-cols-3 gap-6">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">Vistas Auditadas</span>
              <div className="text-2xl font-black">{auditSummary.viewsAudited}</div>
              <div className="text-[9px] font-bold text-emerald-500 uppercase mt-1">100% Cobertura</div>
            </div>
            <div className="flex flex-col border-x border-border/30 px-6">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">Alertas de Auditor</span>
              <div className="text-2xl font-black text-amber-500">{auditSummary.warnings}</div>
              <div className="text-[9px] font-bold text-amber-500 uppercase mt-1">Revisiones Sugeridas</div>
            </div>
            <div className="flex flex-col pl-6">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">Última Auditoría</span>
              <div className="text-2xl font-black">{auditSummary.lastAudit}</div>
              <div className="text-[9px] font-bold text-blue-500 uppercase mt-1">Audit Agent Script</div>
            </div>
          </div>
        </section>
      )}

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          <InfrastructureMetrics metrics={shi.metrics} trends={shi.trends} />
          <ApplicationMetrics metrics={shi.metrics} trends={shi.trends} />
        </div>

        <div className="space-y-8">
          <SecurityMetrics metrics={shi.metrics} />
        </div>
      </div>

      {/* Architecture Audit Table - The "Mapa de Vistas" Pro Table */}
