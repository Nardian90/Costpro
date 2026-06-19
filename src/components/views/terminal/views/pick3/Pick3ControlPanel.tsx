import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Globe,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  AlertCircle,
  Link as LinkIcon,
  ShieldCheck
} from "lucide-react";
import { Pick3SyncState, Pick3Source } from '@/types/pick3';
import { cn } from "@/lib/utils";

interface Pick3ControlPanelProps {
  syncState: Pick3SyncState;
  onSync: () => void;
}

export function Pick3ControlPanel({ syncState, onSync }: Pick3ControlPanelProps) {
  const getStatusIcon = (status: Pick3Source['status']) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'error': return <XCircle className="w-4 h-4 text-destructive" />;
      case 'syncing': return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      default: return <AlertCircle className="w-4 h-4 text-muted-foreground opacity-50" />;
    }
  };

  const getStatusColor = (status: Pick3Source['status']) => {
    switch (status) {
      case 'success': return "bg-success/10 text-success border-success/20";
      case 'error': return "bg-destructive/10 text-destructive border-destructive/20";
      case 'syncing': return "bg-primary/10 text-primary border-primary/20";
      default: return "bg-muted text-muted-foreground border-transparent";
    }
  };

  return (
    <Card className="rounded-[32px] border-border bg-card/50 backdrop-blur-sm overflow-hidden mb-6">
      <CardHeader className="pb-2 border-b border-border/50 bg-muted/30">
        <div className="flex justify-between items-center">
          <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" /> Panel de Control de Sincronización
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={onSync}
            disabled={syncState.isSyncing}
            className="h-8 rounded-full text-[10px] font-black uppercase gap-2 hover:bg-primary hover:text-primary-foreground transition-all"
          >
            {syncState.isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Sincronizar Ahora
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {syncState.sources.map((source) => (
            <div
              key={source.id}
              className={cn(
                "relative group flex flex-col p-4 rounded-2xl border transition-all duration-300",
                source.status === 'syncing' ? "border-primary shadow-[0_0_15px_rgba(59,130,246,0.1)]" : "border-border hover:border-primary/50",
                source.status === 'success' && "bg-success/[0.02]"
              )}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  {source.isOfficial ? (
                    <ShieldCheck className="w-4 h-4 text-primary" />
                  ) : (
                    <LinkIcon className="w-3 h-3 text-muted-foreground" />
                  )}
                  <span className="text-[11px] font-black uppercase truncate max-w-[120px]">
                    {source.name}
                  </span>
                </div>
                {getStatusIcon(source.status)}
              </div>

              <div className="mt-1">
                <Badge variant="outline" className={cn("text-[9px] font-bold uppercase", getStatusColor(source.status))}>
                  {source.status === 'syncing' ? 'Sincronizando...' :
                   source.status === 'success' ? 'Completado' :
                   source.status === 'error' ? 'Fallido' : 'Pendiente'}
                </Badge>
              </div>

              {source.lastSync && (
                <p className="text-[9px] font-bold uppercase opacity-40 mt-3 flex items-center gap-1">
                  Última: {new Date(source.lastSync).toLocaleTimeString()}
                </p>
              )}

              {source.error && (
                <div className="mt-2 p-1.5 rounded bg-destructive/5 border border-destructive/10">
                  <p className="text-[8px] font-bold text-destructive uppercase leading-tight line-clamp-2">
                    {source.error}
                  </p>
                </div>
              )}

              {source.id === syncState.activeSourceId && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-ping" />
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between text-[10px] font-bold uppercase opacity-50 px-2">
          <div className="flex items-center gap-4">
            <span>Algoritmo: Rotación Secuencial</span>
            <span>Prioridad: Oficial Primero</span>
          </div>
          {syncState.lastGlobalSync && (
            <span>Global: {new Date(syncState.lastGlobalSync).toLocaleString()}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
