import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, AlertTriangle, Bug, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export function HealthAgentLogs() {
  const [logs, setLogs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchLogs = React.useCallback(async () => {
    try {
      const response = await fetch('/logs/audit_log.json');
      if (response.ok) {
        const json = await response.json();
        // Flatten historical issues and suggestions for the UI
        const allFindings: any[] = [];
        json.slice(0, 5).forEach((entry: any) => {
          (entry.issues_detected || []).forEach((issue: any) => {
            allFindings.push({
              id: issue.id,
              status: issue.severity === 'critical' ? 'critical' : 'warning',
              view_name: issue.component,
              description: issue.summary,
              timestamp: entry.date,
              priority: issue.severity === 'critical' ? 'high' : 'medium'
            });
          });
          (entry.refactor_suggestions || []).forEach((sug: any, idx: number) => {
            allFindings.push({
              id: `SUG-${entry.date}-${idx}`,
              status: 'info',
              view_name: sug.component,
              description: sug.rationale,
              suggestion: sug.suggestion,
              timestamp: entry.date,
              priority: sug.priority
            });
          });
        });
        setLogs(allFindings);
      }
    } catch (error) {
      console.error('Error fetching health logs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  if (loading) {
    return <div className="animate-pulse space-y-4">
      {[1, 2, 3].map(i => <div key={i} className="h-24 bg-card/50 rounded-3xl border border-border/30" />)}
    </div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2">
          <Bug className="w-4 h-4 text-primary" />
          AI System Observer: Historial de Hallazgos
        </h3>
        <button
          onClick={fetchLogs}
          className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
        >
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
        {logs.length === 0 ? (
          <div className="text-center py-12 bg-card/20 rounded-[32px] border border-dashed border-border/50">
            <CheckCircle2 className="w-10 h-10 text-emerald-500/30 mx-auto mb-3" />
            <p className="text-[10px] font-black uppercase tracking-widest opacity-40">No hay registros de salud recientes</p>
          </div>
        ) : (
          logs.map((log) => (
            <Card key={log.id} className={cn(
              "p-5 rounded-[28px] border transition-all hover:scale-[1.01] bg-card/30 relative overflow-hidden group",
              log.status === 'error' || log.status === 'critical' ? "border-rose-500/20" :
              log.status === 'warning' ? "border-amber-500/20" : "border-emerald-500/20"
            )}>
              <div className="flex gap-4">
                <div className={cn(
                  "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0",
                  log.status === 'critical' ? "bg-rose-500/10 text-rose-500" :
                  log.status === 'warning' ? "bg-amber-500/10 text-amber-500" :
                  log.status === 'info' ? "bg-blue-500/10 text-blue-500" : "bg-emerald-500/10 text-emerald-500"
                )}>
                  {log.status === 'critical' ? <AlertCircle className="w-5 h-5" /> :
                   log.status === 'warning' ? <AlertTriangle className="w-5 h-5" /> :
                   log.status === 'info' ? <Target className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                      {log.view_name}
                    </span>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase">
                      {log.timestamp ? format(new Date(log.timestamp), 'HH:mm:ss - dd MMM', { locale: es }) : ''}
                    </span>
                  </div>

                  <div className="text-xs font-bold leading-tight">
                    {log.description}
                  </div>

                  {log.suggestion && (
                    <div className="text-[10px] text-muted-foreground mt-2 bg-background/40 p-2 rounded-lg border border-border/30">
                      <span className="text-primary font-black mr-1">RECOMENDACIÓN:</span> {log.suggestion}
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-3">
                    <Badge variant="outline" className={cn(
                      "text-[8px] font-black uppercase py-0 px-2",
                      log.priority === 'high' ? "border-rose-500/50 text-rose-500" :
                      log.priority === 'medium' ? "border-amber-500/50 text-amber-500" : "border-emerald-500/50 text-emerald-500"
                    )}>
                      Prioridad {log.priority}
                    </Badge>

                    {log.screenshot_url && (
                      <a
                        href={log.screenshot_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[9px] font-black uppercase text-blue-500 hover:underline"
                      >
                        <Camera className="w-3 h-3" />
                        Ver Captura
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
