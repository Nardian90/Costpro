'use client';
import React from 'react';
import { cn } from '@/lib/utils';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

interface SummaryRow {
  metric_type: string;
  service: string;
  total_count: number;
  total_sum: number;
  bucket_count: number;
  first_bucket: string;
  last_bucket: string;
}

// FIX: BufferStatus se importa del parent para evitar tipo duplicado
import type { BufferStatus } from '../UsageMonitoringView';

const METRIC_LABELS: Record<string, { label: string; icon: any; description: string }> = {
  api_request: { label: 'API Requests', icon: Activity, description: 'Requests a rutas /api/*' },
  function_ms: { label: 'Function Time', icon: Clock, description: 'Tiempo de ejecución (ms)' },
  bandwidth_bytes: { label: 'Bandwidth', icon: Cloud, description: 'Bytes transferidos' },
  cron_invocation: { label: 'Cron Runs', icon: Zap, description: 'Ejecuciones de cron jobs' },
  db_query: { label: 'DB Queries', icon: Database, description: 'Queries a Supabase' },
  error: { label: 'Errores 5xx', icon: AlertTriangle, description: 'Respuestas con error server' },
  edge_requests: { label: 'Edge Requests', icon: Zap, description: 'Requests al Edge' },
  db_size_bytes: { label: 'DB Size', icon: HardDrive, description: 'Tamaño de base de datos' },
  db_egress_bytes: { label: 'DB Egress', icon: Cloud, description: 'Egress de Supabase' },
  storage_bytes: { label: 'Storage', icon: HardDrive, description: 'Archivos en Storage' },
  auth_mau: { label: 'Auth MAU', icon: Activity, description: 'Monthly Active Users' },
};

import { Activity, Clock, Cloud, Zap, Database, AlertTriangle, HardDrive } from 'lucide-react';

function RealTimeTab({
  summary,
  buffer,
}: {
  summary: SummaryRow[];
  buffer: BufferStatus | null;
}) {
  // Construir datos para el mini-gráfico de los últimos buckets
  const chartData = summary.map(s => ({
    metric: (METRIC_LABELS[s.metric_type]?.label || s.metric_type).slice(0, 12),
    requests: s.total_count,
    ms: s.total_sum,
  }));

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Estado del buffer */}
      {buffer && (
        <div className="bg-card rounded-2xl border-2 border-border p-5">
          <h3 className="text-base font-black uppercase tracking-widest text-foreground mb-3">
            Buffer en memoria (no enviado a BD aún)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-muted/40 rounded-lg p-3 border border-border">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Buckets</p>
              <p className="text-lg font-black font-mono text-foreground">{buffer.buffered_entries}</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 border border-border">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Eventos</p>
              <p className="text-lg font-black font-mono text-foreground">{buffer.buffered_count}</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 border border-border">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Último flush</p>
              <p className="text-lg font-black font-mono text-foreground">
                {Math.floor(buffer.last_flush_ms_ago / 1000)}s atrás
              </p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 border border-border">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Próximo</p>
              <p className="text-lg font-black font-mono text-success">
                {Math.ceil(buffer.next_flush_in_ms / 1000)}s
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Los contadores se envían a Supabase cada 60 segundos o al acumular 100 eventos, lo que ocurra primero.
            El botón <strong className="text-primary">"Forzar Sync"</strong> arriba envía el buffer inmediatamente.
          </p>
        </div>
      )}

      {/* Resumen últimas 24h */}
      <div className="bg-card rounded-2xl border-2 border-border p-5">
        <h3 className="text-base font-black uppercase tracking-widest text-foreground mb-4">
          Resumen — Últimas 24 horas
        </h3>

        {summary.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Sin datos en las últimas 24h todavía</p>
          </div>
        ) : (
          <>
            {/* Mini-gráfico de barras */}
            {chartData.length > 0 && (
              <div className="mb-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis
                      dataKey="metric"
                      tick={{ fontSize: 12, fontWeight: 600, fill: 'hsl(var(--foreground))' }}
                      stroke="hsl(var(--border))"
                    />
                    <YAxis
                      tick={{ fontSize: 12, fontWeight: 600, fill: 'hsl(var(--foreground))' }}
                      stroke="hsl(var(--border))"
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '2px solid hsl(var(--border))',
                        borderRadius: '12px',
                        fontSize: '13px',
                        color: 'hsl(var(--foreground))',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '13px', fontWeight: 600 }} />
                    <Bar dataKey="requests" fill="#3b82f6" name="Requests" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Tabla detallada */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-border text-left">
                    <th className="py-2 px-2 font-black uppercase tracking-widest text-xs text-muted-foreground">Métrica</th>
                    <th className="py-2 px-2 font-black uppercase tracking-widest text-xs text-muted-foreground">Servicio</th>
                    <th className="py-2 px-2 font-black uppercase tracking-widest text-xs text-muted-foreground text-right">Total</th>
                    <th className="py-2 px-2 font-black uppercase tracking-widest text-xs text-muted-foreground text-right">Buckets</th>
                    <th className="py-2 px-2 font-black uppercase tracking-widest text-xs text-muted-foreground">Último</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row, i) => {
                    const meta = METRIC_LABELS[row.metric_type];
                    return (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 px-2 font-bold text-foreground">{meta?.label || row.metric_type}</td>
                        <td className="py-2 px-2 text-muted-foreground">{row.service}</td>
                        <td className="py-2 px-2 text-right font-mono font-black text-foreground">{row.total_count}</td>
                        <td className="py-2 px-2 text-right font-mono text-muted-foreground">{row.bucket_count}</td>
                        <td className="py-2 px-2 text-xs text-muted-foreground">
                          {row.last_bucket ? new Date(row.last_bucket).toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default RealTimeTab;
